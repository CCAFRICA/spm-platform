# HF-373 Phase 0 — EPG-0.5

**Verdict:** PARTIAL

**Root cause:** The failed pulse was NOT a monolithic whole-sheet CSV and staging does NOT ignore the HF-359 byte budget — staging IS the HF-359 byte-budgeted pulse path. The true defect: `discoverUploadByteBudget` derives the pulse byte budget from the BUCKET's `file_size_limit` alone (pulse-budget.ts:35-56). Between the last working staging run (2026-07-01T05:57Z, bucket limit unreadable -> 40MiB fallback -> budget 33,554,432 -> 837-row/~33.7MB pulses, all uploaded, worker-loaded 312 batches to 'completed') and the failed run (2026-07-02T01:34Z), the architect set ingestion-raw file_size_limit = 104,857,600 (the HF-372 pre-deploy step). The budget became 0.8 x 104,857,600 = 83,886,080, so the first byte-budgeted pulse grew to 1,921 rows (83,886,080 / est ~43,668 B/row) with an ACTUAL serialized size of ~84MB (measured actual is ~40.3-44KB/row) — which exceeds the Supabase PROJECT-GLOBAL per-object upload cap (bounded live: the 42,402,023-byte XLSX uploaded fine at 01:29; the ~84MB pulse CSV was rejected at 01:34 with "The object exceeded the maximum allowed size"; consistent with the 50MiB Supabase global default, which is not readable via the storage REST API). The bucket limit is therefore NOT the effective cap; the budget was honored against the wrong limit. First pulse upload rejected -> failCommit -> unit failed -> stagedPulses empty -> enqueuePulseLoadJob never called (execute-bulk/route.ts:799-807 only enqueues pulses from SUCCESSFUL units) -> pulse_load_jobs got no row. Amplifying factor (why 42MB XLSX ~= 3.5GB CSV): each CSV line repeats the unit-CONSTANT metadata blob — field_identities prose for all 87 columns = 35,839 of 40,296 bytes/row (89%); row_data itself is only 1,565 bytes. Per-row estimate grew ~8.9% between runs (40,090 -> 43,668 B/row) from HF-372 Phase C's richer recognition fields, compounding the budget jump.

**HALT-1 notes:** Directive got wrong: (1) "Staging serialized the parsed sheet as ONE CSV object" — false. The failed run staged the FIRST byte-budgeted pulse of 1,921 rows out of 86,607 (import_batches 02d85774 row_count=1921; telemetry expectedRows=1921 is Hook-2's per-pulse overwrite at commit-content-unit.ts:521-533, not the sheet total). The sheet total is 86,607 (07-01 run: 312 batches x ~837 rows = 259,821 = exactly 3 x 86,607 — the same unit triple-committed pre-HF-371). (2) "staging ignores the HF-359 byte-budget invariant the loader path already honors" — inverted. Staging and loading are the SAME upload path (commitContentUnit); the streamed driver passes budget.byteBudget into streamSheetWindows (windowed-commit.ts:295-328) and the pulse WAS budget-sized. The invariant that broke is that the DISCOVERED limit (bucket file_size_limit=100MiB) exceeds the EFFECTIVE storage cap (project-global, between 42.4MB and ~84MB, presumably 50MiB default). (3) "pulse_load_jobs never received a row" is true for THIS run (staging failed before enqueue), but the hand-off chain as a whole is proven working: on 07-01 the worker drained ~312 pulses (batches flipped staged->completed WITH completed_at at ~2s cadence — only the SQL worker sets completed_at; the sync path at commit-content-unit.ts:849-855 does not). pulse_load_jobs is empty TODAY because Clean Slate/tenant-deletion wipes it (tenant-deletion.ts:53). (4) "CSV flattening of a compressed XLSX is several times larger" — understated and mis-attributed: the ~83x blow-up (42MB -> ~3.5GB per pass) is dominated by per-row repetition of the constant ~36KB field_identities metadata, not by flattening.

**Fix implications:** The architecture stance (parse serverless -> stage CSV parts -> pg_cron worker FDW-loads per part) is confirmed standing, and MORE of it exists than the directive assumes: pulsed multi-part staging, per-part worker loads, per-pulse HALT-DATA-LOSS, cursor-resumable durability all work (proven live 2026-07-01). The fix must therefore target the LIMIT DISCOVERY, not re-introduce pulsing. Constraints and touch-points: (1) pulse-budget.ts discoverUploadByteBudget must derive the budget from the EFFECTIVE per-object cap = min(project-global upload limit, bucket file_size_limit) — the global limit is not readable via the storage REST API (getBucket returns only bucket config), so the fix needs either an architect-verified configuration value, a runtime probe, or a conservative floor; sizing parts to 0.8 x bucket limit alone reproduces the failure exactly. Same defect exists in the HF-372 admission gate (/api/import/sci/upload-budget reports effectiveLimit=104,857,600 — a 60MB XLSX would be admitted and then fail at raw upload). (2) gzip: staging writes uncompressed text/csv (commit-content-unit.ts:771-774) and the RPC's foreign table declares format 'csv', has_header 'true' with NO compress option (20260630_hf356 SQL) — gzip is NOT currently used anywhere in the chain; before building "N gzip parts" the fix must live-prove the installed Wrappers S3 FDW accepts a compress/gzip option (not introspectable via service-role REST; needs architect SQL). Compression leverage is enormous because 89% of every 40.3KB row is the identical repeated 35.8KB field_identities/metadata blob (row_data is 1,565 bytes) — precedent: parsed-companion gzips 91.2MB JSON to 6.5MB (~14x). An alternative/complementary lever with bigger effect than gzip: hoist the unit-constant metadata out of the per-row CSV (pass once to the RPC / stamp per batch), cutting staged bytes ~25x and pulse count from ~104 to ~4 per pass — but committed_data.metadata is read per-row downstream (entity-resolution reads field_identities off batch rows), so that is a design decision requiring reader audit, not a drop-in. (3) "manifest with per-part status, parallel-ready": PulseManifestEntry (pulse-load-types.ts:17-32) has index/batchId/csvPath/expectedRows/bytes/unitId/sheetName but NO per-part status; progress is the single cursor in process_pulse_load_jobs (20260701_hf360 — still the latest worker version; 20260703_hf372 does not touch it). Parallel loading requires a new migration replacing the cursor walk with per-part claim/status (and preserving: FOR UPDATE row-lock concurrency guard, per-pulse COMMIT durability, delete-before-insert idempotent re-load, HALT-DATA-LOSS count check, frozen-manifest resume semantics). (4) Rows must never split across parts (shouldFlushBeforeAdd's lone-oversized-row rule) and Σ part rows == total rows (staging-completeness HALT in windowed-commit.ts:381-388). (5) Housekeeping the fix should address: hand-off pulse CSVs are never deleted after load (9.98GB / 328 objects of residue in Casa Diaz committed/ alone — worker never removes objects; only the sync path cleans up), and Hook-2 (commit-content-unit.ts:521-533) overwrites session telemetry expectedRows/pulsesTotal with per-pulse values on the hand-off path, corrupting the truthful surface. Tables/files: web/src/lib/sci/pulse-budget.ts, commit-content-unit.ts (upload + optional gzip contentType), windowed-commit.ts, pulse-load-types.ts, pulse-load-enqueue.ts, execute-bulk route, upload-budget route; new SQL migration for process_pulse_load_jobs + bulk_commit_from_storage (compress option) + possibly pulse_load_jobs manifest/status columns; architect items: project-global upload limit value (raise or encode), wrappers gzip verification, cron schedule intact.

## Evidence

### web/src/lib/sci/commit-content-unit.ts:731

```
const csvPath = `${tenantId}/committed/${batchId}.csv`;
```

### web/src/lib/sci/commit-content-unit.ts:762-775 (the staging upload — one CSV per PULSE; upload consults NO budget/cap here; runs BEFORE the handOff branch so staged and sync paths share it)

```
let csvByteCount = 0;
  const csvStream = committedRowsCsvStream(
    rows.length,
    (i) => {
      const line = committedRowToCsvLine(buildCommittedRow(rows[i], i) as unknown as CommittedRow);
      csvByteCount += Buffer.byteLength(line, 'utf8') + 1; // +1 for the trailing newline the stream emits
      return line;
    },
  );
  const { error: uploadErr } = await supabase.storage
    .from('ingestion-raw')
    .upload(csvPath, csvStream as any, { contentType: 'text/csv', upsert: true, duplex: 'half' } as any);
  if (uploadErr) return await failCommit(`commit CSV upload failed for "${tabName}": ${uploadErr.message}`);
```

### web/src/lib/sci/commit-content-unit.ts:783-812 (hand-off: staged pulse returned to driver; CSV left for the worker)

```
if (params.handOff) {
    await emitStageRunSignal(...);
    return {
      batchId, totalInserted: 0, dataType, entityIdField, fieldIdentities, earliestDate, latestDate, dateCount, success: true,
      stagedPulse: { batchId, csvPath, expectedRows: rows.length, bytes: csvByteCount, unitId: unit.contentUnitId, sheetName: tabName },
    };
  }
```

### web/src/lib/sci/pulse-budget.ts:17-19,35-56 (byte-budget discovery — BUCKET file_size_limit only; no project-global cap awareness)

```
export const HEADROOM_FRACTION = 0.8;
export const FALLBACK_LIMIT_BYTES = 40 * 1024 * 1024; // 40 MB — below common Supabase global defaults
export const MAX_PULSE_ROWS = 20_000;
...
export async function discoverUploadByteBudget(supabase: SupabaseClient, bucket = 'ingestion-raw'): Promise<UploadBudget> {
  let effectiveLimit = FALLBACK_LIMIT_BYTES;
  let limitSource: 'bucket' | 'fallback' = 'fallback';
  try {
    const { data, error } = await supabase.storage.getBucket(bucket);
    const lim = (data as { file_size_limit?: number | null } | null)?.file_size_limit;
    if (!error && typeof lim === 'number' && lim > 0) {
      effectiveLimit = lim;
      limitSource = 'bucket';
    }
  } catch { /* fall through to the fallback floor */ }
  ...
  return { byteBudget: Math.floor(HEADROOM_FRACTION * effectiveLimit), effectiveLimit, limitSource };
}
```

### web/src/lib/sci/windowed-commit.ts:295-328 (the streamed driver — the path the 42.4MB file takes — DOES honor the budget: pulses are cut by byteBudget via streamSheetWindows; hand-off decided by estTotalPulses>1)

```
const budget = await discoverUploadByteBudget(supabase);
  const rowBytes = makeRowByteEstimator(params.unit, params.classification, entityIdField, {...});
  console.log(`[streamed-commit] byte budget=${(budget.byteBudget / 1048576).toFixed(1)}MB (limit ${(budget.effectiveLimit / 1048576).toFixed(0)}MB, source=${budget.limitSource}); pulse boundary = bytes, not rows`);
  ...
  const estTotalPulses = totalRowsKnown > 0 ? estimatePulseTotal(totalRowsKnown, avgRowBytes, budget.byteBudget) : 1;
  const handOff = shouldHandOff(estTotalPulses);
  ...
  const res = await streamSheetWindows(params.buffer, {
    targetSheet: params.targetSheet,
    byteBudget: budget.byteBudget,
    rowBytes,
    maxRows: MAX_PULSE_ROWS,
    onWindow: async (rows) => { ... commitContentUnit(supabase, { ... handOff: handOff }) ... } });
```

### web/src/lib/sci/pulse-accumulator.ts:11-22 (the ONE flush rule both non-handoff and handoff paths share — the budget IS honored at staging)

```
export function shouldFlushBeforeAdd(bufLen, accBytes, nextRowBytes, byteBudget, maxRows): boolean {
  if (bufLen === 0) return false;                              // a single oversized row goes alone
  if (maxRows > 0 && bufLen >= maxRows) return true;           // safety cap on rows/pulse
  if (byteBudget > 0 && accBytes + nextRowBytes > byteBudget) return true; // the byte budget — the boundary
  return false;
}
```

### web/src/lib/sci/sheet-stream.ts:54-57 + processing_jobs live (routing proof: 42,402,023 >= 20,000,000 -> streamed path)

```
export const STREAM_BYTES_THRESHOLD = 20_000_000;
export function isLargeByBytes(byteLength: number): boolean { return byteLength >= STREAM_BYTES_THRESHOLD; }
-- live job: "file_size_bytes": 42402023
```

### _hf373_epg05_probe1.ts (live processing_jobs — the failed 86K job; tenant IS Casa Diaz, not an unnamed tenant)

```
{
  "id": "0f648189-1a0f-4878-9103-179992b79401",
  "tenant_id": "2d9979ba-5032-48a7-bccf-1928f3e6dadf",
  "status": "finalized",
  "file_name": "1782955730650_0_a1bb9962_Abril_00001_1_demo_REF.xlsx",
  "error_detail": "Commit failed — Abril_00001_1_demo_REF.xlsx::Exportar Hoja de Trabajo::0: commit CSV upload failed for \"Exportar Hoja de Trabajo\": The object exceeded the maximum allowed size",
  "created_at": "2026-07-02T01:29:09.988923+00:00",
  "session_id": "5de0e6e1-fc3f-4b44-ade0-b00f4ddebf0b",
  "retry_count": 1
}
metadata: {"phase":"completed","phase_at":"2026-07-02T01:37:04.186Z","proposal_id":"6291bd7c-fb5c-4ceb-ba67-f985b149a8b7"}  (full row columns: id, tenant_id, status, file_storage_path, file_name, file_size_bytes=42402023, structural_fingerprint, classification_result{contentUnits:[Exportar Hoja de Trabajo=transaction@0.9, SQL=reference@0.45]}, recognition_tier=3, proposal, chunk_progress, error_detail, retry_count, uploaded_by, session_id, created_at, started_at, completed_at, batch_id, chunk_id, total_chunks, metadata)
```

### _hf373_epg05_probe5.ts (live import_batches — the failed run's ONE batch: FIRST PULSE ONLY, 1,921 of 86,607 rows — refutes 'one CSV object for the sheet')

```
{
 "id": "02d85774-bbe5-4b36-b1e6-e788ef51303c",
 "tenant_id": "2d9979ba-5032-48a7-bccf-1928f3e6dadf",
 "file_name": "sci-bulk-6291bd7c-fb5c-4ceb-ba67-f985b149a8b7",
 "row_count": 1921,
 "status": "failed",
 "error_summary": { "hf": "HF-356-COMMIT", "error": "commit CSV upload failed for \"Exportar Hoja de Trabajo\": The object exceeded the maximum allowed size" },
 "created_at": "2026-07-02T01:34:42.130361+00:00",
 "metadata": { "source": "sci-bulk", "proposalId": "6291bd7c-fb5c-4ceb-ba67-f985b149a8b7", "contentUnitId": "Abril_00001_1_demo_REF.xlsx::Exportar Hoja de Trabajo::0", "classification": "transaction" }
}
```

### _hf373_epg05_probe1.ts (live getBucket — the limit the code discovers TODAY; budget = floor(0.8 x 104857600) = 83,886,080)

```
getBucket data: { "id": "ingestion-raw", "name": "ingestion-raw", "public": false, "file_size_limit": 104857600, "allowed_mime_types": null, "created_at": "2026-03-05T01:59:33.724Z", "updated_at": "2026-03-05T01:59:33.724Z" }
all buckets: imports=524288000, ingest-quarantine=null, ingestion-raw=104857600
```

### _hf373_epg05_probe1.ts (live pulse_load_jobs — FP-49: zero rows exist today, so column/manifest introspection is from the migration + type contract; emptiness explained by Clean Slate wipe, see tenant-deletion.ts:53)

```
pulse_load_jobs rows: 0
pulse_load_jobs total count: 0
-- tenant-deletion.ts:53: { key: 'data', label: 'Data layer', tables: ['committed_data', 'processing_jobs', 'import_session_telemetry', 'ingestion_events', 'pulse_load_jobs', 'ingestion_configs', 'file_objects', 'import_finalize_runs'] }
```

### _hf373_epg05_probe3.ts + probe5 (live Storage: a staged pulse CSV from the LAST WORKING run 2026-07-01T05:57Z — per-row anatomy; metadata is 89% of every line)

```
staged CSV total bytes: 33756160 (object 2d9979ba-.../committed/2065cb12-c118-454a-956e-878970312206.csv)
header line: tenant_id,import_batch_id,source_date,data_type,row_data,metadata
line1 length (bytes): 40296
line2 length (bytes): 40286
row_data key count: 89 (incl _sheetName/_rowIndex => 87 data columns)
row_data bytes: 1565  metadata bytes: 35839
metadata keys: [source, proposalId, semantic_roles, resolved_data_type, entity_id_field, informational_label, field_identities, remediation]
field_identities cols: 87; sample identity keys: [structuralType, contextualIdentity, confidence, natureRole]
```

### _hf373_epg05_probe3/5.ts (live import_batches, 07-01 window — the hand-off chain WORKED end-to-end: 312 staged pulses of the SAME unit all flipped 'completed' WITH completed_at at ~2s cadence = the SQL worker's signature; sync path never sets completed_at)

```
=== 07-01 staging-run batches === 312
status histogram: { completed: 312 }
{"id":"ba32f15e-e1e0-4c89-8f54-2b2aea353c32","status":"completed","file_name":"sci-bulk-bcb1d921-c057-436d-951a-08b35bc38208","row_count":837,"created_at":"2026-07-01T05:51:35.455334+00:00","completed_at":"2026-07-01T05:56:07.972104+00:00"}
row_counts sample: [837 x10]
=== 07-01 batches by content unit ===
Abril_00001_1_demo_REF.xlsx::Exportar Hoja de Trabajo::0 {"n":312,"rows":259821,"first":"2026-07-01T05:51:35...","last":"2026-07-01T05:59:41..."}
(259,821 = exactly 3 x 86,607 — the unit was committed 3x that night, pre-HF-371 finalize race; sheet total = 86,607 rows)
```

### budget math (derived from the two runs' live pulse sizes — proves the bucket limit changed between runs and pinpoints the failed pulse's real size)

```
07-01 run: pulses = 837 rows, CSVs 33.62-33.81MB. 33,554,432 (= 0.8 x 40MiB FALLBACK) / 837 = 40,090 est B/row ~= 40,296 actual B/row (estimator within ~0.5%). => bucket file_size_limit was NULL/unreadable on 07-01; fallback governed.
07-02 failed run: first pulse = 1,921 rows. 83,886,080 (= 0.8 x 104,857,600 bucket) / 1,921 = 43,668 est B/row. => bucket limit had been set to 100MiB before this run. Actual first-pulse CSV ~= 1,921 x ~43.9KB ~= 84MB.
Effective cap bound (live): 42,402,023-byte XLSX uploaded OK at 2026-07-02T01:29:09 (same bucket, 5 min before the failure); ~84MB CSV REJECTED at 01:34; largest object ever stored in committed/ = 33,811,725. => effective per-object cap is in (42.4MB, ~84MB) — the project-GLOBAL upload limit (Supabase default 50MiB), NOT the bucket's 104,857,600. The global limit is not exposed by the storage REST API (getBucket shows bucket config only).
```

### web/src/app/api/import/sci/execute-bulk/route.ts:799-815 (why pulse_load_jobs got no row: enqueue collects staged pulses from SUCCESSFUL units only, and runs AFTER the commit loop)

```
const sessionPulses: Array<Omit<PulseManifestEntry, 'index'>> = results.filter((r) => r.success).flatMap((r) => r.stagedPulses ?? []);
    if (sessionPulses.length > 0) {
      pulseLoadJob = await enqueuePulseLoadJob(supabase, { tenantId, sessionId: proposalId, unitId: '(session)', fileName: traceLabel, stagedPulses: sessionPulses });
      ...
      if (!pulseLoadJob) { pulseEnqueueFailed = true; await recordCommitFailureOnJob(supabase, tenantId, sessionId, 'Hand-off enqueue failed — staged rows were not handed to the loader (re-import to retry).'); }
    }
```

### web/src/lib/sci/pulse-load-enqueue.ts:40-57 + pulse-load-types.ts:17-32 (the manifest row shape that WOULD be inserted — table empty live)

```
const manifest: PulseManifestEntry[] = params.stagedPulses.map((p, index) => ({ ...p, index }));
  ...insert({ id: jobId, tenant_id, session_id, unit_id, file_name, status: 'enqueued', manifest, cursor: 0, total_pulses: manifest.length, total_rows: totalRows, rows_loaded: 0, audit: [...] });
-- PulseManifestEntry: { index: number; batchId: string; csvPath: string; expectedRows: number; bytes: number; unitId: string; sheetName: string }
```

### web/supabase/migrations/20260701_hf360_pulse_load_jobs.sql (worker consumption — ALREADY per-part: reads manifest[cursor], one bulk_commit_from_storage per pulse, COMMIT per pulse; cursor is the only per-part progress marker — manifest entries carry NO per-part status field. This is the LATEST worker definition: 20260703_hf372_processing_jobs_metadata.sql only ALTERs processing_jobs (adds metadata jsonb + proposal index) and does NOT touch process_pulse_load_jobs; grep across web/supabase/migrations finds process_pulse_load_jobs only in 20260701_hf360 and a comment in 20260702_hf362)

```
manifest jsonb not null, -- ordered [{index,batchId,csvPath,expectedRows,bytes,unitId,sheetName}]
cursor integer not null default 0, -- index of the NEXT pulse to load (== total_pulses => done)
...
loop
    select cursor, status into v_cursor, v_status from public.pulse_load_jobs where id = v_id for update;
    if v_status is distinct from 'loading' then return; end if;
    exit when v_cursor >= v_total;
    v_pulse    := v_manifest -> v_cursor;
    v_batch    := (v_pulse ->> 'batchId')::uuid;
    v_path     := v_pulse ->> 'csvPath';
    v_expected := (v_pulse ->> 'expectedRows')::integer;
    ...
      delete from public.committed_data where import_batch_id = v_batch and tenant_id = v_tenant;
      v_count := public.bulk_commit_from_storage(v_tenant, v_path, v_batch);  -- the FDW load (no LLM)
    ...
    if v_count <> v_expected then ... status = 'failed', error_detail = 'HALT-DATA-LOSS pulse '||v_cursor... end if;
    update public.import_batches set status = 'completed', row_count = v_count, completed_at = now() where id = v_batch;
    v_cursor := v_cursor + 1;
    update public.pulse_load_jobs set cursor = v_cursor, rows_loaded = rows_loaded + v_count, updated_at = now(), ... where id = v_id;
    commit;  -- THIS pulse is now durable; a stop here resumes from v_cursor
  end loop;
```

### web/supabase/migrations/20260630_hf356_bulk_commit_from_storage.sql (the FDW RPC — gzip: the foreign table is created with NO compression option; format 'csv' + has_header 'true' only. Supabase Wrappers' S3 FDW documents gzip via a `compress 'gzip'` option, but the installed wrappers version/server options are NOT introspectable from the service-role REST client — gzip support must be proven live before the fix relies on it)

```
v_uri text := 's3://ingestion-raw/' || p_csv_path;
  EXECUTE format('DROP FOREIGN TABLE IF EXISTS %I', v_ft);
  EXECUTE format(
    'CREATE FOREIGN TABLE %I (tenant_id text, import_batch_id text, source_date text, data_type text, row_data text, metadata text) '
    'SERVER s3_storage OPTIONS (uri %L, format %L, has_header %L)',
    v_ft, v_uri, 'csv', 'true'
  );
  EXECUTE format(
    'INSERT INTO committed_data (tenant_id, import_batch_id, entity_id, period_id, source_date, data_type, row_data, metadata) '
    'SELECT %L::uuid, %L::uuid, NULL, NULL, NULLIF(source_date, '''')::date, data_type, row_data::jsonb, metadata::jsonb FROM %I',
    p_tenant_id, p_import_batch_id, v_ft);
```

### _hf373_epg05_probe4.ts (live telemetry for the failed run — note expectedRows/pulsesTotal here are Hook-2's per-pulse OVERWRITE (commit-content-unit.ts:521-533 writes expectedRows: rows.length, pulsesTotal: pulseBase.total + 1 with default pulseBase {landed:0,total:0}), NOT the sheet total)

```
unit_states: { "...Exportar Hoja de Trabajo::0state": "failed_interpretation", "...pulsesTotal": 1, "...expectedRows": 1921, "...failureClass": "commit CSV upload failed for \"Exportar Hoja de Trabajo\": The object exceeded the maximum allowed size", "...pulsesLanded": 0, "...rowsCommitted": 0, "...classification": "transaction" }
conclusion.telemetry.rows: { total: 1921, committed: 0 }
```

### _hf373_epg05_probe4.ts (live Storage hygiene finding: loaded/staged pulse CSVs are never cleaned on the hand-off path — the worker only reads; sync path deletes its CSV at commit-content-unit.ts:842-846)

```
committed/ objects: 328 total bytes: 10467500983 (9982.6MB)
min/max size: 8424 33811725
```

