// OB-251 HOTFIX (DS-016 P-C1, the REAL parse-input bound) — streaming xlsx reader on jszip.
//
// WHY THIS EXISTS. sheet-window.ts windows the OUTPUT of `sheet_to_json`, but SheetJS `XLSX.read`
// materializes the ENTIRE workbook (every cell of every sheet) into memory BEFORE any windowing —
// so on the 86,608×87 (7.5M-cell) JDE export the memory is already spent at read time and the
// process OOMs in the first window (confirmed on the live file: "parsed ... in 32024ms" = the read,
// then OOM 2s into windowed-commit; `dense:true` only halved it). The window must bound the PARSE
// INPUT. SheetJS CE has no incremental reader (`sheetRows` parses everything then slices — itself
// ballooned to 1.4GB), and exceljs's streaming reader is zip-ENTRY-ORDER fragile (it needs
// workbook.xml before the worksheets and throws otherwise — unsafe for an unknown export). So a large
// file is read by RANDOM-ACCESSING the small zip entries (workbook.xml, rels, sharedStrings — by NAME,
// order-independent) and then STREAMING only the one large worksheet XML, emitting `<row>` elements
// incrementally. Peak heap is bounded by the shared-strings table + one window, NOT by file size.
//
// SCOPE / HALT-CALC. Only files at/over STREAM_BYTES_THRESHOLD take this path; everything smaller keeps
// the byte-identical SheetJS path, so the HALT-CALC anchors (BCL/Meridian/MIR — all small files, well
// under the threshold) are untouched. The row-objects this builds match `sheet_to_json(ws,{defval:''})`
// for the ordinary string/number/blank cells an ERP export carries (sheet-stream.test.ts proves the
// equivalence against SheetJS-written fixtures), so committed_data is faithful and the classify/commit
// column keys agree. Carry Everything (T1-E902): every <row> after the header is emitted, none dropped.

import { StringDecoder } from 'node:string_decoder';
import { shouldFlushBeforeAdd } from './pulse-accumulator'; // HF-359: the shared byte-budget pulse boundary
// HF-373 Phase H (D11): the SAME deterministic de-band recognition the standard path uses (OB-254),
// applied to a bounded sample of leading rows — the size gate selects the parse strategy, never the
// recognition (AP-17). Clean-row-1 sheets resolve to IDENTITY (byte-identical keying, DD-7).
import { resolveHeadersFromSampleGrid, HEADER_SAMPLE_ROWS, type SampleHeaderResolution } from './deband-sheet';

/**
 * Build the canonical column keys from a header row's cells, EXACTLY as `sheet_to_json` does:
 * a present-but-empty header cell → '' (and repeats → '_1', '_2'); an ABSENT cell (a gap before the
 * last header) → '__EMPTY' (repeats → '__EMPTY_1'); a named cell → its name (repeats → name_1).
 */
function headerKeysFromCells(cells: Map<number, unknown>): string[] {
  let maxCol = -1;
  for (const c of Array.from(cells.keys())) if (c > maxCol) maxCol = c;
  const counts = new Map<string, number>();
  const out: string[] = [];
  for (let c = 0; c <= maxCol; c++) {
    let base: string;
    if (cells.has(c)) {
      const v = cells.get(c);
      base = v === '' || v == null ? '' : String(v);
    } else {
      base = '__EMPTY';
    }
    const n = counts.get(base);
    if (n === undefined) { counts.set(base, 0); out.push(base); }
    else { counts.set(base, n + 1); out.push(`${base}_${n + 1}`); }
  }
  return out;
}

// A file at/above this many bytes is read by the streaming parser (its XLSX.read would risk OOM). Set
// well above every HALT-CALC anchor's file size (BCL/Meridian tiny, MIR ~75k×16 ≈ a few MB) and below
// the JDE export (~52MB). A file just under it that does NOT OOM simply uses SheetJS as before — the
// threshold only decides WHICH reader, never whether a row is committed.
export const STREAM_BYTES_THRESHOLD = 20_000_000;

export function isLargeByBytes(byteLength: number): boolean {
  return byteLength >= STREAM_BYTES_THRESHOLD;
}

export interface StreamSheetResult {
  sheetName: string;
  headers: string[];
  totalRows: number; // DATA rows streamed (excludes the header/banner rows)
  // HF-373 Phase H (D11): true when the sample de-band recovered a banded header (banner rows
  // skipped, positional recovered keys used); absent/false = identity raw-row-1 keying.
  debandBanded?: boolean;
  debandObservations?: Array<{ kind: string; detail: Record<string, unknown> }>;
}

export interface StreamSheetMeta {
  sheetName: string;
  headers: string[];
  sample: Record<string, unknown>[]; // first N data rows (for classify fingerprint/HC)
  totalRows: number; // from the sheet's <dimension> if present, else the sample length (-> "at least")
  totalKnown: boolean;
  debandBanded?: boolean; // HF-373 Phase H (D11)
  debandObservations?: Array<{ kind: string; detail: Record<string, unknown> }>;
}

// ── HF-373 Phase H (D11): buffered header resolution over the leading rows ─────────────────────────
// Buffers the first HEADER_SAMPLE_ROWS raw cell-rows, then resolves ONCE via the shared de-band
// sample recognition. Identity (clean row-1): headers = headerKeysFromCells(row 0) — the EXACT
// pre-HF-373 keying, byte-identical; buffered rows 1.. release as data. Banded: headers = the
// recovered positional keys; buffered rows before dataStartRow are the banner/header band (skipped
// as sidecar, matching the full-grid de-band); the rest release as data. Peak memory: ≤ the sample
// rows' cells — the OOM defense is untouched.
class StreamHeaderResolver {
  private buffered: Array<Map<number, unknown>> = [];
  headers: string[] | null = null;
  resolution: SampleHeaderResolution | null = null;
  constructor(private sheetName: string, private sampleRows: number = HEADER_SAMPLE_ROWS) {}

  /** Feed one raw cell-row; returns any cell-rows now releasable as DATA rows. */
  push(cells: Map<number, unknown>): Array<Map<number, unknown>> {
    if (this.headers !== null) return [cells];
    this.buffered.push(cells);
    if (this.buffered.length >= this.sampleRows) return this.resolve();
    return [];
  }

  /** End of stream: resolve with whatever was buffered. */
  flush(): Array<Map<number, unknown>> {
    if (this.headers !== null) return [];
    return this.resolve();
  }

  private resolve(): Array<Map<number, unknown>> {
    const grid: unknown[][] = this.buffered.map((cells) => {
      let maxCol = -1;
      for (const c of Array.from(cells.keys())) if (c > maxCol) maxCol = c;
      const row: unknown[] = new Array(Math.max(0, maxCol + 1)).fill(null);
      for (const [c, v] of Array.from(cells.entries())) row[c] = v;
      return row;
    });
    const resolution = resolveHeadersFromSampleGrid(grid, this.sheetName);
    this.resolution = resolution;
    let dataStart: number;
    if (resolution.banded) {
      this.headers = resolution.columns;
      dataStart = resolution.dataStartRow;
      console.log(`[sheet-stream] HF-373 H: banded header recovered for "${this.sheetName}" — ${resolution.columns.length} columns, data starts at sample row ${dataStart} (raw row-1 keying replaced)`);
    } else {
      // IDENTITY: the exact pre-HF-373 keying (first row → headerKeysFromCells).
      this.headers = this.buffered.length > 0 ? headerKeysFromCells(this.buffered[0]) : [];
      dataStart = 1;
    }
    const out = this.buffered.slice(dataStart);
    this.buffered = [];
    return out;
  }
}

// ── XML helpers (minimal, xlsx-scoped) ──────────────────────────────────────
function decodeXml(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(?:(amp|lt|gt|quot|apos)|#x([0-9a-fA-F]+)|#(\d+));/g, (_m, named, hex, dec) => {
    if (named) return named === 'amp' ? '&' : named === 'lt' ? '<' : named === 'gt' ? '>' : named === 'quot' ? '"' : "'";
    return String.fromCodePoint(hex ? parseInt(hex, 16) : parseInt(dec, 10));
  });
}

/** "AB12" → 0-based column index (A=0). */
function colIndexFromRef(ref: string): number {
  let col = 0;
  for (let i = 0; i < ref.length; i++) {
    const ch = ref.charCodeAt(i);
    if (ch < 65 || ch > 90) break; // stop at the first digit
    col = col * 26 + (ch - 64);
  }
  return col - 1;
}

/** Parse sharedStrings.xml into the canonical string array (rich-text runs concatenated). */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    if (m[1] === undefined) { out.push(''); continue; } // <si/>
    const inner = m[1];
    let text = '';
    const tRe = /<t\b[^>]*\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner))) text += tm[1] !== undefined ? decodeXml(tm[1]) : '';
    out.push(text);
  }
  return out;
}

/** Extract one row's cells, indexed by 0-based column, with values normalized to plain primitives. */
function parseRowCells(rowXml: string, shared: string[]): Map<number, unknown> {
  const cells = new Map<number, unknown>();
  const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cRe.exec(rowXml))) {
    const attrs = m[1];
    const inner = m[2] ?? '';
    const rMatch = attrs.match(/\br="([A-Z]+)\d+"/);
    if (!rMatch) continue;
    const col = colIndexFromRef(rMatch[1]);
    const t = (attrs.match(/\bt="([^"]+)"/) || [, 'n'])[1];
    let val: unknown = '';
    if (t === 's') {
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      val = v ? (shared[parseInt(v[1], 10)] ?? '') : '';
    } else if (t === 'inlineStr') {
      let text = ''; const tRe = /<t\b[^>]*\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g; let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(inner))) text += tm[1] !== undefined ? decodeXml(tm[1]) : '';
      val = text;
    } else if (t === 'str') {
      const v = inner.match(/<v>([\s\S]*?)<\/v>/); val = v ? decodeXml(v[1]) : '';
    } else if (t === 'b') {
      const v = inner.match(/<v>([\s\S]*?)<\/v>/); val = v ? v[1] === '1' : '';
    } else { // number (default / t="n")
      const v = inner.match(/<v>([\s\S]*?)<\/v>/); val = v ? Number(v[1]) : '';
    }
    cells.set(col, val);
  }
  return cells;
}

/** Pull every COMPLETE <row>…</row> (and self-closing <row/>) from a buffer; return them + the tail. */
function drainRows(pending: string): { rows: string[]; rest: string } {
  const rows: string[] = [];
  let pos = 0;
  for (;;) {
    const start = pending.indexOf('<row', pos);
    if (start === -1) return { rows, rest: pending.slice(pos) };
    const gt = pending.indexOf('>', start);
    if (gt === -1) return { rows, rest: pending.slice(start) };           // opening tag split across chunks
    if (pending[gt - 1] === '/') { rows.push(pending.slice(start, gt + 1)); pos = gt + 1; continue; } // <row/>
    const end = pending.indexOf('</row>', gt);
    if (end === -1) return { rows, rest: pending.slice(start) };          // row body split across chunks
    rows.push(pending.slice(start, end + 6));
    pos = end + 6;
  }
}

/**
 * Stream a (large) workbook's first worksheet — or `targetSheet` if given — in bounded row windows,
 * WITHOUT materializing the workbook. Captures the header row once (deduped exactly like SheetJS),
 * builds header-keyed row-objects with '' defaults, and invokes `onWindow(rows, startRow)` per window.
 * Returns the sheet name, headers, and total DATA rows streamed (the HALT-DATA-LOSS denominator).
 */
export async function streamSheetWindows(
  buffer: ArrayBuffer | Buffer,
  opts: {
    // HF-359 (Part A): the pulse boundary. When `byteBudget` + `rowBytes` are given, a pulse flushes BEFORE
    // a row would push its serialized CSV over the budget (byte-budgeted pulse). `maxRows` is the upper
    // safety cap on rows/pulse. `windowRows` (legacy) acts as the cap when `maxRows` is absent — and as the
    // sole row-count boundary when no byte budget is given (back-compat for the windowed/test paths).
    windowRows?: number;
    byteBudget?: number;
    maxRows?: number;
    rowBytes?: (row: Record<string, unknown>) => number;
    onWindow: (rows: Record<string, unknown>[], startRow: number) => Promise<void> | void;
    targetSheet?: string;
    onHeaders?: (sheetName: string, headers: string[]) => void;
  },
): Promise<StreamSheetResult> {
  const JSZip = (await import('jszip')).default ?? (await import('jszip'));
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  const zip = await (JSZip as typeof import('jszip')).loadAsync(buf);

  // Resolve which worksheet XML to stream (by name → rId → rels target). Read by NAME, so zip entry
  // ORDER is irrelevant (the exceljs-streaming fragility this replaces).
  const workbookXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? '';
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
  const relMap = new Map<string, string>();
  for (const rm of Array.from(relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))) relMap.set(rm[1], rm[2]);
  const sheets: Array<{ name: string; path: string }> = [];
  for (const sm of Array.from(workbookXml.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/?>/g))) {
    let target = relMap.get(sm[2]) ?? '';
    if (target && !target.startsWith('xl/')) target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    sheets.push({ name: decodeXml(sm[1]), path: target });
  }
  const chosen = (opts.targetSheet ? sheets.find(s => s.name === opts.targetSheet) : sheets[0]) ?? sheets[0];
  if (!chosen || !zip.file(chosen.path)) {
    throw new Error(`[sheet-stream] worksheet not found (target=${opts.targetSheet ?? '(first)'}; sheets=${sheets.map(s => s.name).join('|')})`);
  }

  // sharedStrings — bounded by UNIQUE strings (not cell count). Decompressed once.
  const shared = parseSharedStrings((await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '');

  // Stream the worksheet XML, extracting <row> elements incrementally.
  let headers: string[] | null = null;
  let totalRows = 0;
  let windowBuf: Record<string, unknown>[] = [];
  let accBytes = 0; // HF-359: running serialized-CSV bytes of the current pulse
  let pending = '';
  const decoder = new StringDecoder('utf8');

  // HF-359 (Part A): byte-budgeted pulse boundary via the shared rule. maxRows = the safety cap (maxRows
  // → windowRows → unbounded); byteBudget governs when set. rowBytes(row) = the row's serialized CSV size.
  const maxRows = opts.maxRows ?? opts.windowRows ?? Number.POSITIVE_INFINITY;
  const byteBudget = opts.byteBudget ?? 0;

  // HF-373 Phase H (D11): header keys resolve from a bounded leading sample (identity on clean
  // row-1 sheets — the pre-HF-373 keying byte-for-byte), never blindly from the first physical row.
  const resolver = new StreamHeaderResolver(chosen.name);

  const handleDataCells = async (cells: Map<number, unknown>) => {
    const hdrs = headers!;
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < hdrs.length; i++) obj[hdrs[i]] = cells.has(i) ? cells.get(i) : '';
    const b = opts.rowBytes ? opts.rowBytes(obj) : 1;
    if (shouldFlushBeforeAdd(windowBuf.length, accBytes, b, byteBudget, maxRows)) {
      await opts.onWindow(windowBuf, totalRows - windowBuf.length);
      windowBuf = [];
      accBytes = 0;
    }
    windowBuf.push(obj);
    accBytes += b;
    totalRows += 1;
  };

  const handleRow = async (rowXml: string) => {
    const cells = parseRowCells(rowXml, shared);
    const released = resolver.push(cells);
    if (headers === null && resolver.headers !== null) {
      headers = resolver.headers;
      opts.onHeaders?.(chosen.name, headers);
    }
    for (const dc of released) await handleDataCells(dc);
  };

  await new Promise<void>((resolve, reject) => {
    const stream = zip.file(chosen.path)!.nodeStream('nodebuffer');
    // Process rows OUTSIDE the data callback by pausing the stream while awaiting (backpressure), so a
    // slow per-window commit cannot let chunks pile up unbounded.
    let chain: Promise<void> = Promise.resolve();
    stream.on('data', (chunk: Buffer) => {
      pending += decoder.write(chunk);
      const { rows, rest } = drainRows(pending);
      // CRITICAL (memory): `rest` is a V8 SlicedString of the (growing) `pending` and would RETAIN the
      // whole parent — chaining across chunks blew peak to +568MB. Round-trip through a Buffer to force
      // a flat copy that retains nothing; this is what drops the reader to a few MB (measured +8MB).
      pending = rest.length ? Buffer.from(rest, 'utf8').toString('utf8') : '';
      if (rows.length === 0) return;
      stream.pause();
      chain = chain.then(async () => { for (const r of rows) await handleRow(r); }).then(() => { stream.resume(); }, reject);
    });
    stream.on('end', () => {
      pending += decoder.end();
      const { rows } = drainRows(pending + '</sheetData>'); // flush any final complete row
      chain = chain
        .then(async () => { for (const r of rows) await handleRow(r); })
        .then(async () => {
          // HF-373 Phase H: a sheet shorter than the header sample resolves at end-of-stream.
          const released = resolver.flush();
          if (headers === null && resolver.headers !== null) { headers = resolver.headers; opts.onHeaders?.(chosen.name, headers); }
          for (const dc of released) await handleDataCells(dc);
        })
        .then(async () => { if (windowBuf.length > 0) { await opts.onWindow(windowBuf, totalRows - windowBuf.length); windowBuf = []; } })
        .then(resolve, reject);
    });
    stream.on('error', reject);
  });

  return {
    sheetName: chosen.name,
    headers: headers ?? [],
    totalRows,
    debandBanded: resolver.resolution?.banded ?? false,
    debandObservations: resolver.resolution?.observations,
  };
}

/** Cheap list of worksheet names (reads only workbook.xml — never the worksheets). */
export async function listSheetNames(buffer: ArrayBuffer | Buffer): Promise<string[]> {
  const JSZip = (await import('jszip')).default ?? (await import('jszip'));
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  const zip = await (JSZip as typeof import('jszip')).loadAsync(buf);
  const workbookXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? '';
  const names: string[] = [];
  for (const sm of Array.from(workbookXml.matchAll(/<sheet\b[^>]*name="([^"]*)"/g))) names.push(decodeXml(sm[1]));
  return names;
}

/** Data-row count from a worksheet <dimension ref="A1:CI86608"> (end row − header row), or -1. */
function rowsFromDimensionRef(ref: string): number {
  const parts = ref.split(':');
  const startRow = parseInt(parts[0].replace(/[^0-9]/g, ''), 10);
  const endRow = parseInt(parts[parts.length - 1].replace(/[^0-9]/g, ''), 10);
  if (Number.isNaN(startRow) || Number.isNaN(endRow)) return -1;
  return Math.max(0, endRow - startRow); // minus the header row
}

/**
 * Read a (large) sheet's headers + a small SAMPLE + the true row count CHEAPLY — for the classify
 * worker, which only needs columns + a fingerprint/HC sample, never all rows. Streams just far enough
 * to capture the header + `sampleRows` data rows (reads the <dimension> tag for the true total), then
 * STOPS the stream. Bounded and fast; never materializes the workbook.
 */
export async function streamSheetMeta(
  buffer: ArrayBuffer | Buffer,
  opts: { sampleRows: number; targetSheet?: string },
): Promise<StreamSheetMeta> {
  const JSZip = (await import('jszip')).default ?? (await import('jszip'));
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  const zip = await (JSZip as typeof import('jszip')).loadAsync(buf);

  const workbookXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? '';
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
  const relMap = new Map<string, string>();
  for (const rm of Array.from(relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))) relMap.set(rm[1], rm[2]);
  const sheets: Array<{ name: string; path: string }> = [];
  for (const sm of Array.from(workbookXml.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/?>/g))) {
    let target = relMap.get(sm[2]) ?? '';
    if (target && !target.startsWith('xl/')) target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    sheets.push({ name: decodeXml(sm[1]), path: target });
  }
  const chosen = (opts.targetSheet ? sheets.find(s => s.name === opts.targetSheet) : sheets[0]) ?? sheets[0];
  if (!chosen || !zip.file(chosen.path)) {
    throw new Error(`[sheet-stream] worksheet not found (target=${opts.targetSheet ?? '(first)'})`);
  }
  const shared = parseSharedStrings((await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '');

  let headers: string[] | null = null;
  const sample: Record<string, unknown>[] = [];
  let dataRows = 0;
  let dimRows = -1;
  let pending = '';
  const decoder = new StringDecoder('utf8');
  // HF-373 Phase H (D11): same bounded de-band header resolution as streamSheetWindows —
  // classify and commit key by the SAME recovered header (or the same identity keying).
  const resolver = new StreamHeaderResolver(chosen.name);

  const consumeData = (cells: Map<number, unknown>) => {
    const hdrs = headers!;
    if (sample.length < opts.sampleRows) {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < hdrs.length; i++) obj[hdrs[i]] = cells.has(i) ? cells.get(i) : '';
      sample.push(obj);
    }
    dataRows += 1;
  };

  await new Promise<void>((resolve, reject) => {
    const stream = zip.file(chosen.path)!.nodeStream('nodebuffer');
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      // A short sheet may end (or the sample fill) before the resolver's buffer filled.
      if (headers === null) {
        const released = resolver.flush();
        if (resolver.headers !== null) headers = resolver.headers;
        for (const dc of released) consumeData(dc);
      }
      (stream as { destroy?: () => void }).destroy?.(); resolve();
    };
    stream.on('data', (chunk: Buffer) => {
      if (stopped) return;
      pending += decoder.write(chunk);
      if (dimRows < 0) { const dm = pending.match(/<dimension ref="([^"]+)"/); if (dm) dimRows = rowsFromDimensionRef(dm[1]); }
      const { rows, rest } = drainRows(pending);
      pending = rest.length ? Buffer.from(rest, 'utf8').toString('utf8') : '';
      for (const r of rows) {
        const cells = parseRowCells(r, shared);
        const released = resolver.push(cells);
        if (headers === null && resolver.headers !== null) headers = resolver.headers;
        for (const dc of released) consumeData(dc);
      }
      // Stop once we have the header + enough sample (and, ideally, the dimension).
      if (headers !== null && sample.length >= opts.sampleRows) finish();
    });
    stream.on('end', () => { pending += decoder.end(); finish(); });
    stream.on('error', reject);
  });

  const totalKnown = dimRows >= 0;
  // Banded: the dimension count includes the banner rows — subtract them so estimates stay honest
  // (the dimension already excludes ONE header row via rowsFromDimensionRef).
  const bannerExtra = resolver.resolution?.banded ? Math.max(0, resolver.resolution.dataStartRow - 1) : 0;
  return {
    sheetName: chosen.name,
    headers: headers ?? [],
    sample,
    totalRows: totalKnown ? Math.max(0, dimRows - bannerExtra) : dataRows,
    totalKnown,
    debandBanded: resolver.resolution?.banded ?? false,
    debandObservations: resolver.resolution?.observations,
  };
}
