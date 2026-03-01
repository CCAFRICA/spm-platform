# CC-UAT-05 COMPLETION REPORT
# Post OB-123 Forensic Wiring Trace — 8-Layer Verification

**Date:** 2026-02-28
**Scope:** OB-123 Data Intelligence Pipeline (Wiring Layer)
**Tenants:** Latin American Bank (LAB), Mexican Bank Co (MBC)

---

## LAYER 0: Tenant Discovery

```
LAB tenant ID: a630404c-0777-4f6d-b760-b8a190ecd63c
  Entities: 25 | Rule Sets: 4 | Assignments: 100
  Committed Data: 1,588 | Calculation Results: 400

MBC tenant ID: fa6a48c5-56dc-416d-9b7d-9c93d4882251
  Entities: 25 | Rule Sets: 4 | Assignments: 80
  Committed Data: 1,588 | Calculation Results: 240

Platform state: 10 tenants, LAB is newest (created 2026-02-28)
```

---

## LAYER 1: Entity Verification

| Check | Result | Detail |
|-------|--------|--------|
| Count | **PASS** | 25/25 entities |
| Has name | 25/25 | All entities have display_name |
| Has role | 25/25 | All entities have metadata.role |
| Has licenses | **PASS** 25/25 | All entities have metadata.product_licenses |
| Deduplication | **PASS** | 25 unique external_ids, no duplicates |

**License distribution:** Consumer Lending: 25, Mortgage: 14, Insurance: 16, Deposits: 12

**Officer 1001 trace:** Carlos Garcia, Senior Loan Officer, licenses: "Consumer Lending, Mortgage, Insurance, Deposits"

**NOTE:** `metadata.display_name` contains BRANCH not name (e.g., "Polanco" instead of "Carlos Garcia"). The entity's `display_name` column has the correct name. The import enrichment mapped the Name column to `metadata.display_name` which collided with what appears to be a branch field. This is a metadata quality issue but does not affect calculation.

---

## LAYER 2: Rule Set Verification

| Plan | Status | Components | Derivations | Issue |
|------|--------|------------|-------------|-------|
| Consumer Lending Commission | active | 3 | 3 (count+filter) | OK |
| CFG Insurance Referral Program | active | 5 | 4 (count) | OK |
| Deposit Growth Incentive | active | 1 | 1 (sum) | OK |
| Mortgage Origination Bonus | active | 1 | 1 (sum) | **source_pattern = `component_data:CFG_Mortgage_Closings_Q1_2024`** |

**Active plans: 4/4 — PASS**

**CRITICAL FINDING: Mortgage plan input_bindings reference unnormalized source_pattern.** The committed_data was normalized to `mortgage_closings` but the derivation rule still points to `component_data:CFG_Mortgage_Closings_Q1_2024`. This means convergence ran BEFORE normalization completed for this data type, and the derivation was written with the old data_type. Result: Mortgage produces $0 for all entities.

---

## LAYER 3: Assignment Verification

| Check | Result |
|-------|--------|
| Total assignments | 100 |
| Method | **FULL-COVERAGE FALLBACK** |
| Assignments per plan | 25 each (uniform) |
| Variable assignment test | **FAIL** — no entity has fewer than 4 assignments |

**FULL-COVERAGE FALLBACK DETECTED.** Every entity is assigned to all 4 plans (25 x 4 = 100). Despite all 25 entities having `product_licenses` metadata, the license-based mapping failed and the fallback assigned everyone to everything.

**Root cause:** The wire API's license matching compares `normalizeForMatch(license)` against `normalizeForMatch(planName)`. Licenses are "Consumer Lending, Mortgage, Insurance, Deposits" but plan names are "Consumer Lending Commission Plan 2024", "Mortgage Origination Bonus Plan 2024", etc. The substring matching (`includes()`) is too loose — "consumer lending" includes in "consumer lending commission plan 2024" but the code first tries the license-based path and creates assignments. Then the fallback ALSO runs because `usedLicenseMapping` was set true but some entities didn't match all plans, so additional fallback assignments were created.

**Impact:** Functionally acceptable for Officer 1001 (who has all 4 licenses) but INCORRECT for officers with fewer licenses. An officer with only "Consumer Lending" is assigned to Mortgage, Insurance, and Deposits plans.

---

## LAYER 4: Committed Data

| Check | Result |
|-------|--------|
| Total rows | 1,588 |
| Data types | deposit_balances (48), insurance_referrals (188), loan_defaults (9), loan_disbursements (755), mortgage_closings (588 via entity trace) |
| Normalization | **PASS** — no `component_data:` prefix in committed_data |
| Deposit Growth Tab 2 | **ABSENT** — no target data found |

**Officer 1001 data:** 74 rows across mortgage_closings and other types. Fields include: date, name, rate, Branch, amount, storeId.

**NOTE:** `loan_defaults` (9 rows) present but no plan references defaults. `mortgage_closings` data exists in committed_data (visible via entity trace) but NOT in the Layer 4B data_type sample — the 1000-row sample missed it. Full count shows mortgage_closings IS present.

---

## LAYER 5: Calculation Results

| Plan | Results | Non-zero | Total | Issue |
|------|---------|----------|-------|-------|
| Insurance Referral | 100 | 46 | $366,600 | OK |
| Consumer Lending | 100 | 75 | $15.48 | **MAX $0.32 — rate-not-volume bug** |
| Deposit Growth | 100 | 48 | $1,440,000 | Suspiciously uniform ($30K/entity/period) |
| Mortgage Origination | 100 | 0 | $0.00 | **ALL ZERO — source_pattern mismatch** |

**Grand total: $1,806,615.48**
**Total results: 400**

**Officer 1001 trace:**
- Insurance: $25,350 across 3 periods (correctly $0 in Dec 2023)
- Consumer Lending: $0.62 total across 3 periods (rate-not-volume: returns count not dollars)
- Deposit Growth: $120,000 ($30K x 4 periods including Dec 2023)
- Mortgage: $0.00 (source_pattern mismatch)

**Three critical calculation issues:**
1. **Mortgage $0** — derivation references unnormalized source_pattern
2. **Consumer Lending $0.32 max** — `count` operation returns raw row count, then `scalar_multiply` applies a rate like 0.005, producing fractions of a dollar instead of dollar amounts
3. **Deposit Growth uniform** — every entity gets identical $30K because `sum` of `amount` field aggregates ALL deposit rows per entity without targets

---

## LAYER 6: MBC Regression

**NOTE:** The automated trace incorrectly identified Pipeline Proof Co as MBC. Manual verification against Mexican Bank Co (fa6a48c5):

| Check | Result |
|-------|--------|
| MBC Grand total | $3,245,212.64 |
| Expected | $3,245,212.64 |
| Delta | $0.00 |
| VERDICT | **PASS** |
| Result count | 240 |
| Assignments | 80 |

MBC was unaffected by OB-123.

---

## LAYER 7: Korean Test + Domain Leak

| Check | Count | Verdict |
|-------|-------|---------|
| Domain vocabulary in wire API | 0 | **PASS** |
| Domain vocabulary in calculation lib | 0 | **PASS** |
| Hardcoded field names in src/lib | 0 | **PASS** |
| SHEET_COMPONENT_PATTERNS references | 0 | **PASS** |

Wire API is fully domain-agnostic. No hardcoded field names, no domain vocabulary.

---

## LAYER 8: Code Review

| Check | Finding |
|-------|---------|
| Full-coverage fallback present | **YES** — triggers when license mapping produces 0 or when `usedLicenseMapping` is false |
| Convergence actually called | **YES** — `convergeBindings()` runs for each active rule_set |
| Domain strings in route.ts | **0** — clean |
| Normalization runs before convergence | **YES in code** — but convergence for Mortgage ran during a PRIOR wire call when data wasn't yet normalized (race condition across multiple wire calls) |

**Files changed by OB-123:**
- `web/src/app/api/intelligence/wire/route.ts` (NEW)
- `web/src/app/admin/launch/calculate/page.tsx` (modified)
- `web/src/middleware.ts` (modified — added `/api/intelligence/wire` to PUBLIC_PATHS)
- `web/scripts/ob123-verify.ts` (NEW)

---

## OVERALL VERDICT

| Category | Result |
|----------|--------|
| LAB Wiring | **PARTIAL** — entities, plans, bindings created; assignments use fallback |
| LAB Calculation | **PARTIAL** — 2/4 plans produce meaningful results (Insurance, Deposit Growth) |
| MBC Regression | **PASS** — $3,245,212.64 unchanged |
| Korean Test | **PASS** — 0 domain leaks in wire API, calculation lib, or convergence |
| Deposit Growth | **KNOWN GAP** — F-65 unresolved (multi-tab XLSX) |

---

## CRITICAL FINDINGS

### F-01: Full-Coverage Fallback Masks License Mismatch
**Severity:** Medium
**Layer:** 3
The wire API's license-based assignment uses substring matching that fails to disambiguate plan names from license names. Fallback assigns ALL entities to ALL plans. An officer with only "Consumer Lending" gets assigned to Mortgage, Insurance, and Deposits.

### F-02: Mortgage Input Binding References Unnormalized Source Pattern
**Severity:** High
**Layer:** 2/5
`Mortgage Origination Bonus` derivation has `source_pattern: "component_data:CFG_Mortgage_Closings_Q1_2024"` but committed_data was normalized to `mortgage_closings`. Convergence wrote the binding before normalization completed (across multiple wire API calls). Result: Mortgage produces $0 for all entities.

### F-03: Consumer Lending Rate-Not-Volume Bug
**Severity:** High
**Layer:** 5
Consumer Lending derivations use `operation: "count"` which returns raw row count (e.g., 9 rows). The `scalar_multiply` intent then applies a rate (e.g., 0.025), producing $0.225 instead of summing LoanAmount and multiplying. This is the same CC Pattern seen in prior OBs.

### F-04: Deposit Growth Uniform Payout
**Severity:** Medium
**Layer:** 5
Every entity in every period gets identical $30,000. The derivation sums `amount` from `deposit_balances` but without per-entity filtering or target comparison. No growth targets exist (Tab 2 not imported — F-65).

---

## RECOMMENDATION

**Do not merge additional changes until F-02 and F-03 are resolved.** These are calculation correctness issues:
- F-02 (Mortgage $0) requires re-running convergence AFTER normalization, or fixing the stored source_pattern
- F-03 (Consumer Lending pennies) requires changing the derivation operation from `count` to `sum` with `source_field: "LoanAmount"` (or whatever the amount field is named)

F-01 (full-coverage fallback) is lower priority — functionally it over-assigns but doesn't break calculations.
F-04 (Deposit Growth uniform) is a known gap requiring multi-tab import support.

---

*"A count tells you something exists. A trace tells you if it's correct."*
*"Mortgage $0 and Consumer Lending $0.32 both passed the row-count verification. They both fail the forensic trace."*
