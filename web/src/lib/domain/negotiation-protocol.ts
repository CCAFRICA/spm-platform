/**
 * Negotiation Protocol — Request/Response between Domain Agents and Foundational Agents
 *
 * Defines how Domain Agents request work from Foundational Agents.
 * IAP scoring arbitrates between competing approaches.
 *
 * ZERO domain language. Korean Test applies.
 */

// ──────────────────────────────────────────────
// Negotiation Request/Response
// ──────────────────────────────────────────────

export type NegotiationRequestType =
  | 'ingest_data'
  | 'interpret_rules'
  | 'calculate_outcomes'
  | 'reconcile_results'
  | 'generate_insights'
  | 'investigate_dispute'
  | 'query_memory';

export interface NegotiationRequest {
  requestId: string;
  domainId: string;
  requestType: NegotiationRequestType;
  payload: unknown;
  iapPreference?: IAPWeights;
  urgency: 'immediate' | 'batch' | 'deferred';
}

export interface NegotiationResponse {
  requestId: string;
  status: 'completed' | 'partial' | 'failed' | 'deferred';
  result: unknown;
  confidence: number;
  iapScore: IAPScore;
  trainingSignal?: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// IAP Scoring — Intelligence × Acceleration × Performance
// ──────────────────────────────────────────────

export interface IAPWeights {
  intelligence: number;    // 0-1, default 0.4
  acceleration: number;    // 0-1, default 0.3
  performance: number;     // 0-1, default 0.3
}

export interface IAPScore {
  intelligence: number;    // 0-1: did this produce learning?
  acceleration: number;    // 0-1: did this reduce time to outcome?
  performance: number;     // 0-1: did this improve outcome quality?
  composite: number;       // weighted sum
}

export const DEFAULT_IAP_WEIGHTS: IAPWeights = {
  intelligence: 0.4,
  acceleration: 0.3,
  performance: 0.3,
};

export interface IAPAction {
  producesLearning: boolean;
  automatesStep: boolean;
  confidence: number;
}

export function scoreIAP(
  action: IAPAction,
  weights: IAPWeights = DEFAULT_IAP_WEIGHTS
): IAPScore {
  const intelligence = action.producesLearning ? 1.0 : 0.0;
  const acceleration = action.automatesStep ? 1.0 : 0.0;
  const performance = action.confidence;

  return {
    intelligence,
    acceleration,
    performance,
    composite:
      weights.intelligence * intelligence +
      weights.acceleration * acceleration +
      weights.performance * performance,
  };
}

// ──────────────────────────────────────────────
// IAP Arbitration
// ──────────────────────────────────────────────

export interface ArbitrationOption {
  id: string;
  action: IAPAction;
}

export interface ArbitrationResult {
  winnerId: string;
  score: IAPScore;
  allScores: Array<{ id: string; score: IAPScore }>;
}

export function arbitrate(
  options: ArbitrationOption[],
  weights?: IAPWeights
): ArbitrationResult {
  const scored = options.map(opt => ({
    id: opt.id,
    score: scoreIAP(opt.action, weights),
  }));
  scored.sort((a, b) => b.score.composite - a.score.composite);

  return {
    winnerId: scored[0].id,
    score: scored[0].score,
    allScores: scored,
  };
}
