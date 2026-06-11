/**
 * OB-203 Phase 2 — read-before-derive comprehension planner (DI-2 / EPG-2.2).
 * Runner: node --test --import tsx. Tests run against the seeded structural-analog generator.
 *
 * PRESERVATION-WITNESS SUBSTITUTION (architect disposition 2026-06-11, item 2):
 * Phase 1's BYTE-IDENTICAL comprehension witness no longer applies — Phase 2 LEGITIMATELY changes
 * comprehension behavior (known atoms claim roles WITHOUT an LLM dispatch). What must remain stable,
 * and what these tests instead witness, is: (a) the proposal payload CONTRACT for the enumerated
 * consumers (ContentUnitProposal shape — unchanged; the planner emits separate plan data, never
 * mutating the proposal type), and (b) the Phase 1 failure-surface semantics (failed_interpretation
 * still the named, durable outcome). The preservation story is substituted, not silently redefined.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { planSheetComprehension, buildBoundedComprehensionInput } from '../comprehension-planner';
import { computeAtomFingerprint } from '../atom-fingerprint';
import type { KnownAtom } from '../atom-flywheel';
import { generateStructuralAnalog } from '../structural-analog-generator';

// Note: structurally-identical columns share ONE atom hash by construction (that IS an atom —
// recognized across columns). To exercise known/novel mapping we need columns of DISTINCT shape;
// the generator's fact sheet provides them (id / fk / date / int-measure / decimal-measure). The
// numeric "28 known + 2 novel -> residue 2" claim is proven at the atom level by
// computeNovelResidue (atom-fingerprint.test.ts); here we prove the PLANNER maps them correctly.
const seedKnown = (cols: string[], rows: Record<string, unknown>[], role = 'attribute') => {
  const m = new Map<string, KnownAtom>();
  for (const c of cols) {
    const fp = computeAtomFingerprint(c, rows.map(r => r[c]));
    m.set(fp.hash, { hash: fp.hash, role, confidence: 0.85, matchCount: 5 });
  }
  return m;
};

test('DI-2 read-before-derive: known atoms claimed, residue is exactly the novel columns', () => {
  const fact = generateStructuralAnalog({ seed: 33 }).sheets.find(s => s.kind === 'fact')!;
  const cols = fact.columns; // 5 distinct-shape atoms
  // pre-know 3 of them; the other 2 are novel residue
  const known = seedKnown([cols[0], cols[2], cols[3]], fact.rows);
  const plan = planSheetComprehension(fact.sheetName, cols, fact.rows, known);
  assert.equal(plan.knownColumns.length, 3);
  assert.deepEqual(plan.novelColumns.sort(), [cols[1], cols[4]].sort()); // exactly the 2 not pre-known
  assert.equal(plan.recognizedFraction, 3 / 5);
});

test('EPG-2.2 payload-bound: comprehension input covers ONLY novel columns, sample-bounded', () => {
  const fact = generateStructuralAnalog({ seed: 34, factRows: 900 }).sheets.find(s => s.kind === 'fact')!;
  const cols = fact.columns;
  const known = seedKnown([cols[0], cols[2], cols[3]], fact.rows);
  const plan = planSheetComprehension(fact.sheetName, cols, fact.rows, known);
  const input = buildBoundedComprehensionInput(plan, fact.rows)!;
  assert.deepEqual(input.columns.sort(), [cols[1], cols[4]].sort()); // O(novel atoms), not O(known structure)
  assert.ok(input.sampleRows.length <= 5);                            // never O(rows) — even at 900 rows
  for (const sr of input.sampleRows) {
    assert.deepEqual(Object.keys(sr).sort(), [cols[1], cols[4]].sort()); // projected to novel only
  }
});

test('EPG-2.2 (most-known witness): wide sheet, MOST atoms known + FEW novel -> O(novel) input', () => {
  // The O(novel) case the architect requires on the record (item 3): not cold-start — most atoms
  // are already known; comprehension cost tracks ONLY the few novel atoms, not the sheet width.
  const fact = generateStructuralAnalog({ seed: 40, factRows: 700 }).sheets.find(s => s.kind === 'fact')!;
  const known = seedKnown(fact.columns, fact.rows); // learn ALL fact atoms (most-known)
  const novelA = 'zz_flag', novelB = 'zz_sparse';
  const cols = [...fact.columns, novelA, novelB];   // augment with 2 novel-shape columns
  const rows = fact.rows.map((r, i) => ({ ...r, [novelA]: i % 2 === 0, [novelB]: i % 9 === 0 ? 'x' : null }));
  const plan = planSheetComprehension(fact.sheetName, cols, rows, known);
  assert.equal(plan.knownColumns.length, fact.columns.length);          // most known (5 of 7)
  assert.deepEqual(plan.novelColumns.sort(), [novelA, novelB].sort());  // few novel (2)
  const input = buildBoundedComprehensionInput(plan, rows)!;
  assert.deepEqual(input.columns.sort(), [novelA, novelB].sort());      // O(novel)=2, NOT O(width)=7
  assert.ok(input.sampleRows.length <= 5);                              // NOT O(rows)=700
  assert.ok(plan.recognizedFraction > 0.7);                            // most-known witness
});

test('fully-recognized sheet -> NO comprehension dispatch (null input)', () => {
  const fact = generateStructuralAnalog({ seed: 35 }).sheets.find(s => s.kind === 'fact')!;
  const known = seedKnown(fact.columns, fact.rows);
  const plan = planSheetComprehension(fact.sheetName, fact.columns, fact.rows, known);
  assert.equal(plan.novelColumns.length, 0);
  assert.equal(plan.recognizedFraction, 1);
  assert.equal(buildBoundedComprehensionInput(plan, fact.rows), null); // zero LLM
});

test('partial recognition on a generated analog: known atoms claim roles amid novel neighbors', () => {
  const wb = generateStructuralAnalog({ seed: 21 });
  const fact = wb.sheets.find(s => s.kind === 'fact')!;
  // pre-know the fact's id + date atoms only; the measures are novel
  const known = new Map<string, KnownAtom>();
  for (const c of [fact.columns[0], fact.columns[2]]) {
    const fp = computeAtomFingerprint(c, fact.rows.map(r => r[c]));
    known.set(fp.hash, { hash: fp.hash, role: c === fact.columns[2] ? 'temporal' : 'identifier', confidence: 0.85, matchCount: 5 });
  }
  const plan = planSheetComprehension(fact.sheetName, fact.columns, fact.rows, known);
  // the two pre-known atoms are claimed regardless of the novel measure neighbors
  assert.equal(plan.knownColumns.length, 2);
  assert.ok(plan.knownColumns.some(k => k.role === 'temporal'));
  assert.ok(plan.novelColumns.length >= 1); // the measures remain residue
});
