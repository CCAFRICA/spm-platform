// OB-203 Phase 6B / Phase D — Session Telemetry Accumulator (D.1-D.3).
//
// Truth is accumulated at WRITE time, not derived at read time (Amendment 2 §1).
// One durable row per import session (`import_session_telemetry`, migration
// 20260612200000) is incrementally updated by the work itself through the
// atomic single-statement upsert `increment_import_session_telemetry`; every
// import display number projects from that ONE row at O(1) read cost. The heavy
// `deriveImportTelemetry` scan is demoted to the once-per-session settle AUDIT.
//
// EXACTNESS BY CONSTRUCTION (HALT-4 disposition §1.2, Decision 95): additive
// columns carry only append-only quantities (signals written / per type);
// everything unit-scoped is a per-unit latest-state snapshot. Snapshots are
// stored as FLATTENED per-unit-per-field keys (`unitId<US>field`) so each field
// patches independently through the RPC's top-level jsonb merge:
//   - comprehension fields (ctier/cknown/cnovel) are written ONLY by
//     `comprehended` emissions — later states (bound) cannot wipe them;
//   - `resolvedAt` is written ONLY by `resolved` emissions — the reducer's
//     resolved-is-terminal rule survives any later (guard-violating) emission;
//   - commit fields (expectedRows/rowsCommitted/pulsesTotal/pulsesLanded/
//     batchCommitted) are written only by the commit path, idempotent under
//     retry-batches and zeroed by the D16 unit-atomic rollback.
//
// Known, documented divergence classes vs the audit derive (truth-telling, not
// silent self-correction): (a) a retry that re-comprehends a unit — the derive
// counts the FIRST comprehended signal's tier/atoms, the snapshot keeps the
// LATEST; (b) `rows.total` — the derive sums row_count across ALL session
// batches including failed+retried generations, the snapshot keeps the latest
// batch per unit. Neither occurs in a clean run; the settle audit names them.
//
// Accumulation is fire-and-forget in OUTCOME (never throws, never fails the
// import — emitUnitStates precedent) but AWAITED in SEQUENCE by callers, so
// assignment patches land in emission order.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
// Type-only imports — no runtime dependency, so canonical-signal-writer can
// import this module without a require cycle.
import type { CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';
import type {
  ImportTelemetry,
  SessionStateView,
  UnitStateView,
  UnitComprehensionState,
} from '@/lib/sci/comprehension-state-service';

// ASCII Unit Separator — structurally impossible in a unitId
// (fileName::sheetName::tabIndex from real file names). Korean Test: a control
// character is a structural delimiter, not vocabulary.
export const UNIT_FIELD_SEP = '\u001f';

export const unitFieldKey = (unitId: string, field: string): string =>
  `${unitId}${UNIT_FIELD_SEP}${field}`;

// Mirrors the derive's "comprehended or beyond" set (comprehension-state-service
// deriveImportTelemetry) — kept local to preserve the type-only import boundary.
const COMPREHENDED_OR_BEYOND: ReadonlyArray<string> = [
  'comprehended', 'classified', 'bound', 'resolved', 'failed_interpretation',
];

const UNIT_STATE_TYPE = 'comprehension:unit_state';
const TIER_RESOLUTION_TYPE = 'comprehension:tier_resolution';

export interface SessionTelemetryDelta {
  tenantId: string;
  importSessionId: string;
  signalsDelta: number;
  signalsPerType: Record<string, number>;
  unitStates: Record<string, unknown>;   // flattened unitId<US>field keys
  conclusion?: Record<string, unknown> | null;
  audit?: Record<string, unknown> | null;
}

// The Row shape this module consumes (kept structural; see database.types.ts).
export interface ImportSessionTelemetryRecord {
  tenant_id: string;
  import_session_id: string;
  total_signals_written: number;
  signals_per_type: Record<string, number> | null;
  unit_states: Record<string, unknown> | null;
  conclusion: Record<string, unknown> | null;
  audit: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// WRITE SIDE
// ============================================================

/**
 * Apply one delta to the session record via the atomic RPC. NEVER throws and
 * never fails the caller (the import is senior to its telemetry) — failures
 * log loudly under the greppable `[OB-203][telemetry]` tag. Callers AWAIT this
 * so patches land in emission order.
 */
export async function accumulateSessionTelemetry(
  delta: SessionTelemetryDelta,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_import_session_telemetry', {
      p_tenant_id: delta.tenantId,
      p_import_session_id: delta.importSessionId,
      p_signals_delta: delta.signalsDelta,
      p_signals_per_type: (delta.signalsPerType ?? {}) as Json,
      p_unit_states: (delta.unitStates ?? {}) as Json,
      p_conclusion: (delta.conclusion ?? null) as Json | null,
      p_audit: (delta.audit ?? null) as Json | null,
    });
    if (error) {
      console.error(`[OB-203][telemetry] accumulate failed (non-blocking) session=${delta.importSessionId}: ${error.message}`);
    }
  } catch (e) {
    console.error(`[OB-203][telemetry] accumulate threw (non-blocking) session=${delta.importSessionId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Pure: derive telemetry deltas from a set of canonical signals (Hook 1 input).
 * Only signals carrying `context.importSessionId` participate — the exact
 * predicate the audit derive scans on, so the two surfaces count the same
 * universe by construction. Returns one delta per (tenant, session) group
 * (in practice one).
 */
export function buildDeltasFromSignals(signals: CanonicalSignalInput[]): SessionTelemetryDelta[] {
  const groups = new Map<string, SessionTelemetryDelta>();
  const nowIso = new Date().toISOString();

  // Within one call, unit_state patches must apply in emission order — sort by
  // the same intra-request `seq` the reducer uses as its created_at tiebreak.
  const ordered = signals
    .slice()
    .sort((a, b) => (((a.signalValue?.seq as number) ?? 0) - ((b.signalValue?.seq as number) ?? 0)));

  for (const s of ordered) {
    const sessionId = s.context?.importSessionId;
    if (typeof sessionId !== 'string' || !sessionId) continue;

    const key = `${s.tenantId}${UNIT_FIELD_SEP}${sessionId}`;
    let g = groups.get(key);
    if (!g) {
      g = { tenantId: s.tenantId, importSessionId: sessionId, signalsDelta: 0, signalsPerType: {}, unitStates: {} };
      groups.set(key, g);
    }
    g.signalsDelta += 1;
    g.signalsPerType[s.signalType] = (g.signalsPerType[s.signalType] ?? 0) + 1;

    const sv = s.signalValue ?? {};
    const unitId = sv.unitId;
    if (typeof unitId !== 'string' || !unitId) continue;

    if (s.signalType === UNIT_STATE_TYPE) {
      const state = sv.state as string | undefined;
      if (!state) continue;
      const put = (field: string, value: unknown) => { g!.unitStates[unitFieldKey(unitId, field)] = value ?? null; };
      // Current-row fields — mirror the reducer, which reads these from the
      // latest signal row (nulls included).
      put('state', state);
      put('tier', sv.tier ?? null);
      put('knownCount', sv.knownCount ?? null);
      put('novelCount', sv.novelCount ?? null);
      put('failureClass', sv.failureClass ?? null);
      put('classification', s.classification ?? null);
      put('confidence', s.confidence ?? null);
      put('sheetName', s.sheetName ?? null);
      put('sourceFileName', s.sourceFileName ?? null);
      put('updatedAt', nowIso);
      // Comprehension-anchored counters — written ONLY here, so later states
      // cannot wipe them (mirrors the derive's first-comprehended dedup).
      if (state === 'comprehended') {
        put('ctier', sv.tier ?? null);
        put('cknown', sv.knownCount ?? null);
        put('cnovel', sv.novelCount ?? null);
      }
      // Resolved-is-terminal anchor — written ONLY by resolved emissions; the
      // projector restores state='resolved' even if a guard-violating later
      // emission patches `state`.
      if (state === 'resolved') {
        put('resolvedAt', nowIso);
      }
    } else if (s.signalType === TIER_RESOLUTION_TYPE) {
      // One tier_resolution per comprehended unit in a clean run; per-unit
      // latest-wins (divergence class (a) documents the retry edge).
      g.unitStates[unitFieldKey(unitId, 'injectedBindings')] = (sv.injectedBindings as number) ?? 0;
    }
  }

  return Array.from(groups.values());
}

/** Hook 1 entry: derive deltas from signals and apply them. Never throws. */
export async function accumulateFromSignals(
  signals: CanonicalSignalInput[],
  supabase: SupabaseClient,
): Promise<void> {
  const deltas = buildDeltasFromSignals(signals);
  for (const d of deltas) {
    await accumulateSessionTelemetry(d, supabase);
  }
}

/** Hook 2 entry: patch one unit's commit-path fields. Never throws. */
export async function accumulateUnitCommitFields(
  params: {
    tenantId: string;
    importSessionId: string;
    unitId: string;
    fields: Partial<{
      expectedRows: number;
      rowsCommitted: number;
      pulsesTotal: number;
      pulsesLanded: number;
      batchCommitted: boolean;
      sheetName: string | null;
      plansCreated: number;       // OB-256 (W-5): a plan unit created N rule_sets (1 per unit)…
      componentsCreated: number;  // …with M components — counted for the Intelligence Summary.
    }>;
  },
  supabase: SupabaseClient,
): Promise<void> {
  const unitStates: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(params.fields)) {
    if (value !== undefined) unitStates[unitFieldKey(params.unitId, field)] = value;
  }
  if (Object.keys(unitStates).length === 0) return;
  await accumulateSessionTelemetry(
    { tenantId: params.tenantId, importSessionId: params.importSessionId, signalsDelta: 0, signalsPerType: {}, unitStates },
    supabase,
  );
}

// ============================================================
// READ SIDE — single-row fetch + pure projections
// ============================================================

/** O(1) single-row read by (tenant_id, import_session_id). Returns null when absent. */
export async function fetchSessionTelemetryRecord(
  tenantId: string,
  importSessionId: string,
  supabase: SupabaseClient,
): Promise<ImportSessionTelemetryRecord | null> {
  const { data, error } = await supabase
    .from('import_session_telemetry')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('import_session_id', importSessionId)
    .maybeSingle();
  if (error) {
    throw new Error(`[OB-203][telemetry] record fetch failed for session ${importSessionId}: ${error.message}`);
  }
  return (data as ImportSessionTelemetryRecord | null) ?? null;
}

interface UnitSnapshot { [field: string]: unknown }

/** Unflatten unitId<US>field keys into per-unit snapshots. */
export function unflattenUnitStates(unitStates: Record<string, unknown> | null): Map<string, UnitSnapshot> {
  const byUnit = new Map<string, UnitSnapshot>();
  for (const [key, value] of Object.entries(unitStates ?? {})) {
    const sep = key.lastIndexOf(UNIT_FIELD_SEP);
    if (sep <= 0) continue;
    const unitId = key.slice(0, sep);
    const field = key.slice(sep + 1);
    let snap = byUnit.get(unitId);
    if (!snap) { snap = {}; byUnit.set(unitId, snap); }
    snap[field] = value;
  }
  return byUnit;
}

const effectiveState = (snap: UnitSnapshot): UnitComprehensionState => {
  if (snap.resolvedAt) return 'resolved';
  return (snap.state as UnitComprehensionState) ?? 'persisted';
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Project the SessionStateView contract from the record — same shape every
 * poller already consumes (Phase 5 data contract preserved; D19 closes because
 * header and panels read this one row). `history` is intentionally empty: its
 * only consumer (the analyze progress-tick detector) reads `progressTick`.
 */
export function projectSessionStateView(
  record: ImportSessionTelemetryRecord | null,
  tenantId: string,
  importSessionId: string,
): SessionStateView {
  if (!record) {
    return { importSessionId, tenantId, units: [], isOpen: false, progressTick: 0 };
  }
  const byUnit = unflattenUnitStates(record.unit_states);
  const units: UnitStateView[] = [];
  for (const [unitId, snap] of Array.from(byUnit.entries())) {
    const state = effectiveState(snap);
    units.push({
      unitId,
      sheetName: (snap.sheetName as string) ?? null,
      sourceFileName: (snap.sourceFileName as string) ?? null,
      state,
      tier: (snap.tier as number) ?? null,
      knownCount: (snap.knownCount as number) ?? null,
      novelCount: (snap.novelCount as number) ?? null,
      classification: (snap.classification as string) ?? null,
      confidence: (snap.confidence as number) ?? null,
      failureClass: (snap.failureClass as string) ?? null,
      updatedAt: (snap.updatedAt as string) ?? record.updated_at,
      retryable: state === 'failed_interpretation',
      history: [],
    });
  }
  units.sort((a, b) => (a.sheetName ?? '').localeCompare(b.sheetName ?? ''));
  const isOpen = units.some(u => u.state !== 'bound' && u.state !== 'resolved');
  return { importSessionId, tenantId, units, isOpen, progressTick: record.total_signals_written };
}

/**
 * Project the ImportTelemetry contract from the record — identical field
 * vocabulary to the (demoted) derive, so no panel changes shape. Pulse counts
 * are the ACTUAL landed/planned pulse numbers from the commit path's own
 * chunking — "pulse X of Y" now matches the write shape exactly, instead of
 * the old ceil(rows/500) re-derivation.
 */
export function projectImportTelemetry(record: ImportSessionTelemetryRecord | null): ImportTelemetry {
  const byUnit = unflattenUnitStates(record?.unit_states ?? null);

  let comprehended = 0, unitsCommitted = 0;
  let recognizedTier1 = 0, storedNew = 0, llmMade = 0, llmBypassed = 0;
  let atomsMemory = 0, atomsNovel = 0, fieldBindingsInjected = 0;
  let rowsCommitted = 0, rowsTotal = 0, pulsesLanded = 0, pulsesTotal = 0;
  let plansCreated = 0, componentsCreated = 0; // OB-256 (W-5)
  const perUnit: ImportTelemetry['perUnit'] = [];

  for (const snap of Array.from(byUnit.values())) {
    const state = effectiveState(snap);
    if (COMPREHENDED_OR_BEYOND.includes(state)) comprehended++;
    if (state === 'bound') unitsCommitted++;
    // Comprehension-anchored counters (ctier written only at `comprehended` —
    // the derive's seenUnits dedup, mirrored structurally).
    const ctier = snap.ctier as number | null | undefined;
    if (ctier === 1) { recognizedTier1++; llmBypassed++; }
    else if (ctier === 3) { storedNew++; llmMade++; }
    if (snap.ctier !== undefined) {
      atomsMemory += num(snap.cknown);
      atomsNovel += num(snap.cnovel);
    }
    fieldBindingsInjected += num(snap.injectedBindings);
    plansCreated += num(snap.plansCreated);             // OB-256 (W-5): plan-interpretation units
    componentsCreated += num(snap.componentsCreated);
    // Commit-path fields exist only for units that created a batch — the same
    // membership the derive's import_batches scan produces.
    if (snap.expectedRows !== undefined) {
      const expected = num(snap.expectedRows);
      rowsTotal += expected;
      rowsCommitted += num(snap.rowsCommitted);
      pulsesTotal += num(snap.pulsesTotal);
      pulsesLanded += num(snap.pulsesLanded);
      perUnit.push({
        sheetName: (snap.sheetName as string) ?? null,
        expectedRows: expected,
        committed: snap.batchCommitted === true,
      });
    }
  }
  perUnit.sort((a, b) => (a.sheetName ?? '').localeCompare(b.sheetName ?? ''));

  return {
    totalSignalsWritten: record?.total_signals_written ?? 0,
    signalsPerType: (record?.signals_per_type as Record<string, number>) ?? {},
    sheets: { comprehended, total: byUnit.size },
    fingerprints: { recognizedTier1, storedNew },
    atoms: { claimedFromMemory: atomsMemory, novelComprehended: atomsNovel },
    llm: { made: llmMade, bypassedByMemory: llmBypassed },
    fieldBindingsInjected,
    units: { committed: unitsCommitted, total: byUnit.size },
    rows: { committed: rowsCommitted, total: rowsTotal },
    perUnit,
    pulses: { committed: pulsesLanded, total: pulsesTotal },
    plans: { created: plansCreated, components: componentsCreated }, // OB-256 (W-5)
  };
}
