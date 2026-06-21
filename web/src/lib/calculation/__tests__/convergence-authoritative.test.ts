/**
 * HF-325 — Convergence-authoritative field resolution. Runner: node --test --import tsx.
 *
 * Decision 111: when convergence bindings resolved the entity's metrics, a bound field's value
 * (with the convergence reduction already applied) lives in `metrics[field]`. The `aggregate` prime
 * reads that authoritative scalar REGARDLESS of node type (count/sum/…), instead of re-deriving from
 * rows. The bypass is gated on convergence-binding PRESENCE (`field in metrics` + convergenceAuthoritative),
 * NOT node type, and is suppressed beneath a filter/scope/prior_period narrowing (activeRowsScoped).
 *
 * The proof case is BCL Productos Cruzados: convergence binds the cross-sell field with reduction=sum,
 * so metrics[field] = 7. One variant's DAG emitted `metric` (correct: 7×25). The other emitted
 * `aggregate/count` (wrong: counted 1 row → 1×18). After HF-325 both read the convergence scalar.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluate } from '@/lib/calculation/intent-executor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

const AGG = (op: string, field: string): PrimeNode => ({ prime: 'aggregate', op, field } as unknown as PrimeNode);
const REF = (field: string): PrimeNode => ({ prime: 'reference', field } as unknown as PrimeNode);
const K = (v: number): PrimeNode => ({ prime: 'constant', value: v } as unknown as PrimeNode);
const MUL = (a: PrimeNode, b: PrimeNode): PrimeNode => ({ prime: 'arithmetic', op: 'multiply', inputs: [a, b] } as unknown as PrimeNode);
const FILT = (field: string, operator: string, value: unknown, downstream: PrimeNode): PrimeNode =>
  ({ prime: 'filter', predicate: { field, operator, value }, downstream } as unknown as PrimeNode);

const ctx = (o: { rows?: Record<string, unknown>[]; metrics?: Record<string, number>; convergenceAuthoritative?: boolean }): EvalContext => ({
  entity: { metadata: {} }, activeRows: o.rows ?? [], allEntityRows: [], metrics: o.metrics ?? {},
  priorPeriodRows: [], convergenceAuthoritative: o.convergenceAuthoritative,
});
const ev = (n: PrimeNode, c: EvalContext) => evaluate(n, c).toNumber();

// One transaction row whose cross-sell quantity = 7. Convergence (reduction=sum) → metrics = 7.
const ONE_ROW = [{ Cantidad_Productos_Cruzados: 7 }];
const BOUND = { cross_sell_products: 7 };

// ── THE DEFECT FIX: aggregate/count on a convergence-bound field reads the scalar, not the row count ──
test('BCL c2 (Ejecutivo): aggregate/count reads convergence scalar — 7×18=126, not 1×18=18', () => {
  const dag = MUL(AGG('count', 'cross_sell_products'), K(18));
  assert.equal(ev(dag, ctx({ rows: ONE_ROW, metrics: BOUND, convergenceAuthoritative: true })), 126);
});

test('BCL c2 (Senior): metric path is unchanged — 7×25=175', () => {
  const dag = MUL(REF('cross_sell_products'), K(25));
  assert.equal(ev(dag, ctx({ rows: ONE_ROW, metrics: BOUND, convergenceAuthoritative: true })), 175);
});

test('aggregate/count and metric now agree for the same bound field (one path, convergence authoritative)', () => {
  const c = ctx({ rows: ONE_ROW, metrics: BOUND, convergenceAuthoritative: true });
  assert.equal(ev(AGG('count', 'cross_sell_products'), c), ev(REF('cross_sell_products'), c));
});

test('aggregate/sum on a bound field also reads the convergence scalar (no re-sum)', () => {
  // multiple rows whose raw sum (21) differs from the convergence-resolved scalar (7) — proves the
  // engine reads the scalar, not the rows.
  const rows = [{ q: 9 }, { q: 5 }, { q: 7 }];
  assert.equal(ev(AGG('sum', 'cross_sell_products'), ctx({ rows, metrics: BOUND, convergenceAuthoritative: true })), 7);
});

// ── GATE SCOPE: non-convergence + unbound + filtered cases retain the row-iterating behavior ──
test('non-convergence path (convergenceAuthoritative unset) still counts rows — sheet-matching unchanged (HALT-4)', () => {
  const rows = [{}, {}, {}];
  assert.equal(ev(AGG('count', 'cross_sell_products'), ctx({ rows, metrics: BOUND /* but no flag */ })), 3);
});

test('convergence path but field NOT bound (absent from metrics) still counts rows', () => {
  const rows = [{}, {}, {}, {}];
  assert.equal(ev(AGG('count', 'unbound_field'), ctx({ rows, metrics: BOUND, convergenceAuthoritative: true })), 4);
});

test('filtered aggregate re-derives from the narrowed rows even under convergence (activeRowsScoped guard)', () => {
  // filter narrows to category A; the inner aggregate must sum the FILTERED rows (150), NOT the
  // convergence scalar — otherwise filtered_aggregate (OB-225) would break.
  const rows = [{ category: 'A', amount: 100 }, { category: 'A', amount: 50 }, { category: 'B', amount: 200 }];
  const dag = FILT('category', 'eq', 'A', AGG('sum', 'amount'));
  assert.equal(ev(dag, ctx({ rows, metrics: { amount: 9999 }, convergenceAuthoritative: true })), 150);
});

test('filtered count re-derives from narrowed rows under convergence (not the bound scalar)', () => {
  const rows = [{ category: 'A' }, { category: 'A' }, { category: 'B' }];
  const dag = FILT('category', 'eq', 'A', AGG('count', 'cross_sell_products'));
  assert.equal(ev(dag, ctx({ rows, metrics: BOUND, convergenceAuthoritative: true })), 2);
});
