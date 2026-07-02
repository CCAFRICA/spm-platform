/**
 * HF-372 Phase D — the job-state machine's transition guard.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { statusMayAdvance } from '../job-status';

test('rank ladder: forward transitions advance, backward transitions are no-ops', () => {
  assert.equal(statusMayAdvance('pending', 'classifying'), true);
  assert.equal(statusMayAdvance('classifying', 'classified'), true);
  assert.equal(statusMayAdvance('classified', 'committing'), true);
  assert.equal(statusMayAdvance('committing', 'committed'), true);
  assert.equal(statusMayAdvance('committed', 'finalized'), true);
  // hand-off path: committing → finalized directly (rows became durable on the DB worker)
  assert.equal(statusMayAdvance('committing', 'finalized'), true);
  // late/duplicate writers can never downgrade
  assert.equal(statusMayAdvance('finalized', 'committing'), false);
  assert.equal(statusMayAdvance('committed', 'committing'), false);
  assert.equal(statusMayAdvance('committed', 'classified'), false);
});

test('failed never overwrites durable success; anything else may fail', () => {
  assert.equal(statusMayAdvance('committed', 'failed'), false);
  assert.equal(statusMayAdvance('finalized', 'failed'), false);
  assert.equal(statusMayAdvance('committing', 'failed'), true);
  assert.equal(statusMayAdvance('classifying', 'failed'), true);
  assert.equal(statusMayAdvance('pending', 'failed'), true);
});

test('unknown current status is treated as lowest rank (any real status advances)', () => {
  assert.equal(statusMayAdvance(null, 'committing'), true);
  assert.equal(statusMayAdvance(undefined, 'finalized'), true);
});
