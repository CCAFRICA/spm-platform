/**
 * HF-350 — Header Comprehension column batching. Deterministic proof of P-HC-BATCH:
 * header comprehension produces reliable results for ANY column count by bounding the
 * per-LLM-call column count and merging. No live LLM — an injected single-caller makes
 * the split / merge / retry / error-isolation logic deterministic.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  callLLMForHeaders,
  splitIntoColumnBatches,
  mergeBatchResults,
  type HeaderComprehensionInput,
  type LLMHeaderResponse,
} from '@/lib/sci/header-comprehension';

const cols = (n: number, prefix = 'C'): string[] => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
const sheet = (name: string, columns: string[]): HeaderComprehensionInput['sheets'][number] =>
  ({ sheetName: name, columns, sampleRows: [{ [columns[0]]: 'v' }], rowCount: 100 });
const input = (...sheets: HeaderComprehensionInput['sheets']): HeaderComprehensionInput => ({ sheets });

// An injected LLM caller. By default every column is comprehended (echoes its name).
// `behavior(cols, attempt)` can force a batch to fail (for isolation/retry tests).
function makeCaller(behavior: (batchCols: string[], attempt: number) => 'ok' | 'fail' = () => 'ok') {
  const callLog: string[][] = [];
  const attempts = new Map<string, number>();
  const caller = async (inp: HeaderComprehensionInput) => {
    const batchCols = inp.sheets.flatMap(s => s.columns);
    callLog.push(batchCols);
    const key = batchCols.join('|');
    const a = attempts.get(key) ?? 0; attempts.set(key, a + 1);
    if (behavior(batchCols, a) === 'fail') return { ok: false as const, failureClass: 'parse_failure' as const, duration: 1 };
    const sheets: LLMHeaderResponse['sheets'] = {};
    for (const s of inp.sheets) {
      sheets[s.sheetName] = { columns: {} };
      for (const c of s.columns) sheets[s.sheetName].columns[c] = { characterization: c, data_nature: 'measure', confidence: 0.9 };
    }
    return { ok: true as const, result: { sheets, crossSheetInsights: [`insight:${batchCols.length}`] }, duration: 1 };
  };
  return { caller, callLog };
}
const mergedCols = (r: LLMHeaderResponse, sheetName: string): string[] => Object.keys(r.sheets[sheetName]?.columns ?? {}).sort();

test('P1 split: 87 columns → 4 batches of ≤25 (25/25/25/12), every column in exactly one batch', () => {
  const batches = splitIntoColumnBatches(input(sheet('S', cols(87))), 25);
  assert.deepEqual(batches.map(b => b.sheets[0].columns.length), [25, 25, 25, 12]);
  const all = batches.flatMap(b => b.sheets.flatMap(s => s.columns));
  assert.equal(all.length, 87);
  assert.equal(new Set(all).size, 87); // no duplication, no loss
  assert.deepEqual([...new Set(all)].sort(), cols(87).sort());
});

test('P1 split: multi-sheet input chunks by TOTAL count and carries each sheet sampleRows/rowCount', () => {
  const batches = splitIntoColumnBatches(input(sheet('A', cols(30, 'A')), sheet('B', cols(30, 'B'))), 25);
  // 60 cols → batches of 25/25/10; each batch ≤25 total
  assert.deepEqual(batches.map(b => b.sheets.reduce((n, s) => n + s.columns.length, 0)), [25, 25, 10]);
  for (const b of batches) for (const s of b.sheets) { assert.equal(s.rowCount, 100); assert.ok(Array.isArray(s.sampleRows)); }
});

test('P2 merge: K batch results shallow-merge into one structurally-identical result', () => {
  const r1: LLMHeaderResponse = { sheets: { S: { columns: { C00: { confidence: 0.9 }, C01: { confidence: 0.8 } } } }, crossSheetInsights: ['a'] };
  const r2: LLMHeaderResponse = { sheets: { S: { columns: { C02: { confidence: 0.7 } } } }, crossSheetInsights: ['b'] };
  const merged = mergeBatchResults([r1, r2]);
  assert.deepEqual(mergedCols(merged, 'S'), ['C00', 'C01', 'C02']);
  assert.equal(merged.sheets.S.columns.C01.confidence, 0.8); // per-column structure preserved
  assert.deepEqual(merged.crossSheetInsights, ['a', 'b']);
});

test('PG-3 passthrough: ≤25 columns → exactly ONE call (small files byte-identical, no batching)', async () => {
  const { caller, callLog } = makeCaller();
  const out = await callLLMForHeaders(input(sheet('S', cols(20))), caller);
  assert.equal(out.ok, true);
  assert.equal(callLog.length, 1);
  assert.equal(callLog[0].length, 20);
});

test('PG-1: 87 columns → 4 batched calls, all 87 comprehended, ok, no failed columns', async () => {
  const { caller, callLog } = makeCaller();
  const out = await callLLMForHeaders(input(sheet('S', cols(87))), caller);
  assert.equal(out.ok, true);
  assert.equal(callLog.length, 4);                 // 4 batch calls (not one 87-col call)
  if (out.ok) {
    assert.equal(mergedCols(out.result, 'S').length, 87);
    assert.equal(out.failedColumns, undefined);
  }
});

test('P4 error isolation: a permanently-failed batch does not abort the others (partial proceed)', async () => {
  // the batch containing C30 always fails; the other 3 batches succeed
  const { caller } = makeCaller((batchCols) => batchCols.includes('C30') ? 'fail' : 'ok');
  const out = await callLLMForHeaders(input(sheet('S', cols(87))), caller);
  assert.equal(out.ok, true); // proceeds with the comprehended columns
  if (out.ok) {
    assert.ok(out.failedColumns && out.failedColumns.includes('C30'));
    assert.equal(out.failedColumns!.length, 25); // the whole failed batch's columns reported
    assert.equal(mergedCols(out.result, 'S').length, 87 - 25); // 62 comprehended
    assert.ok(!mergedCols(out.result, 'S').includes('C30'));
  }
});

test('P4 retry-once: a batch that fails its first attempt and succeeds on retry is comprehended', async () => {
  const { caller, callLog } = makeCaller((batchCols, attempt) => batchCols.includes('C30') && attempt === 0 ? 'fail' : 'ok');
  const out = await callLLMForHeaders(input(sheet('S', cols(87))), caller);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.failedColumns, undefined);            // retry recovered it
    assert.equal(mergedCols(out.result, 'S').length, 87);  // all comprehended
  }
  assert.equal(callLog.length, 5); // 4 batches + 1 retry of the failing batch
});

test('C2 total failure: every batch fails → ok:false (one failed_interpretation upstream)', async () => {
  const { caller } = makeCaller(() => 'fail');
  const out = await callLLMForHeaders(input(sheet('S', cols(87))), caller);
  assert.equal(out.ok, false);
});
