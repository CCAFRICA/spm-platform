# OB-250 — Asynchronous Ingestion Architecture (DS-016 Implementation)

**Directive file (VP):** `docs/vp-prompts/OB-250_ASYNC_INGESTION_ARCHITECTURE_DIRECTIVE_20260628.md`
**Date:** 2026-06-28 · **Category:** OB (objective build — architectural) · **Mode:** ULTRACODE `/effort` (autonomous)
**Repo:** VP `CCAFRICA/spm-platform` · **Branch:** `ob-250-async-ingestion` (NEW branch from main HEAD `72d8ccea`)
**Source spec:** DS-016 Data Ingestion Architecture Specification (designed 2026-03-18; prior implementation attempt OB-174). DS-016 is the design authority — this OB is its implementation. No separate Design Gate required; the spec exists.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11).

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Load-bearing:

- **Decision 158 (LOCKED)** — LLM recognizes; deterministic code constructs and guarantees. The async architecture changes WHERE and WHEN classification runs (per-file worker, not synchronous loop), never WHAT it does. The LLM's recognition is untouched; only the orchestration moves.
- **Korean Test (Decision 154, LOCKED)** — every new table, column, and identifier is domain-agnostic. `processing_jobs`, `chunk_progress`, `recognition_tier` — structural names, zero domain or tenant literals.
- **Carry Everything (T1-E902)** — every row of every file is committed, none dropped. Chunking is a processing strategy, never a data filter. A 250K-row file commits 250K rows.
- **The Validation Premise Law** — job state validated against carried reality (the actual file, the actual row count), never frozen expectation.
- **SR-2 — Scale by Design** — the architecture works for 1 file and 52 files, for 1K rows and 2M rows, without re-architecture. This is the defining requirement.
- **C2 — Fail Loud** — failed jobs carry diagnostic detail to a dead-letter state; never silent partial commit.
- **Vertical Slice Rule** — upload → job → worker → parse → classify → commit → progress surface, all in one PR. The slice is the whole ingestion path.
- **Progressive Performance (constitutional)** — the structural fingerprint makes the second encounter of a known structure Tier 1 (instant, no LLM). "New files are logically expensive; the second import is free."

**First action:** write this directive to `docs/vp-prompts/OB-250_ASYNC_INGESTION_ARCHITECTURE_DIRECTIVE_20260628.md` and commit (`"OB-250: directive committed"`).

**Channel boundary:** CC creates/edits application code only. The `processing_jobs` migration is authored by CC and committed as a file; the architect applies it in the Supabase SQL Editor (SR-44). CC verifies post-application via tsx script (no psql in VP).

**Execution authority (ULTRACODE — binding):** CC owns the entire execution path within the substrate boundaries. CC makes every design decision (worker trigger mechanism, chunk size, poll interval, parse window), commits each as an ADR, and proves it. **CC halts only on premise failures (§4). Difficulty is not a halt condition.**

---

### §0.1 — ANTI-SCOPE-NARROWING ENFORCEMENT (binding)

1. **No partial implementation.** DS-016 has five layers (A–E). All five are in scope: Upload, Processing, Large File Handling, Progress Reporting, Flywheel Aggregation. CC does not defer any layer.
2. **The four absorbed CLT findings are in scope:**
   - CLT — client re-submission during long-running operations (the ~60s timeout re-submit)
   - CLT — parse OOM at extreme scale (the 86K × 87 Casa Diaz / Robles file)
   - CLT — multi-file parallelism (sequential processing of N files)
   - CLT — Lifecycle Cockpit stale state after clean slate (cockpit reads session history, not live data)
3. **Subtraction over addition.** The synchronous import loop is REPLACED, not duplicated. The existing OB-156 file-transport and chunk-insert are REUSED. Zero new parallel execution surfaces.
4. **"Inert" is not acceptable.** Every layer built must be wired and live. The flywheel aggregation must actually run (it has been queued-but-never-consumed since the synchronous design — that is the defect, not the target).

### §0.2 — ANTI-PARALLEL-PATH / UNIFIED PATH ENFORCEMENT (binding — Decision 158)

**The async path is THE ingestion path, not a second one.** There must not be a synchronous import path and an async import path coexisting. After this OB, all ingestion flows through the job queue. CC must not create `*-async.ts` files that shadow synchronous equivalents — the existing files are extended/refactored so the single path is async.

1. **One ingestion entry point.** Upload creates jobs. There is no "small file goes synchronous, large file goes async" fork — that is two paths. Every file becomes a job. A small file is simply a job that completes in one chunk.
2. **The worker is the single processing surface.** Parse, fingerprint, classify, commit — all happen inside the worker invocation, for every file. The synchronous `analyze`/`commit` route logic moves into the worker; it is not duplicated.
3. **Chunked parse is unconditional.** The parse reads bounded row windows for every file (a small file is one window). There is not a "full parse for small, chunked parse for large" fork.
4. **Verification:** `find web/src -name "*.ts" -newer [directive SHA] -not -path "*test*"` — every new non-test file must be justified in the ADR as net-new architecture (the worker, the job-status surface), never as a parallel copy of an existing synchronous surface.

---

## §1 — PROBLEM STATEMENT

### §1.1 — The architectural defect (one root, many symptoms)

The ingestion pipeline was designed as a synchronous, single-request flow and extended to handle N files by looping within that single request. Every failure this produces traces to that one root:

| Symptom (observed) | Root |
|---|---|
| 86K × 87 file OOMs at parse time (Casa Diaz, Robles) | Full-workbook parse held in one request's memory |
| Client re-submits after ~60s during 85s plan interpretation | Browser connection held open for the full processing duration |
| N files process sequentially (slow, contamination-prone) | One request loops over files instead of N parallel workers |
| Lifecycle Cockpit shows stale "7 imports" after clean slate | Cockpit reads import-session history, not live job/data state |
| Flywheel confidence stuck (aggregation queued, never consumed) | Aggregation lives inside a synchronous flow with no separate execution path |

Patching memory copies inside the synchronous request (HF-350 fixed HC payload, HF-353 fixed commit payload) addresses symptoms one layer at a time. The parse-time OOM is the third such layer. The resolution is the architecture DS-016 specified: decouple ingestion from processing.

### §1.2 — The governing principle (DS-016, verbatim)

**Decouple ingestion from processing. The act of receiving data (upload) must be separate from the act of processing data (parse, classify, commit). The user's browser connection ends after upload confirmation, not after processing completion.**

### §1.3 — What must be true at completion (the properties)

**LAYER A — Upload (synchronous, browser-connected, seconds)**

**P-A1:** Upload creates job records and returns immediately. The user selects N files; files upload to Supabase Storage (existing OB-156 mechanism); the client creates N `processing_jobs` records with status `pending`; the client receives job IDs and the browser connection ends. Total synchronous time = upload duration + job creation, independent of file size or row count. No parse, no LLM call, no commitment in the synchronous path.

**LAYER B — Processing (asynchronous, worker-driven, seconds–minutes)**

**P-B1:** Each job is processed by an independent worker invocation. The worker downloads the file, parses it (chunked — P-C1), computes the structural fingerprint, classifies (Tier 1/2/3 per fingerprint match), and commits to `committed_data`. Each worker is one serverless invocation, well within timeout. CC determines the worker trigger mechanism (DS-016 §5 options: Supabase Edge + DB trigger / Vercel Cron polling / client-initiated parallel invocation) and records the choice + rationale in the ADR.

**P-B2:** Workers run in parallel. N files = N workers processing simultaneously. Wall-clock time is ~1× a single file (bounded by the slowest worker + queue depth), not N×. The Anthropic classification call (~the real per-file cost) parallelizes across workers.

**P-B3:** Per-file isolation is structural. Each worker operates on its own job with no shared mutable state. The source_date contamination class (HF-140/141) cannot recur because there is no sequential shared loop — isolation is guaranteed by the one-worker-one-job boundary, not by careful coding.

**P-B4:** Failed jobs retry with exponential backoff. A worker crash re-enters the job to the queue (idempotent — re-processing produces no duplicate data). Permanently failed jobs (after retry budget) enter a `failed` dead-letter state with diagnostic detail (C2). The user sees the failure and the reason, never silent loss.

**LAYER C — Large File Handling (chunked, SR-2)**

**P-C1:** Parsing reads bounded row windows. The worker never materializes a full large sheet in memory. CC determines the parse mechanism (SheetJS `range`-windowed reads or equivalent streaming) and the window size such that peak memory stays well under the serverless limit for any file size. The 86K × 87 file parses in windows, each window committed and released before the next. This is the direct resolution of the parse OOM. **HALT-DATA-LOSS applies: committed row count must equal parsed row count.**

**P-C2:** Very large files chunk into multiple jobs. A file over a row threshold (CC determines; DS-016 suggested ~50K) becomes multiple chunk-jobs reassembled at `committed_data` via shared `batch_id` + distinct `chunk_id`. A 250K-row file becomes ~5 parallel chunk-jobs. This composes with P-B2 (parallelism) — a single huge file scales horizontally the same way many files do.

**LAYER D — Progress Reporting (live, replaces stale-state)**

**P-D1:** The client polls job status (or Supabase Realtime) and shows a per-file progress surface: `pending → classifying → classified → confirming → committing → committed` (and `failed` with reason). Each file shows its recognition tier (Tier 1 "recognized instantly" / Tier 2 "similar structure" / Tier 3 "new structure — classifying"). Classification proposals appear per file as each completes, not all-at-once after all finish. This is built on the durable status surface HF-353 P-D introduced (`plan-run-status`) — extended to the job queue. **This resolves the client re-submission CLT: the client observes accurate in-progress state and never re-submits a live operation, and never marks it failed prematurely.**

**P-D2:** The Lifecycle Cockpit derives its state from live data and job state, not from import-session history. After a clean slate (zero `committed_data` rows), the cockpit reflects the empty state — "upload your data" pending, not "7 imports complete." The cockpit reads what IS, not what was imported. **This resolves the cockpit stale-state CLT.**

**LAYER E — Flywheel Aggregation (async, finally consumed)**

**P-E1:** Flywheel pattern aggregation runs as a separate async job triggered by processing completion — not inside the import request, not inside the calculation request. The atom/fingerprint patterns that have been queued-but-never-consumed are now aggregated by this job, so recognition confidence advances with each import instead of stalling. **Signal enrichment:** every job emits classification signals (fingerprint tier, per-column atom claims, recognition outcome) to the existing signal surface, and the aggregation job consumes them to strengthen the Tenant, Foundational, and Domain flywheels. The second encounter of a known structure is Tier 1 by construction — the fingerprint is the immunity.

---

## §2 — SUBSTRATE-BOUND DISCIPLINE

- **No stack change.** Supabase (Postgres job queue + Storage + committed_data), Vercel (Edge for upload, serverless for workers), Anthropic API (classification) — all existing. The orchestration changes; the stack does not.
- **One migration.** Add `processing_jobs`. No change to `committed_data`, `entities`, `rule_sets`, or any calc surface.
- **No engine change.** The calculation engine reads `committed_data` regardless of how data arrived. HALT-CALC anchors prove neutrality.
- **No SCI classification change.** The LLM classification logic is correct; it runs per-file in a worker instead of sequentially in a shared request. Decision 158 boundary preserved exactly.
- **Korean Test.** Every identifier in `processing_jobs` and the worker/surface code is structural. No domain, no tenant, no role literal.
- **FP-49 SQL Verification Gate.** The `processing_jobs` migration is authored only after CC queries `information_schema.columns` for the live schema of referenced tables (`tenants`, `profiles`) — the prior OB-174 attempt fabricated `platform_users`; the live table is `profiles` with `auth_user_id`. CC verifies before writing the migration and pastes the schema proof in the completion report.

---

## §3 — PHASES (ULTRACODE `/effort` — autonomous)

CC determines the implementation strategy for all five layers. The directive constrains WHAT properties must hold and WHERE the path stays unified (§0.2), not HOW.

### §3.0 — EVIDENCE GATE (mandatory before implementation)

| Layer | Required evidence | Question |
|---|---|---|
| **Upload** | Paste the current upload + `analyze`/`commit` route flow. Show where the browser connection is held through processing. | **Where does sync processing begin today?** |
| **Processing** | Paste the current synchronous file-processing loop. Show the shared state across files. | **What moves into the worker?** |
| **Large file** | Paste the current parse call (SheetJS `read` / `sheet_to_json`). Show where the full sheet materializes. | **Where is the parse-time memory spike?** |
| **Progress** | Paste the Lifecycle Cockpit data source (what table it reads for "N imports"). Paste the HF-353 `plan-run-status` surface. | **What does the cockpit read, and what should it read?** |
| **Flywheel** | Paste the flywheel aggregation code and show where it is queued but not consumed. | **Why has confidence stalled?** |
| **Schema** | Query `information_schema.columns` for `tenants` and `profiles`. | **What are the real FK targets (not OB-174's fabricated `platform_users`)?** |

**ADR commitment (mandatory before Tier 1):** `docs/adr/OB-250_ADR.md` records: the worker trigger choice (A/B/C) with scale/complexity/latency rationale; the chunk size and parse-window size with the memory math; the unified-path refactor plan (which synchronous files become the worker, proving no parallel shadow per §0.2); the blast radius; and the DS-016 layer-to-code mapping.

### §3.1 — TIER 1: PROPERTY ESTABLISHMENT

CC implements all five layers (P-A1 through P-E1). Each extends/refactors existing surfaces into the unified async path (§0.2).

**Migration:** CC authors the `processing_jobs` migration (schema below, FK targets verified per FP-49) as a file, commits it, and signals the architect to apply it in the Supabase SQL Editor. CC then verifies post-application via tsx script. The schema (from DS-016 §4 / OB-174, FK-corrected):
`id, tenant_id (FK tenants), status (pending/classifying/classified/confirming/committing/committed/failed), file_storage_path, file_name, file_size_bytes, structural_fingerprint, classification_result (JSONB), recognition_tier (1/2/3), proposal (JSONB), chunk_progress (JSONB), batch_id, chunk_id, error_detail, retry_count, uploaded_by, session_id, created_at, started_at, completed_at` — RLS tenant isolation (same pattern as committed_data), indexes on tenant_id, status (worker polling), structural_fingerprint (flywheel lookup). CC confirms the live FK target is `profiles.auth_user_id`, not a fabricated table.

### §3.2 — TIER 2: PROOF GATES (sequential)

**PG-1 — Upload returns immediately.** Upload 3 files. Browser receives job IDs in seconds; 3 `processing_jobs` rows exist with status `pending`; the upload response time is independent of file size. Paste the job rows and the response timing.

**PG-2 — Workers process in parallel.** The 3 jobs show overlapping `started_at` timestamps (parallel, not sequential). Each transitions through the status lifecycle to `committed`. Paste the job rows showing parallel timestamps and final status.

**PG-3 — The 86K × 87 file imports without OOM.** The Casa Diaz / Robles JDE file (`Abril_00001_1 demo REF.xlsx`) imports to completion. All 86,608 rows committed to `committed_data`. No Vercel memory error. Paste the committed row count and the absence of OOM. **(This is the headline proof — the file that has failed three times.)**

**PG-4 — Per-file isolation (no contamination).** Multiple files with distinct source_dates commit with correct per-file source_dates — no cross-file contamination (the HF-140/141 class). Paste committed source_date ranges per file.

**PG-5 — Progress surface is live.** The progress surface shows per-file status transitions and recognition tier. Paste/describe the surface showing at least one file progressing through the lifecycle and its tier.

**PG-6 — Cockpit reflects live state.** After a clean slate (zero committed_data rows for a tenant), the Lifecycle Cockpit shows the empty "upload your data" state, NOT a stale import count. Paste/describe the cockpit reading live data state.

**PG-7 — No client re-submission.** A long-running operation (plan interpretation or large import) does not trigger a client re-submit. The HF-259 single-flight warning does not appear. Paste the import log showing a single run.

**PG-8 — Flywheel aggregation runs and advances.** The aggregation job runs after processing. Recognition confidence advances on a repeated structure (second import of the same fingerprint is Tier 1, zero LLM). Paste the fingerprint Tier 1 hit on second import and evidence the aggregation job executed.

**PG-9 — BCL/Meridian/MIR neutrality (HALT-CALC).** BCL $312,033, Meridian $556,985, MIR Plan 2 = 210,000, MIR Plan 5 = 0 unchanged. The engine reads committed_data identically regardless of ingestion path. Paste calc results.

**PG-10 — Unified path / Korean Test.** Grep evidence: (a) no parallel synchronous-vs-async shadow files (§0.2 `find` result, each new file justified in ADR); (b) zero domain/tenant/role literals in `processing_jobs` columns or worker code; (c) zero registry. Paste grep results.

**PG-11 — Carry Everything / scale.** A synthetic large file (or the 86K file) commits a row count exactly equal to its parsed row count (HALT-DATA-LOSS proof). Paste parsed-vs-committed counts.

---

## §4 — HALT CONDITIONS

- **HALT-CALC.** BCL $312,033, Meridian $556,985, MIR Plan 2 = 210,000, or MIR Plan 5 = 0 moves. Stop. Report. No repair.
- **HALT-DATA-LOSS.** Committed row count < parsed row count for any file. Stop immediately. Data loss is never acceptable (Carry Everything).
- **HALT-PARALLEL.** A new synchronous-vs-async shadow surface is created (violates §0.2 unified path / Decision 158). Stop. Refactor into the single path.
- **HALT-REGISTRY.** Any fix introduces a domain/tenant/role mapping table or enum in the ingestion path. Stop.
- **HALT-SCHEMA.** The migration references a table/column not confirmed present in the live schema (FP-49). Stop. Re-verify.
- **HALT-COLLISION.** In-flight work on main modifies the same ingestion surfaces. Stop. Report.
- **HALT-LOCKED-RULE (SR-42).** A locked rule dictates action contradicting another locked rule. Surface both. Halt.

---

## §5 — REPORTING DISCIPLINE

**Completion report:** `docs/completion-reports/OB-250_COMPLETION_REPORT.md`

Per Rules 25–28:
1. Summary (layers implemented, unified-path refactor, lines changed, files)
2. Investigation evidence (pasted per §3.0, including the live schema proof per FP-49)
3. ADR (committed separately, referenced — worker-trigger choice, chunk/window sizes, refactor plan)
4. Per-property evidence (P-A1 through P-E1, each with pasted code/output)
5. Proof gate results (PG-1 through PG-11, each with pasted evidence)
6. Decision 158 / unified-path evidence (the `find` result; the path is singular)
7. HALT conditions encountered (if any)
8. ARTIFACT SYNC (the `processing_jobs` migration for architect application; flywheel-aggregation now-live note; candidate locked decision — "ingestion is async by construction")

---

## §6 — OUT OF SCOPE

- The calculation engine, convergence bindings, and any calc-producing surface — untouched (HALT-CALC proves it).
- MIR Plans 3/4 divergence — separate convergence-interpretation gap.
- Robles cross-component / hierarchy-edge work (HF-353) — already merged; this OB does not touch the engine or convergence.
- Tenant Management surface — separate OB.
- The HF-281 "binding phase incomplete" user-facing message rewrite — separate UX item (the C2 fail-loud is correct; only the wording is at issue).
- Schema changes beyond adding `processing_jobs`.

---

## §6A — RESIDUALS

None. All five DS-016 layers (A–E) are in scope. All four absorbed CLT findings (client re-submission, parse OOM, multi-file parallelism, cockpit stale-state) are in scope. The flywheel aggregation that has been queued-but-never-consumed is wired live. The only follow-on is the architect's SR-44 application of the `processing_jobs` migration and the live large-file verification — both named, neither deferred.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*OB-250 — Asynchronous Ingestion Architecture (DS-016 Implementation)*
*File IS the prompt. No §7. No tail summary. CC reads end-to-end and executes.*
