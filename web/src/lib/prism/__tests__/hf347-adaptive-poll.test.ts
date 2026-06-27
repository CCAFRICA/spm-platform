import { test } from 'node:test';
import assert from 'node:assert';
import { isTerminalState, FILE_OBJECT_STATES } from '@/lib/prism/types';
import type { FileObjectState } from '@/lib/prism/types';

// HF-347 — the adaptive spine poller runs an interval ONLY while at least one file is
// still moving through the membrane. This is the exact predicate useFileObjects gates on:
//   inFlight = files.some(f => !isTerminalState(f.state))
const inFlight = (states: FileObjectState[]) => states.some((s) => !isTerminalState(s));

test('HF-347 (terminal-stop): promoted + infected_held are terminal; everything else is live', () => {
  assert.equal(isTerminalState('promoted'), true);
  assert.equal(isTerminalState('infected_held'), true);
  for (const s of ['received', 'quarantined', 'scanning', 'clean'] as FileObjectState[]) {
    assert.equal(isTerminalState(s), false, `${s} is still moving → must keep the spine live`);
  }
});

test('HF-347 (need-based): the interval runs ONLY when ≥1 file is non-terminal', () => {
  assert.equal(inFlight([]), false, 'empty portal → no poll (zero requests)');
  assert.equal(inFlight(['promoted']), false, 'all cleared → polling stops');
  assert.equal(inFlight(['promoted', 'infected_held']), false, 'all terminal → polling stops');
  assert.equal(inFlight(['scanning']), true, 'scanning → poll');
  assert.equal(inFlight(['received']), true, 'received → poll');
  assert.equal(inFlight(['clean']), true, 'clean is transient (→ promoted) → still poll');
  assert.equal(inFlight(['promoted', 'scanning']), true, 'one in flight → poll');
});

test('HF-347: every lifecycle state is classified (no silent gap that would keep polling forever)', () => {
  for (const s of FILE_OBJECT_STATES) {
    assert.equal(typeof isTerminalState(s), 'boolean', `${s} must be classified`);
  }
});
