/**
 * Domain Viability Test — Runtime evaluation of domain registration
 *
 * Evaluates whether a domain's required primitives and configuration
 * are compatible with the foundational vocabulary.
 *
 * ZERO domain language. Korean Test applies.
 */

import type { DomainRegistration } from './domain-registry';

// ──────────────────────────────────────────────
// DVT Result
// ──────────────────────────────────────────────

export type GateResult = 'pass' | 'partial' | 'fail';
export type ViabilityScore = 'natural_fit' | 'strong_fit' | 'requires_extension' | 'incompatible';

export interface DVTResult {
  domainId: string;
  score: ViabilityScore;
  gateResults: {
    ruleExpressibility: GateResult;
    dataShapeCompatibility: GateResult;
    outcomeSemantics: GateResult;
    reconciliationApplicability: GateResult;
    scaleProfile: GateResult;
  };
  missingPrimitives: string[];
  flywheel2Overlap: number;
  flywheel3Neighbors: string[];
}

// ──────────────────────────────────────────────
// Evaluation
// ──────────────────────────────────────────────

export function evaluateDomainViability(
  registration: DomainRegistration,
  availablePrimitives: string[]
): DVTResult {
  // Gate 1: Rule Expressibility — all required primitives available?
  const missingPrimitives = registration.requiredPrimitives.filter(
    p => !availablePrimitives.includes(p)
  );
  const ruleExpressibility: GateResult =
    missingPrimitives.length === 0 ? 'pass' :
    missingPrimitives.length <= 1 ? 'partial' : 'fail';

  // Gate 2: Data Shape Compatibility — does it have terminology mapping?
  const dataShapeCompatibility: GateResult =
    registration.terminology.entity && registration.terminology.entityGroup
      ? 'pass' : 'partial';

  // Gate 3: Outcome Semantics — does it define outcome and verb?
  const outcomeSemantics: GateResult =
    registration.terminology.outcome && registration.terminology.outcomeVerb
      ? 'pass' : 'partial';

  // Gate 4: Reconciliation Applicability — does it define benchmark types?
  const reconciliationApplicability: GateResult =
    registration.benchmarkTypes.length > 0 ? 'pass' :
    registration.disputeCategories.length > 0 ? 'partial' : 'fail';

  // Gate 5: Scale Profile — does it have interpretation context?
  const scaleProfile: GateResult =
    registration.interpretationContext.trim().length > 50 ? 'pass' :
    registration.interpretationContext.trim().length > 0 ? 'partial' : 'fail';

  // Aggregate score
  const gates = [ruleExpressibility, dataShapeCompatibility, outcomeSemantics, reconciliationApplicability, scaleProfile];
  const passCount = gates.filter(g => g === 'pass').length;
  const failCount = gates.filter(g => g === 'fail').length;

  const score: ViabilityScore =
    passCount === 5 ? 'natural_fit' :
    passCount >= 4 ? 'strong_fit' :
    failCount === 0 ? 'requires_extension' : 'incompatible';

  return {
    domainId: registration.domainId,
    score,
    gateResults: {
      ruleExpressibility,
      dataShapeCompatibility,
      outcomeSemantics,
      reconciliationApplicability,
      scaleProfile,
    },
    missingPrimitives,
    flywheel2Overlap: 0, // populated from foundational_patterns at runtime
    flywheel3Neighbors: [], // populated from domain_patterns at runtime
  };
}
