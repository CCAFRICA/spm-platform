/**
 * POST /api/reconciliation/analyze
 *
 * OB-87 Mission 3: Benchmark file analysis endpoint.
 * Accepts parsed file data + batch context, returns BenchmarkAnalysis
 * with period discovery, depth assessment, and AI column mappings.
 *
 * Body: { tenantId, userId, parsedFile, batchId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { analyzeBenchmark, matchPeriods } from '@/lib/reconciliation/benchmark-intelligence';
import type { ParsedFile } from '@/lib/reconciliation/smart-file-parser';
import type { CalculationBatchContext, ColumnMappingInfo, PeriodValue, DepthLevel } from '@/lib/reconciliation/benchmark-intelligence';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, userId, parsedFile, batchId } = body as {
    tenantId: string;
    userId: string;
    parsedFile: ParsedFile;
    batchId: string;
  };

  if (!tenantId || !userId || !parsedFile || !batchId) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, userId, parsedFile, batchId' },
      { status: 400 }
    );
  }

  if (!parsedFile.headers?.length || !parsedFile.rows?.length) {
    return NextResponse.json(
      { error: 'Parsed file must have headers and rows' },
      { status: 400 }
    );
  }

  try {
    console.log(`[Reconciliation] Analyzing file: ${parsedFile.fileName}, ${parsedFile.totalRows} rows, ${parsedFile.headers.length} columns`);

    const supabase = await createServiceRoleClient();

    // Load batch context from calculation_batches + calculation_results
    const { data: batch, error: batchErr } = await supabase
      .from('calculation_batches')
      .select('id, period_id, rule_set_id, entity_count')
      .eq('id', batchId)
      .eq('tenant_id', tenantId)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json(
        { error: `Calculation batch not found: ${batchId}` },
        { status: 404 }
      );
    }

    // Load period info
    const { data: period } = await supabase
      .from('periods')
      .select('id, start_date, end_date, label')
      .eq('id', batch.period_id)
      .single();

    // Load entity external IDs from calculation results (batched ≤200)
    const { data: results } = await supabase
      .from('calculation_results')
      .select('entity_id')
      .eq('batch_id', batchId)
      .eq('tenant_id', tenantId);

    const entityIds = results?.map(r => r.entity_id) ?? [];
    const entityExternalIds: string[] = [];
    const BATCH_SIZE = 200;
    for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
      const chunk = entityIds.slice(i, i + BATCH_SIZE);
      const { data: entities } = await supabase
        .from('entities')
        .select('external_id')
        .in('id', chunk);
      if (entities) {
        entityExternalIds.push(...entities.map(e => e.external_id ?? '').filter(Boolean));
      }
    }

    // Load component names from rule set
    const componentNames: string[] = [];
    if (batch.rule_set_id) {
      const { data: ruleSet } = await supabase
        .from('rule_sets')
        .select('components')
        .eq('id', batch.rule_set_id)
        .single();
      if (ruleSet?.components) {
        // components is a JSONB column containing the plan configuration
        const comps = ruleSet.components as unknown as { type?: string; variants?: Array<{ components?: Array<{ id?: string; name?: string; enabled?: boolean }> }> };
        if (comps.type === 'additive_lookup' && comps.variants) {
          for (const variant of comps.variants) {
            for (const comp of variant.components ?? []) {
              if (comp.enabled && comp.name && !componentNames.includes(comp.name)) {
                componentNames.push(comp.name);
              }
            }
          }
        }
      }
    }

    const batchContext: CalculationBatchContext = {
      entityExternalIds,
      components: componentNames,
      periodId: period?.id ?? batch.period_id,
      periodLabel: period?.label ?? 'Unknown',
      periodStartDate: period?.start_date ?? '',
      periodEndDate: period?.end_date ?? '',
    };

    console.log(`[Reconciliation] Batch context: ${entityExternalIds.length} entities, period="${batchContext.periodLabel}", ${componentNames.length} components`);

    // Run benchmark analysis (AI column mapping + period discovery + depth assessment)
    const analysis = await analyzeBenchmark(parsedFile, batchContext, tenantId, userId);

    // Match benchmark periods against VL periods
    // Load all VL periods for this tenant
    const { data: vlPeriods } = await supabase
      .from('periods')
      .select('id, start_date, end_date, label')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: true });

    const periodMatchResult = matchPeriods(
      analysis.periodDiscovery.distinctPeriods,
      (vlPeriods ?? []).map(p => ({
        id: p.id,
        startDate: p.start_date,
        endDate: p.end_date,
        label: p.label,
      })),
    );

    // OB-189: Structured logging
    console.log(`[Reconciliation] Detected entity ID column: ${analysis.entityIdColumn?.sourceColumn ?? 'NONE'}`);
    console.log(`[Reconciliation] Detected total payout column: ${analysis.totalPayoutColumn?.sourceColumn ?? 'NONE'}`);
    if (analysis.periodColumns?.length) {
      console.log(`[Reconciliation] Detected period columns: ${analysis.periodColumns.map((c: ColumnMappingInfo) => c.sourceColumn).join(', ')}`);
    }
    if (analysis.periodDiscovery?.distinctPeriods?.length) {
      console.log(`[Reconciliation] Period values found: ${analysis.periodDiscovery.distinctPeriods.map((p: PeriodValue) => p.label).join(', ')}`);
    }
    if (analysis.depthAssessment) {
      const depthLevels = analysis.depthAssessment.levels
        .map((lvl: DepthLevel) => `L${lvl.level}=${lvl.available}`)
        .join(' ');
      console.log(`[Reconciliation] Comparison depth: ${depthLevels} (max=${analysis.depthAssessment.maxDepth})`);
    }
    console.log(`[Reconciliation] Period matching: ${periodMatchResult.matched.length} matched, ${periodMatchResult.benchmarkOnly.length} benchmark-only, ${periodMatchResult.vlOnly.length} VL-only`);

    return NextResponse.json({
      success: true,
      analysis,
      periodMatch: periodMatchResult,
      batchContext: {
        entityCount: entityIds.length,
        periodLabel: batchContext.periodLabel,
        componentCount: componentNames.length,
      },
    });
  } catch (error) {
    console.error('[ReconciliationAnalyze] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
