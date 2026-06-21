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

Profile the financial route handler (`app/api/financial/data/route.ts`) for each mode it serves. Measure:

| Metric | How to Measure |
|---|---|
| **Supabase query time** | Add `console.time`/`console.timeEnd` (or `Date.now()` delta) around the Supabase `.from('committed_data').select(...)` call. Measure round-trip: query issued → data received. |
| **Row count returned** | Log the `.length` of the result array. Does each mode fetch ALL 263K rows or a subset? |
| **Payload size** | `JSON.stringify(data).length` on the Supabase result. How many MB of JSONB is transferred per request? |
| **JS aggregation time** | Time the aggregation logic (the code between receiving data and returning the response). This is where mode-specific grouping, summing, and sorting happens. |
| **Total route handler time** | End-to-end: request received → response sent. |

Run this for EVERY mode the route handler supports. The modes are in the route handler's switch/if chain — CC reads the code to enumerate them. Expected modes include at minimum: `network_pulse`, `leakage`, `staff`, `performance`, `patterns`, `products`, `summary`, `timeline`, `cheques`.

**Output format:**

```
MODE: network_pulse
  Supabase query:    ____ms (____rows, ____MB)
  JS aggregation:    ____ms
  Total handler:     ____ms

MODE: leakage
  Supabase query:    ____ms (____rows, ____MB)
  JS aggregation:    ____ms
  Total handler:     ____ms

[...for each mode]
```

**M2 — QUERY ANALYSIS**

For each Supabase query in the route handler:

- Is it `SELECT *` or does it select specific columns?
- Does it filter by `data_type`, `source_date`, or only by `tenant_id`?
- Does it use any Supabase `.rpc()` for server-side aggregation, or is all aggregation in JS?
- Are there any existing database indexes on `committed_data` that would benefit these queries? Check via:

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await c.rpc('exec_sql', { query: \"SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'committed_data'\" });
  console.log(JSON.stringify(data, null, 2));
})();
"
```

If `exec_sql` RPC doesn't exist, use alternative: read the schema migration files for index definitions, or check `SCHEMA_REFERENCE_LIVE.md` for documented indexes.

**M3 — PAGE-LEVEL NETWORK PROFILING**

For each of these 4 financial pages, measure total network activity on page load:

| Page | Route |
|---|---|
| Financial Landing | `/financial` |
| Network Pulse | `/financial/pulse` |
| Leakage Monitor | `/financial/leakage` |
| Operating Summary | `/financial/summary` |

For each page:
- How many API calls are made on mount? (Count `fetch` calls to `/api/financial/data` and any other endpoints)
- How many mode requests does a single page issue? (Some pages may call the route handler multiple times with different modes)
- How many platform context requests fire? (tenant, auth, profiles, periods, rule_sets, etc.)
- What is the total time from page navigation to render-complete?

Method: Add temporary `console.log` timing in the page component's data-fetching hooks, or use the Next.js dev server's built-in request logging. CC determines the best approach.

**M4 — PERSONA SWITCHING PROFILING**

Measure what happens when the Demo Persona Switcher changes from Admin to Manager to Rep:

- Which context providers re-fetch? (List each provider that issues a new request)
- How many total network requests fire on a persona switch?
- How long from persona click to re-render complete?
- Does the financial route handler re-fire on persona change? (It shouldn't if the data isn't persona-scoped, but it might if context invalidation cascades)

Method: Read the persona switcher component code to understand what state it changes, then trace which consumers re-render.

**M5 — COMPARATIVE BASELINE**

Run M1 measurements against the BCL tenant (ICM, no pos_cheque data). This establishes whether the performance issue is volume-related (Sabor-specific) or platform-wide. If BCL pages load fast and Sabor pages load slow, the bottleneck is in the financial data volume. If both are slow, the bottleneck is platform context overhead (PDR-04).

Also run M1 for Sabor with a mental note of: what would happen at 10x scale (2.6M rows — a real restaurant chain with 200 locations over 2 years)? If the current query pattern is O(n) on row count, it will not scale.

---

## §3 — CONSTRAINTS

**C1 — READ-ONLY.** Zero code changes to application files. Temporary `console.time`/`console.log` instrumentation is permitted ONLY if reverted before the diagnostic commit. The commit must contain ONLY the directive and the profiling report. No production code modified.

**C2 — MEASUREMENT PRECISION.** All timing measurements in milliseconds. Run each measurement at least 3 times and report the median. Cold-start vs warm-start distinction: measure once after server restart (cold) and twice after (warm). Report both.

**C3 — NO OPTIMIZATION IN THIS DIAG.** This diagnostic IDENTIFIES the bottleneck. It does NOT fix it. The output is a profiling report that enables the architect to draft a targeted optimization HF with precise scope. CC may RECOMMEND optimization strategies in the report but must not implement them.

**C4 — COMPLETION REPORT PATH.** `docs/completion-reports/DIAG-075_COMPLETION_REPORT.md` — correct path per standing rule.

---

## §4 — HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| HALT-1 | `exec_sql` RPC unavailable and no alternative method to check indexes | Document limitation. Proceed with other measurements. Report index status as UNKNOWN. |
| HALT-2 | Financial route handler architecture has changed significantly from the mode-based POST pattern | Document the current architecture. Adapt measurements accordingly. |
| HALT-3 | Persona switcher not functional on localhost | Document. Proceed with M1–M3 and M5. Report M4 as BLOCKED. |

---

## §5 — DELIVERABLE

**Primary artifact:** `docs/diagnostics/DIAG-075_PERFORMANCE_PROFILE.md`

Structure:

```
# DIAG-075: Performance Profile — Financial Pages + Persona Switching

## M1 — Route Handler Timing (per mode)
[table of all modes with Supabase/JS/total timing]

## M2 — Query Analysis
[for each query: SELECT shape, filters, index usage, aggregation approach]

## M3 — Page-Level Network Profile
[for each page: API call count, mode calls, context calls, total load time]

## M4 — Persona Switching Profile
[provider re-fetch list, request count, re-render time]

## M5 — Comparative Baseline (BCL vs Sabor)
[same metrics for BCL, delta analysis]

## BOTTLENECK IDENTIFICATION
[ranked list: which layer is slowest, by how much]

## RECOMMENDED OPTIMIZATIONS (ranked by impact)
[each recommendation: what to change, expected improvement, complexity, risk]
[examples might include:
  - SQL-level aggregation via Supabase RPC (move GROUP BY to DB)
  - Column-specific SELECT instead of SELECT *
  - Composite index on (tenant_id, data_type, source_date)
  - Response caching with TTL for financial aggregations
  - Context provider deduplication (PDR-04)
  - Mode-specific row filtering (only fetch rows needed for the mode)
  - Pagination for drill-through (ChequeList already caps at 200)
]

## SCALE PROJECTION
[what happens at 2.6M rows (10x)? at 26M rows (100x)?]
```

**Commit:** `"DIAG-075: performance profiling report"` — commit the directive and the profiling report. Zero application code in the diff.

---

## §6 — OUT OF SCOPE

- Code changes (optimizations, refactoring, caching — these follow in a targeted HF)
- Database schema modifications (index creation is an architect SQL Editor action per SR-44)
- Financial route handler refactoring
- Context provider caching (PDR-04 remediation)
- Load testing or stress testing
- Production environment profiling (localhost only)
- Other tenants beyond Sabor and BCL

---

## §6A — RESIDUALS

**R-16: Production vs localhost delta.** Localhost profiling may not reflect production performance (Vercel serverless cold starts, Supabase connection pooling, geographic latency). Production profiling requires a different approach (Vercel analytics, Supabase dashboard query performance). Document the localhost numbers as the baseline; production numbers are a separate measurement.

**R-17: Recharts/chart rendering time.** If chart components (Weekly Leakage Trend, Revenue Timeline, heatmaps) are slow to render, that's a client-side rendering bottleneck separate from the data-fetching bottleneck. CC can note if chart rendering is visibly slow during M3 measurements but detailed chart profiling is out of scope.

---

*DIAG-075, Structured and Compliant. ULTRACODE mode.*
*Diagnostic-first: measure before prescribing.*
*Drafted per INF_Structured_Compliant_Drafting_Reference_20260513.md.*
*DD-7: read-only — zero code changes.*
*DD-8: fully qualified paths.*
*DD-11: objectives are the executable. No tail summary. Ends at §6A.*

*vialuce.ai — Intelligence. Acceleration. Performance.*
