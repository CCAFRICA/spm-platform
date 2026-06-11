/**
 * OB-203 Phase 3 — Durable Comprehension State (R2/DI-1). Runner: node --test --import tsx.
 * Pure tests against the DB-free core: isForwardTransition (monotonic spine),
 * reduceSessionState (resumable rebuild), buildUnitStateSignalInput (canonical shape).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isForwardTransition,
  buildUnitStateSignalInput,
  reduceSessionState,
  UNIT_STATE_SIGNAL_TYPE,
  type RawStateSignalRow,
  type UnitComprehensionState,
} from '../comprehension-state-service';

// helper: build a raw row as the reducer sees it
let clock = 0;
const row = (
  unitId: string,
  state: UnitComprehensionState,
  extra: Partial<RawStateSignalRow> & { sheetName?: string; source?: string; tier?: number; classification?: string } = {},
): RawStateSignalRow => ({
  signal_value: { unitId, state, tier: extra.tier ?? null },
  context: { importSessionId: 'sess-1', phase: '3' },
  sheet_name: extra.sheetName ?? unitId,
  source_file_name: 'f.xlsx',
  classification: extra.classification ?? null,
  decision_source: null,
  confidence: null,
  source: extra.source ?? 'sci_agent',
  // monotonic, lexicographically-sortable timestamps
  created_at: `2026-06-11T00:00:${String(clock++).padStart(2, '0')}.000Z`,
});

// ── monotonicity (emission invariant) ──
test('isForwardTransition: spine never regresses; failed & resolved are special', () => {
  assert.equal(isForwardTransition(null, 'persisted'), true);            // first
  assert.equal(isForwardTransition('persisted', 'profiled'), true);      // forward
  assert.equal(isForwardTransition('comprehended', 'profiled'), false);  // regression blocked
  assert.equal(isForwardTransition('classified', 'classified'), true);   // idempotent ok
  assert.equal(isForwardTransition('recognized', 'failed_interpretation'), true); // any -> failed
  assert.equal(isForwardTransition('failed_interpretation', 'comprehended'), true); // retry resumes spine
  assert.equal(isForwardTransition('failed_interpretation', 'failed_interpretation'), true); // retry re-fails
  assert.equal(isForwardTransition('classified', 'resolved'), true);     // any -> resolved
  assert.equal(isForwardTransition('resolved', 'bound'), false);         // resolved is terminal
});

// ── canonical signal shape ──
test('buildUnitStateSignalInput: dedicated signal_type, session in context, source mapping', () => {
  const sci = buildUnitStateSignalInput({
    tenantId: 't1', importSessionId: 'sess-1', unitId: 'f.xlsx::Sheet1::0',
    sheetName: 'Sheet1', sourceFileName: 'f.xlsx', state: 'comprehended', tier: 3, novelCount: 2,
  });
  assert.equal(sci.signalType, UNIT_STATE_SIGNAL_TYPE);
  assert.equal((sci.context as any).importSessionId, 'sess-1');        // session identity in context, not a new column
  assert.equal((sci.signalValue as any).unitId, 'f.xlsx::Sheet1::0');
  assert.equal((sci.signalValue as any).state, 'comprehended');
  assert.equal(sci.source, 'sci_agent');
  assert.equal(sci.scope, 'tenant');

  const human = buildUnitStateSignalInput({
    tenantId: 't1', importSessionId: 'sess-1', unitId: 'u', sheetName: 'S', sourceFileName: 'f',
    state: 'resolved', classification: 'transaction', humanCorrectionFrom: 'target',
  });
  assert.equal(human.source, 'user_corrected');                        // resolution provenance
  assert.equal(human.humanCorrectionFrom, 'target');
});

// ── session resume: rebuild from signals alone ──
test('reduceSessionState: reconstructs per-unit current state from the signal trail', () => {
  clock = 0;
  const rows = [
    row('A', 'persisted'), row('B', 'persisted'),
    row('A', 'profiled'), row('A', 'recognized', { tier: 1 }),
    row('B', 'profiled'),
    row('A', 'comprehended'), row('A', 'classified', { classification: 'transaction' }),
  ];
  const view = reduceSessionState('t1', 'sess-1', rows);
  const A = view.units.find(u => u.unitId === 'A')!;
  const B = view.units.find(u => u.unitId === 'B')!;
  assert.equal(A.state, 'classified');        // latest spine state
  assert.equal(A.classification, 'transaction');
  assert.equal(B.state, 'profiled');          // INDEPENDENT — B did not advance with A
  assert.equal(view.isOpen, true);            // neither bound nor resolved
});

// ── cross-unit independence: one unit fails, others proceed ──
test('reduceSessionState: a failed unit is isolated; siblings reach bound', () => {
  clock = 0;
  const rows = [
    row('A', 'persisted'), row('B', 'persisted'), row('C', 'persisted'),
    row('A', 'bound', { classification: 'entity' }),
    row('B', 'failed_interpretation', { ...{}, }),
    row('C', 'bound', { classification: 'reference' }),
  ];
  const view = reduceSessionState('t1', 'sess-1', rows);
  assert.equal(view.units.find(u => u.unitId === 'A')!.state, 'bound');
  assert.equal(view.units.find(u => u.unitId === 'C')!.state, 'bound');
  const B = view.units.find(u => u.unitId === 'B')!;
  assert.equal(B.state, 'failed_interpretation');
  assert.equal(B.retryable, true);            // the UI retry affordance keys on this
  assert.equal(view.isOpen, true);            // B keeps the session open
});

// ── retry-without-reimport: a later success supersedes the failure ──
test('reduceSessionState: retry success supersedes prior failed_interpretation', () => {
  clock = 0;
  const rows = [
    row('A', 'persisted'),
    row('A', 'failed_interpretation'),
    // ... retry re-runs the SAME decomposed dispatch; emits later success states
    row('A', 'comprehended'),
    row('A', 'bound', { classification: 'transaction' }),
  ];
  const A = reduceSessionState('t1', 'sess-1', rows).units[0];
  assert.equal(A.state, 'bound');
  assert.equal(A.retryable, false);
});

// ── resolution: terminal & human-provenanced ──
test('reduceSessionState: resolved is terminal and carries human provenance', () => {
  clock = 0;
  const rows = [
    row('A', 'failed_interpretation'),
    row('A', 'resolved', { classification: 'transaction', source: 'user_corrected' }),
  ];
  const view = reduceSessionState('t1', 'sess-1', rows);
  const A = view.units[0];
  assert.equal(A.state, 'resolved');
  assert.equal(A.retryable, false);
  assert.equal(view.isOpen, false);           // resolved closes the unit
  assert.equal(A.history.length, 2);          // full trail preserved
});
