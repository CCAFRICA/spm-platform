# OB-117 Completion Report: Plan Intelligence Quality — MBC Interpretation Fixes

## Summary

Fixed Mortgage Origination Bonus from $0.18 to $985,410 by implementing rate detection in evaluateTierLookup. Added calculationIntent fallback infrastructure for components with broken tierConfig but valid AI-produced intent structures. Consumer Lending Commission regression: PASS ($6,319,876 unchanged).

## Results

### Before (OB-116)

| Rule Set | Total Payout | Status |
|----------|-------------|--------|
| Consumer Lending Commission | $6,319,876 | Working |
| Mortgage Origination Bonus | $0.18 | Broken — rates as flat payouts |
| Deposit Growth Incentive | $0 | Plan config issue |
| Insurance Referral Program | $0 | Empty tierConfig |

### After (OB-117)

| Rule Set | Period | Entities | Payout | Status |
|----------|--------|----------|--------|--------|
| Consumer Lending Commission | Jan 2024 | 25 | $2,019,023 | REGRESSION PASS |
| Consumer Lending Commission | Feb 2024 | 25 | $2,207,257 | REGRESSION PASS |
| Consumer Lending Commission | Mar 2024 | 25 | $2,093,596 | REGRESSION PASS |
| Mortgage Origination Bonus | Jan 2024 | 25 | $395,886 | FIXED |
| Mortgage Origination Bonus | Feb 2024 | 25 | $266,565 | FIXED |
| Mortgage Origination Bonus | Mar 2024 | 25 | $322,958 | FIXED |
| Deposit Growth Incentive | All | 75 | $0 | Expected (OB-118) |
| Insurance Referral Program | All | 75 | $0 | Expected (OB-119) |

**Grand total: $7,305,286** (was $6,319,876 — increase of $985,410 from Mortgage fix)

### Mortgage Proof (Top 5 Officers)

| Officer | Volume | Tier | Rate | Payout |
|---------|--------|------|------|--------|
| Morales | $26.6M | Above 15M | 0.004 | $106,523 |
| Perez | $22.6M | Above 15M | 0.004 | $90,452 |
| Ramirez | $18.6M | Above 15M | 0.004 | $74,490 |
| Romero | $14.2M | 5M-15M | 0.003 | $42,499 |
| Reyes | $13.2M | 5M-15M | 0.003 | $39,478 |

Rate detection confirmed: `rateDetected=true`, `rateApplied=0.004 x 26630736.39`

## Root Causes Fixed

### 1. Mortgage: Rate Detection Heuristic (PRIMARY FIX)

**Before**: `evaluateTierLookup` returned `tier.value` (0.003) as flat payout.
Ruiz metricValue=$9.28M, matched 5M-15M tier, payout=$0.003.

**After**: Rate detection heuristic — if all non-zero tier values < 1.0, they're commission rates. Multiply `tier.value x metricValue`.
Ruiz: 0.003 x $9.28M = $27,845.

**Heuristic safety**: All existing non-MBC tier_lookup components have values > 1.0 (e.g., Deposit Growth: [0, 5000, 12000, 20000, 30000]). No false positives.

### 2. Insurance Referral: calculationIntent Fallback (INFRASTRUCTURE)

**Before**: `evaluateComponent` only read `tierConfig` (empty tiers → $0).
The AI-produced `calculationIntent` had correct scalar_multiply structure.

**After**: When legacy evaluator returns $0 AND `component.calculationIntent` exists, attempt evaluation via intent executor. Currently produces $0 because input metrics (`ins_vida_qualified_referrals`) don't exist in aggregated data — the data has individual referral rows needing count-by-filter, not numeric sums.

**Why Insurance still $0**: The data has 188 individual referral rows with fields like `ProductCode: "INS-VIDA"`, `Qualified: "Yes"`. The intent expects COUNT of qualified referrals per product type. The aggregation engine only sums numeric fields — it cannot filter/count/group by string criteria. This requires either:
- OB-119: Better AI plan interpretation (create correct component types)
- Or: Metric derivation engine (count/filter/group operations on raw rows)

## Code Changes

| File | Change |
|------|--------|
| `web/src/lib/calculation/run-calculation.ts` | Rate detection in evaluateTierLookup + calculationIntent fallback in evaluateComponent |
| `web/src/lib/calculation/intent-executor.ts` | Export executeOperation + isMarginal handling in bounded_lookup_1d |
| `web/src/lib/calculation/intent-types.ts` | Added isMarginal to BoundedLookup1D interface |
| `web/src/lib/calculation/intent-transformer.ts` | Carry isMarginal from component.calculationIntent |

## Decision 64 Sequence Status

| OB | Description | Status |
|----|-------------|--------|
| OB-117 | Plan Intelligence quality in evaluator | DONE |
| OB-118 | input_bindings consumption (computed metrics from balances) | TODO |
| OB-119 | AI prompt improvement (Insurance tierConfig population) | TODO |

## Proof Chain

```
tierConfig.tiers = [{ value: 0.002 }, { value: 0.003 }, { value: 0.004 }]
  → rate detection: all non-zero values < 1.0
    → evaluateTierLookup: payout = tier.value x metricValue
      → 0.003 x $9,281,660 = $27,845
        → Mortgage Origination Bonus: $985,410 total (was $0.18)

calculationIntent: { operation: "scalar_multiply", rate: 850, input: { source: "metric", field: "ins_vida_qualified_referrals" } }
  → calculationIntent fallback: executeOperation(intent, metrics)
    → resolveSource("ins_vida_qualified_referrals") → 0 (not in aggregated data)
      → 0 x 850 = $0 (metric derivation gap, not evaluator bug)
```
