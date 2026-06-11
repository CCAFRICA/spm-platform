/**
 * OB-203 Phase 2 — atom fingerprint construction (DS-027 R1 / DI-2 / DI-3 / DI-9 / DI-10).
 * Runner: node --test --import tsx. Tests run against the seeded structural-analog generator.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  computeAtomFingerprint, computeAtomFeatures, hashAtomFeatures,
  computeCompositionFingerprint, computeNovelResidue, ATOM_ALGORITHM_VERSION,
} from '../atom-fingerprint';
import { generateStructuralAnalog } from '../structural-analog-generator';

const col = (sheet: { rows: Record<string, unknown>[] }, name: string) => sheet.rows.map(r => r[name]);

test('structural roles inferred (identifier / measure / temporal) — no domain words', () => {
  const wb = generateStructuralAnalog({ seed: 11, rosterRows: 40, factRows: 500 });
  const roster = wb.sheets.find(s => s.kind === 'roster')!;
  const fact = wb.sheets.find(s => s.kind === 'fact')!;
  const idAtom = computeAtomFingerprint(roster.columns[0], col(roster, roster.columns[0]));
  assert.equal(idAtom.features.flags.identifierLike, true);     // near-unique id
  const dateAtom = computeAtomFingerprint(fact.columns[2], col(fact, fact.columns[2]));
  assert.equal(dateAtom.features.flags.temporal, true);          // date column
  const measureAtom = computeAtomFingerprint(fact.columns[3], col(fact, fact.columns[3]));
  assert.equal(measureAtom.features.flags.measureLike, true);    // repeated numeric measure
});

test('DI-3: column NAME is not part of identity — same structure, different name -> same hash', () => {
  const values = Array.from({ length: 100 }, (_, i) => `x${1000 + i}`); // near-unique ids
  const a = computeAtomFingerprint('alpha_id', values);
  const b = computeAtomFingerprint('beta_code', values);
  assert.notEqual(a.columnName, b.columnName);
  assert.equal(a.hash, b.hash); // identity is structural, not lexical
});

test('DI-10: features carry NO raw values — buckets/flags/type only', () => {
  const values = ['Carlos Mendoza', 'Ana Martínez', 'Diego Ramírez'];
  const f = computeAtomFeatures(values);
  const blob = JSON.stringify(f);
  for (const raw of ['Carlos', 'Mendoza', 'Ana', 'Diego']) {
    assert.ok(!blob.includes(raw), `features must not contain raw value ${raw}`);
  }
  assert.equal(f.algorithmVersion, ATOM_ALGORITHM_VERSION);
});

test('DI-9: algorithm_version is in the identity — a version bump changes the hash', () => {
  const f = computeAtomFeatures([1, 2, 3, 4, 5]);
  const bumped = { ...f, algorithmVersion: f.algorithmVersion + 1 };
  assert.notEqual(hashAtomFeatures(f), hashAtomFeatures(bumped));
});

test('composition identity is order-independent (multiset)', () => {
  const hashes = ['h1', 'h2', 'h3', 'h2'];
  assert.equal(
    computeCompositionFingerprint(hashes),
    computeCompositionFingerprint(['h2', 'h3', 'h2', 'h1']),
  );
  assert.notEqual(computeCompositionFingerprint(hashes), computeCompositionFingerprint(['h1', 'h2', 'h3']));
});

test('DI-2 read-before-derive: 28 known + 2 novel atoms -> residue is exactly the 2 novel', () => {
  const all = Array.from({ length: 30 }, (_, i) => `atom_${i}`);
  const known = new Set(all.slice(0, 28));
  const residue = computeNovelResidue(all, known);
  assert.deepEqual(residue, ['atom_28', 'atom_29']);
  assert.equal(residue.length, 2); // comprehension covers exactly 2, not 30
});

test('EPG-2.1 cross-vocabulary: identical structure in a different token language -> identical atom hashes', () => {
  const latin = generateStructuralAnalog({ seed: 5, vocabulary: 'random-latin' });
  const cyr = generateStructuralAnalog({ seed: 5, vocabulary: 'non-latin' });
  // same structural skeleton (verified in generator test); compute composition per sheet and compare.
  for (let i = 0; i < latin.sheets.length; i++) {
    const ls = latin.sheets[i], cs = cyr.sheets[i];
    const lHashes = ls.columns.map(c => computeAtomFingerprint(c, col(ls, c)).hash);
    const cHashes = cs.columns.map(c => computeAtomFingerprint(c, col(cs, c)).hash);
    // structural identity is vocabulary-blind: the recognizer sees the SAME atoms in both languages.
    assert.equal(
      computeCompositionFingerprint(lHashes),
      computeCompositionFingerprint(cHashes),
      `sheet ${i} (${ls.kind}) composition must match across vocabularies`,
    );
  }
});
