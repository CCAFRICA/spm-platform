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

6-dimension adversarial workflow (review → refute): Part-A staged interactions, Part-B decision correctness,
byte-identity/Decision-158, single-path, regression/flag-removal, migration/deploy-ordering. _(Findings +
dispositions appended below.)_

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
3. **Clear failed jobs:** `DELETE FROM pulse_load_jobs WHERE status IN ('failed','rolled_back');`
4. **Re-import BCL** → confirm it commits **synchronously** (fast, no hand-off, no worker wait).
5. **Clean Slate Casa Diaz** → re-import the 86,607-row file → confirm it **hands off automatically**, the
   worker loads all pulses to the full 86,607, and the surface shows progression.
6. **Re-verify the sealed anchors** through this path.
