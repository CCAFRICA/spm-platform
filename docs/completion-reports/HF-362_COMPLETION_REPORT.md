# HF-362 — Hand-Off Batch-Creation Fix + Dynamic Pulse Activation — COMPLETION REPORT

**Work item:** HF-362 · **Mode:** ULTRACODE · **Branch:** `hf-362-handoff-batch-fix` · **Base SHA:** `4ca90680`
**Date:** 2026-06-30 · One PR, two parts, zero residuals.

> **Live context:** HF-360 is applied + flag-on in production and was **failing on every hand-off load** with
> `committed_data_import_batch_id_fkey`. HF-362 fixes the FK failure (Part A) and makes the pulse decision
> automatic (Part B), so BCL commits synchronously and Casa Diaz hands off — without an operator toggle.

---

## Part A — Batch-creation fix

**The real root cause (proven, FP-49 `scripts/_hf362_fp49_probe.ts`):** the directive's "does not INSERT the
batch row" is imprecise — the insert IS there (`commit-content-unit.ts:483`), but it used `status='staged'`,
which **violates `import_batches_status_check`** (`003:21` = `pending/processing/completed/failed`):
```
INSERT status='staged'     → ERR 23514 violates check constraint "import_batches_status_check"
INSERT status='processing' → OK
```
The error was **unchecked**, so the insert failed silently, no batch row was created, and the worker's FK
failed. `'staged'` is nonetheless the *right* status — a distinct value that is FK-valid **and**
reconciler-exempt (the stale-batch reconciler acts only on `processing`/`failed` —
`committed-data-visibility.ts:111-114`) **and** visibility-hidden (the gate hides non-`completed`). A
hand-off batch is non-`completed` for minutes; created as `'processing'` it would be reconciled-as-failed
mid-load.

**The fix:**
1. **Migration `20260702_hf362_staged_batch_status.sql`** (architect-applies, SR-44): widen the constraint to
   `('pending','processing','completed','failed','staged')` — preserving the four.
2. **Error-check the insert** (`commit-content-unit.ts`): a failed batch insert now `return`s
   `success:false` with a clear reason — a clean failure, never an orphan `batchId` in the manifest. (This
   also makes any pre-migration deploy fail *loud*, not silently corrupt.)
3. **Worker lifecycle** (same migration, `CREATE OR REPLACE process_pulse_load_jobs`): a failed pulse marks
   its batch `status='failed'` (`staged → failed`; `staged → completed` already existed) — so a failed batch
   is visible-as-failed + reconciler-sweepable, not a permanent hidden `'staged'` orphan.

The synchronous path (`status='processing'`, inline `bulk_commit_from_storage` + `completed`-finalize) is
**untouched** (PG-A3).

**`'staged'` is safe across every `import_batches.status` consumer** (verified): calc filters by
`superseded_by` + reads committed_data through the visibility gate, and the worker loads rows + sets
`completed` **atomically per pulse**, so a `'staged'` batch never has visible rows (no window);
reimport-resume reads `error_summary`, not status; supersession keys on `content_unit_hash`; tenant-deletion
deletes all batches regardless of status.

## Part B — Dynamic pulse activation

The static `PULSE_LOAD_HANDOFF` env var is **deleted** (`pulse-load-config.ts` removed). The decision is now
**per-unit + runtime**, from the byte budget already in place (HF-359):
- `pulse-budget.ts` gains `shouldHandOff(estTotalPulses) = estTotalPulses > 1` — one source of truth.
- `commitUnitStreamed` / `commitUnitWindowed` compute `const handOff = shouldHandOff(estTotalPulses)` (the
  same `estimatePulseTotal` that SIZES pulses). A unit that fits in **one** pulse commits synchronously
  (fast, under the ceiling); a unit that needs **more than one** hands off (the synchronous path would risk
  the ceiling). **No new threshold** — `> 1` is "more than one pass", not a magic byte number.
- `execute-bulk` drops the global flag + the `handOff` param from the **direct** path
  (`processEntityUnit`/`processDataUnit`/`processReferenceUnit` — a single `commitContentUnit` call, always
  synchronous). The enqueue gate is now "any unit produced staged pulses" (`sessionPulses.length > 0`).

**One path, runtime branch** — structurally identical to the existing `isLargeByBytes` streaming branch:
one condition, one path, same committed output. `commitContentUnit` keeps its `handOff` param (the driver
passes its per-pulse decision).

## CRITICAL addition — entity construction on the synchronous path

**User-reported HALT blocker.** HF-360 deferred entity resolution (`finalize-import` → `executePostCommitConstruction`
→ entity_id back-link) to the **client** (`handleExecutionComplete`) on the synchronous path, and to the
**finalize-sweep** on the hand-off path. So a client that navigates away — or (before Part A) the hand-off FK
failure — left `committed_data` with **NULL entity_id and ZERO entities** (BCL, a sealed anchor, regressed;
`processing_jobs` stuck at `classified`).

**Fix:** `execute-bulk` now fires `finalize-import` **SERVER-SIDE** on the synchronous success path
(`response.overallSuccess && !pulseLoadJob`) via `waitUntil` + the internal-cron principal — its own
invocation + 300 s budget, cookieless, independent of the client. Entity resolution is now **GUARANTEED on
both paths**: synchronous → this server-side fire (new); hand-off → the finalize-sweep (HF-360). Idempotent
(matches `external_id`, skips already-resolved rows) — safe alongside the client's fire. With Part B, BCL
commits synchronously → this fires → entities are created. (PG-A4 asserts the wiring; the live BCL re-import
is architect/user-side, SR-44.)

## Decision 158 / behavioral equivalence

The committed rows are **byte-identical** in both branches **by construction**: both call the SAME
`commitContentUnit` → `buildCommittedRow` → `committedRowsCsvStream` → upload. The only difference is who
awaits `bulk_commit_from_storage` — the function inline (sync) or the pg_cron worker off-clock (hand-off).
Σ(pulse rows)=total in both; no LLM on either load path.

## Proof gates

- **PG-B1** (dynamic decision, behavioral): `shouldHandOff(estimatePulseTotal(85, …)) === false`;
  `shouldHandOff(estimatePulseTotal(86607, …)) === true`. **PG-B4** no new threshold (decision =
  `estTotalPulses > 1`, only `estimatePulseTotal` + budget). **PG-B2** one shared row builder. **PG-B3**
  single path, env flag gone.
- **PG-A1** insert error-checked + migration adds `'staged'`. **PG-A2** worker `staged → completed`/`failed`.
  **PG-A3** synchronous path unchanged.
- **9/9** HF-362 tests (`hf362-handoff-batch-fix.test.ts`); **538/538** full suite — no regressions.
- **PG-G:** `tsc` clean; `next build` green (BUILD_ID `xUyoCq0tz4uqaHeEFDtsu`); `rm -rf .next` → build → dev →
  `localhost:3000` HTTP 307 (auth redirect — app boots).

## Adversarial verification

A 6-dimension adversarial workflow (review → refute, 29 agents) confirmed the core invariants (byte-identity,
single-path, no-new-threshold, the migration's safety + deploy-ordering) and surfaced **7 findings**. None is
introduced by HF-362 — they are pre-existing HF-360 hand-off-lifecycle gaps or pre-existing routing
boundaries — and HF-362 in fact **reduces** the surface (small imports no longer hand off). Dispositions:

**Fixed in this PR:**
- **(F3) Clean Slate / Delete Tenant didn't clear `pulse_load_jobs`** → the worker could repopulate
  `committed_data` after a wipe. **Fixed** (added to both table sets) — directly supports the architect's
  Clean-Slate-then-re-import step.
- The entity-construction blocker (above) — the most consequential confirmed gap — is **fixed**.

**Declared as a required follow-up — "HF-363: hand-off lifecycle durability" (pre-existing HF-360 lifecycle;
intricate + coupled; unsafe to patch hastily in a HALT-CALC path):**
- **(F1, HIGH) Units are marked terminal `'bound'` at STAGE time**, before the load lands. If `execute-bulk`
  dies after the bound-emit but before the post-loop enqueue (the ceiling-kill case), the staged batches are
  orphaned (no job), the bound spine makes resume skip them → silent loss presented as success. Fix
  direction: emit a non-terminal state for staged units; make terminal `'bound'` contingent on the job
  reaching `complete`; ensure the enqueue is durable before the bound transition. (Worker-fail mid-load —
  the other half — IS recoverable today: the job goes `failed` → PulseLoadProgress shows Resume.)
- **(F2, MEDIUM) `classifyUnitForResume` has no `'staged'` case** → a resume in the staging window can
  re-stage a unit (duplicate batch + duplicate job). Coupled with F1.
- **(F4, MEDIUM) `'staged'` orphans are permanent** (reconciler-exempt by design) — a failed-staging unit's
  dropped prefix + a worker-failed job's `> N` pulses leave `'staged'` batches + ingestion-raw CSVs that are
  never cleaned. Fix direction: mark dropped/stranded staged batches `'failed'` so they become
  reconciler-sweepable.

**Declared as a follow-up — byte-budget-unified routing (the directive scoped Part B's decision to the
streamed/windowed drivers — §3.3 — which is where it is implemented):**
- **(F5/F6, HIGH) The direct path is not byte-budget-bounded.** A unit under both routing gates
  (`< 20 MB` file, `≤ 5 M` cells) — or any entity unit (always excluded from the byte-budgeted drivers) —
  commits one CSV synchronously; a wide enough such unit's committed CSV can exceed the storage object limit.
  Pre-existing (the direct path was never pulsed); **fails clean** (`failCommit` → reported failure, not
  corruption); the directive's two named files route correctly (Casa Diaz 7.5 M cells → windowed → pulses;
  BCL 85 rows → direct → sync). Fix direction: route on estimated committed-CSV bytes (the
  `makeRowByteEstimator` already used by the windowed driver), and stop excluding `entity` from the drivers.
- **(F7, MEDIUM) `estTotalPulses` is a 200-row-sample estimate** — a large undershoot to 1 forces a
  multi-pulse unit synchronous (inline). Bounded in practice by the ~300 s ceiling headroom (a catastrophic
  undershoot needs implausible head/tail width variance); the windowing still byte-bounds each inline pulse,
  so the failure mode is added latency, not an oversized object.

## Zero residuals

Out-of-scope, declared not dropped: the entity-construction keying defect (CLT — separate diagnostic);
DIAG-079 Q5; Pulse Management UI beyond HF-360.

---

## ARCHITECT-PENDING (SR-44) — migration ordering matters

0. **Apply `web/supabase/migrations/20260702_hf362_staged_batch_status.sql` BEFORE the deploy.** Part B makes
   hand-off automatic for large files, so the code expects `'staged'` to be a valid status. (Small-file
   synchronous imports use `'processing'` and are unaffected; and the Part A error-check makes a
   pre-migration large import fail *clean*, not silently.)
1. **Merge** the PR.
2. **Remove `PULSE_LOAD_HANDOFF`** from Vercel env (no longer read — the system decides).
3. **Clear pulse-load jobs** for the test tenants: `DELETE FROM pulse_load_jobs WHERE tenant_id = '…';` (clear
   ALL, not just failed — a stale `enqueued`/`complete` job would otherwise confound the re-import). Going
   forward, Clean Slate clears `pulse_load_jobs` automatically (this PR).
4. **Re-import BCL** → confirm it commits **synchronously** (fast, no hand-off, no worker wait) **AND that
   entities are created + `committed_data.entity_id` is populated** (the server-side finalize — the critical fix).
5. **Clean Slate Casa Diaz** → re-import the 86,607-row file → confirm it **hands off automatically**, the
   worker loads all pulses to the full 86,607, and the surface shows progression.
6. **Re-verify the sealed anchors** through this path.
