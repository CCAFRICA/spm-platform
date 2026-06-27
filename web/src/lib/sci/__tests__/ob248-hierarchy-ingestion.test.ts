import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectHierarchyEdges, buildHierarchyEdges } from '../post-commit-construction';

// OB-248 P-I1 — hierarchy ingestion. Structural detection + directed/typed/temporal
// edge construction. Korean Test: arbitrary tokens; detection is value-overlap +
// cardinality only, never column names.

const individualExtIds = new Set(['E1', 'E2', 'E3', 'E4', 'M1', 'M2', 'D1']);
const byExtId = new Map<string, { id: string }>([
  ['E1', { id: 'u-e1' }], ['E2', { id: 'u-e2' }], ['E3', { id: 'u-e3' }], ['E4', { id: 'u-e4' }],
  ['M1', { id: 'u-m1' }], ['M2', { id: 'u-m2' }], ['D1', { id: 'u-d1' }],
]);

// reporting sheet: each row = a person + their manager + a relationship label
const hierRows = [
  { 사원: 'E1', 상사: 'M1', 관계: '보고', _r: 0 },
  { 사원: 'E2', 상사: 'M1', 관계: '보고', _r: 1 },
  { 사원: 'E3', 상사: 'M2', 관계: '보고', _r: 2 },
  { 사원: 'E4', 상사: 'M2', 관계: '보고', _r: 3 },
  { 사원: 'M1', 상사: 'D1', 관계: '보고', _r: 4 },
  { 사원: 'M2', 상사: 'D1', 관계: '보고', _r: 5 },
];

test('P-I1: detects child (high-cardinality) and parent (repeating) entity columns + the type column', () => {
  const d = detectHierarchyEdges(hierRows, individualExtIds);
  assert.ok(d);
  assert.equal(d!.childCol, '사원');   // 6 distinct (≈1:1)
  assert.equal(d!.parentCol, '상사');  // 3 distinct (repeats)
  assert.equal(d!.typeCol, '관계');    // low-cardinality non-numeric label
});

test('P-I1: a non-hierarchy sheet (one entity column) is not detected → no-op (neutrality)', () => {
  const txn = [{ 사원: 'E1', 금액: 1000 }, { 사원: 'E2', 금액: 2000 }];
  assert.equal(detectHierarchyEdges(txn, individualExtIds), null);
});

test('P-I1: builds directed child→parent edges, typed from the data, deduped, self/unknown skipped', () => {
  const d = detectHierarchyEdges(hierRows, individualExtIds)!;
  const edges = buildHierarchyEdges(hierRows, d, byExtId, 't1', '', '2026-06-27T00:00:00Z');
  assert.equal(edges.length, 6);
  // orientation: source = subordinate (child), target = supervisor (parent)
  const e1 = edges.find(e => e.source_entity_id === 'u-e1')!;
  assert.equal(e1.target_entity_id, 'u-m1');
  assert.equal(e1.relationship_type, '보고'); // open-vocab type from the data
  assert.equal(e1.source, 'imported_explicit');
  assert.equal(e1.effective_from, '2026-06-27T00:00:00Z'); // temporal
  // a distribution originator (E1) walks UP via outbound edges: E1→M1→D1 present
  assert.ok(edges.some(e => e.source_entity_id === 'u-m1' && e.target_entity_id === 'u-d1'));
});

test('P-I1: with no type column, the recognized characterization types the edges; absent both → skipped (C2)', () => {
  const noTypeRows = hierRows.map(({ 관계, ...rest }) => rest); // drop the label column
  const d = detectHierarchyEdges(noTypeRows, individualExtIds)!;
  assert.equal(d.typeCol, null);
  // recognized characterization supplied → edges typed by it
  const typed = buildHierarchyEdges(noTypeRows, d, byExtId, 't1', 'oversees', '2026-06-27T00:00:00Z');
  assert.equal(typed.length, 6);
  assert.ok(typed.every(e => e.relationship_type === 'oversees'));
  // neither typeCol nor recognized type → no fabricated edges (C2)
  const none = buildHierarchyEdges(noTypeRows, d, byExtId, 't1', '', '2026-06-27T00:00:00Z');
  assert.equal(none.length, 0);
});
