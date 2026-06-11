/**
 * OB-203 Phase 2 — atom flywheel store layer (pure parts). Runner: node --test --import tsx.
 * DB read/write (lookupAtoms/writeAtoms) are integration paths verified at EPG-2.4; here we
 * test the pure payload builder (DI-10 safety, granularity/version) and the known-set gate.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildAtomRow, knownAtomHashes, type KnownAtom } from '../atom-flywheel';
import { computeAtomFingerprint, ATOM_ALGORITHM_VERSION } from '../atom-fingerprint';

test('buildAtomRow is tenant-scoped, atom-granularity, versioned, DI-10-safe', () => {
  const atom = computeAtomFingerprint('emp_name', ['Carlos Mendoza', 'Ana Martínez', 'Diego Ramírez']);
  const row = buildAtomRow('tenant-1', atom, 'name', 0.95);
  assert.equal(row.tenant_id, 'tenant-1');
  assert.equal(row.granularity, 'atom');
  assert.equal(row.scope, 'tenant');
  assert.equal(row.algorithm_version, ATOM_ALGORITHM_VERSION);
  assert.equal(row.fingerprint_hash, atom.hash);
  assert.deepEqual(row.column_roles, { role: 'name', roleConfidence: 0.95 });
  assert.equal(row.source_file_sample, null);   // atom rows hold no file identifier
  assert.deepEqual(row.classification_result, {}); // NOT-NULL column; benign empty placeholder (EPG-2.4 fix)
  // DI-10: the persisted row carries NO raw value (the names never appear)
  const blob = JSON.stringify(row);
  for (const raw of ['Carlos', 'Mendoza', 'Ana', 'Diego', 'emp_name']) {
    assert.ok(!blob.includes(raw), `atom row must not contain ${raw}`);
  }
});

test('knownAtomHashes gates on confidence + real role (read-before-derive input)', () => {
  const known = new Map<string, KnownAtom>([
    ['h_ok', { hash: 'h_ok', role: 'identifier', confidence: 0.8, roleConfidence: 0.9, matchCount: 4 }],
    ['h_lowconf', { hash: 'h_lowconf', role: 'measure', confidence: 0.3, roleConfidence: 0.9, matchCount: 1 }],
    ['h_unknown', { hash: 'h_unknown', role: 'unknown', confidence: 0.9, roleConfidence: 0.9, matchCount: 5 }],
  ]);
  const set = knownAtomHashes(known, 0.5);
  assert.ok(set.has('h_ok'));        // confident + real role -> known (no LLM)
  assert.ok(!set.has('h_lowconf'));  // below floor -> still novel
  assert.ok(!set.has('h_unknown'));  // unknown role is not recognition
});
