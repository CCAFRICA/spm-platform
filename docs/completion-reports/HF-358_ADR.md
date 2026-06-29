# HF-358 — Architecture Decision Record

**Work item:** HF-358 — Ingestion Memory Bound + No-Silent-Failure + Clean Slate True-Delete
**Branch:** `hf-358-ingestion-memory-bound` (worktree off `origin/main` `0b34e77b`) · **Mode:** ULTRACODE · **Date:** 2026-06-29
Committed BEFORE implementation (§3 gate). The unifying invariant: **no operation may report success, or exit a failure, without verifying and recording what it actually did.**

---

## §3.1 — Schema facts (FP-49, live service-role probe — `scripts/_hf358_schema_probe.ts`)

Pasted output (read-only; zero writes). The repo's `SCHEMA_REFERENCE_LIVE.md` is stale in three places this work touches — corrected below from the live probe.

```
— committed_data columns —
   id, tenant_id, import_batch_id, entity_id, period_id, data_type, row_data, metadata, created_at, source_date
— processing_jobs columns —
   id, tenant_id, status, file_storage_path, file_name, file_size_bytes, structural_fingerprint, classification_result,
   recognition_tier, proposal, chunk_progress, error_detail, retry_count, uploaded_by, session_id, created_at,
   started_at, completed_at, batch_id, chunk_id, total_chunks
— import_batches columns —
   id, tenant_id, file_name, file_type, row_count, status, error_summary, uploaded_by, created_at, completed_at,
   metadata, superseded_by, supersedes, superseded_at, supersession_reason, file_hash_sha256, content_unit_hash_sha256

— processing_jobs.status values in use (sample 1000) —
   classified:5

— Clean Slate target tables: tenant_id presence —
   calculation_traces tenant_id ✓ | calculation_results ✓ | entity_period_outcomes ✓ | summary_artifacts ✓
   rule_set_assignments ✓ | rule_sets ✓ | entity_relationships ✓ | entities ✓
   committed_data ✓ | processing_jobs ✓ | import_session_telemetry ✓ | ingestion_events ✓
   classification_signals ✓ | structural_fingerprints ✓ | import_batches ✓

— Casa Diaz current state (2d9979ba…) —
   committed_data rows: 257   |   import_batches rows: 17   |   calc_traces(committed_data_id not null): 0
   processing_jobs (3): all status=classified, retry=0, error_detail=null
     session ids: d8001224 / c134d359 / f078c757 (≠ tenant_id — session_id is the import-session key)

— FK constraints referencing committed_data —
   information_schema not queryable via PostgREST (PGRST205) → architect confirms FK blockers in SQL Editor
```

**Facts established (each stated, not assumed):**
- `processing_jobs` HAS `error_detail` (text, nullable), `retry_count` (int, NOT NULL default 0), `started_at` (timestamptz), `completed_at` (timestamptz), and **`session_id` (uuid, NOT NULL)**. The schema doc says 18 columns; **live = 21** (adds `batch_id`, `chunk_id`, `total_chunks`).
- **`session_id` = execute-bulk's `proposalId`** — the link the commit needs to write a job-visible terminal state (Part B-1). Verified: the import flow keys `processing_jobs` by `session_id`; `execute-bulk` receives `proposalId` (`execute-bulk/route.ts:114,141`); the client transitions the job `classified→committing→committed` (`operate/import/page.tsx:483,531`).
- `committed_data` has `import_batch_id` (NOT `source_import_batch_id` as the doc claims) and `tenant_id`.
- Every Clean Slate target table carries `tenant_id` (tenant-scoped delete is structurally possible for all).
- Casa Diaz has **257** residual `committed_data` rows now (the 27,401 from DIAG-078 are already gone), `calc_traces.committed_data_id = 0` (no EDGE-1 block currently). The 3 jobs are `classified` with no `error_detail`.
- Live `processing_jobs.status` values observed: `classified`. The full set the code uses: `pending | classifying | classified | committing | committed | failed`. **Terminal failure status chosen: `failed`** (the value `dispatch-jobs` requeue and the kill switch already key on).

## §3.2 — Part A mechanism decision (OOM fix)

**Current write (`commit-content-unit.ts:638-682`):** `csvLines = new Array(rows.length)` (20K serialized strings) → `csvBody = csvLines.join('\n')` (one ~80MB string) → `Buffer.from(csvBody)` (another ~80MB) → `.upload(...)`. Three simultaneous copies of the whole window on top of the window's `rows` + remediation `correctedRows`. This is DIAG-078 defect #1.

**Candidates evaluated:**
- **(i) Node `Readable` → streaming Storage upload. CHOSEN.** A pull-based `Readable` serializes the window's rows in bounded slices (≤1,000 rows/slice) and pushes each slice's CSV text; `supabase.storage.upload(path, readable, { duplex: 'half', … })` streams it. **Why heap is bounded:** at any instant only the current slice's serialized text exists (the `csvLines` array, the joined `csvBody`, and the `Buffer` all disappear); peak serialized heap is the slice, independent of window/file size. **Validated against live Storage** — a generated `Readable` of 2,501 lines uploaded and round-tripped byte-intact, and storage-js sets `duplex:'half'` for any body with `.pipe`/`ReadableStream` and passes it straight to fetch (no buffering — confirmed in `@supabase/storage-js` `uploadOrUpdate`).
- **(ii) `/tmp` temp file then upload from a read stream.** Also bounds build heap, but adds disk I/O + a cleanup path + the 512MB `/tmp` ceiling, and the upload still needs a streamed read. Rejected as strictly more moving parts than (i) for the same bound (kept as the documented fallback if a streamed upload without Content-Length is ever rejected — it was not).
- **(iii) chunked multi-CSV per window.** Rejected: violates the "one CSV + one RPC per window" topology invariant.

**Invariants preserved:** `CHUNK_ROW_SIZE` stays **20,000** (the fix is the write, not the window). Topology unchanged: still one CSV + one RPC per window (~5 + ~5 for the 86K file). **Byte-identity (HALT-CALC):** the new path reuses `buildCommittedRow` + `committedRowToCsvLine` unchanged and emits `CSV_HEADER + '\n' + line + '\n'` per row in the same order — only *when/where* the bytes are held changes, never their content. The staged CSV stays uncompressed (the S3 FDW loads a compressed file fully into DB memory).

## §3.3 — Part C scope decision (Clean Slate)

**Intended scope (from code, not assumption):** `tenant-deletion.ts` `CLEAN_SLATE_CATEGORIES` defines five selectable categories that clear data/calc/plan/entity/intelligence while **preserving** the tenant row, `profiles`, and `import_batches` (the receipt log — comment `tenant-deletion.ts:36-38`). `committed_data` **is already in the `data` category** (`:39`). So the DIAG-078 "Clean Slate left committed_data populated, reported success" defect is **not** a missing table — it is the success gate: the route returns `ok: !result.hadError` (`clean-slate/route.ts:79`) and `hadError` is `true` only for `status==='error'` (`tenant-deletion.ts:190`). A delete that returns count 0, or is classified `skipped_missing`/`skipped_no_tenant_id`, reports success while leaving rows.

**Fix scope (the full intended scope, hard-deleted, then verified):** keep the existing per-category delete set (every table tenant-scoped via the sole deleter `deleteTenantScoped`, always `.eq('tenant_id')`), and add **verify-before-success**: after the deletes, re-count every table in the selected categories for the tenant; success is reported only if all counts are 0; otherwise failure naming each residual table. This makes the post-state authoritative regardless of why a delete under-performed (silent skip, FK block, partial). FK blockers into `committed_data` beyond the handled `calculation_traces.committed_data_id` sever (EDGE-1) are architect-confirmable only (PGRST205); the verify gate makes any residual **visible** rather than silently-successful. Tables cleared by Clean Slate (when their category is selected), explicitly: `calculation_traces, calculation_results, entity_period_outcomes, summary_artifacts` (calc) · `rule_set_assignments, rule_sets` (plan) · `entity_relationships, entities` (entity) · `committed_data, processing_jobs, import_session_telemetry, ingestion_events` (data) · `classification_signals, structural_fingerprints` (intelligence). Preserved by design: `tenants`, `profiles`, `import_batches`.

## §3.4 — Anti-Pattern Registry pass

- **No registry / enumerated-domain set (AUD-009):** Part A reuses the existing RFC-4180 serializer; Part B writes a free-text `error_detail`; Part C re-counts the existing category tables. No domain-value enumeration introduced.
- **No parallel path:** the commit stays one path (per-window CSV + RPC); Part A changes *how* the one CSV's bytes are staged, not the topology. Part C extends the one Clean Slate engine; no second deleter.
- **No developer-assigned numeric threshold that isn't a safety bound:** the only constants introduced are the streaming **slice size** (a memory bound) and the reuse of the existing `MAX_RETRIES` (a retry bound). `CHUNK_ROW_SIZE` unchanged.
- **No silent narrowing:** all three parts (A/B/C) are in this one PR; out-of-scope Q5 (comprehension atoms) is explicitly NOT touched.

**No structural conflict. Proceeding to implementation.** (Caveats surfaced: the live FDW load + the 86K end-to-end + the live Clean Slate are architect-verified, SR-44.)
