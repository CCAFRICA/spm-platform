/**
 * HF-341 — MIR Reconciliation Correction. Runner: node --test --import tsx.
 *
 * Proves the MECHANISMS behind the six MIR defects + the Robles-anticipation gates, at the engine
 * (evaluate) and construction (constructTree) layers — NO DB. The live MIR/BCL grand-total
 * reconciliation (PG-1..8) is the architect's SR-44 recalc channel; these tests own PG-10/11/12/14 and
 * the structural soundness of D1 (count+filter), D2a (gate blocks), D3a (within-component multiply),
 * and the additive byte-identical guarantee (C6).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluate } from '@/lib/calculation/intent-executor';
import { constructTree } from '@/lib/plan-intelligence/intent-constructor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';
import type { CompositionalIntent, StructuralDescription } from '@/lib/plan-intelligence/compositional-intent';

// ── engine helpers (mirror convergence-authoritative.test.ts) ──
const AGG = (op: string, field: string): PrimeNode => ({ prime: 'aggregate', op, field } as unknown as PrimeNode);
const REF = (field: string): PrimeNode => ({ prime: 'reference', field } as unknown as PrimeNode);
const K = (v: number): PrimeNode => ({ prime: 'constant', value: v } as unknown as PrimeNode);
const MUL = (a: PrimeNode, b: PrimeNode): PrimeNode => ({ prime: 'arithmetic', op: 'multiply', inputs: [a, b] } as unknown as PrimeNode);
const FILT = (field: string, operator: string, value: unknown, downstream: PrimeNode): PrimeNode =>
  ({ prime: 'filter', predicate: { field, operator, value }, downstream } as unknown as PrimeNode);

const ctx = (o: { rows?: Record<string, unknown>[]; metrics?: Record<string, unknown> }): EvalContext => ({
  entity: { metadata: {} }, activeRows: o.rows ?? [], allEntityRows: [],
  metrics: (o.metrics ?? {}) as Record<string, number>, priorPeriodRows: [],
});
const ev = (n: PrimeNode, c: EvalContext) => evaluate(n, c).toNumber();

// build a CompositionalIntent around a structure for constructTree()
const ci = (structure: StructuralDescription): CompositionalIntent => ({
  component_id: 'c', component_name: 'c', structure, scale: null, output_precision: 0,
});
// ════════════════════════════════════════════════════════════════════════════════════════════════
// D3a / PG-11 (RA-1) — N-factor multiplicative composition declared in the DAG
// ════════════════════════════════════════════════════════════════════════════════════════════════

test('PG-11 (RA-1): composed:"multiply" over THREE children constructs an N-factor chain a×b×c', () => {
  const intent = ci({
    shape: 'composed', composition: 'multiply',
    children: [
      { shape: 'arithmetic', operation: 'multiply', operands: [{ kind: 'reference', source: { type: 'metric', field: 'a' } }, { kind: 'constant', value: 1 }] },
      { shape: 'arithmetic', operation: 'multiply', operands: [{ kind: 'reference', source: { type: 'metric', field: 'b' } }, { kind: 'constant', value: 1 }] },
      { shape: 'arithmetic', operation: 'multiply', operands: [{ kind: 'reference', source: { type: 'metric', field: 'c' } }, { kind: 'constant', value: 1 }] },
    ],
  } as StructuralDescription);
  const dag = constructTree(intent);
  // base × product_factor × channel_factor = 2 × 3 × 5 = 30 (the Robles factor-model shape)
  assert.equal(ev(dag, ctx({ metrics: { a: 2, b: 3, c: 5 } })), 30);
});

test('D3a: within-component multiply — accelerator MULTIPLIES the commission (commission × 1.25)', () => {
  // commission = amount(10000) × rate(0.05) = 500; accelerator band → 1.25 ; total = 500 × 1.25 = 625
  const intent = ci({
    shape: 'arithmetic', operation: 'multiply',
    operands: [
      { kind: 'structure', structure: { shape: 'arithmetic', operation: 'multiply', operands: [{ kind: 'reference', source: { type: 'metric', field: 'amount' } }, { kind: 'constant', value: 0.05 }] } },
      { kind: 'reference', source: { type: 'metric', field: 'accelerator' } },
    ],
  } as StructuralDescription);
  const dag = constructTree(intent);
  assert.equal(ev(dag, ctx({ metrics: { amount: 10000, accelerator: 1.25 } })), 625);
});

test('D3a / PG-4: a zero-sales entity yields 0 (0 × 1.25 = 0) — NOT the spurious additive +1 (c0:0,c1:1)', () => {
  const dag = MUL(MUL(REF('amount'), K(0.05)), REF('accelerator'));
  assert.equal(ev(dag, ctx({ metrics: { amount: 0, accelerator: 1.25 } })), 0); // not 0 + 1
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D2a / PG-14 (RA-4) — eligibility gate blocks; numeric AND categorical conditions both representable
// ════════════════════════════════════════════════════════════════════════════════════════════════

const gateIntent = (rhs: { threshold?: number; value?: string | number }): CompositionalIntent => ci({
  shape: 'conditional',
  condition: { reference: { type: 'ratio', numerator_field: 'collected', denominator_field: 'pending' }, operator: 'gt', ...rhs },
  then: { kind: 'reference', source: { type: 'metric', field: 'payout' } },
  else: { kind: 'constant', value: 0 },
} as unknown as StructuralDescription);

test('D2a / PG-2: NUMERIC gate collection_rate > 0.70 BLOCKS the payout when 0.60 (the 9-seller defect)', () => {
  const dag = constructTree(gateIntent({ threshold: 0.70 }));
  assert.equal(ev(dag, ctx({ metrics: { collected: 60, pending: 100, payout: 5000 } })), 0);      // 0.60 → blocked
  assert.equal(ev(dag, ctx({ metrics: { collected: 80, pending: 100, payout: 5000 } })), 5000);   // 0.80 → paid
});

test('PG-14 (RA-4): CATEGORICAL gate (attribute == "wholesale") representable alongside the numeric gate', () => {
  const intent = ci({
    shape: 'conditional',
    condition: { reference: { type: 'attribute', field: 'channel' }, operator: 'eq', value: 'wholesale' },
    then: { kind: 'constant', value: 1000 },
    else: { kind: 'constant', value: 0 },
  } as unknown as StructuralDescription);
  const dag = constructTree(intent);
  assert.equal(ev(dag, ctx({ metrics: { channel: 'wholesale' as unknown as number } })), 1000); // match
  assert.equal(ev(dag, ctx({ metrics: { channel: 'retail' as unknown as number } })), 0);       // no match → blocked
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D1 — count of qualifying rows (a categorical flag is COUNTED, never summed)
// ════════════════════════════════════════════════════════════════════════════════════════════════

test('D1 / PG-1: COUNT of rows where Verificado="Sí" × 150 > 0 (the flag is counted, not summed to 0)', () => {
  const rows = [{ Verificado: 'Sí' }, { Verificado: 'No' }, { Verificado: 'Sí' }, { Verificado: 'Sí' }];
  // filter(Verificado eq "Sí"){ count } = 3 ;  × 150 = 450  (summing the text "Sí" would be 0)
  const dag = MUL(FILT('Verificado', 'eq', 'Sí', AGG('count', '*')), K(150));
  assert.equal(ev(dag, ctx({ rows })), 450);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PG-12 (RA-2) — reference-table read is a first-class operation in the vocabulary
// ════════════════════════════════════════════════════════════════════════════════════════════════

test('PG-12 (RA-2): reference_lookup is REPRESENTABLE in the vocabulary; construction FAILS LOUD (no silent 0) until the Robles resolver lands', () => {
  const intent = ci({
    shape: 'arithmetic', operation: 'multiply',
    operands: [
      { kind: 'reference', source: { type: 'reference_lookup', data_type: 'rate_table', key_column: 'recipient', key_source: { type: 'attribute', field: 'recipient_id' }, value_column: 'base_rate' } },
      { kind: 'constant', value: 1 },
    ],
  } as unknown as StructuralDescription);
  // The op is in the ReferenceSource union (PG-12 representability), and the constructor RECOGNIZES it
  // (a specific case, not the unknown-type default) — but it throws a loud, reference_lookup-specific
  // ConstructionError rather than emitting a reference that would silently resolve to 0 at calc (C2).
  assert.throws(() => constructTree(intent), /reference_lookup|Robles arc/);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PG-10 (C6) — existing additive compositions are byte-identical; multiply is additive (new mode)
// ════════════════════════════════════════════════════════════════════════════════════════════════

test('PG-10 (C6): composed:"sum" is unchanged — 3 + 4 = 7 (additive composition byte-identical)', () => {
  const intent = ci({ shape: 'composed', composition: 'sum', children: [{ kind: 'constant', value: 3 }, { kind: 'constant', value: 4 }] } as unknown as StructuralDescription);
  assert.equal(ev(constructTree(intent), ctx({})), 7);
});

test('PG-10 (C6): composed:"multiply" is the NEW mode alongside it — 3 × 4 = 12', () => {
  const intent = ci({ shape: 'composed', composition: 'multiply', children: [{ kind: 'constant', value: 3 }, { kind: 'constant', value: 4 }] } as unknown as StructuralDescription);
  assert.equal(ev(constructTree(intent), ctx({})), 12);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// R2 — lookup dimension is KEY-TYPE-AGNOSTIC (categorical key → output, no new shape, no engine edit)
// ════════════════════════════════════════════════════════════════════════════════════════════════

const catRateLookup = (): StructuralDescription => ({
  shape: 'banded_lookup',
  dimensions: [{ reference_field: 'Categoria', reference_source: { type: 'attribute', field: 'Categoria' }, keys: ['ALI', 'BEB', 'LIM', 'CPE'] }],
  outputs: [0.025, 0.020, 0.030, 0.035],
} as unknown as StructuralDescription);

test('PG-R1: a CATEGORICAL banded_lookup (Categoria ALI/BEB/LIM/CPE → rates) constructs & maps each key to its output', () => {
  const dag = constructTree(ci(catRateLookup()));
  assert.equal(ev(dag, ctx({ metrics: { Categoria: 'ALI' as unknown as number } })), 0.025);
  assert.equal(ev(dag, ctx({ metrics: { Categoria: 'LIM' as unknown as number } })), 0.030);
  assert.equal(ev(dag, ctx({ metrics: { Categoria: 'CPE' as unknown as number } })), 0.035);
  assert.equal(ev(dag, ctx({ metrics: { Categoria: 'ZZZ' as unknown as number } })), 0); // no-match terminator
});

test('PG-R1: MIR Plan 1 shape — Monto × categoryRate(categorical lookup) × accelerator — constructs end-to-end', () => {
  const plan1 = ci({
    shape: 'composed', composition: 'multiply',
    children: [
      { shape: 'arithmetic', operation: 'multiply', operands: [{ kind: 'reference', source: { type: 'metric', field: 'Monto_Total' } }, { kind: 'constant', value: 1 }] },
      catRateLookup(),
      { shape: 'conditional', condition: { reference: { type: 'metric', field: 'monto_acum' }, operator: 'gte', threshold: 150000 }, then: { kind: 'constant', value: 1.25 }, else: { kind: 'constant', value: 1 } },
    ],
  } as unknown as StructuralDescription);
  const dag = constructTree(plan1);
  // 10000 × 0.030 (LIM) × 1.25 (≥150K) = 375
  assert.equal(ev(dag, ctx({ metrics: { Monto_Total: 10000, Categoria: 'LIM' as unknown as number, monto_acum: 200000 } })), 375);
  // below accelerator threshold → × 1.00
  assert.equal(ev(dag, ctx({ metrics: { Monto_Total: 10000, Categoria: 'LIM' as unknown as number, monto_acum: 50000 } })), 300);
});

test('PG-R3: a NUMERIC banded_lookup is unchanged (ascending breaks → bands)', () => {
  const numLookup = ci({
    shape: 'banded_lookup',
    dimensions: [{ reference_field: 'attain', reference_source: { type: 'metric', field: 'attain' }, breaks: [100, 130] }],
    outputs: [0, 150, 300],
  } as unknown as StructuralDescription);
  const dag = constructTree(numLookup);
  assert.equal(ev(dag, ctx({ metrics: { attain: 140 } })), 300); // ≥130
  assert.equal(ev(dag, ctx({ metrics: { attain: 120 } })), 150); // [100,130)
  assert.equal(ev(dag, ctx({ metrics: { attain: 50 } })), 0);    // <100
});

test('PG-R5/C2: a dimension with NEITHER breaks nor keys fails loud — never a silent default key type', () => {
  const bad = ci({ shape: 'banded_lookup', dimensions: [{ reference_field: 'x', reference_source: { type: 'metric', field: 'x' } }], outputs: [1] } as unknown as StructuralDescription);
  assert.throws(() => constructTree(bad), /neither numeric breaks nor categorical keys|undetermined/);
});

test('PG-R5/C2: a dimension with BOTH breaks and keys fails loud (ambiguous key structure)', () => {
  const bad = ci({ shape: 'banded_lookup', dimensions: [{ reference_field: 'x', reference_source: { type: 'metric', field: 'x' }, breaks: [1], keys: ['a'] }], outputs: [1, 2] } as unknown as StructuralDescription);
  assert.throws(() => constructTree(bad), /BOTH breaks and keys|ambiguous/);
});

test('PG-R5: outputs count must match the key structure (categorical keys.length) — else fail loud', () => {
  const bad = ci({ shape: 'banded_lookup', dimensions: [{ reference_field: 'Categoria', reference_source: { type: 'attribute', field: 'Categoria' }, keys: ['ALI', 'BEB', 'LIM', 'CPE'] }], outputs: [0.025] } as unknown as StructuralDescription);
  assert.throws(() => constructTree(bad), /inconsistent with the key structure|outputs count/);
});
