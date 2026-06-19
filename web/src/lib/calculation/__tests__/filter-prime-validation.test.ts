/**
 * OB-222 — validatePrimeTree must ACCEPT the filter->aggregate DAGs the grammar prompt (SC-07/SC-08)
 * now instructs the LLM to emit. Runner: node --test --import tsx.
 *
 * Regression guard for the OB-222 validator fix: a `filter` prime carries its operator at
 * predicate.operator (PrimePredicate), NOT at top-level obj.op. The op-discriminator check previously
 * read obj.op for filter -> every well-formed filter was a critical op_unknown violation ->
 * ai-plan-interpreter would throw on exactly the category-differentiation/conditional-count DAGs the
 * Phase-2 prompt teaches. This file proves the validator now reads predicate.operator, accepts valid
 * filters, AND actually validates the operator (rejects an unknown one). Top-level-op primes
 * (aggregate/arithmetic) must be unaffected.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validatePrimeTree } from '@/lib/calculation/prime-grammar';

// SC-07: category-differentiated rates — add(multiply(filter->aggregate(sum), rate), ...)
const SC07 = {
  prime: 'arithmetic', op: 'add',
  inputs: [
    { prime: 'arithmetic', op: 'multiply', inputs: [
      { prime: 'filter', predicate: { field: 'product_type', operator: 'eq', value: 'warranty' },
        downstream: { prime: 'aggregate', op: 'sum', field: 'amount' } },
      { prime: 'constant', value: 0.08 },
    ]},
    { prime: 'arithmetic', op: 'multiply', inputs: [
      { prime: 'filter', predicate: { field: 'product_type', operator: 'eq', value: 'accessory' },
        downstream: { prime: 'aggregate', op: 'sum', field: 'amount' } },
      { prime: 'constant', value: 0.03 },
    ]},
  ],
};

// SC-08: conditional count — multiply(filter->aggregate(count, "*"), perUnit)
const SC08 = {
  prime: 'arithmetic', op: 'multiply',
  inputs: [
    { prime: 'filter', predicate: { field: 'status', operator: 'eq', value: 'approved' },
      downstream: { prime: 'aggregate', op: 'count', field: '*' } },
    { prime: 'constant', value: 25 },
  ],
};

test('SC-07 (category-differentiated filter->aggregate) PASSES validatePrimeTree', () => {
  const r = validatePrimeTree(SC07);
  assert.equal(r.valid, true, JSON.stringify(r.violations));
  assert.equal(r.violations.filter(v => v.severity === 'critical').length, 0);
});

test('SC-08 (conditional count filter->aggregate(count)) PASSES validatePrimeTree', () => {
  const r = validatePrimeTree(SC08);
  assert.equal(r.valid, true, JSON.stringify(r.violations));
});

test('filter operator IS validated: an unknown predicate.operator is a critical op_unknown', () => {
  const bad = { prime: 'filter', predicate: { field: 'x', operator: 'startswith', value: 'a' },
    downstream: { prime: 'aggregate', op: 'sum', field: 'amount' } };
  const r = validatePrimeTree(bad);
  assert.equal(r.valid, false);
  assert.ok(r.violations.some(v => v.check === 'op_unknown' && v.severity === 'critical'));
});

test('filter with NO predicate is rejected (op_unknown)', () => {
  const bad = { prime: 'filter', downstream: { prime: 'aggregate', op: 'sum', field: 'amount' } };
  const r = validatePrimeTree(bad);
  assert.equal(r.valid, false);
  assert.ok(r.violations.some(v => v.check === 'op_unknown'));
});

test('each filter operator in the grammar set validates', () => {
  for (const operator of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']) {
    const dag = { prime: 'filter', predicate: { field: 'f', operator, value: 1 },
      downstream: { prime: 'aggregate', op: 'sum', field: 'amount' } };
    const r = validatePrimeTree(dag);
    assert.equal(r.valid, true, `operator ${operator}: ${JSON.stringify(r.violations)}`);
  }
});

test('REGRESSION: top-level-op primes still read obj.op (aggregate, arithmetic unaffected)', () => {
  assert.equal(validatePrimeTree({ prime: 'aggregate', op: 'sum', field: 'amount' }).valid, true);
  assert.equal(validatePrimeTree({ prime: 'aggregate', op: 'count', field: '*' }).valid, true);
  // aggregate with a bad op still rejected via obj.op
  assert.equal(validatePrimeTree({ prime: 'aggregate', op: 'median', field: 'x' }).valid, false);
  assert.equal(validatePrimeTree({ prime: 'arithmetic', op: 'multiply',
    inputs: [{ prime: 'constant', value: 1 }, { prime: 'constant', value: 2 }] }).valid, true);
});
