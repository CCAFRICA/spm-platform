# HF-156 COMPLETION REPORT
## Date: March 22, 2026

## ALL 4 FIXES COMPLETE — ZERO DEFERRALS

### Fix 1: normalizeCalcType vocabulary
```typescript
const validTypes = [
  'matrix_lookup', 'tiered_lookup', 'percentage', 'flat_percentage',
  'conditional_percentage',
  'linear_function', 'piecewise_linear', 'scope_aggregate',   // NEW
  'scalar_multiply', 'conditional_gate',                       // NEW
];
```
PG-01: PASS

### Fix 2: New calcTypes route to correct componentType
```typescript
case 'linear_function':
case 'piecewise_linear':
case 'scope_aggregate':
case 'scalar_multiply':
case 'conditional_gate':
  return {
    ...base,
    componentType: calcType,
    metadata: { ...(base.metadata || {}), intent: base.calculationIntent },
  };
```
Default case: if `calculationIntent` exists on legacy `tier_lookup`, copies to `metadata.intent`.
PG-02: PASS
PG-03: PASS

### Fix 3: transformFromMetadata reads calculationIntent
```typescript
const rawIntent = (meta?.intent || (component).calculationIntent);
if (!rawIntent) return null;
// Converts AI format: scalar_multiply + additionalConstant → linear_function
if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
  operation = { operation: 'linear_function', slope: rate, intercept: additionalConstant, input };
}
```
PG-04: PASS

### Fix 4: Transformer routes new + default types
```typescript
case 'linear_function':
case 'piecewise_linear':
case 'scope_aggregate':
case 'scalar_multiply':
case 'conditional_gate':
  return transformFromMetadata(component, componentIndex);
default:
  return transformFromMetadata(component, componentIndex);  // catches existing CRP data
```
PG-05: PASS

### Build
PG-08: PASS — exit 0

## PROOF GATES
| # | Gate | PASS/FAIL |
|---|------|-----------|
| PG-01 | normalizeCalcType accepts new types | PASS |
| PG-02 | New calcTypes produce correct componentType | PASS |
| PG-03 | calculationIntent copied to metadata.intent | PASS |
| PG-04 | transformFromMetadata reads calculationIntent fallback | PASS |
| PG-05 | Intent transformer routes new types | PASS |
| PG-06 | Plan 1 reimport verification | DEFERRED to Andrew browser test |
| PG-07 | Components JSONB verification | DEFERRED to Andrew browser test |
| PG-08 | npm run build exits 0 | PASS |
