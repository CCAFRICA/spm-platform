/**
 * POST /api/disputes/investigate
 *
 * Triggers the Resolution Agent to investigate a dispute.
 * Reads execution traces and synaptic history for the disputed entity.
 * Returns root cause analysis and recommendation.
 *
 * Body: { tenantId, disputeId, entityId, batchId, periodId, category, description, amountDisputed }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadDensity } from '@/lib/calculation/synaptic-density';
import { createSynapticSurface } from '@/lib/calculation/synaptic-surface';
import { investigate, type DisputeContext } from '@/lib/agents/resolution-agent';
import { persistSignal } from '@/lib/ai/signal-persistence';
import type { ExecutionTrace } from '@/lib/calculation/intent-types';
// OB-81: Agent memory for three-flywheel priors
import { loadPriorsForAgent } from '@/lib/agents/agent-memory';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const context: DisputeContext = {
    disputeId: body.disputeId,
    tenantId: body.tenantId,
    entityId: body.entityId,
    entityExternalId: body.entityExternalId ?? body.entityId,
    periodId: body.periodId,
    batchId: body.batchId,
    category: body.category ?? 'other',
    description: body.description ?? '',
    amountDisputed: body.amountDisputed ?? 0,
  };

  if (!context.tenantId || !context.entityId || !context.batchId) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, entityId, batchId' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  // AP-18 Gate: Check calculation results exist
  const { data: resultCheck } = await supabase
    .from('calculation_results')
    .select('id')
    .eq('batch_id', context.batchId)
    .eq('entity_id', context.entityId)
    .eq('tenant_id', context.tenantId)
    .limit(1);

  if (!resultCheck || resultCheck.length === 0) {
    return NextResponse.json(
      { error: 'No calculation results found for this entity and batch' },
      { status: 404 }
    );
  }

  // Load execution traces
  const { data: result } = await supabase
    .from('calculation_results')
    .select('metadata')
    .eq('batch_id', context.batchId)
    .eq('entity_id', context.entityId)
    .eq('tenant_id', context.tenantId)
    .single();

  const meta = result?.metadata as Record<string, unknown> | null;
  const traces = (meta?.intentTraces as ExecutionTrace[] | undefined) ?? [];

  // OB-81: Load agent memory (three-flywheel priors) + create surface
  let density;
  try {
    const priors = await loadPriorsForAgent(context.tenantId, 'icm', 'resolution');
    density = priors.tenantDensity;
  } catch {
    // Fallback to direct density loading
    try {
      density = await loadDensity(context.tenantId);
    } catch {
      density = new Map() as Awaited<ReturnType<typeof loadDensity>>;
    }
  }
  const surface = createSynapticSurface(density);

  // Run investigation
  const investigation = investigate(context, traces, surface);

  // Store investigation in disputes table (resolution column)
  if (context.disputeId) {
    await supabase
      .from('disputes')
      .update({
        resolution: JSON.stringify({
          rootCause: investigation.rootCause,
          recommendation: investigation.recommendation,
          investigatedAt: investigation.timestamp,
        }),
        status: investigation.recommendation.action === 'reject_with_evidence' ? 'resolved' : 'investigating',
      })
      .eq('id', context.disputeId);
  }

  // Write training signal (fire-and-forget)
  persistSignal({
    tenantId: context.tenantId,
    signalType: 'training:dispute_resolution',
    signalValue: {
      disputeId: context.disputeId,
      entityId: context.entityId,
      rootCauseClassification: investigation.rootCause.classification,
      rootCauseConfidence: investigation.rootCause.confidence,
      recommendedAction: investigation.recommendation.action,
      adjustmentAmount: investigation.recommendation.adjustmentAmount,
      evidenceCount: investigation.rootCause.evidence.length,
    },
    confidence: investigation.rootCause.confidence,
    source: 'ai_prediction',
    context: { trigger: 'dispute_investigation' },
  }).catch(err => console.warn('[DisputeInvestigateAPI] Signal persist failed:', err));

  return NextResponse.json({
    success: true,
    investigation: {
      disputeId: investigation.disputeId,
      entityId: investigation.entityId,
      timestamp: investigation.timestamp,
      rootCause: investigation.rootCause,
      recommendation: investigation.recommendation,
      synapticEvidence: {
        confidenceSynapses: investigation.synapticHistory.confidenceSynapses.length,
        anomalySynapses: investigation.synapticHistory.anomalySynapses.length,
        correctionSynapses: investigation.synapticHistory.correctionSynapses.length,
        dataQualitySynapses: investigation.synapticHistory.dataQualitySynapses.length,
      },
      resolutionSynapseWritten: investigation.resolutionSynapseWritten,
    },
  });
}
