/**
 * HF-281 — convergence binding completeness deterministic tests.
 *
 *   1. One component binding missing a required token (the Meridian senior-c4
 *      shape) → findIncompleteBindings flags it (group/component/token); the
 *      complete sibling is not flagged.
 *   2. All bindings complete → findIncompleteBindings returns [] (DD-7).
 *   3. requiredTokensForComponent derives from intent structure for a multi-field
 *      DAG, a single pre-computed metric, and a constructed ratio — no literals.
 *   + a match_pass:'failed' marker counts as unmapped (present-but-unresolved).
 *
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  findIncompleteBindings,
  requiredTokensForComponent,
  mappedTokensForBinding,
  type ComponentBinding,
} from '../convergence-service';

// ── intent fixtures (prime_dag PrimeNode trees) ──
const ratioIntent = {
  prime: 'arithmetic', op: 'divide',
  inputs: [
    { prime: 'reference', field: 'cargas_totales_hub' },
    { prime: 'reference', field: 'capacidad_total_hub' },
  ],
};
// single pre-computed metric read inside a banded conditional
const singleMetricIntent = {
  prime: 'conditional',
  condition: { prime: 'compare', op: 'gte', inputs: [{ prime: 'reference', field: 'on_time_delivery_percentage' }, { prime: 'constant', value: 0.85 }] },
  then: { prime: 'constant', value: 200 },
  else: { prime: 'constant', value: 0 },
};
// multi-field DAG: (actual / target) then combined with a third field
const multiFieldIntent = {
  prime: 'arithmetic', op: 'multiply',
  inputs: [
    { prime: 'arithmetic', op: 'divide', inputs: [{ prime: 'reference', field: 'actual_income' }, { prime: 'reference', field: 'target_income' }] },
    { prime: 'reference', field: 'hub_route_volume' },
  ],
};

const resolved = (column: string): ComponentBinding => ({
  column, field_identity: { structuralType: 'measure', contextualIdentity: column, confidence: 0.9 } as never, match_pass: 1, confidence: 0.9,
});
const failedMarker = (token: string): ComponentBinding => ({
  column: '', field_identity: { structuralType: 'unknown', contextualIdentity: 'unresolved', confidence: 0 } as never, match_pass: 'failed', confidence: 0,
  resolutionFailure: { token, reason: 'no_real_column_match', candidatesConsidered: 0 } as never,
});

// Two variant groups, both with a constructed-ratio Utilización component.
const components = {
  variants: [
    { variantId: 'coordinador-senior', components: [{ name: 'Utilización de Flota', calculationIntent: ratioIntent }] },
    { variantId: 'coordinador', components: [{ name: 'Utilización de Flota', calculationIntent: ratioIntent }] },
  ],
};

// ── 1. Missing-token: the senior group's binding lacks both tokens ──
test('HF-281: a binding missing required tokens (Meridian senior-c4 shape) fails the phase', () => {
  const convergenceBindings: Record<string, Record<string, ComponentBinding>> = {
    component_0: { period: resolved('Mes'), entity_identifier: resolved('No_Empleado') }, // senior: MISSING both tokens
    component_1: { period: resolved('Mes'), entity_identifier: resolved('No_Empleado'), cargas_totales_hub: resolved('Cargas_Flota_Hub'), capacidad_total_hub: resolved('Capacidad_Flota_Hub') }, // complete
  };
  const incomplete = findIncompleteBindings(components, convergenceBindings);
  assert.equal(incomplete.length, 1, 'exactly the senior binding is incomplete');
  const b = incomplete[0];
  assert.equal(b.componentKey, 'component_0');
  assert.equal(b.componentName, 'Utilización de Flota');
  assert.equal(b.variantId, 'coordinador-senior');
  assert.deepEqual(b.missingTokens.sort(), ['capacidad_total_hub', 'cargas_totales_hub']);
});

// ── 2. All complete → phase succeeds, nothing flagged (DD-7) ──
test('HF-281: all bindings complete → findIncompleteBindings returns [] (DD-7)', () => {
  const convergenceBindings: Record<string, Record<string, ComponentBinding>> = {
    component_0: { period: resolved('Mes'), entity_identifier: resolved('No_Empleado'), cargas_totales_hub: resolved('Cargas_Flota_Hub'), capacidad_total_hub: resolved('Capacidad_Flota_Hub') },
    component_1: { period: resolved('Mes'), entity_identifier: resolved('No_Empleado'), cargas_totales_hub: resolved('Cargas_Flota_Hub'), capacidad_total_hub: resolved('Capacidad_Flota_Hub') },
  };
  assert.deepEqual(findIncompleteBindings(components, convergenceBindings), []);
});

// ── a match_pass:'failed' marker is NOT a mapped token (present-but-unresolved) ──
test('HF-281: a match_pass:failed marker counts as unmapped', () => {
  const convergenceBindings: Record<string, Record<string, ComponentBinding>> = {
    component_0: { period: resolved('Mes'), entity_identifier: resolved('No_Empleado'), cargas_totales_hub: resolved('Cargas_Flota_Hub'), capacidad_total_hub: failedMarker('capacidad_total_hub') },
    component_1: { period: resolved('Mes'), entity_identifier: resolved('No_Empleado'), cargas_totales_hub: resolved('Cargas_Flota_Hub'), capacidad_total_hub: resolved('Capacidad_Flota_Hub') },
  };
  const incomplete = findIncompleteBindings(components, convergenceBindings);
  assert.equal(incomplete.length, 1);
  assert.deepEqual(incomplete[0].missingTokens, ['capacidad_total_hub']);
});

test('HF-281: mappedTokensForBinding excludes empty-column and failed entries', () => {
  const m = mappedTokensForBinding({ a: resolved('Col_A'), b: failedMarker('b'), c: { column: '', match_pass: 1, confidence: 0, field_identity: {} as never } });
  assert.deepEqual(Array.from(m).sort(), ['a']);
});

// ── 3. requiredTokens derives from intent structure for three shapes ──
test('HF-281: requiredTokensForComponent — constructed ratio (two fields)', () => {
  const r = requiredTokensForComponent({ name: 'x', index: 0, calculationIntent: ratioIntent } as never);
  assert.deepEqual(r.sort(), ['capacidad_total_hub', 'cargas_totales_hub']);
});
test('HF-281: requiredTokensForComponent — single pre-computed metric', () => {
  const r = requiredTokensForComponent({ name: 'x', index: 0, calculationIntent: singleMetricIntent } as never);
  assert.deepEqual(r, ['on_time_delivery_percentage']);
});
test('HF-281: requiredTokensForComponent — multi-field DAG', () => {
  const r = requiredTokensForComponent({ name: 'x', index: 0, calculationIntent: multiFieldIntent } as never);
  assert.deepEqual(r.sort(), ['actual_income', 'hub_route_volume', 'target_income']);
});

// ── OB-223 §1.6: a clawback component (temporal_adjustment modifier) needs NO bindings ──
test('OB-223: clawback component with temporal_adjustment modifier + empty bindings → not flagged', () => {
  const clawbackComponents = {
    variants: [{ variantId: '0', components: [
      { name: 'Ajuste por Devolucion (Clawback)', calculationIntent: { prime: 'constant', value: 0 },
        modifiers: [{ modifier: 'temporal_adjustment', adjustmentType: 'per_transaction_reversal',
          referenceMapping: { returnField: 'Folio_Original', originalField: 'Folio' }, recoveryRate: 1.0 }] },
      { name: 'Utilización de Flota', calculationIntent: ratioIntent }, // normal component, still validated
    ] }],
  };
  // No binding for the clawback component (component_0); component_1 incomplete.
  const incomplete = findIncompleteBindings(clawbackComponents, { component_1: {} });
  // Only the normal component_1 is flagged; the clawback component_0 is skipped despite no binding.
  assert.ok(!incomplete.some(b => b.componentName.includes('Clawback')), 'clawback component must not be flagged');
  assert.ok(incomplete.some(b => b.componentKey === 'component_1'), 'the normal component is still validated');
});

test('OB-223: temporal_adjustment modifier under calculationIntent.modifiers is also detected', () => {
  const c = { variants: [{ variantId: '0', components: [
    { name: 'Clawback', calculationIntent: { prime: 'constant', value: 0, modifiers: [{ modifier: 'temporal_adjustment' }] } },
  ] }] };
  assert.deepEqual(findIncompleteBindings(c, {}), [], 'no bindings required for a clawback component');
});
