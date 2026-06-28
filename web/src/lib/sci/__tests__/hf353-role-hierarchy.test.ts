import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHierarchyRoles,
  buildRoleBasedHierarchyEdges,
  normalizeEntityRef,
} from '../post-commit-construction';

// HF-353 P-B — role-based hierarchy edges. Korean Test: reads HC structuralType roles,
// NEVER column names. Proven on the merged-header `__EMPTY` shape (the Robles Jerarquia).

// The Jerarquia field_identities shape (per-sheet HC roles on every committed row).
const FI = {
  __EMPTY: { structuralType: 'name', contextualIdentity: 'the full name of the entity' },
  __EMPTY_1: { structuralType: 'categorical', contextualIdentity: 'the role or position' },
  __EMPTY_2: { structuralType: 'reference / relational pointer', contextualIdentity: 'the parent entity this entity reports to — defines the directed edge' },
  __EMPTY_3: { structuralType: 'categorical', contextualIdentity: 'the tipo de relacion (vertical/overlay)' },
  'Banner — Aristas': { structuralType: 'identifier', contextualIdentity: 'the entity id' },
};

test('P-B: detects roles from __EMPTY columns — target=reference-pointer, type=relationship categorical, source=identifier', () => {
  const roles = detectHierarchyRoles(FI, 'Banner — Aristas');
  assert.ok(roles);
  assert.equal(roles!.targetCol, '__EMPTY_2');     // the reference/relational pointer
  assert.equal(roles!.typeCol, '__EMPTY_3');       // categorical whose identity mentions "relacion"
  assert.equal(roles!.sourceCol, 'Banner — Aristas');
});

test('P-B: a sheet with NO reference/relational-pointer role → null (not a hierarchy edge sheet)', () => {
  const roster = {
    id: { structuralType: 'identifier' }, name: { structuralType: 'name' },
    zone: { structuralType: 'categorical' }, rate: { structuralType: 'measure' },
  };
  assert.equal(detectHierarchyRoles(roster, 'id'), null);
});

test('P-B: the type column prefers the relationship-descriptor categorical over a role categorical', () => {
  const fi = {
    p: { structuralType: 'reference pointer', contextualIdentity: 'reports to' },
    role: { structuralType: 'categorical', contextualIdentity: 'the job role' },
    kind: { structuralType: 'categorical', contextualIdentity: 'the type of relationship — vertical or overlay' },
  };
  assert.equal(detectHierarchyRoles(fi, 'idcol')!.typeCol, 'kind');
});

test('P-B: builds source→target edges (source=row entity_id, target=resolved pointer, type=categorical); "—"/self/unresolved handled', () => {
  const resolve = (v: string): string | null => {
    const m: Record<string, string> = { 'ENT-A': 'uA', '카르멘 (지점)': 'uB', '베로니카': 'uA', '루시아': 'uC' };
    return m[normalizeEntityRef(v)] ?? m[v.trim()] ?? null;
  };
  const roles = { sourceCol: 'Banner — Aristas', targetCol: '__EMPTY_2', typeCol: '__EMPTY_3' };
  const rows = [
    { row_data: { '__EMPTY': '베로니카', '__EMPTY_2': '카르멘 (지점)', '__EMPTY_3': 'Vertical', 'Banner — Aristas': 'ENT-A' }, entity_id: 'uA' },
    { row_data: { '__EMPTY_2': '루시아', '__EMPTY_3': 'Vertical' }, entity_id: 'uC' },          // self-loop (uC→uC) → skipped
    { row_data: { '__EMPTY_2': '—', '__EMPTY_3': '' }, entity_id: 'uD' },                      // director: no reports-to → skipped
    { row_data: { '__EMPTY_2': 'unknown person', '__EMPTY_3': 'Vertical' }, entity_id: 'uE' }, // unresolved target
  ];
  const { edges, unresolvedTargets } = buildRoleBasedHierarchyEdges(rows, roles, resolve, 't1', '2026-06-28T00:00:00Z');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].source_entity_id, 'uA');
  assert.equal(edges[0].target_entity_id, 'uB');   // 카르멘 resolved (parenthetical stripped)
  assert.equal(edges[0].relationship_type, 'Vertical');
  assert.equal(edges[0].source, 'imported_explicit');
  assert.equal(unresolvedTargets, 1);              // 'unknown person'
});

test('normalizeEntityRef strips parentheticals + casefolds + collapses spaces', () => {
  assert.equal(normalizeEntityRef('Carmen Delgado Rios (SUC-CDMX)'), 'carmen delgado rios');
  assert.equal(normalizeEntityRef('  Lucia   MORALES '), 'lucia morales');
});
