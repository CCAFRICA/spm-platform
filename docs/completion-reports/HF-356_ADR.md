# HF-356 — Architecture Decision Record

**Work item:** HF-356 — Ingestion Resilience (S3 FDW direct load, platform auth, ops visibility)
**Branch:** `hf-356-ingestion-resilience` (from `main` `3e9d1b61`) · **Mode:** ULTRACODE · **Date:** 2026-06-28
Committed BEFORE implementation (Section B gate). Built in an isolated git worktree off `origin/main`.

The incident: an 86,608×87 import took the production DB down **twice**. The commit path moved 86K rows serverless→DB one batch at a time over HTTP (PostgREST→pooler), hit Vercel's 5-min ceiling, orphaned connections; the browser's retry storm on 401-ing endpoints compounded the exhaustion. The correction: the database reads the prepared CSV directly from Storage via the S3 FDW — the serverless function orchestrates, the database moves data.

---

## Phase 0 — Inspection findings (live code + live schema)

### #1 — S3 FDW infrastructure (architect-proven; CC build-target)
The architect enabled + proved tonight: `wrappers` extension, `s3_wrapper` FDW, `s3_storage` server (credentials → `ingestion-raw` bucket), user mappings (authenticated + service_role), and a live read of a CSV from Storage returning rows. **CC cannot independently SQL-verify this** — PostgREST exposes no `pg_catalog`, and no `exec_sql`/SQL-execution RPC exists on this project (tested: `exec_sql`/`execute_sql`/`run_sql`/`sql`/`eval_sql` all PGRST202). Therefore CC **authors** the bulk-load RPC as a migration and the architect **applies + exercises** it (SR-44) — the normal CC-authors/architect-applies split. CC proves the CSV serialization round-trip itself (PG-1 evidence); the FDW load (CSV→committed_data) is architect-verified (PG-2 invocation, PG-14 end-to-end).

### #2 — Current commit path (the row-transport being replaced — RC1)
- `commit-content-unit.ts:commitContentUnit` (`:367`) builds each row (`buildCommittedRow` ~`:580`: per-row `source_date`, remediation CONSTRUCT, `row_data={…correctedRow,_sheetName,_rowIndex}`, `metadata`) then **chunk-loops `.insert(slice)`** (`:633-667`) — THIS is the per-batch HTTP transport that exhausted connections.
- `windowed-commit.ts:commitUnitWindowed` (`:100`) / `commitUnitStreamed` (`:189`) wrap it per window; `execute-bulk/route.ts` drives the unit loop.
- **Fix:** the row-BUILDING is reused unchanged (HALT-CALC); the chunk loop's SINK becomes pluggable — `insert` (existing, byte-identical) vs **`csv`** (new: append rows to a CSV written to Storage, then ONE `rpc('bulk_commit_from_storage')`). Single path, no AP-17 duplicate.

### #3 — `committed_data` schema (LIVE, FP-49)
Columns: `id` (uuid, default), `tenant_id` (uuid), `import_batch_id` (uuid), `entity_id` (null at import), `period_id` (null at import), `data_type` (text), `row_data` (**jsonb**), `metadata` (**jsonb**), `created_at` (default), `source_date` (date, e.g. `2024-01-10`). The CSV writer emits the 6 meaningful columns (`tenant_id, import_batch_id, source_date, data_type, row_data, metadata`); the foreign table reads them as text; the RPC's `INSERT … SELECT` casts `row_data::jsonb, metadata::jsonb, source_date::date` and sets `entity_id/period_id = NULL`. JSON fields are RFC-4180 CSV-quoted by the writer (I5: writer-controlled format).

### #4 — Casa Diaz partial state (the failed import — PG-13 target)
Tenant `2d9979ba…`. One `processing_jobs` row `status='classified'` (`…_Abril…`, 2026-06-29T02:52). **`committed_data` rows for Casa Diaz = 27,401** (the partial commit from the failed run). Cleanup (delete the 27,401 + reset the job) is required before any retry — a committed script, architect-run.

### #5 — Import endpoints + auth (RC3, audited)
14 routes the import page/SCIExecution call: `analyze, analyze-document, proposal, resolve-unit, retry-unit, enqueue, execute-bulk, process-job, dispatch-jobs, session-state, settle-audit, finalize-import, aggregate-flywheel, plan-run-status`. **Reality:** `resolveCallerTenant` (`api-tenant.ts:33`) already accepts platform operators (`if (isPlatform) tenantId = requested || sessionTenant`). Service-role+`tenantId` routes (`session-state, aggregate-flywheel, settle-audit, plan-run-status`) accept any authenticated caller. `getUser`-gated routes (`enqueue, execute-bulk, finalize-import, resolve-unit, process-job, interaction`) 401 only a **no-session** call — a logged-in platform operator passes. So the genuine code defect is **not** per-route platform rejection (HF-355 already fixed the one real RLS gap, `enqueue`); it is **(a) the cron-fired worker** and **(b) the browser retry storm** (below). Phase 3 = an explicit per-endpoint audit + accept an internal/cron principal on the worker; no route falsely rejects a platform operator.

### #6 — The real Root Cause 2 + browser polling (RC2 + RC3-compounding)
- **RC2:** `process-job/route.ts:48-52` requires `getUser()` → 401 if no user. The cron **`dispatch-jobs`** fires `process-job` server-side with **no cookies** → **401 every time** → the dispatcher has never advanced a job. Fix: the worker accepts an internal principal (the dispatcher's `CRON_SECRET`/`x-vercel-cron`) in addition to user sessions; `dispatch-jobs:isAuthorized` already handles `CRON_SECRET` (architect sets it in Vercel).
- **Polling (I8):** `ImportProgress.tsx:99` (`setInterval(fetchJobs, POLL_INTERVAL_MS)`), `page.tsx:72` (analyze poll), `SCIExecution.tsx` (`pollPlanRunStatus` while-loop `:123`, `settleFromSurface` interval `:175`). On 401 they keep polling (the retry storm that compounded connection exhaustion). Fix: 401 → stop + message; 5xx → exp backoff cap 3; unmount → cancel all.

### #7 — Observatory (RC4 — ops panel + kill switch)
`components/platform/ObservatoryTab.tsx` / `PlatformObservatory.tsx`, backed by `api/platform/observatory/route.ts`. The ops panel fits as an Observatory section reading `processing_jobs` (tenant/file/status/progress/error) with a per-job **Cancel** (sets `status='failed'`, `error_detail='Cancelled by platform operator'`; the dispatcher skips non-pending/cancelled). Platform-admin only. No new tables.

---

## ARCHITECTURE DECISION RECORD (Section B)

**Problem:** the serverless function moved bulk rows to the DB over HTTP → timeout + connection-pool exhaustion → outage.

**Option A — keep HTTP inserts, just bound them better (bigger chunks / fewer round-trips).** Scale 10x: NO — still O(rows/chunk) HTTP round-trips through the pooler; AP-2/SR-2 violation. **Rejected.**

**Option B (CHOSEN) — S3 FDW direct load (DS-005 "closet in the right warehouse").** The function writes the prepared rows as ONE CSV to Storage; the DB loads that CSV into `committed_data` via the S3 FDW in one RPC. Scale 10x/100x: yes — the DB's bulk load scales with data size, not HTTP round-trips (I2). Transport: zero rows over HTTP (I1). Atomicity: the RPC's `INSERT…SELECT` is one transaction. **CHOSEN** — it removes the intermediary, the timeout risk, and the connection pressure, at any scale.

**REJECTED:** A — does not change the architecture that caused the outage.

### Governing Principles (G1–G6)
- **G1/G2:** the data path embodies the DS-005 co-location principle structurally (DB reads from its own Storage); compliance/scale is a property of the architecture, not a tuned constant. **G4 (discipline):** systems/data-locality — moving compute to data, not data to compute (the FDW). **G3:** auditable — "the function writes a file, the DB loads it" is the whole data path. SR-2/AP-2 satisfied by construction.

### Invariants honored
I1 (no bulk HTTP rows — CSV+FDW). I2 (one RPC, seconds). I3 (reuse the architect's FDW). I4 (RPC `SELECT p_tenant_id` — the inserted tenant is the param, never the CSV's). I5 (writer-controlled CSV format). I6 (CRON_SECRET). I7 (per-endpoint audit + worker accepts cron). I8 (retry discipline). I9 (kill switch). I10 (HALT-CALC: row-building unchanged → byte-identical committed_data; the insert path stays; only large-file commit gains the CSV transport, proven byte-identical). I11 (architect-only end-to-end).

**No structural conflict. Proceeding.** (Caveat surfaced: the FDW load + 86K end-to-end are architect-verified, not CC-attested — by the SR-44 split and §3 of this directive.)
