/**
 * HF-286 — poller-stop predicate. Runner: node --test --import tsx.
 * Pure tests against allUnitsSettled / SETTLED_STATES (the terminal-stop guard
 * both session-state pollers consume). Proves: settled-set membership stops,
 * in-flight keeps polling, empty keeps polling, and failed_interpretation IS
 * settled (the load-bearing case !isOpen would have missed).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  allUnitsSettled,
  SETTLED_STATES,
  type UnitComprehensionState,
} from '../comprehension-state-service';

const u = (state: UnitComprehensionState) => ({ state });

test('SETTLED_STATES is exactly {bound, resolved, failed_interpretation}', () => {
  assert.equal(SETTLED_STATES.size, 3);
  assert.ok(SETTLED_STATES.has('bound'));
  assert.ok(SETTLED_STATES.has('resolved'));
  assert.ok(SETTLED_STATES.has('failed_interpretation'));
});

test('every in-flight (non-settled) state is NOT settled → keep polling', () => {
  for (const s of ['persisted', 'profiled', 'recognized', 'comprehended', 'classified'] as UnitComprehensionState[]) {
    assert.equal(SETTLED_STATES.has(s), false, `${s} must be in-flight`);
    assert.equal(allUnitsSettled([u(s)]), false, `single ${s} must keep polling`);
  }
});

test('all-settled set → STOP (true)', () => {
  assert.equal(allUnitsSettled([u('bound'), u('resolved'), u('bound')]), true);
});

test('failed_interpretation alone is settled → STOP (the !isOpen blind spot)', () => {
  // isOpen would be TRUE here (failed_interpretation !== bound/resolved), so a
  // !isOpen stop would poll forever. The settled-set predicate stops correctly.
  assert.equal(allUnitsSettled([u('failed_interpretation')]), true);
  assert.equal(allUnitsSettled([u('bound'), u('failed_interpretation'), u('resolved')]), true);
});

test('ANY in-flight unit among settled ones → keep polling (false)', () => {
  assert.equal(allUnitsSettled([u('bound'), u('comprehended'), u('resolved')]), false);
  assert.equal(allUnitsSettled([u('resolved'), u('classified')]), false);
});

test('empty / not-yet-populated view is NOT settled → keep polling', () => {
  // guards against stopping on the initial empty read before any unit is profiled
  assert.equal(allUnitsSettled([]), false);
});
