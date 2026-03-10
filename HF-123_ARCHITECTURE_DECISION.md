# HF-123 Phase 0: Architecture Decision Record
## Tier Lookup Structural Fix — Exclusive Upper Bounds

### Problem
`evaluateTierLookup` uses inclusive upper bounds (`metricValue <= max`) for ALL tiers. When consecutive tiers share a boundary value (e.g., Tier 1 max=85, Tier 2 min=85), a metric at the boundary matches the LOWER tier because it's checked first. This misclassifies the employee by one tier.

### Evidence
Meridian C2 On-Time Delivery tier boundaries:
```
Tier 1: [0, 85]  → value=0     "Menos de 85%"
Tier 2: [85, 90] → value=100   "85%-89%"
```

With `metricValue >= 0 && metricValue <= 85`, a value of 85.0 matches Tier 1 → payout=0.
GT says 85% is in the "85%-89%" band → payout=100.
One employee at the 85% boundary produces the exact MX$100 delta.

### Key Finding: Output Values Are Correct
The values 350, 600, 1200 ARE in the plan's tier tables:
- **Standard:** 0, 100, 200, 350, 600
- **Senior:** 0, 200, 400, 700, 1200

The evaluator returns `tier.value` directly (allRates=false since 100>1.0). The spec's GT output set was based on assumed values, not the actual plan data.

### Fix
Change boundary matching from `[min, max]` to `[min, max)` for non-last tiers:
- Standard convention for step functions (tax brackets, insurance tiers, shipping rates)
- The intent executor already avoids this by using max=84.999 boundaries
- The evaluator should use `metricValue < max` for non-last tiers, `metricValue <= max` for the last tier

### Governing Principles
```
G4 - Discrete mathematics: tier lookups are step functions with half-open intervals [min, max)
G5 - Abstraction: half-open intervals apply to any step function in any domain
```

---
*HF-123 Phase 0 | March 10, 2026*
