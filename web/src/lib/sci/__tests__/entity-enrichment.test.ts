/**
 * OB-203 Phase 6B Phase C — entity enrichment merge (pure).
 * Runner: node --test --import tsx.
 *
 * The retired per-entity loop's exact semantics (OB-177 temporal merge +
 * HF-190 metadata spread), preserved byte-for-byte in computeEnrichmentMerge.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeEnrichmentMerge, type TemporalAttr } from '../entity-enrichment';

const DATE = '2026-06-12';
const open = (key: string, value: string, from = '2026-01-01'): TemporalAttr =>
  ({ key, value, effective_from: from, effective_to: null });

test('same value is idempotent: no change, no new entries', () => {
  const r = computeEnrichmentMerge({
    existingAttrs: [open('region', 'NORTE')],
    existingMeta: { region: 'NORTE' },
    enrichment: { region: 'NORTE' },
    importDate: DATE,
  });
  assert.equal(r.changed, false);
  assert.equal(r.temporalAttributes.length, 1);
  assert.equal(r.temporalAttributes[0].effective_to, null);
});

test('changed value closes the open entry and appends a new open one', () => {
  const r = computeEnrichmentMerge({
    existingAttrs: [open('region', 'NORTE')],
    existingMeta: { region: 'NORTE' },
    enrichment: { region: 'SUR' },
    importDate: DATE,
  });
  assert.equal(r.changed, true);
  assert.equal(r.temporalAttributes.length, 2);
  assert.equal(r.temporalAttributes[0].effective_to, DATE);       // closed
  assert.deepEqual(r.temporalAttributes[1], { key: 'region', value: 'SUR', effective_from: DATE, effective_to: null });
  assert.equal(r.metadata.region, 'SUR');                          // HF-190 spread
});

test('new key appends an open entry and lands in metadata', () => {
  const r = computeEnrichmentMerge({
    existingAttrs: [open('region', 'NORTE')],
    existingMeta: { region: 'NORTE' },
    enrichment: { region: 'NORTE', shift: 'AM' },
    importDate: DATE,
  });
  assert.equal(r.changed, true);
  assert.equal(r.temporalAttributes.length, 2);
  assert.equal(r.metadata.shift, 'AM');
});

test('role is included in metadata and triggers change when absent', () => {
  const r = computeEnrichmentMerge({
    existingAttrs: [],
    existingMeta: {},
    enrichment: {},
    role: 'manager',
    importDate: DATE,
  });
  assert.equal(r.changed, true);
  assert.equal(r.metadata.role, 'manager');
  assert.equal(r.temporalAttributes.length, 0);
});

test('does not mutate the fetched row (clone semantics, same output as the retired loop)', () => {
  const fetched = [open('region', 'NORTE')];
  computeEnrichmentMerge({
    existingAttrs: fetched,
    existingMeta: { region: 'NORTE' },
    enrichment: { region: 'SUR' },
    importDate: DATE,
  });
  assert.equal(fetched[0].effective_to, null);   // caller's copy untouched
});

test('metadata-only change (no temporal delta) is still a change', () => {
  // Enrichment value equals the open temporal entry but metadata lacks the key
  // (the retired loop's metaChanged || length-delta condition).
  const r = computeEnrichmentMerge({
    existingAttrs: [open('region', 'NORTE')],
    existingMeta: {},
    enrichment: { region: 'NORTE' },
    importDate: DATE,
  });
  assert.equal(r.changed, true);
  assert.equal(r.temporalAttributes.length, 1);  // idempotent temporal
  assert.equal(r.metadata.region, 'NORTE');      // metadata gains the key
});
