/**
 * HF-341 R7 (A1/C1) — literal-domain reconciliation. Deterministic unit proof of
 * the GENERAL property: every filter/compare EQUALITY literal in a component DAG
 * must be a MEMBER of its target column's actual carried domain; a plan-vocabulary
 * literal ('ALI','Si') is reconciled to the data value it means ('Alimentos','Sí')
 * by the recognizer (here injected, deterministic), and an irreconcilable literal
 * FAILS LOUD (C2) — it never persists as a zero-match silent $0.
 *
 * No live DB / LLM: `supabase=null` (sample-domain only) + an injected reconciler.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { reconcileComponentLiterals } from '@/lib/intelligence/convergence-service';

type Any = Record<string, unknown>;
// minimal DAG helpers (the eradicated-form algebra the LLM emits directly)
const FILT = (field: string, value: unknown, downstream: Any): Any => ({ prime: 'filter', predicate: { field, operator: 'eq', value }, downstream });
const AGG = (op: string, field: string): Any => ({ prime: 'aggregate', op, field });
const REF = (field: string): Any => ({ prime: 'reference', field });
const K = (value: unknown): Any => ({ prime: 'constant', value });
const CMP = (op: string, a: Any, b: Any): Any => ({ prime: 'compare', op, inputs: [a, b] });
const ARITH = (op: string, a: Any, b: Any): Any => ({ prime: 'arithmetic', op, inputs: [a, b] });
const COND = (condition: Any, then: Any, els: Any): Any => ({ prime: 'conditional', condition, then, else: els });

const wrap = (dag: Any) => ({ variants: [{ components: [{ name: 'c', calculationIntent: dag }] }] });
const domain = (m: Record<string, string[]>) => new Map(Object.entries(m).map(([k, v]) => [k, new Set(v)] as const));

// deterministic reconciler standing in for the LLM: a meaning map, but the CODE never
// sees it — it lives only in this test fixture (the production path asks the LLM).
const mapper = (table: Record<string, string>) =>
  async (_field: string, literals: string[]): Promise<Record<string, string | null>> =>
    Object.fromEntries(literals.map(l => [l, table[l] ?? null]));

test('A1: category-code filter cascade is reconciled to the data domain (ALI→Alimentos…)', async () => {
  // Plan-1 shape: add( mult(filter[Categoria=='ALI']→sum, .025), … )
  const dag = ARITH('add',
    ARITH('multiply', FILT('Categoria', 'ALI', AGG('sum', 'Monto_Total')), K(0.025)),
    ARITH('multiply', FILT('Categoria', 'BEB', AGG('sum', 'Monto_Total')), K(0.02)));
  const root = wrap(dag);
  const out = await reconcileComponentLiterals(
    root, domain({ Categoria: ['Alimentos', 'Bebidas', 'Limpieza', 'Cuidado Personal'] }), 'T', null,
    mapper({ ALI: 'Alimentos', BEB: 'Bebidas' }));
  assert.equal(out.changed, true);
  assert.equal(out.failures.length, 0);
  // the DAG literals are rewritten IN PLACE
  const c = (root.variants[0].components[0].calculationIntent as Any);
  const left = ((c.inputs as Any[])[0].inputs as Any[])[0] as Any; // filter node
  assert.equal((left.predicate as Any).value, 'Alimentos');
  assert.deepEqual(out.rewrites.sort((a, b) => a.from.localeCompare(b.from)),
    [{ field: 'Categoria', from: 'ALI', to: 'Alimentos' }, { field: 'Categoria', from: 'BEB', to: 'Bebidas' }]);
});

test('C1: count-filter affirmative literal reconciled across the accent boundary (Si→Sí)', async () => {
  // Plan-4 shape: mult(filter[Verificado=='Si']→count('*'), 150)
  const dag = ARITH('multiply', FILT('Verificado', 'Si', AGG('count', '*')), K(150));
  const root = wrap(dag);
  const out = await reconcileComponentLiterals(
    root, domain({ Verificado: ['Sí', 'No'] }), 'T', null, mapper({ Si: 'Sí' }));
  assert.equal(out.changed, true);
  const filt = ((root.variants[0].components[0].calculationIntent as Any).inputs as Any[])[0] as Any;
  assert.equal((filt.predicate as Any).value, 'Sí');
  assert.deepEqual(out.rewrites, [{ field: 'Verificado', from: 'Si', to: 'Sí' }]);
});

test('compare-eq literals are reconciled too (structural, not filter-only)', async () => {
  const dag = COND(CMP('eq', REF('Categoria'), K('ALI')), K(0.025), K(0));
  const root = wrap(dag);
  const out = await reconcileComponentLiterals(
    root, domain({ Categoria: ['Alimentos', 'Bebidas'] }), 'T', null, mapper({ ALI: 'Alimentos' }));
  assert.equal(out.changed, true);
  const cond = root.variants[0].components[0].calculationIntent as Any;
  assert.equal(((cond.condition as Any).inputs as Any[])[1].value, 'Alimentos');
});

test('C2 FAIL-LOUD: an irreconcilable literal is NOT rewritten and a loud diagnostic is recorded', async () => {
  const dag = ARITH('multiply', FILT('Verificado', 'MAYBE', AGG('count', '*')), K(150));
  const root = wrap(dag);
  const out = await reconcileComponentLiterals(
    root, domain({ Verificado: ['Sí', 'No'] }), 'T', null, mapper({})); // reconciler maps nothing
  assert.equal(out.changed, false);
  assert.equal(out.rewrites.length, 0);
  assert.equal(out.failures.length, 1);
  assert.equal(out.failures[0].field, 'Verificado');
  assert.equal(out.failures[0].value, 'MAYBE');
  // the diagnostic names the column + the absent literal + the real domain — fail loud, not silent $0
  assert.match(out.failures[0].diagnostic, /MAYBE/);
  assert.match(out.failures[0].diagnostic, /Verificado/);
  assert.match(out.failures[0].diagnostic, /fail loud/i);
  // the literal is left UNCHANGED (the gap surfaces it; calc does not silently 0 it away)
  const filt = ((root.variants[0].components[0].calculationIntent as Any).inputs as Any[])[0] as Any;
  assert.equal((filt.predicate as Any).value, 'MAYBE');
});

test('NO-OP: a literal already in the data domain is left byte-identical (no LLM, no change)', async () => {
  const dag = ARITH('multiply', FILT('Verificado', 'Sí', AGG('count', '*')), K(150));
  const root = wrap(dag);
  let reconcilerCalled = false;
  const out = await reconcileComponentLiterals(
    root, domain({ Verificado: ['Sí', 'No'] }), 'T', null,
    async (_f, lits) => { reconcilerCalled = true; return Object.fromEntries(lits.map(l => [l, null])); });
  assert.equal(out.changed, false);
  assert.equal(out.failures.length, 0);
  assert.equal(reconcilerCalled, false); // already a domain member → reconciler never invoked
});

test('numeric thresholds are NOT touched (only categorical string literals reconcile)', async () => {
  // accelerator gate: compare(gte, Monto_Total, 150000) — a numeric threshold, never a categorical literal
  const dag = COND(CMP('gte', REF('Monto_Total'), K(150000)), K(1.25), K(1));
  const root = wrap(dag);
  const out = await reconcileComponentLiterals(root, domain({}), 'T', null, mapper({}));
  assert.equal(out.changed, false);
  assert.equal(out.failures.length, 0);
});
