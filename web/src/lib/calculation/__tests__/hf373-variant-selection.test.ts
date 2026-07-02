/**
 * HF-373 Phase B (D2) — variant selection from materialized recognized attributes.
 * Locks the equality contract and the structural traps the HF-119 token matcher had.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildVariantIdentitySets,
  normalizeIdentity,
  resolveMaterializedAttributes,
  selectVariantByRecognizedAttributes,
} from '../variant-selection';

const VLTEST2_VARIANTS = [
  { variantId: 'senior', variantName: 'Ejecutivo Senior', description: 'Ejecutivo Senior' },
  { variantId: 'ejecutivo', variantName: 'Ejecutivo', description: 'Ejecutivo' },
];

test('nested variant names select correctly by FULL-STRING equality (the HF-119 trap)', () => {
  const sets = buildVariantIdentitySets(VLTEST2_VARIANTS);
  const senior = selectVariantByRecognizedAttributes(sets, { role: 'Ejecutivo Senior' });
  assert.deepEqual(senior, { kind: 'selected', index: 0, attrIdentities: ['ejecutivo senior'] });
  const ejecutivo = selectVariantByRecognizedAttributes(sets, { role: 'Ejecutivo' });
  assert.deepEqual(ejecutivo, { kind: 'selected', index: 1, attrIdentities: ['ejecutivo'] });
});

test('accent and case insensitive equality; other attribute keys participate', () => {
  const sets = buildVariantIdentitySets(VLTEST2_VARIANTS);
  const viaOtherKey = selectVariantByRecognizedAttributes(sets, { nivel_cargo: 'EJECUTIVO  SENIOR', sucursal_id: 'HQ' });
  assert.equal(viaOtherKey.kind, 'selected');
  assert.equal((viaOtherKey as { index: number }).index, 0);
  assert.equal(normalizeIdentity('  Ejecutívo   Sénior '), 'ejecutivo senior');
});

test('no recognized attribute matching any variant is a loud no_match, never a default', () => {
  const sets = buildVariantIdentitySets(VLTEST2_VARIANTS);
  const r = selectVariantByRecognizedAttributes(sets, { region: 'Costa', sucursal_id: 'BCL-GYE-001' });
  assert.equal(r.kind, 'no_match');
  const empty = selectVariantByRecognizedAttributes(sets, {});
  assert.equal(empty.kind, 'no_match');
});

test('an attribute set matching several variants is ambiguous, not a guess', () => {
  const sets = buildVariantIdentitySets(VLTEST2_VARIANTS);
  const r = selectVariantByRecognizedAttributes(sets, { a: 'Ejecutivo', b: 'Ejecutivo Senior' });
  assert.equal(r.kind, 'ambiguous');
  assert.deepEqual((r as { matchedIndices: number[] }).matchedIndices, [0, 1]);
});

test('resolveMaterializedAttributes: as-of resolution with metadata.role backstop', () => {
  // Import stamped effective_from AFTER the calc period (the live VLTEST2 shape) →
  // temporal attrs drop out, metadata.role survives.
  const resolved = resolveMaterializedAttributes(
    [{ key: 'nivel_cargo', value: 'Ejecutivo Senior', effective_from: '2026-07-02', effective_to: null }],
    { role: 'Ejecutivo Senior' },
    '2025-11-30',
  );
  assert.deepEqual(resolved, { role: 'Ejecutivo Senior' });
  // In-window temporal attribute wins its key; latest effective_from ≤ asOf wins.
  const resolved2 = resolveMaterializedAttributes(
    [
      { key: 'role', value: 'Ejecutivo', effective_from: '2025-01-01', effective_to: null },
      { key: 'role', value: 'Ejecutivo Senior', effective_from: '2025-11-01', effective_to: null },
    ],
    { role: 'stale-backstop' },
    '2025-11-30',
  );
  assert.deepEqual(resolved2, { role: 'Ejecutivo Senior' });
});
