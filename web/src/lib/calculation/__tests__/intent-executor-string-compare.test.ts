/**
 * OB-220 — prime-DAG evaluator string-comparison fix. Runner: node --test --import tsx.
 *
 * Proves the compare/constant nodes handle categorical (string) operands without the
 * [DecimalError] Invalid argument: ALI crash, do string equality/inequality, reject string
 * ordering gracefully, and leave the numeric path byte-identical.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluate } from '@/lib/calculation/intent-executor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

const ctx = (metrics: Record<string, number> = {}): EvalContext => ({
  entity: { metadata: {} }, activeRows: [], allEntityRows: [], metrics, priorPeriodRows: [],
});
const K = (v: unknown): PrimeNode => ({ prime: 'constant', value: v } as unknown as PrimeNode);
const REF = (f: string): PrimeNode => ({ prime: 'reference', field: f } as unknown as PrimeNode);
const CMP = (l: PrimeNode, r: PrimeNode, op: string): PrimeNode => ({ prime: 'compare', op, inputs: [l, r] } as unknown as PrimeNode);
const COND = (c: PrimeNode, t: PrimeNode, e: PrimeNode): PrimeNode => ({ prime: 'conditional', condition: c, then: t, else: e } as unknown as PrimeNode);
const ev = (n: PrimeNode, c = ctx()) => evaluate(n, c).toNumber();

test('no crash: evaluating a categorical constant degrades to 0 (was DecimalError)', () => {
  assert.doesNotThrow(() => evaluate(K('ALI'), ctx()));
  assert.equal(ev(K('ALI')), 0);
});

test('no crash: compare(reference, categorical constant) — the production crash site', () => {
  assert.doesNotThrow(() => evaluate(CMP(REF('Categoria'), K('ALI'), 'eq'), ctx({})));
  assert.equal(ev(CMP(REF('Categoria'), K('ALI'), 'eq')), 0); // no Categoria metric → no match
});

test('string equality / inequality', () => {
  assert.equal(ev(CMP(K('Alimentos'), K('Alimentos'), 'eq')), 1);
  assert.equal(ev(CMP(K('Alimentos'), K('Bebidas'), 'eq')), 0);
  assert.equal(ev(CMP(K('Alimentos'), K('Bebidas'), 'neq')), 1);
});

test('mixed string/number → string comparison, no match', () => {
  assert.equal(ev(CMP(K('Alimentos'), K(42), 'eq')), 0);
});

test('string ordering operator → 0 (not crash, not true)', () => {
  assert.equal(ev(CMP(K('Alimentos'), K('Bebidas'), 'gt')), 0);
  assert.equal(ev(CMP(K('Alimentos'), K('Bebidas'), 'lte')), 0);
});

test('numeric path preserved (byte-identical behaviour for numbers)', () => {
  assert.equal(ev(CMP(K(100), K(80), 'gt')), 1);
  assert.equal(ev(CMP(K(80), K(100), 'gt')), 0);
  assert.equal(ev(CMP(K(0.7), K(0.5), 'gt')), 1);
  assert.equal(ev(CMP(K(0.5), K(0.7), 'gte')), 0);
  assert.equal(ev(CMP(K(100), K(100), 'eq')), 1);
  assert.equal(ev(CMP(REF('x'), K(80), 'gte'), ctx({ x: 90 })), 1);
});

test('conditional + compare + constant chain over a category → rate selected', () => {
  // conditional(Categoria-constant == "ALI" ? 0.025 : 0) — proves the full chain that crashed.
  assert.equal(ev(COND(CMP(K('ALI'), K('ALI'), 'eq'), K(0.025), K(0))), 0.025);
  assert.equal(ev(COND(CMP(K('ALI'), K('BEB'), 'eq'), K(0.025), K(0))), 0);
});
