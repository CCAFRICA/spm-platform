/**
 * Resolution Agent — Foundational Agent
 *
 * Traces contested outcomes through execution traces and synaptic history.
 * Identifies root cause. Recommends resolution with evidence and confidence.
 * Feeds resolution patterns back as training signals.
 *
 * ZERO domain language. Korean Test applies.
 * Communicates exclusively through the Synaptic Surface.
 */

import type { SynapticSurface, Synapse } from '@/lib/calculation/synaptic-types';
import { writeSynapse, readSynapses } from '@/lib/calculation/synaptic-surface';
import type { ExecutionTrace } from '@/lib/calculation/intent-types';

// ──────────────────────────────────────────────
// Input Types
// ──────────────────────────────────────────────

export interface DisputeContext {
  disputeId: string;
  tenantId: string;
  entityId: string;
  entityExternalId: string;
  periodId: string;
  batchId: string;
  category: string;
  description: string;
  amountDisputed: number;
}

// ──────────────────────────────────────────────
// Root Cause Analysis (deterministic, no LLM)
// ──────────────────────────────────────────────

export type RootCauseClassification =
  | 'data_error'
  | 'logic_error'
  | 'interpretation_ambiguity'
  | 'boundary_edge'
  | 'scope_error'
  | 'no_error_found';

export interface TraceEvidence {
  type: 'synapse' | 'trace' | 'data';
  description: string;
  data: Record<string, unknown>;
}

export interface RootCause {
  classification: RootCauseClassification;
  confidence: number;
  evidence: TraceEvidence[];
  affectedComponents: number[];
  suggestedAdjustment: number | null;
}

// ──────────────────────────────────────────────
// Resolution Recommendation
// ──────────────────────────────────────────────

export type ResolutionAction =
  | 'approve_adjustment'
  | 'reject_with_evidence'
  | 'escalate_to_human'
  | 'request_data';

export interface ResolutionRecommendation {
  action: ResolutionAction;
  adjustmentAmount: number | null;
  reasoning: string;
  evidenceSummary: string;
  confidence: number;
  dataSource: string[];
}

// ──────────────────────────────────────────────
// Investigation Output
// ──────────────────────────────────────────────

export interface ResolutionInvestigation {
  disputeId: string;
  entityId: string;
  timestamp: string;
  executionTraces: ExecutionTrace[];
  synapticHistory: {
    confidenceSynapses: Synapse[];
    anomalySynapses: Synapse[];
    correctionSynapses: Synapse[];
    dataQualitySynapses: Synapse[];
  };
  rootCause: RootCause;
  recommendation: ResolutionRecommendation;
  resolutionSynapseWritten: boolean;
}

// ──────────────────────────────────────────────
// Resolution Pattern Detection
// ──────────────────────────────────────────────

export interface ResolutionPattern {
  classification: RootCauseClassification;
  occurrences: number;
  affectedEntities: string[];
  commonComponents: number[];
  recommendation: string;
}

// ──────────────────────────────────────────────
// Root Cause Analyzer (deterministic)
// ──────────────────────────────────────────────

export function analyzeRootCause(
  traces: ExecutionTrace[],
  synapses: {
    confidence: Synapse[];
    anomaly: Synapse[];
    correction: Synapse[];
    dataQuality: Synapse[];
  },
  context: DisputeContext // eslint-disable-line @typescript-eslint/no-unused-vars
): RootCause {
  // Check 1: Data quality synapses → data_error
  if (synapses.dataQuality.length > 0) {
    return {
      classification: 'data_error',
      confidence: 0.8,
      evidence: synapses.dataQuality.map(s => ({
        type: 'synapse' as const,
        description: `Data quality issue: ${s.detail ?? 'missing or invalid input'}`,
        data: { type: s.type, value: s.value, componentIndex: s.componentIndex, entityId: s.entityId },
      })),
      affectedComponents: Array.from(new Set(synapses.dataQuality.map(s => s.componentIndex))),
      suggestedAdjustment: null,
    };
  }

  // Check 2: Correction synapses from reconciliation → known data_error
  if (synapses.correction.length > 0) {
    // Parse correction details for delta information
    let totalDelta = 0;
    for (const s of synapses.correction) {
      // Detail format: "classification:delta=X.XX"
      const deltaMatch = s.detail?.match(/delta=([\d.]+)/);
      if (deltaMatch) {
        totalDelta += parseFloat(deltaMatch[1]);
      }
    }

    return {
      classification: 'data_error',
      confidence: 0.85,
      evidence: synapses.correction.map(s => ({
        type: 'synapse' as const,
        description: `Reconciliation correction: ${s.detail ?? 'discrepancy found'}`,
        data: { type: s.type, value: s.value, componentIndex: s.componentIndex },
      })),
      affectedComponents: Array.from(new Set(synapses.correction.map(s => s.componentIndex))),
      suggestedAdjustment: totalDelta > 0 ? -totalDelta : null,
    };
  }

  // Check 3: Anomaly synapses → check boundary or logic issues
  if (synapses.anomaly.length > 0) {
    const boundaryAnomalies = synapses.anomaly.filter(s =>
      s.detail?.includes('boundary') || s.type === 'anomaly'
    );

    if (boundaryAnomalies.length > 0) {
      // Check traces for boundary edge cases
      const boundaryTraces = traces.filter(t =>
        t.lookupResolution?.rowBoundaryMatched || t.lookupResolution?.columnBoundaryMatched
      );

      if (boundaryTraces.length > 0) {
        return {
          classification: 'boundary_edge',
          confidence: 0.75,
          evidence: [
            ...boundaryAnomalies.map(s => ({
              type: 'synapse' as const,
              description: `Boundary anomaly: ${s.detail ?? 'boundary behavior detected'}`,
              data: { value: s.value, componentIndex: s.componentIndex },
            })),
            ...boundaryTraces.map(t => ({
              type: 'trace' as const,
              description: `Boundary match at component ${t.componentIndex}`,
              data: {
                componentIndex: t.componentIndex,
                lookupResolution: t.lookupResolution,
                finalOutcome: t.finalOutcome,
              },
            })),
          ],
          affectedComponents: Array.from(new Set(boundaryTraces.map(t => t.componentIndex))),
          suggestedAdjustment: null,
        };
      }
    }

    // Generic anomaly → logic_error
    return {
      classification: 'logic_error',
      confidence: 0.6,
      evidence: synapses.anomaly.map(s => ({
        type: 'synapse' as const,
        description: `Anomaly detected: ${s.detail ?? 'unexpected result pattern'}`,
        data: { value: s.value, componentIndex: s.componentIndex },
      })),
      affectedComponents: Array.from(new Set(synapses.anomaly.map(s => s.componentIndex))),
      suggestedAdjustment: null,
    };
  }

  // Check 4: Low confidence → interpretation_ambiguity
  const lowConfidence = synapses.confidence.filter(s => s.value < 0.7);
  if (lowConfidence.length > 0) {
    return {
      classification: 'interpretation_ambiguity',
      confidence: 0.6,
      evidence: lowConfidence.map(s => ({
        type: 'synapse' as const,
        description: `Low confidence (${s.value.toFixed(2)}) at component ${s.componentIndex}`,
        data: { value: s.value, componentIndex: s.componentIndex },
      })),
      affectedComponents: Array.from(new Set(lowConfidence.map(s => s.componentIndex))),
      suggestedAdjustment: null,
    };
  }

  // Check 5: No synaptic evidence but traces exist → examine trace
  if (traces.length > 0) {
    return {
      classification: 'no_error_found',
      confidence: 0.5,
      evidence: traces.map(t => ({
        type: 'trace' as const,
        description: `Component ${t.componentIndex}: outcome=${t.finalOutcome}, confidence=${t.confidence}`,
        data: {
          componentIndex: t.componentIndex,
          finalOutcome: t.finalOutcome,
          inputs: t.inputs,
          confidence: t.confidence,
        },
      })),
      affectedComponents: traces.map(t => t.componentIndex),
      suggestedAdjustment: null,
    };
  }

  // No evidence at all
  return {
    classification: 'no_error_found',
    confidence: 0.3,
    evidence: [{ type: 'data', description: 'No execution traces or synaptic evidence available', data: {} }],
    affectedComponents: [],
    suggestedAdjustment: null,
  };
}

// ──────────────────────────────────────────────
// Recommendation Generator (deterministic)
// ──────────────────────────────────────────────

export function generateRecommendation(
  rootCause: RootCause,
  context: DisputeContext // eslint-disable-line @typescript-eslint/no-unused-vars
): ResolutionRecommendation {
  switch (rootCause.classification) {
    case 'data_error':
      if (rootCause.suggestedAdjustment !== null) {
        return {
          action: 'approve_adjustment',
          adjustmentAmount: rootCause.suggestedAdjustment,
          reasoning: `Data error confirmed via ${rootCause.evidence.length} evidence points. Adjustment calculated from reconciliation corrections.`,
          evidenceSummary: rootCause.evidence.map(e => e.description).join('; '),
          confidence: rootCause.confidence,
          dataSource: ['reconciliation_corrections', 'execution_traces'],
        };
      }
      return {
        action: 'request_data',
        adjustmentAmount: null,
        reasoning: 'Data error detected but adjustment amount cannot be determined from available evidence.',
        evidenceSummary: rootCause.evidence.map(e => e.description).join('; '),
        confidence: rootCause.confidence,
        dataSource: ['data_quality_synapses'],
      };

    case 'boundary_edge':
      return {
        action: 'escalate_to_human',
        adjustmentAmount: null,
        reasoning: `Entity outcome falls on a boundary edge (${rootCause.affectedComponents.length} component(s)). Boundary interpretation may differ between systems.`,
        evidenceSummary: rootCause.evidence.map(e => e.description).join('; '),
        confidence: rootCause.confidence,
        dataSource: ['boundary_anomaly_synapses', 'execution_traces'],
      };

    case 'logic_error':
      return {
        action: 'escalate_to_human',
        adjustmentAmount: null,
        reasoning: `Anomaly detected in ${rootCause.affectedComponents.length} component(s) suggesting rule interpretation difference.`,
        evidenceSummary: rootCause.evidence.map(e => e.description).join('; '),
        confidence: rootCause.confidence,
        dataSource: ['anomaly_synapses', 'execution_traces'],
      };

    case 'interpretation_ambiguity':
      return {
        action: 'escalate_to_human',
        adjustmentAmount: null,
        reasoning: `Low execution confidence (${rootCause.evidence.length} low-confidence signals) suggests rule interpretation uncertainty.`,
        evidenceSummary: rootCause.evidence.map(e => e.description).join('; '),
        confidence: rootCause.confidence,
        dataSource: ['confidence_synapses'],
      };

    case 'scope_error':
      return {
        action: 'request_data',
        adjustmentAmount: null,
        reasoning: 'Entity scope mismatch detected — entity may be assigned to wrong population.',
        evidenceSummary: rootCause.evidence.map(e => e.description).join('; '),
        confidence: rootCause.confidence,
        dataSource: ['scope_analysis'],
      };

    case 'no_error_found':
      return {
        action: 'reject_with_evidence',
        adjustmentAmount: null,
        reasoning: 'No computational error found in execution traces or synaptic history. Outcome is consistent with inputs and rules.',
        evidenceSummary: rootCause.evidence.map(e => e.description).join('; '),
        confidence: rootCause.confidence,
        dataSource: rootCause.evidence.length > 0 ? ['execution_traces'] : ['no_evidence_available'],
      };
  }
}

// ──────────────────────────────────────────────
// Investigation Entry Point
// ──────────────────────────────────────────────

export function investigate(
  context: DisputeContext,
  traces: ExecutionTrace[],
  surface: SynapticSurface
): ResolutionInvestigation {
  // Gather all synapses for this entity
  const confidenceSynapses = readSynapses(surface, 'confidence', 'entity', context.entityId);
  const anomalySynapses = readSynapses(surface, 'anomaly', 'entity', context.entityId);
  const correctionSynapses = readSynapses(surface, 'correction', 'entity', context.entityId);
  const dataQualitySynapses = readSynapses(surface, 'data_quality', 'entity', context.entityId);

  const synapticHistory = {
    confidence: confidenceSynapses,
    anomaly: anomalySynapses,
    correction: correctionSynapses,
    dataQuality: dataQualitySynapses,
  };

  // Deterministic root cause analysis
  const rootCause = analyzeRootCause(traces, synapticHistory, context);

  // Generate recommendation
  const recommendation = generateRecommendation(rootCause, context);

  // Write resolution synapse to surface
  let resolutionSynapseWritten = false;
  if (rootCause.classification !== 'no_error_found') {
    writeSynapse(surface, {
      type: 'resolution_hint',
      componentIndex: rootCause.affectedComponents[0] ?? 0,
      entityId: context.entityId,
      value: rootCause.confidence,
      detail: `${rootCause.classification}:${recommendation.action}`,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    });
    resolutionSynapseWritten = true;
  }

  return {
    disputeId: context.disputeId,
    entityId: context.entityId,
    timestamp: new Date().toISOString(),
    executionTraces: traces,
    synapticHistory: {
      confidenceSynapses,
      anomalySynapses,
      correctionSynapses,
      dataQualitySynapses,
    },
    rootCause,
    recommendation,
    resolutionSynapseWritten,
  };
}

// ──────────────────────────────────────────────
// Resolution Pattern Detection
// ──────────────────────────────────────────────

export function detectResolutionPatterns(
  investigations: ResolutionInvestigation[]
): ResolutionPattern[] {
  const patterns: ResolutionPattern[] = [];

  // Group by root cause classification
  const byClassification = new Map<RootCauseClassification, ResolutionInvestigation[]>();
  for (const inv of investigations) {
    const cls = inv.rootCause.classification;
    if (!byClassification.has(cls)) byClassification.set(cls, []);
    byClassification.get(cls)!.push(inv);
  }

  // Patterns: 3+ investigations with same classification
  for (const [cls, invs] of Array.from(byClassification.entries())) {
    if (invs.length >= 3) {
      const allComponents = invs.flatMap(i => i.rootCause.affectedComponents);
      const componentCounts = new Map<number, number>();
      for (const c of allComponents) {
        componentCounts.set(c, (componentCounts.get(c) ?? 0) + 1);
      }

      // Most common affected components
      const commonComponents = Array.from(componentCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c);

      patterns.push({
        classification: cls,
        occurrences: invs.length,
        affectedEntities: invs.map(i => i.entityId),
        commonComponents,
        recommendation: getPatternRecommendation(cls, invs.length),
      });
    }
  }

  return patterns;
}

function getPatternRecommendation(cls: RootCauseClassification, count: number): string {
  switch (cls) {
    case 'data_error':
      return `${count} entities have data errors — investigate data source quality`;
    case 'boundary_edge':
      return `${count} entities fall on boundary edges — consider adjusting boundary behavior`;
    case 'logic_error':
      return `${count} entities have logic discrepancies — review rule interpretation`;
    case 'interpretation_ambiguity':
      return `${count} entities have ambiguous interpretations — clarify rule definitions`;
    case 'scope_error':
      return `${count} entities have scope issues — review population assignments`;
    case 'no_error_found':
      return `${count} contested outcomes found no error — review expectations`;
  }
}
