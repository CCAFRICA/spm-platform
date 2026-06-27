/**
 * HF-341 (R3) — Construction-vocabulary eradication. Runner: node --test --import tsx.
 *
 * R3 deleted the CompositionalIntent shape layer + constructTree. The LLM now emits the calculationIntent
 * PrimeNode DAG (the engine's computation algebra) DIRECTLY, and validateComponentIntent (the structural
 * verifier) IS the construction layer. These tests prove, with NO shape vocabulary and NO constructTree:
 *   (A) the engine evaluates the eradicated-form DAGs the LLM now emits — the six MIR computations are
 *       just compositions of the algebra (a category rate is a conditional cascade, not a "banded_lookup";
 *       a multiplicative stack is nested arithmetic, not a "composed:multiply" mode);
 *   (B) the R3-1 verifier elevation REJECTS (critical) a DAG that violates the three by-construction
 *       guarantees constructTree used to provide — Decision-127 half-open, HF-279 ratio-band scale,
 *       terminal completeness — so a drift DAG fails loud at import, never silently persisted (C2).
 * The live MIR/BCL reconciliation (PG-1..7) is the architect's SR-44 re-import; these are the in-PR gates.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluate } from '@/lib/calculation/intent-executor';
import { validateComponentIntent } from '@/lib/calculation/prime-validator';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

// ── the algebra, built directly (no shape vocabulary, no constructor) ──
const K = (v: number | string): PrimeNode => ({ prime: 'constant', value: v } as unknown as PrimeNode);
const REF = (field: string): PrimeNode => ({ prime: 'reference', field } as unknown as PrimeNode);
const ARITH = (op: string, a: PrimeNode, b: PrimeNode): PrimeNode => ({ prime: 'arithmetic', op, inputs: [a, b] } as unknown as PrimeNode);
const CMP = (op: string, a: PrimeNode, b: PrimeNode): PrimeNode => ({ prime: 'compare', op, inputs: [a, b] } as unknown as PrimeNode);
const COND = (condition: PrimeNode, then: PrimeNode, els: PrimeNode): PrimeNode => ({ prime: 'conditional', condition, then, else: els } as unknown as PrimeNode);
const AGG = (op: string, field: string): PrimeNode => ({ prime: 'aggregate', op, field } as unknown as PrimeNode);
const FILT = (field: string, operator: string, value: unknown, downstream: PrimeNode): PrimeNode =>
  ({ prime: 'filter', predicate: { field, operator, value }, downstream } as unknown as PrimeNode);

const ctx = (o: { rows?: Record<string, unknown>[]; metrics?: Record<string, unknown> }): EvalContext => ({
  entity: { metadata: {} }, activeRows: o.rows ?? [], allEntityRows: [],
  metrics: (o.metrics ?? {}) as Record<string, number>, priorPeriodRows: [],
});
const ev = (n: PrimeNode, c: EvalContext) => evaluate(n, c).toNumber();

// A category → rate selection is a conditional CASCADE in the algebra (the eradicated form of the R2
// "categorical banded_lookup"). ALI→0.025, BEB→0.020, LIM→0.030, CPE→0.035, no-match→0.
const categoryRate = (field: string): PrimeNode =>
  COND(CMP('eq', REF(field), K('ALI')), K(0.025),
    COND(CMP('eq', REF(field), K('BEB')), K(0.020),
      COND(CMP('eq', REF(field), K('LIM')), K(0.030),
        COND(CMP('eq', REF(field), K('CPE')), K(0.035), K(0)))));

// ════════════════════════════════════════════════════════════════════════════════════════════════
// (A) The engine evaluates the eradicated-form DAGs the LLM now emits directly
// ════════════════════════════════════════════════════════════════════════════════════════════════

test('R3/D1 (PG-3): COUNT of rows where Verificado="Sí" × 150 — filter→aggregate, no shape', () => {
  const rows = [{ Verificado: 'Sí' }, { Verificado: 'No' }, { Verificado: 'Sí' }, { Verificado: 'Sí' }];
  const dag = ARITH('multiply', FILT('Verificado', 'eq', 'Sí', AGG('count', '*')), K(150));
  assert.equal(ev(dag, ctx({ rows })), 450);
});

test('R3/category (PG-1 part): a category→rate cascade maps each key to its rate (no "banded_lookup")', () => {
  assert.equal(ev(categoryRate('Categoria'), ctx({ metrics: { Categoria: 'ALI' } })), 0.025);
  assert.equal(ev(categoryRate('Categoria'), ctx({ metrics: { Categoria: 'LIM' } })), 0.030);
  assert.equal(ev(categoryRate('Categoria'), ctx({ metrics: { Categoria: 'CPE' } })), 0.035);
  assert.equal(ev(categoryRate('Categoria'), ctx({ metrics: { Categoria: 'ZZZ' } })), 0);
});

test('R3/D3a + PG-15 (N-way multiply): Monto × categoryRate × accelerator — nested arithmetic, no "composed:multiply" mode', () => {
  // accelerator = conditional(monto_acum >= 150000 ? 1.25 : 1)
  const accel = COND(CMP('gte', REF('monto_acum'), K(150000)), K(1.25), K(1));
  const plan1 = ARITH('multiply', REF('Monto_Total'), ARITH('multiply', categoryRate('Categoria'), accel));
  // 10000 × 0.030 (LIM) × 1.25 (≥150K) = 375
  assert.equal(ev(plan1, ctx({ metrics: { Monto_Total: 10000, Categoria: 'LIM', monto_acum: 200000 } })), 375);
  // below accelerator threshold → × 1.00 = 300
  assert.equal(ev(plan1, ctx({ metrics: { Monto_Total: 10000, Categoria: 'LIM', monto_acum: 50000 } })), 300);
  // zero base → 0 (no spurious additive +1)
  assert.equal(ev(plan1, ctx({ metrics: { Monto_Total: 0, Categoria: 'LIM', monto_acum: 200000 } })), 0);
});

test('R3/D2a (PG-2): eligibility gate — conditional(collection_rate > 0.70 ? payout : 0) blocks', () => {
  const ratio = ARITH('divide', REF('collected'), REF('pending'));
  const gate = COND(CMP('gt', ratio, K(0.70)), REF('payout'), K(0));
  assert.equal(ev(gate, ctx({ metrics: { collected: 60, pending: 100, payout: 5000 } })), 0);    // 0.60 blocked
  assert.equal(ev(gate, ctx({ metrics: { collected: 80, pending: 100, payout: 5000 } })), 5000); // 0.80 paid
});

test('R3/PG-18 (attribute condition): conditional(channel == "wholesale") — categorical match, no operand-type enum', () => {
  const gate = COND(CMP('eq', REF('channel'), K('wholesale')), K(1000), K(0));
  assert.equal(ev(gate, ctx({ metrics: { channel: 'wholesale' } })), 1000);
  assert.equal(ev(gate, ctx({ metrics: { channel: 'retail' } })), 0);
});

test('R3/numeric tiers: a half-open gte cascade resolves tiers (the eradicated form of a numeric band)', () => {
  // attain ≥130 → 300; [100,130) → 150; <100 → 0
  const tiers = COND(CMP('gte', REF('attain'), K(130)), K(300), COND(CMP('gte', REF('attain'), K(100)), K(150), K(0)));
  assert.equal(ev(tiers, ctx({ metrics: { attain: 140 } })), 300);
  assert.equal(ev(tiers, ctx({ metrics: { attain: 120 } })), 150);
  assert.equal(ev(tiers, ctx({ metrics: { attain: 50 } })), 0);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// (B) The R3-1 verifier elevation rejects (critical) drift DAGs — fail loud at import (C2)
// ════════════════════════════════════════════════════════════════════════════════════════════════

const isValid = (dag: PrimeNode) => validateComponentIntent(dag).valid;
const criticalChecks = (dag: PrimeNode) =>
  validateComponentIntent(dag).violations.filter(v => v.severity === 'critical').map(v => v.check);

test('R3-1 (PG-14): a well-formed category cascade VALIDATES (terminal constant, well-formed nodes)', () => {
  assert.equal(isValid(categoryRate('Categoria')), true);
});

test('R3-1: terminal_completeness — a conditional whose else does not terminate in a constant is REJECTED (critical)', () => {
  // else chains into another conditional whose else is a reference (no terminal constant)
  const bad = COND(CMP('gte', REF('x'), K(10)), K(1), COND(CMP('gte', REF('x'), K(5)), K(2), REF('x')));
  assert.equal(isValid(bad), false);
  assert.ok(criticalChecks(bad).includes('terminal_completeness'), criticalChecks(bad).join(','));
});

test('R3-1: decision_127 — an lte upper bound in a band-selection and-pair is REJECTED (critical)', () => {
  const cond = { prime: 'logical', op: 'and', inputs: [
    CMP('gte', REF('x'), K(100)),
    CMP('lte', REF('x'), K(120)),   // lte upper bound → gap-miss
  ] } as unknown as PrimeNode;
  const bad = COND(cond, K(150), K(0));
  assert.equal(isValid(bad), false);
  assert.ok(criticalChecks(bad).includes('decision_127'), criticalChecks(bad).join(','));
});

test('R3-1: HF-279 — a ratio-source band carrying a scaled constant is REJECTED (critical)', () => {
  // compare( ratio(a/b), constant(1.3 scale:100) ) — the BCL-c1 overpay class
  const ratio = ARITH('divide', REF('a'), REF('b'));
  const scaledConst = { prime: 'constant', value: 1.3, meta: { unit: 'percent', scale: 100, confidence: 0.9 } } as unknown as PrimeNode;
  const bad = COND(CMP('gte', ratio, scaledConst), K(1.25), K(0));
  assert.equal(isValid(bad), false);
  assert.ok(criticalChecks(bad).includes('scale_annotation'), criticalChecks(bad).join(','));
});

test('R3-1: a ratio-source band with an UNSCALED quotient-space break (1.3 for 130%) validates', () => {
  const ratio = ARITH('divide', REF('a'), REF('b'));
  const good = COND(CMP('gte', ratio, K(1.3)), K(1.25), K(0));
  assert.equal(isValid(good), true);
});
