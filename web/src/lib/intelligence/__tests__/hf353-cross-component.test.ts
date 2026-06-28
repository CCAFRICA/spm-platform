import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReferenceFields,
  recognizeComponentReference,
  abstainReasonSignalsComponentOutput,
  mappedTokensForBinding,
} from '../convergence-service';

// HF-353 P-C — cross-component reference. The producer is recognized by STRUCTURE (the
// same-variant fully-column-grounded base component, by INDEX) — never a component name
// (Korean Test). The Robles vendedor variant: [cascade(grounded), minimo(refs cascade), bono(grounded)].

const ref = (...fields: string[]) => {
  // build a nested arithmetic DAG of reference leaves
  if (fields.length === 0) return { prime: 'constant', value: 0 };
  let node: unknown = { prime: 'reference', field: fields[fields.length - 1] };
  for (let i = fields.length - 2; i >= 0; i--) node = { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'reference', field: fields[i] }, node] };
  return node;
};

const cascade = { index: 0, variantId: 'vendedor', metadata: { intent: ref('monto_neto', 'tasa_base', 'categoria', 'canal', 'venta_mensual', 'tasa_neg') } };
const minimo = { index: 1, variantId: 'vendedor', metadata: { intent: ref('comision_ventas_devengada') } };
const bono = { index: 2, variantId: 'vendedor', metadata: { intent: ref('net_sales') } };
const components = [cascade, minimo, bono];

// columns that bind (all cascade/bono inputs are raw columns; comision_ventas_devengada is NOT)
const COLUMNS = new Set(['monto_neto', 'tasa_base', 'categoria', 'canal', 'venta_mensual', 'tasa_neg', 'net_sales']);
const isColumnResolvable = (f: string) => COLUMNS.has(f);

test('extractReferenceFields pulls the reference leaves from a prime_dag intent (metadata.intent)', () => {
  assert.deepEqual(extractReferenceFields(minimo).sort(), ['comision_ventas_devengada']);
  assert.equal(extractReferenceFields(cascade).length, 6);
});

const candidates = components.map(c => ({ index: c.index, variantId: c.variantId, referenceFields: extractReferenceFields(c) }));

test('P-C: Minimo (consumer) recognizes the cascade (grounded base, richest) as the producer — by INDEX', () => {
  const producer = recognizeComponentReference({ index: 1, variantId: 'vendedor' }, candidates, isColumnResolvable, 'no column represents an already-accrued post-cap commission output');
  assert.equal(producer, 0); // the cascade — not bono (also grounded but fewer refs)
});

test('P-C: a genuine data gap (abstain reason not an output reference) → null (unchanged gap)', () => {
  const producer = recognizeComponentReference({ index: 1, variantId: 'vendedor' }, candidates, isColumnResolvable, 'no column found for raw sales quantity');
  assert.equal(producer, null);
});

test('P-C: no grounded same-variant producer → null', () => {
  // only the consumer + an ungrounded peer
  const cands = [{ index: 1, variantId: 'v', referenceFields: ['x'] }, { index: 3, variantId: 'v', referenceFields: ['also_missing'] }];
  assert.equal(recognizeComponentReference({ index: 1, variantId: 'v' }, cands, isColumnResolvable), null);
});

test('P-C: a grounded producer in a DIFFERENT variant is NOT chosen (variant-scoped)', () => {
  const otherVariant = [
    { index: 1, variantId: 'vendedor', referenceFields: ['comision_ventas_devengada'] },
    { index: 9, variantId: 'jefe', referenceFields: ['monto_neto'] }, // grounded but different variant
  ];
  assert.equal(recognizeComponentReference({ index: 1, variantId: 'vendedor' }, otherVariant, isColumnResolvable, 'computed output'), null);
});

test('P-C: abstainReasonSignalsComponentOutput — output reasons pass, data-gap reasons fail, null proceeds', () => {
  assert.equal(abstainReasonSignalsComponentOutput('already-accrued or post-cap salesperson commission OUTPUT'), true);
  assert.equal(abstainReasonSignalsComponentOutput('a computed value from another component'), true);
  assert.equal(abstainReasonSignalsComponentOutput('no candidate column for the raw quantity'), false);
  assert.equal(abstainReasonSignalsComponentOutput(undefined), true); // construction unit tests
});

test('P-C: mappedTokensForBinding counts a component_ref entry as MAPPED (HF-281 passes)', () => {
  const binding = {
    comision_ventas_devengada: { column: '', component_ref: 0, match_pass: 1 as const, confidence: 0.9, field_identity: { structuralType: 'computed', contextualIdentity: 'component_output', confidence: 0.9 } },
  };
  const mapped = mappedTokensForBinding(binding as never);
  assert.ok(mapped.has('comision_ventas_devengada'));
});
