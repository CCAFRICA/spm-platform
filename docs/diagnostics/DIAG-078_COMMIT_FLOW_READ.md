# DIAG-078 — Commit Control-Flow Read

**Branch:** `diag-commit-flow-read` off `main` (`da73d10c`, includes the HF-356 merge `30365579`).
**Mode:** READ-ONLY. Zero code changes, zero schema changes, no import run, no migration. The only file written is this report.

---

## VERDICT

**(A) — Windowing IS wired to the CSV/FDW transport: per-window CSV + per-window RPC, NOT one whole-file CSV.** `commitUnitStreamed` streams the sheet in 20,000-row windows and calls `commitContentUnit` once per window (`windowed-commit.ts:213`), and each `commitContentUnit` writes ONE CSV and calls `bulk_commit_from_storage` ONCE for **that window's** `rows` (`commit-content-unit.ts:638` — `new Array(rows.length)` where `rows` is the window, not the 86,607-row file) — so the 86K file produces ~5 CSVs + ~5 RPCs. **The whole-file-materialization hypothesis is REFUTED.**

The OOM is **not** a whole-file CSV; it is the **per-window footprint**: each `commitContentUnit` call holds the full 20,000-row window's serialized form **three times at once** — `csvLines` (20K strings, `commit-content-unit.ts:638`), the joined `csvBody` string (`:668`), and `Buffer.from(csvBody)` (`:671`) — on top of that window's input `rows` + the remediation `correctedRows`. The pre-HF-356 path committed the **same** window in 500-row chunks (`buildCommittedRow` per `rows.slice` chunk, dropped after each insert), so HF-356 raised the intra-window transient peak by ~40× (whole 20K window vs a 500-row chunk). Confirming the exact peak and which memory ceiling it crosses **requires an architect-side run (SR-44)** — but the windowing is wired; the regression is the per-window CSV materialization, not whole-file materialization.

**Deciding `file:line`:** `web/src/lib/sci/windowed-commit.ts:209‑225` (per-window `commitContentUnit`) + `web/src/lib/sci/commit-content-unit.ts:638` (`csvLines = new Array(rows.length)`, `rows` = one 20K window).

---

## One-line answers

- **Q1 — Transport count:** Once **per window**, not per file. `commitUnitStreamed` loops 20K-row windows; each window = 1 CSV + 1 RPC → ~5 CSVs + ~5 RPCs for the 86,607-row file.
- **Q2 — Materialization point(s):** Per **window** (≤20K rows), three simultaneous copies — `csvLines` array (`:638`), `csvBody` joined string (`:668`), `Buffer.from(csvBody)` (`:671`) — plus the window's input `rows` and remediation `correctedRows`. None is whole-file.
- **Q3 — Windowing reality:** It genuinely iterates windows. `CHUNK_ROW_SIZE = 20_000` (`sheet-window.ts:141`); `streamSheetWindows` flushes + **resets `windowBuf = []`** per window (`sheet-stream.ts:217-219`); `commitUnitStreamed.onWindow` calls `commitContentUnit` per window (`windowed-commit.ts:209-225`).
- **Q4 — Silent failure:** `failCommit` (`commit-content-unit.ts:650-664`) writes `error_summary` on **import_batches** + `rowsCommitted:0` on telemetry, and returns `success:false` — it does **not** write `processing_jobs.error_detail`. On an OOM the Lambda is killed and `failCommit` never runs, so **nothing** is written (the job is left non-terminal).
- **Q5 — 0 comprehended fields:** The set is built **only** from each unit's `classificationTrace.headerComprehension.interpretations` (`execute-bulk/route.ts:356-377`); on a Tier-1 recognition HC is skipped (`process-job/route.ts:272` `skipHC`), so no `interpretations` exist this run → every unit is `continue`'d → `0 fields from 0 data sheets` (`:379`). The persisted atoms/fingerprints that drove the Tier-1 match are never consulted here. *(Identified, not fixed.)*
- **Q6 — Cron re-dispatch:** `dispatch-jobs` picks `status='pending'` (`:82`), requeues `status='failed'` only while `retry_count < MAX_RETRIES` (`:117-118`, the kill-switch guard), and **reclaims** stuck `classifying`/`committing` older than 5 min (`:150-165`) **with NO retry_count cap** → a worker that died (OOM) without reaching a terminal state is reclaimed to `pending` and re-dispatched, indefinitely if the OOM recurs.

---

## Evidence

### Q1 + Q3 — `commitUnitStreamed` iterates windows; one commit per window

`web/src/lib/sci/sheet-window.ts:141`
```ts
export const CHUNK_ROW_SIZE = 20_000;      // rows per window/chunk (peak ≈ ~300MB/worker on 87 cols)
```

`web/src/lib/sci/sheet-stream.ts:215-220` — the streamer flushes and **resets** `windowBuf` per window (the reader is bounded to one window):
```ts
    windowBuf.push(obj);
    totalRows += 1;
    if (windowBuf.length >= opts.windowRows) {
      await opts.onWindow(windowBuf, totalRows - windowBuf.length);
      windowBuf = [];
    }
```

`web/src/lib/sci/windowed-commit.ts:189-235` — `commitUnitStreamed` calls `commitContentUnit` **once per window**, passing only that window's `rows`:
```ts
export async function commitUnitStreamed(
  supabase: SupabaseClient,
  params: StreamedCommitParams,
): Promise<WindowedCommitResult> {
  const windowRows = params.windowRows ?? CHUNK_ROW_SIZE;
  ...
  const res = await streamSheetWindows(params.buffer, {
    targetSheet: params.targetSheet,
    windowRows,
    onWindow: async (rows) => {
      if (failure) return;
      let r: CommitContentUnitResult;
      try {
        r = await commitContentUnit(supabase, {
          unit: params.unit,
          rows,                                   // <-- ONE WINDOW's rows (≤ 20K), not the file
          classification: params.classification,
          ...
          rowIndexOffset: offset,
          entityIdFieldOverride: entityIdField,
        });
      } catch (err) { failure = `window @${offset}: ${String(err)}`; return; }
      ...
      offset += rows.length;
    },
  });
```

`web/src/app/api/import/sci/execute-bulk/route.ts:531-548` — the large/streaming unit routes to `commitUnitStreamed` (the workbook is never materialized):
```ts
        if (parse.streaming && parse.buffer) {
          const cls = unit.confirmedClassification;
          if (cls === 'target' || cls === 'transaction' || cls === 'reference') {
            trace(`unit:${tabName}:streamed-commit bytes=${parse.buffer.byteLength}`);
            const sres = await commitUnitStreamed(supabase, {
              unit,
              buffer: parse.buffer,
              targetSheet: tabName,
              classification: cls,
              ...
```

### Q1 + Q2 — `commitContentUnit` writes ONE CSV + ONE RPC for the call's `rows`; the per-window materialization

`web/src/lib/sci/commit-content-unit.ts:638-641` — `csvLines` is sized to **the call's** `rows` (one window), and every line is built+held:
```ts
  const csvLines: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    // Build one row, serialize it, let the built object be collected — never hold all built rows at once.
    csvLines[i] = committedRowToCsvLine(buildCommittedRow(rows[i], i) as unknown as CommittedRow);
  }
```

`web/src/lib/sci/commit-content-unit.ts:668-682` — the **second** and **third** copies (`csvBody` join, `Buffer.from`), then ONE upload + ONE RPC:
```ts
  const csvBody = `${CSV_HEADER}\n${csvLines.length ? csvLines.join('\n') + '\n' : ''}`;
  const { error: uploadErr } = await supabase.storage
    .from('ingestion-raw')
    .upload(csvPath, Buffer.from(csvBody, 'utf8'), { contentType: 'text/csv', upsert: true });
  if (uploadErr) return await failCommit(`commit CSV upload failed for "${tabName}": ${uploadErr.message}`);

  const { data: loadedCount, error: rpcErr } = await supabase.rpc('bulk_commit_from_storage', {
    p_tenant_id: tenantId,
    p_csv_path: csvPath,
    p_import_batch_id: batchId,
  });
  if (rpcErr) return await failCommit(`bulk_commit_from_storage failed for "${tabName}": ${rpcErr.message}`);
  const totalInserted = Number(loadedCount ?? 0);
```

The header comment confirms the per-window design intent (`commit-content-unit.ts:635-637`): *"For a windowed large file this runs once per bounded window … so peak heap stays one window."* The materialization is therefore per-window (≤20K), **not** whole-file — but it is now the WHOLE window at once (`csvLines` + `csvBody` + `Buffer`), where the prior path inserted the same window in 500-row chunks.

### Q4 — Failure path writes no `error_detail`; OOM writes nothing

`web/src/lib/sci/commit-content-unit.ts:650-664`:
```ts
  const failCommit = async (reason: string): Promise<CommitContentUnitResult> => {
    console.error(`[commitContentUnit] ${reason}`);
    await supabase.from('committed_data').delete().eq('import_batch_id', batchId);
    await supabase.from('import_batches').update({
      status: 'failed',
      error_summary: { error: reason, hf: 'HF-356-COMMIT' } as unknown as Json,
    }).eq('id', batchId);
    await accumulateUnitCommitFields({
      tenantId,
      importSessionId: proposalId,
      unitId: unit.contentUnitId,
      fields: { rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false },
    }, supabase);
    return { batchId, totalInserted: 0, dataType, entityIdField, fieldIdentities, earliestDate, latestDate, dateCount, success: false, error: reason };
  };
```
`error_summary` is written to **import_batches**, never `processing_jobs.error_detail`. And `failCommit` is only reached on a *caught* error (upload error, RPC error, count mismatch). An OOM kill bypasses all of this — no row is updated — so the failure is silent at the job level (relevant to Q6's reclaim).

### Q5 — comprehended-field set is this-run HC only

`web/src/app/api/import/sci/execute-bulk/route.ts:356-379`:
```ts
    const comprehendedFieldMap = new Map<string, { field: string; meaning: string; role: string }>();
    let comprehendedSheetCount = 0;
    for (const unit of sortedUnits) {
      if (unit.confirmedClassification === 'plan') continue;
      const hc = (unit.classificationTrace as Record<string, unknown> | undefined)
        ?.headerComprehension as
          | { interpretations?: Record<string, { characterization?: string; data_nature?: string; confidence?: number }> }
          | null
          | undefined;
      const interps = hc?.interpretations;
      if (!interps || Object.keys(interps).length === 0) continue;   // <-- Tier-1 HC-skip => no interps => skipped
      comprehendedSheetCount++;
      for (const [colName, interp] of Object.entries(interps)) {
        if (!comprehendedFieldMap.has(colName)) {
          comprehendedFieldMap.set(colName, { field: colName, meaning: interp.characterization || '', role: interp.data_nature || 'unknown' });
        }
      }
    }
    const comprehendedFields = Array.from(comprehendedFieldMap.values());
    console.log(`[SCI Bulk] HF-270 comprehended-field set: ${comprehendedFields.length} fields from ${comprehendedSheetCount} data sheets`);
```

`web/src/app/api/import/sci/process-job/route.ts:272` — HC is skipped on a Tier-1 recognition, so the units carry no `headerComprehension.interpretations` this run:
```ts
    const skipHC = sheetsNeedingHC.length === 0;
```
The persisted fingerprint/atom data that produced the Tier-1 match is not read into `comprehendedFieldMap` — the set is sourced exclusively from this-run HC output. *(Identify only — no fix.)*

### Q6 — dispatch-jobs selection + guards

`web/src/app/api/import/sci/dispatch-jobs/route.ts:45-47`:
```ts
const MAX_RETRIES = 3;
const STALE_CLASSIFYING_MS = 5 * 60_000;
```

Selection (pending), requeue (failed, retry-capped), reclaim (stuck, **no** retry cap) — `:79-165`:
```ts
    const { data: pending, error: pendingErr } = await supabase
      .from('processing_jobs')
      .select('id')
      .eq('status', 'pending')                       // (1) only pending dispatched
      .order('created_at', { ascending: true })
      .limit(PENDING_BATCH_SIZE);
    ...
    const { data: failed, error: failedErr } = await supabase
      .from('processing_jobs')
      .select('id, retry_count, started_at')
      .eq('status', 'failed')
      .lt('retry_count', MAX_RETRIES);               // (2) failed requeued ONLY while retry_count < 3
    ...
    // ── 3. RECLAIM STALE ──
    const RECLAIM_TARGET: Record<'classifying' | 'committing', string> = { classifying: 'pending', committing: 'classified' };
    for (const stuckStatus of ['classifying', 'committing'] as const) {
      const { data: stuck, error: stuckErr } = await supabase
        .from('processing_jobs')
        .select('id')
        .eq('status', stuckStatus)
        .lt('started_at', staleCutoff);              // (3) stuck > 5min → reset; NO retry_count guard here
      ...
        const reset = await supabase
          .from('processing_jobs')
          .update({ status: RECLAIM_TARGET[stuckStatus] })
          .eq('id', job.id)
          .eq('status', stuckStatus)
          .select('id');
```
A terminal `'failed'` job with `retry_count >= MAX_RETRIES` is **not** requeued (line 118 — this is the guard the HF-356 kill switch relies on). But a worker that OOM-died **without** marking the job terminal leaves it `'classifying'`/`'committing'`; the reclaim step resets it to `'pending'`/`'classified'` after 5 min with **no retry cap**, so it is re-dispatched — repeatedly, if the OOM recurs. (Note: the cron dispatches `process-job` (classify); the 86K commit OOM is in `execute-bulk`, which the cron does not dispatch.)

---

*Read-only diagnostic; zero files changed except this report.*
