# HF-115 Phase 0: Architecture Decision Record

## Problem
Correct convergence bindings produce wrong calculation results due to scale mismatch between plan parameters and data values. Fleet Utilization: `rate (800) x utilization_percentage (82.9) = 66,340` instead of `rate (800) x ratio (0.829) = 663`. The bindings are correct (right columns), but the engine multiplies rate by a percentage instead of a ratio.

## Findings from Code Inspection

1. **Where bindings are assembled:** `generateAllComponentBindings()` at convergence-service.ts:1031-1198
2. **Where bindings are written to DB:** SCI execute route at `web/src/app/api/import/sci/execute/route.ts:217-220` — writes `componentBindings` as `convergence_bindings` in `rule_sets.input_bindings`
3. **Where scale_factor is currently set:** `scoreColumnForRequirement()` at convergence-service.ts:881-928 tries scales `[1, 100]` for boundary matching. Scale_factor stored in binding at line 1129: `scale_factor: scaleFactor !== 1 ? scaleFactor : undefined`
4. **How engine uses rate x baseAmount:**
   - For ratio components: `resolveMetricsFromConvergenceBindings()` at route.ts:847-858 computes `numValue / denValue`, then applies scale_factor to each before division
   - For scalar_multiply: `executeScalarMultiply()` at intent-executor.ts:212-223 does `inputValue * rateValue`
   - For percentage: `evaluatePercentage()` at run-calculation.ts:234-254 does `base * config.rate`
5. **What data is available at binding time:** `inventoryData()` at convergence-service.ts:415-608 fetches committed_data rows with row_data, metadata, field_identities. Computes per-column `ColumnValueStats` (min, max, mean, sampleCount) at lines 553-576.

## Key Insight

The validation must happen in convergence AFTER binding assembly because:
- All component bindings are available (can compare cross-component)
- Column statistics (min, max, mean) are available from `inventoryData()`
- Component definitions (rate, operation type, boundaries) are available from `extractComponents()`
- Bindings can be modified before the DB write in `convergeBindings()` return

The validation should run between `generateAllComponentBindings()` (line 177) and `return` (line 325) in `convergeBindings()`.

## Options

### Option A: Add validation step in convergence after binding assembly, before DB write
- Scale test: Works at 10x? YES — profiles column distributions from committed_data samples already available
- AI-first: Any hardcoding? NO — structural detection via cross-component ratio comparison (>10x median = anomaly)
- Transport: Data through HTTP bodies? NO — all data already in memory from `inventoryData()`
- Atomicity: Clean state on failure? YES — validation modifies bindings in-memory before return; no partial writes

### Option B: Add validation in the engine before calculation
- Scale test: Works at 10x? YES
- AI-first: Any hardcoding? NO
- Transport: Data through HTTP bodies? NO
- Atomicity: Clean state on failure? NO — bindings already written to DB, would need to modify engine's interpretation of stored bindings

### Option C: Add scale_factor inference to convergence binding based on value distribution alone
- Scale test: Works at 10x? YES
- AI-first: Any hardcoding? NO
- Transport: Data through HTTP bodies? NO
- Atomicity: Clean state on failure? YES
- But: Cannot reliably infer correct scale without cross-component comparison — single-column distribution analysis can't distinguish "intentionally large" from "scale error"

## Decision

**CHOSEN: Option A** — validation in convergence after binding assembly.
- Best information available (all bindings + all column stats + all component definitions)
- Modifications happen before DB write (atomic)
- Cross-component comparison provides the signal (single-column analysis cannot)

**REJECTED: Option B** — too late, bindings already persisted. Would create divergence between stored bindings and engine behavior.
**REJECTED: Option C** — insufficient signal for reliable detection without peer comparison.

## Integration Point

In `convergeBindings()` (convergence-service.ts), insert validation call between lines 177 (after `generateAllComponentBindings`) and line 287 (before gap detection):

```typescript
// After line 177: generateAllComponentBindings() completed
// HF-115: Cross-component plausibility check
await validateCalculationPlausibility(
  components, componentBindings, capabilities, tenantId, ruleSetId, supabase
);
// Existing code continues...
```

---
*HF-115 Phase 0 | March 9, 2026*
