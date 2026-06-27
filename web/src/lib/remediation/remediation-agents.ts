// OB-249 — the remediation agent registry.
//
// I8 / SR-2: a plain LIST of agent modules, not a closed allowed-value set (the no-registry
// standing rule governs validation vocabularies, not plugin lists). The stage iterates this
// array; adding agent 2..N is one push here + one module. This slice ships exactly ONE agent.

import type { RemediationAgent } from './remediation-types';
import { createNormalizer } from './agents/normalizer';

/** The live fleet. Order is apply-order in construct (later agents see earlier agents' output). */
export const REMEDIATION_AGENTS: ReadonlyArray<RemediationAgent> = [
  createNormalizer(), // agent 1 of N — the Normalizer
];
