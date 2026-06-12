/**
 * OB-203 Phase 5 — resolution action → outcome signals. Runner: node --test --import tsx.
 * EPG-5.1: every action emits at least one signal. EPG-5.2: an action's entire durable effect IS
 * the (states + signals) it returns — there is no other mutation path.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveUnitSignals } from '../resolve-unit-signals';
import { SIGNAL } from '../comprehension-signal-vocabulary';

const base = { tenantId: 't', importSessionId: 's', unitId: 'f.xlsx::Datos::1', sheetName: 'Datos' };

test('EPG-5.1: assign emits resolved state + resolution + correction interaction', () => {
  const { states, signals } = resolveUnitSignals({ ...base, action: 'assign', classification: 'transaction' });
  // durable state: resolved with human provenance
  assert.equal(states.length, 1);
  assert.equal(states[0].state, 'resolved');
  assert.equal(states[0].classification, 'transaction');
  assert.equal(states[0].humanCorrectionFrom, 'failed_interpretation');
  // outcome signals: resolution (user_corrected) + correction interaction
  const types = signals.map(s => s.signalType);
  assert.ok(types.includes(SIGNAL.resolution));
  assert.ok(types.includes(SIGNAL.interactionImport));
  const res = signals.find(s => s.signalType === SIGNAL.resolution)!;
  assert.equal(res.source, 'user_corrected');
  assert.equal((res.signalValue as Record<string, unknown>).to, 'classified');
  const inter = signals.find(s => s.signalType === SIGNAL.interactionImport)!;
  assert.equal((inter.signalValue as Record<string, unknown>).action, 'correction');
});

test('EPG-5.1: exclude emits an action_click interaction (no silent drop)', () => {
  const { states, signals } = resolveUnitSignals({ ...base, action: 'exclude' });
  assert.equal(states.length, 0);                 // exclude changes no comprehension state
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signalType, SIGNAL.interactionImport);
  assert.equal((signals[0].signalValue as Record<string, unknown>).action, 'action_click');
  assert.equal((signals[0].signalValue as Record<string, unknown>).control, 'exclude');
});

test('EPG-5.1: every action produces at least one signal', () => {
  for (const action of ['assign', 'exclude'] as const) {
    const { states, signals } = resolveUnitSignals({ ...base, action, classification: 'entity' });
    assert.ok(states.length + signals.length >= 1, `${action} must emit ≥1 signal`);
  }
});

test('EPG-5.2: every emitted signal/state is tenant-scoped to the caller', () => {
  const { states, signals } = resolveUnitSignals({ ...base, action: 'assign', classification: 'reference' });
  for (const s of states) assert.equal(s.tenantId, 't');
  for (const s of signals) { assert.equal(s.tenantId, 't'); assert.equal(s.scope, 'tenant'); }
});
