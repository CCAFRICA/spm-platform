# CLT-113 DATABASE TRUTH REPORT
Generated: 2026-02-28
Source: Live Supabase queries (bayqxeiltnpjrvflksfa.supabase.co)

---

## TENANT: Mexican Bank Co (MBC)
  ID: fa6a48c5-56dc-416d-9b7d-9c93d4882251
  Slug: mexican-bank-co
  Locale: es-MX
  Currency: MXN
  Features: {"coaching":false,"learning":false,"apiAccess":false,"mobileApp":false,"forecasting":false,"performance":true,"compensation":true,"gamification":false,"salesFinance":true,"transactions":true,"whatsappIntegration":false}
  **NOTE: No "financial" key. No "primary_module" key. No "icm" key.**

  Entities: 25
  Periods: 4 — December 2023 (2023-12), January 2024 (2024-01), February 2024 (2024-02), March 2024 (2024-03)

  Rule Sets: **18 total** (massive duplication)
    Active (5):
      - CFG Insurance Referral Program 2024 (59146196...)
      - Consumer Lending Commission Plan 2024 (9ab2c0d1...)
      - Deposit Growth Incentive — Q1 2024 (ecc2507b...)
      - Insurance Referral Program 2024 (574faa83...)
      - Mortgage Origination Bonus Plan 2024 (af511146...)
    Archived (13): Duplicates of the above with archived status
    **CRITICAL: 5 active plans, not 4. "CFG Insurance Referral" and "Insurance Referral" are BOTH active.**
    **CRITICAL: ALL input_bindings are NULL across all active rule sets.**

  Assignments: 50 (25 entities assigned to 2 rule sets)
  Committed Data: 1,661 rows across 25 entities and 4 periods

  Calculation Results: 25
    Calculated entities: 25
    Calculated periods: 1
    Calculated rule sets: 1 (af511146... = Mortgage Origination Bonus Plan 2024)
    **Total payout sum: $0.00**
    **ROOT CAUSE: metricValue=0 in every result. Engine expects "quarterly_mortgage_origination_volume" but input_bindings is NULL — no mapping from committed_data fields to component metrics.**

  Calculation Batches: 1 (PREVIEW state)
  Import Batches: 10 completed
    Files: CFG_Loan_Defaults_Q1_2024.csv, CFG_Loan_Disbursements_Jan2024.csv, CFG_Insurance_Referrals_Q1_2024.csv, CFG_Personnel_Q1_2024.xlsx, CFG_Loan_Disbursements_Feb2024.csv, CFG_Mortgage_Closings_Q1_2024.csv, CFG_Loan_Disbursements_Mar2024.csv, CFG_Deposit_Balances_Q1_2024.csv

  Sample committed_data row_data keys (Personnel type):
    name, role, Email, Title, email, Branch, Region, Status, region, status, storeId, HireDate, LastName, entityId, FirstName, _rowIndex, hire_date, BranchName, EmployeeID, _sheetName, branch_name, ProductLicenses, product_licenses

  Sample calculation_results.metrics:
    date, rate, amount, entityId, quantity, OfficerID, _rowIndex, LoanAmount, Term_Months, InterestRate, DisbursementDate
    **These are raw field values, NOT semantic metric names.**

---

## TENANT: Optica Luminar
  ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Slug: optica-luminar
  Locale: es-MX
  Currency: MXN
  Features: {"sandbox":true,"disputes":true,"performance":true,"compensation":true,"reconciliation":true}
  **NOTE: No "financial" key. No "primary_module" key.**

  Entities: 22,237
  Periods: 8 — January 2024 through July 2024, plus Febrero 2026

  Rule Sets: 2
    - Imported Plan (active, 7657fc95...)
    - Plan de Comisiones Optica Luminar 2026 (archived, b1b2c3d4...)

  Assignments: 1,000 (1,000 entities assigned to 2 rule sets)
  Committed Data: 238,276 rows across 1,000 entities and 1 period

  Calculation Results: 3,607
    Calculated entities: 731
    Calculated periods: 3
    Calculated rule sets: 2
    **Total payout sum: $4,192,522,508.96**
    **NOTE: Previous memory said ~$1,253,832. Current total is $4.19B — suggests multiple calculation runs or data scale change.**

  Calculation Batches: 6 (4 DRAFT, 1 PREVIEW, 1 PUBLISHED)
  Import Batches: 3 completed
    Files: optica_luminar_febrero_2026.xlsx, BacktTest_Optometrista_mar2025_Proveedores.xlsx

---

## TENANT: Sabor Grupo Gastronomico
  ID: 10000000-0001-0000-0000-000000000001
  Slug: sabor-grupo
  Locale: es-MX
  Currency: MXN
  Features: {"disputes":true,"financial":true,"performance":true,"compensation":true,"reconciliation":true}
  **NOTE: Has "financial":true. No "primary_module" key. Has "compensation":true also.**

  Entities: 64
  Periods: 1 — Enero 2024 (2024-01)

  Rule Sets: 2
    - Comision por Ventas - Meseros (active, 10000000...)
    - Indice de Desempeno - Sabor Grupo Gastronomico (active, 10000000...)

  Assignments: 80 (40 entities assigned to 2 rule sets)
  Committed Data: 47,051 rows across 11 entities and 1 period

  Calculation Results: **0** — No calculations have ever been run
  Calculation Batches: **0** — No batches exist
  Import Batches: 1 completed
    Files: sabor_grupo_enero_2024_pos.csv

---

## CRITICAL CROSS-TENANT OBSERVATIONS

1. **Feature JSONB inconsistency**: No tenant has "primary_module" or "icm" key. HF-076 routing code may be checking keys that don't exist.
2. **MBC rule set duplication**: 18 rule sets where 5 unique names × versions exist. 13 are archived. UI may show all 18 or filter incorrectly.
3. **MBC $0.00 root cause**: input_bindings is NULL on every rule set. The engine has component definitions but NO bindings to map committed_data fields → component metrics.
4. **Sabor has financial:true but also compensation:true**: Routing logic needs to handle this overlap.
5. **Optica payout seems inflated**: $4.19B suggests either calculation scale issue or intentional test data.
6. **Sabor has never run calculation**: Zero batches, zero results, despite having 47K committed data rows.

---

## PHASE 2: CONFIDENCE SCORE TRUTH — TRACE THE 50%

### Full Trace: UI → Source

```
UI displays: "50% confidence" on per-file cards and overall analysis
  ↑ Rendered at: enhanced/page.tsx:2807 — variable: pf.analysisConfidence (per-file)
  ↑ Rendered at: enhanced/page.tsx:2774 — variable: analysisConfidence (overall)
  ↑ Set at: enhanced/page.tsx:1591 — expression: result.confidence || 0 (per-file)
  ↑ Set at: enhanced/page.tsx:1627 — expression: mergedAnalysis.overallConfidence (multi-file average)
  ↑ Comes from: analyze-workbook/route.ts:187 — expression: response.confidence * 100
  ↑ Comes from: ai-service.ts:93 — adapterResponse.confidence (spread from adapter)
  ↑ SET AT: anthropic-adapter.ts:630 — THE SOURCE:

    const confidence = (result.confidence as number) / 100 || 0.5;

    When AI returns confidence 85: 85/100 = 0.85 → works correctly
    When AI returns confidence 0 or undefined: 0/100 = 0 → 0 || 0.5 = 0.5
    Then route.ts:187 multiplies: 0.5 * 100 = 50
```

### ROOT CAUSE: anthropic-adapter.ts:630

The `|| 0.5` operator is a **JavaScript falsy fallback**. It triggers when:
- AI doesn't return a top-level `confidence` field in JSON (returns `undefined`)
- AI returns `confidence: 0` (falsy)
- JSON parsing fails to extract the field

The AI prompt for `workbook_analysis` asks for `"confidence": 0-100` in the response JSON schema. But the AI sometimes omits it or nests it differently. When that happens, `(undefined as number) / 100` = `NaN`, and `NaN || 0.5` = `0.5`.

**This is AP-7 (Never hardcode confidence scores) — the 0.5 default IS the hardcoded 50%.**

### What OB-113 Actually Changed

OB-113 made these confidence-related changes:
1. Changed approve threshold from `>= 50` to `>= 60` — **correct but irrelevant to 50% source**
2. Changed "Quality" label to "AI Confidence" — **display only**
3. Changed consistency score from hardcoded 95 to real calculation — **correct, addresses different metric**
4. Changed validate page to show `analysisConfidence` — **display only**

**OB-113 did NOT touch:**
- `anthropic-adapter.ts:630` — the `|| 0.5` fallback that produces 50%
- The API route that multiplies confidence by 100
- The AI prompt to ensure confidence is always returned
- Per-file card rendering (line 2807) which shows `pf.analysisConfidence`

**Verdict: OB-113 touched the DISPLAY of confidence, not the SOURCE of 50%.**

### Per-Sheet Classification Confidence (Different Variable)

The per-sheet badges at line 2556 show `sheet.classificationConfidence`:
```tsx
{(sheet.classificationConfidence || 0) > 0 ? `${sheet.classificationConfidence}%` : (isSpanish ? 'IA' : 'AI')}
```
This comes from the AI's per-sheet response (not the top-level confidence). When classificationConfidence is 0 or missing, it falls back to showing "AI" text instead of a number. This is a different pathway but also subject to AI output variability.

### FIX LOCATION

**File**: `web/src/lib/ai/providers/anthropic-adapter.ts`
**Line**: 630
**Change**: `const confidence = (result.confidence as number) / 100 || 0.5;`
**To**: `const confidence = typeof result.confidence === 'number' && result.confidence > 0 ? result.confidence / 100 : 0;`

This eliminates the 0.5 default. When AI doesn't return confidence, it should be 0 (unknown), not 0.5 (fake 50%). The UI already handles 0 by showing "AI" text.

---

## PHASE 3: PLAN CONTEXT TRUTH — WHY WRONG PLAN EVERYWHERE

### Plan Selection Logic

**State**: `enhanced/page.tsx:1149` — `const [activePlan, setActivePlan] = useState<RuleSetConfig | null>(null);`

**Load**: `enhanced/page.tsx:1191-1205` — useEffect on mount:
```
getRuleSets(tenantId)                              // rule-set-service.ts:96-116
  → supabase.from('rule_sets').select('*')         // NO order, NO status filter
    .eq('tenant_id', tenantId)
  → plans.filter(p => p.status === 'active')       // Client-side active filter
  → activePlans[0]                                 // FIRST in Supabase default order
  → setActivePlan(first)
```

**Selection UI**: `enhanced/page.tsx:2871-2876` — dropdown that lets user change plan. But defaults to `activePlans[0]` on load.

### MBC Active Plans in Supabase Default Order

```
[0] CFG Insurance Referral Program 2024  (59146196... created 2026-02-27 02:09:43)
[1] Deposit Growth Incentive — Q1 2024   (ecc2507b... created 2026-02-27 02:10:06)
[2] Mortgage Origination Bonus Plan 2024 (af511146... created 2026-02-27 02:10:46)
[3] Consumer Lending Commission Plan 2024 (9ab2c0d1... created 2026-02-27 02:08:18)
[4] Insurance Referral Program 2024      (574faa83... created 2026-02-26 17:24:29)
```

**activePlans[0] = "CFG Insurance Referral Program 2024"** — This is the wrong plan for deposit data imports.

### Why 5 Active Plans Instead of 4

MBC has TWO active insurance referral plans:
- "CFG Insurance Referral Program 2024" (59146196...) — created 2026-02-27 02:09
- "Insurance Referral Program 2024" (574faa83...) — created 2026-02-26 17:24

These appear to be duplicate plans from separate import sessions. The "CFG" prefix version was created during the multi-file import (OB-111), while the non-prefixed version was from an earlier session.

**Expected**: 4 unique plans (Deposit Growth, Mortgage Origination, Consumer Lending, Insurance Referral)
**Actual**: 5 active plans (the 4 above + a duplicate insurance referral)

### Root Cause Chain

1. **No ORDER BY on rule_sets query**: `rule-set-service.ts:106-108` — Supabase returns in insertion order, making plan selection non-deterministic
2. **First-in-array selection**: `enhanced/page.tsx:1197` — `activePlans[0]` is always the first in Supabase order, not the most relevant for the data being imported
3. **No data→plan matching**: The import page doesn't analyze the uploaded files to auto-select the matching plan. User must manually switch.
4. **Duplicate active plans**: Plan import doesn't deduplicate — each import creates a new row regardless of whether an identical plan name already exists as active.

### Impact

- All metrics on Validate and Approve pages reference the wrong plan's components
- Calculation preview uses wrong plan's tiers/rates
- Field mapping targets wrong plan's expected fields
- User must manually select the correct plan from dropdown every time

---

## PHASE 4: VALIDATE/APPROVE PAGE TRUTH — WHAT'S FAKE, WHAT'S REAL

### Validate Page Metrics

| Displayed Metric | File:Line | Source Expression | Real or Fake? | Notes |
|---|---|---|---|---|
| Records count | page.tsx:3573 | `(analysis?.sheets \|\| []).reduce((sum, s) => sum + s.rowCount, 0)` | **REAL** | From AI analysis of actual sheets |
| Fields Mapped (N/M) | page.tsx:3582-3583 | `fieldMappings.reduce(mapped/total)` | **REAL** | Actual mapping state |
| Periods | page.tsx:3591 | `validationResult.detectedPeriods?.periods.length` | **REAL** | From HF-053 period detection |
| AI Confidence | page.tsx:3599 | `analysisConfidence` | **REAL-ISH** | Source is real but value may be 50% due to adapter fallback (Phase 2 finding) |
| Unmapped columns | page.tsx:3609-3610 | `fieldMappings.flatMap(m => m.mappings.filter(f => !f.targetField))` | **REAL** | Actual unmapped fields |
| Validation issues | page.tsx:3641-3651 | `validationResult.sheetScores.flatMap(score => score.issues)` | **REAL** | Real issues from validation |
| Per-sheet field count | page.tsx:3678 | `mappedCount/totalCount` | **REAL** | Actual per-sheet mapping counts |
| Per-sheet issue badges | page.tsx:3679-3689 | `score.issues.length` | **REAL** | Real issue count |
| Completeness score | page.tsx:1728-1730 | `requiredMapped.length / totalRequired * 100` | **REAL** | Ratio of required fields mapped |
| Validity score | page.tsx:1754-1756 | `(1 - nullCount / totalCells) * 100` | **REAL** | Non-null cell percentage from sample rows |
| Consistency score | page.tsx:1770-1789 | OB-113 real type check | **REAL** | OB-113 fixed this (was hardcoded 95) |
| Overall quality | page.tsx:1816-1817 | `0.3*completeness + 0.4*validity + 0.3*consistency` | **REAL** | Weighted average, now uses real consistency |
| Calculation Preview values | page.tsx:1986,1995 | `Math.random() * 1500`, hardcoded tier lookup | **FAKE** | Uses random numbers and hardcoded thresholds, not real calculation engine |

### Approve Page Metrics

| Displayed Metric | File:Line | Source Expression | Real or Fake? | Notes |
|---|---|---|---|---|
| Per-file confidence % | page.tsx:4103 | `Math.round(pf.analysisConfidence)` | **REAL-ISH** | May be 50% due to adapter fallback |
| Per-file rows | page.tsx:4091 | `pf.sheets.reduce((s, sh) => s + sh.rowCount, 0)` | **REAL** | From parsed file data |
| Per-file fields | page.tsx:4098 | `confidentMappings/totalMappings` | **REAL** | Field count at ≥60% confidence |
| Sheets count | page.tsx:4125 | `analysis.sheets.length` | **REAL** | Actual sheet count |
| Records count | page.tsx:4132 | `analysis.sheets.reduce(sum + rowCount)` | **REAL** | Same as validate |
| Mapped Fields | page.tsx:4140 | `fieldMappings.reduce(mapped count)` | **REAL** | Same as validate |
| AI Confidence | page.tsx:4152 | `analysisConfidence` | **REAL-ISH** | Three-tier coloring (OB-113), but value may be 50% |
| Sheet Breakdown | page.tsx:4166-4206 | Per-sheet rows, mapped/preserved counts, component match | **REAL** | Real per-sheet data |
| Active Plan name | page.tsx:4213+ | `activePlan.name` | **REAL but WRONG PLAN** | Shows whatever activePlans[0] is (Phase 3 finding) |

### Complete Step Metrics (Post-Commit)

| Displayed Metric | File:Line | Source Expression | Real or Fake? |
|---|---|---|---|
| Record count | page.tsx:4344 | `importResult.recordCount` | **REAL** — from commit API response |
| Entity count | page.tsx:4350 | `importResult.entityCount` | **REAL** — OB-112 fixed (Math.max) |
| Period count | page.tsx:4356 | `importResult.periodCount` | **REAL** — OB-112 fixed (dedup) |
| Assignment count | page.tsx:4372 | `importResult.assignmentCount` | **REAL** — OB-112 added |
| Data Quality % | page.tsx:4381 | `validationResult?.overallScore \|\| analysisConfidence` | **MIXED** — uses overallScore first (real weighted average) but label says "Data Quality" not "AI Confidence" |

### OB-113 Gap Analysis

**What OB-113 fixed:**
- Removed fake "Quality score: X%" banner from validate step ✓
- Replaced fake per-sheet quality bars with real field/issue counts ✓
- Changed approve page "Quality" label to "AI Confidence" ✓
- Changed threshold from 50% to 60% ✓
- Made consistency score real instead of hardcoded 95% ✓

**What OB-113 did NOT fix:**
- Complete step (line 4381) still uses `validationResult?.overallScore` with "Data Quality" label
- Calculation Preview still uses random/hardcoded values (line 1986: `Math.random()`)
- All confidence values still subject to 50% adapter fallback (anthropic-adapter.ts:630)
- Plan context still wrong (Phase 3 finding — unrelated to OB-113 scope)

---

## PHASE 5: CALCULATION PIPELINE TRUTH — WHY $0.00

### MBC Calculation State

- **1 calculation batch** exists (lifecycle_state: PREVIEW)
- **25 calculation results** — all with `total_payout: 0.0`
- **Only 1 rule set calculated**: Mortgage Origination Bonus Plan 2024 (af511146...)
- **Only 1 period**: 251c00c3... (one of the 4 periods)

### The $0.00 Trace

```
Engine expects: metrics["quarterly_mortgage_origination_volume"]
  ↑ From: component.tierConfig.metric (run-calculation.ts:329)
  ↑ Component: Mortgage Origination Bonus (tier_lookup type)
  ↑ Rule set: Mortgage Origination Bonus Plan 2024

Engine finds in committed_data (aggregated via aggregateMetrics):
  DisbursementDate, InterestRate, LoanAmount, OfficerID, Term_Months,
  _rowIndex, amount, date, entityId, quantity, rate

Engine resolves:
  1. metrics["quarterly_mortgage_origination_volume"] → undefined
  2. metrics["attainment"] → undefined
  3. metricValue = 0 (fallback at run-calculation.ts:63)

Tier lookup (evaluateTierLookup, line 62-85):
  metricValue=0 → matches tier "Up to MXN 5,000,000" [0-5M]
  tier.value = 0.002 (the RATE, not a fixed amount)
  payout = 0.002

But total_payout in DB = 0.0 (discrepancy with component payout 0.002)
```

### The Semantic Binding Gap

This is the core architectural issue:

```
PLAN COMPONENT                    COMMITTED DATA ROW_DATA
quarterly_mortgage_origination_volume    →    ???
                                              LoanAmount: 3,036,733.58
                                              InterestRate: 422.9
                                              Term_Months: 690
                                              DisbursementDate: 951476
                                              OfficerID: 21105
```

**There is NO layer that maps `LoanAmount` → `quarterly_mortgage_origination_volume`.**

The plan says "look up the metric called quarterly_mortgage_origination_volume in a tier table." The data has `LoanAmount` (the actual mortgage origination amount). But nothing tells the engine that `LoanAmount` IS `quarterly_mortgage_origination_volume`.

### Why Optica Works But MBC Doesn't

**Optica's data flow:**
- import → AI classifies sheets → sheet names match component patterns (e.g., "Venta_Individual" matches optical/sales patterns)
- `findMatchingSheet` (line 282-322) matches using SHEET_COMPONENT_PATTERNS (regex patterns for optical industry)
- `aggregateMetrics` sums numeric fields → produces keys like "amount", "quantity", "attainment"
- Component metrics use generic names like "attainment" which exist in the aggregated data

**MBC's data flow:**
- import → AI classifies → BUT all CSVs get data_type "Sheet1" (generic CSV default)
- `findMatchingSheet("Mortgage Origination Bonus", ["Sheet1", "Personnel"])` → no match
- Even if sheet matched, `aggregateMetrics` produces `LoanAmount`, `InterestRate` — NOT `quarterly_mortgage_origination_volume`
- The metric name in the plan component is a BUSINESS concept, not a field name from the data

### input_bindings: The Missing Link

The `rule_sets.input_bindings` column (SCHEMA_REFERENCE.md:100) was designed for exactly this purpose:

```json
// WHAT input_bindings SHOULD contain:
{
  "quarterly_mortgage_origination_volume": {
    "source_field": "LoanAmount",
    "aggregation": "sum",
    "period_scope": "quarterly"
  }
}
```

But for MBC, `input_bindings` is NULL/empty `{}` on ALL 5 active rule sets.

The plan import (AI interpretation) creates component definitions with semantic metric names but NEVER populates input_bindings to map those names to actual data fields. This gap means the engine can never resolve metrics for any tenant whose data field names don't happen to match the component's metric names exactly.

### Why the Engine Still Ran (and Produced Results)

- `findMatchingSheet` at line 300-306 does fuzzy name matching: `normSheet.includes(normComponent)` or `normComponent.includes(normSheet)`
- "Sheet1" doesn't contain "mortgage_origination_bonus" → no match
- BUT the engine still runs — it just produces empty metrics for the component
- With empty metrics, tier lookup evaluates `0` and matches the first tier
- The payout (0.002 rate) gets stored but total_payout = 0.0

### Optica Regression Check

```
Optica results: 3,607
Total payout: $4,192,522,508.96
```

Previous expected: 719 results, ~$1,253,832. The current data shows significantly more results and higher totals — likely from additional calculation runs against new data (febrero 2026 import).

### MBC Committed Data Structure

```
data_type: "Personnel" — 50 rows (employee roster)
data_type: "Sheet1" — 1,611 rows (ALL financial data lumped together)
```

8 CSV files were imported but all got data_type "Sheet1" because CSV files don't have real sheet names (XLSX.js defaults to "Sheet1"). There's no way to distinguish deposit data from mortgage data from insurance data — it's all "Sheet1".

### Root Cause Summary

| Root Cause | Layer | Fix Type |
|-----------|-------|----------|
| input_bindings NULL on all rule sets | Data | Requires semantic binding layer in plan import |
| Component metrics use business concepts, data has raw field names | Architecture | Need binding resolution: plan metric → data field |
| CSV files all get data_type "Sheet1" | Import pipeline | Per-file data_type should use AI classification, not XLSX.js default |
| findMatchingSheet can't match "Sheet1" to any component | Calculation | Needs input_bindings or AI context to resolve |
| No per-file data_type differentiation | Import commit | Multi-file import should tag each file's committed_data with the classified type |

---

## PHASE 1: ROUTING TRUTH — WHERE DOES EACH TENANT ACTUALLY LAND?

### Routing Code Location

**Primary routing**: `web/src/app/operate/page.tsx:402-443` (HF-076 Decision 57)

Logic chain:
1. Line 395: `hasICM = ruleSetCount > 0` (from session-context)
2. Line 393: `hasFinancial = useFeature('financial')` (checks tenant.features.financial)
3. Line 408: `if (hasFinancial && !hasICM)` → redirect to `/financial`
4. Line 415: `if (hasFinancial && hasICM)` → check recent activity, redirect to `/financial` if no calc batches
5. Line 427: `if (hasICM && pipelineData.latestBatch)` → redirect to `/admin/launch/calculate`
6. Line 434: `if (hasICM && pipelineData.dataRowCount > 0)` → redirect to `/data/import/enhanced`
7. Line 441: fallthrough → redirect to `/data/import/enhanced`

**useFinancialOnly hook**: `web/src/hooks/use-financial-only.ts:15-21`
- Returns `hasFinancial && ruleSetCount === 0`
- Used by Sidebar for nav filtering

**ruleSetCount source**: `web/src/contexts/session-context.tsx:84`
- `supabase.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)`
- **CRITICAL: Counts ALL rule_sets including archived. Does NOT filter by status=active.**

### Per-Tenant Routing Analysis

| Tenant | features.financial | ruleSetCount (all) | Active RS | hasFinancial | hasICM | Expected Landing | Actual Landing |
|--------|-------------------|-------------------|-----------|-------------|--------|-----------------|----------------|
| Sabor | true | 2 | 2 | TRUE | TRUE (2>0) | /financial (financial-only) | WRONG: Goes to dual-module path (line 415), then probably /data/import/enhanced (no calc batches) |
| MBC | undefined (false) | 18 | 5 | FALSE | TRUE (18>0) | /admin/launch/calculate or /data/import/enhanced | Goes to line 427: has 1 batch → /admin/launch/calculate |
| Optica | undefined (false) | 2 | 1 | FALSE | TRUE (2>0) | /admin/launch/calculate | Goes to line 427: has 6 batches → /admin/launch/calculate |

### Root Causes

**T-01: Sabor lands on /data/import/enhanced instead of /financial**
- Root cause 1: `ruleSetCount` at session-context.tsx:84 counts ALL rule_sets (including archived) without filtering by status
- Sabor has 2 rule sets (both active), so `hasICM = true`
- HF-076 line 408 checks `hasFinancial && !hasICM` — evaluates to `true && false = false`
- Falls through to dual-module path (line 415), then ICM path
- Since Sabor has 0 calculation batches, it hits line 434 (data > 0) → /data/import/enhanced
- **BUT WAIT**: The real design issue is that Sabor IS a dual-module tenant (financial + ICM rule sets). The `useFinancialOnly` hook was designed for tenants with financial but ZERO rule sets. Sabor has rule sets.
- **Fix options**: Either (a) remove Sabor's rule sets if they're not real ICM plans, or (b) update routing to prioritize financial for tenants where financial is the primary module

**T-02: MBC routing works correctly**
- MBC has no financial feature, hasICM=true (18 rule sets), has 1 calc batch
- Correctly routes to /admin/launch/calculate
- No routing bug for MBC

**T-03: Optica routing works correctly**
- Optica has no financial feature, hasICM=true (2 rule sets), has 6 calc batches
- Correctly routes to /admin/launch/calculate
- No routing bug for Optica

**T-04: ruleSetCount includes archived rule sets**
- session-context.tsx:84 does NOT filter by status
- MBC has 18 total but only 5 active — `ruleSetCount = 18`
- This inflates the count but doesn't break routing (any > 0 means hasICM)
- DOES affect useFinancialOnly: even if a tenant has only archived ICM plans, it won't be treated as financial-only
