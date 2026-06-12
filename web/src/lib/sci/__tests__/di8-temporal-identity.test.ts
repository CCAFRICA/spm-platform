/**
 * OB-203 Phase 6 — DI-8 temporal identity. Runner: node --test --import tsx.
 * An atom recognized in period N resolves Tier-1 in period N+1: atom identity is STRUCTURAL
 * (value distribution / type / cardinality), period-agnostic — recognition spans periods.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeAtomFingerprint } from '../atom-fingerprint';
import { knownAtomHashes, type KnownAtom } from '../atom-flywheel';

const period = (month: string) => Array.from({ length: 28 }, (_, i) => `2025-${month}-${String(i + 1).padStart(2, '0')}`);

test('DI-8: a temporal atom from period N has the SAME identity in period N+1', () => {
  const atomJan = computeAtomFingerprint('Mes', period('01'));
  const atomFeb = computeAtomFingerprint('Mes', period('02'));
  assert.equal(atomJan.hash, atomFeb.hash);   // structural identity does not encode the period value
});

test('DI-8: an atom learned in period N is recognized (Tier-1) in period N+1 — zero re-comprehension', () => {
  const atomJan = computeAtomFingerprint('Mes', period('01'));
  const atomMar = computeAtomFingerprint('Mes', period('03'));
  const knownFromJan = new Map<string, KnownAtom>([
    [atomJan.hash, { hash: atomJan.hash, role: 'temporal', confidence: 0.9, roleConfidence: 0.9, matchCount: 1 }],
  ]);
  // period N+1's atom resolves against the period-N learning — no LLM, recognized.
  assert.ok(knownAtomHashes(knownFromJan).has(atomMar.hash));
});

test('DI-8: a different-shape column does NOT collide with the temporal atom (identity is real)', () => {
  const atomMes = computeAtomFingerprint('Mes', period('01'));
  const measures = Array.from({ length: 28 }, (_, i) => String(1000 + i * 137));   // varied-magnitude numerics
  const atomMeasure = computeAtomFingerprint('Ingreso', measures);
  assert.notEqual(atomMes.hash, atomMeasure.hash);
});
