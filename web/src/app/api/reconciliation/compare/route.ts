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
    const supabase = await createServiceRoleClient();

    // Step 1: Filter rows by period if period columns and target periods provided
    let filteredRows = fileRows;
    let periodFilterInfo = { originalCount: fileRows.length, filteredCount: fileRows.length };

    if (periodColumns && periodColumns.length > 0 && targetPeriods && targetPeriods.length > 0) {
      const result = filterRowsByPeriod(fileRows, periodColumns, targetPeriods);
      filteredRows = result.filteredRows;
      periodFilterInfo = { originalCount: result.originalCount, filteredCount: result.filteredCount };
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
    }).catch(err => console.warn('[ReconciliationCompare] Signal persist failed:', err));

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
