/**
 * OB-249 — text-normalization (pure structural helpers). Runner: node --test --import tsx.
 * Proves: structural clustering collapses case/whitespace/punctuation (Korean-clean, any script);
 * chooseCanonical is DETERMINISTIC and only ever returns an OBSERVED value (P2/I3 foundation);
 * the value-set fingerprint is order-independent and stable (the I6/P6 recall key).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  structuralKey,
  valueFrequencies,
  structuralClusters,
  chooseCanonical,
  hasCollapseClusters,
  columnValueFingerprint,
  editDistance,
} from '../text-normalization';

test('structuralKey collapses case / whitespace / punctuation noise to one key', () => {
  assert.equal(structuralKey('CORDOVA MENA ALFREDO '), structuralKey('cordova mena alfredo'));
  assert.equal(structuralKey('Coca-Cola  600ml'), structuralKey('coca cola 600ml'));
  assert.equal(structuralKey('A.C.M.E.'), structuralKey('acme'));
  // distinct real-world values stay distinct
  assert.notEqual(structuralKey('Bebidas'), structuralKey('Alimentos'));
});

test('structuralKey is language-agnostic (Korean Test): works on non-Latin scripts with zero literals', () => {
  // trailing-space + internal-space variants of the same Korean string collapse
  assert.equal(structuralKey('서울특별시 '), structuralKey('서울특별시'));
  assert.equal(structuralKey('서울 특별시'), structuralKey('서울특별시'));
  assert.notEqual(structuralKey('서울'), structuralKey('부산'));
});

test('valueFrequencies counts raw surface forms and skips empties', () => {
  const f = valueFrequencies(['A', 'A', 'B', '', '   ', null, undefined, 'A']);
  assert.equal(f.get('A'), 3);
  assert.equal(f.get('B'), 1);
  assert.equal(f.has(''), false);
});

test('structuralClusters groups distinct raw variants under their shared key', () => {
  const clusters = structuralClusters(['ACME', 'acme', 'A.C.M.E.', 'Globex']);
  const acme = clusters.get(structuralKey('ACME'));
  assert.ok(acme);
  assert.equal(new Set(acme).size, 3); // three distinct surface forms, one cluster
  assert.equal(clusters.get(structuralKey('Globex'))?.length, 1);
});

test('chooseCanonical is deterministic: frequency, then shortest, then lexicographic', () => {
  // highest frequency wins
  assert.equal(chooseCanonical(['ACME', 'acme', 'A.C.M.E.'], new Map([['ACME', 5], ['acme', 2], ['A.C.M.E.', 1]])), 'ACME');
  // tie on frequency → shortest
  assert.equal(chooseCanonical(['ABCD', 'AB'], new Map([['ABCD', 3], ['AB', 3]])), 'AB');
  // tie on frequency + length → lexicographically smallest
  assert.equal(chooseCanonical(['AC', 'AB'], new Map([['AC', 3], ['AB', 3]])), 'AB');
});

test('chooseCanonical NEVER returns an unobserved value (I3/P2 no-fabrication)', () => {
  // a variant with zero observed frequency is ineligible
  assert.equal(chooseCanonical(['ghost', 'real'], new Map([['real', 4]])), 'real');
  // nothing observed → null (caller skips the group, commits no fabricated value)
  assert.equal(chooseCanonical(['ghost1', 'ghost2'], new Map()), null);
});

test('hasCollapseClusters detects structural-noise variance and near-duplicate spelling drift', () => {
  assert.equal(hasCollapseClusters(['Madrid', 'madrid ', 'Barcelona']), true);  // ws/case
  assert.equal(hasCollapseClusters(['Cocacola', 'Cocacolla', 'Pepsi']), true);  // edit-distance
  assert.equal(hasCollapseClusters(['Bebidas', 'Alimentos', 'Limpieza']), false); // genuinely clean
});

test('columnValueFingerprint is stable and order-independent (the recall key)', () => {
  const a = columnValueFingerprint(['x', 'y', 'z']);
  const b = columnValueFingerprint(['z', 'y', 'x', 'x']);
  assert.equal(a, b);                                           // order- and dup-independent
  assert.notEqual(a, columnValueFingerprint(['x', 'y']));       // a changed value set changes the key
});

test('editDistance basic correctness', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('', 'abc'), 3);
});
