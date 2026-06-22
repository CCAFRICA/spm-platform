/**
 * OB-203 Phase 2 (5b) — decomposed comprehension dispatch. Runner: node --test --import tsx.
 * Holds proven as executable evidence:
 *   (b) per-unit failure isolation — one sheet's residue failing marks THAT sheet, siblings proceed;
 *   (a) a failed unit writes NO atoms (failed runs must not seed the new store);
 *   read-before-derive — known atoms are claimed WITHOUT an LLM call.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { decomposeComprehension, type ResidueComprehender, type SheetInput } from '../decomposed-comprehension';
import { computeAtomFingerprint } from '../atom-fingerprint';
import type { KnownAtom } from '../atom-flywheel';

// distinct-shape value columns
const idVals = Array.from({ length: 50 }, (_, i) => `x${1000 + i}`);     // identifier (near-unique text)
const amtVals = Array.from({ length: 50 }, (_, i) => String(i % 20));    // measure (low-card integer)
const nameVals = Array.from({ length: 50 }, (_, i) => `tok ${i % 30} word`); // text name
const weirdVals = Array.from({ length: 50 }, (_, i) => (i % 7 === 0 ? 'q' : ''));  // sparse text

function sheet(name: string, cols: Record<string, unknown[]>): SheetInput {
  const columns = Object.keys(cols);
  const rows = idVals.map((_, r) => {
    const row: Record<string, unknown> = {};
    for (const c of columns) row[c] = cols[c][r];
    return row;
  });
  return { sheetName: name, columns, rows };
}

test('decomposed dispatch: recognized / comprehended / failed_interpretation per-unit (holds a+b)', async () => {
  const A = sheet('A', { id: idVals, amt: amtVals });   // both atoms known -> recognized (no LLM)
  const B = sheet('B', { id: idVals, nm: nameVals });   // id known, nm novel -> comprehended
  const C = sheet('C', { id: idVals, wd: weirdVals });  // id known, wd novel -> residue FAILS

  // pre-know the id + amt atoms
  const known = new Map<string, KnownAtom>();
  const idHash = computeAtomFingerprint('id', idVals).hash;
  const amtHash = computeAtomFingerprint('amt', amtVals).hash;
  known.set(idHash, { hash: idHash, role: 'identifier', confidence: 0.85, roleConfidence: 0.9, matchCount: 5 });
  known.set(amtHash, { hash: amtHash, role: 'measure', confidence: 0.85, roleConfidence: 0.9, matchCount: 5 });

  // injected comprehender: records which sheets it was called for; fails sheet C's residue.
  const calledFor: string[] = [];
  const comprehend: ResidueComprehender = async (req) => {
    calledFor.push(req.sheetName);
    if (req.sheetName === 'C') return { ok: false, failureClass: 'parse_failure' };
    return { ok: true, interpretations: { nm: { characterization: 'a name', dataExpectation: 'text', data_nature: 'name', identifies: 'nothing', relationships: [], confidence: 0.8 } } };
  };

  const results = await decomposeComprehension([A, B, C], known, comprehend);
  const byName = Object.fromEntries(results.map(r => [r.sheetName, r]));

  // read-before-derive: A fully known -> NO LLM call; only B and C residues dispatched
  assert.deepEqual(calledFor.sort(), ['B', 'C']);

  // A: recognized, both atoms claimed, atoms written
  assert.equal(byName.A.status, 'recognized');
  assert.equal(byName.A.knownColumns.length, 2);
  assert.equal(byName.A.atomsToWrite.length, 2);

  // B: comprehended (sibling of the failure proceeds — hold b); known id + new nm:name; atoms written
  assert.equal(byName.B.status, 'comprehended');
  assert.equal(byName.B.comprehendedColumns?.length, 1);
  assert.equal(byName.B.comprehendedColumns?.[0].columnName, 'nm');
  assert.equal(byName.B.comprehendedColumns?.[0].interpretation.data_nature, 'name');
  assert.equal(byName.B.atomsToWrite.length, 2); // id (known) + nm (comprehended)

  // C: failed_interpretation for THIS unit only; HOLD (a) -> writes NO atoms
  assert.equal(byName.C.status, 'failed_interpretation');
  assert.equal(byName.C.failure?.failureClass, 'parse_failure');
  assert.deepEqual(byName.C.atomsToWrite, []);
});

test('fully-recognized workbook -> zero LLM calls', async () => {
  const A = sheet('A', { id: idVals, amt: amtVals });
  const known = new Map<string, KnownAtom>();
  for (const [name, vals] of [['id', idVals], ['amt', amtVals]] as const) {
    const h = computeAtomFingerprint(name, vals).hash;
    known.set(h, { hash: h, role: 'attribute', confidence: 0.9, roleConfidence: 0.9, matchCount: 6 });
  }
  let calls = 0;
  const comprehend: ResidueComprehender = async () => { calls++; return { ok: true, interpretations: {} }; };
  const results = await decomposeComprehension([A], known, comprehend);
  assert.equal(calls, 0);                       // Progressive Performance: known -> no LLM
  assert.equal(results[0].status, 'recognized');
});
