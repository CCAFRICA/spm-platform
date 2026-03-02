// SCI Signal Types — Classification Signal definitions for SCI events
// Decision 30 — "Classification Signal" not "Training Signal"
// Zero domain vocabulary. Korean Test applies.

// ============================================================
// SIGNAL TYPE ENUM
// ============================================================

export type SCISignalType =
  | 'content_classification'         // Agent scored a content unit
  | 'content_classification_outcome' // User confirmed or overrode agent classification
  | 'field_binding'                  // Agent assigned semantic roles to fields (grouped)
  | 'field_binding_outcome'          // User changed a field binding
  | 'negotiation_round'             // Round 2 score adjustment
  | 'convergence_outcome'           // Reconciliation match rate as interpretation proxy
  | 'cost_event'                    // AI API call made during import
  ;

// ============================================================
// SIGNAL PAYLOAD STRUCTURES
// ============================================================

export interface ContentClassificationSignal {
  signalType: 'content_classification';
  contentUnitId: string;
  sourceFile: string;
  tabName: string;
  agentScores: Array<{
    agent: string;
    confidence: number;
    topSignals: string[];
  }>;
  winningAgent: string;
  winningConfidence: number;
  claimType: string;
  requiresHumanReview: boolean;
  round: number;
}

export interface ContentClassificationOutcomeSignal {
  signalType: 'content_classification_outcome';
  contentUnitId: string;
  predictedClassification: string;
  confirmedClassification: string;
  wasOverridden: boolean;
  predictionConfidence: number;
}

export interface FieldBindingSignal {
  signalType: 'field_binding';
  contentUnitId: string;
  fieldCount: number;
  bindingSummary: Array<{
    sourceField: string;
    semanticRole: string;
    confidence: number;
    claimedBy: string;
  }>;
  avgConfidence: number;
}

export interface FieldBindingOutcomeSignal {
  signalType: 'field_binding_outcome';
  contentUnitId: string;
  sourceField: string;
  predictedSemanticRole: string;
  confirmedSemanticRole: string;
  wasOverridden: boolean;
  predictionConfidence: number;
}

export interface NegotiationRoundSignal {
  signalType: 'negotiation_round';
  contentUnitId: string;
  round1TopAgent: string;
  round1TopConfidence: number;
  round2TopAgent: string;
  round2TopConfidence: number;
  absenceBoostApplied: boolean;
  splitDecision: boolean;
}

export interface ConvergenceOutcomeSignal {
  signalType: 'convergence_outcome';
  planId: string;
  periodId: string;
  entityCount: number;
  matchRate: number;
  totalDelta: number;
  isExactMatch: boolean;
}

export interface CostEventSignal {
  signalType: 'cost_event';
  eventType: 'ai_api_call';
  provider: string;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
}

// ============================================================
// UNION TYPE
// ============================================================

export type SCISignal =
  | ContentClassificationSignal
  | ContentClassificationOutcomeSignal
  | FieldBindingSignal
  | FieldBindingOutcomeSignal
  | NegotiationRoundSignal
  | ConvergenceOutcomeSignal
  | CostEventSignal;

// ============================================================
// SIGNAL CAPTURE REQUEST
// ============================================================

export interface SCISignalCapture {
  tenantId: string;
  signal: SCISignal;
  entityId?: string;
}
