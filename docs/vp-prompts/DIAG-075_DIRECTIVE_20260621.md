# DIAG-075: Performance Profiling — Financial Page Rendering + Persona Switching

**Date:** 2026-06-21
**Branch:** `diag-075-performance-profiling`
**Repo:** `CCAFRICA/spm-platform` (VP)
**Base:** `main` (post HF-327 merge, commit `10439405`)
**CLT source:** CLT-227 — architect observes rendering delays on `/financial`, `/financial/pulse`, and persona switching (Admin→Manager→Rep)
**Drafted per:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`
**Execution mode:** ULTRACODE — investigation objectives, measurement protocol, reporting format. CC determines profiling strategy autonomously. **READ-ONLY: zero code changes unless explicitly authorized in §2.**

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Read it in full before any other action.

SR-34 (structural fix — applies to diagnostic methodology, not code). Rule 7 (Prove Don't Describe). Rule 10 (Autonomy). Rule 14 (prompt to git). Rule 23 (scale analysis).

AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I". Read end-to-end. Execute every measurement. Commit after each logical unit. Push after each commit. Git from repo root (`spm-platform`), NOT `web/`.

**First action:** Write this directive to `docs/vp-prompts/DIAG-075_DIRECTIVE_20260621.md` and commit (`"DIAG-075: directive committed"`).

---

## §1 — PROBLEM STATEMENT

Two performance defects observed during CLT-227 architect browser verification:

**P1 — Financial page rendering delays.** The `/financial` landing page and `/financial/pulse` (Network Pulse) exhibit noticeable rendering delays on the Sabor Grupo Gastronomico tenant. Sabor has 263,250 POS cheque rows across 6 months (HF-324 data extension). The financial route handler (`app/api/financial/data/route.ts`) serves all 9 financial pages via mode-based POST requests. Suspected bottleneck: the route handler fetches all `committed_data` rows matching the tenant and aggregates in JavaScript, rather than using SQL-level aggregation. At 263K rows, this could mean megabytes of JSONB transferred from Supabase to the route handler per request.

**P2 — Persona switching delays.** Switching between Admin, Manager, and Rep personas via the Demo Persona Switcher produces noticeable delay. The platform context providers (tenant, auth, period, profiles, rule_sets, calculation_batches) re-fetch on persona change. This is a known issue (PDR-04: N+1 Platform Overhead — 95-278 requests per page in CLT-100). Persona switching may amplify this by invalidating cached context and triggering cascading re-fetches.

**Scale context (Rule 23):** 263,250 rows is "Medium" tier (10K–500K). This should not cause multi-second delays with proper query design. If it does, the architecture is querying wrong, not at scale limits.

---

## §2 — OBJECTIVES

CC performs five measurement tasks. All are READ-ONLY investigation. No code changes. The deliverable is a profiling report with precise measurements, bottleneck identification, and recommended optimization strategies ranked by impact.

**M1 — FINANCIAL ROUTE HANDLER PROFILING**

Profile the financial route handler (`app/api/financial/data/route.ts`) for each mode it serves. Measure: Supabase query time, row count returned, payload size, JS aggregation time, total route handler time. Run for EVERY mode. Expected modes include at minimum: `network_pulse`, `leakage`, `staff`, `performance`, `patterns`, `products`, `summary`, `timeline`, `cheques`.

**M2 — QUERY ANALYSIS** — For each Supabase query: SELECT * vs specific columns; filters (data_type, source_date, tenant_id); .rpc() server-side aggregation vs JS; existing indexes on committed_data.

**M3 — PAGE-LEVEL NETWORK PROFILING** — For `/financial`, `/financial/pulse`, `/financial/leakage`, `/financial/summary`: API call count on mount, mode requests per page, platform context requests, total navigation→render time.

**M4 — PERSONA SWITCHING PROFILING** — Admin→Manager→Rep: which providers re-fetch, total requests on switch, click→re-render time, whether financial route re-fires.

**M5 — COMPARATIVE BASELINE** — M1 against BCL (ICM, no pos_cheque). Volume-related (Sabor) vs platform-wide (PDR-04). Project to 10x/100x scale.

---

## §3 — CONSTRAINTS

**C1 — READ-ONLY.** Zero code changes to application files. Temporary instrumentation permitted ONLY if reverted before the diagnostic commit. Commit contains ONLY directive + profiling report.
**C2 — MEASUREMENT PRECISION.** Milliseconds. Each measurement ≥3 times, report median. Cold (after restart) vs warm distinction.
**C3 — NO OPTIMIZATION IN THIS DIAG.** Identify the bottleneck; do not fix. Recommend strategies, do not implement.
**C4 — COMPLETION REPORT PATH.** `docs/completion-reports/DIAG-075_COMPLETION_REPORT.md`.

---

## §4 — HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| HALT-1 | `exec_sql` RPC unavailable, no alt index check | Document limitation, proceed, report index status UNKNOWN |
| HALT-2 | Route handler architecture changed from mode-based POST | Document current architecture, adapt |
| HALT-3 | Persona switcher not functional on localhost | Document, proceed M1–M3/M5, report M4 BLOCKED |

---

## §5 — DELIVERABLE

**Primary artifact:** `docs/diagnostics/DIAG-075_PERFORMANCE_PROFILE.md` — M1 route timing per mode, M2 query analysis, M3 page network, M4 persona, M5 baseline, bottleneck identification (ranked), recommended optimizations (ranked by impact), scale projection (2.6M/26M rows).

**Commit:** `"DIAG-075: performance profiling report"` — directive + report. Zero application code in diff.

---

## §6 — OUT OF SCOPE

Code changes, schema modifications, route refactoring, context caching (PDR-04 remediation), load testing, production profiling, tenants beyond Sabor/BCL.

## §6A — RESIDUALS

**R-16: Production vs localhost delta.** Localhost ≠ production (Vercel cold starts, Supabase pooling, geo latency). Localhost = baseline.
**R-17: Recharts/chart rendering time.** Client-side chart render is separate from data-fetch bottleneck. Note if visibly slow; detailed chart profiling out of scope.

---

*DIAG-075, Structured and Compliant. ULTRACODE mode. Diagnostic-first: measure before prescribing.*
