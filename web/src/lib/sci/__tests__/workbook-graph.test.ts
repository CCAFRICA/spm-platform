/**
 * OB-203 Phase 6 — workbook graph synthesis (DI-3 structural, DI-4 total). Runner: node --test --import tsx.
 * Centerpiece: the D3 contextual-role resolution that fixes the spurious-entity mechanism — a
 * reference_key whose values reference NO roster identifier is not an entity foreign key.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { synthesizeWorkbookGraph, type SheetSummary } from '../workbook-graph';

const ids = (n: number, prefix = 'E') => new Set(Array.from({ length: n }, (_, i) => `${prefix}${1000 + i}`));
const base = (over: Partial<SheetSummary>): SheetSummary => ({
  unitId: over.sheetName!, sheetName: over.sheetName!, classification: 'reference',
  identifierColumns: [], referenceKeyColumns: [], atomHashes: [], rowCount: 0, idRepeatRatio: 1, hasMeasure: false, ...over,
});

test('D3: a reference_key referencing NO roster is NOT an entity FK (the Codigo_Turno fix)', () => {
  const roster = base({ sheetName: 'Empleados', classification: 'entity', identifierColumns: [{ column: 'No_Empleado', values: ids(50) }], rowCount: 50, idRepeatRatio: 1.0, atomHashes: ['h_emp', 'h_name'] });
  const fact = base({
    sheetName: 'Datos', classification: 'transaction',
    identifierColumns: [{ column: 'No_Empleado', values: ids(50) }],
    referenceKeyColumns: [{ column: 'Codigo_Turno', values: new Set(['VES-A1', 'MIX-A2', 'MAT-B2']) }],
    rowCount: 200, idRepeatRatio: 4.02, hasMeasure: true, atomHashes: ['h_emp', 'h_meas'],
  });
  const g = synthesizeWorkbookGraph([roster, fact]);

  assert.equal(g.roles['Empleados'], 'roster');
  assert.equal(g.roles['Datos'], 'fact');
  assert.ok(g.edges.some(e => e.fromSheet === 'Datos' && e.toSheet === 'Empleados'));
  // the D3 answer: Codigo_Turno references no roster → spurious-entity creation must be suppressed
  const codigo = g.referenceKeyResolution['Datos'].find(r => r.column === 'Codigo_Turno')!;
  assert.equal(codigo.referencesRoster, false);
  assert.equal(codigo.bestOverlap, 0);
});

test('a reference_key that DOES overlap a roster identifier IS an entity FK', () => {
  const empleados = base({ sheetName: 'Empleados', classification: 'entity', identifierColumns: [{ column: 'No_Empleado', values: ids(50) }], rowCount: 50, idRepeatRatio: 1.0 });
  const hubs = base({ sheetName: 'Hubs', classification: 'reference', identifierColumns: [{ column: 'Hub_id', values: new Set(['VES-A1', 'MIX-A2', 'MAT-B2']) }], rowCount: 3, idRepeatRatio: 1.0 });
  const fact = base({
    sheetName: 'Datos', classification: 'transaction',
    identifierColumns: [{ column: 'No_Empleado', values: ids(50) }],
    referenceKeyColumns: [{ column: 'Hub_ref', values: new Set(['VES-A1', 'MIX-A2', 'MAT-B2']) }],
    rowCount: 200, idRepeatRatio: 4.02, hasMeasure: true,
  });
  const g = synthesizeWorkbookGraph([empleados, hubs, fact]);
  const ref = g.referenceKeyResolution['Datos'].find(r => r.column === 'Hub_ref')!;
  assert.equal(ref.referencesRoster, true);          // overlaps the Hubs roster
  assert.equal(ref.rosterSheet, 'Hubs');
});

test('a categorical lookup with no identifier → reference role', () => {
  const fact = base({ sheetName: 'Datos', classification: 'transaction', identifierColumns: [{ column: 'No_Empleado', values: ids(50) }], referenceKeyColumns: [], rowCount: 200, idRepeatRatio: 4.0, hasMeasure: true });
  const roster = base({ sheetName: 'Emp', classification: 'entity', identifierColumns: [{ column: 'No_Empleado', values: ids(50) }], rowCount: 50, idRepeatRatio: 1.0 });
  const lookup = base({ sheetName: 'Tarifas', classification: 'reference', identifierColumns: [], referenceKeyColumns: [], rowCount: 12, idRepeatRatio: 1.0, hasMeasure: true, atomHashes: ['h_rate'] });
  const g = synthesizeWorkbookGraph([fact, roster, lookup]);
  assert.equal(g.roles['Tarifas'], 'reference');
});

test('a sheet that aggregates the fact grain → derived (flag-only)', () => {
  const roster = base({ sheetName: 'Emp', classification: 'entity', identifierColumns: [{ column: 'No_Empleado', values: ids(50) }], rowCount: 50, idRepeatRatio: 1.0 });
  const fact = base({ sheetName: 'Datos', classification: 'transaction', identifierColumns: [{ column: 'No_Empleado', values: ids(50) }], rowCount: 200, idRepeatRatio: 4.0, hasMeasure: true, atomHashes: ['h_meas', 'h_emp'] });
  const resumen = base({ sheetName: 'Resumen', classification: 'reference', identifierColumns: [], rowCount: 10, idRepeatRatio: 1.0, hasMeasure: true, atomHashes: ['h_meas'] });
  const g = synthesizeWorkbookGraph([roster, fact, resumen]);
  assert.equal(g.roles['Datos'], 'fact');
  assert.equal(g.roles['Resumen'], 'derived');
});

test('DI-4 totality: empty + malformed summaries never throw; unrelated → unknown', () => {
  assert.deepEqual(synthesizeWorkbookGraph([]).roles, {});
  const lone = base({ sheetName: 'X', identifierColumns: [{ column: 'k', values: ids(3) }], rowCount: 3, idRepeatRatio: 1.0 });
  const g = synthesizeWorkbookGraph([lone]);
  assert.equal(g.roles['X'], 'unknown');   // nothing to relate to, but no failure
});
