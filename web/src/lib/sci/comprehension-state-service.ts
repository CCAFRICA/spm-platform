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
  // Emission sequence within ONE request. A batch insert stamps all rows with the
  // same created_at; `seq` is the intra-request tiebreak so the reducer orders
  // persisted(0) < profiled(1) < … deterministically. Across requests (e.g. a
  // later retry) created_at dominates, so per-request seq restarting at 0 is safe.
  seq?: number;
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
      seq: p.seq ?? 0,
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

/**
 * Non-blocking emission for the import pipeline: state signals are durable
 * comprehension MEMORY, but a write failure must not fail the import (the data
 * still ingests). Failures are surfaced loudly (not silently swallowed — the
 * `[OB-203][state]` tag is greppable in logs), matching the non-blocking
 * fingerprint-lookup pattern in the analyze route.
 */
export async function emitUnitStates(
  params: UnitStateSignalParams[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  if (params.length === 0) return;
  try {
    await writeUnitStateSignalBatch(params, supabaseUrl, supabaseServiceKey);
  } catch (e) {
    console.error(`[OB-203][state] emission failed (non-blocking) for ${params.length} unit-state(s): ${e instanceof Error ? e.message : String(e)}`);
  }
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
    const ordered = unitRows.slice().sort((a, b) => {
      const t = a.created_at.localeCompare(b.created_at);
      if (t !== 0) return t;
      // same-batch (identical created_at) tiebreak: explicit emission seq
      return ((a.signal_value?.seq as number) ?? 0) - ((b.signal_value?.seq as number) ?? 0);
    });
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

// ── OB-203 §2 — Import Telemetry (BL-005) ─────────────────────────────────────────────────────────────
// The witness operator's live view of the platform's actual work. Shaped to DS-020's SynapticSurface.stats
// vocabulary (totalSynapsesWritten / synapsesPerType) — these import counters ARE the SCI expression of
// synaptic stats, not a parallel concept. EVERY counter derives from the DURABLE SPINE (classification_
// signals, the session-state view, import_batches + committed_data) — no client-side tally. If a counter
// can't be derived here, that is a gap in the record, not a license to count elsewhere.
export interface ImportTelemetry {
  // SynapticSurface.stats shape (DS-020) — the running totals of the synaptic surface, SCI expression.
  totalSignalsWritten: number;                 // ~ totalSynapsesWritten
  signalsPerType: Record<string, number>;      // ~ synapsesPerType
  // ANALYZE — Progressive Performance witness
  sheets: { comprehended: number; total: number };
  fingerprints: { recognizedTier1: number; storedNew: number };
  atoms: { claimedFromMemory: number; novelComprehended: number };
  llm: { made: number; bypassedByMemory: number };   // bypassedByMemory IS the Progressive Performance number
  fieldBindingsInjected: number;
  // EXECUTE — pulses landing on the durable record
  units: { committed: number; total: number };
  rows: { committed: number; total: number };
  perUnit: Array<{ sheetName: string | null; expectedRows: number; committed: boolean }>;
  pulses: { committed: number; total: number };       // derived from rows ÷ PULSE_SIZE
}

// Pulse size mirrors commit-content-unit's sci-bulk write profile (D16: 500-row pulses). Kept in sync so
// "pulse X of Y" matches the actual write shape.
const PULSE_SIZE = 500;

export async function deriveImportTelemetry(
  tenantId: string,
  importSessionId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<ImportTelemetry> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. ALL signals for the session → analyze counters + synaptic-stats shape (one read).
  const { data: sigRows } = await supabase
    .from('classification_signals')
    .select('signal_type, signal_value')
    .eq('tenant_id', tenantId)
    .eq('context->>importSessionId', importSessionId);
  const signals = (sigRows ?? []) as Array<{ signal_type: string; signal_value: Record<string, unknown> | null }>;

  const signalsPerType: Record<string, number> = {};
  let recognizedTier1 = 0, storedNew = 0, llmMade = 0, llmBypassed = 0;
  let atomsMemory = 0, atomsNovel = 0, fieldBindingsInjected = 0;
  // D17: the fingerprint/atom/LLM counters derive from the STREAMED `comprehended` unit-states (emitted
  // per-sheet as each finishes, carrying tier + knownCount + novelCount), so the counters move LIVE through
  // the comprehension stretch instead of jumping at the end off the batched tier/composition signals.
  // fieldBindings still rides the tier_resolution signal (the only place it lives). Dedupe per unit.
  const seenUnits = new Set<string>();
  for (const r of signals) {
    signalsPerType[r.signal_type] = (signalsPerType[r.signal_type] ?? 0) + 1;
    const sv = r.signal_value ?? {};
    if (r.signal_type === 'comprehension:unit_state' && sv.state === 'comprehended') {
      const uid = sv.unitId as string | undefined;
      if (uid && !seenUnits.has(uid)) {
        seenUnits.add(uid);
        const tier = sv.tier as number | null;
        if (tier === 1) { recognizedTier1++; llmBypassed++; }
        else if (tier === 3) { storedNew++; llmMade++; }
        atomsMemory += (sv.knownCount as number) ?? 0;
        atomsNovel += (sv.novelCount as number) ?? 0;
      }
    } else if (r.signal_type === 'comprehension:tier_resolution') {
      fieldBindingsInjected += (sv.injectedBindings as number) ?? 0;
    }
  }

  // 2. Session-state view → sheets comprehended + units committed (bound).
  const view = await rebuildSessionState(tenantId, importSessionId, supabaseUrl, supabaseServiceKey);
  const total = view.units.length;
  const comprehended = view.units.filter(u =>
    ['comprehended', 'classified', 'bound', 'resolved', 'failed_interpretation'].includes(u.state),
  ).length;
  const unitsCommitted = view.units.filter(u => u.state === 'bound').length;
  const sheetByUnitId = new Map(view.units.map(u => [u.unitId, u.sheetName]));

  // 3. Execute counters — session batches (expected rows + per-unit) + committed_data count (actual).
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, row_count, status, metadata')
    .eq('tenant_id', tenantId)
    .eq('metadata->>proposalId', importSessionId);
  let rowsTotal = 0;
  const perUnit: ImportTelemetry['perUnit'] = [];
  for (const b of (batches ?? []) as Array<{ id: string; row_count: number | null; status: string; metadata: Record<string, unknown> | null }>) {
    const expected = b.row_count ?? 0;
    rowsTotal += expected;
    const unitId = (b.metadata?.contentUnitId as string) ?? '';
    perUnit.push({ sheetName: sheetByUnitId.get(unitId) ?? null, expectedRows: expected, committed: b.status === 'completed' });
  }
  const { count: rowsCommitted } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('metadata->>proposalId', importSessionId);
  const committed = rowsCommitted ?? 0;

  return {
    totalSignalsWritten: signals.length,
    signalsPerType,
    sheets: { comprehended, total },
    fingerprints: { recognizedTier1, storedNew },
    atoms: { claimedFromMemory: atomsMemory, novelComprehended: atomsNovel },
    llm: { made: llmMade, bypassedByMemory: llmBypassed },
    fieldBindingsInjected,
    units: { committed: unitsCommitted, total },
    rows: { committed, total: rowsTotal },
    perUnit,
    pulses: { committed: Math.ceil(committed / PULSE_SIZE), total: Math.ceil(rowsTotal / PULSE_SIZE) },
  };
}
