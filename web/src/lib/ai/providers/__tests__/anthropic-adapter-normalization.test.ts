// OB-199 Phase 1: producer-side confidence normalization at the anthropic
// adapter (DS-023 §5.4). Tests the recursive `normalizeConfidenceFieldsInPlace`
// helper directly so adherence to the normalization contract is verifiable
// without invoking the live Anthropic API.

import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeConfidenceFieldsInPlace } from '../anthropic-adapter';

test('OB-199 §5.4 normalization — percentage at top level becomes ratio', () => {
  const payload = { confidence: 95 } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, 0.95);
});

test('OB-199 §5.4 normalization — percentage in nested result.confidence becomes ratio', () => {
  const payload = { confidence: 95, result: { confidence: 90 } } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, 0.95);
  assert.strictEqual((payload.result as Record<string, unknown>).confidence, 0.9);
});

test('OB-199 §5.4 normalization — per-component nested confidences in result.components[]', () => {
  const payload = {
    confidence: 92,
    result: {
      components: [
        { confidence: 90, name: 'a' },
        { confidence: 85, name: 'b' },
        { confidence: 100, name: 'c' },
      ],
    },
  } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, 0.92);
  const components = (payload.result as Record<string, unknown>).components as Array<Record<string, unknown>>;
  assert.strictEqual(components[0].confidence, 0.9);
  assert.strictEqual(components[1].confidence, 0.85);
  assert.strictEqual(components[2].confidence, 1.0);
});

test('OB-199 §5.4 normalization — already-ratio values pass through unchanged', () => {
  const payload = {
    confidence: 0.5,
    result: { confidence: 0.92, components: [{ confidence: 0.85 }] },
  } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, 0.5);
  const r = payload.result as Record<string, unknown>;
  assert.strictEqual(r.confidence, 0.92);
  assert.strictEqual((r.components as Array<Record<string, unknown>>)[0].confidence, 0.85);
});

test('OB-199 §5.4 normalization — out-of-range after /100 passes through (writer surfaces)', () => {
  // Per directive §5.4: producer normalizes percentage→ratio only; values
  // outside [0, 1] AFTER normalization are intentionally surfaced as
  // out-of-range to the canonical writer per §5.2.
  const payload = { confidence: 150 } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, 1.5); // /100 fired; still out-of-range
});

test('OB-199 §5.4 normalization — exact 1.0 admissible (Decision 30 v2 inclusive)', () => {
  // Per IRA Q3 disposition + DS-023 §5.2: confidence = 1.0 is in-range; no transformation.
  const payload = { confidence: 1.0 } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, 1.0);
});

test('OB-199 §5.4 normalization — negative values pass through (writer surfaces)', () => {
  // Per directive §5.4: no clamping at producer; negatives surface structurally.
  const payload = { confidence: -0.5 } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, -0.5);
});

test('OB-199 §5.4 normalization — non-numeric confidence skipped', () => {
  const payload = {
    confidence: 'not-a-number',
    result: { confidence: null, components: [{ confidence: undefined, name: 'x' }] },
  } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  assert.strictEqual(payload.confidence, 'not-a-number');
  const r = payload.result as Record<string, unknown>;
  assert.strictEqual(r.confidence, null);
  assert.strictEqual((r.components as Array<Record<string, unknown>>)[0].confidence, undefined);
});

test('OB-199 §5.4 normalization — NaN and Infinity pass through (writer surfaces)', () => {
  const payload = { confidence: NaN, result: { confidence: Infinity } } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  // Number.isFinite guard prevents division; values surface as-is for writer
  assert.ok(Number.isNaN(payload.confidence as number));
  assert.strictEqual((payload.result as Record<string, unknown>).confidence, Infinity);
});

test('OB-199 §5.4 normalization — arbitrarily nested confidence in non-component arrays', () => {
  const payload = {
    result: {
      sheets: [
        { name: 's1', confidence: 80 },
        { name: 's2', confidence: 70, mappings: [{ field: 'f', confidence: 88 }] },
      ],
    },
  } as Record<string, unknown>;
  normalizeConfidenceFieldsInPlace(payload);
  const sheets = (payload.result as Record<string, unknown>).sheets as Array<Record<string, unknown>>;
  assert.strictEqual(sheets[0].confidence, 0.8);
  assert.strictEqual(sheets[1].confidence, 0.7);
  const mappings = sheets[1].mappings as Array<Record<string, unknown>>;
  assert.strictEqual(mappings[0].confidence, 0.88);
});

test('OB-199 §5.4 normalization — null and primitive root nodes are no-ops', () => {
  // Defensive: function must not throw on degenerate inputs
  normalizeConfidenceFieldsInPlace(null);
  normalizeConfidenceFieldsInPlace(undefined);
  normalizeConfidenceFieldsInPlace(42);
  normalizeConfidenceFieldsInPlace('string');
  // If we got here without throwing, pass
  assert.ok(true);
});
