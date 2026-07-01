/**
 * HF-372 Phase B — deterministic rate-matrix construction.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseNumericCell, parseRateMatrixRecognition, constructRateMatrixIntent,
  RateMatrixConstructionError,
} from '../rate-matrix-construction';
import { validateComponentIntent } from '../../calculation/prime-validator';

// A BCL-shaped 2D grid: compliance bands × quality bands, two __section variants.
const GRID = {
  columns: ['Cumplimiento \\ Calidad', '<0.70', '0.70-0.80', '0.80-0.90', '0.90-0.95', '≥0.95', '__section'],
  rows: [
    { 'Cumplimiento \\ Calidad': '<80%', '<0.70': '$0', '0.70-0.80': '$40', '0.80-0.90': '$60', '0.90-0.95': '$80', '≥0.95': '$100', '__section': 'EJECUTIVO' },
    { 'Cumplimiento \\ Calidad': '80%-99.9%', '<0.70': '$80', '0.70-0.80': '$120', '0.80-0.90': '$180', '0.90-0.95': '$240', '≥0.95': '$300', '__section': 'EJECUTIVO' },
    { 'Cumplimiento \\ Calidad': '≥100%', '<0.70': '$120', '0.70-0.80': '$200', '0.80-0.90': '$280', '0.90-0.95': '$360', '≥0.95': '$450', '__section': 'EJECUTIVO' },
    { 'Cumplimiento \\ Calidad': '<80%', '<0.70': '$0', '0.70-0.80': '$60', '0.80-0.90': '$90', '0.90-0.95': '$120', '≥0.95': '$150', '__section': 'EJECUTIVO SENIOR' },
    { 'Cumplimiento \\ Calidad': '80%-99.9%', '<0.70': '$120', '0.70-0.80': '$180', '0.80-0.90': '$270', '0.90-0.95': '$360', '≥0.95': '$450', '__section': 'EJECUTIVO SENIOR' },
    { 'Cumplimiento \\ Calidad': '≥100%', '<0.70': '$180', '0.70-0.80': '$300', '0.80-0.90': '$420', '0.90-0.95': '$540', '≥0.95': '$675', '__section': 'EJECUTIVO SENIOR' },
  ],
};

const RECOGNITION_2D = {
  sheet: 'Tablas de Tasas',
  sectionLabel: 'EJECUTIVO SENIOR',
  rowAxis: {
    gridColumn: 'Cumplimiento \\ Calidad',
    inputField: 'Cumplimiento',
    unit: 'ratio', scale: 1,
    bands: [
      { rowLabel: '<80%', gte: null, lt: 0.8 },
      { rowLabel: '80%-99.9%', gte: 0.8, lt: 1.0 },
      { rowLabel: '≥100%', gte: 1.0, lt: null },
    ],
  },
  columnAxis: {
    inputField: 'Calidad',
    unit: 'ratio', scale: 1,
    bands: [
      { gridColumn: '<0.70', gte: null, lt: 0.7 },
      { gridColumn: '0.70-0.80', gte: 0.7, lt: 0.8 },
      { gridColumn: '0.80-0.90', gte: 0.8, lt: 0.9 },
      { gridColumn: '0.90-0.95', gte: 0.9, lt: 0.95 },
      { gridColumn: '≥0.95', gte: 0.95, lt: null },
    ],
  },
  valueGridColumn: null,
  applyToField: null,
};

test('deterministic numeric-cell parsing (documented rules)', () => {
  assert.equal(parseNumericCell('$1,100'), 1100);
  assert.equal(parseNumericCell('1,100.50'), 1100.5);
  assert.equal(parseNumericCell('12%'), 0.12);
  assert.equal(parseNumericCell('1.5%'), 0.015);
  assert.equal(parseNumericCell('(200)'), -200);
  assert.equal(parseNumericCell('1.234,56'), 1234.56);
  assert.equal(parseNumericCell('1.234.567'), 1234567);
  assert.equal(parseNumericCell(0.05), 0.05);
  assert.equal(parseNumericCell(' $ 675 '), 675);
  assert.throws(() => parseNumericCell(''), RateMatrixConstructionError);
  assert.throws(() => parseNumericCell('n/a'), RateMatrixConstructionError);
});

test('2D matrix: every cell read from the grid verbatim; exact cell count', () => {
  const rec = parseRateMatrixRecognition(RECOGNITION_2D);
  const built = constructRateMatrixIntent(rec, GRID);
  assert.equal(built.cellCount, 15); // 3 row bands × 5 column bands
  // spot-check cells against the grid, verbatim
  const cell = (rowLabel: string, gridColumn: string) =>
    built.cells.find(c => c.rowLabel === rowLabel && c.gridColumn === gridColumn)!.value;
  assert.equal(cell('≥100%', '≥0.95'), 675);
  assert.equal(cell('<80%', '<0.70'), 0);
  assert.equal(cell('80%-99.9%', '0.80-0.90'), 270);
});

test('constructed tree passes the SAME grammar validator with the derived cell count', () => {
  const rec = parseRateMatrixRecognition(RECOGNITION_2D);
  const built = constructRateMatrixIntent(rec, GRID);
  const validation = validateComponentIntent(built.intent as never, {
    componentLabel: 'test-matrix', expectedCellCount: built.cellCount,
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.violations));
});

test('determinism: two constructions from the same recognition + grid are byte-identical', () => {
  const rec = parseRateMatrixRecognition(RECOGNITION_2D);
  const a = constructRateMatrixIntent(rec, GRID);
  const b = constructRateMatrixIntent(rec, GRID);
  assert.equal(JSON.stringify(a.intent), JSON.stringify(b.intent));
});

test('cascade structure: unbounded-below band is the terminal else (total function)', () => {
  const rec = parseRateMatrixRecognition(RECOGNITION_2D);
  const built = constructRateMatrixIntent(rec, GRID);
  // outermost conditional tests the TOP row band (gte 1.0, no upper)
  const outer = built.intent as Record<string, never> as { prime: string; condition: { prime: string; op: string }; else: unknown };
  assert.equal(outer.prime, 'conditional');
  assert.equal(outer.condition.op, 'gte');
  // walk to the outer terminal else: it is the <80% row's INNER cascade (not constant(0)) because
  // the bottom row band is unbounded below.
  const outerElse = (outer.else as { else: unknown });
  const terminal = outerElse.else as { prime: string };
  assert.equal(terminal.prime, 'conditional'); // the <80% row's inner cascade over Calidad
});

test('1D band table with applyToField: cascade wrapped in multiply(reference)', () => {
  const grid = {
    columns: ['Nivel', 'Tasa', '__section'],
    rows: [
      { Nivel: 'A', Tasa: '1.0%', __section: '' },
      { Nivel: 'B', Tasa: '1.5%', __section: '' },
      { Nivel: 'C', Tasa: '2.0%', __section: '' },
    ],
  };
  const rec = parseRateMatrixRecognition({
    sheet: 'Tasas', sectionLabel: null,
    rowAxis: {
      gridColumn: 'Nivel', inputField: 'Nivel_Numerico', unit: 'count', scale: null,
      bands: [
        { rowLabel: 'A', gte: null, lt: 2 },
        { rowLabel: 'B', gte: 2, lt: 3 },
        { rowLabel: 'C', gte: 3, lt: null },
      ],
    },
    columnAxis: null, valueGridColumn: 'Tasa', applyToField: 'Monto_Ventas',
  });
  const built = constructRateMatrixIntent(rec, grid);
  assert.equal(built.cellCount, 3);
  assert.deepEqual(built.cells.map(c => c.value).sort(), [0.01, 0.015, 0.02]);
  const top = built.intent as { prime: string; op: string; inputs: Array<{ prime: string; field?: string }> };
  assert.equal(top.prime, 'arithmetic');
  assert.equal(top.op, 'multiply');
  assert.equal(top.inputs[1].field, 'Monto_Ventas');
});

test('stacked identical-label blocks: per-band occurrence selects the physical block', () => {
  // no __section on the matrix rows — the EPG-B1 live BCL layout
  const grid = {
    columns: ['Banda', 'V'],
    rows: [
      { Banda: '<70%', V: '$0' }, { Banda: '≥70%', V: '$100' },   // block 1 (Senior)
      { Banda: '<70%', V: '$0' }, { Banda: '≥70%', V: '$60' },    // block 2 (Ejecutivo)
    ],
  };
  const mk = (occ: number) => parseRateMatrixRecognition({
    sheet: 'S', sectionLabel: null,
    rowAxis: {
      gridColumn: 'Banda', inputField: 'Cumplimiento', unit: 'ratio', scale: 1,
      bands: [
        { rowLabel: '<70%', gte: null, lt: 0.7, occurrence: occ },
        { rowLabel: '≥70%', gte: 0.7, lt: null, occurrence: occ },
      ],
    },
    columnAxis: null, valueGridColumn: 'V', applyToField: null,
  });
  const senior = constructRateMatrixIntent(mk(1), grid);
  const ejecutivo = constructRateMatrixIntent(mk(2), grid);
  assert.deepEqual(senior.cells.map(c => c.value), [0, 100]);   // build order: terminal (bottom band) first
  assert.deepEqual(ejecutivo.cells.map(c => c.value), [0, 60]);
  // occurrence beyond matches → loud
  assert.throws(() => constructRateMatrixIntent(mk(3), grid), RateMatrixConstructionError);
});

test('loud failures: unknown column, ambiguous row label, unparseable cell, bad shapes', () => {
  const rec = parseRateMatrixRecognition(RECOGNITION_2D);
  // unknown rowAxis column
  assert.throws(() => constructRateMatrixIntent(
    { ...rec, rowAxis: { ...rec.rowAxis, gridColumn: 'NOPE' } }, GRID), RateMatrixConstructionError);
  // wrong section → no rows
  assert.throws(() => constructRateMatrixIntent({ ...rec, sectionLabel: 'GERENTE' }, GRID), RateMatrixConstructionError);
  // ambiguous row label (two rows share the label without section narrowing)
  assert.throws(() => constructRateMatrixIntent({ ...rec, sectionLabel: null }, GRID), RateMatrixConstructionError);
  // recognition-shape violations
  assert.throws(() => parseRateMatrixRecognition({}), RateMatrixConstructionError);
  assert.throws(() => parseRateMatrixRecognition({ ...RECOGNITION_2D, columnAxis: null }), RateMatrixConstructionError); // neither 2D nor 1D
  assert.throws(() => parseRateMatrixRecognition({
    ...RECOGNITION_2D,
    rowAxis: { ...RECOGNITION_2D.rowAxis, bands: [{ rowLabel: 'x', gte: null, lt: null }] },
  }), RateMatrixConstructionError); // band with no edges
});
