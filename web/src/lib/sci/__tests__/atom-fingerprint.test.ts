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

test('HF-372 v4: IDENTITY-KEYED — same structure, different header -> DISTINCT hashes (collision class closed)', () => {
  const values = Array.from({ length: 100 }, (_, i) => `x${1000 + i}`); // near-unique ids
  const a = computeAtomFingerprint('alpha_id', values);
  const b = computeAtomFingerprint('beta_code', values);
  assert.notEqual(a.columnName, b.columnName);
  assert.notEqual(a.hash, b.hash); // distinct columns can no longer share a recognition entry
});

test('HF-372 v4: true re-encounter — same header, same shape -> SAME hash (warm path preserved)', () => {
  const values = Array.from({ length: 100 }, (_, i) => `x${1000 + i}`);
  const a = computeAtomFingerprint('alpha_id', values);
  const b = computeAtomFingerprint('alpha_id', [...values]);
  assert.equal(a.hash, b.hash);
  // cosmetic header variance (case / surrounding whitespace / NFC form) is canonicalized, not identity
  const c = computeAtomFingerprint('  ALPHA_ID ', values);
  assert.equal(a.hash, c.hash);
});

test('HF-372 v4 Korean Test: a Hangul header keys identity with zero language-specific code', () => {
  const values = Array.from({ length: 50 }, (_, i) => `EMP-${2000 + i}`);
  const ko = computeAtomFingerprint('사원번호', values);
  const es = computeAtomFingerprint('ID_Empleado', values);
  assert.notEqual(ko.hash, es.hash);            // distinct headers → distinct atoms
  const ko2 = computeAtomFingerprint('사원번호', values);
  assert.equal(ko.hash, ko2.hash);              // stable re-encounter
  // the raw header never appears in the persisted features
  assert.ok(!JSON.stringify(ko.features).includes('사원번호'));
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

test('EPG-2.1 cross-vocabulary (v4): structural FEATURES are vocabulary-blind; identity is per-column', () => {
  const latin = generateStructuralAnalog({ seed: 5, vocabulary: 'random-latin' });
  const cyr = generateStructuralAnalog({ seed: 5, vocabulary: 'non-latin' });
  // same structural skeleton (verified in generator test): the FEATURES (the name-free half of the
  // v4 identity) must be identical across vocabularies — the code carries zero language-specific
  // behavior. The HASH differs per column since v4 (HF-372): the header is identity DATA, so two
  // differently-named columns are two atoms — in ANY language, equally.
  for (let i = 0; i < latin.sheets.length; i++) {
    const ls = latin.sheets[i], cs = cyr.sheets[i];
    const lFeats = ls.columns.map(c => JSON.stringify(computeAtomFingerprint(c, col(ls, c)).features)).sort();
    const cFeats = cs.columns.map(c => JSON.stringify(computeAtomFingerprint(c, col(cs, c)).features)).sort();
    assert.deepEqual(lFeats, cFeats, `sheet ${i} (${ls.kind}) structural features must match across vocabularies`);
    // determinism within each vocabulary: recomputation reproduces the identical composition.
    const lHashes = ls.columns.map(c => computeAtomFingerprint(c, col(ls, c)).hash);
    const lHashes2 = ls.columns.map(c => computeAtomFingerprint(c, col(ls, c)).hash);
    assert.equal(computeCompositionFingerprint(lHashes), computeCompositionFingerprint(lHashes2));
  }
});
