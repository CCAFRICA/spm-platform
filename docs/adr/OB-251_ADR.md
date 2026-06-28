# ADR — OB-251 Asynchronous Ingestion Architecture (DS-016 Implementation)

**Status:** Accepted · **Date:** 2026-06-28 · **Branch:** `ob-251-async-ingestion` (from `72d8ccea`)
**Authors:** CC (ULTRACODE autonomous) · **Supersedes:** the inert OB-174 Phase-1/4 scaffolding (migration 023, `process-job` worker — completed, FK-corrected, and extended here)

This ADR records every design decision OB-251 makes, with rationale and proof obligation, per directive §3.0. It is the gate before Tier 1.

---

## 0. The single most important finding (reframes the whole OB)

**OB-174 already built half of DS-016 and left it inert.** The live DB carries `processing_jobs` (empty) and `structural_fingerprints` (151 rows) from migration `023`. The codebase carries a working async **classify** worker (`/api/import/sci/process-job`), a client that creates jobs + fires workers (`operate/import/page.tsx:244-309`), and a polling progress surface (`components/sci/ImportProgress.tsx`). What OB-174 left undone — and what OB-251 finishes — is exactly the set of properties the directive enumerates:

| OB-174 left | OB-251 does |
|---|---|
| RLS on `processing_jobs`/`structural_fingerprints` references a **fabricated `platform_users`** table (FP-49). It is ABSENT in the live DB → client RLS is broken (only service-role reaches the table). | Reconcile migration: RLS → `profiles.auth_user_id` (the canonical predicate). |
| Worker **stops at `classified`**; commit is a **separate synchronous `execute-bulk`** that holds the browser **300s**. | Decouple commit into the worker lifecycle; browser polls durable status, never holds the connection. |
| Parse still does **full `XLSX.read` + `sheet_to_json`** (the 86K×87 OOM, unsolved 3×). | Bounded-window parse (`dense:true` + windowed `sheet_to_json`) + chunk-jobs. |
| Async path is a **fallback-able fork** beside synchronous `analyze`. | Spreadsheet ingestion is **one** async path (§0.2 / HALT-PARALLEL). |
| `processing_jobs` lacks `batch_id`/`chunk_id`. | Add them (on `processing_jobs` only — NOT `committed_data`, §2). |
| Flywheel **promotion/aggregation never runs** (`identifyPromotionCandidates` has zero callers). | A real async aggregation job consumes signals after processing completion. |
| Cockpit reads `import_batches` count → **stale after Clean Slate**. | Cockpit reads live `committed_data` + `processing_jobs` state. |

This is a UNIFICATION + COMPLETION, not a greenfield build. It maximally satisfies §0.2 (extend the existing surfaces; create almost no net-new files).

---

## 1. Worker trigger mechanism (directive §3.0 — A/B/C decision)

**Decision: Hybrid — (C) client-initiated dispatch for low-latency interactive pickup + (B) Vercel-Cron sweep as the durable, browser-independent safety-net and retry/stage driver.**

| Option | Latency | Browser-independence | Substrate cost | Verdict |
|---|---|---|---|---|
| A — Supabase Edge Fn + DB `INSERT` trigger | low | full | **deploys a Deno function outside the Next app** (crosses the architect/infra channel boundary) | rejected — heaviest, off-substrate |
| B — Vercel Cron poll | ≥60s (Vercel min cron interval) | full | vercel.json + 1 route | too slow **alone** for interactive feedback |
| C — client fires `/api/process` per file | sub-second | **none** (browser must stay open to fire) | already wired | fast but regresses if the browser closes |
| **C + B (chosen)** | **sub-second** (C) | **full** (B backstop) | vercel.json + 1 dispatch route, reuse existing client fire | **best of both** |

**Why hybrid, concretely:** C alone violates the governing principle ("browser connection ends after upload") — if the user closes the tab mid-batch, un-fired/in-flight workers die. B alone adds up to 60s latency before a job is even picked up (Vercel's cron floor is 1/minute on Pro; sub-minute is not available). The hybrid fires the worker immediately on upload (C, the happy path the user watches) **and** runs a 1-minute Cron sweep (B) that (i) claims any `pending`/stale jobs the client never dispatched, (ii) advances `confirmed`→commit and `committed`→aggregate stages, and (iii) drives retry-with-backoff for `failed` jobs under the retry budget (P-B4). The sweep is the durability spine; the client fire is the latency optimization. Both call the **same** worker routes — no parallel logic.

**Atomic claim (no double-processing, P-B3):** every worker entry claims its job with a guarded transition `UPDATE processing_jobs SET status='classifying', started_at=now() WHERE id=$1 AND status='pending' RETURNING id` — a row already claimed by the client-fire returns zero rows to the cron sweep, and vice-versa. The existing worker already guards `if (job.status !== 'pending') 409` (`process-job:74`); we strengthen it to the atomic conditional update so the guard is race-free, not check-then-act.

---

## 2. Large-file handling — parse window + chunk size + memory math (P-C1/P-C2)

**The OOM is structural, not a payload bug.** HF-350 bounded the header-LLM call; HF-353 bounded the commit *write* payload (per-chunk projection, `commit-content-unit.ts:571-635`). Neither touches the parse: `XLSX.read(buffer)` builds a full cell map and `sheet_to_json` builds a full array of 86,608 row-objects × 87 cols (~the 2 GB peak). And `commitContentUnit` legitimately needs the **whole** logical row set in memory (content-hash `:393`, remediation `correctedRows` `:545`, entity-id value-scans `:490/508`) — so bounding memory means **not materializing the full array in any single worker**, which is precisely DS-016's chunk-job model.

**Decision — two composing bounds:**

1. **`dense:true` workbook read.** `XLSX.read(buffer, { dense: true })` stores cells as dense arrays rather than an `{A1:{…}}` object map — materially smaller cell-map peak. Applied at every SCI parse site we own.

2. **Windowed `sheet_to_json`** (`lib/sci/sheet-window.ts`, net-new): `decode_range(ws['!ref'])` gives `{rows, cols}` with **zero** row-objects materialized; the header row is captured once; then `sheet_to_json(ws, { range:{s,e}, header: capturedHeaders, defval:'' })` reads bounded row windows. Peak heap per window = `WINDOW × cols`, independent of file size.

3. **Chunk-jobs (P-C2) for files over threshold.** At upload, a file whose row count (from `decode_range`, cheap) exceeds **`ROW_CHUNK_THRESHOLD = 50_000`** is split into `ceil(total / CHUNK_ROW_SIZE)` chunk-jobs of **`CHUNK_ROW_SIZE = 20_000`** rows. Chunk-jobs share a **`batch_id`** (a group UUID), carry distinct **`chunk_id`** (0-based ordinal) and a `chunk_progress = { row_start, row_end, total_rows }` window. Each chunk-job's commit worker parses **only its window** (windowed `sheet_to_json` over `[row_start,row_end)`) and commits it through the **unchanged** `commitContentUnit`. A small file is a single one-chunk job (byte-identical to today).

**Memory math (86,608 × 87):**
- One chunk = 20,000 rows × 87 cols. Row-object array ≈ 20,000 × ~4 KB ≈ **~80 MB**. Remediation `correctedRows` (worst case a second copy) ≈ +80 MB. Per-insert-chunk projection (5,000 rows) ≈ +25 MB. Dense cell map for the window ≈ tens of MB. **Peak ≈ ~250–350 MB per worker** — comfortably under the 1024 MB serverless ceiling, with the same headroom for a 250K- or 2M-row file (it just becomes more chunk-jobs).
- Classify worker parses **only the first window** (columns + 50-row sample + sheet fingerprint, which `detectColumnType` computes over the first 50 rows anyway) → trivial memory.

**Chunk identity rides `processing_jobs`, never `committed_data` (§2 honored).** `committed_data` has only `import_batch_id` (+ `metadata`). Each chunk-job's `commitContentUnit` call mints its own `import_batch` (calc-neutral — the engine reads `committed_data` by `tenant_id`/`data_type`, not by batch grouping). The chunk→file linkage lives on `processing_jobs.batch_id`. The orchestrator verifies **Σ(chunk `totalInserted`) == file parsed total** (aggregate HALT-DATA-LOSS) on top of each chunk's own committed==parsed guard (`commit-content-unit.ts:732`).

**Two additive, byte-identical `commitContentUnit` params (calc-safe):**
- `rowIndexOffset?: number` (default `0`) — makes `row_data._rowIndex` file-global across chunks. Default 0 ⇒ every existing caller byte-identical.
- `entityIdFieldOverride?: string | null` (default `undefined`) — when a file is chunked, the **classify** worker resolves `entity_id_field` **once** (from the file's HC `classificationTrace` + a sample) and records it on the proposal; each chunk commits with that override so multi-candidate value-overlap tie-breaking cannot drift between chunks. Default `undefined` ⇒ existing callers re-derive exactly as today (byte-identical). Single-candidate files (BCL/Meridian/MIR) never needed the override and are untouched.

Both params are **append-only optional** — `tsc` and the 4 HALT-CALC anchors prove neutrality (PG-9).

---

## 3. Unified-path refactor plan (§0.2 / HALT-PARALLEL — "no shadow files")

The async path becomes THE path by **moving** synchronous logic into the worker, not copying it. Net-new files are only the genuinely-new architecture (the windowed reader, the cron dispatcher, the aggregation job). Verification: `find web/src -name "*.ts" -newer <directive-sha> -not -path "*test*"` — every entry justified below.

| Stage | Today (sync, browser-held) | OB-251 (unified async) | Mechanism |
|---|---|---|---|
| Upload | client → `ingestion-raw` (already off-Vercel) + insert jobs | **unchanged** + chunk-split large files | extend `page.tsx` |
| Classify | `analyze/route.ts` (sync fallback) **and** `process-job` (async) | `process-job` is the **sole** classify surface; spreadsheet sync fallback removed (degrade becomes fail-closed C2, not a 2nd classification path) | edit `page.tsx`, `process-job` |
| Commit | `execute-bulk/route.ts` — **300s browser-held `fetch`** | `execute-bulk` becomes a **fire-and-forget worker** that writes `processing_jobs` status transitions (`confirming`→`committing`→`committed`); client polls durable status | edit `execute-bulk`, `SCIExecution.tsx` |
| Finalize | `finalize-import` fire-and-forget **live request** (untracked) | terminal worker stage with durable status (tracked, exactly-once) | edit `finalize-import`, dispatcher |
| Aggregate | **never runs** | new async aggregation job after commit completion | new `flywheel-aggregation` job + dispatcher |

**`execute-bulk` is reused verbatim for the commit body** — the only change is the trigger (enqueue, not awaited) and that it stamps `processing_jobs` status. Its per-unit `commitContentUnit` loop, cross-file plan interpretation (`comprehendedFieldMap`), and durable unit-state spine are **unchanged** → calc-neutral by construction. This is why commit stays a **single** cross-file worker invocation rather than per-file: plan units reference fields comprehended across files (`execute-bulk:307-329`), so commit must aggregate. Per-file **isolation** (P-B3) is already structural via the per-unit `storagePaths` binding (the HF-140/141 fix) and is reinforced by per-file classify workers.

**Net-new non-test files (the only justified additions):**
1. `web/src/lib/sci/sheet-window.ts` — the bounded-window SheetJS reader (the missing third memory bound). Net-new architecture.
2. `web/src/app/api/import/sci/dispatch-jobs/route.ts` — the Cron sweep / stage dispatcher (claim + invoke + retry). Net-new architecture (the (B) backstop).
3. `web/src/lib/sci/flywheel-aggregation.ts` + `web/src/app/api/import/sci/aggregate-flywheel/route.ts` — the queued-but-never-consumed aggregation job, finally wired (Layer E). Net-new architecture.
4. `web/vercel.json` (if absent) — the cron schedule. Config, not a shadow path.

No `*-async.ts` shadow of any synchronous file is created. HALT-PARALLEL respected.

---

## 4. Job lifecycle (status machine) — extends, does not replace

`pending → classifying → classified → confirming → committing → committed → finalized` with `failed` (dead-letter, `error_detail` + `retry_count`) reachable from any state. The existing CHECK constraint (`023`) only allows `pending|classifying|classified|confirming|committing|committed|failed`; the reconcile migration widens it to add `finalized` (and keeps all prior values). `confirming` = awaiting user confirmation of the proposal (human-in-the-loop review is preserved); the confirm action enqueues the commit worker. Korean Test: every status token is a structural processing state, zero domain/role literals.

---

## 5. Flywheel aggregation (Layer E) — what is wired, and the HALT-CALC boundary

**The defect (evidence):** writes land on every import (`writeFingerprint`/`writeAtoms`/`writeClassificationSignal`), but the **consume/promote** side is disconnected — `identifyPromotionCandidates` (`promoted-patterns.ts:61`) and `checkPromotedPatterns` (`:187`) have **zero callers**; the OB-235 learner-core is orphaned; and post-HF-341-R6 `resolveClassification` derives classification purely from the per-import LLM expression (it ignores `state.priorSignals`/`promotedPatterns` **by design**).

**Decision (threads HALT-CALC):**
- **WIRE the consume step.** A new async aggregation job (triggered when a session's jobs reach `committed`) runs `identifyPromotionCandidates` over the accumulated signals and persists promotion/foundational aggregation, and ensures the **worker path emits flywheel signals at parity with `execute-bulk`** (`process-job` currently skips `emitFlywheelSignals`, making foundational aggregation path-dependent — fixed). This makes the queued corpus *consumed* and advances recognition state. **Live, not inert** (§0.1.4): the next import of a similar structure benefits, and the exact-fingerprint Tier-1 immunity (already functioning via `structural_fingerprints`) is reinforced.
- **DO NOT reconnect the `resolveClassification` Bayesian scorer.** HF-341 R6 deliberately deleted that heuristic (Validation Premise Law / no-registry). Re-adding prior-consumption into scoring is the exact thing that can move sealed-tenant classifications (evidence risk) — and it is **out of scope** (this OB does not change SCI classification, §2). Classification stays expression-authoritative (Decision 158). The aggregation populates the immunity/promotion artifacts; whether a future scorer reads them is a separate, gated decision.
- **PG-8 evidence:** "second import of the same fingerprint is Tier 1, zero LLM" is delivered by the **existing** exact-hash `structural_fingerprints` flywheel (`lookupFingerprint` skips HC on a Tier-1 hit). OB-251 proves the aggregation job *runs and advances state* and that a repeated fingerprint hits Tier-1 with zero LLM.

This boundary keeps Layer E **live and consequential** while keeping HALT-CALC untouched.

---

## 6. Progress surface + live cockpit (Layer D / PG-5/PG-6)

- **Progress (P-D1):** extend the existing `ImportProgress` poll (`processing_jobs` every 2s) across the full lifecycle (classify→commit→finalize) and the durable `plan-run-status`/`plan_interpretation_runs` poll for plan liveness (HF-353). Client **polls**, never holds the connection → kills the ~60s re-submit (PG-7). HF-353 P-D invariant preserved: while a run is `in_progress`, no Retry/re-submit affordance.
- **Cockpit (P-D2):** repoint readiness from `import_batches` (append-only log → stale after Clean Slate) to **live `committed_data` presence** (`tenant-state.ts:25/38`, `page-loaders.ts:432`) — the table Clean Slate actually wipes — so it self-heals. This is the Validation-Premise-correct fix (read what IS, not frozen session history). Additionally, add `processing_jobs` (+ import-session telemetry) to Clean Slate's `data` category so in-flight job state also clears (respecting the `tenant-deletion.ts` I1 tenant-scope / FK-order invariants — every delete `.eq('tenant_id')`, dependents-first).

---

## 7. Migration plan (FP-49 verified; architect-applied under SR-44)

The reconcile migration `web/supabase/migrations/20260628_ob251_processing_jobs_reconcile.sql`:
1. `CREATE TABLE IF NOT EXISTS` both tables (no-op if 023 applied; safety for fresh DBs — FK-corrected from the start).
2. `ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS` `batch_id UUID`, `chunk_id INTEGER`, `total_chunks INTEGER`.
3. Widen the `status` CHECK to include `finalized`.
4. **DROP the `platform_users` policies; CREATE the `profiles.auth_user_id` policies** on both tables (the canonical predicate from `003_data_and_calculation.sql:65-77`). Service-role + VL-admin (`profiles WHERE auth_user_id=auth.uid() AND tenant_id IS NULL`) read policies re-created against `profiles`.
5. Indexes already present (023) — `IF NOT EXISTS` keeps idempotency; add an index on `batch_id`.

**FP-49 proof (live row-introspection — PostgREST does not expose `information_schema`):** `tenants(id uuid)`, `profiles(id, auth_user_id, tenant_id, role …)`, `committed_data(import_batch_id, row_data, source_date, data_type … — NO batch_id/chunk_id)`, `processing_jobs` EXISTS empty, `structural_fingerprints` EXISTS (151 rows), `platform_users` **ABSENT**. Pasted in the completion report.

`uploaded_by` stays an **unconstrained nullable UUID** (matching 023 and what `page.tsx` writes — it sets none today) — avoids the `profiles.id`-vs-`auth_user_id` ambiguity while honoring "never reference the fabricated `platform_users`."

---

## 8. Blast radius & HALT obligations

- **Touched (ingestion only):** `processing_jobs`/`structural_fingerprints` (RLS+columns), `process-job` (lifecycle+windowed parse+signal parity), `execute-bulk` (fire-and-forget+status), `finalize-import` (tracked stage), `page.tsx`/`SCIExecution.tsx`/`ImportProgress.tsx` (enqueue+poll), `commit-content-unit.ts` (2 additive optional params), cockpit readers (`tenant-state.ts`/`page-loaders.ts`), `tenant-deletion.ts` (clean-slate category), `sheet-window.ts`/`dispatch-jobs`/`flywheel-aggregation` (net-new).
- **Untouched (HALT-CALC):** calc engine, convergence, SCI **classification logic**, `resolveClassification`. `committed_data` reads identically regardless of ingestion path → BCL $312,033 / Meridian $556,985 / MIR Plan 2 = 210,000 / MIR Plan 5 = 0 must be unchanged (PG-9).
- **HALT-DATA-LOSS:** per-chunk `committed==parsed` (`commit-content-unit.ts:732`) + aggregate Σ(chunks)==parsed total (PG-11).
- **HALT-REGISTRY / Korean Test:** all new identifiers structural; no domain/tenant/role mapping table or closed status registry (PG-10).
- **HALT-SCHEMA:** migration references only FP-49-verified tables/columns.
- **HALT-PARALLEL:** the `find` proof shows no sync-vs-async shadow; every new file justified above (PG-10).

---

## 9. DS-016 layer → code map

| Layer | Property | Primary code |
|---|---|---|
| A Upload | P-A1 | `operate/import/page.tsx` (upload + job/chunk-job creation; returns on enqueue) |
| B Processing | P-B1..B4 | `process-job` (classify) + `execute-bulk` (commit, decoupled) + `dispatch-jobs` (claim/retry/backoff) |
| C Large file | P-C1/C2 | `sheet-window.ts` (windowed parse) + chunk-jobs (`page.tsx` split, `process-job`/`execute-bulk` windowed commit) + `commit-content-unit.ts` (offset/override params) |
| D Progress | P-D1/D2 | `ImportProgress.tsx` + `plan-run-status` (live status) ; `tenant-state.ts`/`page-loaders.ts`/`LifecycleCockpit.tsx` (live cockpit) |
| E Flywheel | P-E1 | `flywheel-aggregation.ts` + `aggregate-flywheel` route + dispatcher trigger ; `structural_fingerprints` (immunity, exists) |

---

*Accepted. Tier 1 may proceed. Every decision above carries a proof gate in §3.2 of the directive.*
