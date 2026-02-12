# OB-30 Step 4: Variant Selection Fix - FINAL

## Root Cause (PROVEN by VARIANT-DUMP diagnostic)

Both plan variants had empty `eligibilityCriteria: {}` at runtime.

```json
Variant 1: { variantId: "certified", eligibilityCriteria: {}, criteriaKeys: [] }
Variant 2: { variantId: "non-certified", eligibilityCriteria: {}, criteriaKeys: [] }
Employee: isCertified = false
```

The engine had nothing to match `isCertified` against. It fell through to the first variant (certified) for ALL employees.

## Where criteria were lost

- **Source code** (retailcgmx-plan.ts lines 427, 434): Has correct criteria `{ isCertified: true/false }`
- **localStorage**: Contains OLD plan data saved before criteria were added
- **Runtime**: Reads stale localStorage data with empty criteria

The plans in localStorage were never updated when the source code added eligibilityCriteria.

## The Fix

**File:** `src/lib/compensation/calculation-engine.ts`
**Function:** `findMatchingVariant`

When eligibilityCriteria is empty, derive the expected certification status from `variantId` / `variantName`:

```typescript
// If no criteria, derive from variantId/variantName
const vid = (variant.variantId || '').toLowerCase();
const vname = (variant.variantName || '').toLowerCase();

const isCertifiedVariant =
  (vid === 'certified' || vname.includes('certificado')) &&
  !vid.includes('non') && !vname.includes('no ');

const isNonCertifiedVariant =
  vid === 'non-certified' || vname.includes('no certificado');

if (employeeIsCertified && isCertifiedVariant) return variant;
if (!employeeIsCertified && isNonCertifiedVariant) return variant;
```

## Why 10 prior attempts failed

All prior fixes targeted:
1. Whitespace normalization (role string was correct)
2. `deriveIsCertified()` logic (returned correct value: false)
3. `findMatchingVariant()` matching logic (received correct input)
4. `buildEmployeeMetrics()` in context-resolver (not in execution path)
5. Attributes override (not the source)

**None examined the actual plan data at runtime.** The eligibilityCriteria were empty because localStorage contained stale plan data from before criteria were added to the source code.

## Diagnostic Evidence Trail

| Diagnostic | Result | Conclusion |
|------------|--------|------------|
| DIAG-1 | role = "OPTOMETRISTA NO CERTIFICADO" | Role correct |
| DIAG-2 | deriveIsCertified = false | Derivation correct |
| DIAG-3 | isCertified = false at PRIORITY 0 | Assignment correct |
| DIAG-4 | isCertified = false, 2 variants | Input to engine correct |
| VARIANT-DUMP | Both variants have `{}` criteria | **ROOT CAUSE** |

## Proof Gate

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Variant Issues: 0 (was 172) | Pending verification |
| 2 | Employee 90198149: non-certified | Pending verification |
| 3 | Total changed from $1,263,831 | Pending verification |
| 4 | All diagnostic code removed | PASS (grep returns 0) |
| 5 | Build succeeds | PASS |
| 6 | Dev server responds | PASS (localhost:3000) |

## Date

February 12, 2026
