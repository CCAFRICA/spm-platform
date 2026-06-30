# HF-362 — Architecture Decision Record

**Work item:** HF-362 — Hand-Off Batch-Creation Fix + Dynamic Pulse Activation
**Base SHA:** `4ca90680` (origin/main — includes HF-360 merge `a61d0aac` + HF-361 cron-auth follow-ups)
**Mode:** ULTRACODE · **Date:** 2026-06-30 · committed BEFORE implementation (§3 gate).

> **Live state:** the HF-360 migration IS applied and the flag IS on in production — the FP-49 probe read
> `pulse_load_jobs` rows with `status=rolled_back, err="...committed_data...foreign key constraint"`. The
> hand-off is live and **failing on every load**. HF-362 fixes the two defects.

---

## §3.1 — FP-49 live schema probe (evidence, `scripts/_hf362_fp49_probe.ts`)

Pasted probe output (service-role, disposable test rows cleaned up):
```
import_batches DISTINCT status (recent 200): completed, processing, failed
INSERT status='staged'     → ERR 23514 violates check constraint "import_batches_status_check"
INSERT status='processing' → OK (row created)
INSERT status='completed'  → OK
INSERT status='failed'     → OK
INSERT status='pending'    → OK
SELECT WHERE id=staged-test → EMPTY (no FK target — this is the live bug)
recent pulse_load_jobs:
  rolled_back loaded=0/186  err=pulse 0 load error: insert or update on table "committed_data" violates foreign key constr
```

**Schema facts:**
- `import_batches.status` CHECK constraint (`003_data_and_calculation.sql:21`, never re-defined since):
  `CHECK (status IN ('pending', 'processing', 'completed', 'failed'))` — **`'staged'` is NOT a member.**
- `import_batches`: NOT-NULL `file_hash_sha256`, `content_unit_hash_sha256`; `superseded_by` (HF-213);
  `completed_at`. FK `tenant_id → tenants`.
- `committed_data.import_batch_id` → `import_batches.id` FK (the constraint the worker's load violates).
- `pulse_load_jobs` (HF-360): present, applied, live; `manifest`/`cursor`/`status`/`finalized` as authored.

## §3.2 — Part A: the real root cause (NOT "the insert is missing")

The directive's stated cause — *"`commitContentUnit` … does not INSERT the `import_batches` row"* — is
**imprecise**. The insert IS present (`commit-content-unit.ts:479`):
```ts
await supabase.from('import_batches').insert({
  id: batchId, …,
  status: params.handOff ? 'staged' : 'processing',   // :486
  …
});                                                    // ← error UNCHECKED
```
The probe proves the actual mechanism: **`status='staged'` violates `import_batches_status_check` (SQLSTATE
23514); the insert FAILS; the error is unchecked; no batch row is created; the worker's
`committed_data_import_batch_id_fkey` then fails.** The synchronous path uses `'processing'` (a valid member)
so its batch row is created normally — which is why only hand-off broke.

**Why `'staged'` is the RIGHT status (not a bug to route around with an existing value):** a hand-off batch
is non-`completed` for the *whole* load (minutes, for a multi-pulse file). Two existing mechanisms key on
status:
- **Visibility gate** (`committed-data-visibility.ts:36-47`): hides rows whose batch is `status != 'completed'`.
  A `'staged'` batch is correctly hidden until the worker finalizes it — **desired**, no change.
- **Stale-batch reconciler** (`committed-data-visibility.ts:92-159`): a `'processing'` batch older than the
  liveness window (`batchLivenessMs()`, default **6 min**) is marked `failed` and its rows **DELETED**. A
  multi-pulse hand-off load can exceed 6 min — so a hand-off batch created as `'processing'` would be
  reconciled-as-failed mid-load. The reconciler acts ONLY on `'processing'`/`'failed'`
  (`:111-114`, `if (!isStaleProcessing && !isFailed) continue`), so a distinct **`'staged'`** status is
  **automatically exempt** — no reconciler change needed. This is exactly why the directive specified
  `'staged'`: it is FK-valid + reconciler-exempt + visibility-hidden, all at once.

**Decision (Part A):**
1. **Migration** `20260702_hf362_staged_batch_status.sql` (architect-applies — SR-44): widen the constraint
   to `('pending','processing','completed','failed','staged')` (preserving the existing four).
2. **Error-check** the batch insert in the hand-off path (`commit-content-unit.ts:479`): if it errors,
   `failCommit` cleanly (no orphan `batchId` in the manifest) instead of silently proceeding. This makes the
   pre-migration state fail *loud + clean* rather than the current silent FK corruption.
3. **Worker lifecycle** (same migration, `CREATE OR REPLACE process_pulse_load_jobs`): on a pulse load error
   or data-loss, mark that pulse's batch `status='failed'` (the `staged → failed` half of PG-A2; the
   `staged → completed` half already exists at `:148`). A failed `'staged'` batch then becomes
   reconciler-sweepable + visible-as-failed rather than a permanent hidden orphan.

The synchronous path (`status='processing'`) is **untouched** (PG-A3).

## §3.3 — Part B: dynamic pulse activation (the system decides)

Today: `execute-bulk` reads `isPulseHandoffEnabled()` (env `PULSE_LOAD_HANDOFF`) once and passes one global
`handOff` to every commit. `true` routes BCL (85 rows, 1 pulse) through staging→enqueue→cron→worker (30 s+ of
needless latency, and the FK bug); `false` sends Casa Diaz (86,607 rows, ~82 pulses) synchronous into the
ceiling. No static value is correct.

**Decision:** the decision is computed **per unit, inside the existing commit drivers**, from the byte budget
already in place (HF-359) — no env var, no new threshold:
- `commitUnitStreamed` / `commitUnitWindowed` already compute `estTotalPulses = estimatePulseTotal(rows,
  avgRowBytes, byteBudget)` (`windowed-commit.ts` — the honest "~Y" estimate). The decision is simply
  **`const handOff = estTotalPulses > 1`**: a unit that fits in ONE pulse commits synchronously (fast, under
  the ceiling); a unit that needs MORE than one hands off (the synchronous path would risk the ceiling).
- `execute-bulk` stops passing a global `handOff`; the **direct path** (`processEntityUnit`/`processDataUnit`/
  `processReferenceUnit` → one `commitContentUnit` call) commits synchronously (the `handOff` param is removed
  from those signatures). NOTE (adversarial verification, finding F5/F6): the direct path is the **small-sheet**
  path (under the `isLargeByBytes`/`exceedsCellCeiling` routing gates) but those gates bound source bytes /
  cell count, **not** the committed-CSV bytes — so a pathologically wide sub-gate sheet's CSV can exceed the
  budget and the synchronous upload fails **clean** (`failCommit`, reported). Pre-existing (the direct path was
  never pulsed); the directive scoped Part B's decision to the streamed/windowed drivers (§3.3), which is where
  it is implemented. Byte-budget-unified routing for the direct path is a declared follow-up (see the
  completion report). The enqueue gate becomes "any unit staged pulses"
  (`sessionPulses.length > 0`), not "the flag is on".
- `pulse-load-config.ts` / `isPulseHandoffEnabled()` / the `PULSE_LOAD_HANDOFF` env var are **deleted** (the
  directive's preferred "removed from the code"). No debug override retained — the byte budget is testable
  directly (a unit test forces a tiny budget to exercise the hand-off branch on small input).

**This is one path with a runtime branch** — structurally identical to the existing `isLargeByBytes`
streaming branch (`execute-bulk:248`): one condition, one path, same committed output. The decision point is
inside the one commit path (`windowed-commit.ts`, before the pulse loop), not a second route.

## §3.4 — Behavioral equivalence (Decision 158)

The committed rows are **byte-identical** regardless of branch, **by construction**: both branches call the
SAME `commitContentUnit` → `buildCommittedRow` → `committedRowsCsvStream` → upload. The ONLY difference is the
final step — synchronous calls `bulk_commit_from_storage` and awaits it inline; hand-off stages the identical
CSV and the worker calls the identical `bulk_commit_from_storage` off-clock. Same rows, same bytes,
Σ(pulse rows)=total. No LLM on either load path (remediation CONSTRUCT runs at build time in both). The
decision (`estTotalPulses > 1`) changes only *who awaits the load*, never *what is loaded*.

## §3.5 — Anti-Pattern Registry pass

- **No new threshold** — the branch reuses `estimatePulseTotal` + the runtime-discovered byte budget (HF-359).
  `> 1 pulse` is not a magic number; it is "needs more than one pass".
- **No divergent path** — one commit path, one runtime branch (like `isLargeByBytes`); the same writer in both.
- **No enumerated-domain set** — the status migration widens a generic lifecycle vocabulary; no domain literals.
- **Decision 158 intact** — deterministic, byte-identical, Σ=total, no LLM in the load path.
- **Single source of truth** — the byte budget governs both pulse SIZE (HF-359) and pulse-vs-sync (HF-362).

## §3.6 — HALT check

No HALT triggers: the batch-creation site is identified (`:479`/`:486`); no committed-row bytes change; no
parallel path; no developer-set threshold; the migration is authored + architect-pending (SR-44). The
entity-keying defect and DIAG-079 Q5 are explicitly NOT touched.

## §3.7 — Architect-pending (SR-44) — **migration ordering matters**

0. **Apply `20260702_hf362_staged_batch_status.sql` BEFORE the deploy** (it widens the constraint + replaces
   the worker). Part B makes hand-off automatic for large files, so a deploy without this migration would
   reproduce the FK failure for them. (Small-file synchronous imports are unaffected.)
1. Merge the PR. 2. Remove `PULSE_LOAD_HANDOFF` from Vercel env (no longer read). 3. Clear failed jobs
   (`DELETE FROM pulse_load_jobs WHERE status IN ('failed','rolled_back')`). 4. Re-import BCL → confirm it
   commits **synchronously**. 5. Clean Slate Casa Diaz → re-import 86,607 → confirm it **hands off
   automatically** and the worker loads all 86,607. 6. Re-verify the sealed anchors.
