/**
 * OB-203 RUN-4 fix (A+B) — discriminative features + role-stability gating + DI-9 bridge.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeAtomFingerprint, computeAtomFeatures, hashAtomFeatures, ATOM_ALGORITHM_VERSION } from '../atom-fingerprint';
import { resolveAtomRole, knownAtomHashes, AMBIGUOUS_ROLE, type KnownAtom } from '../atom-flywheel';

// ── (B) role-stability gating ──
test('B: conflicting roles -> ambiguous; once ambiguous always; agreeing role preserved', () => {
  assert.equal(resolveAtomRole('identifier', 'measure'), AMBIGUOUS_ROLE); // the No_Empleado/measure collision
  assert.equal(resolveAtomRole(AMBIGUOUS_ROLE, 'identifier'), AMBIGUOUS_ROLE);
  assert.equal(resolveAtomRole('measure', 'measure'), 'measure');
  assert.equal(resolveAtomRole(undefined, 'identifier'), 'identifier');
  assert.equal(resolveAtomRole(null, 'name'), 'name');
});

test('B: an ambiguous atom is NEVER claimed (routes to comprehension)', () => {
  const known = new Map<string, KnownAtom>([
    ['h_stable', { hash: 'h_stable', role: 'identifier', confidence: 0.9, matchCount: 5 }],
    ['h_ambig', { hash: 'h_ambig', role: AMBIGUOUS_ROLE, confidence: 0.9, matchCount: 8 }],
  ]);
  const set = knownAtomHashes(known);
  assert.ok(set.has('h_stable'));     // stable role -> claimed
  assert.ok(!set.has('h_ambig'));     // ambiguous -> NOT claimed -> comprehended
});

test('B: stability round-trip — claim, conflicting write -> ambiguous -> excluded', () => {
  // simulate the writeAtoms role resolution across two columns sharing an atom hash
  let storedRole: string = 'identifier';           // column 1 (an ID) writes identifier
  storedRole = resolveAtomRole(storedRole, 'measure'); // column 2 (a measure) shares the hash -> conflict
  assert.equal(storedRole, AMBIGUOUS_ROLE);
  const known = new Map<string, KnownAtom>([['h', { hash: 'h', role: storedRole, confidence: 0.8, matchCount: 6 }]]);
  assert.ok(!knownAtomHashes(known).has('h')); // next import: comprehended, not mis-claimed
});

// ── (A) discriminative length features ──
test('A: free-text and name are SEPARATED by the length-distribution feature', () => {
  const names = ['Carlos Mendoza', 'Ana Martinez', 'Diego Ramirez', 'Sofia Luna', 'Juan Perez'];
  const freeText = [
    'Strong quarter, exceeded delivery targets in the northern hub region',
    'Needs improvement on safety incidents; several flagged this period',
    'Consistent performer, no notable issues across the three months',
    'New hire ramping up, early results below the cohort baseline so far',
    'Outstanding route utilization and customer feedback this quarter overall',
  ];
  const nameAtom = computeAtomFingerprint('Nombre', names);
  const textAtom = computeAtomFingerprint('Comentarios', freeText);
  assert.notEqual(nameAtom.hash, textAtom.hash); // would have COLLIDED in v1 (both text); v2 separates by length
  assert.equal(nameAtom.features.lengthBucket, 'medium');
  assert.equal(textAtom.features.lengthBucket, 'xlong');
});

test('A: ID-shape (uniform length) and measure-shape (varied) integers differ', () => {
  const ids = Array.from({ length: 60 }, (_, i) => String(1001 + (i % 50))); // uniform 4-digit, repeats
  const measures = ['5', '1234', '99', '100000', '7', '88421', '3', '512', '9999999', '42'];
  const idAtom = computeAtomFingerprint('No_Empleado', ids);
  const measureAtom = computeAtomFingerprint('Ingreso_Real', measures);
  assert.equal(idAtom.features.lengthVarBucket, 'uniform');     // consistent length -> ID-shape
  assert.equal(measureAtom.features.lengthVarBucket, 'high');   // varied magnitude -> measure-shape
  assert.notEqual(idAtom.hash, measureAtom.hash);
});

// ── DI-9 bridge: prior-version atoms readable + version-isolated, never stranded ──
test('DI-9 bridge: a v1 atom hash is NOT matched at v2 (version-isolated, re-derived)', () => {
  const f = computeAtomFeatures(['1001', '1002', '1003', '1004', '1005']);
  assert.equal(f.algorithmVersion, ATOM_ALGORITHM_VERSION); // current = 2
  const v1Hash = hashAtomFeatures({ ...f, algorithmVersion: 1 }); // a prior-version atom's hash
  const v2Hash = hashAtomFeatures(f);
  assert.notEqual(v1Hash, v2Hash); // version is in the identity -> different hash
  // a known map keyed by the v1 hash does NOT match the v2 atom -> the column is re-derived, not
  // claimed from a stale-version atom (the v1 row remains queryable; lookupAtoms filters by version).
  const knownV1 = new Map<string, KnownAtom>([[v1Hash, { hash: v1Hash, role: 'identifier', confidence: 0.9, matchCount: 4 }]]);
  assert.ok(!knownAtomHashes(knownV1).has(v2Hash));
});
