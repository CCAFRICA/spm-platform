// OB-254 — Structural Construction Stage invariants (regression guard for the EPG-2 / DD-7 properties).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { constructStructure, type ConstructionResult } from '../structural-construction';

const records = (r: ConstructionResult) => r.units.find((u) => u.kind === 'records')!;

test('OB-254: clean sheet (header at row 1) is the IDENTITY transform — no sections, real header, rows kept', () => {
  const grid: unknown[][] = [
    ['Name', 'Region', 'Amount'],
    ['Alice', 'North', 100],
    ['Bob', 'South', 200],
    ['Cara', 'North', 300],
  ];
  const r = constructStructure(grid, { fullGrid: true, defvalEmpty: true });
  const rec = records(r);
  assert.deepEqual(rec.header, ['Name', 'Region', 'Amount']);
  assert.equal(rec.rows.length, 3);
  assert.deepEqual(rec.rows[0], { Name: 'Alice', Region: 'North', Amount: 100 });
  assert.equal(r.sidecar.filter((s) => s.reason === 'SECTION_LABEL').length, 0);
  assert.equal(rec.header.some((h) => h.includes('__EMPTY')), false);
});

test('OB-254: defvalEmpty preserves a PRESENT blank (space-padded) cell raw; an ABSENT cell becomes ""', () => {
  const grid: unknown[][] = [
    ['A', 'B', 'C'],
    ['x', '   ', null],
  ];
  const rec = records(constructStructure(grid, { fullGrid: true, defvalEmpty: true }));
  assert.deepEqual(rec.rows[0], { A: 'x', B: '   ', C: '' }); // spaces preserved, absent -> ''
});

test('OB-254: a blank header column gets a positional name, NEVER __EMPTY', () => {
  const grid: unknown[][] = [
    ['Name', null, 'Amount'],
    ['Alice', 'North', 100],
  ];
  const rec = records(constructStructure(grid, { fullGrid: true }));
  assert.deepEqual(rec.header, ['Name', 'col_2', 'Amount']);
  assert.equal(rec.header.some((h) => h.includes('__EMPTY')), false);
});

test('OB-254: a banner above the header is sidecar\'d (never a record, never merged into the header)', () => {
  const grid: unknown[][] = [
    ['QUARTERLY REPORT', null, null],
    ['Name', 'Region', 'Amount'],
    ['Alice', 'North', 100],
  ];
  const r = constructStructure(grid, { fullGrid: true });
  assert.deepEqual(records(r).header, ['Name', 'Region', 'Amount']);
  assert.equal(records(r).rows.length, 1);
  assert.equal(r.sidecar.some((s) => s.sourceRowIndex === 0), true);
});

test('OB-254: banded report — section lifts to __section; repeated header + carry-everything hold', () => {
  const grid: unknown[][] = [
    ['Name', 'Region', 'Amount'],
    ['NORTH BRANCH', null, null], // section label (narrow, text-first, no measure value)
    ['Alice', 'North', 100],
    ['Bob', 'North', 200],
    ['Name', 'Region', 'Amount'], // repeated header
    ['SOUTH BRANCH', null, null], // section label
    ['Cara', 'South', 300],
  ];
  const r = constructStructure(grid, { fullGrid: true });
  const rec = records(r);
  assert.equal(rec.rows.every((row) => typeof row['__section'] === 'string'), true);
  const sections = Array.from(new Set(rec.rows.map((row) => row['__section'])));
  assert.ok(sections.includes('NORTH BRANCH'));
  assert.ok(sections.includes('SOUTH BRANCH'));
  assert.deepEqual(rec.rows.map((row) => row['Name']), ['Alice', 'Bob', 'Cara']);
  assert.equal(r.sidecar.some((s) => s.reason === 'REPEATED_HEADER'), true);
  // Carry Everything: every source row is accounted for — a record or in the sidecar (nothing dropped).
  assert.equal(rec.rows.length + r.sidecar.length, grid.length);
});

// ── HF-366: all-text records sheet (an employee/customer roster with alphanumeric IDs, text dates, and NO
//    numeric measure value) must NOT be mis-read as one giant header. Before the fix, the mostly-text HEADER
//    rule fired on EVERY row, firstDataIdx was -1, and 0 records were produced (the BCL Plantilla regression).
test('HF-366: all-text roster (no numeric cell anywhere) yields records, header is row 1', () => {
  const header = ['ID_Empleado', 'Nombre_Completo', 'Cargo', 'Nivel_Cargo', 'Sucursal_ID', 'Fecha_Ingreso', 'ID_Gerente', 'Region'];
  const grid: unknown[][] = [header];
  for (let i = 1; i <= 12; i++) {
    grid.push([`EMP${String(i).padStart(3, '0')}`, `Nombre ${i}`, ['Gerente', 'Vendedor', 'Cajero'][i % 3], ['N1', 'N2', 'N3'][i % 3], `SUC${String((i % 9) + 1).padStart(2, '0')}`, `2020-0${(i % 9) + 1}-15`, `EMP${String((i % 5) + 1).padStart(3, '0')}`, ['Norte', 'Sur'][i % 2]]);
  }
  const rec = records(constructStructure(grid, { fullGrid: true, defvalEmpty: true }));
  assert.equal(rec.rows.length, 12);
  assert.deepEqual(rec.header, header); // clean names, NOT the concatenation of every column value
  assert.equal(rec.rows[0]['ID_Empleado'], 'EMP001');
  assert.equal(rec.header.some((h) => h.includes('__EMPTY')), false);
});

test('HF-366: all-text roster with a title banner above the header keeps 1 header row + records', () => {
  const header = ['ID_Empleado', 'Nombre_Completo', 'Cargo', 'Region'];
  const grid: unknown[][] = [['PLANTILLA DE PERSONAL', null, null, null], header];
  for (let i = 1; i <= 6; i++) grid.push([`EMP${i}`, `Nombre ${i}`, 'Vendedor', 'Sur']);
  const r = constructStructure(grid, { fullGrid: true, defvalEmpty: true });
  const rec = records(r);
  assert.equal(rec.rows.length, 6);
  assert.equal(rec.header[0], 'ID_Empleado');
  assert.equal(r.sidecar.some((s) => s.sourceRowIndex === 0), true); // banner sidecar'd
});

test('HF-366: an all-text header REPEATED verbatim mid-sheet is a repeated header (sidecar), not a record', () => {
  const header = ['ID_Empleado', 'Nombre_Completo', 'Cargo', 'Region'];
  const grid: unknown[][] = [header];
  for (let i = 1; i <= 4; i++) grid.push([`EMP${i}`, `N ${i}`, 'Cajero', 'Norte']);
  grid.push([...header]); // repeated header verbatim
  for (let i = 5; i <= 8; i++) grid.push([`EMP${i}`, `N ${i}`, 'Cajero', 'Sur']);
  const r = constructStructure(grid, { fullGrid: true, defvalEmpty: true });
  const rec = records(r);
  assert.equal(rec.rows.length, 8); // 8 employees, the repeated header is NOT one of them
  assert.equal(r.sidecar.some((s) => s.reason === 'REPEATED_HEADER'), true);
  assert.equal(rec.rows.length + r.sidecar.length, grid.length); // Carry Everything
});
