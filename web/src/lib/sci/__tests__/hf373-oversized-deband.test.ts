/**
 * HF-373 Phase H (D11) — de-band header recovery on the OVERSIZED paths.
 * A banded fixture recovers its real header through BOTH the streamed and windowed readers;
 * a clean row-1 fixture is the IDENTITY transform (byte-identical keying — DD-7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { streamSheetMeta, streamSheetWindows } from '../sheet-stream';
import { openSheetWindow } from '../sheet-window';
import { resolveHeadersFromSampleGrid } from '../deband-sheet';

function workbookBuffer(grid: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(grid as unknown[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const BANDED: unknown[][] = [
  ['REPORTE DE COMISIONES 2026', null, null],   // banner (single label cell)
  ['', '', ''],                                  // blank (physically present cells, as real reports have)
  ['ID_Empleado', 'Nombre', 'Monto'],            // the REAL header
  ['E1', 'Ana', 100],
  ['E2', 'Luis', 200],
  ['E3', 'Rosa', 300],
];
const CLEAN: unknown[][] = [
  ['ID_Empleado', 'Nombre', 'Monto'],
  ['E1', 'Ana', 100],
  ['E2', 'Luis', 200],
];

test('sample resolver: banded grid recovers the real header + data start; clean grid is identity', () => {
  const banded = resolveHeadersFromSampleGrid(BANDED, 'Hoja1');
  assert.equal(banded.banded, true);
  assert.deepEqual(banded.columns, ['ID_Empleado', 'Nombre', 'Monto']);
  assert.equal(banded.dataStartRow, 3);
  const clean = resolveHeadersFromSampleGrid(CLEAN, 'Hoja1');
  assert.equal(clean.banded, false);
});

test('STREAMED path: banded fixture recovers real headers; rows keyed by them; banner rows never data', async () => {
  const buf = workbookBuffer(BANDED);
  const meta = await streamSheetMeta(buf, { sampleRows: 10 });
  assert.equal(meta.debandBanded, true);
  assert.deepEqual(meta.headers, ['ID_Empleado', 'Nombre', 'Monto']);
  assert.equal(meta.sample.length, 3);
  assert.deepEqual(meta.sample[0], { ID_Empleado: 'E1', Nombre: 'Ana', Monto: 100 });
  assert.equal(meta.totalRows, 3);

  const streamed: Record<string, unknown>[] = [];
  const res = await streamSheetWindows(buf, { windowRows: 2, onWindow: (rows) => { streamed.push(...rows); } });
  assert.equal(res.debandBanded, true);
  assert.deepEqual(res.headers, ['ID_Empleado', 'Nombre', 'Monto']);
  assert.equal(res.totalRows, 3);
  assert.deepEqual(streamed.map(r => r.ID_Empleado), ['E1', 'E2', 'E3']);
});

test('STREAMED path: clean fixture is IDENTITY (headers/sample/rows exactly as pre-HF-373)', async () => {
  const buf = workbookBuffer(CLEAN);
  const meta = await streamSheetMeta(buf, { sampleRows: 10 });
  assert.equal(meta.debandBanded, false);
  assert.deepEqual(meta.headers, ['ID_Empleado', 'Nombre', 'Monto']);
  assert.equal(meta.totalRows, 2);
  assert.deepEqual(meta.sample[0], { ID_Empleado: 'E1', Nombre: 'Ana', Monto: 100 });
});

test('WINDOWED path: banded fixture recovers real headers; readWindow keys by them; clean is identity', () => {
  const wsB = XLSX.utils.aoa_to_sheet(BANDED as unknown[][]);
  const readerB = openSheetWindow(XLSX, wsB, 'Hoja1');
  assert.deepEqual(readerB.columns, ['ID_Empleado', 'Nombre', 'Monto']);
  assert.equal(readerB.totalRows, 3);
  const rowsB = readerB.readWindow(0, 10);
  assert.deepEqual(rowsB[0], { ID_Empleado: 'E1', Nombre: 'Ana', Monto: 100 });
  assert.deepEqual(rowsB[2], { ID_Empleado: 'E3', Nombre: 'Rosa', Monto: 300 });

  const wsC = XLSX.utils.aoa_to_sheet(CLEAN as unknown[][]);
  const readerC = openSheetWindow(XLSX, wsC, 'Hoja1');
  assert.deepEqual(readerC.columns, ['ID_Empleado', 'Nombre', 'Monto']);
  assert.equal(readerC.totalRows, 2);
  assert.deepEqual(readerC.readWindow(0, 10)[0], { ID_Empleado: 'E1', Nombre: 'Ana', Monto: 100 });
});
