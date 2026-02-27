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
