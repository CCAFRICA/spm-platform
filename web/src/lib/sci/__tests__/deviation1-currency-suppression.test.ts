/**
 * OB-203 Phase 2 (Deviation 1, architect-required) — pin the enhancement analysis.
 * suppressFalseCurrencyColumns gates on `semanticMeaning` via NON_MONETARY_MEASURE_PATTERNS.
 * That gate fires on NOVEL/LLM columns (rich semantic text) and NEVER on ATOM-RECOGNIZED columns
 * (whose reconstructed semanticMeaning is the structural role label, per Deviation 1 / DI-10).
 * This is the exact differentiator between the two reconstruction paths.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isNonMonetaryMeasureMeaning } from '../header-comprehension';

test('atom-recognized columns (structural role-label semanticMeaning) do NOT trigger currency suppression', () => {
  // these are the EXACT semanticMeaning values runDecomposedComprehension reconstructs for known atoms
  for (const roleLabel of ['measure', 'identifier', 'name', 'temporal', 'attribute', 'reference_key', 'unknown']) {
    assert.equal(isNonMonetaryMeasureMeaning(roleLabel), false, `role label "${roleLabel}" must not match`);
  }
});

test('novel/LLM columns (rich semanticMeaning) DO trigger currency suppression where applicable', () => {
  for (const llmMeaning of [
    'storage capacity in liters',
    'monthly transaction count',
    'fleet utilization rate',
    'units delivered per route',
    'incident volume by region',
  ]) {
    assert.equal(isNonMonetaryMeasureMeaning(llmMeaning), true, `LLM meaning "${llmMeaning}" must match`);
  }
  // a genuinely monetary LLM meaning is NOT suppressed (currency stays currency)
  assert.equal(isNonMonetaryMeasureMeaning('total sales amount in USD'), false);
});
