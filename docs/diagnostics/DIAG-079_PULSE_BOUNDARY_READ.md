# DIAG-079 — Streamed-Commit Pulse Boundary (read-only)

**Branch:** `diag-078-pulse-boundary` off `main` (`c3b7a62d` — Merge #630, HF-358).
**Mode:** READ-ONLY. Zero code changes, no live import, no migration, no merge. The only file written is this report.

---

## VERDICT

**(A) PULSED.** The 42MB `.xlsx` streams and the commit calls `commitContentUnit` once per **20,000-row window** via `commitUnitStreamed` — one CSV upload per window — so the object-size failure is the **first 20K-row window's** CSV exceeding the Storage object-size limit, which halts the remaining windows (so the trace shows "one of each" = window-1-of-5, NOT a whole-sheet single commit). **Deciding line:** `windowed-commit.ts:213` (`commitContentUnit` invoked inside the per-window `onWindow`, `windowRows = CHUNK_ROW_SIZE = 20000`), reached from `execute-bulk/route.ts:552`. → HF-359 makes the per-window pulse **byte-sized**.

The production trace's "single remediation / single supersession / single upload-fail" is **window 1 of 5** that died on its own upload — `commitUnitStreamed` sets `failure` on the first failed window and skips the rest (`windowed-commit.ts:210,228`), so windows 2-5 never log. The earlier "per-window, ~5 CSVs" read is **TRUE for this runtime path**; the trace did not contradict it.

---

## One-line answers

- **Q1 — Upload count:** One CSV upload **per ~20K window** (`commit-content-unit.ts:669` inside `commitUnitStreamed`'s `onWindow`, `windowed-commit.ts:213`). 86,607 rows → 5 windows → 5 uploads on success; in the failing run the **first** window's upload failed (`commit-content-unit.ts:674` "object exceeded the maximum allowed size") and halted the rest → exactly **1** upload executed. NOT one-for-the-whole-sheet.
- **Q2 — Pulse boundary:** `commitContentUnit` is invoked **once per window inside a loop** — `streamSheetWindows(...).onWindow` (`windowed-commit.ts:206-236`), governed by `windowRows = params.windowRows ?? CHUNK_ROW_SIZE` = **20,000** (`windowed-commit.ts:193`, `sheet-window.ts:141`).
- **Q3 — Which branch:** This file STREAMS — `streaming = isSpreadsheetPath('.xlsx') && isLargeByBytes(42MB)` and `STREAM_BYTES_THRESHOLD = 20MB` so 42MB ≥ 20MB → **true** (`execute-bulk:248`, `sheet-stream.ts:53,56`); its data unit (`target|transaction|reference`) routes to `commitUnitStreamed` (`execute-bulk:548-552`). The `document file (.xlsx) … plan pipeline` log is a **misnomer** — it is the `else if (!usedCompanion)` branch of the `!streaming` parse gate (`execute-bulk:319-320`), which a streaming spreadsheet falls into because it skips the up-front `XLSX.read`; it does NOT route the data sheet to the plan pipeline. (Even off the streaming path, `exceedsCellCeiling(86607,87)` = 7,534,809 > 5,000,000 → windows via `commitUnitWindowed`; a whole-sheet single commit is impossible for this sheet.)
- **Q4 — Reconcile:** The earlier "per-window `commitContentUnit`, ~5 CSVs" read is **TRUE for this runtime path** (`execute-bulk:552` → `windowed-commit.ts:213`). The trace's "single" of each is window-1's, surfaced because the first window's upload failed and `commitUnitStreamed` skipped windows 2-5; the single remediation log (`commit-content-unit.ts:556`, "8631 cell(s)") is **window 1's** per-window remediation, not the whole sheet.

---

## Evidence

### Q3 — the file STREAMS (not a document, not whole-sheet)

`web/src/lib/sci/sheet-stream.ts:53-56`
```ts
export const STREAM_BYTES_THRESHOLD = 20_000_000;
...
export function isLargeByBytes(byteLength: number): boolean {
  return byteLength >= STREAM_BYTES_THRESHOLD;
}
```
42,000,000 ≥ 20,000,000 → `isLargeByBytes` = true.

`web/src/app/api/import/sci/execute-bulk/route.ts:248-250`
```ts
      const streaming = isSpreadsheetPath(path) && isLargeByBytes(buffer.byteLength);
      if (streaming) {
        console.log(`[SCI Bulk] OB-251: ${fileName} is ${(buffer.byteLength / 1e6).toFixed(0)}MB ≥ threshold — STREAMED commit (workbook NOT materialized; the real OOM fix)`);
```

The "document file" log is the ELSE of the `!streaming` parse gate — a streaming spreadsheet skips `XLSX.read` and lands here (`execute-bulk:319-320`):
```ts
      } else if (!usedCompanion) {
        console.log(`[SCI Bulk] HF-256: document file (.${extensionOf(path)}) — skipping workbook parse; plan unit routes to format-aware plan pipeline`);
      }
```
(the `if` it is the else of begins `if (!streaming && !usedCompanion && isSpreadsheetPath(path))` — false here because `streaming` is true; the log text is a misnomer for the streaming-skip-parse case, NOT a plan-pipeline routing.)

Whole-sheet single commit is impossible — `web/src/lib/sci/sheet-window.ts:147,154-155`:
```ts
export const CELL_CHUNK_THRESHOLD = 5_000_000;
...
export function exceedsCellCeiling(rows: number, columns: number): boolean {
  return rows * columns > CELL_CHUNK_THRESHOLD;   // 86607 * 87 = 7,534,809 > 5,000,000 → windows
}
```

### Q3 — the data unit routes to `commitUnitStreamed`

`web/src/app/api/import/sci/execute-bulk/route.ts:548-566`
```ts
        if (parse.streaming && parse.buffer) {
          const cls = unit.confirmedClassification;
          if (cls === 'target' || cls === 'transaction' || cls === 'reference') {
            trace(`unit:${tabName}:streamed-commit bytes=${parse.buffer.byteLength}`);
            const sres = await commitUnitStreamed(supabase, {
              unit, buffer: parse.buffer, targetSheet: tabName, classification: cls,
              tenantId, proposalId, tabName, fileName: `sci-bulk-${proposalId}`,
              fileHashSha256: parse.fileHash,
              ...
            });
```

### Q1 + Q2 — per-window loop; one `commitContentUnit` (→ one CSV) per 20K window; first failure halts the rest

`web/src/lib/sci/windowed-commit.ts:193,206-236`
```ts
  const windowRows = params.windowRows ?? CHUNK_ROW_SIZE;   // = 20,000
  ...
  const res = await streamSheetWindows(params.buffer, {
    targetSheet: params.targetSheet,
    windowRows,
    onWindow: async (rows) => {
      if (failure) return;                                  // a prior window failed → skip the rest
      let r: CommitContentUnitResult;
      try {
        r = await commitContentUnit(supabase, {             // <-- one commit PER WINDOW (≤20K rows)
          unit: params.unit, rows, classification: params.classification,
          tenantId: params.tenantId, proposalId: params.proposalId,
          tabName: params.tabName, fileName: params.fileName,
          source: 'sci-bulk', fileHashSha256: params.fileHashSha256,
          rowIndexOffset: offset, entityIdFieldOverride: entityIdField,
        });
      } catch (err) { failure = `window @${offset}: ${String(err)}`; return; }
      if (r.batchId) batchIds.push(r.batchId);
      if (!r.success) { failure = r.error ?? 'window commit failed'; return; }   // first failed upload sets failure
      ...
    },
  });
```

### Q1 — the upload is per-`commitContentUnit` (i.e. per window); the failure log

`web/src/lib/sci/commit-content-unit.ts:666-674`
```ts
  const csvStream = committedRowsCsvStream(
    rows.length,
    (i) => committedRowToCsvLine(buildCommittedRow(rows[i], i) as unknown as CommittedRow),
  );
  const { error: uploadErr } = await supabase.storage
    .from('ingestion-raw')
    .upload(csvPath, csvStream as any, { contentType: 'text/csv', upsert: true, duplex: 'half' } as any);
  if (uploadErr) return await failCommit(`commit CSV upload failed for "${tabName}": ${uploadErr.message}`);
```
`rows.length` here is ONE window (≤20,000), so this CSV is the window's CSV — the object that "exceeded the maximum allowed size" on window 1.

### Q4 — the "single remediation pass" is per-window (window 1's)

`web/src/lib/sci/commit-content-unit.ts:556` (inside `commitContentUnit`, so it runs once per window):
```ts
      `[commitContentUnit] OB-249 remediation: ${remediation.changes.length} cell(s) canonicalized across ` +
```
For a streamed 86K sheet this logs once per window; the trace shows one line (`8631 cell(s)`) because the run halted on window 1's upload (`windowed-commit.ts:210,228`) before windows 2-5 ran.

---

*Read-only diagnostic; zero files changed except this report. Architect cross-check (SR-44, optional): a `storage.objects` listing under the tenant after a (size-limit-raised) run would show up to 5 CSV objects — confirming per-window pulsing; the code read above is decisive on its own.*
