import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findHcEntityIdCandidates,
  selectEntityIdFieldStructural,
} from '../commit-content-unit';

// HF-351 F5 → HF-373 Phase C — entity_id_field selection by STRUCTURAL FACTS.
// Korean Test: the selector reads VALUES only; tests use arbitrary tokens.
// The HF-351 "finest repeating identifier" statistic is DELETED: on a roster it
// structurally inverted (the true id is bijective with rows = 1.0x repeat, so the
// repeat filter excluded it and preferred the self-referential manager FK).

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

// roster sheet: 10 employees, self-referential manager FK (managers ⊂ employees, one blank = CEO).
function rosterRows() {
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 10; i++) {
    rows.push({ ID_Empleado: `E${i}`, ID_Gerente: i === 0 ? '' : `E${i % 3}`, Nombre: `P${i}` });
  }
  return rows;
}

test('HF-373 (THE FIX): roster self-referential manager FK is eliminated by strict value-subset — the true id wins with NO domain and NO repeat statistic', () => {
  const sel = selectEntityIdFieldStructural(['ID_Gerente', 'ID_Empleado'], rosterRows(), new Set(), 'entity');
  assert.equal(sel.chosen, 'ID_Empleado');
  assert.match(sel.reason, /strict value-subset elimination/);
  assert.match(sel.reason, /ID_Gerente/);
});

test('HF-373: entity-sheet bijectivity discriminates when value sets do not nest', () => {
  // two disjoint id-ish columns on an ENTITY sheet: one bijective with rows, one repeating.
  const rows = Array.from({ length: 8 }, (_, i) => ({ subject: `S${i}`, dept: `D${i % 3}x${i % 2}` }));
  // dept values: D0x0,D1x1,D2x0,D0x1,D1x0,D2x1 → 6 distinct over 8 rows (repeats, disjoint from subject)
  const sel = selectEntityIdFieldStructural(['dept', 'subject'], rows, new Set(), 'entity');
  assert.equal(sel.chosen, 'subject');
  assert.match(sel.reason, /bijective with rows/);
});

test('F5 branch (a) preserved: with an entity domain, the seller wins on value-overlap even though the branch out-repeats it', () => {
  const rows = ventasRows();
  const entityDomain = new Set(['S1', 'S2', 'S3', 'S4']); // the roster's external_ids (sellers)
  const sel = selectEntityIdFieldStructural(['grp', 'sel'], rows, entityDomain, 'transaction');
  assert.equal(sel.chosen, 'sel');
  assert.match(sel.reason, /value-domain overlap 100%/);
});

test('single entity-scope candidate is returned unchanged (BCL/Meridian byte-identical)', () => {
  const sel = selectEntityIdFieldStructural(['ID_Empleado'], ventasRows(), new Set(), 'transaction');
  assert.equal(sel.chosen, 'ID_Empleado');
  assert.equal(sel.reason, 'single entity-scope identifier');
});

test('HF-373 (C2): cold-start transaction sheet with disjoint candidates is a LOUD ambiguity — never a repeat-statistic guess, never first-match', () => {
  const rows = ventasRows();
  const sel = selectEntityIdFieldStructural(['grp', 'sel'], rows, new Set(), 'transaction');
  assert.equal(sel.chosen, '');
  assert.match(sel.reason, /ambiguous after structural discrimination/);
  assert.deepEqual(sel.ambiguousCompetitors, ['grp', 'sel']);
});

test('HF-373 (C2): genuinely indistinguishable candidates are a LOUD ambiguity (no first-match fallback)', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ a: `A${i % 5}`, b: `B${i % 5}` }));
  const sel = selectEntityIdFieldStructural(['a', 'b'], rows, new Set(), 'transaction');
  assert.equal(sel.chosen, '');
  assert.ok(sel.ambiguousCompetitors);
});

test('overlap discriminates when domain present: 100% vs 0%', () => {
  const rows = [
    { x: 'P1', y: 'Z1' }, { x: 'P1', y: 'Z2' }, { x: 'P2', y: 'Z3' }, { x: 'P2', y: 'Z4' },
  ];
  const sel = selectEntityIdFieldStructural(['y', 'x'], rows, new Set(['P1', 'P2']), 'transaction');
  assert.equal(sel.chosen, 'x');
});

test('an all-empty candidate column drops by subset elimination', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ real: `R${i}`, ghost: '' }));
  const sel = selectEntityIdFieldStructural(['ghost', 'real'], rows, new Set(), 'entity');
  assert.equal(sel.chosen, 'real');
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
