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
