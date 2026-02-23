/**
 * Domain Dispatcher — routes work through the Domain Agent layer
 *
 * Wraps calculation dispatch through the registered Domain Agent.
 * Creates NegotiationRequest at entry, scores with IAP at exit.
 * The foundational pipeline itself is UNCHANGED — this is an additive wrapper.
 *
 * ZERO domain language. Korean Test applies.
 * Domain words come from the DomainRegistration at runtime, not from this file.
 */

import { getDomain, type DomainRegistration } from './domain-registry';
import {
  scoreIAP,
  type NegotiationRequest,
  type NegotiationResponse,
  type IAPWeights,
  type IAPScore,
} from './negotiation-protocol';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface DispatchContext {
  tenantId: string;
  domainId: string;
  verticalHint?: string;
  iapWeights?: IAPWeights;
}

export interface CalculationDispatchResult {
  /** The actual calculation results (unchanged from current pipeline) */
  results: unknown;

  /** Negotiation metadata added by the Domain Agent layer */
  negotiation: {
    requestId: string;
    domainId: string;
    domainVersion: string;
    iapScore: IAPScore;
    terminology: Record<string, string>;
  };
}

// ──────────────────────────────────────────────
// Dispatch Entry — Create NegotiationRequest
// ──────────────────────────────────────────────

export function createCalculationRequest(
  context: DispatchContext,
  batchId: string,
  periodId: string
): NegotiationRequest {
  const domain = getDomain(context.domainId);

  if (!domain) {
    // Fallback: no domain agent registered, proceed without negotiation metadata
    return {
      requestId: batchId,
      domainId: context.domainId,
      requestType: 'calculate_outcomes',
      payload: { batchId, periodId, tenantId: context.tenantId },
      urgency: 'immediate',
    };
  }

  return {
    requestId: batchId,
    domainId: domain.domainId,
    requestType: 'calculate_outcomes',
    payload: {
      batchId,
      periodId,
      tenantId: context.tenantId,
      interpretationContext: domain.interpretationContext,
      requiredPrimitives: domain.requiredPrimitives,
      verticalHints: domain.verticalHints,
    },
    iapPreference: context.iapWeights,
    urgency: 'immediate',
  };
}

// ──────────────────────────────────────────────
// Dispatch Exit — Score result through IAP
// ──────────────────────────────────────────────

export function scoreCalculationResult(
  context: DispatchContext,
  requestId: string,
  results: unknown,
  confidence: number,
  producedLearning: boolean
): CalculationDispatchResult {
  const domain = getDomain(context.domainId);

  const iapScore = scoreIAP(
    {
      producesLearning: producedLearning,
      automatesStep: true, // calculation is always automated
      confidence,
    },
    context.iapWeights
  );

  return {
    results,
    negotiation: {
      requestId,
      domainId: context.domainId,
      domainVersion: domain?.version || 'unknown',
      iapScore,
      terminology: domain ? buildTerminologyMap(domain) : {},
    },
  };
}

// ──────────────────────────────────────────────
// Build a NegotiationResponse for audit / signal capture
// ──────────────────────────────────────────────

export function buildNegotiationResponse(
  requestId: string,
  confidence: number,
  iapScore: IAPScore,
  trainingSignal?: Record<string, unknown>
): NegotiationResponse {
  return {
    requestId,
    status: 'completed',
    result: null, // actual results are in CalculationDispatchResult.results
    confidence,
    iapScore,
    trainingSignal,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function buildTerminologyMap(domain: DomainRegistration): Record<string, string> {
  return {
    entity: domain.terminology.entity,
    entityGroup: domain.terminology.entityGroup,
    outcome: domain.terminology.outcome,
    outcomeVerb: domain.terminology.outcomeVerb,
    ruleset: domain.terminology.ruleset,
    period: domain.terminology.period,
    performance: domain.terminology.performance,
    target: domain.terminology.target,
  };
}
