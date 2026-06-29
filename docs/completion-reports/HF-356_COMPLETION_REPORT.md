# HF-356 — Ingestion Resilience — Completion Report

**Work item:** HF-356 — Ingestion Resilience (S3 FDW direct load, platform/cron auth, browser retry discipline, ops visibility)
**Branch:** `hf-356-ingestion-resilience` (from `main` `3e9d1b61`) · **Mode:** ULTRACODE · **Date:** 2026-06-28
**Built in an isolated git worktree off `origin/main`.** CC does **not** merge (SR-44).

## The incident

An 86,608 × 87 import took the production DB down **twice**. Four compounding root causes:
1. **RC1 — the row transport.** The commit path moved 86K rows serverless→DB one batch at a time over HTTP (PostgREST→pooler), hit Vercel's 5-minute ceiling, and orphaned/exhausted connections.
2. **RC2 — the cron worker never ran.** The Vercel-Cron dispatcher fired the worker server-side with no session → the worker (and the dispatcher itself, at the middleware layer) 401'd every time → no job ever advanced.
3. **RC3 — the browser retry storm.** Several import pollers hammered 401-ing / 5xx-ing endpoints on tight fixed intervals, adding load while the DB was already failing.
4. **RC4 — no visibility, no off switch.** A runaway import was invisible to operators and could not be stopped.

The correction: **the database reads the prepared CSV directly from its own Storage via the S3 FDW** (the function orchestrates, the DB moves the data); the cron actually runs; the browser backs off and stops; and operators can see and kill a runaway job.

---

## What shipped (7 commits)

| Phase | Commit | Summary |
|---|---|---|
| 0 | `9c072e39` | ADR — 7 inspections; Option B (S3 FDW direct load) chosen; FDW SQL-test is architect-side (no `exec_sql`). |
| 1 (RC1) | `d643709f` | Commit `committed_data` via S3-FDW bulk load, not per-batch HTTP insert. |
| 2 (RC2) | `49222670` | Worker accepts the cron principal; dispatcher forwards it. |
| 3 (RC3) | `a354528e` | Middleware admits the internal/cron principal to the worker routes; per-endpoint auth audit. |
| 4 (I8) | `f32a9622` | Browser poll/retry discipline — break the retry storm. |
| 5 (RC4/I9) | `c9130ef6` | Observatory async-worker queue panel + kill switch. |
| PG-13 | `82456566` | Casa Diaz partial-import cleanup script (architect-run). |

22 files, +1233 / −271.

### Phase 1 — S3 FDW direct load (RC1)
**User decision:** *all* commits go via CSV+FDW — one uniform path; the architect re-verifies the sealed anchors after deployment.
- `committed-row-csv.ts` — writer-controlled RFC-4180 CSV serialization of the **same** rows `buildCommittedRow` already produces (+ a round-trip parser used only by the byte-identity proof). `JSON.stringify` escapes embedded newlines, so no literal newline ever reaches a CSV field.
- `20260630_hf356_bulk_commit_from_storage.sql` — `SECURITY DEFINER` RPC: a transient FDW foreign table over the CSV in Storage, then `INSERT…SELECT` into `committed_data` in one transaction. **I4:** the inserted `tenant_id` is the function parameter, never the CSV's value.
- `commit-content-unit.ts` — the chunk-insert loop (and the now-vestigial per-source chunk/retry/pacing profile) is replaced by: build rows → one CSV → Storage → one `bulk_commit_from_storage` RPC → verify `count == rows.length` (HALT-DATA-LOSS) → cleanup CSV → finalize. Per-row build+serialize keeps peak heap at one window; **windowed-commit is unchanged** and inherits the transport (each window its own batch, OB-251 memory bound preserved); small files commit once.
- **HALT-CALC:** the row OBJECTS are byte-identical — only the transport changed. PG-1 proves the CSV round-trip; the FDW load is architect-verified (PG-2/PG-14).

### Phase 2 — Cron worker auth (RC2)
- `cron-principal.ts` — ONE shared internal/cron principal ((a) dev / (b) `Bearer ${CRON_SECRET}` / (c) `x-vercel-cron`) used by **both** routes so they cannot drift: `isInternalCronCaller` (the gate) + `internalCronHeaders` (the forwarded credential).
- `process-job` accepts a logged-in user (client-fire) **OR** the internal principal — no longer 401s the dispatcher's server-side fire.
- `dispatch-jobs` uses the shared gate and **forwards** `internalCronHeaders()` on the worker fetch (the missing link).

### Phase 3 — Platform/cron auth audit (RC3/SR-34)
- **Audit verdict:** no import endpoint falsely rejects a logged-in platform operator (see the per-endpoint table below).
- **Real fix:** middleware returned 401 for *any* cookieless `/api/` request → the cron→`dispatch-jobs` call and the dispatch→`process-job` fan-out were 401'd **before** reaching the handlers (the middleware-layer half of RC2). Middleware now lets the internal/cron principal reach the two internal worker paths; a non-internal cookieless caller still 401s.

### Phase 4 — Browser retry discipline (I8)
- `poll-discipline.ts` — ONE shared rule (`pollDecision`): 401/403 **stops** (auth doesn't self-heal); 5xx/network **backs off exponentially** (ceiling 30s) and **stops after 3** consecutive failures; 2xx resets the streak.
- Applied at every repeated poller, each with unmount cancellation: `ImportProgress`, `ImportTelemetryPanel`, `SCIProposal` (visible stop message), `SCIExecution` (the bounded recovery pollers give up early), `page.tsx`/`analyzeTabular` (aborts analyze on 401). The execute-bulk dispatch was already fail-fast + cap-3 — unchanged.

### Phase 5 — Observatory ops panel + kill switch (RC4/I9)
- The Observatory **Ingestion** tab now shows an **Async Worker Queue** (100 most-recent `processing_jobs` cross-tenant: tenant, file, status, retries, timing, active flag).
- **Kill switch** (`POST { action:'cancel-job', jobId }`, VL-admin gated): a status-guarded `UPDATE` marks an active job failed with `'Cancelled by platform operator'` AND pushes `retry_count` past the dispatcher's `MAX_RETRIES` (sentinel 99) so the cron's requeue and reclaim both skip it forever — **no dispatcher change needed.** A Lambda already mid-execution finishes (serverless can't be force-aborted) but is never re-dispatched.

---

## Per-endpoint auth audit (RC3)

| Endpoint | Gate | Platform operator |
|---|---|---|
| `enqueue` | `platform.data_operations` capability (HF-355) | ✅ admitted |
| `process-job` | user OR internal/cron principal (Phase 2) | ✅ |
| `dispatch-jobs` | internal/cron principal | ✅ (cron) |
| `execute-bulk`, `finalize-import` | `getUser` only (no tenant_id check) | ✅ |
| `resolve-unit`, `interaction` | `resolveIdentity` + `isPlatform` cross-tenant bypass | ✅ |
| `analyze`, `analyze-document`, `proposal`, `retry-unit`, `session-state`, `plan-run-status`, `aggregate-flywheel`, `settle-audit`, `trace` | middleware-enforced authentication (401 only for anonymous); no per-route tenant rejection | ✅ |

Middleware gates that *could* 403 a platform operator (`isRestrictedWorkspace` / `requiredFeatureForPath`) key on page prefixes (`/operate`, `/data`, `/admin`, …), never `/api` — so authenticated platform operators pass to every import route.

---

## Proof gates

| # | Gate | Status |
|---|---|---|
| PG-1 | CSV→committed_data byte-identity round-trip (commas, quotes, embedded newlines, backslashes, Korean/unicode, nested metadata, null source_date) | ✅ **CC-proven** — 7/7 |
| PG-2 | `bulk_commit_from_storage` loads the CSV into `committed_data` under the right tenant | ⏳ **architect** (live FDW; no `exec_sql` for CC) |
| PG-3 | Windowed large file → per-window CSV+RPC, peak heap = one window | ✅ by construction (windowed-commit unchanged) |
| PG-4 | P8 sole-writer guard updated (gate writes via RPC, no PostgREST `committed_data` insert) | ✅ **CC-proven** — 3/3 |
| PG-5 | Cron-principal gate (dev-open, bearer/x-vercel-cron accept, anon/wrong-secret reject, dispatcher↔worker round-trip) | ✅ **CC-proven** — 5/5 |
| PG-6 | Middleware admits the internal principal to the worker routes | ✅ code + tsc; ⏳ architect verifies live cron |
| PG-7 | Per-endpoint auth audit — no false rejection of a platform operator | ✅ documented (table above) |
| PG-8 | Browser poll discipline (401 stop, 5xx backoff→cap, 2xx reset, ceiling, consecutive-only) | ✅ **CC-proven** — 7/7 |
| PG-9 | Kill switch — cancel → failed + retry maxed → dispatcher requeue/reclaim skip it | ✅ by construction; ⏳ architect live cancel |
| PG-10 | `tsc` clean (es2017 — Next's effective target) | ✅ |
| PG-11 | `next build` clean | ✅ exit 0 (Middleware 77.6 kB — includes the cron-principal import) |
| PG-12 | `dev` serves `localhost:3000` | ✅ `/`→307, `/operate/import`→307 (login redirect), `/api/import/sci/dispatch-jobs`→**200** (the middleware RC2 fix live: the cookieless cron route is now reachable by the internal principal and the sweep ran; in prod with `CRON_SECRET` it stays 401 for non-internal callers) |
| PG-13 | Casa Diaz cleanup script (dry-run / --execute / --purge-all, tenant-scoped) | ✅ authored; ⏳ **architect-run** |
| PG-14 | End-to-end: clean Casa Diaz → retry the 86K import → it enqueues, classifies, commits via FDW, never touches the pooler | ⛔ **architect-only — CC does not self-attest** |

**Test totals:** 22/22 HF-356 unit tests (7 CSV byte-identity, 5 cron-principal, 7 poll-discipline, 3 P8 guard).

---

## Invariants honored

- **I1** — no bulk HTTP rows (CSV+FDW). **I2** — one RPC, seconds. **I4** — RPC inserts `p_tenant_id`, never the CSV's. **I5** — writer-controlled CSV format. **I6** — `CRON_SECRET` (architect sets it). **I7** — per-endpoint audit + worker accepts cron. **I8** — browser retry discipline. **I9** — kill switch. **I10 (HALT-CALC)** — zero engine/convergence/resolver changes; the committed row OBJECTS are byte-identical, only the transport changed. **I11** — the FDW load + 86K end-to-end are architect-verified, not CC-attested.

## Architect-pending (SR-44)

1. **Apply** `web/supabase/migrations/20260630_hf356_bulk_commit_from_storage.sql` — verify/adjust the two FDW points (server name `s3_storage`; the `v_uri` scheme) to match what returned rows in your proving session. Exercise it once (PG-2).
2. **Set `CRON_SECRET`** in Vercel — branch (b) of the cron principal then tightens automatically (no code change).
3. **Run the Casa Diaz cleanup** (`scripts/_hf356_casa_diaz_cleanup.ts`): dry-run → confirm → `--execute`.
4. **Verify the live cron** advances a job (PG-6) and the **kill switch** cancels one (PG-9).
5. **Retry the 86K import** and confirm it commits via the FDW without touching the pooler (PG-14). *CC does not tell the architect it is safe to run — the architect decides independently.*
6. **Re-verify the sealed anchors** (BCL / Meridian / MIR) after deployment — they now commit through the CSV+FDW path too (the maximal-blast-radius consequence of the one-uniform-path decision).

## Limits / honest residuals

- The FDW load and the 86K end-to-end are **not** CC-attested (by the SR-44 split and the directive's §3).
- The kill switch cannot force-abort a Lambda already mid-execution (serverless) — it prevents all re-dispatch/requeue, which is the actual failure mode; this is stated in the panel UI.
- Two **pre-existing** lint warnings (`page.tsx:497` `[state]` deps, `SCIExecution.tsx` `rawData` dep) are untouched and non-fatal.
