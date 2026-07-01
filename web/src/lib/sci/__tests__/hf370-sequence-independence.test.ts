/**
 * HF-370 O1 — sequence-independence. An atom's scope_role for an IDENTIFIER is sheet-contextual
 * (entity vs transaction vs reference) and is the classification/resolution-critical field. The atom
 * fingerprint is context-free, so a cached identifier scope must NOT be inherited across sheets (that
 * made classification depend on import order). Proof: knownAtomHashes (the warm-claim gate) EXCLUDES
 * identifier atoms (→ they re-comprehend per sheet) while still claiming non-identifier atoms.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { knownAtomHashes, type KnownAtom } from '../atom-flywheel';

function atom(hash: string, extra: Partial<KnownAtom>): KnownAtom {
  return { hash, role: 'x', confidence: 0.9, roleConfidence: 0.9, matchCount: 5, ...extra };
}

test('HF-370 O1: an identifier atom is NOT warm-claimed (re-comprehends for fresh per-sheet scope)', () => {
  const known = new Map<string, KnownAtom>([
    ['id-h', atom('id-h', { role: 'identifier', nature_role: 'identifier', scope_role: 'entity' })],
  ]);
  const claimable = knownAtomHashes(known);
  assert.equal(claimable.has('id-h'), false); // identifier → excluded → re-analyzed in this sheet's context
});

test('HF-370 O1: an entity/transaction-scoped atom is NOT warm-claimed (contextual scope)', () => {
  const known = new Map<string, KnownAtom>([
    ['ent-h', atom('ent-h', { role: 'code', nature_role: 'categorical', scope_role: 'entity' })],
    ['txn-h', atom('txn-h', { role: 'code', nature_role: 'categorical', scope_role: 'transaction' })],
  ]);
  const claimable = knownAtomHashes(known);
  assert.equal(claimable.has('ent-h'), false);
  assert.equal(claimable.has('txn-h'), false);
});

test('HF-370 O1: non-identifier atoms (measure/temporal/name/categorical) ARE still warm-claimed', () => {
  const known = new Map<string, KnownAtom>([
    ['meas-h', atom('meas-h', { role: 'measure', nature_role: 'measure', scope_role: 'none' })],
    ['temp-h', atom('temp-h', { role: 'temporal', nature_role: 'temporal', scope_role: 'none' })],
    ['name-h', atom('name-h', { role: 'name', nature_role: 'name', scope_role: 'none' })],
    ['cat-h', atom('cat-h', { role: 'categorical', nature_role: 'categorical', scope_role: 'reference' })],
  ]);
  const claimable = knownAtomHashes(known);
  // reference-scoped categorical is safe (its scope affects no classification/resolution outcome)
  assert.deepEqual([...claimable].sort(), ['cat-h', 'meas-h', 'name-h', 'temp-h']);
});

test('HF-370 O1: order-independence — the SAME identifier atom never inherits a cached scope', () => {
  // Whatever scope a prior sheet cached (entity here), the identifier atom is excluded from the claim
  // set, so the next sheet re-comprehends it → its scope is decided from THAT sheet, not inherited.
  const asEntity = new Map<string, KnownAtom>([['h', atom('h', { nature_role: 'identifier', scope_role: 'entity' })]]);
  const asReference = new Map<string, KnownAtom>([['h', atom('h', { nature_role: 'identifier', scope_role: 'reference' })]]);
  assert.equal(knownAtomHashes(asEntity).has('h'), false);
  assert.equal(knownAtomHashes(asReference).has('h'), false); // never claimed regardless of cached scope
});
