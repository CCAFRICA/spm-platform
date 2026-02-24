/**
 * POST /api/reconciliation/run
 *
 * Triggers the Reconciliation Agent to compare calculation results
 * against benchmark data. Reads execution traces and synaptic state.
 * Writes correction synapses and training signals.
 *
 * Body: { tenantId, batchId, benchmarkRecords }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadDensity } from '@/lib/calculation/synaptic-density';
import { createSynapticSurface } from '@/lib/calculation/synaptic-surface';
import { reconcile, type BenchmarkRecord, type CalculatedResult } from '@/lib/agents/reconciliation-agent';
import { persistSignal } from '@/lib/ai/signal-persistence';
import type { ExecutionTrace } from '@/lib/calculation/intent-types';
import type { Json } from '@/lib/supabase/database.types';
// OB-81: Agent memory for three-flywheel priors
import { loadPriorsForAgent } from '@/lib/agents/agent-memory';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, batchId, benchmarkRecords } = body as {
    tenantId: string;
    batchId: string;
    benchmarkRecords: BenchmarkRecord[];
  };

  if (!tenantId || !batchId || !benchmarkRecords?.length) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, batchId, benchmarkRecords' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  // Load calculation results for this batch
  const { data: results, error: resErr } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, metadata')
    .eq('batch_id', batchId)
    .eq('tenant_id', tenantId);

  if (resErr || !results || results.length === 0) {
    return NextResponse.json(
      { error: `No calculation results found for batch ${batchId}` },
      { status: 404 }
    );
  }

  // Load entity external IDs
  const entityIds = results.map(r => r.entity_id);
  const entityBatches: Array<{ id: string; external_id: string | null }> = [];
  const BATCH_SIZE = 200; // Standing rule: Supabase URL limit ≤200 UUIDs
  for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
    const batch = entityIds.slice(i, i + BATCH_SIZE);
    const { data: entities } = await supabase
      .from('entities')
      .select('id, external_id')
      .in('id', batch);
    if (entities) entityBatches.push(...entities);
  }
  const entityExternalMap = new Map(entityBatches.map(e => [e.id, e.external_id ?? e.id]));

  // Build calculated results and execution traces
  const calculatedResults: CalculatedResult[] = [];
  const executionTraces = new Map<string, ExecutionTrace[]>();

  for (const r of results) {
    const extId = entityExternalMap.get(r.entity_id) ?? r.entity_id;

    // Extract per-component results
    const components = r.components as Array<{ componentId?: string; payout?: number }> | null;
    if (components && Array.isArray(components)) {
      for (let ci = 0; ci < components.length; ci++) {
        calculatedResults.push({
          entityId: r.entity_id,
          entityExternalId: extId,
          componentIndex: ci,
          calculatedOutcome: components[ci]?.payout ?? 0,
        });
      }
    }

    // Extract execution traces from metadata
    const meta = r.metadata as Record<string, unknown> | null;
    const traces = meta?.intentTraces as ExecutionTrace[] | undefined;
    if (traces && Array.isArray(traces)) {
      executionTraces.set(r.entity_id, traces);
    }
  }

  // OB-81: Load agent memory (three-flywheel priors) + create surface
  let density;
  try {
    const priors = await loadPriorsForAgent(tenantId, 'icm', 'reconciliation');
    density = priors.tenantDensity;
  } catch {
    // Fallback to direct density loading
    try {
      density = await loadDensity(tenantId);
    } catch {
      density = new Map() as Awaited<ReturnType<typeof loadDensity>>;
    }
  }
  const surface = createSynapticSurface(density);

  // Run reconciliation
  const report = reconcile({
    tenantId,
    batchId,
    benchmarkRecords,
    calculatedResults,
    executionTraces,
    surface,
  });

  // Store report in calculation_batches.config
  await supabase
    .from('calculation_batches')
    .update({
      config: { reconciliation: report } as unknown as Json,
    })
    .eq('id', batchId);

  // Write training signal (fire-and-forget)
  persistSignal({
    tenantId,
    signalType: 'training:reconciliation_outcome',
    signalValue: {
      batchId,
      matchCount: report.classifications.match,
      roundingCount: report.classifications.rounding,
      discrepancyCount: report.entityCount.unmatched,
      falseGreenDetected: report.falseGreenDetected,
      correctionSynapses: report.correctionSynapsesWritten,
    },
    confidence: report.entityCount.matched / Math.max(report.entityCount.calculated, 1),
    source: 'ai_prediction',
    context: { trigger: 'reconciliation_run' },
  }).catch(err => console.warn('[ReconciliationAPI] Signal persist failed:', err));

  return NextResponse.json({
    success: true,
    report,
  });
}
