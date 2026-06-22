/**
 * OB-228 Phase 2 — normalizeComponents Korean-Test proof.
 * Proves: all three dialects normalize; an UNKNOWN componentType is CARRIED
 * (isKnownType=false), never dropped; a Hangul/novel field flows through opaque.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComponents, normalizeComponent } from '../normalize';
import { analyzeComponent } from '../prime-dag-view';

test('MIR dialect — bare { variants: [...] } with prime_dag', () => {
  const json = {
    variants: [{
      variantId: 'v1', variantName: 'Vendedor',
      components: [{ id: 'c1', name: 'Comision', componentType: 'prime_dag',
        calculationIntent: { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'reference', field: 'Monto_Total' }, { prime: 'constant', value: 0.03 }] } }],
    }],
  };
  const { variants, recognized } = normalizeComponents(json);
  assert.equal(recognized, true);
  assert.equal(variants.length, 1);
  assert.equal(variants[0].components.length, 1);
  assert.equal(variants[0].components[0].componentType, 'prime_dag');
  assert.equal(variants[0].components[0].isKnownType, true);
  assert.equal(variants[0].components[0].binding.column, 'Monto_Total');
});

test('alt dialect — { configuration: { variants: [...] } }', () => {
  const json = { configuration: { variants: [{ variantId: 'v', variantName: 'V', components: [{ id: 'x', name: 'Tier', componentType: 'tier_lookup', tierConfig: { tiers: [] } }] }] } };
  const { variants, recognized } = normalizeComponents(json);
  assert.equal(recognized, true);
  assert.equal(variants[0].components[0].componentType, 'tier_lookup');
  assert.equal(variants[0].components[0].isKnownType, true);
});

test('BCL array dialect — components are the array directly', () => {
  const json = [{ id: 'a', name: 'A', componentType: 'percentage', percentageConfig: { rate: 0.1 } }];
  const { variants, recognized } = normalizeComponents(json);
  assert.equal(recognized, true);
  assert.equal(variants.length, 1);
  assert.equal(variants[0].components[0].componentType, 'percentage');
});

test('KOREAN TEST — unknown componentType is CARRIED, never dropped', () => {
  const json = { variants: [{ variantId: 'v', variantName: '판매원', components: [
    { id: 'k1', name: '한국어 구성요소', componentType: '미지의_유형' /* unknown type */, someConfig: { 값: 42 } },
    { id: 'k2', name: 'normal', componentType: 'prime_dag', calculationIntent: { prime: 'constant', value: 1 } },
  ] }] };
  const { variants } = normalizeComponents(json);
  // BOTH components present — the unknown type was NOT dropped
  assert.equal(variants[0].components.length, 2);
  const unknown = variants[0].components[0];
  assert.equal(unknown.componentType, '미지의_유형');
  assert.equal(unknown.isKnownType, false); // tagged, not dropped
  assert.equal(unknown.name, '한국어 구성요소'); // Hangul label carried opaque
  // raw config preserved whole (Carry Everything)
  assert.deepEqual((unknown.config.raw as any).someConfig, { 값: 42 });
  // analyzer never throws on an unknown component
  const view = analyzeComponent(unknown);
  assert.ok(view.steps.length >= 1);
});

test('malformed / empty input does not throw and flags unrecognized', () => {
  for (const bad of [null, undefined, 42, 'str', {}]) {
    const { variants } = normalizeComponents(bad as unknown);
    assert.ok(Array.isArray(variants));
  }
  // an object with no variants/components → single default variant, recognized=false
  const { recognized } = normalizeComponents({ foo: 'bar' });
  assert.equal(recognized, false);
});

test('confidence is a hint, never a gate — low-confidence component is carried', () => {
  const c = normalizeComponent({ id: 'lc', name: 'low', componentType: 'prime_dag', confidence: 0.05, calculationIntent: { prime: 'constant', value: 0 } }, 0);
  assert.equal(c.confidence, 0.05);
  assert.equal(c.isKnownType, true); // present despite low confidence
});
