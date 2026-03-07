// Seed Prior Configuration — CRR Cold Start
// Decision 110 — OB-161
// These are the initial reliability values for each signal source type
// when no empirical data exists (cold start / new tenant).
// The flywheel (CRL) overrides these as evidence accumulates.

import type { AgentType } from './sci-types';

// ============================================================
// SIGNAL SOURCE TYPES
// Each signal in the classification pipeline has a source type.
// CRL looks up reliability per source type + structural context.
// ============================================================

export type SignalSourceType =
  | 'hc_contextual'          // Header Comprehension LLM interpretation
  | 'structural_signature'   // Composite structural signatures (signatures.ts)
  | 'structural_heuristic'   // Additive weight rules (agents.ts)
  | 'promoted_pattern'       // Promoted patterns from foundational signals
  | 'prior_signal'           // Flywheel prior from classification_signals
  | 'r2_negotiation'         // Round 2 inter-agent negotiation
  ;

// ============================================================
// SEED PRIOR TABLE
// Reliability: probability that this source type produces the correct
// classification, absent any empirical evidence.
// Authority hierarchy: HC > signatures > priors > tenant > heuristic > R2
// ============================================================

export interface SeedPrior {
  sourceType: SignalSourceType;
  reliability: number;        // 0-1: P(correct | source produced this signal)
  description: string;
}

const SEED_PRIOR_TABLE: SeedPrior[] = [
  {
    sourceType: 'hc_contextual',
    reliability: 0.85,
    description: 'LLM understands column semantics in context — highest cold-start authority',
  },
  {
    sourceType: 'structural_signature',
    reliability: 0.80,
    description: 'Composite signatures require multiple structural conditions — high specificity',
  },
  {
    sourceType: 'prior_signal',
    reliability: 0.75,
    description: 'Flywheel data from prior imports — empirical but may be stale',
  },
  {
    sourceType: 'promoted_pattern',
    reliability: 0.75,
    description: 'Cross-tenant foundational patterns promoted by evidence density',
  },
  {
    sourceType: 'structural_heuristic',
    reliability: 0.60,
    description: 'Additive weight rules on structural properties — baseline authority',
  },
  {
    sourceType: 'r2_negotiation',
    reliability: 0.55,
    description: 'Inter-agent negotiation adjustments — derived signals, lowest authority',
  },
];

// Fast lookup map
const SEED_PRIOR_MAP = new Map<SignalSourceType, number>(
  SEED_PRIOR_TABLE.map(sp => [sp.sourceType, sp.reliability])
);

/**
 * Get the seed prior reliability for a signal source type.
 * Returns the cold-start reliability when no empirical data exists.
 */
export function getSeedPrior(sourceType: SignalSourceType): number {
  return SEED_PRIOR_MAP.get(sourceType) ?? 0.50;
}

/**
 * Get all seed priors (for diagnostics and completion reports).
 */
export function getAllSeedPriors(): SeedPrior[] {
  return [...SEED_PRIOR_TABLE];
}

// ============================================================
// CLASSIFICATION PRIOR — Base rate for each classification
// Uniform prior: no classification is favored a priori.
// This is the P(C) term in Bayes' theorem.
// ============================================================

const CLASSIFICATION_TYPES: AgentType[] = ['plan', 'entity', 'target', 'transaction', 'reference'];

/**
 * Get the prior probability for a classification type.
 * Uniform: 1/5 = 0.20 for each type.
 * No classification is privileged at cold start.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getClassificationPrior(_classification: AgentType): number {
  return 1.0 / CLASSIFICATION_TYPES.length;
}

export { CLASSIFICATION_TYPES };
