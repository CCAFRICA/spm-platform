/**
 * HF-341 R7 (A2) — composition fidelity. Deterministic proof of the GENERAL
 * property: a component the plan expresses as a MULTIPLICATIVE MODIFIER (an
 * accelerator that SCALES another component's payout) folds INTO the host's
 * PrimeNode DAG as `arithmetic(multiply, host, modifier)` — it is NOT summed as
 * an independent additive component. Composition mode comes from the recognized
 * expression (composesInto), never an additive fold default (Decision 158); the
 * existing `arithmetic` prime + executor evaluate it with no engine change.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { foldComposedModifiers, type InterpretedComponent } from '@/lib/compensation/ai-plan-interpreter';
import { evaluate } from '@/lib/calculation/intent-executor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

type Any = Record<string, unknown>;
const AGG = (op: string, field: string): Any => ({ prime: 'aggregate', op, field });
const K = (value: unknown): Any => ({ prime: 'constant', value });
const CMP = (op: string, a: Any, b: Any): Any => ({ prime: 'compare', op, inputs: [a, b] });
const COND = (condition: Any, then: Any, els: Any): Any => ({ prime: 'conditional', condition, then, else: els });

const comp = (id: string, name: string, intent: Any, composesInto?: { target: string; operator: 'multiply' }): InterpretedComponent => ({
  id, name, type: 'prime_dag' as InterpretedComponent['type'], appliesToEmployeeTypes: ['all'],
  calculationMethod: { type: 'prime_dag' } as InterpretedComponent['calculationMethod'],
  calculationIntent: intent, confidence: 0.9, reasoning: '', composesInto,
});
const ctx = (rows: Any[]): EvalContext => ({ entity: { metadata: {} }, activeRows: rows, allEntityRows: rows, metrics: {}, priorPeriodRows: [] } as unknown as EvalContext);
const ev = (n: PrimeNode, rows: Any[]) => evaluate(n, ctx(rows)).toNumber();

test('A2: an accelerator marked composesInto folds into the host DAG as ×multiply (one fewer component)', () => {
  // commission = sum(base) × rate ; accelerator = conditional(sum(base) ≥ 150000 ? 1.25 : 1)
  const commission = comp('c-commission', 'Comision', { prime: 'arithmetic', op: 'multiply', inputs: [AGG('sum', 'base'), K(0.025)] });
  const accelerator = comp('c-accel', 'Acelerador', COND(CMP('gte', AGG('sum', 'base'), K(150000)), K(1.25), K(1)),
    { target: 'c-commission', operator: 'multiply' });

  const folded = foldComposedModifiers([commission, accelerator]);
  // the accelerator is REMOVED from the additive list
  assert.equal(folded.length, 1);
  assert.equal(folded[0].id, 'c-commission');
  // the host DAG is now multiply(host, modifier)
  const dag = folded[0].calculationIntent as Any;
  assert.equal(dag.prime, 'arithmetic');
  assert.equal(dag.op, 'multiply');
  assert.equal((dag.inputs as Any[]).length, 2);

  // and it EVALUATES as a product, not a sum: rows summing to 200000 → 200000×0.025 = 5000, ×1.25 = 6250
  const rows = [{ base: 120000 }, { base: 80000 }];
  assert.equal(ev(dag as PrimeNode, rows), 6250);
  // (the pre-fix additive form would have been 5000 + 1.25 = 5001.25 — proving multiply, not add)
});

test('A2: below the accelerator threshold the factor is 1 (commission unchanged), still a product', () => {
  const commission = comp('h', 'Comision', { prime: 'arithmetic', op: 'multiply', inputs: [AGG('sum', 'base'), K(0.10)] });
  const accelerator = comp('a', 'Acelerador', COND(CMP('gte', AGG('sum', 'base'), K(150000)), K(1.25), K(1)), { target: 'h', operator: 'multiply' });
  const folded = foldComposedModifiers([commission, accelerator]);
  assert.equal(folded.length, 1);
  const rows = [{ base: 10000 }]; // below threshold → factor 1
  assert.equal(ev(folded[0].calculationIntent as PrimeNode, rows), 1000); // 10000×0.10×1
});

test('A2: target by NAME also folds (host matched by id OR name)', () => {
  const commission = comp('id-1', 'Comision por Categoria', { prime: 'arithmetic', op: 'multiply', inputs: [AGG('sum', 'base'), K(1)] });
  const accelerator = comp('id-2', 'Acelerador', K(2), { target: 'Comision por Categoria', operator: 'multiply' });
  const folded = foldComposedModifiers([commission, accelerator]);
  assert.equal(folded.length, 1);
  assert.equal(ev(folded[0].calculationIntent as PrimeNode, [{ base: 50 }]), 100); // 50×1×2
});

test('A2: unmarked components remain independent (additive) — no fold, byte-identical list', () => {
  const a = comp('a', 'Bono A', AGG('sum', 'x'));
  const b = comp('b', 'Bono B', AGG('sum', 'y'));
  const folded = foldComposedModifiers([a, b]);
  assert.equal(folded.length, 2);
  assert.deepEqual(folded.map(c => c.id), ['a', 'b']);
});

test('A2: a composesInto target that does not exist is left as an independent component (fail-safe)', () => {
  const a = comp('a', 'Bono A', AGG('sum', 'x'));
  const orphan = comp('o', 'Orphan', K(1.5), { target: 'does-not-exist', operator: 'multiply' });
  const folded = foldComposedModifiers([a, orphan]);
  assert.equal(folded.length, 2); // orphan retained, not silently dropped
});
