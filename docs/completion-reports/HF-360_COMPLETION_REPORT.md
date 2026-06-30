# HF-360 — Hand-Off Load + Pulse Management + Truthful Import Surface — COMPLETION REPORT

**Work item:** HF-360 · **Mode:** ULTRACODE · **Branch:** `hf-360-handoff-load` · **Worktree base:** origin/main
**Date:** 2026-06-29 · **Gate 2:** CONFIRMED by architect (pg_cron 1.6.4 installed; regular-table + plpgsql-worker path; no pgmq)

> The feasibility HALT (ADR, PR #634) is **resolved** — the architect confirmed `pg_cron` and chose §3.4
> recommendation 2 (a regular `pulse_load_jobs` table polled by a `plpgsql` worker via `pg_cron`, no pgmq).
> Parts A/B/C are now **built** on that foundation. **CC does not apply the migration or schedule cron
> (SR-44)** — those are the two architect-pending items below.

## The invariant

> The serverless function **stages and hands off**; it never spends the load duration. The database performs
> the bulk load on its own clock, durably and resumably. The surface always tells the truth about what landed.

The live 86,607-row run committed 58 clean byte-budgeted batches (61,428/86,607) then the **Vercel ceiling
killed the held invocation** at pulse 58 of ~82 — because the function awaited every per-pulse FDW-load. HF-360
moves that wait off the serverless clock.

---

## Part A — Hand-Off Load (the load-bearing fix)

**The split.** `commitContentUnit` (the sole committed_data writer) gains `handOff`. When handing off it:
builds the CSV with deterministic remediation applied (CONSTRUCT, no LLM — Decision 158), uploads it to
Storage, creates the `import_batch` as **`'staged'`**, and **returns** the staged-pulse descriptor — it does
NOT call `bulk_commit_from_storage`, does NOT delete the CSV (the worker reads it), does NOT finalize to
`'completed'`. The function never awaits a load.

**The drivers.** `commitUnitStreamed` / `commitUnitWindowed` pass `handOff` to every pulse, collect the staged
pulses, and assert **staging completeness** (`Σ staged rows == totalRows`). The per-pulse load HALT-DATA-LOSS
moves to the worker.

**The enqueue.** `execute-bulk` threads `handOff` through all 3 direct commit sites + the 2 windowed branches,
collects **every unit's** staged pulses into ONE ordered session manifest, and — as the function's last act —
INSERTs ONE `pulse_load_jobs` row (`session_id = proposalId`, `cursor = 0`) and returns. (`pulse-load-enqueue.ts`
`enqueuePulseLoadJob` reindexes 0..N, sums rows, never enqueues an empty job.)

**The worker** (`migration 20260701_hf360_pulse_load_jobs.sql`, `process_pulse_load_jobs()`). A `plpgsql`
**procedure** scheduled by `pg_cron`. It claims one job (`FOR UPDATE SKIP LOCKED`; `enqueued`, or a `loading`
job whose heartbeat is > 2 min stale → resume), then loops the remaining pulses: `bulk_commit_from_storage`
the pulse's staged CSV under its batch → verify `loaded == expected` (per-pulse HALT-DATA-LOSS, else `failed`)
→ finalize the batch → advance the cursor → **`COMMIT`**. The COMMIT-per-pulse is what makes a stop durable +
resumable: a later failure leaves all prior pulses committed, and a dead tick is reclaimed from its cursor.
**No LLM, no remediation** — the staged CSVs are fully built (the Decision-158 load-path boundary).

**Activation gate.** `isPulseHandoffEnabled()` (`PULSE_LOAD_HANDOFF=true`) — OFF by default so the code
deploys safely **before** the worker is scheduled (the commit path is byte-identical to HF-359 when off). The
architect flips it on **after** applying the migration + scheduling cron. This is the cutover switch for the
architect-pending worker, **not a permanent second route** — once the worker is proven, the flag + the
synchronous branch retire, leaving the hand-off as the sole path.

## Part B — Pulse Management (rollback / resume / audit), keyed on the import session

`pulse-load-enqueue.ts` + 3 routes under `/api/import/sci/pulse-load/`, all behind the shared capability gate
(`pulse-load-authz.ts`: tenant member OR `platform.data_operations`; refuse 403 before any DB handle).

- **`snapshotPulseLoad` / `projectSessionLoadState`** — the `(manifest, cursor)` pair IS the exact
  committed-vs-uncommitted partition (the 58-of-82 case made precise); the session aggregate sums across jobs.
- **`rollbackSession`** (`POST .../rollback`) — delete `committed_data` + `import_batches` for every pulse of
  every job in the session, **always `.eq('tenant_id')`-scoped** (HF-358 invariant — no unscoped delete is
  structurally possible), mark jobs `rolled_back`. Idempotent. Safe at any load stage.
- **`resumeSession`** (`POST .../resume`) — re-arm `failed`/stalled-`loading` jobs to `enqueued` so the worker
  continues from the **persisted cursor**, replaying the **frozen manifest byte-identically** (the byte-budget
  + batch structure are not recomputed → a resumed import is identical to an uninterrupted one). Loaded pulses
  untouched; `rolled_back` is terminal.
- **`getSessionLoadState`** (`GET .../state`) — the truthful aggregate the surface polls.
- **Audit** — every transition (`enqueued → loading → pulse:k landed → failed → resumed → rolled_back →
  complete`) is appended to `pulse_load_jobs.audit`.

## Part C — Truthful Import Surface

`PulseLoadProgress.tsx` polls `/pulse-load/state` and renders the **exact truth** — "N rows loaded of M ·
pulses X of Y", "M rows staged across P pulses — loading on the database, off the browser" — **never "0
imported"**. Honest terminal states; **rollback / resume controls** on failure. Adaptive poll (visibility-pause,
stop on terminal / 401 / 5xx streak — HF-347/356).

The import page gains a **`'loading'` phase** between `executing` and `complete`. `handleExecutionComplete`
branches on `result.pulseLoadJob` → enters `loading` (no premature finalize). The critical post-commit work
(`finalize-import` → entity resolution, which **reads committed_data**) is extracted to `fireFinalizeAndFlywheel`
and fired **only** on `handleLoadComplete` — i.e. after the worker reports `complete` — so entity resolution
never runs against an unloaded table. `SCIExecution` captures `pulseLoadJob` from the execute-bulk response(s)
into the reconstructed result so the page enters the loading phase.

---

## HALT-CALC / Decision 158

- **Zero engine files touched.** Import-layer only.
- **Load path is LLM-free by construction** — remediation CONSTRUCT (deterministic) bakes into the staged CSV;
  the worker is a pure FDW-load loop.
- **Byte-identity** — the staged CSV row OBJECTS are unchanged from the synchronous path (only the load is
  deferred). Flag OFF ⇒ the commit path is byte-identical to HF-359.
- **Σ(pulse rows) = total** — staging-completeness HALT (function) + per-pulse HALT-DATA-LOSS (worker).

## Tests / build

- **12/12** HF-360 unit tests (`hf360-pulse-load.test.ts`, `node:test`): PG-A1 snapshot partition (58-of-82),
  PG-A2 enqueue (reindex + Σ + null-on-empty), PG-A4 session projection, PG-B rollback (tenant-scoped +
  idempotent + other-tenants-untouched), PG-B resume (cursor-preserving + terminal-rollback +
  healthy-vs-stale-loading).
- **525/525** full suite — no regressions.
- `tsc` clean; `next build` green (BUILD_ID present — verified per the HF-358 lesson, not the exit code).

## Adversarial verification

A 7-dimension adversarial workflow (38 agents: each dimension independent review → skeptic refute over the
committed code) confirmed the core invariants — **Decision 158 holds** (the worker calls only
`bulk_commit_from_storage` + table updates; the staged CSV is built from `correctedRows`), **one path** holds
(the hand-off is a branch inside the existing commit; flag-off is behaviorally inert), and **no in-flow
committed_data read** exists (the `waitUntil` best-effort work reads in-memory parsed rows; entity resolution
is deferred) — and surfaced **7 findings that survived refutation. All addressed:**

1. **[CRITICAL] Stale-loading reclaim double-loads a slow pulse** — the heartbeat is not refreshed *during* a
   single FDW load, and the job row is unlocked during it; a pulse slower than the 2-min reclaim window lets
   an overlapping cron tick re-claim the same cursor and double-insert (the count check can't detect a
   duplicate; the delete-first is MVCC-blind to a live concurrent inserter). **Fix:** re-acquire the job row
   `FOR UPDATE` at the top of each pulse and hold it through the load + COMMIT — a concurrent tick's
   `SKIP LOCKED` claim then skips the job while a pulse is loading (any duration), and workers serialize on
   the row lock. The cursor is read from the row (authoritative).
2. **[CRITICAL] `COMMIT` inside the per-pulse `EXCEPTION` handler is illegal PL/pgSQL** — would abort the
   worker on the first failed pulse + reclaim-loop forever. **Fix:** capture the error in `v_err`, handle +
   `COMMIT` in the main body.
3. **[HIGH] Partial-staged pulses of a FAILED unit were enqueued + loaded** — a mid-staging failure returned a
   partial prefix (bypassing the completeness HALT) that would load PARTIAL data (wrong calc). **Fix:**
   enqueue only `results.filter(r => r.success)` — a failed-staging unit is unit-atomic in hand-off (re-import).
4. **[HIGH] Leaving the page during loading orphaned the post-commit finalize** — entity resolution (reads
   committed_data) was fired only client-side from `handleLoadComplete`; a user who left never triggered it
   (the DIAG-071 NULL-entity_id failure mode). **Fix:** a server-side **finalize sweep**
   (`/api/import/sci/pulse-load/finalize-sweep`, internal-cron principal) finalizes any complete-but-unfinalized
   session exactly once (`finalized` flag, idempotent) — decoupled from the client.
5. **[MEDIUM] Enqueue failure produced a false "0 rows" success** — staging could succeed while the job INSERT
   failed, orphaning staged pulses + showing completion. **Fix:** on enqueue-failure-after-staging, record the
   failure + flag the response (`pulseLoadEnqueueFailed`) → the client shows a recoverable error, not success.
6. **[MEDIUM] Destructive rollback gated by bare tenant membership** — any member could wipe an import. **Fix:**
   the rollback route requires the `data.import` capability of a tenant member (platform operators bypass).
7. **[CONFIRMED-on-apply] `COMMIT`-per-pulse under `pg_cron`** — a transaction-controlling procedure must be
   invoked via top-level `CALL`. Documented in the migration + architect-pending; pg_cron 1.6.4 supports it.

Also addressed: the **idempotent pulse re-load** (the worker `DELETE`s the batch's `committed_data`,
tenant-scoped, before each `bulk_commit` — belt-and-suspenders with #1) and the **`.maybeSingle()`
multi-profile** finding (now uses the canonical array-tolerant `resolveIdentity`).

**Documented as a known characteristic (not fixed — inherited + out of scope):**

- **Supersession window on a failed re-import** — supersession (HF-213, by `content_unit_hash`) runs at the
  batch-create (stage) step, so a re-import marks the prior batch superseded before the new data loads. This
  is **inherited from the synchronous path** (its `failCommit` likewise leaves the prior batch superseded on a
  failed re-import); hand-off only widens the window. **The natural recovery for a re-import is RESUME** (finish
  the new load → prior superseded + new loaded = correct). `rollback` removes the new data but does not
  auto-restore prior superseded data (same as a failed sync re-import). Supersession-reversal on rollback is a
  deeper, HALT-CALC-sensitive data-lifecycle change deliberately left out of this scope.

---

## ARCHITECT-PENDING (SR-44 — CC does not apply migrations or schedule cron in production)

1. **Apply** `web/supabase/migrations/20260701_hf360_pulse_load_jobs.sql` (table + RLS + the worker procedure).
2. **Schedule** the worker — uncomment/run the `cron.schedule('hf360-pulse-loader', '30 seconds', $$ call
   public.process_pulse_load_jobs(); $$)` at the bottom of the migration. Confirm `pg_cron` executes a
   COMMIT-ing procedure via top-level `CALL` (pg_cron 1.6.4).
3. **Schedule the finalize sweep** — a Vercel cron (every 1–2 min) → `POST /api/import/sci/pulse-load/finalize-sweep`
   (internal-cron principal). This runs entity resolution server-side when a job completes, so a user who
   leaves the page during the load does not orphan it (the DIAG-071 failure mode). Required before the flag is
   on for full reliability.
4. **Activate** — set env `PULSE_LOAD_HANDOFF=true` **after** (1)–(3). **Deploy ordering**: the migration +
   both crons must be live before the flag is set, else staged pulses would never load. (Flag off until then =
   the existing synchronous path, byte-identical — safe to deploy the code first.)
5. **Retire the old Vercel dispatch cron** (this replaces the load) and, once proven, the synchronous commit
   branch + the activation flag (leaving the hand-off as the sole path).
6. **Re-run the 86,607-row import** with the flag on (live proof PG-3, architect-side).

> Note (Gate 1, architect-measurable): the function still spends remediation CONSTRUCT + CSV-build + upload
> per pulse at STAGE time. The measurement plan in the ADR stands — if staging itself approaches the ceiling
> for an extreme file, staging must also chunk across invocations (a second hand-off layer). The 58-clean-pulse
> live evidence suggests staging is well under the ceiling, but the measurement confirms it.
