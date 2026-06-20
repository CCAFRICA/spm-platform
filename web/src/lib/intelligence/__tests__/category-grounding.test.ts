/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchPlanLabelToDataValue, groundCategoryLabels, groundScopeDag, dagHasScopeNode } from '../category-grounding';

const MIR_VALUES = ['Alimentos', 'Bebidas', 'Limpieza', 'Cuidado Personal'];

test('OB-223 §1.7: MIR plan labels → data values (prefix + initials)', () => {
  assert.equal(matchPlanLabelToDataValue('ALI', MIR_VALUES), 'Alimentos');
  assert.equal(matchPlanLabelToDataValue('BEB', MIR_VALUES), 'Bebidas');
  assert.equal(matchPlanLabelToDataValue('LIM', MIR_VALUES), 'Limpieza');
  assert.equal(matchPlanLabelToDataValue('CPE', MIR_VALUES), 'Cuidado Personal'); // initials-prefix CP⊂CPE
});

test('OB-223 §1.7: exact + case-insensitive match', () => {
  assert.equal(matchPlanLabelToDataValue('Alimentos', MIR_VALUES), 'Alimentos');
  assert.equal(matchPlanLabelToDataValue('alimentos', MIR_VALUES), 'Alimentos');
  assert.equal(matchPlanLabelToDataValue('Cuidado Personal', MIR_VALUES), 'Cuidado Personal');
});

test('OB-223 §1.7: no/ambiguous match → null (never a guess)', () => {
  assert.equal(matchPlanLabelToDataValue('XYZ', MIR_VALUES), null);
  assert.equal(matchPlanLabelToDataValue('B', ['Bebidas', 'Botanas']), null); // ambiguous prefix
  assert.equal(matchPlanLabelToDataValue('', MIR_VALUES), null);
});

test('OB-223 §1.7: groundCategoryLabels maps the full set; omits unmatched', () => {
  const g = groundCategoryLabels(['ALI', 'BEB', 'LIM', 'CPE', 'NOPE'], MIR_VALUES);
  assert.deepEqual(g, { ALI: 'Alimentos', BEB: 'Bebidas', LIM: 'Limpieza', CPE: 'Cuidado Personal' });
});

// P1-shaped DAG: add(multiply(scope→agg, rate), …) per category
const scopeBranch = (rate: number) => ({
  prime: 'arithmetic', op: 'multiply',
  inputs: [
    { prime: 'scope', boundary: 'Categoria', downstream: { prime: 'aggregate', op: 'sum', field: 'Monto_Total' } },
    { prime: 'constant', value: rate },
  ],
});
const p1Dag = { prime: 'arithmetic', op: 'add', inputs: [scopeBranch(0.025), scopeBranch(0.02)] };
const categoryRates = { ALI: 0.025, BEB: 0.02 };

test('OB-223 §1.7: dagHasScopeNode detects scope; rewritten DAG has none', () => {
  assert.equal(dagHasScopeNode(p1Dag), true);
  const { dag } = groundScopeDag(p1Dag, categoryRates, { ALI: 'Alimentos', BEB: 'Bebidas' });
  assert.equal(dagHasScopeNode(dag), false, 'all scope nodes rewritten to filter');
});

test('OB-223 §1.7: scope→filter rewrite grounds each branch by rate→label→value', () => {
  const { dag, groundings, ungrounded } = groundScopeDag(p1Dag, categoryRates, { ALI: 'Alimentos', BEB: 'Bebidas' });
  assert.equal(ungrounded, 0);
  assert.equal(groundings.length, 2);
  // dig out the filter nodes
  const inputs = (dag as any).inputs;
  const f0 = inputs[0].inputs.find((n: any) => n.prime === 'filter');
  assert.deepEqual(f0.predicate, { field: 'Categoria', operator: 'eq', value: 'Alimentos' });
  assert.equal(f0.downstream.prime, 'aggregate'); // downstream aggregate preserved
  const f1 = inputs[1].inputs.find((n: any) => n.prime === 'filter');
  assert.equal(f1.predicate.value, 'Bebidas');
});

test('OB-223 §1.7: ungrounded scope (no value) left UNCHANGED (no wrong filter)', () => {
  const { dag, ungrounded } = groundScopeDag(p1Dag, categoryRates, { ALI: 'Alimentos' }); // BEB unmapped
  assert.equal(ungrounded, 1);
  const inputs = (dag as any).inputs;
  assert.ok(inputs[0].inputs.some((n: any) => n.prime === 'filter' && n.predicate.value === 'Alimentos'));
  assert.ok(inputs[1].inputs.some((n: any) => n.prime === 'scope'), 'unmapped branch keeps its scope node');
});

test('OB-223 §1.7: a DAG with no scope is returned unchanged (BCL-safe)', () => {
  const plain = { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'reference', field: 'x' }, { prime: 'constant', value: 0.04 }] };
  assert.equal(dagHasScopeNode(plain), false);
  const { dag, groundings } = groundScopeDag(plain, {}, {});
  assert.deepEqual(dag, plain);
  assert.equal(groundings.length, 0);
});

test('OB-223 §1.7: groundComponentDags grounds scope components via a mock distinct-values provider', async () => {
  const { groundComponentDags } = await import('../category-grounding');
  const components = [
    { name: 'Comision por Categoria', calculationIntent: { prime: 'arithmetic', op: 'add', inputs: [
      { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'scope', boundary: 'Categoria', downstream: { prime: 'aggregate', op: 'sum', field: 'Monto_Total' } }, { prime: 'constant', value: 0.025 }] },
      { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'scope', boundary: 'Categoria', downstream: { prime: 'aggregate', op: 'sum', field: 'Monto_Total' } }, { prime: 'constant', value: 0.02 }] },
    ] }, metadata: { categoryRates: { ALI: 0.025, BEB: 0.02 } } },
    { name: 'Plain (no scope)', calculationIntent: { prime: 'reference', field: 'x' } }, // untouched
  ];
  const before = JSON.stringify(components[1].calculationIntent);
  const res = await groundComponentDags(components as never, async () => ['Alimentos', 'Bebidas', 'Limpieza']);
  assert.equal(res[0].grounded, 2);
  assert.equal(dagHasScopeNode(components[0].calculationIntent), false, 'scope component grounded to filter');
  assert.equal(JSON.stringify(components[1].calculationIntent), before, 'plain component byte-identical');
});

test('OB-223 §1.7: categoryRates read from real MIR shape metadata.compositional_intent.metadata.categoryRates', async () => {
  const { groundComponentDags } = await import('../category-grounding');
  const comp = { name: 'Comision por Categoria', metadata: { compositional_intent: { metadata: { categoryRates: { ALI: 0.025, BEB: 0.02, CPE: 0.035, LIM: 0.03 } } } },
    calculationIntent: { prime: 'arithmetic', op: 'add', inputs: [
      { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'scope', boundary: 'Categoria', downstream: { prime: 'aggregate', op: 'sum', field: 'Monto_Total' } }, { prime: 'constant', value: 0.025 }] },
      { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'scope', boundary: 'Categoria', downstream: { prime: 'aggregate', op: 'sum', field: 'Monto_Total' } }, { prime: 'constant', value: 0.035 }] },
    ] } };
  const res = await groundComponentDags([comp] as never, async () => ['Bebidas', 'Limpieza', 'Alimentos', 'Cuidado Personal']);
  assert.equal(res[0].grounded, 2);
  assert.equal(dagHasScopeNode(comp.calculationIntent), false);
});
