// OB-203 Phase 3 — Durable Comprehension State (R2/DI-1)
//
// Unit comprehension state lives as signals on the ONE canonical surface
// (`classification_signals`, via the ONE canonical writer) under a dedicated
// `signal_type` — `comprehension:unit_state` (architect-ratified 2026-06-11;
// G7 forbids new TABLES/CHANNELS, not new signal_type values; precedent:
// `failed_interpretation`, `comprehension:atom_write_failed`). Overloading
// `classification:outcome` would contaminate outcome semantics — the same shape
// as the fieldBindings-under-wrong-classification defect closed in Phase 2.
//
// The in-memory SynapticIngestionState becomes a working cache REBUILDABLE from
// this surface (`reduceSessionState` / `rebuildSessionState`): read-before-derive
// and the import surface both consume the durable signal, not ephemeral memory.
//
// IDENTITY BOUNDARY (architect, item 2): `importSessionId` is the COMPREHENSION-
// session identity (aliases the analyze-route `proposalId`), stamped in
// `context.importSessionId` on every state signal. It is DISTINCT from the
// execute-side `import_batch_id` (HF-213 supersession lineage). The two are
// never conflated: importSessionId groups comprehension states; import_batch_id
// groups committed rows.

import { createClient } from '@supabase/supabase-js';
import { writeSignal, writeSignalBatch, type CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';

export const UNIT_STATE_SIGNAL_TYPE = 'comprehension:unit_state';

// ── State vocabulary ──────────────────────────────────────────
// The monotonic progression a unit travels (DI-1: `persisted` is state zero and
// unconditional). `failed_interpretation` is a branch reachable from any state;
// `resolved` is terminal and supersedes everything (human correction or a
// successful retry's terminal binding).
export type UnitComprehensionState =
  | 'persisted'
  | 'profiled'
  | 'recognized'
  | 'comprehended'
  | 'classified'
  | 'bound'
  | 'failed_interpretation'
  | 'resolved';

// Forward rank for the monotonic spine. `failed_interpretation` and `resolved`
// are OFF the spine (rank -1 / Infinity) — they are handled by precedence in the
// reducer, not by rank comparison.
export const STATE_RANK: Record<UnitComprehensionState, number> = {
  persisted: 0,
  profiled: 1,
  recognized: 2,
  comprehended: 3,
  classified: 4,
  bound: 5,
  failed_interpretation: -1,
  resolved: 100,
};

/** A spine state is one of the monotonic progression states (not failed/resolved). */
export function isSpineState(s: UnitComprehensionState): boolean {
  return STATE_RANK[s] >= 0 && s !== 'resolved';
}

/**
 * Emission guard: is `next` a legal forward transition from `current`?
 * Spine→spine must not regress rank. failed_interpretation is reachable from any
 * spine state. resolved is reachable from any state (terminal). Re-emitting
 * failed_interpretation (retry that fails again) is legal. Nothing leaves
 * `resolved`.
 */
export function isForwardTransition(current: UnitComprehensionState | null, next: UnitComprehensionState): boolean {
  if (current === null) return true;            // first observation
  if (current === 'resolved') return false;     // terminal
  if (next === 'resolved') return true;         // anything may resolve
  if (next === 'failed_interpretation') return true; // anything (incl. failed) may (re)fail
  if (current === 'failed_interpretation') return true; // retry resumes the spine
  return STATE_RANK[next] >= STATE_RANK[current]; // spine: no regression
}

// ── Signal payload shapes ─────────────────────────────────────
export interface UnitStateSignalParams {
  tenantId: string;
  importSessionId: string;       // comprehension-session identity (aliases proposalId)
  unitId: string;                // profile.contentUnitId (fileName::sheetName::tabIndex) — unique per file
  sheetName: string | null;
  sourceFileName: string | null;
  state: UnitComprehensionState;
  tier?: number | null;          // recognition tier (1/2/3) when state='recognized'
  knownCount?: number | null;    // atoms claimed (read-before-derive)
  novelCount?: number | null;    // atoms comprehended (residue)
  fingerprint?: Record<string, unknown> | null;
  classification?: string | null;     // set at classified/bound
  decisionSource?: string | null;
  confidence?: number | null;
  failureClass?: string | null;       // when state='failed_interpretation'
  humanCorrectionFrom?: string | null; // when state='resolved' by a human
}

/** Pure builder — returns the CanonicalSignalInput for one unit-state transition. */
export function buildUnitStateSignalInput(p: UnitStateSignalParams): CanonicalSignalInput {
  const bySource = p.humanCorrectionFrom ? 'user_corrected' : 'sci_agent';
  return {
    tenantId: p.tenantId,
    signalType: UNIT_STATE_SIGNAL_TYPE,
    signalValue: {
      unitId: p.unitId,
      state: p.state,
      tier: p.tier ?? null,
      knownCount: p.knownCount ?? null,
      novelCount: p.novelCount ?? null,
      failureClass: p.failureClass ?? null,
    },
    context: { importSessionId: p.importSessionId, phase: '3', sciVersion: '2.0' },
    confidence: p.confidence ?? null,
    source: bySource,
    sourceFileName: p.sourceFileName,
    sheetName: p.sheetName,
    structuralFingerprint: p.fingerprint ?? null,
    classification: p.classification ?? null,
    decisionSource: p.decisionSource ?? null,
    humanCorrectionFrom: p.humanCorrectionFrom ?? null,
    scope: 'tenant',
  };
}

/** Write one unit-state transition through the canonical writer. */
export async function writeUnitStateSignal(
  p: UnitStateSignalParams,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  await writeSignal(buildUnitStateSignalInput(p), supabaseUrl, supabaseServiceKey);
}

/** Batch variant — one round-trip for several units' transitions. */
export async function writeUnitStateSignalBatch(
  params: UnitStateSignalParams[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  if (params.length === 0) return;
  await writeSignalBatch(params.map(buildUnitStateSignalInput), supabaseUrl, supabaseServiceKey);
}

// ── Read shape (THE PHASE 5 DATA CONTRACT) ────────────────────
// `SessionStateView` is what the import surface polls and what the Phase 5
// resolution dialog consumes. Named here so Phase 5 reads it without rework.
export interface UnitStateView {
  unitId: string;
  sheetName: string | null;
  sourceFileName: string | null;
  state: UnitComprehensionState;
  tier: number | null;
  knownCount: number | null;
  novelCount: number | null;
  classification: string | null;
  confidence: number | null;
  failureClass: string | null;
  updatedAt: string;
  retryable: boolean;               // state === 'failed_interpretation'
  history: Array<{ state: UnitComprehensionState; at: string; source: string }>;
}

export interface SessionStateView {
  importSessionId: string;
  tenantId: string;
  units: UnitStateView[];
  isOpen: boolean;                  // any unit not yet in {bound, resolved} (no completion gate on comprehension)
}

// Minimal row shape the reducer consumes (a subset of classification_signals).
export interface RawStateSignalRow {
  signal_value: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  sheet_name: string | null;
  source_file_name: string | null;
  classification: string | null;
  decision_source: string | null;
  confidence: number | null;
  source: string | null;
  created_at: string;
}

/**
 * PURE reducer: collapse a session's `comprehension:unit_state` rows into the
 * per-unit current view. Deterministic, DB-free (unit-testable).
 *
 * Current state per unit = latest-by-created_at, with `resolved` terminal. The
 * monotonic spine is an emission invariant (isForwardTransition); the reducer
 * trusts created_at ordering so a successful retry (later signal) supersedes the
 * prior `failed_interpretation` naturally.
 */
export function reduceSessionState(
  tenantId: string,
  importSessionId: string,
  rows: RawStateSignalRow[],
): SessionStateView {
  const byUnit = new Map<string, RawStateSignalRow[]>();
  for (const r of rows) {
    const unitId = (r.signal_value?.unitId as string) ?? null;
    if (!unitId) continue;
    (byUnit.get(unitId) ?? byUnit.set(unitId, []).get(unitId)!).push(r);
  }

  const units: UnitStateView[] = [];
  for (const [unitId, unitRows] of Array.from(byUnit.entries())) {
    const ordered = unitRows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    const history = ordered.map(r => ({
      state: (r.signal_value?.state as UnitComprehensionState),
      at: r.created_at,
      source: r.source ?? 'sci_agent',
    }));
    // resolved is terminal: if ever resolved, that is the current state.
    const resolved = ordered.find(r => (r.signal_value?.state as string) === 'resolved');
    const current = resolved ?? ordered[ordered.length - 1];
    const sv = current.signal_value ?? {};
    const state = (sv.state as UnitComprehensionState) ?? 'persisted';
    units.push({
      unitId,
      sheetName: current.sheet_name,
      sourceFileName: current.source_file_name,
      state,
      tier: (sv.tier as number) ?? null,
      knownCount: (sv.knownCount as number) ?? null,
      novelCount: (sv.novelCount as number) ?? null,
      classification: current.classification,
      confidence: current.confidence,
      failureClass: (sv.failureClass as string) ?? null,
      updatedAt: current.created_at,
      retryable: state === 'failed_interpretation',
      history,
    });
  }

  units.sort((a, b) => (a.sheetName ?? '').localeCompare(b.sheetName ?? ''));
  const isOpen = units.some(u => u.state !== 'bound' && u.state !== 'resolved');
  return { importSessionId, tenantId, units, isOpen };
}

/**
 * Rebuild a session's live state from the durable signal surface (R2 / EPG-3.3).
 * This is the resumable-cache path: after a process restart the in-memory
 * SynapticIngestionState is gone, but the session view reconstructs from
 * `classification_signals` alone. It is also the poll endpoint's data source.
 *
 * Read-before-derive: filtered on `signal_type` + `context->>importSessionId`, so
 * it consumes the durable signal (no ephemeral state).
 */
export async function rebuildSessionState(
  tenantId: string,
  importSessionId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<SessionStateView> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('classification_signals')
    .select('signal_value, context, sheet_name, source_file_name, classification, decision_source, confidence, source, created_at')
    .eq('tenant_id', tenantId)
    .eq('signal_type', UNIT_STATE_SIGNAL_TYPE)
    .eq('context->>importSessionId', importSessionId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`[comprehension-state] rebuild failed for session ${importSessionId}: ${error.message}`);
  }
  return reduceSessionState(tenantId, importSessionId, (data ?? []) as RawStateSignalRow[]);
}
