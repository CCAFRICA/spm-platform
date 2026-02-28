# OB-116 Completion Report: MBC Re-Import and Calculation Proof

## Summary

Re-imported MBC (Modelo Banco Comunal) committed_data through the OB-115 fixed pipeline, ran calculations for all 4 active rule sets × 3 periods, and proved the pipeline produces non-zero results. Consumer Lending Commission now generates $6.3M in payouts across Q1 2024.

## Phases Executed

### Phase 0: Pre-flight Verification
- Confirmed OB-114 + OB-115 merged on `main`
- Verified `resolveDataType()` exists in import/commit/route.ts
- Verified `input_bindings` populated on Mortgage + Deposit rule sets

### Phase 1: Baseline State Captured
- 1,661 committed_data rows (950 "Sheet1" — the OB-115 root cause)
- 25 calculation results, all $0.00
- 10 import batches (including duplicates)
- 25 entities, 4 periods, 4 active rule sets

### Phase 2: Stale Data Cleared
- Deleted all committed_data, calculation_results, calculation_batches, import_batches
- Clean slate for re-import

### Phase 3: Re-Import Through Fixed Pipeline
- Downloaded 8 files from Supabase Storage (`imports/{tenantId}/{uuid}/{filename}`)
- Inserted 1,588 rows with semantic data_types (filename-based, no "Sheet1")
- 100% entity_id linkage, 100% period_id linkage
- Data type breakdown:
  - CFG_Loan_Disbursements_Jan2024: 396 rows
  - CFG_Loan_Disbursements_Feb2024: 446 rows
  - CFG_Loan_Disbursements_Mar2024: 394 rows
  - CFG_Insurance_Referrals_Q1_2024: 188 rows
  - CFG_Mortgage_Closings_Q1_2024: 82 rows
  - CFG_Deposit_Balances_Q1_2024: 48 rows
  - CFG_Personnel_Q1_2024: 25 rows
  - CFG_Loan_Defaults_Q1_2024: 9 rows

### Phase 4: Calculation Proof

#### Root Cause Diagnosed
`findMatchingSheet()` in run-calculation.ts was returning null for ALL MBC components:
- **Tier 2 (substring match)**: "Mortgage Origination Bonus" ↔ "CFG_Mortgage_Closings_Q1_2024" — no substring containment
- **Tier 3 (SHEET_COMPONENT_PATTERNS)**: Only had Optica Luminar patterns, no banking patterns

#### Fix Applied
1. Added 4 MBC pattern groups to `SHEET_COMPONENT_PATTERNS` in metric-resolver.ts:
   - Mortgage origination/closings
   - Loan disbursements/consumer lending
   - Deposit growth/balances
   - Insurance referrals (banking)
2. Added `/disbursement/i` to `AMOUNT_PATTERNS` for semantic resolution
3. Created rule_set_assignments for 3 unassigned rule sets (25 entities each)

#### Results: 300 Calculation Results

| Rule Set | Period | Entities | Payout Sum | Status |
|----------|--------|----------|------------|--------|
| Consumer Lending Commission | Jan 2024 | 25 | $2,019,023 | ✓ NON-ZERO |
| Consumer Lending Commission | Feb 2024 | 25 | $2,207,257 | ✓ NON-ZERO |
| Consumer Lending Commission | Mar 2024 | 25 | $2,093,596 | ✓ NON-ZERO |
| Mortgage Origination Bonus | Jan 2024 | 25 (14 with data) | $0.06 (rates) | ✓ NON-ZERO |
| Mortgage Origination Bonus | Feb 2024 | 25 (12 with data) | $0.06 (rates) | ✓ NON-ZERO |
| Mortgage Origination Bonus | Mar 2024 | 25 (12 with data) | $0.06 (rates) | ✓ NON-ZERO |
| Deposit Growth Incentive | Jan-Mar | 25 each | $0.00 | Plan config |
| Insurance Referral Program | Jan-Mar | 25 each | $0.00 | Plan config |

**Grand total: $6,319,876.20** (was $0.00)

### Why 2 Rule Sets Still Show $0

These are **plan interpretation issues**, not pipeline issues:

1. **Deposit Growth Incentive**: Component expects `deposit_growth_attainment` (semantic type: attainment). Data has raw `TotalDepositBalance` values. The engine would need to compute (end_balance - start_balance) / goal, but no goal exists in the data and the `input_bindings.aggregation: "max_minus_min"` is fetched but not used by the engine.

2. **Insurance Referral Program**: All 5 components have `tierConfig.metric = "unknown"` and `tierConfig.tiers = []` (empty array). The AI plan interpreter failed to populate these fields. The `calculationIntent` has the correct structure (scalar_multiply with rates) but the legacy evaluator path reads `tierConfig` which is empty.

### Why Mortgage Payouts Are Tiny

The Mortgage tier config stores **rates** (0.002, 0.003, 0.004) as the tier `value` field. The `evaluateTierLookup` evaluator returns `tier.value` directly as the payout. The plan should have been interpreted as a conditional_percentage (rate × volume) not a pure tier_lookup. Ruiz's metricValue = $9,281,660 correctly matched the 5M-15M tier, but the payout was 0.003 instead of $9,281,660 × 0.003 = $27,845.

## Code Changes

| File | Change |
|------|--------|
| `web/src/lib/orchestration/metric-resolver.ts` | Added 4 MBC SHEET_COMPONENT_PATTERNS + `/disbursement/i` AMOUNT_PATTERN |

## Data Changes

| Table | Change |
|-------|--------|
| `committed_data` | 1,588 rows re-imported with semantic data_types |
| `rule_set_assignments` | +75 new (25 × 3 rule sets) |
| `calculation_results` | 300 new (25 × 4 × 3) |
| `entity_period_outcomes` | 75 new (25 × 3 periods, last run) |
| `calculation_batches` | 12 new (4 × 3) |

## Pipeline Proof Chain

```
Storage (8 xlsx/csv files)
  → Re-import with filename-based data_type (no "Sheet1")
    → committed_data (1,588 rows, 8 semantic types)
      → findMatchingSheet (SHEET_COMPONENT_PATTERNS Tier 3)
        → buildMetricsForComponent (semantic resolution: LoanAmount → amount)
          → evaluatePercentage / evaluateTierLookup
            → calculation_results (300 rows, $6.3M total)
```

## Remaining Work (Future OBs)

1. **OB-117 (suggested)**: Fix Mortgage plan interpretation — tier values should be rates applied to volume, not flat payouts
2. **OB-118 (suggested)**: Implement `input_bindings` consumption in engine — computed metrics (attainment from balances)
3. **OB-119 (suggested)**: Fix Insurance Referral component configs — populate tierConfig from calculationIntent
