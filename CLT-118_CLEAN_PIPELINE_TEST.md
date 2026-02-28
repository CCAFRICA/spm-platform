# CLT-118: Clean Pipeline Test — Fresh Import Through Intelligence Layer

## Summary

**Grand Total: $0** (expected: $7,429,836)

Fresh import through the intelligence pipeline produces zero payouts. The AI plan interpretation works excellently (100% confidence on Insurance Referral, 95% on all others). But the data-to-plan binding is completely broken — 98% of committed_data rows have NULL entity_id and 100% have NULL period_id. The calculation engine finds no data for any entity in any period.

## Pre-Test: Clean Reset

| Table | Before | After |
|-------|--------|-------|
| committed_data | 1,588 | 0 |
| calculation_results | 300 | 0 |
| rule_sets | 18 | 0 |
| entities | 25 | 0 |
| periods | 4 | 0 |
| import_batches | 8 | 0 |
| entity_period_outcomes | 75 | 0 |

Clean slate confirmed.

---

## STEP 1: Plan Import — AI Interpretation

### 1A: Consumer Lending Commission
| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1A.1 | AI creates a rule set | Yes | **YES** — 95% confidence |
| 1A.2 | Component type | Tiered percentage on loan volume | **tiered_lookup** — "Loan Disbursement Commission" |
| 1A.3 | Tier rates extracted | 0.8%, 1.0%, 1.2% by loan amount bands | **calculationIntent: bounded_lookup_1d** with boundaries [0-499999, 500000-999999, 1000000+] outputs [0.008, 0.01, 0.012] |
| 1A.4 | tierConfig populated | Yes — with tiers | **EMPTY** — AI only populated calculationIntent, not legacy tierConfig |

### 1B: Mortgage Origination Bonus
| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1B.1 | AI creates a rule set | Yes | **YES** — 95% confidence |
| 1B.2 | Tier values recognized as RATES | 0.002, 0.003, 0.004 | **YES** — scalar_multiply with nested bounded_lookup_1d for rate |
| 1B.3 | Calculation type | Rate x volume | **scalar_multiply(volume, bounded_lookup_1d(volume, [0.002, 0.003, 0.004]))** |
| 1B.4 | tierConfig populated | Yes | **EMPTY** — calculationIntent only |

### 1C: Insurance Referral Program
| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1C.1 | AI creates a rule set | Yes — with 5 components | **YES — 5 components, 100% confidence** |
| 1C.2 | Fee schedule extracted | Per-product flat fees | **YES** — scalar_multiply with rates 850, 450, 650, 1200, 1500 |
| 1C.3 | Qualification requirement | "Qualified" referrals only | **YES** — metric names reference "qualified" referrals |
| 1C.4 | calculationIntent populated | Yes | **YES** — scalar_multiply + conditional_gate for Health/SME caps |
| 1C.5 | tierConfig populated | Yes | **EMPTY** — calculationIntent only |

### 1D: Deposit Growth Incentive
| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1D.1 | AI creates a rule set | Yes | **YES** — 95% confidence |
| 1D.2 | Tier structure extracted | <80%=$0, 80-99%=$5K, 100-119%=$10K, 120%+=$18K | **YES** — bounded_lookup_1d with ratio input, outputs [0, 5000, 10000, 18000] |
| 1D.3 | Calculation type | Attainment-based | **YES** — input source: ratio(actual_deposit_growth/target_deposit_growth) |
| 1D.4 | Tab 2 recognized | Per-entity targets identified | **NO** — AI interpreted text description only, no multi-tab processing |
| 1D.5 | Target data handling | Targets identified as goal values | **NO** — No target data import or handling |

### Post-Plan Import: Key Findings

```
Rule sets: 4 (all active)

Consumer Lending Commission Plan 2024
  Components: 1 | tierConfig: EMPTY | calculationIntent: YES
  input_bindings: EMPTY {}

Mortgage Origination Bonus Plan 2024
  Components: 1 | tierConfig: EMPTY | calculationIntent: YES
  input_bindings: EMPTY {}

Insurance Referral Program 2024
  Components: 5 | tierConfig: EMPTY | calculationIntent: YES (all 5)
  input_bindings: EMPTY {}

Deposit Growth Incentive — Q1 2024
  Components: 1 | tierConfig: EMPTY | calculationIntent: YES
  input_bindings: EMPTY {}
```

**Critical observation**: AI populates `calculationIntent` but NOT `tierConfig`. The legacy engine path (evaluateComponent -> evaluateTierLookup) requires `tierConfig.tiers[]`. The intent engine path (executeOperation) requires `calculationIntent`. The OB-117 fallback bridges this — when legacy returns $0, it falls back to calculationIntent. But this only works if the engine has data to calculate with.

**Critical observation**: `input_bindings` is ALWAYS `{}`. The plan/import route (line 78-80) hardcodes `input_bindings: {} as Json`. The AI never generates metric derivation rules, data-to-plan bindings, or field mappings.

---

## STEP 2: Data Import

### File Import Results

| File | Rows | Entity Linkage | Period Detection |
|------|------|---------------|-----------------|
| CFG_Personnel_Q1_2024.xlsx | 25 | EmployeeID recognized | N/A (roster) |
| CFG_Loan_Disbursements_Jan2024.csv | 396 | OfficerID NOT recognized | DisbursementDate NOT mapped |
| CFG_Loan_Disbursements_Feb2024.csv | 446 | OfficerID NOT recognized | DisbursementDate NOT mapped |
| CFG_Loan_Disbursements_Mar2024.csv | 394 | OfficerID NOT recognized | DisbursementDate NOT mapped |
| CFG_Mortgage_Closings_Q1_2024.csv | 82 | OfficerID NOT recognized | ClosingDate NOT mapped |
| CFG_Insurance_Referrals_Q1_2024.csv | 188 | OfficerID NOT recognized | ReferralDate NOT mapped |
| CFG_Deposit_Balances_Q1_2024.csv | 48 | OfficerID NOT recognized | SnapshotDate NOT mapped |
| CFG_Loan_Defaults_Q1_2024.csv | 9 | OfficerID NOT recognized | DefaultDate NOT mapped |
| **Total** | **1,588** | **25/1,588 (1.6%)** | **0/1,588 (0%)** |

### Root Cause: OfficerID Not Recognized

The import pipeline has `ENTITY_ID_TARGETS = ['entityid', 'entity_id', 'employeeid', 'employee_id', 'external_id', 'externalid', 'repid', 'rep_id']`. The data files use `OfficerID`. Without AI field mapping (which maps `OfficerID -> employee_id`), the column is not recognized.

**Roster**: `EmployeeID` IS in the target list -> entities created correctly.
**Data**: `OfficerID` is NOT in the target list -> all rows get `entity_id = NULL`.

The AI field mapping service (`/api/interpret-import`) CAN map OfficerID -> employee_id, but the automated pipeline doesn't call it — it requires manual UI interaction.

### Root Cause: Period Detection Failure

Data files have Excel serial dates (e.g., `DisbursementDate = 45308` -> 2024-01-17). The import pipeline only detects periods from fields mapped to `PERIOD_TARGETS = ['period', 'period_key', 'date']` or `YEAR_TARGETS/MONTH_TARGETS`. Without the AI field mapper mapping `DisbursementDate -> period`, no periods are detected.

### Post-Data Import State

```
committed_data: 1,588 rows
  null entity_id: 1,563 (98%)
  null period_id: 1,588 (100%)

data_type values (filename stems, not semantic):
  CFG_Loan_Disbursements_Jan2024
  CFG_Loan_Disbursements_Feb2024
  CFG_Loan_Disbursements_Mar2024
  CFG_Mortgage_Closings_Q1_2024
  CFG_Insurance_Referrals_Q1_2024
  CFG_Deposit_Balances_Q1_2024
  CFG_Loan_Defaults_Q1_2024
  CFG_Personnel_Q1_2024
```

### Rule Set Assignments

```
Assignments: 55
  Consumer Lending Commission: 25
  Mortgage Origination Bonus: 14
  Insurance Referral Program: 16
  Deposit Growth Incentive: 0 (license "Deposits" doesn't match "Deposit Growth Incentive")
```

---

## STEP 3: Calculation Results

| Rule Set | Period | Entities | Payout | Status |
|----------|--------|----------|--------|--------|
| Consumer Lending | 2024-01 | 25 | $0 | $0 |
| Consumer Lending | 2024-02 | 25 | $0 | $0 |
| Consumer Lending | 2024-03 | 25 | $0 | $0 |
| Deposit Growth | 2024-01 | 0 | $0 | No entities assigned |
| Deposit Growth | 2024-02 | 0 | $0 | No entities assigned |
| Deposit Growth | 2024-03 | 0 | $0 | No entities assigned |
| Insurance Referral | 2024-01 | 16 | $0 | $0 |
| Insurance Referral | 2024-02 | 16 | $0 | $0 |
| Insurance Referral | 2024-03 | 16 | $0 | $0 |
| Mortgage Origination | 2024-01 | 14 | $0 | $0 |
| Mortgage Origination | 2024-02 | 14 | $0 | $0 |
| Mortgage Origination | 2024-03 | 14 | $0 | $0 |
| **Grand Total** | | | **$0** | **Expected: $7,429,836** |

---

## STEP 4: Gap Analysis

| Capability | Working Without Manual Wiring? | What's Missing |
|-----------|-------------------------------|----------------|
| Field classification (types) | **Partial** | AI classify-file and interpret-import exist but aren't auto-invoked in pipeline |
| Sheet classification (data_type naming) | **No** | Fallback to filename stem; AI classification requires manual UI flow |
| Plan interpretation (components, rates) | **YES** | Excellent: 95-100% confidence, correct calculationIntent for all 4 plans |
| Rate vs. amount detection | **YES** | Mortgage rates correctly nested as scalar_multiply(volume, bounded_lookup_1d) |
| Entity resolution | **Partial** | EmployeeID recognized from roster; OfficerID NOT recognized from data files |
| Period detection | **No** | Excel serial dates in DisbursementDate/ClosingDate not detected without field mapping |
| Data-to-entity binding (OfficerID -> entity) | **No** | OfficerID not in ENTITY_ID_TARGETS; needs AI field mapping |
| Data-to-plan connection (input_bindings) | **No** | Always `{}`; plan/import hardcodes empty; AI never generates bindings |
| Metric derivation (count/filter/group) | **No** | OB-118 engine exists but rules must be manually configured in input_bindings |
| Attainment computation (delta/goal) | **No** | Deposit Growth targets not imported; no growth calculation logic |
| Deposit Growth target import (Tab 2) | **No** | Multi-tab plan files not processed; Tab 2 targets not recognized as goal data |
| Rule set assignment (multi-plan) | **Partial** | ProductLicenses matching works but "Deposits" doesn't match "Deposit Growth Incentive" |
| Calculation — Consumer Lending | **No** | $0 — no data linked to entities/periods |
| Calculation — Mortgage | **No** | $0 — no data linked to entities/periods |
| Calculation — Insurance Referral | **No** | $0 — no data linked + no metric_derivation rules |
| Calculation — Deposit Growth | **No** | $0 — no entities assigned + no target data |

### What WORKS (no manual wiring needed)

1. **AI Plan Interpretation**: 95-100% confidence. Components, calculation methods, rates, caps all correctly extracted into `calculationIntent`.
2. **Rate Detection**: Mortgage 0.002/0.003/0.004 correctly identified as rates (not flat amounts).
3. **Roster Import**: EmployeeID auto-detected, entities created with display_name, role, ProductLicenses.
4. **Multi-Plan Assignment**: ProductLicenses parsing works (Consumer Lending: 25, Mortgage: 14, Insurance: 16).
5. **Calculation Engine**: OB-117 calculationIntent fallback + OB-118 metric derivation engine are ready — just need data.

### What DOESN'T WORK (requires manual wiring)

1. **Data-to-Entity Binding**: OfficerID -> EmployeeID mapping requires AI field mapping intervention.
2. **Period Detection**: Date columns (DisbursementDate, ClosingDate) need AI mapping to `period` target.
3. **input_bindings**: Hardcoded `{}` in plan/import. AI doesn't generate data-to-plan bindings.
4. **Metric Derivations**: Not auto-generated from plan + data analysis.
5. **Semantic data_type**: Falls back to filename stem without AI context.
6. **Deposit Growth Targets**: Tab 2 data completely unhandled.
7. **Deposit Growth Assignments**: "Deposits" != "Deposit Growth Incentive" substring match.

---

## FINDINGS

### Finding 1: AI Plan Interpretation is Production-Ready
The AI correctly interprets all 4 plan types with 95-100% confidence. calculationIntent is well-structured with correct operations, rates, boundaries, and caps. This is the strongest link in the intelligence chain.

### Finding 2: Data-to-Plan Binding is the Critical Missing Layer
The 10-step import/commit pipeline has all the mechanics (entity resolution, period detection, data_type assignment) but they depend on correctly mapped field targets. Without AI field mapping of non-standard column names (OfficerID -> employee_id, DisbursementDate -> period), 98% of data goes unlinked.

### Finding 3: input_bindings is the Decision 64 Bottleneck
The bridge between "data exists in committed_data" and "engine knows how to find it" is `input_bindings`. Currently always `{}`. This is where OB-119 (Data Intelligence Profile), OB-120 (Plan Requirements Manifest), and OB-121 (Convergence Layer) must deliver.

### Root Cause of $0 Grand Total
```
Cascading failure:
  OfficerID not recognized -> entity_id = NULL (98% of rows)
  -> DisbursementDate not mapped -> period_id = NULL (100%)
    -> Engine queries WHERE entity_id=X AND period_id=Y -> 0 matching rows
      -> All metrics = 0 -> All payouts = $0
```

### Root Cause of Deposit Growth $0
Triple failure: (1) No entities assigned (license mismatch), (2) No target data imported from Tab 2, (3) No attainment computation logic for delta/goal ratios.

### Gap Between "Manual Wiring" and "Intelligence Pipeline"
With manual wiring (OB-116 through OB-118): **$7,429,836** — all 4 plans produce payouts.
Without manual wiring (CLT-118 fresh): **$0** — zero payouts from any plan.

The intelligence gap is entirely in the data-binding layer:
- Plan Intelligence (interpret-plan): **Working**
- Engine Intelligence (calculation + intent fallback): **Working**
- Data Intelligence (field mapping + input_bindings + metric derivation): **NOT Working**

This is exactly the scope of Decision 64's remaining work (OB-119 through OB-122).

---

## Decision 64 Remaining Sequence

| OB | Description | Addresses Which Gap |
|----|-------------|---------------------|
| OB-119 | Data Intelligence Profile | Auto-profile data schema, detect entity ID columns, date columns, value types |
| OB-120 | Plan Requirements Manifest | Extract what each plan NEEDS from data (metrics, entities, periods) |
| OB-121 | Convergence Layer | Match data profiles to plan requirements -> generate input_bindings |
| OB-122 | Engine input_bindings as primary path | Replace SHEET_COMPONENT_PATTERNS with input_bindings-driven metric resolution |

### What Each OB Would Fix

**OB-119**: Profiles `OfficerID` as entity-identifier, `DisbursementDate` as temporal, `LoanAmount` as currency/amount. Recognizes `OfficerID=1001` matches `EmployeeID=1001` in roster.

**OB-120**: Consumer Lending needs `total_loan_disbursement` per entity per period. Mortgage needs `total_mortgage_closing_amount`. Insurance needs `qualified_[product]_referrals` (count, filtered). Deposit Growth needs `actual_deposit_growth` and `target_deposit_growth`.

**OB-121**: Matches OB-119 profiles to OB-120 manifests. Generates:
- `input_bindings.entity_field = "OfficerID"`
- `input_bindings.period_field = "DisbursementDate"`
- `input_bindings.metric_derivations = [...]` for Insurance
- `input_bindings.metric_mappings = { total_loan_disbursement: "SUM(LoanAmount)" }` for Consumer Lending

**OB-122**: Engine reads `input_bindings` as the primary path for metric resolution, replacing the fragile SHEET_COMPONENT_PATTERNS regex matching.

---

## Additional Finding: Metric Name Reconciliation Gap

Post-test restoration with proper entity_id and period_id linkage (0% null) still produced $0. Root cause: AI plan interpretation generates metric names like `total_loan_disbursement` while actual data fields are `LoanAmount`. The calculationIntent expects AI-named metrics; the data provides raw field names.

This is a **sixth gap** beyond the five identified above: the AI plan interpreter and the data importer produce different vocabularies. OB-121 (Convergence Layer) must bridge this by generating metric mappings: `total_loan_disbursement = SUM(LoanAmount WHERE data_type LIKE '%Loan_Disbursements%')`.

### Post-Test Tenant State

```
committed_data: 1,588 rows (0% null entity_id, 0% null period_id)
entities: 25
periods: 3 (2024-01, 2024-02, 2024-03)
rule_sets: 4 (AI-interpreted, calculationIntent only, no tierConfig)
assignments: 67
Grand Total: $0 (metric name mismatch)
```

To restore $7.4M working state: re-import plan documents through the UI (produces both tierConfig and calculationIntent with data-matched metric names).

---

*CLT-118 — Fresh import. No manual wiring. Grand Total: $0.*
*Plan Intelligence: Working. Data Intelligence: Not built yet. Engine Intelligence: Ready.*
*"If you have to hand it the answer, it's not intelligence — it's a lookup table."*
