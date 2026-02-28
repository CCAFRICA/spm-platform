# OB-120: Convergence Layer — Metric Reconciliation & Surface-Driven Binding

## Summary

OB-120 bridges the vocabulary gap between plan requirements and data capabilities through a convergence layer that semantically matches components to data sources. Three core problems fixed:

1. **Consumer Lending: $1 -> $2,084,387** — Compound operation fix (postProcessing transform + isMarginal auto-detection)
2. **Insurance Referral: $0 -> $125,400** — Convergence-generated derivation rules with product filters
3. **Binding generation hardened** — Surface-driven matching replaces brittle regex table for new bindings

## Financial Results

| Plan | Before OB-120 | After OB-120 | Change |
|------|--------------|-------------|--------|
| Consumer Lending | $1.00 | $2,084,387.65 | +2,084,386x |
| Insurance Referral | $0.00 | $125,400.00 | $0 -> $125K |
| Mortgage | $1,046,891.00 | $1,046,890.04 | Maintained |
| Deposit Growth | $0.00 | $0.00 | No data change |
| **Grand Total** | **$1,046,892** | **$3,256,677.69** | **+211% (3.1x)** |

## Root Causes & Fixes

### Consumer Lending ($1 -> $2M)

**Root cause:** AI plan interpretation generates flat `bounded_lookup_1d` with `postProcessing: { operation: "scalar_multiply", rateFromLookup: true }`, but the intent executor ignores `postProcessing`. Result: raw rate 0.01 returned instead of rate x volume.

**Fix (run-calculation.ts):**
- Transform `postProcessing.rateFromLookup` into proper `scalar_multiply` wrapper operation
- Auto-detect `isMarginal` for `bounded_lookup_1d` when all tier outputs are rates (< 1.0)
- Both paths now multiply rate x volume correctly

### Insurance Referral ($0 -> $125K)

**Root cause:** No input_bindings generated because 5 product-specific components (Term Life, Auto, Home, Health, SME) need COUNT with product filters, which the regex-based SHEET_COMPONENT_PATTERNS cannot express.

**Fix (convergence-service.ts):**
- New convergence service extracts plan requirements from component structure
- Inventories data capabilities by sampling rows at runtime
- Detects shared-base pattern (multiple components -> same data_type)
- Discovers categorical filter fields + values from data (zero hardcoded names)
- Generates 5 derivation rules with product + qualified filters:

```json
{ "metric": "qualified_term_life_referrals", "operation": "count",
  "source_pattern": "insurance_referrals",
  "filters": [
    { "field": "ProductCode", "operator": "eq", "value": "INS-VIDA" },
    { "field": "Qualified", "operator": "eq", "value": "Yes" }
  ]
}
```

All field names and values discovered from data sampling at runtime (Korean Test compliant).

## Architecture

### New Files
- `web/src/lib/intelligence/convergence-service.ts` — Core convergence logic (~496 lines)
- `web/src/app/api/intelligence/converge/route.ts` — POST /api/intelligence/converge endpoint

### Modified Files
- `web/src/lib/calculation/run-calculation.ts` — postProcessing transform + isMarginal auto-detection
- `web/src/app/api/import/commit/route.ts` — Replaced 160-line Step 9.5 with convergence service call

### Convergence Flow
1. Extract plan requirements from component structure (tierConfig, calculationIntent)
2. Inventory data capabilities by sampling committed_data rows
3. Match via: SHEET_COMPONENT_PATTERNS fast path -> token overlap fallback
4. Detect shared-base pattern -> generate filtered COUNT derivations
5. Persist as input_bindings on rule_sets
6. Capture classification signals for learning

## Proof Gates

| # | Gate | Result |
|---|------|--------|
| PG-01 | npm run build exits 0 | PASS |
| PG-02 | Consumer Lending total > $1M | PASS ($2,084,387) |
| PG-03 | Mortgage total maintained ~$1M | PASS ($1,046,890) |
| PG-04 | Insurance Referral total > $0 | PASS ($125,400) |
| PG-05 | Insurance Referral has 5 derivation rules | PASS (5 rules, 5 product filters) |
| PG-06 | Grand total > $2M | PASS ($3,256,677) |
| PG-07 | Zero hardcoded field names in convergence | PASS |
| PG-08 | Classification signals captured | PASS (350+ signals) |
| PG-09 | Convergence API returns 200 | PASS |
| PG-10 | No auth files modified | PASS |

**Result: 10/10 proof gates pass**

## Commits

1. `303e729` Phase 0: Diagnostic — plan intent + data inventory
2. `7e6dc28` Phase 1: Fix compound operation — postProcessing transform + isMarginal auto-detection
3. `2f5b8c4` Phase 2: Convergence service — semantic matching + filter-based derivation generation
4. `d22bc19` Phase 3-4: Convergence API endpoint + wire into import pipeline
5. `7aacfe3` Phase 5: Integrated test — all financial proof gates pass
