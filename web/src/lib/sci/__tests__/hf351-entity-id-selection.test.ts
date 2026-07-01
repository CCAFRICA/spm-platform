import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findHcEntityIdCandidates,
  findHcEntityIdColumn,
  selectEntityIdFieldByOverlap,
} from '../commit-content-unit';

// HF-351 F5 — entity_id_field selection by value-domain overlap (the class fix).
// Korean Test: the selector reads VALUES only; tests use arbitrary tokens. A branch
// column (`grp`) that REPEATS MORE than the seller (`sel`) must still LOSE — proving
// value-domain overlap, not cardinality, is the discriminator (the MIR/Robles trap).

// transaction sheet: 12 rows, 4 sellers, 2 branches; a unique per-row event id.
function ventasRows() {
  const sellers = ['S1', 'S2', 'S3', 'S4'];
  const branches = ['B1', 'B2'];
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 12; i++) {
    rows.push({ folio: `F${i}`, sel: sellers[i % 4], grp: branches[i % 2], amount: 100 + i });
  }
  return rows;
}

test('F5 (THE FIX): with an entity domain, the seller wins on value-overlap even though the branch out-repeats it', () => {
  const rows = ventasRows();
  // grp (branch) repeats 6x (12/2); sel (seller) repeats 3x (12/4) — cardinality alone picks grp.
  const entityDomain = new Set(['S1', 'S2', 'S3', 'S4']); // the roster's external_ids (sellers)
  const sel = selectEntityIdFieldByOverlap(['grp', 'sel'], rows, entityDomain);
  assert.equal(sel.chosen, 'sel');               // seller, not branch
  assert.match(sel.reason, /value-domain overlap 100%/);
});

test('F5: a single entity-scope candidate is returned unchanged (BCL/Meridian byte-identical)', () => {
  const sel = selectEntityIdFieldByOverlap(['ID_Empleado'], ventasRows(), new Set());
  assert.equal(sel.chosen, 'ID_Empleado');
  assert.equal(sel.reason, 'single entity-scope identifier');
});

test('F5 cold-start (empty domain): the finer-grained repeating identifier wins (seller over branch)', () => {
  const rows = ventasRows();
  // no entity domain yet (transaction imported before the roster) → fall to cardinality:
  // grp distinct=2, sel distinct=4 — the finer-grained (more distinct) repeating id is the entity.
  const sel = selectEntityIdFieldByOverlap(['grp', 'sel'], rows, new Set());
  assert.equal(sel.chosen, 'sel');
  assert.match(sel.reason, /finest repeating identifier/);
});

test('F5 (C2): genuinely ambiguous (empty domain, equal distinct) → first-match fallback, flagged', () => {
  // two identifiers with identical cardinality and no domain — nothing to separate them
  const rows = Array.from({ length: 10 }, (_, i) => ({ a: `A${i % 5}`, b: `B${i % 5}` }));
  const sel = selectEntityIdFieldByOverlap(['a', 'b'], rows, new Set());
  assert.equal(sel.chosen, 'a'); // first, preserving prior behavior — never silently worse
  assert.match(sel.reason, /ambiguous/);
});

test('F5: overlap beats a higher-overlap-but-not-quite tie — domain present but a candidate matches more', () => {
  const rows = [
    { x: 'P1', y: 'Z1' }, { x: 'P1', y: 'Z2' }, { x: 'P2', y: 'Z3' }, { x: 'P2', y: 'Z4' },
  ];
  // domain = {P1,P2}; x overlaps 100%, y overlaps 0%
  const sel = selectEntityIdFieldByOverlap(['y', 'x'], rows, new Set(['P1', 'P2']));
  assert.equal(sel.chosen, 'x');
});

// ── candidate collection from the HC trace ──

// HF-368: the resolver reads the MODEL's BARE primitives (scope_role/nature_role), not prose.
const trace = (cols: Record<string, { scope_role?: string; nature_role?: string; confidence?: number }>) => ({
  headerComprehension: { interpretations: cols },
});

test('findHcEntityIdCandidates: returns ALL entity-scope identifiers; excludes txn-scope + low-confidence', () => {
  const t = trace({
    DNI_Vendedor: { scope_role: 'entity', nature_role: 'identifier', confidence: 0.99 },
    Almacen: { scope_role: 'entity', nature_role: 'identifier', confidence: 0.95 },
    Folio: { scope_role: 'transaction', nature_role: 'identifier', confidence: 0.98 }, // txn-scope → excluded
    Nombre: { scope_role: 'entity', nature_role: 'name', confidence: 0.97 },           // name nature → excluded
    Weak: { scope_role: 'entity', nature_role: 'identifier', confidence: 0.50 },        // < threshold → excluded
  });
  const cands = findHcEntityIdCandidates(t);
  assert.deepEqual(cands, ['DNI_Vendedor', 'Almacen']);
});

test('findHcEntityIdColumn (backward compat) returns the FIRST candidate (single-candidate path unchanged)', () => {
  const t = trace({ ID_Empleado: { scope_role: 'entity', nature_role: 'identifier', confidence: 0.99 } });
  assert.equal(findHcEntityIdColumn(t), 'ID_Empleado');
  assert.equal(findHcEntityIdColumn(undefined), null);
});
