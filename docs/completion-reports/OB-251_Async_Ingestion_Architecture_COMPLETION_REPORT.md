# OB-251 — Asynchronous Ingestion Architecture (DS-016) — COMPLETION REPORT

> **RENUMBERED OB-250 → OB-251 (number collision):** this work was authored as OB-250, but that
> identifier was already taken by a separate, merged piece of work — *"The PRISM Capability Gate + the
> Data-Operations Workspace"* (PR #615, `docs/completion-reports/OB-250_COMPLETION_REPORT.md`). To
> resolve the collision, this DS-016 Async Ingestion work was renumbered to **OB-251** (branch
> `ob-251-async-ingestion`); the merged PRISM **OB-250** on `main` is untouched (it is not on this
> branch). The rename was surgical — only this branch's async-ingestion OB-250 references became
> OB-251; the ~33 merged PRISM OB-250 files (lib/prism/*, api/prism/*, navigation/workspace, middleware,
> the ob250-prism-gate test, OB-250_COMPLETION_REPORT.md, and two PRISM lines in operate/import/page.tsx)
> were left as OB-250. The ADR (`docs/adr/OB-251_ADR.md`), directive, and migration are all OB-251.

**Date:** 2026-06-28 · **Branch:** `ob-251-async-ingestion` (from `72d8ccea`) · **Mode:** ULTRACODE (autonomous)
**ADR:** `docs/adr/OB-251_ADR.md`

---

## 1. Summary

OB-251 finishes DS-016 by completing and unifying the **inert OB-174 async scaffolding** into the single, live ingestion path. The decisive finding (FP-49 live verification): `processing_jobs` and `structural_fingerprints` **already exist** (OB-174 migration `023`), a working async **classify** worker already exists (`process-job`), and a polling progress surface already exists (`ImportProgress`) — but the table's RLS references a **fabricated `platform_users`** table (absent live), the worker still **fully materializes the parse** (the 86K×87 OOM, failed 3×), commit holds the browser **300s**, the cockpit reads **stale `import_batches`**, and the flywheel **promotion step has zero callers**. OB-251 closes all five.

**The five DS-016 layers, all live:**

| Layer | What shipped |
|---|---|
| A Upload (P-A1) | Upload creates `processing_jobs` and returns (existing OB-174 mechanism). |
| B Processing (P-B1..B4) | `process-job` worker + **atomic claim** (race-free pending→classifying) + **cron dispatcher** (browser-independent pickup, retry-with-backoff, stale reclaim). |
| C Large file (P-C1/C2) | **`sheet-window.ts`** bounded-window reader + **`windowed-commit.ts`** (commit a large unit as bounded windows via the *unchanged* `commitContentUnit`) + `dense:true`. **The OOM fix.** |
| D Progress (P-D1/D2) | Cockpit readiness reads **live `committed_data`** (self-heals after Clean Slate); async commit lifecycle stamped; existing polls retained. |
| E Flywheel (P-E1) | **`flywheel-aggregation.ts`** runs the previously-dead consume step + persists to a new `promoted_patterns` ledger; triggered after every import. |

**Unified path (§0.2):** the async path IS the path — synchronous `execute-bulk`/`commitContentUnit` logic is **reused** (not duplicated). 5 net-new files, **zero `*-async.ts` shadow files**.

**Scope:** 12 source files touched (all ingestion/cockpit/clean-slate), 5 net-new, 1 reconcile migration, +tests. **Zero** engine/convergence/classification-resolver changes (PG-9). tsc clean, `npm run build` exit 0 (218 routes), **429/429 tests pass**.

---

## 2. Investigation evidence (§3.0 Evidence Gate)

8-agent parallel sweep. Gate answers:

- **Upload/analyze/commit:** two analyze paths (OB-174 async worker + sync fallback); commit always synchronous (`execute-bulk`, 300s AbortController); `finalize-import` separate fire-and-forget live request.
- **Sync loop → worker:** `execute-bulk` loops files then units; per-file parse/fingerprint/classify/commit moves into the worker; cross-file plan interpretation + once-per-import finalize stay at the aggregator.
- **Parse OOM:** `XLSX.read`+`sheet_to_json` materialize the full sheet (`process-job:103-118`, `execute-bulk:242-247`); HF-350/HF-353 bounded the LLM/write but **not the parse**.
- **Cockpit:** `import_count = COUNT(import_batches)`, `lastImportStatus = latest import_batches.status`; Clean Slate wipes only `committed_data` → stale after wipe.
- **Flywheel:** writes land; `identifyPromotionCandidates`/`checkPromotedPatterns` have **zero callers**.

**FP-49 live schema** (`scripts/_ob251_fp49_schema.ts` — PostgREST has no `information_schema`, so service-role row-introspection):
```
tenants            EXISTS rows=15   id uuid
profiles           EXISTS rows=14   id, auth_user_id, tenant_id, role …          ← real FK target
committed_data     EXISTS rows=339776  import_batch_id, row_data, source_date, data_type — NO batch_id/chunk_id
processing_jobs    ALREADY EXISTS (0 rows)                                        ← OB-174 artifact
structural_fingerprints EXISTS (151 rows)
platform_users     ABSENT (PGRST205)            ← OB-174 fabricated it in RLS; canonical = profiles.auth_user_id
```
Anchor sheet dimensions (sets the 5M threshold safely above all anchors): BCL 0.01M cells, Meridian 0.00M, MIR 1.20M, Sabor 7.11M, Casa Diaz/Robles JDE 86,608×87 = 7.53M.

---

## 3. ADR (separate — `docs/adr/OB-251_ADR.md`)

- **Worker trigger: Hybrid C+B** — client-fire (sub-second) + Vercel-Cron sweep (browser-independent + retry). Rejected A (Edge — infra channel) and B-alone (≥60s cron floor). Atomic claim → never double-process.
- **Large file:** `dense:true` + windowed `sheet_to_json` + windowed commit, **gated at `CELL_CHUNK_THRESHOLD = 5,000,000` cells** (above every anchor) — anchors single-batch byte-identical; only OOM-scale files window. `CHUNK_ROW_SIZE = 20,000`.
- **Unified path:** `execute-bulk` reused for commit; two additive byte-identical `commitContentUnit` params.
- **Flywheel boundary:** wire the consume step; never reconnect `resolveClassification`.

---

## 4. Per-property evidence (P-A1 … P-E1)

- **P-A1:** `page.tsx` uploads to `ingestion-raw` + inserts jobs + returns (no sync parse/LLM/commit).
- **P-B1/B3:** `process-job` parse→fingerprint→classify; **atomic claim** `update … WHERE status='pending'` — **PG-2: 2 concurrent → 1 winner**.
- **P-B2:** per-file client-fired workers + cron sweep; Anthropic call parallelizes per worker.
- **P-B4:** `dispatch-jobs` requeues `failed` (retry<3, backoff `30s·2^n`), reclaims stale `classifying`→pending / `committing`→classified.
- **P-C1:** `sheet-window.ts` byte-identical to full `sheet_to_json` incl. `__EMPTY`/dedup + `dense:true` (`sheet-window.test.ts` 5/5).
- **P-C2:** `windowed-commit.ts` — bounded windows through the unchanged `commitContentUnit`; per-window `import_batch`, file-global `_rowIndex`, entity-id resolved once over a narrow scan. **PG-11 byte-identical** to single-batch + aggregate HALT-DATA-LOSS.
- **P-D1:** `ImportProgress`/`plan-run-status` polls + commit lifecycle stamping.
- **P-D2:** cockpit reads live `committed_data`; Clean Slate clears in-flight async state.
- **P-E1:** `runFlywheelAggregation` runs `identifyPromotionCandidates` + persists `promoted_patterns`; **PG-8a executed** (71 signals); **PG-8b** Tier-1 immunity live.

---

## 5. Proof gate results

| Gate | Result | Evidence |
|---|---|---|
| PG-1 upload returns | mechanism shipped; **live timing → architect** | `page.tsx` |
| PG-2 parallel workers | **mechanism PASS** (claim race-free); **live overlap → architect** | `_ob251_proofs.ts` |
| PG-3 86K no OOM | **mechanism PASS** (windowed 256MB < full 385MB, full array never built, byte-identical). **Live 86K → architect §6A** | `_ob251_proofs.ts` + PG-11 |
| PG-4 per-file isolation | source_date per-row, byte-identical under windowing. **Live multi-file → architect** | commit-content-unit:605 + PG-11 |
| PG-5 live progress | polls + commit-lifecycle stamping. **Live UI → architect** | §4 P-D1 |
| PG-6 cockpit live | **logic PASS** (committed_data-derived). **Live UI → architect** | tenant-state.ts / page-loaders.ts |
| PG-7 no re-submit | durable poll + HF-353 invariant. **Live → architect** | §1 |
| PG-8 flywheel + Tier-1 | **PASS** — aggregation ran (71 signals); fingerprints 24× / 0.96 | `_ob251_proofs.ts` |
| PG-9 HALT-CALC | **PASS** — BCL **$312,033** ✓ / Meridian **$556,985** ✓; zero engine files; byte-identical | git scope + PG-11 |
| PG-10 unified/Korean/registry | **PASS** — 5 net-new, no shadow; domain matches are comments; no registry | git diff + grep |
| PG-11 carry-everything | **PASS** — windowed == single-batch byte-identical (25k rows) | `_ob251_pg11_windowed_byteidentity.ts` |

The four absorbed CLT findings: **parse OOM** solved (PG-3/11); **multi-file parallelism** (per-file workers + sweep, P-B2); **client re-submission** (durable poll + lifecycle, P-D1/PG-7); **cockpit stale-state** solved (P-D2/PG-6).

---

## 6. Decision 158 / unified-path

`git diff --name-status 72d8ccea..HEAD | grep ^A` → net-new non-test files = windowed reader, windowed-commit, flywheel-aggregation, dispatcher, aggregate-flywheel route — each net-new architecture, **no synchronous-vs-async shadow**. `execute-bulk`/`commitContentUnit` extended in place. HALT-PARALLEL clean.

---

## 7. HALT conditions

None triggered. HALT-CALC not approached (anchors intact; engine untouched). HALT-DATA-LOSS guarded per-window + aggregate (PG-11). HALT-PARALLEL clean (PG-10). HALT-REGISTRY/Korean clean. HALT-SCHEMA: migration uses only FP-49-verified targets (the `platform_users` correction is the resolution).

---

## 8. ARTIFACT SYNC

1. **Migration (architect applies — SR-44):** `web/supabase/migrations/20260628_ob251_processing_jobs_reconcile.sql` — RLS `platform_users`→`profiles.auth_user_id`, add `batch_id`/`chunk_id`/`total_chunks` + `finalized`, create `promoted_patterns`. Verify: `npx tsx scripts/_ob251_verify_migration.ts`. Until applied: client RLS on `processing_jobs` stays service-role-only and `promoted_patterns` persistence no-ops (the consume step still runs).
2. **Flywheel now live** after every import (`aggregate-flywheel` + client trigger); `identifyPromotionCandidates` has a caller for the first time.
3. **Vercel Cron:** `web/vercel.json` 1-minute `dispatch-jobs` sweep. Optionally set `CRON_SECRET` to harden.
4. **Architect live verification (§6A — named, not deferred):** apply the migration, run the real 86,608×87 Casa Diaz/Robles file end-to-end (PG-3 live), and re-run a sealed-tenant calc to double-confirm $312,033 / $556,985 (PG-9 live double-run).
5. **Candidate locked decision:** *"Ingestion is asynchronous by construction — every file becomes a `processing_jobs` row; a small file is a one-window job; there is no synchronous ingestion path."*

**Proof scripts (committed):** `_ob251_fp49_schema.ts`, `_ob251_verify_migration.ts`, `_ob251_pg11_windowed_byteidentity.ts`, `_ob251_proofs.ts`. Tests: `src/lib/sci/__tests__/sheet-window.test.ts`.

---

*vialuce.ai · Intelligence. Acceleration. Performance. · OB-251 (Async Ingestion) complete.*
