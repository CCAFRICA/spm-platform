# HF-358 — Completion Report

**Work item:** HF-358 — Ingestion Memory Bound + No-Silent-Failure + Clean Slate True-Delete
**Branch:** `hf-358-ingestion-memory-bound` (worktree off `origin/main` `0b34e77b`) · **Mode:** ULTRACODE · **Date:** 2026-06-29
**CC does not merge or run the live import (SR-44).** The unifying invariant — *no operation reports success, or exits a failure, without verifying and recording what it actually did* — is enforced by every gate below.

## Zero committed-row bytes changed (HALT-CALC)

Part A reuses `buildCommittedRow` + `committedRowToCsvLine` **unchanged** and emits `HEADER\n` + `line\n` per row in the same order — only *when/where* the bytes are held changed (whole-window array+string+buffer → a streamed ≤1000-row slice). PG-A2 proves the streamed bytes are byte-identical to the prior materialized document; PG-A3 proves the round-trip. Parts B and C touch only failure bookkeeping and delete-verification — never committed-row content. **No committed-row bytes changed.**

## Commits

| # | Commit | Part |
|---|---|---|
| 1 | `a676530c` | §3 ADR (committed before implementation) — FP-49 live schema, Part A/C decisions, anti-pattern pass |
| 2 | `a86eb711` | **A** — per-window streaming CSV write (OOM fix) |
| 3 | `a6376671` | **B** — no silent failure (job terminal write + reclaim retry cap) |
| 4 | `c2596132` | **C** — Clean Slate verify-before-success |
| 5 | (this) | build hygiene + report |

15 files, +696/−31.

---

## PART A — per-window streaming CSV write (OOM fix)

**Mechanism (ADR §3.2, Option i):** `committed-row-csv.ts:committedRowsCsvStream` — a pull-based `Readable` that serializes rows in ≤1000-row slices; `commit-content-unit.ts` streams it to Storage (`duplex:'half'`, no buffering). `CHUNK_ROW_SIZE` stays 20,000; one CSV + one RPC per window.

**PG-A1 (memory bound)** — `scripts/_hf358_partA_proof.ts` (`node --expose-gc`), retained heapΔ vs N (87-col rows):
```
N         OLD(materialize) heapΔ   NEW(stream) heapΔ   NEW rssΔ      csv size
1000            20.6 MB                0.0 MB            0.8 MB       2.3 MB
10000           78.8 MB                0.0 MB           12.4 MB      23.4 MB
20000          158.6 MB                0.0 MB            8.7 MB      47.3 MB
50000          399.6 MB                0.0 MB           42.8 MB     119.4 MB
100000       OOM (>2GB)                0.0 MB          241.9 MB     239.8 MB
→ OLD heapΔ scales ~linearly with N (and OOMs at 100k); NEW heapΔ stays flat regardless of N.
```
The OLD path literally OOM'd the proof process at N=100,000 (the DIAG-078 #1 footprint); the NEW path's retained serialization heap is **flat ~0 MB** at every N.

**PG-A2 (byte-identity, adversarial)** + **PG-A3 (round-trip)** — same script:
```
=== PG-A2 — byte-identity (adversarial rows): OLD document vs NEW stream ===
   NEW stream bytes === OLD materialized document : PASS
   OLD document      === prior join('\n') form    : PASS
=== PG-A3 — round-trip: parse the NEW stream bytes back to the committed projection ===
   4/4 rows round-trip byte-identical : PASS
```
(adversarial set: embedded commas, double-quotes, embedded newlines, backslashes, Korean/CJK + emoji, nested JSON in row_data/metadata, null source_date.)

**PG-A4 (topology unchanged):** `commitUnitStreamed` still loops one `commitContentUnit` per 20K window (`windowed-commit.ts:209-225`, untouched), each writing one CSV + one RPC. `CHUNK_ROW_SIZE = 20_000` unchanged (`sheet-window.ts:141`). `git diff origin/main -- windowed-commit.ts sheet-window.ts` is empty.

The new write site (`commit-content-unit.ts`):
```ts
  const csvStream = committedRowsCsvStream(
    rows.length,
    (i) => committedRowToCsvLine(buildCommittedRow(rows[i], i) as unknown as CommittedRow),
  );
  const { error: uploadErr } = await supabase.storage
    .from('ingestion-raw')
    .upload(csvPath, csvStream as any, { contentType: 'text/csv', upsert: true, duplex: 'half' } as any);
```

---

## PART B — no silent failure (job terminal write + reclaim retry cap)

**B-1 — job-visible terminal write on every caught commit failure.** `job-failure.ts:recordCommitFailureOnJob` sets `processing_jobs.status='failed'` + `error_detail` + `completed_at`, **tenant- AND session-scoped** (`session_id` = the import-session key, FP-49 — NOT `proposalId`, a fresh client uuid at `page.tsx:441`), `.neq('status','committed')`, non-throwing, no-op on the sync path. The session id is threaded `page.tsx → SCIExecution → execute-bulk` body; execute-bulk records on **any** unit `success:false` (every `commitContentUnit`/`commitUnitStreamed` failCommit surfaces as a `!success` result) AND in its `catch`:
```ts
    if (!response.overallSuccess) {
      const reason = results.filter(r => !r.success).map(r => `${r.contentUnitId}: ${r.error ?? 'commit failed'}`).join(' | ').slice(0, 2000);
      await recordCommitFailureOnJob(supabase, tenantId, sessionId, `Commit failed — ${reason}`);
    }
  ...
  } catch (err) {
    if (jobServiceClient && jobTenantId) {
      await recordCommitFailureOnJob(jobServiceClient, jobTenantId, jobSessionId, `Commit error — ${String(err).slice(0, 1900)}`);
    }
```
(An OOM **kill** still bypasses any JS — that is exactly what B-2 covers.)

**B-2 — reclaim retry cap (the loop fix).** `reclaim-policy.ts:reclaimPatch` — each reclaim increments `retry_count`; at `MAX_RETRIES` the job is marked TERMINALLY `failed` with a reason instead of reset. `dispatch-jobs` reclaim now uses it; the failed-requeue kill-switch guard `.lt('retry_count', MAX_RETRIES)` (`dispatch-jobs:117-118`) is **unchanged**.

**PG-B1 / PG-B2 / PG-B3** — `src/lib/sci/__tests__/hf358-part-b.test.ts`, 6/6:
```
✔ PG-B1: an upload-error commit failure records error_detail + terminal status on the job
✔ PG-B1: an RPC-error commit failure also records error_detail + terminal status
✔ PG-B1: no-op on the synchronous path (no session) and non-throwing on a DB error
✔ PG-B2: a repeatedly-crashing committing job converges to terminal failed at MAX_RETRIES   (classified@1, classified@2, failed@3)
✔ PG-B2: below the cap, a classifying job reclaims to pending and a committing job to classified
✔ PG-B3: the failed-requeue kill-switch guard (lt retry_count, MAX_RETRIES) is intact
```

---

## PART C — Clean Slate verify-before-success

**PG-C1 (enumeration).** Handler: `app/api/platform/tenants/[tenantId]/clean-slate/route.ts` → `runCleanSlate` (`lib/platform/tenant-deletion.ts`). **`committed_data` is already in `CLEAN_SLATE_CATEGORIES.data`** (`tenant-deletion.ts:39`: `['committed_data','processing_jobs','import_session_telemetry','ingestion_events']`). So the DIAG-078 #4 miss was NOT a missing table — it was the success gate: the route returned `ok = !result.hadError`, and `hadError` is true only for `status==='error'`, so a delete that returned 0 / was `skipped_*` / FK-blocked reported success while rows remained. Preserved by design: `tenants`, `profiles`, `import_batches`.

**PG-C2 (true-delete + verify).** `verifyCleanSlate` re-counts every selected-category table; `runCleanSlate` returns `{verified, residual}`; the route gates `ok = !hadError && verified` and returns HTTP 500 + the residual table list when not empty:
```ts
  const ok = !result.hadError && result.verified;
  return NextResponse.json({
    ok, verified: result.verified, residual: result.residual,
    ...(ok ? {} : { error: `Clean Slate did not fully clear: ${result.residual.map(...).join(', ')}` }),
    ...
  }, { status: ok ? 200 : 500 });
```
Local test `hf358-clean-slate-verify.test.ts`, 7/7:
```
✔ PG-C2: committed_data is in the data category (so a data wipe targets + verifies it)
✔ PG-C2: all selected tables empty → verified, no residual
✔ PG-C2: committed_data still populated → NOT verified, residual names it (no silent success)
✔ PG-C2: a non-42P01 read error fails CLOSED (residual count -1, not silently verified)
✔ PG-C2: a missing table (42P01) counts as empty
✔ PG-C2: verify only checks SELECTED categories
✔ PG-C3: every delete in the deletion engine is tenant-scoped; the route issues no raw delete
```
The **live** Clean Slate run (Casa Diaz → genuinely empty) is architect-pending (SR-44).

**PG-C3 (isolation).** The sole deleter is `deleteTenantScoped` (`.delete({count:'exact'}).eq('tenant_id', tenantId)`); the verify re-count reads are `.eq('tenant_id', tenantId)`; the route issues no raw delete (PG-C3 test asserts both). Tenant-scoped by construction (SR-39).

**PG-C4 (auth + audit).** Gate: `authorizePlatformObservability()` → `platform.system_config` capability (`clean-slate/route.ts:25`). Audit: fail-closed intent row (`audit_logs`, aborts with no deletes if it fails) + a completion `writeAuditLog` now recording `verified`/`residual`/`ok` (who = `gate.caller.email`/`profileId`, when, what tenant + categories).

---

## §5 — Build hygiene

- **PG-G1 (tsc):** clean at es2017 (Next's effective target) after every part.
- **PG-G2 (next build):** `npm run build` exit 0 — "✓ Compiled successfully", types + lint clean, BUILD_ID generated. (First attempt failed on an `any` in a Part C test under `src/` — Next lints test files; fixed to `as unknown as SupabaseClient` and rebuilt clean.)
- **PG-G3 (clean build + dev):** `rm -rf .next` → `npm run build` (exit 0) → `npm run dev` → Ready in 1320ms; `/`→307, `/operate/import`→307 (login redirect — expected).
- **PG-G4 (schema):** FP-49 probe output pasted in `HF-358_ADR.md §3.1`.

**Test totals:** 25/25 unit (7 committed-row-csv, 6 part-b, 7 clean-slate-verify, 5 tenant-deletion) + Part A proof script (PG-A1/A2/A3).

## Zero residuals

All three parts complete to their proof gates: **A** (streaming write, flat heap, byte-identical), **B** (job-visible terminal on every caught failure + reclaim cap), **C** (verify-before-success, tenant-scoped, audited). No deferrals, no reduced gates. Out-of-scope DIAG-078 Q5 (comprehension atoms) untouched.

## Architect-pending (SR-44 — yours; not CC-attested)

1. Merge the PR.
2. Clean Slate Casa Diaz (`2d9979ba-5032-48a7-bccf-1928f3e6dadf`) via the fixed function (select the categories incl. `data`); confirm `ok:true` + `verified:true` (genuinely empty).
3. Re-import the 86,607-row file; confirm it commits the full row count without an OOM and the rows are visible.
4. Re-verify the sealed calculation anchors (BCL/Meridian/MIR) through this path before anything relies on it.
5. Cron stays off (`CRON_SECRET` unset) until you restore it; the Part B reclaim cap is the guard that must be in place first.

**Scale notes (architect-side, DB measurements, not HF-358 code):** keep the staged CSV uncompressed (the S3 FDW loads a compressed file fully into DB memory); confirm empirically whether your S3 wrapper streams or batch-fetches the CSV read (determines the DB-side bound at gigabyte scale).
