# OB-30 Step 4: Variant Selection Fix

## Root Cause (PROVEN by diagnostic)

The `findMatchingVariant()` function in `calculation-engine.ts` used `.find()` which returns the FIRST matching variant. The matching logic was:

```typescript
if (!variant.eligibilityCriteria) return true;  // Match if no criteria
```

This caused variants with empty `eligibilityCriteria: {}` (set by `ai-plan-interpreter.ts`) to match ALL employees before checking variants with explicit criteria.

## Diagnostic Evidence

| Log | What It Showed | Status |
|-----|----------------|--------|
| DIAG-1 | role = "OPTOMETRISTA NO CERTIFICADO" | Correct |
| DIAG-2 | deriveIsCertified = false | Correct |
| DIAG-3 | isCertified assigned false at PRIORITY 0 | Correct |
| DIAG-4 | findMatchingVariant receives isCertified=false, 2 variants | BUG HERE |

The bug: `findMatchingVariant()` received correct input (`isCertified=false`) but returned the certified variant because:
1. First variant had empty/no eligibilityCriteria
2. `!{}` is `false` (empty object is truthy), so line 206 didn't match
3. `'isCertified' in {}` is `false`, so the rejection logic was skipped
4. Function returned `true` for the first variant (certified)

## The Fix

**File:** `src/lib/compensation/calculation-engine.ts`
**Function:** `findMatchingVariant`

### Before (broken):
```typescript
function findMatchingVariant(config, metrics) {
  const employeeIsCertified = metrics.isCertified ?? false;
  return config.variants.find((variant) => {
    if (!variant.eligibilityCriteria) return true;  // BUG: empty {} doesn't trigger
    if ('isCertified' in variant.eligibilityCriteria &&
        variant.eligibilityCriteria.isCertified !== employeeIsCertified) {
      return false;
    }
    return true;
  });
}
```

### After (fixed):
```typescript
function findMatchingVariant(config, metrics) {
  const employeeIsCertified = metrics.isCertified ?? false;

  // First pass: Find variant with EXPLICIT isCertified match
  const exactMatch = config.variants.find((variant) => {
    const criteria = variant.eligibilityCriteria;
    if (!criteria || typeof criteria !== 'object' || Object.keys(criteria).length === 0) {
      return false;  // Skip no-criteria variants on first pass
    }
    if ('isCertified' in criteria) {
      return criteria.isCertified === employeeIsCertified;  // Explicit match
    }
    return false;
  });
  if (exactMatch) return exactMatch;

  // Second pass: Find variant with no criteria (universal fallback)
  return config.variants.find((variant) => {
    const criteria = variant.eligibilityCriteria;
    return !criteria || typeof criteria !== 'object' || Object.keys(criteria).length === 0;
  });
}
```

## Why 9 prior attempts failed

All prior fixes targeted:
- `deriveIsCertified()` in calculation-orchestrator.ts
- PRIORITY paths in `getEmployeeMetrics()`
- `buildEmployeeMetrics()` in context-resolver.ts

**The derivation was always correct.** The bug was in the ENGINE's variant matching logic which used `.find()` returning the first match instead of the BEST match.

## Proof Gate

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Variant Issues drops from 172 | Run reconciliation script |
| 2 | Employee 90198149 shows non-certified | Check reconciliation output |
| 3 | VL Total changes from $1,263,831 | Check new total |
| 4 | All DIAG lines removed | `grep -r "DIAG-" src/` returns 0 |
| 5 | Build succeeds | exit 0 |
| 6 | Dev server responds | http://localhost:3000 |

## Files Modified

1. `src/lib/compensation/calculation-engine.ts` - Fixed findMatchingVariant()
2. `src/lib/orchestration/calculation-orchestrator.ts` - Removed diagnostic logs

## Date

February 12, 2026
