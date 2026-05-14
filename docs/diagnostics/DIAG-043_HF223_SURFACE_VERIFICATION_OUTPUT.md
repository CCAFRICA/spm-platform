# DIAG-043 -- HF-223 Implementation Surface Verification Output

**Date:** 2026-05-14T03:15:48Z
**Branch:** main (Phase 0 scaffolded on main; remote main is branch-protected so subsequent commits ride feature branch `diag-043-hf223-surface-verification` per CC standing PR-path discipline)
**HEAD commit at scaffold:** 70bf9c2abb77aa0ac2efaeaf913dacb28931be1a
**Predecessor:** DIAG-041 (pre-HF-222 code audit)
**Scope:** Three surfaces: IntentModifier type, applyModifiers function, plan_interpretation prompt

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.

---

## Phase 1 -- IntentModifier type definition (current)

**File:** `web/src/lib/calculation/intent-types.ts`
**Grep locate:**
```
203:export type IntentModifier =
239:  modifiers: IntentModifier[];
```

**Lines 203-207 (type union, verbatim):**

```typescript
export type IntentModifier =
  | { modifier: 'cap'; maxValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'floor'; minValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'proration'; numerator: IntentSource; denominator: IntentSource }
  | { modifier: 'temporal_adjustment'; lookbackPeriods: number; triggerCondition: IntentSource; adjustmentType: 'full_reversal' | 'partial' | 'prorated' };
```

**Surrounding usage context, lines 207-239 (verbatim):**

```typescript

// ──────────────────────────────────────────────
// Variant Routing — route to different operations
// based on entity attribute
// ──────────────────────────────────────────────

export interface VariantRouting {
  routingAttribute: IntentSource;
  routes: Array<{
    matchValue: string | number | boolean;
    intent: IntentOperation;
  }>;
  noMatchBehavior: 'error' | 'skip' | 'first';
}

// ──────────────────────────────────────────────
// Complete Component Intent
// ──────────────────────────────────────────────

export interface ComponentIntent {
  componentIndex: number;
  label: string;
  confidence: number;
  dataSource: {
    sheetClassification: string;
    entityScope: 'entity' | 'group';
    requiredMetrics: string[];
    groupLinkField?: string;
  };
  variants?: VariantRouting;
  intent?: IntentOperation;       // used when no variants
  modifiers: IntentModifier[];
```

## Phase 1.2 -- Delta from DIAG-041

DIAG-041 Phase 5.5 extracted lines 203-207. Current extraction (lines 203-207, this file) is byte-identical at the type-discriminant level.

Fields present in `cap` discriminant: `modifier`, `maxValue`, `scope`.

`applyTo` field grep over intent-types.ts:
```
$ grep -c "applyTo" web/src/lib/calculation/intent-types.ts
0
```
Zero hits. The `applyTo` field is structurally absent from the IntentModifier type union.

## Phase 1.3 -- IntentModifier consumers

```
$ grep -rn "IntentModifier\|\.modifier\b.*cap\|mod\.maxValue\|mod\.minValue\|mod\.modifier" \
    web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts"

web/src/lib/calculation/intent-executor.ts:28:  IntentModifier,
web/src/lib/calculation/intent-executor.ts:574:  modifiers: IntentModifier[],
web/src/lib/calculation/intent-executor.ts:583:    switch (mod.modifier) {
web/src/lib/calculation/intent-executor.ts:585:        const cap = toDecimal(mod.maxValue);
web/src/lib/calculation/intent-executor.ts:590:        const floor = toDecimal(mod.minValue);
web/src/lib/calculation/intent-executor.ts:606:    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
web/src/lib/calculation/intent-transformer.ts:17:  IntentModifier,
web/src/lib/calculation/intent-transformer.ts:183:  const modifiers: IntentModifier[] = [];
web/src/lib/calculation/intent-transformer.ts:188:      if (m.modifier === 'cap' && m.maxValue != null) {
web/src/lib/calculation/intent-types.ts:203:export type IntentModifier =
web/src/lib/calculation/intent-types.ts:239:  modifiers: IntentModifier[];
```

**Consumer count by file:**
- `intent-executor.ts`: 6 references (import, parameter signature, switch dispatch, two field reads, modifierLog emission)
- `intent-transformer.ts`: 3 references (import, local-array typing, modifier-rewrite condition)
- `intent-types.ts`: 2 references (type definition, ComponentIntent field)

---

## Phase 2.1 -- applyModifiers function body (current)

**File:** `web/src/lib/calculation/intent-executor.ts` lines 572-610 (verbatim):

```typescript
function applyModifiers(
  value: Decimal,
  modifiers: IntentModifier[],
  data: EntityData,
  modifierLog: Array<{ modifier: string; before: number; after: number }>
): Decimal {
  let result = value;

  for (const mod of modifiers) {
    const before = toNumber(result);

    switch (mod.modifier) {
      case 'cap': {
        const cap = toDecimal(mod.maxValue);
        result = result.gt(cap) ? cap : result;
        break;
      }
      case 'floor': {
        const floor = toDecimal(mod.minValue);
        result = result.lt(floor) ? floor : result;
        break;
      }
      case 'proration': {
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const num = resolveSource(mod.numerator, data, inputLog);
        const den = resolveSource(mod.denominator, data, inputLog);
        result = den.isZero() ? ZERO : result.mul(num.div(den));
        break;
      }
      case 'temporal_adjustment':
        // Temporal adjustment requires historical data — not applied in single-period execution
        break;
    }

    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
  }

  return result;
}
```

**Delta from DIAG-041 Phase 3.3 (lines 572-610 in current file vs 572-610 in DIAG-041 extraction):** byte-identical at the function-body level. No drift.

## Phase 2.2 -- applyModifiers call sites in executeIntent

**Single call site at line 683 of `executeIntent`. Surrounding context lines 677-688 (verbatim):**

```typescript
  } else if (intent.intent) {
    // 2. Execute single operation (no variants)
    outcome = executeOperation(intent.intent, entityData, inputLog, trace);
  }

  // 3. Apply modifiers
  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);

  // 4. Convert to native number at output boundary (Decision 122)
  const outcomeNumber = toNumber(outcome);
```

**Key answer to the directive's input-accessibility question:** at the line 683 call site, the resolved input value(s) (pre-operation) are NOT directly accessible as a separate `Decimal` reference in local scope. Only `outcome` (post-operation `Decimal`) and `inputLog` (a `Record` of resolved-input objects with `source/rawValue/resolvedValue:number` fields, keyed by source label) survive into the `applyModifiers` call. The `inputLog` carries pre-operation resolved values but **as `number`, not as `Decimal`**, and indexed by descriptor key rather than by operation slot. Any input-scoped modifier path that needs to apply to the pre-operation input would either (a) re-resolve from `intent.intent.input` against `EntityData` inside `applyModifiers` (currently `applyModifiers` does not receive the `intent.intent` operation tree — only `intent.modifiers` and `EntityData`), or (b) require `executeIntent` to surface the pre-operation Decimal explicitly to `applyModifiers`.

## Phase 2.3 -- executeScalarMultiply (current)

**File:** `web/src/lib/calculation/intent-executor.ts` lines 299-310 (verbatim):

```typescript
function executeScalarMultiply(
  op: ScalarMultiply,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  const rateValue = typeof op.rate === 'number'
    ? toDecimal(op.rate)
    : resolveValue(op.rate, data, inputLog, trace);
  return inputValue.mul(rateValue);
}
```

The function returns `inputValue.mul(rateValue)` — only the post-multiply `Decimal` is returned. The pre-multiply `inputValue` is a local `const` and is not surfaced to the caller.

## Phase 2.4 -- executeOperation dispatcher (current)

**File:** `web/src/lib/calculation/intent-executor.ts` lines 486-514 (verbatim):

```typescript
export function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  switch (op.operation) {
    case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
    case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
    case 'aggregate':         return executeAggregateOp(op, data, inputLog);
    case 'ratio':             return executeRatioOp(op, data, inputLog);
    case 'constant':          return executeConstantOp(op);
    case 'weighted_blend':    return executeWeightedBlend(op, data, inputLog, trace);
    case 'temporal_window':   return executeTemporalWindow(op, data, inputLog, trace);
    case 'linear_function':   return executeLinearFunction(op, data, inputLog, trace);
    case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
    default: {
      const operation = (op as { operation?: string }).operation ?? '<undefined>';
      throw new IntentExecutorUnknownOperationError(
        `[intent-executor] Unknown operation "${operation}" reached executeOperation. ` +
        `Foundational IntentOperation union admits only registered primitives. An unknown ` +
        `operation indicates either (1) an upstream cleanup gap producing a non-foundational ` +
        `operation string, or (2) data corruption in the persisted intent shape.`
      );
    }
  }
}
```

Returns only the post-operation `Decimal`. The eleven primitives include `conditional_gate` (which can nest other operations via `op.onTrue`/`op.onFalse`) — relevant to Option A's nested-operation rewrite path.

## Phase 2.5 -- Modifier trace emission sites

```
$ grep -n "modifierLog\|modifier.*before.*after\|trace.*modifiers" web/src/lib/calculation/intent-executor.ts
```

Output (verbatim):
```
576:  modifierLog: Array<{ modifier: string; before: number; after: number }>
606:    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
622:  const modifierLog: Array<{ modifier: string; before: number; after: number }> = [];
```

The trace shape is `{ modifier: string; before: number; after: number }` — three fields per modifier event. No `applyTo` field; no input-vs-output discrimination at the trace surface.
