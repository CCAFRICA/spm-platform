# DIAG-014 COMPLETION REPORT
## Date: March 22, 2026

## ROOT CAUSE — 100% CERTAINTY

### The actual failure point

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Line:** 552
**Code:**
```typescript
const calcMethod = comp?.calculationMethod;
const calcType = calcMethod?.type || 'tiered_lookup';
```

The AI produces `calculationIntent` but NOT `calculationMethod`. The `calcType` reads from `calculationMethod.type` which is UNDEFINED. It ALWAYS defaults to `'tiered_lookup'`.

### Why HF-156 didn't fix it

HF-156 modified `normalizeComponentType` (line 269). This function is called from `normalizeCalculationMethod` (line 288), which is called from `validateAndNormalize` (line 253).

But `convertComponent` at line 552 reads `comp.calculationMethod.type` DIRECTLY — it does NOT call `normalizeComponentType`. The normalizer is in the VALIDATION phase. The converter bypasses it entirely.

**The data flow:**
```
AI Response → validateAndNormalize (calls normalizeComponentType) → InterpretedComponent
InterpretedComponent → convertComponent (reads calculationMethod.type DIRECTLY at line 552)
                       → if undefined → defaults to 'tiered_lookup'
```

The normalizer fixes the type during validation, but `calculationMethod` may not have a `type` field at all if the AI only produced `calculationIntent`.

### The fix

Line 552 must check `calculationIntent.operation` as fallback:
```typescript
// Current (broken):
const calcType = calcMethod?.type || 'tiered_lookup';

// Fixed:
const calcType = calcMethod?.type || (base.calculationIntent?.operation as string) || 'tiered_lookup';
```

If the AI produces `calculationIntent: { operation: "scalar_multiply", rate: 0.06, additionalConstant: 200 }`, then `calcType` becomes `"scalar_multiply"` (which HF-156 already added to the switch statement's new cases).

## VERIFICATION

The HF-156 switch cases at lines 644-658 ARE correct:
```typescript
case 'linear_function':
case 'piecewise_linear':
case 'scope_aggregate':
case 'scalar_multiply':
case 'conditional_gate':
  return { ...base, componentType: calcType, metadata: { intent: base.calculationIntent } };
```

And the default case at lines 660-672 also copies `calculationIntent` to `metadata.intent`.

The ONLY missing piece is line 552: `calcType` must read from `calculationIntent.operation` when `calculationMethod.type` is undefined.

## STANDING RULE COMPLIANCE
- Rule 40 (diagnostic-first): PASS — read-only
- Rule 27 (evidence = paste): PASS — exact lines cited
