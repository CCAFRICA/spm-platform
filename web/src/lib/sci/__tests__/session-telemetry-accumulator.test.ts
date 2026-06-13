/**
 * OB-203 Phase 6B Phase D — session telemetry accumulator (write-time truth).
 * Runner: node --test --import tsx.
 *
 * Proves the exactness-by-construction properties the HALT-4 disposition
 * ratified: per-unit latest-state snapshots are idempotent under the write
 * path's documented re-emission (double `bound`), comprehension-anchored
 * counters survive later emissions, resolved is terminal, rollback zeroes the
 * unit, and the projections reproduce the (demoted) derive's field semantics.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';
import {
  UNIT_FIELD_SEP,
  unitFieldKey,
  buildDeltasFromSignals,
  unflattenUnitStates,
  projectImportTelemetry,
  projectSessionStateView,
  type SessionTelemetryDelta,
  type ImportSessionTelemetryRecord,
} from '../session-telemetry-accumulator';

const TENANT = 't-1';
const SESSION = 's-1';

// Local simulator of increment_import_session_telemetry's merge semantics
// (additive scalars / per-key-additive signals_per_type / top-level jsonb
// merge on unit_states / first-wins conclusion+audit) — the same contract the
// applied migration's in-transaction smoke test verified live.
function applyDelta(rec: ImportSessionTelemetryRecord | null, d: SessionTelemetryDelta): ImportSessionTelemetryRecord {
  const base: ImportSessionTelemetryRecord = rec ?? {
    tenant_id: d.tenantId, import_session_id: d.importSessionId,
    total_signals_written: 0, signals_per_type: {}, unit_states: {},
    conclusion: null, audit: null, created_at: 'now', updated_at: 'now',
  };
  const perType = { ...(base.signals_per_type ?? {}) };
  for (const [k, v] of Object.entries(d.signalsPerType)) perType[k] = (perType[k] ?? 0) + v;
  return {
    ...base,
    total_signals_written: base.total_signals_written + d.signalsDelta,
    signals_per_type: perType,
    unit_states: { ...(base.unit_states ?? {}), ...d.unitStates },
    conclusion: base.conclusion ?? d.conclusion ?? null,
    audit: base.audit ?? d.audit ?? null,
  };
}

const unitState = (
  unitId: string,
  state: string,
  extra: Partial<{ tier: number | null; knownCount: number | null; novelCount: number | null; failureClass: string | null; seq: number }> = {},
  row: Partial<{ classification: string | null; confidence: number | null; sheetName: string | null; sourceFileName: string | null }> = {},
): CanonicalSignalInput => ({
  tenantId: TENANT,
  signalType: 'comprehension:unit_state',
  signalValue: { unitId, state, tier: extra.tier ?? null, knownCount: extra.knownCount ?? null, novelCount: extra.novelCount ?? null, failureClass: extra.failureClass ?? null, seq: extra.seq ?? 0 },
  context: { importSessionId: SESSION, phase: '3', sciVersion: '2.0' },
  classification: row.classification ?? null,
  confidence: row.confidence ?? null,
  sheetName: row.sheetName ?? null,
  sourceFileName: row.sourceFileName ?? null,
});

const tierResolution = (unitId: string, injectedBindings: number): CanonicalSignalInput => ({
  tenantId: TENANT,
  signalType: 'comprehension:tier_resolution',
  signalValue: { unitId, tier: 1, resolver: 'flywheel', injectedBindings },
  context: { importSessionId: SESSION },
});

// Hook-2 commit patches, expressed as deltas (mirrors accumulateUnitCommitFields).
const commitPatch = (unitId: string, fields: Record<string, unknown>): SessionTelemetryDelta => ({
  tenantId: TENANT, importSessionId: SESSION, signalsDelta: 0, signalsPerType: {},
  unitStates: Object.fromEntries(Object.entries(fields).map(([f, v]) => [unitFieldKey(unitId, f), v])),
});

test('signals without importSessionId do not participate (same predicate as the audit derive)', () => {
  const deltas = buildDeltasFromSignals([
    { tenantId: TENANT, signalType: 'calculation:something', context: {} },
    { tenantId: TENANT, signalType: 'observability:write_failure', context: { producing_module: 'canonical-signal-writer' } },
  ]);
  assert.equal(deltas.length, 0);
});

test('per-type tally + signals delta count only session signals', () => {
  const deltas = buildDeltasFromSignals([
    unitState('u1', 'persisted', { seq: 0 }),
    unitState('u1', 'profiled', { seq: 1 }),
    tierResolution('u1', 30),
    { tenantId: TENANT, signalType: 'calculation:other', context: {} },
  ]);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].signalsDelta, 3);
  assert.deepEqual(deltas[0].signalsPerType, {
    'comprehension:unit_state': 2,
    'comprehension:tier_resolution': 1,
  });
});

test('seq ordering within a batch: later seq wins the state field', () => {
  // Deliberately out of array order — the builder sorts by seq (the reducer''s
  // same-created_at tiebreak).
  const deltas = buildDeltasFromSignals([
    unitState('u1', 'profiled', { seq: 1 }),
    unitState('u1', 'persisted', { seq: 0 }),
  ]);
  assert.equal(deltas[0].unitStates[unitFieldKey('u1', 'state')], 'profiled');
});

test('comprehension-anchored fields written only at comprehended; bound cannot wipe them', () => {
  let rec: ImportSessionTelemetryRecord | null = null;
  for (const batch of [
    [unitState('u1', 'comprehended', { tier: 1, knownCount: 30, novelCount: 2, seq: 3 }, { sheetName: 'Ventas' })],
    [unitState('u1', 'bound', { seq: 5 }, { classification: 'transaction', sheetName: 'Ventas' })],
  ]) {
    for (const d of buildDeltasFromSignals(batch)) rec = applyDelta(rec, d);
  }
  const snap = unflattenUnitStates(rec!.unit_states).get('u1')!;
  assert.equal(snap.state, 'bound');
  assert.equal(snap.tier, null);            // current-row mirror (bound carries tier null, like the reducer)
  assert.equal(snap.ctier, 1);              // comprehension anchor survives
  assert.equal(snap.cknown, 30);
  assert.equal(snap.cnovel, 2);
  const t = projectImportTelemetry(rec);
  assert.equal(t.fingerprints.recognizedTier1, 1);
  assert.equal(t.llm.bypassedByMemory, 1);
  assert.equal(t.atoms.claimedFromMemory, 30);
  assert.equal(t.atoms.novelComprehended, 2);
});

test('double bound emission (execute-bulk per-unit stream + end-of-run batch) is idempotent', () => {
  let rec: ImportSessionTelemetryRecord | null = null;
  const bound = () => [unitState('u1', 'bound', { seq: 5 }, { sheetName: 'A' })];
  for (const batch of [bound(), bound()]) {
    for (const d of buildDeltasFromSignals(batch)) rec = applyDelta(rec, d);
  }
  const t = projectImportTelemetry(rec);
  assert.equal(t.units.committed, 1);       // assignment, not increment — Decision 95
  assert.equal(t.units.total, 1);
  // The double emission IS visible in the append-only lane (truthful):
  assert.equal(rec!.total_signals_written, 2);
});

test('resolved is terminal: a later (guard-violating) bound cannot leave resolved', () => {
  let rec: ImportSessionTelemetryRecord | null = null;
  for (const batch of [
    [unitState('u1', 'resolved', { seq: 4 }, { sheetName: 'Portada' })],
    [unitState('u1', 'bound', { seq: 5 }, { sheetName: 'Portada' })],
  ]) {
    for (const d of buildDeltasFromSignals(batch)) rec = applyDelta(rec, d);
  }
  const view = projectSessionStateView(rec, TENANT, SESSION);
  assert.equal(view.units[0].state, 'resolved');
  const t = projectImportTelemetry(rec);
  assert.equal(t.units.committed, 0);       // resolved units are not 'bound' (derive line semantics)
});

test('tier_resolution patches per-unit injectedBindings; projection sums across units', () => {
  let rec: ImportSessionTelemetryRecord | null = null;
  for (const d of buildDeltasFromSignals([tierResolution('u1', 30), tierResolution('u2', 12)])) {
    rec = applyDelta(rec, d);
  }
  assert.equal(projectImportTelemetry(rec).fieldBindingsInjected, 42);
});

test('commit lifecycle: create → pulses → finalize; perUnit membership requires a batch', () => {
  let rec: ImportSessionTelemetryRecord | null = null;
  for (const d of buildDeltasFromSignals([unitState('u1', 'classified', { seq: 4 }, { sheetName: 'Ventas' })])) {
    rec = applyDelta(rec, d);
  }
  // No batch yet → perUnit empty (mirrors the derive's import_batches membership)
  assert.equal(projectImportTelemetry(rec).perUnit.length, 0);

  rec = applyDelta(rec, commitPatch('u1', { sheetName: 'Ventas', expectedRows: 1234, pulsesTotal: 3, rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false }));
  rec = applyDelta(rec, commitPatch('u1', { rowsCommitted: 500, pulsesLanded: 1 }));
  rec = applyDelta(rec, commitPatch('u1', { rowsCommitted: 1000, pulsesLanded: 2 }));
  let t = projectImportTelemetry(rec);
  assert.deepEqual(t.rows, { committed: 1000, total: 1234 });
  assert.deepEqual(t.pulses, { committed: 2, total: 3 });
  assert.deepEqual(t.perUnit, [{ sheetName: 'Ventas', expectedRows: 1234, committed: false }]);

  rec = applyDelta(rec, commitPatch('u1', { rowsCommitted: 1234, pulsesLanded: 3 }));
  rec = applyDelta(rec, commitPatch('u1', { rowsCommitted: 1234, batchCommitted: true }));
  t = projectImportTelemetry(rec);
  assert.deepEqual(t.rows, { committed: 1234, total: 1234 });
  assert.deepEqual(t.perUnit, [{ sheetName: 'Ventas', expectedRows: 1234, committed: true }]);
});

test('D16 rollback zeroes the unit snapshot (panel never shows rows the table does not hold)', () => {
  let rec: ImportSessionTelemetryRecord | null = null;
  rec = applyDelta(rec, commitPatch('u1', { sheetName: 'A', expectedRows: 900, pulsesTotal: 2, rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false }));
  rec = applyDelta(rec, commitPatch('u1', { rowsCommitted: 500, pulsesLanded: 1 }));
  rec = applyDelta(rec, commitPatch('u1', { rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false }));   // rollback
  const t = projectImportTelemetry(rec);
  assert.deepEqual(t.rows, { committed: 0, total: 900 });
  assert.deepEqual(t.pulses, { committed: 0, total: 2 });
  assert.equal(t.perUnit[0].committed, false);
});

test('view projection: sheetName sort, isOpen, retryable, progressTick', () => {
  let rec: ImportSessionTelemetryRecord | null = null;
  for (const batch of [
    [unitState('u2', 'failed_interpretation', { failureClass: 'profiling_error', seq: 1 }, { sheetName: 'Zeta' })],
    [unitState('u1', 'bound', { seq: 5 }, { sheetName: 'Alpha', classification: 'entity', confidence: 0.9 })],
  ]) {
    for (const d of buildDeltasFromSignals(batch)) rec = applyDelta(rec, d);
  }
  const view = projectSessionStateView(rec, TENANT, SESSION);
  assert.deepEqual(view.units.map(u => u.sheetName), ['Alpha', 'Zeta']);   // reducer's localeCompare sort
  assert.equal(view.units[0].state, 'bound');
  assert.equal(view.units[0].classification, 'entity');
  assert.equal(view.units[1].retryable, true);
  assert.equal(view.units[1].failureClass, 'profiling_error');
  assert.equal(view.isOpen, true);                                          // failed unit keeps the session open
  assert.equal(view.progressTick, 2);
  // Null record → empty view, closed (mirrors reduceSessionState on zero rows)
  const empty = projectSessionStateView(null, TENANT, SESSION);
  assert.deepEqual(empty.units, []);
  assert.equal(empty.isOpen, false);
  assert.equal(empty.progressTick, 0);
});

test('flattened key separator is structural: unitIds with :: round-trip intact', () => {
  const unitId = 'datos-cadena.xlsx::Ventas_Transaccional::3';
  const flat = { [unitFieldKey(unitId, 'state')]: 'bound' };
  const byUnit = unflattenUnitStates(flat);
  assert.equal(byUnit.get(unitId)!.state, 'bound');
  assert.equal(UNIT_FIELD_SEP, '\u001f');
});
