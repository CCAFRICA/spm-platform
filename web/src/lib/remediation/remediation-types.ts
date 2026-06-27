// OB-249 — Remediation Stage: the agent-agnostic framework contract.
//
// The remediation stage is PRISM's manufacture-of-congruence organ: it sits behind the
// membrane and before committed_data (I7), turning recognized-but-incongruent data into
// congruent data before promotion. It runs a fleet of AGENTS, each of which executes the
// same Decision-158 contract — propose (express, may use the LLM) → construct (deterministic,
// no LLM) — with the stage handling audit (signals + provenance) uniformly.
//
// I8 / SR-2 (Scale by Design): the framework is AGENT-OPAQUE. The stage depends ONLY on the
// methods below; it NEVER inspects an agent's proposal internals. Each agent owns its own
// proposal shape (the generic `P`) and its own serialization to/from the canonical signal
// surface. Adding agent 2..N is: implement RemediationAgent + push it onto the registry array
// in remediation-agents.ts. No stage re-architecture. (The registry is a list of code modules,
// NOT a closed allowed-value set — the no-registry standing rule governs validation vocabularies,
// not plugin lists.)
//
// Only ONE agent is built this slice: the Normalizer. Building agents 2..N here is scope
// mutation (§2) and prohibited.

import type { Json } from '@/lib/supabase/database.types';

/** The data the stage hands every agent. `allowedColumns` is the complement of the stage's
 *  hard exclusion set (identifier / reference-key / temporal / measure natures + the resolved
 *  entity_id_field) — an agent may ONLY ever touch these (calc-join + date protection, the
 *  substrate-integration blocker fix). `recall` is the read-before-express surface (injected
 *  so unit tests + offline proofs need no DB). */
export interface RemediationInput {
  tenantId: string;
  rows: ReadonlyArray<Record<string, unknown>>;
  columns: string[];          // all real data columns (synthetic _sheetName/_rowIndex excluded)
  allowedColumns: string[];   // columns remediation is permitted to touch (exclusions removed)
  recall?: RemediationRecall; // prior-signal read surface (read-before-express); absent → cold
  context?: Record<string, unknown>;
}

/** Read-before-express surface (G11 / I6). An agent consults prior remediation signals for
 *  this tenant BEFORE expressing, so a known pattern is reused with bounded/zero LLM work. */
export interface RemediationRecall {
  /** All prior remediation signal payloads for this tenant, filtered to one agent's name. */
  priorSignals(agentName: string): Promise<Json[]>;
}

/** One recorded change — the audit unit. Original retained alongside canonical (I3/P4). */
export interface RemediationChange {
  rowIndex: number;
  column: string;
  original: unknown;
  canonical: unknown;
  basis: string;   // 'structural' | 'llm' (how the equivalence was decided)
  agent: string;
}

/** The deterministic CONSTRUCT output (P2). correctedRows is a NEW array (no in-place mutation
 *  of the caller's rows); changes is the per-cell audit log. */
export interface RemediationConstructResult {
  correctedRows: Record<string, unknown>[];
  changes: RemediationChange[];
}

/** One agent-owned signal payload. The stage writes `value` to the canonical signal surface
 *  verbatim (as signal_value Json) and carries `fingerprint` into structural_fingerprint;
 *  `key` (e.g. a column name) is a human/debug label. The agent later reconstitutes its
 *  proposal from the array of `value`s via fromSignals — the stage never reads inside. */
export interface RemediationSignalPayload {
  key: string;
  fingerprint?: string;
  /** Normalized recognition confidence in [0,1], or null. NEVER a raw count (the canonical
   *  writer forces out-of-range confidence to null + spawns an observability row). */
  confidence?: number | null;
  expresser?: string; // provenance of the express step: 'llm' | 'structural-only' | 'recall'
  value: Json;        // the agent-opaque proposal fragment
}

/**
 * The Decision-158 agent contract. `P` is agent-private; the stage treats it as opaque.
 *
 *   identify  — STRUCTURAL candidate selection among allowedColumns (Korean Test).
 *   propose   — EXPRESS (may call the LLM). Read-before-express inside. Returns agent-owned P.
 *   toSignals — serialize P → canonical-surface payloads (durable memory + P5 + P7 render src).
 *   fromSignals — reconstitute P from prior payloads (latest-wins, the agent's own way).
 *   construct — DETERMINISTIC apply of P to rows (NO LLM). The committed value is constructed
 *               here from OBSERVED data; LLM text never reaches it (I1/P2).
 */
export interface RemediationAgent<P = unknown> {
  readonly name: string;
  identify(input: RemediationInput): string[];
  propose(targets: string[], input: RemediationInput): Promise<P | null>;
  toSignals(proposal: P): RemediationSignalPayload[];
  fromSignals(payloads: Json[]): P | null;
  construct(proposal: P, input: RemediationInput): RemediationConstructResult;
}

/** What the propose phase produced (for rendering P7 + telemetry). */
export interface RemediationProposeReport {
  agent: string;
  columns: Array<{ column: string; groupCount: number; variantCount: number; expresser: string }>;
  degraded: boolean;
  degradedReason?: string;
}

/** What the construct phase applied (returned to commitContentUnit to stamp provenance). */
export interface RemediationConstructReport {
  stageRan: true;
  agentsRun: string[];
  changeCount: number;
  changesByColumn: Record<string, number>;
  degradedAgents: string[];
}
