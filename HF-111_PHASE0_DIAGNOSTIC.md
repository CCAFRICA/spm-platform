# HF-111 Phase 0: Convergence Column Binding Diagnostic

## Current Bug Location
`convergence-service.ts:759-825` — `generateComponentBindings()` picks the **highest-confidence measure column** for ALL components. Since all measure columns have the same confidence (from `buildFieldIdentitiesFromBindings`), every component gets the same column (first alphabetically or by insertion order, typically `Ingreso_Meta`).

## Why This Happens
The 3-pass matching (Pass 1-3) correctly identifies WHICH BATCH contains the data. But `generateComponentBindings` then selects a single measure column from that batch without considering which column each component actually needs.

```typescript
// Current code (line 773-778):
const measureEntries = Object.entries(capability.fieldIdentities)
  .filter(([, fi]) => fi.structuralType === 'measure');
// Takes highest confidence — same column for all components
const [colName, fi] = measureEntries.sort((a, b) => b[1].confidence - a[1].confidence)[0];
```

## The Fix Strategy
Each component's `calculationIntent` has boundaries that define the expected VALUE RANGE of its inputs:

- **bounded_lookup_2d** → `rowBoundaries` + `columnBoundaries` (two inputs)
- **bounded_lookup_1d** → `boundaries` (one input)
- **scalar_multiply** → rate + input (may have ratio sourceSpec)
- **conditional_gate** → condition.left (one input)

Match column value distributions against boundary ranges. Korean Test compliant: value characteristics, not names.

## Expected Correct Bindings (from spec)
```
Component 0 (bounded_lookup_2d): row → percentage-scale column, column → volume-scale column
Component 1 (bounded_lookup_1d): actual → percentage-scale column
Component 2 (scalar_multiply):   actual → small integer column (count)
Component 3 (conditional_gate):  actual → small integer column (incident count)
Component 4 (scalar_multiply):   numerator + denominator → volume columns
```

## Code Locations
- `generateComponentBindings` — convergence-service.ts:759 (column selection)
- `extractComponents` — convergence-service.ts:319 (reads calculationIntent but doesn't extract boundaries)
- `resolveMetricsFromConvergenceBindings` — route.ts:825 (engine reads bindings — only reads `actual` and `target`)
- `getExpectedMetricNames` — run-calculation.ts:527 (extracts metric field names from calculationIntent)
- `detectBoundaryScale` — convergence-service.ts:901 (already extracts boundaries for scale detection)

---
*HF-111 Phase 0 | March 9, 2026*
