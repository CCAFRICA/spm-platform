# HF-116 Phase 0: Architecture Decision Record

## Problem
Engine multiplies ratio by 100 before applying rate in percentage components. Fleet Utilization: `800 x 0.8293 = 663` expected, but engine computes `800 x 82.93 = 66,340`.

## Findings from Code Inspection

### 1. The x100 happens at: route.ts:1090-1093

```typescript
// OB-146: Normalize derived attainment metrics from decimal to percentage.
for (const [key, value] of Object.entries(metrics)) {
  if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
    metrics[key] = value * 100;
  }
}
```

### 2. Why it matches Fleet Utilization

`inferSemanticType('hub_utilization_rate')` returns `'attainment'` because `ATTAINMENT_PATTERNS` (metric-resolver.ts:18-28) includes `/rate/i`. The ratio 0.8293 is between 0 and 10, so it gets multiplied by 100 to 82.93.

### 3. When it's correct

For the old `buildMetricsForComponent` / `derivedMetrics` path, decimal attainment values (e.g., `Cumplimiento = 1.165`) need conversion to percentage scale (116.5) for tier/matrix boundary matching. The comment says "buildMetricsForComponent normalizes but the derivation override can re-introduce decimal values."

### 4. When it's wrong

For the convergence binding path (`usedConvergenceBindings = true`), scaling is handled by `scale_factor` in the binding itself. Revenue Performance and On-Time Delivery bindings have `scale_factor: 100`, which already converts their values to percentage scale. Fleet Utilization has no scale_factor on its ratio binding — the raw ratio (0.829) is the correct input. The x100 normalization double-scales components that already have scale_factor AND incorrectly scales components that should use raw values.

## The Fix

Skip the OB-146 normalization when convergence bindings were used to resolve metrics. Convergence bindings handle all scaling via the `scale_factor` field — the normalization is only needed for the legacy `buildMetricsForComponent` / `derivedMetrics` path.

```typescript
// Only normalize for legacy path — convergence bindings handle scaling via scale_factor
if (!usedConvergenceBindings) {
  for (const [key, value] of Object.entries(metrics)) {
    if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
      metrics[key] = value * 100;
    }
  }
}
```

- **Where:** route.ts:1087-1094
- **Impact:** All convergence-path components. No change to legacy path.
- **Korean Test:** No field-name references. Condition is `usedConvergenceBindings`, not component name.
- **Scale:** Works for any ratio component, any plan.

## Verification

| Component | Before Fix | After Fix | Why |
|---|---|---|---|
| Revenue Performance (matrix) | ✅ Works (scale_factor=100 on binding) | ✅ Still works (scale_factor=100 already applied in resolveMetricsFromConvergenceBindings) |
| On-Time Delivery (tier) | ✅ Works (scale_factor=100 on binding) | ✅ Still works (same reason) |
| New Accounts (scalar_multiply) | ✅ Works (count × rate) | ✅ Still works (integer count, not affected by normalization) |
| Safety Record (conditional_gate) | ✅ Works (gate passes) | ✅ Still works (gate logic unchanged) |
| Fleet Utilization (percentage) | ❌ 82.93 (x100 applied) | ✅ 0.829 (raw ratio preserved) |

**CHOSEN:** Skip normalization for convergence path.
**REJECTED:** Component-type conditional (fragile — new component types would need to opt-in/out). Modifying `inferSemanticType` (would break legitimate attainment normalization in legacy path).

---
*HF-116 Phase 0 | March 10, 2026*
