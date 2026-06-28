/**
 * OB-250 (DS-016 P-C1) — bounded-window reader BYTE-IDENTITY proof.
 * Runner: node --test --import tsx.
 *
 * The whole calc-neutrality argument for the windowed parse rests on ONE invariant: a windowed
 * read of every row produces the SAME array of row-objects (same keys incl. SheetJS __EMPTY/dedup
 * synthesis, same values, same order) as the current single full `sheet_to_json(ws,{defval:''})`.
 * If that holds, committed_data is byte-identical regardless of how the sheet was parsed, so the
 * HALT-CALC anchors cannot move. These tests prove it, including the adversarial header cases
 * (empties, duplicates) and window boundaries that don't divide the row count evenly.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { openSheetWindow, forEachWindow } from '../sheet-window';

// Build a worksheet from an array-of-arrays (row 0 = header) — exercises __EMPTY + duplicate dedup.
function sheetFromAoa(aoa: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(aoa);
}

function fullParse(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}

function windowedParse(ws: XLSX.WorkSheet, windowSize: number): Record<string, unknown>[] {
  const reader = openSheetWindow(XLSX, ws, 'S');
  const out: Record<string, unknown>[] = [];
  for (let s = 0; s < reader.totalRows; s += windowSize) out.push(...reader.readWindow(s, windowSize));
  return out;
}

test('windowed read is byte-identical to full sheet_to_json — clean headers', () => {
  const aoa = [
    ['id', 'name', 'amount', 'date'],
    ['E1', 'Alice', 100, '2024-01-01'],
    ['E2', 'Bob', 200, '2024-01-02'],
    ['E3', 'Cleo', 300, '2024-01-03'],
    ['E4', 'Dan', 400, '2024-01-04'],
    ['E5', 'Eve', 500, '2024-01-05'],
  ];
  const ws = sheetFromAoa(aoa);
  const full = fullParse(ws);
  for (const win of [1, 2, 3, 5, 100]) {
    assert.deepEqual(windowedParse(ws, win), full, `window=${win}`);
  }
});

test('windowed read matches full parse with EMPTY + DUPLICATE headers (__EMPTY / name_1 dedup)', () => {
  // Header row has two empty cells and a duplicated "amount" — SheetJS synthesizes __EMPTY,
  // __EMPTY_1 and amount_1. The windowed reader must reproduce those exact keys past row 0.
  const aoa = [
    ['id', '', 'amount', 'amount', ''],
    ['E1', 'x', 10, 11, 'a'],
    ['E2', 'y', 20, 21, 'b'],
    ['E3', 'z', 30, 31, 'c'],
    ['E4', 'w', 40, 41, 'd'],
    ['E5', 'v', 50, 51, 'e'],
    ['E6', 'u', 60, 61, 'f'],
    ['E7', 't', 70, 71, 'g'],
  ];
  const ws = sheetFromAoa(aoa);
  const full = fullParse(ws);
  // The captured columns must equal the keys SheetJS infers.
  const reader = openSheetWindow(XLSX, ws, 'S');
  assert.deepEqual(reader.columns, Object.keys(full[0]), 'captured columns == inferred keys');
  for (const win of [1, 2, 3, 4, 7, 50]) {
    assert.deepEqual(windowedParse(ws, win), full, `window=${win}`);
  }
});

test('forEachWindow streams EXACTLY totalRows (Carry Everything / HALT-DATA-LOSS)', async () => {
  const aoa: unknown[][] = [['id', 'v']];
  const N = 1003; // not a multiple of any window size below
  for (let i = 0; i < N; i++) aoa.push([`E${i}`, i]);
  const ws = sheetFromAoa(aoa);
  const reader = openSheetWindow(XLSX, ws, 'S');
  assert.equal(reader.totalRows, N);
  for (const win of [100, 250, 1000]) {
    const seen: number[] = [];
    const streamed = await forEachWindow(reader, win, (rows) => {
      for (const r of rows) seen.push(Number(r.v));
    });
    assert.equal(streamed, N, `streamed==N for window=${win}`);
    assert.deepEqual(seen, Array.from({ length: N }, (_, i) => i), `order preserved window=${win}`);
  }
});

test('dense:true read is output-identical to sparse for sheet_to_json AND windowed read', () => {
  // execute-bulk reads the workbook with { dense: true } to halve the cell-map peak on wide files.
  // Prove dense changes only internal storage, not sheet_to_json output — so the non-large (anchor)
  // path stays byte-identical, and the windowed read matches too.
  const aoa = [
    ['id', 'name', 'amt', ''],
    ['E1', 'Al', 10, 'x'],
    ['E2', 'Bo', 20, 'y'],
    ['E3', 'Cy', 30, 'z'],
    ['E4', 'Di', 40, 'w'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(aoa), 'S');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const sparse = XLSX.read(buf, { type: 'array' });
  const dense = XLSX.read(buf, { type: 'array', dense: true });
  const sparseRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sparse.Sheets['S'], { defval: '' });
  const denseRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(dense.Sheets['S'], { defval: '' });
  assert.deepEqual(denseRows, sparseRows, 'dense sheet_to_json == sparse sheet_to_json');

  // windowed read off the DENSE workbook also matches
  assert.deepEqual(windowedParse(dense.Sheets['S'], 2), sparseRows, 'windowed(dense) == full(sparse)');
});

test('empty sheet (header only, zero data rows) — columns known, zero rows', () => {
  const ws = sheetFromAoa([['id', 'name', '']]);
  const reader = openSheetWindow(XLSX, ws, 'S');
  assert.equal(reader.totalRows, 0);
  assert.deepEqual(reader.readWindow(0, 100), []);
  assert.equal(reader.columns.length, 3);
});
