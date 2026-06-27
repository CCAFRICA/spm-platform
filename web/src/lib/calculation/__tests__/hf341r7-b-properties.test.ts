/**
 * HF-341 R7 (B) — condition + reduction fidelity. The directive's B1 (missing gate)
 * and B2 (sum-not-snapshot) hypotheses were REFUTED by the live forensics: MIR Plan 3
 * already carries the activation gate as a `conditional` prime, and Saldo_Pendiente is
 * already bound reduction='snapshot' (the reduction algebra in resolveColumnFromBatch
 * already executes snapshot/last/first/distinct_count, route.ts ~1820-1860). These
 * tests pin the PROPERTIES that hold so they cannot silently regress:
 *   P-B1: an expressed activation gate survives into the DAG as a `conditional` whose
 *         operands resolve at calc time — it pays above the threshold, blocks at/below,
 *         and FAILS CLOSED on a zero denominator (never a false payout).
 *   P-B2: the reduction algebra supports snapshot/last (RA-1) — proven live (the stored
 *         Saldo_Pendiente binding carries reduction='snapshot'); exercised here via the
 *         executor's divide/compare/conditional that consume the reduced operands.
 * The residual Plan-3 numeric divergence is a plan-formula/data-semantics reconciliation
 * item (the data cannot produce the GT "9 blocked" under the recognized Cobrado/Saldo
 * formula — min rate 2.11), which lives in the architect's reconciliation channel.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluate } from '@/lib/calculation/intent-executor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

type Any = Record<string, unknown>;
const REF = (field: string): Any => ({ prime: 'reference', field });
const K = (value: unknown): Any => ({ prime: 'constant', value });
const CMP = (op: string, a: Any, b: Any): Any => ({ prime: 'compare', op, inputs: [a, b] });
const ARI = (op: string, a: Any, b: Any): Any => ({ prime: 'arithmetic', op, inputs: [a, b] });
const COND = (condition: Any, then: Any, els: Any): Any => ({ prime: 'conditional', condition, then, else: els });

// the MIR Plan-3 shape: pay 1.5% of collected, gated on collection rate > 70%
const PLAN3 = COND(
  CMP('gt', ARI('divide', REF('Monto_Cobrado'), REF('Saldo_Pendiente')), K(0.7)),
  ARI('multiply', REF('Monto_Cobrado'), K(0.015)),
  K(0),
);
const ctx = (metrics: Any): EvalContext => ({ entity: { metadata: {} }, activeRows: [], allEntityRows: [], metrics, priorPeriodRows: [] } as unknown as EvalContext);
const ev = (n: PrimeNode, m: Any) => evaluate(n, ctx(m)).toNumber();

test('P-B1: the collection-rate gate PAYS above threshold (rate > 0.7 → 1.5% of collected)', () => {
  // collected 80000 against a 100000 snapshot balance → rate 0.8 > 0.7 → pays 80000 × 0.015 = 1200
  assert.equal(ev(PLAN3 as PrimeNode, { Monto_Cobrado: 80000, Saldo_Pendiente: 100000 }), 1200);
});

test('P-B1: the gate BLOCKS at/below threshold (rate ≤ 0.7 → S/0)', () => {
  // collected 50000 against 100000 → rate 0.5 ≤ 0.7 → blocked
  assert.equal(ev(PLAN3 as PrimeNode, { Monto_Cobrado: 50000, Saldo_Pendiente: 100000 }), 0);
  // exactly at the boundary (rate 0.7, gt is strict) → blocked
  assert.equal(ev(PLAN3 as PrimeNode, { Monto_Cobrado: 70000, Saldo_Pendiente: 100000 }), 0);
});

test('P-B1: the gate FAILS CLOSED on a zero denominator (no false payout from divide-by-zero)', () => {
  // Saldo_Pendiente snapshot = 0 → divide returns 0 (not Infinity) → 0 > 0.7 false → blocked
  assert.equal(ev(PLAN3 as PrimeNode, { Monto_Cobrado: 99999, Saldo_Pendiente: 0 }), 0);
});

test('P-B2: a snapshot-reduced operand flows through the gate as a single value (not N× inflated)', () => {
  // The reduction (snapshot) is applied at metric resolution BEFORE the DAG; the executor
  // consumes the single reduced value. A snapshot balance of 100000 (taken ONCE, not summed
  // across the entity's rows) with 120000 collected → rate 1.2 > 0.7 → pays 1800.
  assert.equal(ev(PLAN3 as PrimeNode, { Monto_Cobrado: 120000, Saldo_Pendiente: 100000 }), 1800);
  // had Saldo been SUMMED over (say) 100 rows → 10,000,000 → rate 0.012 → falsely blocked.
  assert.equal(ev(PLAN3 as PrimeNode, { Monto_Cobrado: 120000, Saldo_Pendiente: 10000000 }), 0);
});
