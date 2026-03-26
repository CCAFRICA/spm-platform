/**
 * POST /api/reconciliation/compare
 *
 * OB-87 Mission 3: Enhanced reconciliation comparison endpoint.
 * Accepts mapped file data + VL batch, runs comparison with:
 * - Period filtering
 * - Component-level comparison
 * - False green detection
 * - Priority-ordered findings
 *
 * Body: { tenantId, batchId, fileRows, mappings, entityIdField, totalAmountField,
 *         periodColumns?, targetPeriods?, depthAchieved? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runEnhancedComparison } from '@/lib/reconciliation/comparison-engine';
import { filterRowsByPeriod } from '@/lib/reconciliation/benchmark-intelligence';
import type { ColumnMapping } from '@/lib/reconciliation/ai-column-mapper';
import type { ColumnMappingInfo, PeriodValue } from '@/lib/reconciliation/benchmark-intelligence';
import type { CalculationResult } from '@/types/compensation-plan';
import { persistSignal } from '@/lib/ai/signal-persistence';
import { captureSCISignal } from '@/lib/sci/signal-capture-service';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    tenantId,
    batchId,
    fileRows,
    mappings,
    entityIdField,
    totalAmountField,
    periodColumns,
    targetPeriods,
    depthAchieved,
  } = body as {
    tenantId: string;
    batchId: string;
    fileRows: Record<string, unknown>[];
    mappings: ColumnMapping[];
    entityIdField: string;
    totalAmountField: string;
    periodColumns?: ColumnMappingInfo[];
    targetPeriods?: PeriodValue[];
    depthAchieved?: number;
  };

  if (!tenantId || !batchId || !fileRows?.length || !mappings?.length || !entityIdField || !totalAmountField) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    console.log(`[Reconciliation] Comparing batch ${batchId} (${fileRows.length} file rows) with entityIdField="${entityIdField}", totalAmountField="${totalAmountField}"`);

    const supabase = await createServiceRoleClient();

    // Step 1: Filter rows by period if period columns and target periods provided
    let filteredRows = fileRows;
    let periodFilterInfo = { originalCount: fileRows.length, filteredCount: fileRows.length };

    if (periodColumns && periodColumns.length > 0 && targetPeriods && targetPeriods.length > 0) {
      const result = filterRowsByPeriod(fileRows, periodColumns, targetPeriods);
      filteredRows = result.filteredRows;
      periodFilterInfo = { originalCount: result.originalCount, filteredCount: result.filteredCount };
      console.log(`[Reconciliation] Period filter: ${targetPeriods.map(tp => tp.label).join(', ')} → ${result.filteredCount} rows (of ${result.originalCount})`);
    }

    // Step 2: Load VL calculation results
    const { data: results, error: resErr } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metrics, metadata')
      .eq('batch_id', batchId)
      .eq('tenant_id', tenantId);

    if (resErr || !results || results.length === 0) {
      return NextResponse.json(
        { error: `No calculation results found for batch ${batchId}` },
        { status: 404 }
      );
    }

    // Load entity external IDs (batched ≤200)
    const entityIds = results.map(r => r.entity_id);
    const entityMap = new Map<string, { external_id: string; name: string }>();
    const BATCH_SIZE = 200;
    for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
      const chunk = entityIds.slice(i, i + BATCH_SIZE);
      const { data: entities } = await supabase
        .from('entities')
        .select('id, external_id, display_name')
        .in('id', chunk);
      if (entities) {
        for (const e of entities) {
          entityMap.set(e.id, { external_id: e.external_id ?? e.id, name: e.display_name ?? '' });
        }
      }
    }

    // Transform to CalculationResult format
    // The comparison engine reads: entityId, entityName, totalIncentive, components[].componentId, components[].outputValue
    // We cast to CalculationResult since we only need the fields the engine accesses
    const vlResults = results.map(r => {
      const entity = entityMap.get(r.entity_id);
      const dbComponents = r.components as Array<{ id?: string; componentId?: string; name?: string; payout?: number; outputValue?: number }> | null;

      return {
        entityId: entity?.external_id ?? r.entity_id,
        entityName: entity?.name ?? '',
        totalIncentive: Number(r.total_payout),
        components: (dbComponents ?? []).map(c => ({
          componentId: c.id ?? c.componentId ?? '',
          componentName: c.name ?? '',
          outputValue: c.outputValue ?? c.payout ?? 0,
        })),
      } as unknown as CalculationResult;
    });

    console.log(`[Reconciliation] VL results loaded: ${vlResults.length} entities, total=$${vlResults.reduce((s, r) => s + r.totalIncentive, 0).toFixed(2)}`);

    // HF-178: Enhanced diagnostic for column mismatch
    console.log('[Reconciliation][DIAG] totalAmountField passed to engine:', JSON.stringify(totalAmountField));
    console.log('[Reconciliation][DIAG] filteredRows count:', filteredRows.length);
    if (filteredRows.length > 0) {
      const sampleRow = filteredRows[0];
      const keys = Object.keys(sampleRow);
      console.log(`[Reconciliation][DIAG] filteredRows[0] keys (${keys.length}):`, JSON.stringify(keys));
      console.log(`[Reconciliation][DIAG] filteredRows[0] full:`, JSON.stringify(sampleRow));
    }

    // Step 3: Build period labels for the comparison
    const periodsCompared = targetPeriods?.map(tp => tp.label) ?? [];

    // Step 4: Run enhanced comparison with false green detection
    const comparisonResult = runEnhancedComparison(
      filteredRows,
      vlResults,
      mappings,
      entityIdField,
      totalAmountField,
      periodsCompared,
      depthAchieved ?? 2,
    );

    // OB-189: Log comparison results
    const cs = comparisonResult.summary;
    console.log(`[Reconciliation] Entity matching: ${cs.matched} matched, ${cs.vlOnly} VL-only, ${cs.fileOnly} file-only`);
    console.log(`[Reconciliation] Totals: VL=$${cs.vlTotalAmount.toFixed(2)}, Benchmark=$${cs.fileTotalAmount.toFixed(2)}, Delta=$${cs.totalDelta.toFixed(2)}`);
    const matchRate = cs.totalEmployees > 0 ? ((cs.exactMatches + cs.toleranceMatches) / cs.totalEmployees * 100).toFixed(1) : '0.0';
    console.log(`[Reconciliation] Match rate: ${matchRate}% (${cs.exactMatches} exact, ${cs.toleranceMatches} tolerance, ${cs.amberFlags} amber, ${cs.redFlags} red)`);

    // Step 5: Record reconciliation training signal (fire-and-forget)
    const userOverrides = mappings.filter(m => m.isUserOverride);
    persistSignal({
      tenantId,
      signalType: 'training:reconciliation_comparison',
      signalValue: {
        batchId,
        matchedCount: comparisonResult.summary.matched,
        fileOnlyCount: comparisonResult.summary.fileOnly,
        vlOnlyCount: comparisonResult.summary.vlOnly,
        falseGreenCount: comparisonResult.falseGreenCount,
        exactMatchCount: comparisonResult.summary.exactMatches,
        depthAchieved: comparisonResult.depthAchieved,
        periodsCompared,
        periodFiltered: periodFilterInfo.originalCount !== periodFilterInfo.filteredCount,
        rowsOriginal: periodFilterInfo.originalCount,
        rowsFiltered: periodFilterInfo.filteredCount,
        userOverrideCount: userOverrides.length,
        userOverrideFields: userOverrides.map(m => m.mappedTo),
      },
      confidence: comparisonResult.summary.matched / Math.max(comparisonResult.summary.totalEmployees, 1),
      source: userOverrides.length > 0 ? 'user_corrected' : 'ai_prediction',
      context: { trigger: 'reconciliation_compare' },
    }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(err => console.warn('[ReconciliationCompare] Signal persist failed (non-blocking):', err instanceof Error ? err.message : 'unknown'));

    // OB-135: Capture convergence outcome signal (plan interpretation feedback loop)
    try {
      const { data: batchInfo } = await supabase
        .from('calculation_batches')
        .select('rule_set_id, period_id')
        .eq('id', batchId)
        .single();

      const matchRate = comparisonResult.summary.totalEmployees > 0
        ? (comparisonResult.summary.exactMatches + comparisonResult.summary.toleranceMatches) / comparisonResult.summary.totalEmployees
        : 0;

      captureSCISignal({
        tenantId,
        signal: {
          signalType: 'convergence_outcome',
          planId: batchInfo?.rule_set_id || batchId,
          periodId: batchInfo?.period_id || 'unknown',
          entityCount: comparisonResult.summary.matched,
          matchRate,
          totalDelta: comparisonResult.summary.totalDelta,
          isExactMatch: matchRate === 1 && comparisonResult.summary.totalDelta === 0,
        },
      }).catch(() => {});
    } catch {
      // Signal capture failure must NEVER block reconciliation
    }

    return NextResponse.json({
      success: true,
      result: comparisonResult,
      periodFilter: periodFilterInfo,
    });
  } catch (error) {
    console.error('[ReconciliationCompare] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Comparison failed' },
      { status: 500 }
    );
  }
}
