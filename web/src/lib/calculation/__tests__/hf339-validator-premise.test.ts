/**
 * HF-339 — Validator Premise Correction: Verification, Not Registry.
 * Runner: node --test --import tsx.
 *
 * Proves the registry-subtraction + carry-not-strip is recognition, not a
 * developer-curated set:
 *  (1) RECOGNITION-NOT-REGISTRY — a compare-constant whose nature the OLD closed
 *      `ScaleUnit` enum ('percent'|'ratio'|'currency'|'count') would NOT have
 *      contained now PASSES by recognition (any free-form nature, any language).
 *  (2) NO FALSE POSITIVE — a bare compare-constant (the model's valid "needs no
 *      normalization" declaration) raises NO scale_annotation warning. The prior
 *      set-membership check warned on every correct-but-stripped value.
 *  (3) LOUD-FAIL ON MALFORMED STRUCTURE — meta present but carrying no
 *      self-describing nature still warns (structural property, not set-membership).
 *  (4) CALC-NEUTRALITY — a carried nature with identity scale (scale:1) evaluates
 *      byte-identically to a bare constant; a real evaluator scale still applies.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validatePrimeTree } from '@/lib/calculation/prime-grammar';
import { evaluate } from '@/lib/calculation/intent-executor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

// compare(gte, reference(attainment), constant) — the band-gate shape.
const gate = (constant: Record<string, unknown>): unknown => ({
  prime: 'compare', op: 'gte',
  inputs: [{ prime: 'reference', field: 'attainment' }, constant],
});
const scaleAnnotations = (tree: unknown) =>
  validatePrimeTree(tree).violations.filter(v => v.check === 'scale_annotation');

test('(1) recognition-not-registry: a NOVEL free-form nature passes validation', () => {
  // None of these are in the retired closed enum {percent,ratio,currency,count}.
  for (const nature of ['basis_points', 'puntos porcentuales', '비율' /* Korean: ratio */, 'per-mille']) {
    const tree = gate({ prime: 'constant', value: 80, meta: { unit: nature, scale: 100, confidence: 0.9 } });
    assert.equal(scaleAnnotations(tree).length, 0, `nature "${nature}" recognized, not gated`);
    assert.equal(validatePrimeTree(tree).valid, true, `nature "${nature}" tree is valid`);
  }
});

test('(1b) the retired enum values are still valid free-form strings (no regression)', () => {
  for (const nature of ['percent', 'ratio', 'currency', 'count']) {
    const tree = gate({ prime: 'constant', value: 80, meta: { unit: nature, scale: 100, confidence: 0.9 } });
    assert.equal(scaleAnnotations(tree).length, 0, `legacy nature "${nature}" still passes`);
  }
});

test('(2) no false positive: a BARE compare-constant raises NO scale_annotation warning', () => {
  // The prior registry warned here on every correct-but-stripped value. A bare
  // constant is the model's valid "no normalization needed" declaration.
  const tree = gate({ prime: 'constant', value: 80 });
  assert.equal(scaleAnnotations(tree).length, 0, 'bare constant is not flagged');
  assert.equal(validatePrimeTree(tree).valid, true);
});

test('(3) loud-fail on malformed structure: meta present but no nature → warns', () => {
  // Structural property (a carried nature must be a non-empty descriptor), NOT
  // membership in any set. Open-vocabulary + loud-fail-on-malformed-structure.
  for (const badMeta of [{ scale: 100, confidence: 0.9 }, { unit: '', scale: 100, confidence: 0.9 }, { unit: 5, scale: 100, confidence: 0.9 }]) {
    const tree = gate({ prime: 'constant', value: 80, meta: badMeta });
    assert.equal(scaleAnnotations(tree).length, 1, `malformed meta ${JSON.stringify(badMeta)} loud-fails`);
  }
});

const ctx = (metrics: Record<string, number>): EvalContext => ({
  entity: { metadata: {} }, activeRows: [], allEntityRows: [], metrics, priorPeriodRows: [],
});
const evalGate = (constant: Record<string, unknown>, attainment: number): number =>
  evaluate(gate(constant) as unknown as PrimeNode, ctx({ attainment })).toNumber();

test('(4) calc-neutrality: identity-scale carry == bare; real evaluator scale still applies', () => {
  // attainment = 1.1 (ratio), threshold = 100 (percent face value).
  const bare = evalGate({ prime: 'constant', value: 100 }, 1.1);
  const identity = evalGate({ prime: 'constant', value: 100, meta: { unit: 'percent', scale: 1, confidence: 0.9 } }, 1.1);
  const scaled = evalGate({ prime: 'constant', value: 100, meta: { unit: 'percent', scale: 100, confidence: 0.9 } }, 1.1);
  assert.equal(identity, bare, 'identity-scale carry is byte-identical to bare (1.1 >= 100 → 0)');
  assert.equal(bare, 0, 'bare/identity: 1.1 >= 100 is false');
  assert.equal(scaled, 1, 'evaluator scale still applies: 1.1×100=110 >= 100 is true');
});
