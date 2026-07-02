/**
 * HF-373 Phase A (D1) — convergence reads the model's bare primitives by equality.
 *
 * Pass 1 starved to zero because it string-equaled structuralType against the retired
 * ColumnRole enum while structuralType has carried free-form prose since OB-231. These
 * tests lock the equality-read contract: natureRole (HF-368 bare primitive) matches;
 * prose NEVER matches; the pre-OB-231 legacy enum still matches (old tenants unbroken).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import {
  fiIsMeasure,
  fiIsIdentifier,
  fiIsTemporal,
  fiIsEntityKeyCandidate,
} from '../convergence-service';
import type { FieldIdentity } from '@/lib/sci/sci-types';

const fi = (structuralType: string, natureRole?: string): FieldIdentity => ({
  structuralType,
  contextualIdentity: 'test',
  confidence: 0.9,
  natureRole,
});

test('bare natureRole primitives match by equality (post-HF-368 batches)', () => {
  assert.equal(fiIsMeasure(fi('A numeric performance measure expressed as a ratio.', 'measure')), true);
  assert.equal(fiIsIdentifier(fi('A unique code identifying the employee.', 'identifier')), true);
  assert.equal(fiIsTemporal(fi('A temporal value representing the reporting month.', 'temporal')), true);
  assert.equal(fiIsEntityKeyCandidate(fi('A unique code identifying the employee.', 'identifier')), true);
});

test('OB-231 prose NEVER matches the equality read (the 2026-07-02 zero-binding shape)', () => {
  // These are real live shapes: prose structuralType, natureRole present but different.
  assert.equal(fiIsMeasure(fi('A temporal value representing the reporting month.', 'temporal')), false);
  assert.equal(fiIsIdentifier(fi('The branch or office the employee works at.', 'categorical')), false);
  assert.equal(fiIsTemporal(fi('A numeric measure of placement attainment.', 'measure')), false);
  // Prose containing an enum word as a substring must not match (equality, not scan).
  assert.equal(fiIsMeasure(fi('This measure column tracks the attainment level.', 'categorical')), false);
  assert.equal(fiIsEntityKeyCandidate(fi('Acts as a reference key into the branch table.', 'categorical')), false);
});

test('pre-OB-231 legacy ENUM batches still match (no natureRole present)', () => {
  assert.equal(fiIsMeasure(fi('measure')), true);
  assert.equal(fiIsIdentifier(fi('identifier')), true);
  assert.equal(fiIsTemporal(fi('temporal')), true);
  assert.equal(fiIsEntityKeyCandidate(fi('identifier')), true);
  assert.equal(fiIsEntityKeyCandidate(fi('reference_key')), true);
  assert.equal(fiIsMeasure(fi('attribute')), false);
});
