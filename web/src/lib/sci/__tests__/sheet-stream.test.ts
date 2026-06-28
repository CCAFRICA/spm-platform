/**
 * OB-251 HOTFIX — streaming reader equivalence + carry-everything. Runner: node --test --import tsx.
 *
 * The streaming (exceljs) path only runs for files over the byte threshold (non-anchor large files),
 * but the committed_data it produces must MATCH `sheet_to_json(ws,{defval:''})` for the ordinary
 * string/number/blank cells an ERP export carries — same deduped header keys, same values, same '' for
 * trailing blanks — so the classify and commit column keys agree and the data is faithful. These tests
 * prove that equivalence, and that every row is streamed (Carry Everything / HALT-DATA-LOSS).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as XLSX from 'xlsx';
import { streamSheetWindows } from '../sheet-stream';

// Fixtures written with SheetJS. The jszip reader reads zip entries by NAME (order-independent), so it
// consumes SheetJS-, Excel-, and JDE-written files alike; this lets us assert equivalence directly
// against `sheet_to_json` on the very same buffer.
function bufferFromAoa(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
function sheetJsRows(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}
async function streamedRows(buf: Buffer, windowRows = 2): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  await streamSheetWindows(buf, { windowRows, onWindow: (rows) => { out.push(...rows); } });
  return out;
}

test('streamed row-objects == sheet_to_json for strings/numbers/blanks', async () => {
  const aoa = [
    ['id', 'name', 'amount', 'note'],
    ['E1', 'Alice', 100, 'ok'],
    ['E2', 'Bob', 200, ''],         // trailing blank
    ['E3', 'Cleo', 300, 'x'],
    ['E4', 'Dan', 400, 'y'],
    ['E5', 'Eve', 500, 'z'],
  ];
  const buf = await bufferFromAoa(aoa);
  const expected = sheetJsRows(buf);
  const got = await streamedRows(buf, 2);
  assert.equal(got.length, expected.length, 'row count matches');
  // Compare key sets + values (string/number). exceljs numbers come back as numbers; normalize.
  for (let i = 0; i < expected.length; i++) {
    assert.deepEqual(Object.keys(got[i]).sort(), Object.keys(expected[i]).sort(), `keys row ${i}`);
    for (const k of Object.keys(expected[i])) {
      assert.equal(String(got[i][k]), String(expected[i][k]), `value row ${i} col ${k}`);
    }
  }
});

test('streamed headers reproduce SheetJS __EMPTY / dup dedup', async () => {
  const aoa = [
    ['id', '', 'amount', 'amount', ''],
    ['E1', 'x', 10, 11, 'a'],
    ['E2', 'y', 20, 21, 'b'],
    ['E3', 'z', 30, 31, 'c'],
  ];
  const buf = await bufferFromAoa(aoa);
  const expected = sheetJsRows(buf);
  let headers: string[] = [];
  const got: Record<string, unknown>[] = [];
  await streamSheetWindows(buf, { windowRows: 2, onHeaders: (_s, h) => { headers = h; }, onWindow: (rows) => { got.push(...rows); } });
  assert.deepEqual(headers, Object.keys(expected[0]), 'deduped headers match SheetJS keys');
  assert.equal(got.length, expected.length);
});

test('carry everything — streams EXACTLY all data rows across windows (HALT-DATA-LOSS)', async () => {
  const N = 1003;
  const aoa: unknown[][] = [['id', 'v']];
  for (let i = 0; i < N; i++) aoa.push([`E${i}`, i]);
  const buf = await bufferFromAoa(aoa);
  for (const win of [100, 250, 1000]) {
    const seen: number[] = [];
    const res = await streamSheetWindows(buf, { windowRows: win, onWindow: (rows) => { for (const r of rows) seen.push(Number(r.v)); } });
    assert.equal(res.totalRows, N, `totalRows==N for window=${win}`);
    assert.equal(seen.length, N, `streamed all rows for window=${win}`);
    assert.deepEqual(seen, Array.from({ length: N }, (_, i) => i), `order preserved window=${win}`);
  }
});
