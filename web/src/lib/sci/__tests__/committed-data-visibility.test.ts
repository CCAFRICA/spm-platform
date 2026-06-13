// OB-203 D16.1 — visibility-gate predicate invariants. The DB-touching helpers (hiddenBatchIdsForTenant,
// reconcileStaleBatches) are integration-shaped; here we lock the pure, load-bearing predicate:
//   1. empty hidden set → NO-OP (the query object is returned untouched — Phase-7 safety by construction);
//   2. non-empty → a NULL-TOLERANT predicate (keeps NULL-batch + completed rows, hides the rest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommittedDataVisibility } from '../committed-data-visibility';

// Minimal query stub that records .or() filters and supports chaining.
function makeQuery() {
  const calls: string[] = [];
  const q = {
    orCalls: calls,
    or(filter: string) { calls.push(filter); return q; },
  };
  return q;
}

test('empty hidden set is a NO-OP — same object, no filter added', () => {
  const q = makeQuery();
  const out = applyCommittedDataVisibility(q, []);
  assert.equal(out, q, 'must return the identical query builder');
  assert.equal(q.orCalls.length, 0, 'must add no filter');
});

test('non-empty hidden set adds a NULL-tolerant exclusion predicate', () => {
  const q = makeQuery();
  applyCommittedDataVisibility(q, ['b1', 'b2']);
  assert.equal(q.orCalls.length, 1);
  const f = q.orCalls[0];
  // keeps NULL-batch rows AND completed rows; hides only the listed (non-completed) batches.
  assert.ok(f.includes('import_batch_id.is.null'), 'NULL-batch rows must remain live (legacy / proof tenants)');
  assert.ok(f.includes('import_batch_id.not.in.(b1,b2)'), 'listed non-completed batches must be excluded');
});

test('single hidden id is formatted as a one-element in-list', () => {
  const q = makeQuery();
  applyCommittedDataVisibility(q, ['only']);
  assert.equal(q.orCalls[0], 'import_batch_id.is.null,import_batch_id.not.in.(only)');
});
