/**
 * OB-222 — Filtered aggregation via the prime-DAG evaluator. Runner: node --test --import tsx.
 *
 * Proves the per-row categorical resolution the directive targets, exercised through the engine's
 * ACTUAL mechanism: the `filter` prime narrows context.activeRows by a {field,operator,value}
 * predicate and the `aggregate` prime (sum/count) reduces the narrowed rows. This composition —
 * already present in evaluate() and reachable in production (route.ts populates activeRows with the
 * entity's raw rows) — is the non-duplicative substrate for category-differentiated rates (Pattern 1)
 * and conditional counts (Pattern 2). See OB-222 ADR: the directive's hypothetical {reference,filter}
 * shape would have been a second resolution path (HALT-DUP); these tests verify the existing primes.
 *
 * Korean Test: the predicate carries STRUCTURAL params (field/operator/value) — the engine never
 * knows what the category means. SR-38: the partition property (Σ of per-category filtered sums ===
 * unfiltered total) is a set-theoretic identity, proven by construction below.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluate } from '@/lib/calculation/intent-executor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

// ── prime constructors (cast: AI intents widen value/predicate types) ──
const AGG = (op: string, field: string): PrimeNode =>
  ({ prime: 'aggregate', op, field } as unknown as PrimeNode);
const FILT = (field: string, operator: string, value: unknown, downstream: PrimeNode): PrimeNode =>
  ({ prime: 'filter', predicate: { field, operator, value }, downstream } as unknown as PrimeNode);
const K = (v: number): PrimeNode => ({ prime: 'constant', value: v } as unknown as PrimeNode);
const MUL = (a: PrimeNode, b: PrimeNode): PrimeNode =>
  ({ prime: 'arithmetic', op: 'multiply', inputs: [a, b] } as unknown as PrimeNode);
const ADD = (a: PrimeNode, b: PrimeNode): PrimeNode =>
  ({ prime: 'arithmetic', op: 'add', inputs: [a, b] } as unknown as PrimeNode);

const ctxRows = (rows: Record<string, unknown>[]): EvalContext => ({
  entity: { metadata: {} }, activeRows: rows, allEntityRows: [], metrics: {}, priorPeriodRows: [],
});
const ev = (n: PrimeNode, rows: Record<string, unknown>[]) => evaluate(n, ctxRows(rows)).toNumber();

// One entity's transactions spanning three categories. Total amount = 400.
//   A: 100 + 50  = 150   (2 rows)
//   B: 200 + 20  = 220   (2 rows)
//   C: 30        =  30   (1 row)
const ROWS: Record<string, unknown>[] = [
  { category: 'A', amount: 100 },
  { category: 'A', amount: 50 },
  { category: 'B', amount: 200 },
  { category: 'C', amount: 30 },
  { category: 'B', amount: 20 },
];

// ── Filtered SUM ──
test('filter -> aggregate(sum) yields the filtered sum, NOT the full sum', () => {
  assert.equal(ev(FILT('category', 'eq', 'A', AGG('sum', 'amount')), ROWS), 150);
  assert.equal(ev(FILT('category', 'eq', 'B', AGG('sum', 'amount')), ROWS), 220);
  assert.equal(ev(FILT('category', 'eq', 'C', AGG('sum', 'amount')), ROWS), 30);
});

test('aggregate(sum) with NO filter yields the full sum (unfiltered baseline)', () => {
  assert.equal(ev(AGG('sum', 'amount'), ROWS), 400);
});

test('filter matching ALL rows is byte-identical to the unfiltered sum', () => {
  // category != "ZZZ" matches every row → must equal the full sum exactly.
  assert.equal(ev(FILT('category', 'neq', 'ZZZ', AGG('sum', 'amount')), ROWS), 400);
});

test('filter with zero matches yields 0 (empty active set)', () => {
  assert.equal(ev(FILT('category', 'eq', 'NONE', AGG('sum', 'amount')), ROWS), 0);
});

// ── Filtered COUNT (Pattern 2) ──
test('filter -> aggregate(count) counts qualifying rows', () => {
  assert.equal(ev(FILT('category', 'eq', 'A', AGG('count', 'amount')), ROWS), 2);
  assert.equal(ev(FILT('category', 'eq', 'C', AGG('count', 'amount')), ROWS), 1);
});

test('aggregate(count) with no filter counts all rows', () => {
  assert.equal(ev(AGG('count', 'amount'), ROWS), 5);
});

test('conditional count pattern: filter(condition) -> count, times a per-unit amount', () => {
  // "$25 per qualifying transaction where category == B" → count(B)=2 × 25 = 50
  assert.equal(ev(MUL(FILT('category', 'eq', 'B', AGG('count', 'amount')), K(25)), ROWS), 50);
});

// ── Category-differentiated rates (Pattern 1): nested per-category contributions ──
test('category-differentiated rates: add(multiply(filtered_sum_A, rateA), multiply(filtered_sum_B, rateB))', () => {
  // 10% on category A (150) + 5% on category B (220) = 15 + 11 = 26
  const dag = ADD(
    MUL(FILT('category', 'eq', 'A', AGG('sum', 'amount')), K(0.10)),
    MUL(FILT('category', 'eq', 'B', AGG('sum', 'amount')), K(0.05)),
  );
  assert.equal(ev(dag, ROWS), 26);
});

// ── Partition property (SR-38) ──
test('PARTITION PROPERTY (SR-38): sum of per-category filtered sums === unfiltered total', () => {
  const distinct = Array.from(new Set(ROWS.map(r => r.category as string)));
  const perCategory = distinct.map(v => ev(FILT('category', 'eq', v, AGG('sum', 'amount')), ROWS));
  const partitionTotal = perCategory.reduce((a, b) => a + b, 0);
  const unfiltered = ev(AGG('sum', 'amount'), ROWS);
  assert.equal(partitionTotal, unfiltered);
  assert.equal(partitionTotal, 400);
});

test('PARTITION PROPERTY for count: sum of per-category counts === total row count', () => {
  const distinct = Array.from(new Set(ROWS.map(r => r.category as string)));
  const perCategory = distinct.map(v => ev(FILT('category', 'eq', v, AGG('count', 'amount')), ROWS));
  assert.equal(perCategory.reduce((a, b) => a + b, 0), ROWS.length);
});

// ── Type-aware predicate matching (OB-220 dependency: string values must compare correctly) ──
test('string filter value matches string row value; numeric filter value matches numeric row value', () => {
  const mixed: Record<string, unknown>[] = [
    { tier: 1, region: 'North', amount: 10 },
    { tier: 2, region: 'North', amount: 20 },
    { tier: 1, region: 'South', amount: 40 },
  ];
  // numeric predicate
  assert.equal(ev(FILT('tier', 'eq', 1, AGG('sum', 'amount')), mixed), 50); // rows 1 & 3
  // string predicate
  assert.equal(ev(FILT('region', 'eq', 'North', AGG('sum', 'amount')), mixed), 30); // rows 1 & 2
});

test('numeric column with mixed string fields: filtered sum parses only matching numeric rows', () => {
  const mixed: Record<string, unknown>[] = [
    { channel: 'web', amount: '1,000' },   // string-with-commas numeric (aggregate parseFloat path)
    { channel: 'store', amount: 500 },
    { channel: 'web', amount: 250 },
  ];
  // aggregate(sum) parses "1,000"? — aggregate uses parseFloat which stops at the comma → 1.
  // This test pins the CURRENT aggregate-prime parsing behavior so a future change is caught.
  assert.equal(ev(FILT('channel', 'eq', 'web', AGG('sum', 'amount')), mixed), 251); // parseFloat("1,000")=1 + 250
});
