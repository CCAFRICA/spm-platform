# HF-373 Phase 0 — EPG-0.9

**Verdict:** CONFIRMED

**Root cause:** D11 CONFIRMED. The oversized/streamed parse path never applies the de-bander. Exhaustive grep shows debandWorksheet has exactly 5 production call-site files — process-job (classify, small-sheet branch only), execute-bulk (commit, non-oversized branch only), retry-unit, plan-interpretation, and its own definition — and ZERO call sites in windowed-commit.ts, sheet-stream.ts, or sheet-window.ts. Both oversized routes key headers on the literal first physical row: (1) file >= STREAM_BYTES_THRESHOLD (20MB) → streamSheetMeta/streamSheetWindows capture `headers = headerKeysFromCells(cells)` from the FIRST <row> element of sheetData XML (sheet-stream.ts:221-224, 339); (2) file < 20MB but sheet > CELL_CHUNK_THRESHOLD (5M cells) → openSheetWindow captures columns from a sheet_to_json probe of range.s.r, the sheet's first row (sheet-window.ts:46-62). Those raw row-1 keys (including SheetJS __EMPTY synthesis for banner-row gaps) then feed EVERYTHING downstream in classify: fingerprint (process-job:199), flywheel lookupFingerprint (process-job:210), ContentProfile stats (process-job:242-245), decomposed header comprehension (process-job:277-283), and entity-id overlap (process-job:353) — and at commit they key every row-object of every window (sheet-stream.ts:227-228). The gap was a DELIBERATE OB-254 D2 scope decision documented in deband-sheet.ts:15-18 ('Oversized sheets keep the OB-251 windowed/stream header-keying (the OOM defense) untouched'). Notably, constructStructure ALREADY supports a windowed-sample mode (fullGrid:false → bandedBeyondCeiling flag + 'structure:banded_beyond_ceiling' observation, structural-construction.ts:431-432) but its ONLY production caller is debandWorksheet with fullGrid:true — the sample-mode detection is dead code. Consequence exactly as framed: a clean-row-1 JDE extract is unaffected, but a banded human-authored file over either size gate would classify and commit from garbage headers (banner text or __EMPTY/__EMPTY_N keys) with no structural signal emitted (emitStructuralObservations only fires for sheets present in debandResults, process-job:253-263, which the oversized branches never populate).

**HALT-1 notes:** None — the directive framing is accurate in every particular. One enrichment beyond the framing: constructStructure already has the partial-grid (fullGrid:false) detection mode OB-254 D2 designed for exactly this case, but nothing calls it; and deband-sheet.ts's own header comment documents the oversized-path exclusion as an intentional D2 decision, so D11 is a designed-in gap, not a regression.

**Fix implications:** The fix must apply de-band header recovery INSIDE the bounded sample window only, without ever materializing the full sheet, and must keep classify-time and commit-time column keys in agreement. Concretely: (1) debandWorksheet as written CANNOT be called on the streamed path — it takes a materialized XLSX WorkSheet and reads the FULL grid via sheet_to_json({header:1, defval:null, blankrows:true}) (deband-sheet.ts:39); on a >=20MB file no worksheet object ever exists (execute-bulk carries raw bytes, process-job streams XML). The fix should instead call constructStructure directly on a sample GRID (rows-as-arrays) with fullGrid:false — that mode already exists and already emits the 'structure:banded_beyond_ceiling' observation (structural-construction.ts:431-432) but currently has zero production callers. Sample grids are obtainable: sheet-stream can accumulate the first N raw rows as positional arrays (parseRowCells already yields Map<colIdx,unknown> before header-keying, sheet-stream.ts:338); sheet-window can read [range.s.r .. range.s.r+N] with header:1. (2) TOUCH POINTS: process-job/route.ts:137-144 (streamed classify branch — de-band meta.headers/meta.sample before pushing to sheets[]), process-job/route.ts:157-162 (windowed classify branch — de-band reader.columns + sample), execute-bulk/route.ts:305-308 (windowed commit — reader.columns must key the same recovered header) and :591-592 (streamed field-filter sample), sheet-stream.ts streamSheetWindows:221-228 (commit-time row-object keying — the recovered header must key ALL windows, and rows classified as band/banner within the leading window must be skipped/sidecar'd consistently), sheet-window.ts openSheetWindow:46-70 (header capture + readWindow's positional header mapping and firstDataRow offset must shift by the recovered header-row index). If classify recovers headers but commit still keys raw row-1, columns mismatch and HC bindings/entity_id_field lookups break — both sides must go through the same recovery (mirror the OB-254 D3 companion/`same helper` discipline; note streamed files never write a parse companion, process-job:186, so recovery must be deterministic and re-derivable at commit). (3) FINGERPRINT/FLYWHEEL: recovered columns change computeFingerprintHashSync/lookupFingerprint inputs (process-job:199,210) for banded-oversized files only; clean-row-1 files must be provably unchanged. (4) IDENTITY ASSERTION ON THE JDE CLASS: DD-7 tests (structural-construction.test.ts:8-31) prove constructStructure with defvalEmpty:true is the identity transform on clean sheets; the fix must add the analogous assertion for the sample-window mode — a clean first-window grid yields byte-identical {columns, rows} to today's headerKeysFromCells/openSheetWindow output (including __EMPTY synthesis parity for genuinely-absent trailing header cells vs the de-bander's positional col_N naming — NOTE these differ today: dedupeHeaderKeys yields '__EMPTY' where constructStructure yields 'col_2' (structural-construction.test.ts:33-40), so identity on CLEAN sheets means clean sheets must not silently swap __EMPTY -> col_N keys unless the whole pipeline (HC atoms, flywheel fingerprints, committed row keys) migrates together). (5) MEMORY/OOM CONSTRAINTS (must not regress): streamed classify already holds a CHUNK_ROW_SIZE=20,000-row sample (process-job:141) + the full sharedStrings array + the raw file buffer; streamed commit holds one byte-budgeted pulse (<= MAX_PULSE_ROWS=20,000 rows) + sharedStrings, with the SlicedString flat-copy fix keeping the reader at ~+8MB (sheet-stream.ts:248-251); windowed path holds the full dense cell map (XLSX.read dense:true) but never the full row array. De-banding a <=20,000-row sample grid is within these bounds; the fix must NOT read beyond the sample to find a header (bound the band-scan to the sample window), must keep streamSheetMeta's early-stream-destroy (finish() at sheet-stream.ts:348), and must not re-introduce any full-grid materialization on either oversized route (the HF-355 I2 fail-loud guards at process-job:165 and execute-bulk:313-314 stay). No DB/table changes required — this is pure parse-path code; the only DB-adjacent effect is that oversized banded sheets would begin emitting structural signals into classification_signals via the existing emitStructuralObservations path (process-job:253-263) once debandResults is populated for them.

## Evidence

### grep -rn 'debandWorksheet|deband-sheet|debandSheet' web/src (exhaustive; note ABSENCE of windowed-commit.ts / sheet-stream.ts / sheet-window.ts)

```
web/src/app/api/import/sci/execute-bulk/route.ts:54:import { debandWorksheet } from '@/lib/sci/deband-sheet';
web/src/app/api/import/sci/execute-bulk/route.ts:320:            const deband = debandWorksheet(XLSX, ws, sheetName);
web/src/app/api/import/sci/retry-unit/route.ts:17:import { debandWorksheet } from '@/lib/sci/deband-sheet';
web/src/app/api/import/sci/retry-unit/route.ts:73:    const deband = debandWorksheet(XLSX, ws, sheetName);
web/src/app/api/import/sci/process-job/route.ts:43:import { debandWorksheet, emitStructuralObservations } from '@/lib/sci/deband-sheet';
web/src/app/api/import/sci/process-job/route.ts:169:          const deband = debandWorksheet(XLSX, ws, sheetName);
web/src/lib/sci/deband-sheet.ts:34:export function debandWorksheet(
web/src/lib/sci/plan-interpretation.ts:25:import { debandWorksheet } from './deband-sheet';
web/src/lib/sci/plan-interpretation.ts:127:          const db = debandWorksheet(XLSX, ws, u.tabName!);
web/src/lib/sci/plan-interpretation.ts:222:      const db = debandWorksheet(XLSX, worksheet, sheetName);
```

### web/src/app/api/import/sci/process-job/route.ts:135-174 (classify routing: streamed + windowed branches use raw headers; only the small branch debands)

```
    // OB-251 HOTFIX: a file big enough that XLSX.read would OOM is CLASSIFIED by STREAMING each sheet's
    // header + bounded sample + true row count (from <dimension>) — the workbook is NEVER materialized.
    if (isLargeByBytes(buffer.byteLength)) {
      anySampled = true;
      const names = await listSheetNames(buffer);
      for (const sheetName of names.length ? names : [undefined]) {
        const meta = await streamSheetMeta(buffer, { sampleRows: CHUNK_ROW_SIZE, targetSheet: sheetName });
        sheets.push({ sheetName: meta.sheetName, columns: meta.headers, rows: meta.sample, totalRowCount: meta.totalRows });
        console.log(`[SCI-WORKER] OB-251 STREAM: ${meta.sheetName} ${meta.totalRows}r×${meta.headers.length}c (total ${meta.totalKnown ? 'known' : 'sampled'}) — classify on ${meta.sample.length}-row sample (commit STREAMS all rows)`);
      }
    } else {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'array', dense: true });
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        if (!ws) continue;
        const dim = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const r = Math.max(0, dim.e.r - dim.s.r);
        const c = dim.e.c - dim.s.c + 1;
        if (exceedsCellCeiling(r, c)) {
          const reader = openSheetWindow(XLSX, ws, sheetName);
          const sample = reader.readWindow(0, CHUNK_ROW_SIZE);
          anySampled = true;
          sheets.push({ sheetName, columns: reader.columns, rows: sample, totalRowCount: reader.totalRows });
          console.log(`[SCI-WORKER] HF-355/OB-251: ${sheetName} ${reader.totalRows}r×${reader.columns.length}c — classify on bounded ${sample.length}-row sample (commit re-reads windowed)`);
        } else {
          ...
          // OB-254 (D1): de-band at the parse→sheets boundary — recover the REAL header (no __EMPTY)
          // BEFORE the fingerprint...
          const deband = debandWorksheet(XLSX, ws, sheetName);
          sheets.push({ sheetName, columns: deband.columns, rows: deband.rows, totalRowCount: deband.rows.length });
          debandResults.set(sheetName, deband.result);
        }
      }
    }
```

### web/src/lib/sci/sheet-stream.ts:219-238 (streamed header keying: FIRST <row> becomes the header, keys every window's row-objects)

```
  const handleRow = async (rowXml: string) => {
    const cells = parseRowCells(rowXml, shared);
    if (headers === null) {
      // Header row → canonical keys matching sheet_to_json (present-empty '' vs absent __EMPTY).
      headers = headerKeysFromCells(cells);
      opts.onHeaders?.(chosen.name, headers);
      return;
    }
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = cells.has(i) ? cells.get(i) : '';
```

### web/src/lib/sci/sheet-stream.ts:30-48 (headerKeysFromCells — reproduces SheetJS __EMPTY synthesis; a banded banner row yields garbage/__EMPTY keys)

```
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
```

### web/src/lib/sci/sheet-stream.ts:337-348 (streamSheetMeta sample loop: same raw-row-1 headers feed the classify sample)

```
      for (const r of rows) {
        const cells = parseRowCells(r, shared);
        if (headers === null) { headers = headerKeysFromCells(cells); continue; }
        if (sample.length < opts.sampleRows) {
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < headers.length; i++) obj[headers[i]] = cells.has(i) ? cells.get(i) : '';
          sample.push(obj);
        }
        dataRows += 1;
      }
      // Stop once we have the header + enough sample (and, ideally, the dimension).
      if (headers !== null && sample.length >= opts.sampleRows) finish();
```

### web/src/lib/sci/sheet-window.ts:45-70 (openSheetWindow: headerRow = range.s.r, the sheet's FIRST physical row; SheetJS default __EMPTY inference)

```
export function openSheetWindow(XLSX: XLSXModule, ws: WorkSheet, sheetName: string): SheetWindow {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const headerRow = range.s.r;
  const firstDataRow = headerRow + 1;
  ...
  // Capture canonical header keys via a default-inference probe of [headerRow .. firstDataRow].
  // sheet_to_json treats the first row of the range as the header and applies its own dedup/__EMPTY
  // synthesis...
  let columns: string[];
  if (totalRows > 0) {
    const probe = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      ...DEFAULT_PARSE,
      range: { s: { r: headerRow, c: range.s.c }, e: { r: firstDataRow, c: range.e.c } },
    });
    columns = probe.length > 0 ? Object.keys(probe[0]) : [];
  } else {
    ...
    columns = dedupeHeaderKeys(raw);
  }
```

### web/src/app/api/import/sci/process-job/route.ts:197-210 + 241-247 + 277-283 + 353 (where raw sample headers feed classification/recognition)

```
    const primarySheet = sheets[0];
    const fingerprintHash = primarySheet
      ? computeFingerprintHashSync(primarySheet.columns, primarySheet.rows)
      : '';
...
        const result = await lookupFingerprint(
          tenantId, sheet.columns, sheet.rows,
...
      const sampleRows = sheet.rows.slice(0, ANALYSIS_SAMPLE_SIZE);
      const profile = generateContentProfileStats(
        sheet.sheetName, tabIndex, fileName,
        sheet.columns, sampleRows, sheet.totalRowCount,
      );
      profileMap.set(sheet.sheetName, profile);
      sheetSampleRowsBySheet.set(sheet.sheetName, sampleRows);
...
      const dc = await runDecomposedComprehension(
        profileMap,
        sheetsNeedingHC.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows, rowCount: s.totalRowCount })), // FULL rows (Deviation 2)
...
            const overlap = computeEntityIdOverlap(profile, sheet.rows, tenantCtx.existingEntityExternalIds);
```

### web/src/app/api/import/sci/process-job/route.ts:253-263 (structural signals emitted ONLY for debanded sheets — oversized sheets get none)

```
    for (const sheet of sheets) {
      const dr = debandResults.get(sheet.sheetName);
      if (!dr) continue;
      const fpHash = sheetFlywheelResults.get(sheet.sheetName)?.fingerprintHash;
      await emitStructuralObservations(
        dr.observations,
        { tenantId, sourceFileName: fileName, sheetName: sheet.sheetName, fingerprint: fpHash ? { hash: fpHash } : null },
```

### web/src/lib/sci/sheet-stream.ts:50-58 (size gate 1: byte gate to the STREAMED path)

```
// A file at/above this many bytes is read by the streaming parser (its XLSX.read would risk OOM). Set
// well above every HALT-CALC anchor's file size (BCL/Meridian tiny, MIR ~75k×16 ≈ a few MB) and below
// the JDE export (~52MB)...
export const STREAM_BYTES_THRESHOLD = 20_000_000;

export function isLargeByBytes(byteLength: number): boolean {
  return byteLength >= STREAM_BYTES_THRESHOLD;
}
```

### web/src/lib/sci/sheet-window.ts:140-156 (size gate 2: cell ceiling to the WINDOWED path + classify sample size)

```
export const ROW_CHUNK_THRESHOLD = 50_000; // a file over this splits into chunk-jobs
export const CHUNK_ROW_SIZE = 20_000;      // rows per window/chunk (peak ≈ ~300MB/worker on 87 cols)
export const CLASSIFY_SAMPLE_WINDOW = 1_000; // classify only needs columns + a 50-row sample + fingerprint
...
export const CELL_CHUNK_THRESHOLD = 5_000_000;

// HF-355 (I2 — hard size ceiling, Decision 158): the SINGLE source of truth for "oversized"...
export function exceedsCellCeiling(rows: number, columns: number): boolean {
  return rows * columns > CELL_CHUNK_THRESHOLD;
}
```

### web/src/app/api/import/sci/execute-bulk/route.ts:263-321 (commit routing: streaming carries raw buffer, windowed keeps raw reader.columns; only else-branch debands)

```
      const streaming = isSpreadsheetPath(path) && isLargeByBytes(buffer.byteLength);
...
          if (exceedsCellCeiling(approxRows, approxCols)) {
            // HF-355 I2 / OB-251 P-C1: OVERSIZED — keep a bounded-window reader; the commit loop streams
            // it through commitUnitWindowed (peak ≈ one window). The full row array is NEVER built.
            const reader = openSheetWindow(XLSX, ws, sheetName);
            anyWindowed = true;
            sheetDataMap.set(sheetName, { rows: [], columns: reader.columns, reader, totalRows: reader.totalRows, windowed: true });
...
          } else {
            ...
            // OB-254 (D1/D3): de-band through the SAME helper classify used (deterministic)...
            const deband = debandWorksheet(XLSX, ws, sheetName);
            sheetDataMap.set(sheetName, { rows: deband.rows, columns: deband.columns });
          }
```

### web/src/app/api/import/sci/execute-bulk/route.ts:582-596 (streamed commit dispatch: raw buffer → commitUnitStreamed; 50-row raw-header sample for field filter)

```
        if (parse.streaming && parse.buffer) {
          const cls = unit.confirmedClassification;
          if (cls === 'target' || cls === 'transaction' || cls === 'reference') {
            trace(`unit:${tabName}:streamed-commit bytes=${parse.buffer.byteLength}`);
            ...
            let effStreamUnit = unit;
            try {
              const sMeta = await streamSheetMeta(parse.buffer, { sampleRows: 50, targetSheet: tabName });
              effStreamUnit = filterFieldsForPartialClaim(unit, sMeta.sample).unit;
            } catch (sampleErr) { ... }
            const sres = await commitUnitStreamed(supabase, {
```

### web/src/lib/sci/deband-sheet.ts:31-44 (debandWorksheet signature + DD-7 identity guarantee — note it REQUIRES a materialized worksheet + full grid)

```
/** Read a worksheet's raw `{header:1}` grid and de-band it into the primary records unit's
 *  {columns, rows}. `defvalEmpty:true` reproduces `sheet_to_json(ws,{defval:''})` cell-fill so a clean
 *  sheet's records are byte-identical to the legacy read (DD-7). */
export function debandWorksheet(
  XLSX: typeof XLSXNS,
  ws: XLSXNS.WorkSheet,
  sheetName: string,
): DebandedSheet {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true }) as unknown[][];
  const mergedRanges = (ws['!merges'] ?? []).map((m) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } }));
  const result = constructStructure(grid, { fullGrid: true, mergedRanges, sheetName, defvalEmpty: true });
  const rec = result.units.find((u) => u.kind === 'records');
  return { sheetName, columns: rec ? rec.header : [], rows: rec ? rec.rows : [], result };
}
```

### web/src/lib/sci/deband-sheet.ts:15-18 (the D2 decision that CREATED this gap — oversized path intentionally excluded)

```
// D2 (scale): this helper runs whenever the FULL grid materializes (a non-oversized sheet — every
// human-authored banded report is small, incl. the Casa Diaz file). Oversized sheets keep the OB-251
// windowed/stream header-keying (the OOM defense) untouched; that is the degenerate, grid-unavailable
// input of the same conceptual stage (D2's recommended option (a)).
```

### web/src/lib/sci/__tests__/structural-construction.test.ts:8-31 (DD-7 identity-transform regression tests on clean sheets)

```
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
```

### web/src/lib/sci/structural-construction.ts:431-436 + grep constructStructure( (the DORMANT sample-mode: fullGrid:false banded detection exists but has no production caller)

```
  const bandedBeyondCeiling = !opts.fullGrid && classes.some((c) => c === 'SECTION_LABEL' || c === 'SUBTOTAL');
  if (bandedBeyondCeiling) observations.push({ kind: 'structure:banded_beyond_ceiling', detail: { sheet: opts.sheetName, note: 'banded structure in windowed sample; full-grid de-band skipped (over OB-251 cell ceiling)' } });
...
  return { units, sidecar, observations, transformMap, fullGrid: opts.fullGrid, bandedBeyondCeiling, classes };

// grep -rn 'constructStructure(' web/src --include='*.ts' | grep -v __tests__ →
// web/src/lib/sci/deband-sheet.ts:41:  const result = constructStructure(grid, { fullGrid: true, mergedRanges, sheetName, defvalEmpty: true });
// web/src/lib/sci/structural-construction.ts:209:export function constructStructure(grid: unknown[][], opts: ConstructOptions): ConstructionResult {
// (deband-sheet.ts is the ONLY production caller — always fullGrid:true)
```

### web/src/lib/sci/sheet-stream.ts:203-204 + 245-254 (memory constraints on the streamed path: sharedStrings resident; SlicedString flat-copy fix, measured +8MB)

```
  // sharedStrings — bounded by UNIQUE strings (not cell count). Decompressed once.
  const shared = parseSharedStrings((await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '');
...
    stream.on('data', (chunk: Buffer) => {
      pending += decoder.write(chunk);
      const { rows, rest } = drainRows(pending);
      // CRITICAL (memory): `rest` is a V8 SlicedString of the (growing) `pending` and would RETAIN the
      // whole parent — chaining across chunks blew peak to +568MB. Round-trip through a Buffer to force
      // a flat copy that retains nothing; this is what drops the reader to a few MB (measured +8MB).
      pending = rest.length ? Buffer.from(rest, 'utf8').toString('utf8') : '';
```

### web/src/lib/sci/pulse-budget.ts:19 + windowed-commit.ts:154-157 (commit-side memory bound: MAX_PULSE_ROWS chunk cap)

```
export const MAX_PULSE_ROWS = 20_000;                 // former CHUNK_ROW_SIZE, demoted to a safety cap
...
  for (let chunkStart = 0; chunkStart < totalRows; chunkStart += MAX_PULSE_ROWS) {
    const chunk = params.reader.readWindow(chunkStart, MAX_PULSE_ROWS);
    if (chunk.length === 0) break;
    const spans = planPulses(chunk.length, (i) => rowBytes(chunk[i]), budget.byteBudget, MAX_PULSE_ROWS);
```

