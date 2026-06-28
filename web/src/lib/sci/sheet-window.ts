// OB-250 (DS-016 Layer C / P-C1) — bounded-window SheetJS reader.
//
// THE MISSING THIRD MEMORY BOUND. HF-350 bounded the header-LLM payload; HF-353 bounded the
// committed_data WRITE payload (per-chunk projection in commit-content-unit.ts). Neither touched
// the PARSE: `XLSX.utils.sheet_to_json(ws, { defval: '' })` materializes the ENTIRE sheet as a
// JS array of row-objects in one shot — the ~2GB peak on the 86,608×87 ERP export (the OOM that
// has failed three times). This module reads BOUNDED ROW WINDOWS so peak heap is WINDOW×cols,
// independent of file size (SR-2).
//
// CORRECTNESS CONTRACT (sheet-window.test.ts proves it byte-identical): a windowed read of every
// row produces EXACTLY the same array of row-objects — same keys (incl. SheetJS's __EMPTY/dedup
// header inference), same values, same order — as the current single full `sheet_to_json(ws,
// { defval: '' })`. The keys are captured ONCE from a default-inference probe of the header row,
// then every subsequent window is parsed with that captured `header` array so the columns never
// drift (the failure mode flagged in the OB-250 evidence gate). Carry Everything (T1-E902):
// windowing is a processing strategy, never a data filter — every row is read, none dropped.

import type { WorkSheet } from 'xlsx';

// Lazy import keeps xlsx out of the edge bundle (matches process-job/execute-bulk idiom).
type XLSXModule = typeof import('xlsx');

const DEFAULT_PARSE = { defval: '' as const };

export interface SheetWindow {
  /** Canonical, deduped column keys — identical to Object.keys() of a default full sheet_to_json row. */
  readonly columns: string[];
  /** Number of DATA rows (excludes the header row). */
  readonly totalRows: number;
  /** The sheet's logical sheet name. */
  readonly sheetName: string;
  /**
   * Read data rows [startRow, startRow+count) as row-objects keyed by `columns`.
   * startRow is 0-based over DATA rows (row 0 = first row after the header).
   * Peak heap for the call is bounded by count×columns, NOT by totalRows.
   */
  readWindow(startRow: number, count: number): Record<string, unknown>[];
}

/**
 * Open a bounded-window reader over a parsed worksheet. Cheap: it reads `!ref` for dimensions and
 * one default-inference probe row to capture the canonical header keys; it does NOT materialize the
 * sheet. Pair with `XLSX.read(buffer, { type: 'array', dense: true })` for the smallest cell-map peak.
 */
export function openSheetWindow(XLSX: XLSXModule, ws: WorkSheet, sheetName: string): SheetWindow {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const headerRow = range.s.r;
  const firstDataRow = headerRow + 1;
  const lastRow = range.e.r;
  const totalRows = Math.max(0, lastRow - firstDataRow + 1);

  // Capture canonical header keys via a default-inference probe of [headerRow .. firstDataRow].
  // sheet_to_json treats the first row of the range as the header and applies its own dedup/__EMPTY
  // synthesis; Object.keys of the (single) data object are exactly the keys every downstream reader
  // expects. When there are zero data rows we synthesize keys from header:1 so columns are still known.
  let columns: string[];
  if (totalRows > 0) {
    const probe = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      ...DEFAULT_PARSE,
      range: { s: { r: headerRow, c: range.s.c }, e: { r: firstDataRow, c: range.e.c } },
    });
    columns = probe.length > 0 ? Object.keys(probe[0]) : [];
  } else {
    const headerCells = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      range: { s: { r: headerRow, c: range.s.c }, e: { r: headerRow, c: range.e.c } },
    });
    const raw = (headerCells[0] as unknown[] | undefined) ?? [];
    columns = dedupeHeaderKeys(raw);
  }

  function readWindow(startRow: number, count: number): Record<string, unknown>[] {
    if (count <= 0 || startRow >= totalRows) return [];
    const s = firstDataRow + startRow;
    const e = Math.min(firstDataRow + startRow + count - 1, lastRow);
    // Explicit `header: columns` makes the mapping positional against the captured keys, so a window
    // that starts past row 0 keys identically to the first window (no re-invented __EMPTY columns).
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      ...DEFAULT_PARSE,
      header: columns,
      range: { s: { r: s, c: range.s.c }, e: { r: e, c: range.e.c } },
    });
  }

  return { columns, totalRows, sheetName, readWindow };
}

/**
 * Reproduce SheetJS's default header-key synthesis for the zero-data-row case (empty cells become
 * __EMPTY, __EMPTY_1, …; collisions become name_1, name_2, …). Only used when a sheet has a header
 * but no data rows; the common path captures keys from a real data row above.
 */
function dedupeHeaderKeys(raw: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  let emptyIdx = 0;
  for (const cell of raw) {
    let key: string;
    const s = cell == null ? '' : String(cell);
    if (s === '') {
      key = emptyIdx === 0 ? '__EMPTY' : `__EMPTY_${emptyIdx}`;
      emptyIdx += 1;
    } else {
      key = s;
    }
    const prior = seen.get(key);
    if (prior === undefined) {
      seen.set(key, 0);
      out.push(key);
    } else {
      const n = prior + 1;
      seen.set(key, n);
      out.push(`${key}_${n}`);
    }
  }
  return out;
}

/**
 * Stream every data row of a sheet through `onWindow` in bounded windows, so a caller can process
 * (classify-sample, fingerprint, or COMMIT) a large sheet without ever holding the full array.
 * Returns the total rows streamed (== totalRows) for the Carry-Everything / HALT-DATA-LOSS check.
 */
export async function forEachWindow(
  reader: SheetWindow,
  windowSize: number,
  onWindow: (rows: Record<string, unknown>[], startRow: number) => Promise<void> | void,
): Promise<number> {
  let streamed = 0;
  for (let start = 0; start < reader.totalRows; start += windowSize) {
    const rows = reader.readWindow(start, windowSize);
    if (rows.length === 0) break;
    await onWindow(rows, start);
    streamed += rows.length;
  }
  return streamed;
}

// DS-016 §C tuning — the directive's thresholds, single source.
export const ROW_CHUNK_THRESHOLD = 50_000; // a file over this splits into chunk-jobs
export const CHUNK_ROW_SIZE = 20_000;      // rows per window/chunk (peak ≈ ~300MB/worker on 87 cols)
export const CLASSIFY_SAMPLE_WINDOW = 1_000; // classify only needs columns + a 50-row sample + fingerprint
// A unit whose (rows × cols) exceeds this commits via the bounded-window path (windowed-commit.ts).
// Set ABOVE every HALT-CALC anchor's sheet (BCL 0.01M / Meridian 0.00M / MIR 1.20M cells, measured)
// so the anchors commit single-batch on the proven path; only OOM-scale files (Casa Diaz/Robles
// 86,608×87 = 7.53M, Sabor 263k×27 = 7.11M) window. Calc-neutral either way (byte-identical rows).
export const CELL_CHUNK_THRESHOLD = 5_000_000;
