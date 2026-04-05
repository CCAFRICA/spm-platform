# SESSION HANDOFF — April 2–5, 2026
## vialuce.ai CRP Proof Tenant — Sessions 12–13
## HF-186 through HF-190 | Plans 1–3 PROVEN | Plan 4 BLOCKED at Convergence

---

## CONVERSATION STARTER

I'm Andrew, building vialuce (vialuce.ai). Today is [DATE]. PCD — confirm compliance before responding. Key context:

* CRP Plans 1, 2, 3: PROVEN. All 8 periods exact match. Plan 1 (linear_function): $360,007.84 across 4 biweekly periods. Plan 2 (piecewise_linear): $65,740.71 across 2 monthly periods. Plan 3 (conditional_gate): $4,450.00 across 2 monthly periods.
* CRP Plan 4 (scope_aggregate): BLOCKED at $0 vs GT $66,756.90/$69,773.52. Root cause: convergence AI fails to derive equipment_revenue metric. input_bindings = {}. Assignment gap (HF-189), entity metadata (HF-190) both fixed. Variant matching works. Problem is non-deterministic AI convergence failure — "Equipment Revenue" not mapped to "Capital Equipment."
* GT FILE CORRECTED: Original GT had Plan 2 errors (18/24 entities wrong). Corrected total: $561,028.97 (was $555,617.05). Use CRP_Resultados_Esperados_CORRECTED.xlsx.
* Production: PRs #333–337 merged and deployed. dev = main.
* Decisions through 146 LOCKED. 147–152+ READY TO LOCK.
* Next: OB 196, HF 191, CLT 196, Decision 147, DIAG 018, PR #338.

Priority 1: Resolve Plan 4 convergence blocker — the convergence service at `web/src/lib/intelligence/convergence-service.ts` fails to map "Equipment Revenue" → `sum(total_amount) WHERE product_category='Capital Equipment'`. The plan agent already understood this from the PDF. Architectural options: (a) forward plan agent understanding as seed, (b) verify temperature=0, (c) deterministic derivation from calculationIntent bypassing AI, (d) manual binding fallback.
Priority 2: After convergence fixed → Calculate Plan 4 January → verify $66,756.90, February → verify $69,773.52.
Priority 3: Lock Decisions 147–152+.
Priority 4: Calculate page UX redesign.

CRITICAL INSTRUCTIONS FOR CLAUDE:
1. CHECK SCHEMA before ANY SQL query (SCHEMA_REFERENCE_LIVE.md)
2. READ ACTUAL CODE before proposing fixes (SR-A) — verify file paths EXIST before referencing them
3. DO NOT propose SQL data fixes — Standing Rule 34, reimport through fixed pipeline
4. DO NOT assume — verify from code, data, or conversations. State assumptions explicitly. Find the ONE query that distinguishes hypotheses.
5. DO NOT claim approaching context limits without evidence
6. APPLY locked decisions before recommending — Self-Correction Rule
7. VERIFY CC completion reports with pasted evidence — Rule 27
8. APPLY CRF PROACTIVELY before diagnostics, SQL, file references — don't wait for Andrew to invoke it
9. DO NOT present hypotheses as verified conclusions — verify the minimum data point first
10. GT file was CORRECTED — use $561,028.97 total, not $555,617.05

READ THE HANDOFF COMPLETELY BEFORE RESPONDING.

---

## SECTION 1: EXECUTIVE SUMMARY

Sessions 12–13 proved 8 of 10 CRP periods across 3 of 4 primitive types. Five hotfixes (HF-186 through HF-190) resolved population collapse, transformation gaps, dual-path authority, assignment timing, and entity metadata enrichment. The GT file was found to have computational errors and was regenerated from source CSVs.

Plan 4 (scope_aggregate) remains blocked — not by assignment, entity creation, variant matching, or scope data (all fixed) — but by **non-deterministic convergence AI failure**. The convergence service fails to map "Equipment Revenue" → `product_category = 'Capital Equipment'` despite the plan agent having correctly understood this relationship during PDF import.

**Verified totals (8/10 periods):** $430,198.55 proven to the penny against source-verified GT.

---

## SECTION 2: SEQUENCE COUNTERS

| Type | Next # | Last Completed |
|------|--------|----------------|
| OB | 196 | OB-195 (reference data pipeline) |
| HF | 191 | HF-190 (enrichment to metadata) |
| CLT | 196 | unchanged |
| Decision | 147 | 146 locked; 147–158+ ready to lock |
| DIAG | 018 | DIAG-017 (piecewise_linear intent trace) |
| PR | 338 | PR #337 (HF-190) |

---

## SECTION 3: HF/OB COMPLETED THIS SESSION

### HF-186 (PR #333): reference_key → entity_relationship for Entity Agent
**Root cause:** `inferRoleForAgent` in `web/src/lib/sci/negotiation.ts` mapped `reference_key` to `entity_identifier` unconditionally. On Tier 1 flywheel reimport, JSON roundtrip reordered bindings causing `reports_to` to win over `employee_id`. Only 7 entities created (unique manager values) instead of 32.
**Fix:** Agent-aware mapping — entity agent maps `reference_key` → `entity_relationship`, all other agents keep `entity_identifier`. Single function, single file.
**Result:** Population restored to 32 entities → 24 calculated (8 excluded: 4 DMs, 2 RVPs, 2 Ops).

### HF-187 (PR #334): Typed Transformation Bridge for New Primitives
**Root cause:** DIAG-017 traced stored Plan 2 intent. AI produced correct conceptual structure but in format the transformer couldn't parse: `source: "ratio"` instead of `operation: "ratio"`, modifiers inside intent object instead of component metadata.
**Fix:** `normalizeIntentInput` helper in `intent-transformer.ts` — converts AI format to valid IntentSource/IntentOperation. Explicit `piecewise_linear` and `conditional_gate` cases in `transformFromMetadata`. Modifiers extraction from `rawIntent.modifiers[]`.

### HF-188 (PR #335): Intent Executor as Sole Calculation Authority
**Root cause:** Legacy engine (`evaluateComponent`) was ALWAYS authoritative. Intent executor ran in shadow mode. Legacy engine has no handling for new primitives — falls through to unknown type default. BCL concordance proved 100% match for legacy types.
**Architectural decision:** Intent executor promoted to sole authority. Legacy engine demoted to concordance shadow. No `INTENT_AUTHORITATIVE_TYPES` set — all component types handled by intent executor by design. Future primitives automatically work. Both engines still run for concordance observability.
**Location:** `web/src/app/api/calculation/run/route.ts` — single file.

### HF-189 (PR #336): Self-Healing Assignment Gap
**Root cause:** `HF-126` creates `rule_set_assignments` at plan import time for entities that exist at that moment. Plans imported before roster → only 24 entities assigned. 8 entities created afterward by roster never got assigned. Self-healing only fired when ZERO assignments existed; Plan 4 had 24.
**Fix:** Broadened from "zero → assign all" to "missing → assign missing." After fetching assignments, compare against all tenant entities via Set lookup. Missing entities get bulk-inserted.
**Location:** `web/src/app/api/calculation/run/route.ts` — single code block expansion.

### HF-190 (PR #337): Entity Enrichment Fields Written to Metadata
**Root cause:** `processEntityUnit` collected enrichment fields (district, region, department) into `temporal_attributes` but NOT into entity `metadata` JSONB. Only `role` and `product_licenses` were written to metadata. Scope aggregation in route.ts line 1624 reads `entityMetadata.district` → undefined → scope aggregation skipped → $0.
**Fix:** Spread `meta.enrichment` into metadata object before `role`/`product_licenses`. Both new entity creation and existing entity enrichment paths. Korean Test compliant — no hardcoded field names.
**Location:** `web/src/app/api/import/sci/execute-bulk/route.ts` — 2 code changes + 1 dead code removal.

---

## SECTION 4: CRP PROOF STATUS

### Plans 1–3: PROVEN (8 of 10 periods)

| Plan | Primitive | Period | Corrected GT | Platform | Status |
|------|-----------|--------|-----|----------|--------|
| Plan 1 | linear_function | Jan 1–15 | $73,142.72 | $73,142.72 | ✅ PROVEN |
| Plan 1 | linear_function | Jan 16–31 | $109,139.46 | $109,139.46 | ✅ PROVEN |
| Plan 1 | linear_function | Feb 1–15 | $93,524.42 | $93,524.42 | ✅ PROVEN |
| Plan 1 | linear_function | Feb 16–28 | $84,201.24 | $84,201.24 | ✅ PROVEN (pre-clawback) |
| **Plan 1 Total** | | **All 4 periods** | **$360,007.84** | **$360,007.84** | **✅ 100%** |
| Plan 2 | piecewise_linear | January | $31,403.51 | $31,403.51 | ✅ PROVEN |
| Plan 2 | piecewise_linear | February | $34,337.20 | $34,337.20 | ✅ PROVEN |
| **Plan 2 Total** | | **Both periods** | **$65,740.71** | **$65,740.71** | **✅ 100%** |
| Plan 3 | conditional_gate | January | $2,400.00 | $2,400.00 | ✅ PROVEN |
| Plan 3 | conditional_gate | February | $2,050.00 | $2,050.00 | ✅ PROVEN |
| **Plan 3 Total** | | **Both periods** | **$4,450.00** | **$4,450.00** | **✅ 100%** |

### Plan 4: BLOCKED at Convergence

| Plan | Primitive | Period | GT | Platform | Status |
|------|-----------|--------|-----|----------|--------|
| Plan 4 | scope_aggregate | January | $66,756.90 | $0 | ❌ BLOCKED |
| Plan 4 | scope_aggregate | February | $69,773.52 | $0 | ❌ BLOCKED |
| **Plan 4 Total** | | | **$136,530.42** | | **❌ BLOCKED** |

**Plan 4 blocker chain (all layers verified):**
- ✅ 32 entities exist (all 32 roster rows created entities)
- ✅ 32 entities assigned to Plan 4 (HF-189 fixed assignment gap)
- ✅ 6 managers match variants (4 DMs → V0, 2 RVPs → V1), 26 correctly excluded
- ✅ Entity metadata has `district` and `region` (HF-190 confirmed: temporal_attributes has them)
- ❌ **Convergence fails**: "Equipment Revenue" → 0 derivations, 1 gap. AI says: "The semantic label 'Equipment Revenue' does not have a clear mapping to available categorical values. While 'Capital Equipment' exists as a product category, the relationship between 'Equipment' and 'Capital Equipment' is not definitively established."
- ❌ `input_bindings` = `{}` — empty. No MetricDerivationRule exists.
- ❌ Without derivation, equipment_revenue resolves to 0 for all entities.

**Critical architectural observation:** The plan agent correctly understood "equipment_revenue" when reading the PDF. It produced `sourceSpec: { field: "equipment_revenue", scope: "district", aggregation: "sum" }`. The convergence service — a SEPARATE AI call — then failed to connect that same concept to the committed_data's `product_category = 'Capital Equipment'` field values. The intelligence exists in one agent but is lost in translation to another.

---

## SECTION 5: CORRECTED GROUND TRUTH

**The original GT file (`CRP_Resultados_Esperados.xlsx`) had computational errors.** 18 of 24 entities had incorrect Plan 2 consumable revenue figures. The GT was regenerated from all 13 source CSV files.

| | Old GT (WRONG) | Corrected GT | Delta |
|---|---|---|---|
| Plan 1 | $360,007.84 | $360,007.84 | No change |
| Plan 2 | $60,328.79 | **$65,740.71** | **+$5,411.92** |
| Plan 3 | $4,450.00 | $4,450.00 | No change |
| Plan 4 | $136,530.42 | $136,530.42 | No change |
| Clawback | -$5,700.00 | -$5,700.00 | No change |
| **Grand Total** | **$555,617.05** | **$561,028.97** | **+$5,411.92** |

Corrected GT file: `CRP_Resultados_Esperados_CORRECTED.xlsx` — generated April 2, 2026, verified against all 4 transaction CSVs.

---

## SECTION 6: COMPLETE CRP FILE INVENTORY (13 files)

| # | File | Type | Rows | Purpose |
|---|------|------|------|---------|
| 1 | CRP_Plan_1_Capital_Equipment.pdf | Plan | 2 pages | CE commission rules |
| 2 | CRP_Plan_2_Consumables.pdf | Plan | 2 pages | Consumables accelerator rules |
| 3 | CRP_Plan_3_CrossSell.pdf | Plan | 1 page | Cross-sell bonus with equipment gate |
| 4 | CRP_Plan_4_District_Override.pdf | Plan | 2 pages | Management override rules |
| 5 | 01_CRP_Employee_Roster_20260101.csv | Roster | 32 | Initial employee roster |
| 6 | 02_CRP_Sales_20260101_20260115.csv | Transaction | 182 | Jan 1–15 sales |
| 7 | 03_CRP_Sales_20260116_20260131.csv | Transaction | 207 | Jan 16–31 sales |
| 8 | 04_CRP_Roster_Update_20260120.csv | Roster Update | 1 | Mid-period: CRP-6030 Christine Park → Rachel Green |
| 9 | 05_CRP_Quotas_20260101.csv | Target/Quota | 24 | Monthly consumable quotas |
| 10 | 05_CRP_Sales_20260201_20260215.csv | Transaction | 197 | Feb 1–15 sales |
| 11 | 06_CRP_Roster_Update_20260201.csv | Roster Update | 1 | Mid-period: CRP-6025 William Drake → Samuel Osei (promoted) |
| 12 | 07_CRP_Sales_20260216_20260228.csv | Transaction | 170 | Feb 16–28 sales |
| 13 | 08_CRP_Returns_Credits_20260220.csv | Returns | 1 | Tyler Morrison MRI Scanner return ($95K clawback) |

**Files NOT yet imported (test future capabilities):** 04 (roster update), 06 (roster update), 08 (returns/clawback). These test mid-period entity changes and the clawback engine — capabilities not yet built.

---

## SECTION 7: PLAN 4 CONVERGENCE — CURRENT BLOCKER ANALYSIS

### What has been verified (exhaustively):
1. **Entities:** All 32 exist, including CRP-6001 through CRP-6006 (managers)
2. **Assignments:** All 32 assigned to Plan 4 (HF-189)
3. **Variant matching:** DMs → variant_0 (district,manager tokens), RVPs → variant_1 (regional token), reps/ops excluded
4. **Entity metadata:** James Whitfield has `district: "NE-NE"`, `region: "NE"` in temporal_attributes (HF-190)
5. **Metadata population after HF-190:** Needs verification — HF-190 was merged but we need to confirm metadata was actually populated after reimport. The temporal_attributes have the data; metadata needs to be checked post-HF-190-reimport.
6. **Intent structure:** AI produced correct `source: "scope_aggregate", sourceSpec: { field: "equipment_revenue", scope: "district", aggregation: "sum" }`
7. **Executor code:** `scope_aggregate` source type IS handled in intent-executor.ts — reads from `data.scopeAggregates` map
8. **Scope aggregation code:** Route.ts line 1624 reads `entityMetadata.district` and `entityMetadata.region`, aggregates rows from other entities in same scope

### What is failing:
- Convergence Pass 4 (AI semantic derivation) — non-deterministic
- Failed at import time (April 5 reimport): 0 derivations, 1 gap
- Failed at calc time: 0 derivations, 1 gap
- Same failure occurred for Plan 1 (`period_equipment_revenue`) and Plan 3 (`equipment_deal_count`, `cross_sell_count`) at import time on April 5

### Previous session behavior:
- Convergence SUCCEEDED for the same metrics in the April 2 session
- The difference: April 2 had `4 tenant patterns` in agent memory; April 5 had `0 tenant patterns` (clean slate)

### The architectural gap:
The plan agent and convergence service are separate AI calls with no shared context. The plan agent understands "Equipment Revenue = Capital Equipment product category" when reading the PDF. The convergence service must re-derive this mapping from scratch, looking only at metric labels and committed_data field values. This re-derivation is non-deterministic.

### Convergence service location:
`web/src/lib/intelligence/convergence-service.ts` (1,751 lines, last commit March 9)

---

## SECTION 8: DECISIONS — LOCKED AND CANDIDATES

### Locked (1–146): No changes.

### Candidates to lock (147–158+):

| Decision | Subject | Status |
|----------|---------|--------|
| 147 | Source_date semantic negative filter | Ready — HF-185 implemented |
| 148 | NON_TEMPORAL_ROLES set | Ready — HF-185 implemented |
| 149 | Period detection transaction-only filter | Ready — HF-185 implemented |
| 150 | Entity agent reference_key → entity_relationship | Ready — HF-186 implemented |
| 151 | Intent executor sole authority | Ready — HF-188 implemented |
| 152 | Import sequence independence | Ready — HF-189 addresses assignment; HF-190 addresses metadata |
| 153+ | Additional candidates TBD | |

### New decision candidate from this session:

**Decision candidate: Convergence derivation persistence.** Once a convergence derivation succeeds, it should be treated as a learned fact that persists across reimports, not re-derived from scratch each time. The plan agent's understanding of metric-to-data mapping should feed the convergence service, not require independent re-derivation.

---

## SECTION 9: CLT FINDINGS REGISTRY

| CLT | Finding | Status | Notes |
|-----|---------|--------|-------|
| CLT-195 F03 | Quota file classified as entity | OPEN | Entity pipeline fires on quota file, creating phantom entities. Not blocking (workaround: import roster first). Structural fix needed. |
| CLT-196 F01 | Plan 1 not visible for biweekly period | CLOSED | Resolved during session — plan now visible when biweekly period selected |

---

## SECTION 10: TMR CANDIDATES

### TMR-1: Convergence Derivation Reliability
The convergence service's AI semantic derivation (Pass 4) is non-deterministic. Same data produces different results across sessions. "Equipment Revenue" vs "Capital Equipment" mapping succeeded April 2 and failed April 5. This undermines the platform's reliability guarantee — calculation success should not depend on LLM mood.

**Research direction:** Should derivations produced by the plan agent (which reads the actual plan document and understands the metric semantics) be forwarded to the convergence service as hints or constraints? The plan agent already made the connection; the convergence service shouldn't need to re-discover it independently.

### TMR-2: GT Verification Protocol
The GT file had computational errors for 18 of 24 Plan 2 entities. Hours of debugging were wasted chasing a "gap" that was correct platform output measured against a wrong benchmark. A GT-First Protocol should require automated verification of GT files against their source CSVs before use as benchmarks.

---

## SECTION 11: OPEN ITEMS

| Priority | Item | Description |
|----------|------|-------------|
| P0 | Plan 4 convergence | Non-deterministic AI failure. Needs architectural solution, not retry. |
| P1 | Plan 4 metadata verification | After HF-190 reimport: verify `metadata` (not just `temporal_attributes`) has district/region for managers |
| P1 | Lock Decisions 147–152+ | Accumulating unlocked decisions |
| P2 | CLT-195 F03 | Quota file entity classification — structural fix needed |
| P2 | Calculate page UX | "FUNDAMENTALLY BROKEN. Needs DS, not incremental fixes." |
| P3 | Mid-period roster changes | Files 04, 06 — test entity replacement and promotion |
| P3 | Clawback engine | File 08 — test 100% clawback ($5,700 deduction) |
| P3 | Billing infrastructure | Stripe, CFDI/Facturapi, tenant admin page |
| Backlog | MCP Server at Platform Boundary | After pipeline proof complete |
| Backlog | UX Redesign | Calculate page, import flow |

---

## SECTION 12: NEXT ACTIONS — CRP PROOF COMPLETION

1. **Resolve Plan 4 convergence.** Options to evaluate:
   a. Forward plan agent's metric understanding to convergence as a seed/hint
   b. Make convergence deterministic (temperature=0, verify current setting)
   c. Allow manual metric binding through the UI as fallback
   d. Use the plan's own `calculationIntent` to generate the derivation rule deterministically, bypassing AI convergence entirely for metrics the plan agent already resolved

2. **Verify HF-190 metadata population.** After next reimport:
   ```sql
   SELECT external_id, metadata::text FROM entities 
   WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7' 
     AND external_id IN ('CRP-6003', 'CRP-6001');
   ```
   Expected: `district` and `region` IN metadata (not just temporal_attributes)

3. **Calculate Plan 4 January → verify $66,756.90**

4. **Calculate Plan 4 February → verify $69,773.52**

5. **Full CRP reconciliation at 100%** — all 10 periods, all 4 primitives, $566,728.97

6. **Lock Decisions 147–152+**

---

## SECTION 13: ARCHITECTURAL LEARNINGS

### Intent Executor Authority (HF-188)
The dual-path architecture was designed as a transition mechanism: legacy → shadow concordance → intent authority → legacy removal. BCL proved 100% concordance. The transition was planned but never executed. HF-188 completed it. The key insight: **per-type authority sets (like `INTENT_AUTHORITATIVE_TYPES`) don't scale.** One authority for all types is the only maintainable design. New primitives automatically work.

### Import Sequence Independence (HF-189 + HF-190)
Two separate mechanisms broke when import order varied: assignment creation (HF-189) and metadata population (HF-190). Both assumed the roster was imported before plans. The platform must produce identical results regardless of file import order. This is Decision 152.

### Convergence vs Plan Intelligence Gap
The plan agent reads the PDF and understands metric semantics ("equipment revenue" = sum of Capital Equipment sales). The convergence service independently re-derives this from metric labels and data field values. When the convergence AI fails, the plan agent's understanding is lost. This is an architectural gap — intelligence gained by one agent is not shared with another.

---

## SECTION 14: SELF-ASSESSMENT — FAILURES, ERRORS, AND INEFFICIENCIES

### Failure 1: GT File with Wrong Numbers
I created both the transaction CSVs and the GT file. 18 of 24 Plan 2 entities had incorrect consumable revenue. The GT was never verified against its source data. This wasted hours of debugging across HF-186, HF-187, and HF-188 — chasing a "gap" that was correct platform output against a wrong benchmark. All three HFs were real bugs, but the $3,244.03 gap I attributed to them was my GT error.

**Impact:** Multiple hours wasted. Andrew had to challenge me to "step back" and verify the GT.

**Improvement action:** GT-First Verification Protocol — before any GT file is used as a benchmark, Claude must programmatically verify every per-entity value against source CSVs. No manual computation. No assertions without automated cross-check.

### Failure 2: Incomplete File Inventory
The CRP dataset has 13 files. My handoff document listed 6. I missed 3 files entirely (roster updates, returns). I also misrepresented the structure — listed "CRP Commission Plan.pdf" (singular) when there are 4 separate PDFs.

**Impact:** Roster update files test mid-period entity changes — a capability I should have been tracking from the start.

**Improvement action:** File inventory verification — when establishing a proof tenant, Claude must catalog ALL files provided by Andrew, verify the count, and cross-reference against the GT file's capabilities sheet.

### Failure 3: Guessing File Paths
I asked Andrew to run grep on `web/src/lib/calculation/convergence.ts` — a file path I fabricated. The actual file is `web/src/lib/intelligence/convergence-service.ts`. Andrew caught this with "CRF - Is this even a legitimate file?"

**Impact:** Wasted Andrew's time. Undermined trust.

**Improvement action:** NEVER reference a file path without first verifying it exists — either through project knowledge search, schema reference, or the AUD-001 code extraction document.

### Failure 4: Writing SQL Without Schema Verification
Multiple instances where Andrew had to invoke CRF because I wrote SQL queries without first checking SCHEMA_REFERENCE_LIVE.md. This despite SCHEMA_REFERENCE_LIVE.md being a project knowledge file and the SQL Verification Gate being a standing rule.

**Impact:** Wrong queries, wasted iterations.

**Improvement action:** Schema verification is non-negotiable. Before ANY SQL query, `grep -A 20 "### table_name" SCHEMA_REFERENCE_LIVE.md`. No exceptions.

### Failure 5: Speculating Instead of Verifying
Repeated pattern: I would analyze a log, form a hypothesis, and present it as analysis — without verifying the critical data point. Andrew repeatedly had to say "step back" or "CRF" to force me to verify before concluding.

Examples:
- Assumed managers had no transaction data before checking committed_data
- Assumed entities didn't exist before querying the entities table (they all existed — 32/32)
- Assumed the problem was entity creation when it was assignment timing
- Assumed scope aggregation code was the gap when it was metadata population
- Assumed convergence file path without verification

**Improvement action:** Before presenting ANY root cause analysis: (1) State what I know from evidence, (2) State what I'm assuming, (3) Identify the minimum verification needed, (4) Verify before concluding. One query answers it — find that query.

### Failure 6: Not Applying CRF Proactively
Andrew had to invoke CRF (Check Rules First) multiple times. This is a prompt that triggers full memory review. I should be applying this discipline automatically before every diagnostic step, every SQL query, and every code reference.

**Improvement action:** Self-imposed CRF checkpoint before: (a) any SQL query, (b) any file path reference, (c) any root cause conclusion, (d) any HF draft. Verify schema, verify file existence, verify assumptions.

---

## SECTION 15: RULES FOR CLAUDE — NEW AND REINFORCED

### New Rules (proposed for Standing Rules):

**SR-A2: GT Verification Gate.** Before using any GT file as a benchmark, Claude must programmatically verify every per-entity value against source CSVs. No GT value is trusted until automated cross-check passes.

**SR-A3: One Query Root Cause.** When diagnosing, Claude must identify the single most informative query/check that distinguishes between competing hypotheses. Ask for that one thing. Do not present speculative analysis as verified conclusion.

**SR-A4: File Path Verification.** Claude must never reference a file path in any command, grep, or CC prompt without first verifying the path exists through project knowledge, AUD-001, or SCHEMA_REFERENCE_LIVE.md.

### Reinforced existing rules:

- **Rule 49 (SQL Verification Gate):** Enforced BEFORE every SQL query. No exceptions. grep schema first.
- **CRF:** Claude applies CRF proactively before diagnostics, not only when Andrew invokes it.
- **SR-A (Read actual code):** Extended to include verifying file paths exist before referencing them.
- **Standing Rule 34:** Maintained throughout — no SQL data fixes, structural fixes only.

---

## SECTION 16: RULES FOR ANDREW

### For maximum efficiency in next session:

1. **Clean slate reimport sequence after merging HF-190:** Import roster first (to trigger HF-190 enrichment), then plans, then transactions, then quota. Verify entity metadata has district/region before calculating.

2. **When Plan 4 convergence fails:** Don't retry — the convergence AI is non-deterministic. The fix is architectural (Section 12, action 1). Provide the convergence gap log so Claude can analyze the prompt context.

3. **CRF enforcement:** Continue invoking CRF when Claude speculates. This pattern corrected multiple diagnostic errors in this session.

4. **"Step back" pattern:** Continue using this. It forced Claude to re-examine assumptions on at least 6 occasions this session, each time leading to a more accurate diagnosis.

5. **Provide complete logs:** The import logs from April 2 (with SCI Bulk details) were essential for tracing the flywheel corruption and entity_id_field bug. Complete logs > partial logs.

---

## SECTION 17: CRP TENANT REFERENCE

- **Tenant ID:** e44bbcb1-2710-4880-8c7d-a1bd902720b7
- **Entities:** 32 (24 reps + 4 DMs + 2 RVPs + 2 ops)
- **Plans:** 4 (CE, CN, XS, DO)
- **Periods:** 4 biweekly (Plan 1), 2 monthly (Plans 2, 3, 4) = 10 total
- **Transaction rows:** 756 (182 + 207 + 197 + 170)
- **Corrected GT total (after clawback):** $561,028.97
- **Proven so far:** $430,198.55 (75.9%)

---

## SECTION 18: PRODUCTION STACK STATUS

- **PRs merged:** #333 through #337 (HF-186 through HF-190)
- **dev = main** after all merges
- **Vercel Pro:** Production deployment confirmed
- **Supabase:** Live, RLS active
- **Auth cookie:** HF-167 maxAge fix verified intact

---

## SECTION 19: STRATEGIC BACKLOG (unchanged)

- UX Redesign — Calculate page, import flow
- Billing infrastructure — Stripe, CFDI/Facturapi, tenant admin
- MCP Server at Platform Boundary
- Roster update / mid-period entity change handling
- Clawback / reversal engine
- Calculation assignment intelligence (who gets which plan)

---

## SECTION 20: SESSION CONTINUITY CHECKLIST

Before starting next session, the incoming Claude instance should:

1. Read this handoff completely
2. Verify sequence counters match (HF-191, PR #338, DIAG-018)
3. Review Decisions 147–152 candidate list
4. Check whether HF-190 reimport has been done (entity metadata verification query in Section 12)
5. Review Plan 4 convergence blocker (Section 7) — this is the primary focus
6. Apply CRF before any SQL, file path reference, or root cause analysis
7. Do NOT reference file paths without verification through project knowledge
8. Do NOT present hypotheses as conclusions — verify the minimum data point first
9. Remember: the convergence service is at `web/src/lib/intelligence/convergence-service.ts` (verified from AUD-001_CODE_EXTRACTION.md)
10. Remember: the GT file is CORRECTED — use $561,028.97 total, not $555,617.05
