# HF-122 Phase 0: Architecture Decision Record
## Calculation Precision Architecture (Decision 122 — DS-010)

### Problem
Engine uses IEEE 754 double-precision `number` for all arithmetic. Representational errors accumulate across primitives and entities. Meridian delta: MX$100.38 across 67 entities, attributable to C5 Fleet Utilization ratio × scalar_multiply chain. At 150K employees, ~MX$225K/month unexplained variance.

### Option A: decimal.js in intent executor only (CHOSEN)
- Scale test: 10x = ~670 entities, 100x arithmetic time but <5% total calc time
- AI-first: No AI changes. Below deterministic boundary.
- Transport: No change to data flow
- Atomicity: Decimal→number conversion at output boundary, zero risk of partial state

### Option B: Math.round() on component outputs
- Scale test: Works at any scale
- AI-first: N/A
- Transport: N/A
- Problem: round-half-up (systematic bias). No rounding trace. Doesn't fix representational error in intermediate computation. Fails GP-1 (IEEE 754) and GP-2 (Goldberg/Kahan).

### Option C: Full decimal.js across entire codebase
- Scale test: Overkill — import and display don't need decimal precision
- Over-engineering. Violates Scale by Design.

### CHOSEN: Option A
Decimal.js configured with ROUND_HALF_EVEN in intent executor. Per-component rounding after evaluation. Rounding trace in calculation_results.metadata.

### REJECTED: Option B — fails Governing Principles (bias, no trace, no root cause fix)
### REJECTED: Option C — unnecessary overhead in non-financial paths

### Governing Principles Evaluation (Decisions 123 & 124)
```
G1 - Standard Identification:
     IEEE 754-2019 (ROUND_HALF_EVEN), GAAP ASC 820 (line-item rounding),
     BIS 2018 (unbiased rounding), SOC1/SSAE 18 (audit transparency)

G2 - Architectural Embodiment:
     decimal.js configured with ROUND_HALF_EVEN at engine initialization.
     Rounding trace in calculation_results.metadata. Per-component precision
     from plan structure inference. Structural guarantee — not policy.

G3 - Traceability:
     IEEE 754 → decimal.js ROUND_HALF_EVEN config → intent-executor.ts primitives
     → roundComponentOutput in route.ts → rounding trace in calculation_results

G4 - Discipline Identification:
     Numerical analysis (Goldberg 1991, Kahan 1996), statistical mathematics
     (Central Limit Theorem), financial accounting (GAAP)

G5 - Abstraction Test:
     Banker's Rounding applies to any numerical computation at scale.
     outputPrecision is a number (0-10), not a currency code.
     Would survive domain pivot. PASS.

G6 - Innovation Boundary:
     All findings peer-reviewed or standards-body-endorsed. Zero speculation.
```

---
*HF-122 Phase 0 | March 10, 2026*
