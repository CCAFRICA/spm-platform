# OB-118 Completion Report: Metric Derivation Engine — Insurance Referral Unblock

## Summary

Insurance Referral Program now produces $124,550 in payouts (was $0) by implementing metric derivation — count/filter/group operations on in-memory committed_data rows. Consumer Lending and Mortgage are unchanged (regression PASS). Grand total: $7,429,836 (was $7,305,286).

## Architecture Decision

**Option C chosen**: Derive at calculation time using in-memory data already loaded.

The engine already loads committed_data rows per entity per sheet. Metric derivation extends the metric builder to count rows matching filter conditions from the already-loaded data. Zero additional DB queries. Derivation rules stored in `rule_sets.input_bindings.metric_derivations` — auditable, inspectable, domain-agnostic.

## Results

### Before (OB-117)

| Rule Set | Total Payout |
|----------|-------------|
| Consumer Lending Commission | $6,319,876 |
| Mortgage Origination Bonus | $985,410 |
| Insurance Referral Program | $0 |
| Deposit Growth Incentive | $0 |
| **Grand Total** | **$7,305,286** |

### After (OB-118)

| Rule Set | Period | Entities | Payout | Status |
|----------|--------|----------|--------|--------|
| Consumer Lending Commission | Jan-Mar 2024 | 75 | $6,319,876 | REGRESSION PASS |
| Mortgage Origination Bonus | Jan-Mar 2024 | 75 | $985,410 | REGRESSION PASS |
| Insurance Referral Program | Jan 2024 | 25 | $32,150 | NON-ZERO |
| Insurance Referral Program | Feb 2024 | 25 | $53,850 | NON-ZERO |
| Insurance Referral Program | Mar 2024 | 25 | $38,550 | NON-ZERO |
| Deposit Growth Incentive | All | 75 | $0 | Expected |
| **Grand Total** | | | **$7,429,836** | +$124,550 |

### Sample Insurance Referral Calculation Trace

**Gomez — $6,900 payout:**
- Term Life Insurance Referral: $850 = 1 qualified referral x $850/referral (scalar_multiply)
- Home Insurance Referral: $650 = 1 qualified referral x $650/referral (scalar_multiply)
- Health Insurance Referral: $2,400 = 2 qualified referrals x $1,200/referral (conditional_gate, count <= 15 cap)
- SME Business Insurance Referral: $3,000 = 2 qualified referrals x $1,500/referral (conditional_gate, count <= 10 cap)
- Auto Insurance Bundle Referral: $0 = 0 qualified referrals

**Derivation trace for Gomez:**
```
committed_data: 13 rows where data_type matches /insurance|referral/i
  → Filter: ProductCode="INS-VIDA" AND Qualified="Yes" → count=1
  → Filter: ProductCode="INS-AUTO" AND Qualified="Yes" → count=0
  → Filter: ProductCode="INS-HOGAR" AND Qualified="Yes" → count=1
  → Filter: ProductCode="INS-SALUD" AND Qualified="Yes" → count=2
  → Filter: ProductCode="INS-PYME" AND Qualified="Yes" → count=2

Derived metrics:
  ins_vida_qualified_referrals = 1
  ins_auto_qualified_referrals = 0
  ins_hogar_qualified_referrals = 1
  ins_salud_qualified_referrals = 2
  ins_pyme_qualified_referrals = 2

calculationIntent execution:
  Term Life: scalar_multiply(1, 850) = $850
  Auto: scalar_multiply(0, 450) = $0
  Home: scalar_multiply(1, 650) = $650
  Health: conditional_gate(2 <= 15) → scalar_multiply(2, 1200) = $2,400
  SME: conditional_gate(2 <= 10) → scalar_multiply(2, 1500) = $3,000

Total: $6,900
```

## What Metric Derivation Rules Look Like

Stored in `rule_sets.input_bindings.metric_derivations`:

```json
{
  "metric_derivations": [
    {
      "metric": "ins_vida_qualified_referrals",
      "operation": "count",
      "source_pattern": "insurance|referral",
      "filters": [
        { "field": "ProductCode", "operator": "eq", "value": "INS-VIDA" },
        { "field": "Qualified", "operator": "eq", "value": "Yes" }
      ]
    }
  ]
}
```

**Domain-agnostic**: Field names ("ProductCode", "Qualified") and values ("INS-VIDA", "Yes") come from config, not from code. Korean Test: if data had Korean field names and values, the same engine works — just update the config values.

**Auditable**: Rules are stored in rule_set JSONB, visible in admin, inspectable before calculation.

## Code Changes

| File | Change |
|------|--------|
| `web/src/lib/calculation/run-calculation.ts` | Added `MetricDerivationRule` type + `applyMetricDerivations()` function. Integrated in `runCalculation()` entity loop. |
| `web/src/app/api/calculation/run/route.ts` | Parse `input_bindings.metric_derivations`, apply once per entity, merge into component metrics. |

## Data Changes

| Table | Change |
|-------|--------|
| `rule_sets.input_bindings` | Insurance Referral rule set updated with 5 metric_derivation rules |

## Decision 64 Sequence Status

| OB | Description | Status |
|----|-------------|--------|
| OB-117 | Plan Intelligence quality — evaluator fixes | DONE |
| OB-118 | Metric derivation engine (count/filter/group) | DONE |
| OB-119 | Data Intelligence Profile | TODO |
| OB-120 | Plan Requirements Manifest | TODO |
| OB-121 | Convergence Layer | TODO |
| OB-122 | Engine input_bindings as primary path | TODO |

## Proof Chain

```
input_bindings.metric_derivations:
  { metric: "ins_vida_qualified_referrals", operation: "count",
    source_pattern: "insurance|referral",
    filters: [ProductCode=INS-VIDA, Qualified=Yes] }

committed_data (188 rows, data_type: CFG_Insurance_Referrals_Q1_2024):
  → applyMetricDerivations(entitySheetData, derivations)
    → count rows matching filters per entity
      → ins_vida_qualified_referrals = 1 (for Gomez)

metrics["ins_vida_qualified_referrals"] = 1
  → evaluateComponent → calculationIntent fallback
    → executeOperation(scalar_multiply, rate=850)
      → resolveSource("ins_vida_qualified_referrals") → 1
        → 1 * 850 = $850

Insurance Referral Program: $124,550 total (was $0)
Consumer Lending: $6,319,876 (UNCHANGED)
Mortgage: $985,410 (UNCHANGED)
```
