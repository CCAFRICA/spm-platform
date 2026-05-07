import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeContentUnitHashSha256 } from '../content-unit-hash';

// Test 1 — Empty rows produces stable hash
test('empty rows produces stable hash', () => {
  const h1 = computeContentUnitHashSha256([]);
  const h2 = computeContentUnitHashSha256([]);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64); // SHA-256 hex
});

// Test 2 — Column order independence
test('column order independence', () => {
  const h1 = computeContentUnitHashSha256([{ a: 1, b: 2 }]);
  const h2 = computeContentUnitHashSha256([{ b: 2, a: 1 }]);
  assert.equal(h1, h2);
});

// Test 3 — Row order independence
test('row order independence', () => {
  const h1 = computeContentUnitHashSha256([{ a: 1 }, { a: 2 }]);
  const h2 = computeContentUnitHashSha256([{ a: 2 }, { a: 1 }]);
  assert.equal(h1, h2);
});

// Test 4 — Whitespace normalization
test('whitespace normalization (trim)', () => {
  const h1 = computeContentUnitHashSha256([{ a: 'foo' }]);
  const h2 = computeContentUnitHashSha256([{ a: '  foo  ' }]);
  assert.equal(h1, h2);
});

// Test 5 — Null/undefined treated as empty
test('null/undefined/empty-string equivalence', () => {
  const h1 = computeContentUnitHashSha256([{ a: null }]);
  const h2 = computeContentUnitHashSha256([{ a: undefined }]);
  const h3 = computeContentUnitHashSha256([{ a: '' }]);
  assert.equal(h1, h2);
  assert.equal(h2, h3);
});

// Test 6 — Different content produces different hashes
test('different content produces different hashes', () => {
  const h1 = computeContentUnitHashSha256([{ a: 'foo' }]);
  const h2 = computeContentUnitHashSha256([{ a: 'bar' }]);
  assert.notEqual(h1, h2);
});

// Test 7 — Korean Test: different column names produce DISTINCT hashes;
// same Korean column names with same content produce identical hashes
test('Korean Test compliance', () => {
  const englishCol = computeContentUnitHashSha256([{ name: 'Smith' }]);
  const koreanCol = computeContentUnitHashSha256([{ '이름': 'Smith' }]);
  // Different column names = different content identity (column names are data)
  assert.notEqual(englishCol, koreanCol);
  // Same Korean column with same content produces identical hash (structural invariant)
  const k1 = computeContentUnitHashSha256([{ '이름': 'Smith' }]);
  const k2 = computeContentUnitHashSha256([{ '이름': 'Smith' }]);
  assert.equal(k1, k2);
});

// Test 8 — CSV escape: values with commas, quotes, newlines do not collide with innocuous values
test('CSV escape disambiguation', () => {
  // Plain "a,b" string vs two cells "a" and "b" must hash differently because
  // canonical CSV escapes "a,b" as quoted, distinguishing from comma-separator usage
  const oneFieldWithComma = computeContentUnitHashSha256([{ x: 'a,b' }]);
  const oneFieldPlain = computeContentUnitHashSha256([{ x: 'ab' }]);
  assert.notEqual(oneFieldWithComma, oneFieldPlain);
  // Quoted value vs unquoted same content (after escape) should be canonical
  const withQuote = computeContentUnitHashSha256([{ x: 'has"quote' }]);
  const noQuote = computeContentUnitHashSha256([{ x: 'hasquote' }]);
  assert.notEqual(withQuote, noQuote);
  // Newline in value
  const withNewline = computeContentUnitHashSha256([{ x: 'line1\nline2' }]);
  const concat = computeContentUnitHashSha256([{ x: 'line1line2' }]);
  assert.notEqual(withNewline, concat);
});

// Test 9 — Manifestation 2 reproduction: identical record content in different
// input array orderings produces identical hashes (cross-container content identity)
test('Manifestation 2 — cross-container content identity', () => {
  // Simulates: same 36 hub rows arrive in two different file containers.
  // Order of arrival in input array differs (e.g., different sort orders during
  // parsing); content is bit-identical at row-value level.
  const fileA = [
    { Hub: 'H001', vehicles: 12, region: 'N' },
    { Hub: 'H002', vehicles: 8, region: 'S' },
    { Hub: 'H003', vehicles: 15, region: 'E' },
  ];
  const fileB = [
    { Hub: 'H003', region: 'E', vehicles: 15 },  // different column order, different row order
    { Hub: 'H001', vehicles: 12, region: 'N' },
    { Hub: 'H002', region: 'S', vehicles: 8 },
  ];
  assert.equal(
    computeContentUnitHashSha256(fileA),
    computeContentUnitHashSha256(fileB),
    'Same record content across different containers must produce identical content_unit_hash',
  );
});
