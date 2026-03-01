# Architecture Decision Record — OB-128

## Date: 2026-03-01
## Status: ACCEPTED
## Decision: Semantic Role-Aware Convergence

---

## Problem

Convergence skips target-derived metrics because the actuals metric already exists.
The engine needs BOTH an actuals metric and a target metric to compute attainment as a ratio.

Current merge logic in `converge/route.ts:70`:
```typescript
if (!merged.some(e => e.metric === d.metric)) {
  merged.push(d);
}
```

When OB-127 SCI commits target data with `performance_target` semantic role, convergence
generates a derivation for the same component metric. The merge logic skips it because
the actuals derivation already targets that metric. The target data is committed but never
referenced by any derivation.

Result: DG bounded_lookup_1d receives raw sum (deposit balance) instead of attainment
percentage. Every entity exceeds the top tier → uniform $30K → F-04 open.

---

## Options

### Option A: Semantic role-aware convergence with ratio derivation

- Convergence reads `semantic_roles` from `committed_data.metadata`
- When `performance_target` data exists alongside actuals for the same component:
  - Rename existing actuals derivation to `{metric}_actuals`
  - Generate target derivation as `{metric}_target`
  - Generate ratio derivation: `{metric}` = ratio(`_actuals` / `_target`) × scale
- Add `ratio` operation to MetricDerivationRule
- The ratio runs AFTER sum derivations, overwrites metric with attainment percentage
- Legacy evaluator sees correct percentage → correct tier lookup → variable payouts
- Scale: YES. AI-first: YES. Atomic: YES. Korean Test: YES.

### Option B: Naming convention for target metrics

- Actuals metric: `deposit_growth_attainment`
- Target metric: `deposit_growth_target`
- Different names bypass the dedup
- Manually compose the intent
- Scale: YES but fragile naming dependency. AI-first: NO — relies on naming conventions.

### Option C: Modify calculationIntent to use composed ratio

- Change the plan component's calculationIntent to use RatioOp → BoundedLookup1D
- Relies on the intent executor fallback path (only triggered when legacy evaluator returns $0)
- Would NOT work: legacy evaluator returns $30K (top tier), so fallback never triggers
- Would require changing the primary evaluation path — high regression risk.

---

## Decision: Option A — Ratio Derivation Pipeline

The ratio derivation approach is cleanest because:

1. It operates entirely within the metric derivation pipeline (no intent changes needed)
2. The legacy evaluator receives the correct attainment percentage naturally
3. No changes to the calculation engine's evaluation path (zero regression risk)
4. The ratio operation is domain-agnostic: `numerator_metric / denominator_metric × scale_factor`
5. Convergence discovers field names from runtime semantic_roles (Korean Test compliant)
6. Idempotent: re-running convergence produces the same derivation set

### REJECTED: Option B — naming conventions are hardcoded patterns (Rule 1 violation)
### REJECTED: Option C — depends on fallback path that won't trigger for DG ($30K ≠ $0)

---

## Implementation Plan

### MetricDerivationRule (run-calculation.ts)
```typescript
operation: 'count' | 'sum' | 'delta' | 'ratio';
numerator_metric?: string;   // for ratio: name of metric to use as numerator
denominator_metric?: string; // for ratio: name of metric to use as denominator
scale_factor?: number;       // for ratio: multiply result (100 for percentage)
```

### Convergence Service (convergence-service.ts)
1. Read `metadata.semantic_roles` during data inventory
2. Detect actuals-target pairs via semantic role matching
3. Generate three derivations: `_actuals` (sum), `_target` (sum), base (ratio)

### Merge Logic (converge/route.ts)
When a ratio derivation targets the same metric as an existing derivation:
- Rename existing to `{metric}_actuals`
- Add both target and ratio derivations

### Derivation Execution (run-calculation.ts)
Process in order: sum derivations first, then ratio derivation computes from resolved values.
