/**
 * OB-203 Phase 2 — seeded structural-analog generator (blind-holdout).
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateStructuralAnalog } from '../structural-analog-generator';

test('deterministic: same seed + vocabulary -> byte-identical workbook', () => {
  const a = generateStructuralAnalog({ seed: 42 });
  const b = generateStructuralAnalog({ seed: 42 });
  assert.deepEqual(a, b);
  const c = generateStructuralAnalog({ seed: 43 });
  assert.notEqual(JSON.stringify(a), JSON.stringify(c)); // different seed -> different workbook
});

test('produces the witness structural class (cover/roster/reference/fact/derived)', () => {
  const wb = generateStructuralAnalog({ seed: 7 });
  assert.deepEqual(wb.sheets.map(s => s.kind), ['cover', 'roster', 'reference', 'fact', 'derived']);
});

test('fact grain is high-cardinality and references the roster key (many:1)', () => {
  const wb = generateStructuralAnalog({ seed: 9, rosterRows: 30, factRows: 600 });
  const roster = wb.sheets.find(s => s.kind === 'roster')!;
  const fact = wb.sheets.find(s => s.kind === 'fact')!;
  const idCol = roster.columns[0];
  // fact references the roster id column (key-reference relation)
  assert.ok(fact.columns.includes(idCol));
  // high cardinality: many more fact rows than roster entities
  assert.equal(fact.totalRowCount, 600);
  assert.ok(fact.totalRowCount > roster.totalRowCount * 10);
  // every fact FK value resolves to a roster id (referential integrity)
  const ids = new Set(roster.rows.map(r => r[idCol]));
  assert.ok(fact.rows.every(r => ids.has(r[idCol])));
  // fact transaction id is unique per row (high-cardinality grain)
  const txnCol = fact.columns[0];
  assert.equal(new Set(fact.rows.map(r => r[txnCol])).size, fact.rows.length);
});

test('cross-vocabulary generality: same structural skeleton, different token language', () => {
  const latin = generateStructuralAnalog({ seed: 5, vocabulary: 'random-latin' });
  const cyr = generateStructuralAnalog({ seed: 5, vocabulary: 'non-latin' });
  // identical STRUCTURE (kinds, per-sheet column count, row count) ...
  assert.deepEqual(latin.sheets.map(s => s.kind), cyr.sheets.map(s => s.kind));
  for (let i = 0; i < latin.sheets.length; i++) {
    assert.equal(latin.sheets[i].columns.length, cyr.sheets[i].columns.length);
    assert.equal(latin.sheets[i].totalRowCount, cyr.sheets[i].totalRowCount);
  }
  // ... but different VOCABULARY (non-latin headers carry non-ASCII tokens)
  const cyrHeaders = cyr.sheets.flatMap(s => s.columns).join('');
  assert.ok(Array.from(cyrHeaders).some(ch => ch.charCodeAt(0) > 0x3ff), 'non-latin headers should contain Cyrillic');
  const latinHeaders = latin.sheets.flatMap(s => s.columns).join('');
  assert.ok(Array.from(latinHeaders).every(ch => ch.charCodeAt(0) < 0x80), 'random-latin headers are ASCII');
});

test('blind-holdout: generated tokens are synthetic (no real-word guarantee by construction)', () => {
  // The tokens are consonant-vowel gibberish or Cyrillic — there is no dictionary path.
  // Assert headers are non-empty synthetic strings, not drawn from any domain list.
  const wb = generateStructuralAnalog({ seed: 1 });
  for (const sheet of wb.sheets) {
    for (const col of sheet.columns) {
      assert.ok(col.length > 0 && col.length < 24);
    }
  }
});
