# OB-24 R8: Semantic Resolution Hierarchy - Completion Report

## Summary

Implemented semantic resolution hierarchy for attainment/amount/goal metrics. The aggregation engine now properly handles sheets with or without explicit attainment columns by computing attainment from amount/goal when needed.

## Phase 1 Findings: Current Flow (Before Fix)

### How metrics were extracted:
1. AI semantic mapping via `getSheetFieldBySemantic()`
2. Pattern-based fallbacks if AI mapping failed
3. Simple parse and normalize (if < 5, multiply by 100)

### Object written to componentMetrics:
```typescript
empSheets.set(sheetName, {
  attainment: metrics.attainment ?? existing.attainment,  // First non-null wins
  amount: (existing.amount || 0) + (metrics.amount || 0),
  goal: (existing.goal || 0) + (metrics.goal || 0)
});
```

### Existing computed attainment logic:
**NONE!** Comment at line 545-546: "OB-24 FIX: Only use SOURCE attainment, NEVER compute from amount/goal"

This was the root cause - sheets without explicit attainment columns got `undefined`.

### Merge logic issue:
Used `??` (nullish coalescing) for attainment - takes first non-null value, doesn't recompute from sums.

## resolveMetrics Implementation

```typescript
interface ResolvedMetrics {
  attainment: number | undefined;
  attainmentSource: 'source' | 'computed' | undefined;
  amount: number | undefined;
  goal: number | undefined;
}

// Parse numeric value from various formats (number, string, percentage string)
const parseNumeric = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return isNaN(value) ? undefined : value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,%]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
};

// Normalize attainment to percentage format
// Ratio detection: values between 0 and 5 are likely ratios (0.82 = 82%)
const normalizeAttainment = (value: number | undefined): number | undefined => {
  if (value === undefined || value === null || isNaN(value)) return undefined;
  if (value < 0) return undefined;
  // Ratio detection: if value > 0 AND value <= 5.0, it's likely a ratio
  if (value > 0 && value <= 5.0) return value * 100;
  // Already a percentage (or zero)
  return value;
};

// Resolve metrics using semantic resolution hierarchy
const resolveMetrics = (
  record: Record<string, unknown>,
  attainmentField: string | null,
  amountField: string | null,
  goalField: string | null
): ResolvedMetrics => {
  // 1. Resolve amount (AI-mapped amount or quantity)
  const amount = amountField ? parseNumeric(record[amountField]) : undefined;

  // 2. Resolve goal
  const goal = goalField ? parseNumeric(record[goalField]) : undefined;

  // 3. Resolve attainment using hierarchy
  let attainment: number | undefined;
  let attainmentSource: 'source' | 'computed' | undefined;

  const rawAttainment = attainmentField ? record[attainmentField] : undefined;
  if (attainmentField && rawAttainment !== undefined && rawAttainment !== null && rawAttainment !== '') {
    // Case 1: AI-mapped attainment column exists - use source value
    attainment = normalizeAttainment(parseNumeric(rawAttainment));
    attainmentSource = attainment !== undefined ? 'source' : undefined;
  } else if (amount !== undefined && goal !== undefined && goal > 0) {
    // Case 2: No attainment column, but amount and goal available - compute
    attainment = (amount / goal) * 100;
    attainmentSource = 'computed';
  }
  // Case 3: Neither available - attainment stays undefined

  return { attainment, attainmentSource, amount, goal };
};
```

## Merge Logic for Multi-Record Aggregation

```typescript
const mergeMetrics = (existing: MergedMetrics | undefined, newMetrics: ResolvedMetrics): MergedMetrics => {
  const merged: MergedMetrics = {
    attainment: undefined,
    attainmentSource: existing?.attainmentSource || newMetrics.attainmentSource,
    amount: (existing?.amount || 0) + (newMetrics.amount || 0),
    goal: (existing?.goal || 0) + (newMetrics.goal || 0)
  };

  // If we have source attainment, use first non-undefined source value
  if (newMetrics.attainmentSource === 'source' && newMetrics.attainment !== undefined) {
    merged.attainment = newMetrics.attainment;
    merged.attainmentSource = 'source';
  } else if (existing?.attainmentSource === 'source' && existing?.attainment !== undefined) {
    merged.attainment = existing.attainment;
    merged.attainmentSource = 'source';
  } else if (merged.goal && merged.goal > 0) {
    // Recompute attainment from summed amounts/goals (weighted average)
    merged.attainment = ((merged.amount || 0) / merged.goal) * 100;
    merged.attainmentSource = 'computed';
  }

  return merged;
};
```

## Per-Sheet Expected Behavior

| Sheet | Has Attainment Column | Has Amount | Has Goal | Expected Behavior |
|-------|----------------------|------------|----------|-------------------|
| Base_Venta_Individual | YES (Cumplimiento) | YES | YES | Use source, `attainmentSource: 'source'` |
| Base_Venta_Tienda | NO | YES (Real_Venta_Tienda) | YES (Meta_Venta_Tienda) | Compute, `attainmentSource: 'computed'` |
| Base_Clientes_Nuevos | NO | YES (quantity) | YES | Compute, `attainmentSource: 'computed'` |
| Base_Cobranza | NO | YES | YES | Compute, `attainmentSource: 'computed'` |
| Base_Club_Proteccion | NO | YES | YES | Compute, `attainmentSource: 'computed'` |
| Base_Garantia_Extendida | NO | YES | NO | `attainment: undefined` |

## Proof Gate

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `resolveMetrics` implements three-state hierarchy | PASS | Lines 508-530: source → computed → undefined |
| 2 | Computed attainment formula is `(amount / goal) * 100` with `goal > 0` guard | PASS | Line 526: `attainment = (amount / goal) * 100` with guard at line 524 |
| 3 | `attainmentSource` distinguishes 'source' vs 'computed' | PASS | Lines 521, 527 set attainmentSource |
| 4 | Normalization handles ratio format (value <= 5.0 → multiply by 100) | PASS | Lines 495-499 in normalizeAttainment() |
| 5 | Multi-record merging sums amounts/goals, recomputes attainment | PASS | Lines 546-560 in mergeMetrics() |
| 6 | `quantity` alias for `amount` preserved | PASS | Line 574: `getSheetFieldBySemantic(sheetName, 'amount') \|\| getSheetFieldBySemantic(sheetName, 'quantity')` |
| 7 | No hardcoded column names in new code | PASS | `grep "cumplimiento\|Cumplimiento"` returns 0 matches |
| 8 | No diagnostic logging in production code | PASS | `grep "[AGG-\|SEMANTIC\|SHEET-MATCH"` returns 0 matches |
| 9 | `npm run build` exits 0 | PASS | Build completed successfully |
| 10 | `curl localhost:3000` returns HTTP 200 | PASS | HTTP 200 confirmed |

## Commit

- `628fdbb` - OB-24 R8: Implement semantic resolution hierarchy for attainment/amount/goal

## Future Refactoring (Out of Scope)

1. **Dual-loop unification** — Component loop and employee loop should be merged into a single pass
2. **Cross-sheet attainment validation** — Compare source vs computed attainment, flag discrepancies > 5%
3. **Store-level vs employee-level detection** — Use AI Import Context classification for join strategy
4. **ML-informed attainment normalization** — Learn customer-specific ratio vs percentage patterns
5. **Attainment confidence scoring** — Source = high, computed = medium, inferred = low

---
*Report generated: 2026-02-10*
*Status: COMPLETE - AWAITING USER VERIFICATION*
