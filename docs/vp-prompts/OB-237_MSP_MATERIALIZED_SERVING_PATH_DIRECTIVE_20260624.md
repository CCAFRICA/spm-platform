# OB-237: MATERIALIZED SERVING PATH (MSP) — UNIVERSAL RENDER-FROM-MATERIALIZATION

**Date:** 2026-06-24
**Type:** OB (Objective Build)
**Mode:** ULTRACODE `/effort`
**Sequence:** OB-237
**Repo:** `CCAFRICA/spm-platform`
**Branch:** `ob-237-materialized-serving-path`
**Drafting reference:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1 through DD-12)

---

## §0 — CC STANDING RULES

Read `CC_STANDING_ARCHITECTURE_RULES.md` in its entirety before proceeding. The following are binding throughout this OB:

- **Principle 2** (Scale by Design): Every serving path must work at Empresarial (25K entities) and Corporativo (100K+ entities). JS-side aggregation that is O(entity_count) is a scale failure by definition.
- **AP-4** (Sequential per-entity database calls): Aggregate reads must be SQL-level, never per-row JS.
- **AP-11** (Empty shell pages): Every surface must render with real data after MSP conversion. No regressions to empty state.
- **AP-17** (Two code paths): After MSP, each surface has ONE serving path (the materialization). The raw path is deleted, not toggled.
- **AP-21** (Single data source): Summary and detail on the same surface read from the same source.
- **SR-34** (No Bypass): Diagnose and fix structurally. No workarounds, reduced-scope tests, interim measures.
- **SR-41** (Revert Discipline): Contamination = `git revert`, not force-push.
- **SR-43** (Ship = merge + production verification + completion report with SHA).
- **SR-44** (Browser verification, SQL migrations, PR merges = architect-only).
- **Rule 29** (CC paste LAST).
- **Rules 25–28** (Completion report discipline).

Commit + push after every change. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before completion report. Git from repo root (`spm-platform`), NOT `web/`. Final step: `gh pr create --base main --head ob-237-materialized-serving-path` with descriptive title and body.

---

## §1 — PROBLEM STATEMENT

### §1.1 — The defect

The platform's visualization surfaces re-derive aggregates from base rows at render time. Pre-computed materializations exist (OB-229's `financial_summary_daily` for Financial; `entity_period_outcomes` for Compensation/Intelligence) but are consumed by only a subset of serving paths. The remaining paths fetch full-table JSONB from base tables (`committed_data`, `calculation_results`) and aggregate in JavaScript.

### §1.2 — Measured impact

DIAG-075 profiled the Financial route handler on Sabor (263,250 rows, 6 months, 24 periods): 163.9 MB transferred, 264 sequential PostgREST round-trips, 96.7-second cold start, to produce 4–35 KB response payloads. Data-moved-to-data-needed ratio: 20,000:1. The Revenue Timeline page measured 136,624ms (136 seconds) via the raw `committed_data` path, while OB-229's Summary Engine serves the same data from `financial_summary_daily` in 826ms — a 138.9× speedup that is applied to some modes and not others.

The Intelligence Agent surfaces re-derive period totals and component breakdowns from `calculation_results.components` JSONB by fetching all entity rows and aggregating in JS. At BCL scale (30 entities) this is instant. At Empresarial scale (25,000 entities) this is the same 136-second wall relocated to a different table.

### §1.3 — Constitutional violations

- **Progressive Performance:** "Any surface producing cold-start results on every encounter is FAILURE." Raw-path surfaces violate this on every load.
- **Decision 158:** "LLM recognizes; deterministic code constructs and guarantees." The materialization IS the deterministic construction. Re-deriving it in JS is the construction layer re-doing what the materialization already guaranteed.
- **End-State A (locked):** "Intelligence consumes, never re-derives." Intelligence surfaces that aggregate `calculation_results` in JS violate this at scale.
- **Principle 2 (Scale by Design):** JS-side O(n) aggregation cannot serve the Empresarial/Corporativo pricing tiers.

### §1.4 — The invariant this OB establishes

**Materialized Serving Path (MSP):** Every aggregate visualization reads from a pre-computed materialization. No aggregate is re-derived from base rows at render time. Row-level views (drill-through, transaction search) read bounded, filtered, paginated queries — never a full-table JSONB fetch.

This is the single invariant. It applies universally to Financial, Intelligence, and Compensation. The materialization is agent-specific; the law is platform-wide.

---

## §2 — SUBSTRATE-BOUND DISCIPLINE APPLICATIONS

| Substrate entry | Application in this OB |
|---|---|
| **Decision 158** (LLM recognizes; code constructs) | Applied at the serving layer: the materialization is the construction; the surface is the consumer. The subtraction pattern holds — remove the re-derivation path, consume the pre-computed answer. |
| **Progressive Performance** (constitutional) | Every surface's second-encounter cost drops to near-zero because the materialization is already computed. The raw path's per-load cost is eliminated. |
| **End-State A** (Intelligence consumes, never re-derives — locked) | `intelligence-data.ts` functions that aggregate in JS are replaced with SQL aggregation or `entity_period_outcomes` reads. Per-entity reads from `calculation_results` (O(1), indexed) are preserved. |
| **Korean Test (T1-E910 v2)** | The MSP fix introduces zero field-name literals, zero language-specific strings. Summary tables are structurally keyed. |
| **Carry Everything (T1-E902 v2)** | No data is discarded. Materializations are additive read-caches over the same base data. Base tables remain source of truth. |
| **AP-17** (Single code path) | After MSP, each surface has one serving path. The raw aggregate path is deleted, not feature-flagged. |
| **D7 (Entity Model Design)** | `entity_period_outcomes` is the designed materialization for cross-rule-set aggregation. MSP completes its consumption across all Compensation and Intelligence surfaces. |
| **Validation Premise Law** | Byte-match gate validates structural equivalence (same data, same answer) between old and new paths. Not set-membership. |

### §2.1 — Reconciliation-channel separation

The byte-match gate (old-path output === new-path output) is the verification mechanism. CC reports both outputs verbatim per surface. Architect reconciles. CC does not interpret whether a numeric difference is acceptable — it reports the values.

---

## §3 — EXECUTION TOPOLOGY (ULTRACODE)

```
P0 (Discovery — sequential, mandatory)
  ↓
T1 (Financial MSP)  ║  T2 (Intelligence MSP)  ║  T3 (Compensation MSP)
  [parallel, file-disjoint]
  ↓
T4 (Integration Proof — sequential, after T1+T2+T3)
```

**File-disjoint partitioning (ULTRACODE fan-out contract):**

- **T1 owns:** `app/api/financial/data/route.ts`, `app/(app)/financial/**/*.tsx`, `lib/financial/**`, any sibling route under `/api/financial/`, any financial summary table read/write paths.
- **T2 owns:** `lib/insights/intelligence-data.ts`, `app/(app)/insights/**/*.tsx`, `app/(app)/stream/**/*.tsx`, `app/api/insights/**`, any Intelligence route.
- **T3 owns:** `app/(app)/perform/**/*.tsx`, `app/(app)/my-compensation/**/*.tsx`, `app/(app)/operate/**/*.tsx`, `app/api/calculation/**` (serving paths only — the calculation engine itself is NOT in scope), any Compensation/Perform route serving aggregate views.

No tier edits files owned by another tier. If a shared utility is needed, it is created in P0 and consumed read-only by T1/T2/T3.

CC determines whether to execute T1/T2/T3 via ULTRACODE subagent fan-out or sequentially based on its own assessment of complexity. The file-disjoint contract holds either way.

---

## §3.P0 — DISCOVERY (sequential, mandatory gate)

### §3.P0.1 — Objective

Produce the **MSP Application Map**: a complete, greppable inventory of every serving path across all three agents, classified as WIRED (reads materialization), RAW (re-derives from base rows), or BOUNDED (row-level, correctly raw but paginated). This map is the definitive scope for T1/T2/T3. Nothing is silently narrowed — every path appears in the map, and every RAW path becomes a T1/T2/T3 work item.

### §3.P0.2 — Discovery procedure

**Step 1: Materialization inventory.** Query the live database to enumerate every summary/materialization table that exists. At minimum, check for: `financial_summary_daily`, `summary_artifacts`, `entity_period_outcomes`, and any other table whose name or structure indicates pre-computed aggregation. For each table found: record column list, row count per tenant, and whether it is populated. Paste results.

```bash
# Run from web/
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  // Check for materialization tables
  const tables = ['financial_summary_daily','summary_artifacts','entity_period_outcomes','period_entity_state','profile_scope'];
  for (const t of tables) {
    const { count, error } = await s.from(t).select('*', { count: 'exact', head: true });
    console.log(t + ': ' + (error ? 'NOT FOUND — ' + error.message : 'EXISTS, rows=' + count));
  }
  // Check for any other summary-like tables
  const { data: allTables } = await s.rpc('exec_sql', { query: \"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%summary%' OR table_name LIKE '%materialized%' OR table_name LIKE '%aggregate%'\" }).catch(() => ({ data: null }));
  if (allTables) console.log('Additional summary tables: ' + JSON.stringify(allTables));
}
run();
"
```

If `exec_sql` RPC is not available, use the Supabase client to probe each table individually. The goal is an authoritative list of what materializations exist and are populated.

**Step 2: Financial serving-path grep.** Enumerate every code path in the financial route handler and financial pages that reads `committed_data` and aggregates.

```bash
echo "=== FINANCIAL: Route handler modes ==="
grep -n "mode\|case\|if.*mode\|committed_data\|financial_summary\|summary_artifacts\|from(" web/src/app/api/financial/data/route.ts | head -80

echo ""
echo "=== FINANCIAL: Any other route reading committed_data for financial ==="
grep -rn "from('committed_data')\|from(\"committed_data\")" web/src/app/api/financial/ --include="*.ts" | grep -v node_modules

echo ""
echo "=== FINANCIAL: Page-level direct reads ==="
grep -rn "committed_data\|supabase.*from\|financial_summary\|summary_artifacts" web/src/app/**/financial/**/*.tsx --include="*.tsx" | grep -v node_modules | head -30

echo ""
echo "=== FINANCIAL: Service-layer reads ==="
grep -rn "committed_data\|supabase.*from" web/src/lib/financial*.ts web/src/lib/**/financial*.ts 2>/dev/null | head -20
```

For each mode found in the route handler: record the mode name, which table it reads, whether it aggregates in JS or SQL, and the estimated response size. Classify as WIRED/RAW/BOUNDED.

**Step 3: Intelligence serving-path grep.** Enumerate every serving path in Intelligence surfaces.

```bash
echo "=== INTELLIGENCE: intelligence-data.ts functions ==="
grep -n "export\|async function\|supabase.*from\|\.select\|calculation_results\|entity_period_outcomes\|committed_data" web/src/lib/insights/intelligence-data.ts | head -40

echo ""
echo "=== INTELLIGENCE: Any aggregate JS (reduce/map/forEach on query results) ==="
grep -n "\.reduce\|\.map\|\.forEach\|\.filter\|SUM\|sum\|aggregate\|rollup\|total" web/src/lib/insights/intelligence-data.ts | head -20

echo ""
echo "=== INTELLIGENCE: Page-level direct reads bypassing intelligence-data.ts ==="
grep -rn "supabase.*from\|calculation_results\|entity_period_outcomes\|committed_data" web/src/app/**/insights/**/*.tsx web/src/app/**/stream/**/*.tsx --include="*.tsx" 2>/dev/null | grep -v node_modules | head -30

echo ""
echo "=== INTELLIGENCE: Other API routes serving intelligence data ==="
grep -rn "from('calculation_results')\|from(\"calculation_results\")" web/src/app/api/ --include="*.ts" | grep -v "calculate\|engine\|orchestrat" | head -20
```

For each function in `intelligence-data.ts`: record what table it reads, whether it does JS-side aggregation of multi-row results, and whether `entity_period_outcomes` would serve the same answer. Classify WIRED/RAW.

**Step 4: Compensation serving-path grep.** Enumerate every serving path in Compensation surfaces.

```bash
echo "=== COMPENSATION: Perform pages reading calculation data ==="
grep -rn "supabase.*from\|calculation_results\|entity_period_outcomes\|committed_data" web/src/app/**/perform/**/*.tsx web/src/app/**/my-compensation/**/*.tsx web/src/app/**/operate/**/*.tsx --include="*.tsx" 2>/dev/null | grep -v node_modules | head -40

echo ""
echo "=== COMPENSATION: API routes serving compensation aggregate views ==="
grep -rn "from('calculation_results')\|from('entity_period_outcomes')" web/src/app/api/ --include="*.ts" | grep -v "calculate/route\|engine\|orchestrat\|import" | head -20

echo ""
echo "=== COMPENSATION: Any JS-side aggregation of calculation_results ==="
grep -rn "\.reduce\|\.map.*total\|\.forEach.*payout\|SUM\|aggregate" web/src/app/**/perform/**/*.tsx web/src/app/**/my-compensation/**/*.tsx web/src/app/**/operate/**/*.tsx --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== COMPENSATION: Service-layer reads ==="
grep -rn "calculation_results\|entity_period_outcomes" web/src/lib/perform*.ts web/src/lib/compensation*.ts web/src/lib/**/perform*.ts 2>/dev/null | head -20
```

For each Compensation surface: record what it reads, whether it aggregates across entities in JS, and whether `entity_period_outcomes` serves the same answer. Classify WIRED/RAW/BOUNDED. Note: per-entity reads from `calculation_results` (rep viewing own payout, one row, indexed) are O(1) and classified BOUNDED — not RAW.

**Step 5: Cross-agent catch-all.** Catch any serving path the agent-specific greps missed.

```bash
echo "=== CROSS-AGENT: Every API route reading committed_data ==="
grep -rn "from('committed_data')\|from(\"committed_data\")" web/src/app/api/ --include="*.ts" | grep -v "import\|sci\|calculate\|engine" | head -20

echo ""
echo "=== CROSS-AGENT: carrier-intelligence route ==="
grep -rn "committed_data\|calculation_results\|financial_summary\|summary_artifacts" web/src/app/api/carrier-intelligence/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "=== CROSS-AGENT: stream route ==="
grep -rn "committed_data\|calculation_results" web/src/app/api/stream/ web/src/app/api/insights/ --include="*.ts" 2>/dev/null | head -10
```

### §3.P0.6 — Baseline performance capture

After the serving-path inventory is complete, capture the **before-state response time** for every surface identified as RAW or WIRED. This is the empirical baseline that T4 will compare against.

**Procedure:** Start the dev server. For each surface, load it once (cold start), then once more (warm). Record both timings from the dev server log (`POST /api/... 200 in Xms` or page compilation + data fetch time). Also record the response payload size.

For Financial surfaces, use Sabor (tenant_id `f7093bcc-e90b-4918-9680-69da7952dd65`). For Intelligence and Compensation surfaces, use BCL (tenant_id `b1c2d3e4-aaaa-bbbb-cccc-111111111111`).

Compile into a baseline table in the MSP Application Map:

| Agent | Surface | Route | Classification | Cold Start (ms) | Warm (ms) | Response Size (KB) |
|---|---|---|---|---|---|---|

This table is mandatory — it is the "before" measurement. The "after" measurement in T4 produces the improvement multiplier. Without both, the empirical value of OB-237 is undocumented.

Commit: `"P0: Baseline performance capture — before-state timings per surface"`

### §3.P0.3 — MSP Application Map (output artifact)

Compile the results into a single artifact: `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md`. The artifact is a table with these columns:

| Agent | Surface | Route/File | Base Table Read | Aggregation Method | Classification | Materialization Target | T-Tier |
|---|---|---|---|---|---|---|---|

Every serving path appears. Every RAW path has a T-tier assignment (T1/T2/T3). Commit and push this artifact.

### §3.P0.4 — HALT conditions (P0)

- **HALT-SCHEMA:** `financial_summary_daily` does not exist in the live database. → Report. Architect dispositions whether to create it (extends scope) or defer Financial tier.
- **HALT-EMPTY:** `entity_period_outcomes` exists but has zero rows for all tenants. → Report. The materialization trigger (lifecycle transitions) may not be wired. Architect dispositions.
- **HALT-ZERO-RAW:** Discovery finds zero RAW paths across all agents. → Report the map and halt. The invariant may already be satisfied (unlikely given the 136s evidence, but the grep is authoritative).

Commit: `"P0: MSP Application Map — discovery complete"`

---

## §3.T1 — FINANCIAL AGENT MSP

### §3.T1.1 — Objective

Every Financial surface aggregate read consumes `financial_summary_daily` (or `summary_artifacts`). Zero aggregate reads touch `committed_data`. The 136-second timeline is dead. Every mode of the financial route handler serves from the summary.

### §3.T1.2 — Scope (derived from P0 map)

Every path classified RAW in the P0 map with Agent=Financial is in scope. CC reads the P0 map, not a hardcoded list — the map is the scope.

### §3.T1.3 — Execution contract

For each RAW financial path:

1. **Capture the old-path output** for Sabor, for the mode's default parameters. Save as a JSON artifact per mode: `docs/diagnostics/OB-237_T1_bytematch_<mode>_old.json`.
2. **Wire the mode to the summary.** Read from `financial_summary_daily` or `summary_artifacts` using the same query parameters the old path used. The summary was built by OB-229's domain-agnostic `jsonb_each` + `jsonb_typeof='number'` aggregation — it carries every numeric field. CC determines the query shape.
3. **Capture the new-path output** for the same parameters. Save as `docs/diagnostics/OB-237_T1_bytematch_<mode>_new.json`.
4. **Byte-match gate.** Compare old and new JSON. Values must match. If they don't match: HALT-T1-BEHAVIORAL (see §4). Do NOT proceed to delete the old path until the match is proven.
5. **Delete the old aggregate path.** The raw-read code for this mode is removed — not commented, not toggled. AP-17: single code path.
6. **Verify `npm run build` clean (tsc 0) after each mode conversion.**

After all modes converted: verify Sabor's financial pages render on `localhost:3000` with real data, sub-second load times. Paste timing evidence.

### §3.T1.4 — Cheque Explorer exception

The Cheque Explorer / drill-through mode reads individual rows — this is correct and NOT converted to summary. Verify it uses bounded, filtered, paginated queries (LIMIT + OFFSET or cursor, never a full-table fetch). If it fetches unbounded: add pagination. Classify as BOUNDED in the map.

### §3.T1.5 — Summary coverage gate

Before wiring a mode: verify `financial_summary_daily` covers the full date/period span the raw path aggregates. If the summary covers only a subset → the switch would silently change the answer. In that case: HALT-T1-COVERAGE (see §4).

Commit per mode or per logical group. Final commit: `"T1: Financial MSP complete — all aggregate modes wired to summary"`

---

## §3.T2 — INTELLIGENCE AGENT MSP

### §3.T2.1 — Objective

Every Intelligence surface aggregate read uses SQL-level aggregation or reads from `entity_period_outcomes`. Zero aggregate reads fetch multi-row `calculation_results` and aggregate in JS.

### §3.T2.2 — Scope (derived from P0 map)

Every path classified RAW in the P0 map with Agent=Intelligence is in scope. This includes:

- Functions in `intelligence-data.ts` that do JS-side aggregation (`.reduce`, `.map` over multi-row `calculation_results` → sum/rollup).
- Any Intelligence page that bypasses `intelligence-data.ts` and reads `calculation_results` directly.
- The `/perform` overview page if it re-derives totals.

Per-entity reads from `calculation_results` (one entity, one row, indexed) are BOUNDED and not in scope.

### §3.T2.3 — Execution contract

For each RAW intelligence path:

1. **Determine the correct materialization.** Two options per function:
   - **Option A:** Replace JS aggregation with SQL aggregate in the same query. Example: `getComponentTotals` fetches all `calculation_results` rows and reduces `components` JSONB in JS → replace with a SQL query that does `jsonb_array_elements` + `GROUP BY` + `SUM` in Postgres, returning the aggregated result directly. This keeps the source table but eliminates the O(n) JS.
   - **Option B:** Read from `entity_period_outcomes` if it carries the answer. `entity_period_outcomes.component_breakdown` is the designed D7 materialization for exactly this purpose. If populated, it's the cleanest read.
   
   CC evaluates P0's materialization inventory (is `entity_period_outcomes` populated for the tenant?) and chooses the option that produces a correct result without JS-side multi-row aggregation. If both options work, prefer Option B (reads a materialization, aligns with D7 design intent).

2. **Value-match gate.** For BCL (the calculation-reconciled tenant): capture the function's return value before and after the change. The total must match. For `getPeriodTotal`: $58,406 (BCL March). For `getComponentTotals`: 4 components, amounts conserving to period total. Paste both values.

3. **Delete the JS aggregation path.** The `.reduce` / `.map` / `.forEach` loop over multi-row results is removed. AP-17: single code path.

4. **Scale verification.** For at least one converted function: demonstrate O(1) or O(log n) behavior by explaining the SQL query plan (indexed aggregate, not sequential scan). Paste the query.

### §3.T2.4 — OB-234 coordination

If OB-234 Tier-2 surfaces have landed (check: are there 8 insight surfaces in `app/(app)/insights/` beyond Overview?), T2 wires whatever surfaces exist. If OB-234 hasn't landed, T2 wires the pre-Tier-2 surfaces and `intelligence-data.ts`. Either way, the data-layer fix is the same.

Do NOT modify OB-234's surface components (T1-C DS-003 library, Tier-2 page layouts). T2 modifies only the data-access layer those surfaces consume.

Commit: `"T2: Intelligence MSP complete — aggregate reads SQL-level or materialization-backed"`

---

## §3.T3 — COMPENSATION AGENT MSP

### §3.T3.1 — Objective

Every Compensation surface aggregate read uses SQL-level aggregation or reads from `entity_period_outcomes`. Per-entity reads (rep viewing own payout, manager viewing one team member) remain as indexed single-row reads from `calculation_results` — they are O(1) and not the disease.

### §3.T3.2 — Scope (derived from P0 map)

Every path classified RAW in the P0 map with Agent=Compensation is in scope. The likely exposure surfaces (from P0 discovery) are:

- **Admin dashboard aggregate cards:** total period payout, entity count, component distribution — if these SUM across `calculation_results` in JS.
- **Manager team view:** team total payout, member rankings — if these fetch all team members' `calculation_results` and aggregate.
- **Payroll overview:** approved payout totals — if these aggregate rather than reading `entity_period_outcomes` where `all_approved = true`.
- **Reconciliation comparison views:** period-over-period totals — if these re-derive.

Per-entity surfaces (Commission Statement showing one rep's breakdown, My Compensation) read one `calculation_results` row by entity_id (indexed). These are BOUNDED and out of scope.

### §3.T3.3 — Execution contract

Same pattern as T2:

1. **Determine materialization:** SQL aggregate or `entity_period_outcomes` read.
2. **Value-match gate:** BCL period totals must match ground truth ($312,033 total across 6 periods, per-period breakdown exact).
3. **Delete JS aggregation path.**
4. **Scale verification:** demonstrate O(1) or indexed aggregate for at least one converted path.

### §3.T3.4 — entity_period_outcomes population gate

If P0 discovered `entity_period_outcomes` is unpopulated (HALT-EMPTY disposition: architect says proceed), T3 must wire the materialization trigger: after each `calculation_batches` lifecycle transition, re-materialize `entity_period_outcomes` for affected entities. This is the D7 design — `total_payout`, `component_breakdown`, `rule_set_breakdown`, `lowest_lifecycle_state`, `materialized_at`. The trigger fires on lifecycle transition, not on every read.

If `entity_period_outcomes` IS populated: T3 wires reads directly. No trigger work needed.

Commit: `"T3: Compensation MSP complete — aggregate reads materialization-backed"`

---

## §3.T4 — INTEGRATION PROOF (sequential, after T1+T2+T3)

### §3.T4.1 — Objective

Prove the MSP invariant holds across all three agents, on real tenants, with sub-second aggregate page loads.

### §3.T4.2 — Proof procedure

**PG-1: Zero raw aggregate paths remain.**

```bash
echo "=== POST-MSP: Any remaining raw aggregate reads ==="
# Financial: no aggregate reads from committed_data
grep -rn "from('committed_data')\|from(\"committed_data\")" web/src/app/api/financial/ --include="*.ts" | grep -v "explorer\|drill\|detail\|cheque.*search\|BOUNDED"
# Intelligence: no JS-side multi-row aggregation in intelligence-data.ts
grep -n "\.reduce\|\.forEach.*push\|\.map.*total" web/src/lib/insights/intelligence-data.ts
# Compensation: no JS-side aggregation of calculation_results in serving surfaces
grep -rn "\.reduce\|\.forEach.*payout\|\.map.*total" web/src/app/**/perform/**/*.tsx web/src/app/**/my-compensation/**/*.tsx web/src/app/**/operate/**/*.tsx --include="*.tsx" 2>/dev/null | grep -v node_modules
echo ""
echo "Expected: zero lines for each section above"
```

Paste output. Zero lines for each section = PASS.

**PG-2: Financial sub-second (Sabor).** Start dev server. Load every Financial surface for Sabor. Paste the `POST /api/financial/data` timing from the dev server log. Every aggregate mode under 2 seconds.

**PG-3: Intelligence value-match (BCL).** Load `/stream` or `/insights` for BCL March. Paste the period total ($58,406) and component count (4) as rendered. Must match ground truth.

**PG-4: Compensation value-match (BCL).** Load the Compensation dashboard or statement for BCL. Per-period totals must match: Oct $44,590, Nov $46,291, Dec $61,986, Jan $47,545, Feb $53,215, Mar $58,406. Total $312,033.

**PG-5: Empirical performance comparison.** Re-run every surface measured in P0's baseline capture (§3.P0.6), using the same procedure (cold start + warm, same tenant). Record the after-state timings. Compile the full comparison table:

| Agent | Surface | Before Cold (ms) | After Cold (ms) | Improvement | Before Warm (ms) | After Warm (ms) | Improvement |
|---|---|---|---|---|---|---|---|

Calculate the improvement multiplier per surface (`before / after`). This table is mandatory in the completion report — it is the empirical proof of OB-237's delivered value. Every RAW path that was converted must show a measurable improvement. Any surface that does NOT show improvement is flagged as a finding.

**PG-6: Build clean.** `npm run build` exits 0. Paste last 10 lines of build output.

**PG-7: No regression on Financial rendered data.** Network Pulse for Sabor shows revenue (must be non-zero, previously $40,013,055.26 via HF-337 recognition). Timeline renders a multi-period chart (not empty). Staff shows entity rankings (not empty).

**PG-8: MSP Application Map completeness.** The P0 map in `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` accounts for every surface. No surface in the navigation exists without a row in the map.

Commit: `"T4: Integration proof — MSP invariant verified"`

---

## §4 — HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| **HALT-SCHEMA** | `financial_summary_daily` does not exist in the live database | Report table inventory. HALT for architect disposition. Do NOT create the table without architect approval — it may require a migration (SR-44). |
| **HALT-EMPTY** | `entity_period_outcomes` has zero rows for all tenants | Report. The D7 materialization trigger may not be wired. HALT for architect disposition: wire the trigger (extends T3 scope) or defer T3. |
| **HALT-T1-BEHAVIORAL** | Byte-match fails for a Financial mode (old-path ≠ new-path output) | Report both outputs. HALT. Do NOT delete the old path. The mismatch means either the summary is incomplete or the query shape is wrong. Architect dispositions. |
| **HALT-T2-BEHAVIORAL** | Value-match fails for an Intelligence function (BCL totals don't conserve) | Report both values. HALT. Same disposition pattern. |
| **HALT-T3-BEHAVIORAL** | Value-match fails for a Compensation surface (BCL period totals don't match ground truth) | Report both values. HALT. |
| **HALT-T1-COVERAGE** | `financial_summary_daily` doesn't cover the full period span the raw path aggregates (would silently change the answer) | Report the summary's date range vs. committed_data's date range. HALT. Architect dispositions: extend summary materialization or accept partial coverage. |
| **HALT-ZERO-RAW** | P0 discovery finds zero RAW paths across all agents | Report the full map. HALT. The invariant may already hold. Architect verifies. |
| **HALT-SHARED-FILE** | T1/T2/T3 discover a file that must be edited by more than one tier (violates file-disjoint contract) | Report the file path and both tiers' requirements. HALT. Architect partitions or sequences. |

HALT = stop execution on the halting tier. Report findings with pasted evidence. Continue other tiers if they are unblocked. Resume only on architect disposition.

---

## §5 — REPORTING DISCIPLINE

### §5.1 — Completion report

File: `docs/completion-reports/OB-237_COMPLETION_REPORT.md`

Structure (Rules 25–28):

1. **Commits** — SHA, message, files changed per commit.
2. **MSP Application Map** — the full P0 map, updated with final WIRED/RAW/BOUNDED status.
3. **Empirical performance comparison table** — the before/after timing table from P0 baseline + T4 re-measurement, with improvement multiplier per surface. This is the headline deliverable of the report.
4. **Byte-match / value-match evidence** — per surface, old value vs. new value, pasted.
5. **Timing evidence** — dev server log lines showing response times per Financial mode.
6. **Proof gates** — PG-1 through PG-8, each with PASS/FAIL and pasted evidence (grep output, timing, rendered values). No self-attestation.
7. **HALT dispositions** — any HALTs that fired, with architect disposition and resolution.
8. **Residuals** — anything discovered during execution that is out of scope (§6A applies).
9. **Compliance** — Architecture Decision Gate, Anti-Pattern Registry check, Scale analysis.

Created BEFORE final build, not after (Rule 25).

### §5.2 — PR

```bash
cd ~/spm-platform && \
gh pr create --base main --head ob-237-materialized-serving-path \
  --title "OB-237: Materialized Serving Path — universal render-from-materialization" \
  --body "## Materialized Serving Path (MSP)

Every aggregate visualization now reads from a pre-computed materialization.
Zero aggregate reads touch base rows at render time.

### Financial Agent
- All route handler modes wired to financial_summary_daily
- Timeline: 136s → sub-second
- Byte-match verified per mode on Sabor

### Intelligence Agent
- intelligence-data.ts aggregate functions: SQL-level or entity_period_outcomes
- Value-match verified on BCL ($58,406 / 4 components)

### Compensation Agent
- Rollup views wired to entity_period_outcomes
- Per-entity reads preserved (O(1), indexed)
- Value-match verified on BCL ($312,033 / 6 periods)

### Proof Gates: 8
See docs/completion-reports/OB-237_COMPLETION_REPORT.md"
```

---

## §6 — SCOPE BOUNDARIES

### §6.1 — IN SCOPE

- Every aggregate serving path across Financial, Intelligence, and Compensation agents.
- Wiring those paths to existing materializations.
- SQL-level aggregation replacement for JS-side multi-row reduce/map.
- Byte-match and value-match verification per surface.
- Pagination enforcement on row-level drill-through paths.
- `entity_period_outcomes` materialization trigger wiring IF and ONLY IF HALT-EMPTY fires and architect disposition says proceed.

### §6.2 — EXPLICITLY OUT OF SCOPE (named, not silently narrowed)

| Item | Reason for exclusion | Where it lives |
|---|---|---|
| **ChequeRowData removal / Korean Test on Financial route** (OB-231 Barrier 1) | Domain-agnosticism fix, not performance fix. Different invariant. | OB-231 (drafted, not dispatched) |
| **Module-gating / agent activation** (A2 two-layer gate) | Authorization + capability assessment. Requires IRA invocation. | Architect channel, pending IRA |
| **Comprehension-powered labels** (Wire 2) | Blocked on OB-235 production-verification (SAY-TODAY). | Post OB-235 verify |
| **OB-234 surface fan-out** (Tier-2 → Tier-3) | Surface design, not data-layer performance. | OB-234 (dispatched, in flight) |
| **Summary Engine materialization extension** | If a summary table needs NEW columns to support a mode, that is a materialization build, not a serving-path wire. P0 discovery will identify any gaps; they become named residuals. | Future HF, named in §6A |
| **Calculation engine changes** | MSP is serving-layer only. The calculation engine, import pipeline, SCI, and convergence layer are untouched. | N/A |
| **New summary table creation** | If `financial_summary_daily` doesn't exist (HALT-SCHEMA), creating it requires a Supabase migration (SR-44 architect-only). The directive HALTs. | Architect disposition at HALT |
| **Thermostat agent / anomaly detection** | DS-008-A1 scope, not built. | Future OB |
| **Pricing reconciliation** | Commercial artifact, not code. | Architect channel |

### §6A — RESIDUALS

Any RAW path discovered in P0 that cannot be wired to an existing materialization (because the materialization doesn't carry the required aggregation) is logged as a named residual in the completion report with: the surface name, the missing aggregation, and the materialization table that would need to be extended. These residuals become seeds for follow-on HFs. They are NOT silently absorbed into this OB's scope and NOT silently dropped.

---

*OB-237: Materialized Serving Path*
*2026-06-24 · vialuce.ai · Intelligence. Acceleration. Performance.*
*ULTRACODE / effort-mode native. P0 → T1 ║ T2 ║ T3 → T4.*
*Invariant: every aggregate reads a materialization. Zero re-derivation at render time.*
*Substrate: Decision 158 · Progressive Performance · End-State A · D7 · Korean Test*
*Proof tenants: Sabor (Financial, 263K rows) · BCL (Compensation/Intelligence, $312,033)*
*The file IS the prompt. Ends here.*
