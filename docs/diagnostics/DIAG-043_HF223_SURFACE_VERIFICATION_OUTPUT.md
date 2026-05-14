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

---

## Phase 3.1 -- plan_interpretation prompt locator

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`

```
$ grep -n "plan_interpretation" web/src/lib/ai/providers/anthropic-adapter.ts
207:  plan_interpretation: `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content, INCLUDING ALL PAYOUT VALUES.
892:    // plan_interpretation + document_analysis. Korean Test (E910) holds at the
911:    if (pdfBase64 && (request.task === 'plan_interpretation' || request.task === 'document_analysis')) {
1056:      case 'plan_interpretation': {
```

Prompt template starts at line 207. The full prompt is a single template literal extending through line 615 (closing backtick after `Return your analysis as valid JSON.`).

## Phase 3.2 -- Plan-interpretation prompt cap/modifier section (current)

**Cap example block, lines 600-611 (verbatim):**

```typescript
EXAMPLE calculationIntent for a linear_function with cap modifier:
{
  "calculationIntent": {
    "operation": "linear_function",
    "input": { "source": "metric", "sourceSpec": { "field": "revenue" } },
    "slope": 0.06,
    "intercept": 200,
    "modifiers": [
      { "modifier": "cap", "maxValue": 5000 }
    ]
  }
}
```

**Closing instruction, lines 613-615 (verbatim):**

```typescript
CRITICAL: Every component MUST include both "calculationMethod" (existing format) AND "calculationIntent" (structural vocabulary). The calculationIntent must be valid against the 7 primitives above.

Return your analysis as valid JSON.`,
```

**Delta from DIAG-041 Phase 5.4 (which extracted lines 600-611):** byte-identical to the cap example currently at lines 600-611. No drift.

## Phase 3.3 -- Primitive examples in prompt (scalar_multiply focus)

Locator grep:
```
$ grep -n "EXAMPLE calculationIntent" web/src/lib/ai/providers/anthropic-adapter.ts
459:EXAMPLE calculationIntent for bounded_lookup_1d (half-open partition, open-ended ceiling):
475:EXAMPLE calculationIntent for bounded_lookup_2d (half-open partitions on both axes):
500:EXAMPLE calculationIntent for scalar_multiply:
509:EXAMPLE calculationIntent for conditional_gate (2 conditions, sorted by threshold descending):
540:EXAMPLE calculationIntent for a linear_function:
550:EXAMPLE calculationIntent for a piecewise_linear:
564:EXAMPLE calculationIntent for a scope_aggregate:
573:EXAMPLE calculationIntent for a conditional_gate (binary prerequisite):
591:EXAMPLE calculationIntent for a scalar_multiply:
600:EXAMPLE calculationIntent for a linear_function with cap modifier:
```

**scalar_multiply example at line 500-507 (verbatim — first instance, "warranty_sales"):**

```typescript
EXAMPLE calculationIntent for scalar_multiply:
{
  "calculationIntent": {
    "operation": "scalar_multiply",
    "input": { "source": "metric", "sourceSpec": { "field": "warranty_sales" } },
    "rate": 0.04
  }
}
```

**scalar_multiply example at line 591-598 (verbatim — second instance, "sales_amount"):**

```typescript
EXAMPLE calculationIntent for a scalar_multiply:
{
  "calculationIntent": {
    "operation": "scalar_multiply",
    "input": { "source": "metric", "sourceSpec": { "field": "sales_amount" } },
    "rate": 0.04
  }
}
```

**Observations on scalar_multiply teaching (verbatim from prompt structure, no interpretation):**
- Both scalar_multiply examples take `input` as `{ source: "metric", sourceSpec: { field: <name> } }` — neither uses `ratio` as the input source.
- Neither scalar_multiply example carries a `modifiers` array.
- The only example combining a primitive with a cap modifier is the `linear_function` at lines 600-611, not a `scalar_multiply` with `ratio` input.
- No example demonstrates a ratio-space cap (clamp before multiply); the single cap example caps the post-`linear_function` payout.

## Phase 3.4 -- Modifier instruction section in prompt

**All `modifier`/`cap`/`floor`/`proration` references inside the plan_interpretation prompt body (lines 207-615):**

```
$ grep -n "modifier\|cap\|floor\|proration" web/src/lib/ai/providers/anthropic-adapter.ts
453:  - maxInclusive: true (capped; includes the ceiling)
600:EXAMPLE calculationIntent for a linear_function with cap modifier:
607:    "modifiers": [
608:      { "modifier": "cap", "maxValue": 5000 }
```

(Lines 999 and beyond are outside the plan_interpretation template literal; they appear elsewhere in the file.)

**Line 453 context (verbatim, lines 449-456 — covers the `maxInclusive` usage):**

```typescript
- min: lower boundary (inclusive unless minInclusive=false)
- max: upper boundary (inclusive unless maxInclusive=false; null = unbounded ceiling)
- minInclusive: defaults to true (typical case)
- maxInclusive: defaults to false (half-open partitions)
- maxInclusive: true (capped; includes the ceiling)
- Boundaries must NOT overlap. Adjacent boundaries: previous max == next min (half-open avoids gap and overlap).
- Boundary ordering: prefer ascending min; the engine doesn't require it, but Index 0 should be the lowest band.
```

(The `capped` reference at line 453 is about lookup-grid boundary `maxInclusive: true`, not about the cap modifier.)

**Complete inventory of modifier instructions in the plan_interpretation prompt:** the cap example block at lines 600-611 is the **only** instruction the LLM receives about modifiers. There is no `floor`, `proration`, `temporal_adjustment`, or `applyTo`-related text in the prompt body. There is no narrative description of when to emit a cap modifier vs nesting a clamp inside the operation tree. The prompt teaches the cap pattern by example only.

---

## Phase 4.1 -- Transformer modifier handling (current)

**File:** `web/src/lib/calculation/intent-transformer.ts`

Locator grep:
```
$ grep -n "modifier\|modifiers\|cap\|floor\|applyTo" web/src/lib/calculation/intent-transformer.ts
183:  const modifiers: IntentModifier[] = [];
185:  if (Array.isArray(rawIntent.modifiers)) {
186:    for (const mod of rawIntent.modifiers) {
188:      if (m.modifier === 'cap' && m.maxValue != null) {
189:        modifiers.push({ modifier: 'cap', maxValue: Number(m.maxValue), scope: 'per_period' });
191:      if (m.modifier === 'floor' && m.minValue != null) {
192:        modifiers.push({ modifier: 'floor', minValue: Number(m.minValue), scope: 'per_period' });
197:  if (meta.cap != null && Number(meta.cap) > 0) {
198:    modifiers.push({ modifier: 'cap', maxValue: Number(meta.cap), scope: 'per_period' });
200:  if (meta.floor != null && Number(meta.floor) > 0) {
201:    modifiers.push({ modifier: 'floor', minValue: Number(meta.floor), scope: 'per_period' });
214:    modifiers,
```

`applyTo` grep: zero hits in intent-transformer.ts.

**Modifier handling block, lines 183-202 (verbatim):**

```typescript
  const modifiers: IntentModifier[] = [];

  if (Array.isArray(rawIntent.modifiers)) {
    for (const mod of rawIntent.modifiers) {
      const m = mod as Record<string, unknown>;
      if (m.modifier === 'cap' && m.maxValue != null) {
        modifiers.push({ modifier: 'cap', maxValue: Number(m.maxValue), scope: 'per_period' });
      }
      if (m.modifier === 'floor' && m.minValue != null) {
        modifiers.push({ modifier: 'floor', minValue: Number(m.minValue), scope: 'per_period' });
      }
    }
  }

  if (meta.cap != null && Number(meta.cap) > 0) {
    modifiers.push({ modifier: 'cap', maxValue: Number(meta.cap), scope: 'per_period' });
  }
  if (meta.floor != null && Number(meta.floor) > 0) {
    modifiers.push({ modifier: 'floor', minValue: Number(meta.floor), scope: 'per_period' });
  }
```

**Delta from DIAG-041 Phase 4.3 (which extracted lines 185-202):** byte-identical at the per-entry modifier-rewrite path (lines 185-194) and the top-level `meta.cap`/`meta.floor` shortcut (lines 197-202). No drift. The transformer:
- Reads `rawIntent.modifiers[]` and pushes `cap`/`floor` entries with hardcoded `scope: 'per_period'`.
- Silently discards modifier types other than `cap` and `floor` (e.g., a `proration` or `temporal_adjustment` from LLM would be dropped at lines 185-194).
- Synthesises additional `cap`/`floor` entries from `meta.cap`/`meta.floor` shortcut fields.
- Does not pass through any `applyTo` field (no such field exists in the type or in the transformer logic).

**Modifier output is attached to the ComponentIntent at line 214:**

```typescript
    intent: operation,
    modifiers,
```

## Phase 4.2 -- Transformer call sites in route.ts (current line numbers)

```
$ grep -n "transformVariant\|transformFromMetadata" web/src/app/api/calculation/run/route.ts
27:import { transformVariant } from '@/lib/calculation/intent-transformer';
341:  const componentIntents: ComponentIntent[] = transformVariant(defaultComponents);
2243:      : transformVariant(selectedComponents);
```

- **Line 27:** import of `transformVariant`.
- **Line 341:** initial transformation of `defaultComponents` (used pre-variant-routing).
- **Line 2243:** per-entity transformation of `selectedComponents` (variant-routed components).

`transformFromMetadata` is not directly invoked from `route.ts` — it is called transitively via `transformVariant`. Both call sites at line 341 and 2243 are post-HF-222 line numbers (line 2243 is the per-entity variant-routed path which moved during HF-222 Phase 3.5c verification-block rewrite, though `transformVariant` itself was not touched by HF-222).

---

## Phase 5 -- DIAG-043 Complete

All four phases executed. Output file contains verbatim current-codebase extractions at HEAD for:
- IntentModifier type definition + all consumers (Phase 1)
- applyModifiers function + call sites + input value accessibility analysis (Phase 2.1, 2.2)
- executeScalarMultiply + executeOperation dispatcher (Phase 2.3, 2.4)
- Modifier trace emission sites (Phase 2.5)
- Plan-interpretation prompt cap/modifier instruction section + primitive examples + modifier inventory (Phase 3)
- Intent-transformer modifier passthrough + call sites (Phase 4)

**Delta-from-DIAG-041 summary (verbatim observations, not interpretation):**
- IntentModifier type union: byte-identical at lines 203-207. `applyTo` field: zero hits.
- applyModifiers function body: byte-identical at lines 572-610. Cap dispatch at 583-588 unchanged.
- Plan-interpretation prompt cap example: byte-identical at lines 600-611. Single cap-modifier example in entire prompt; example caps a `linear_function`, not a `scalar_multiply` with `ratio` input.
- Intent-transformer modifier handling: byte-identical at lines 185-202. Hardcoded `scope: 'per_period'`; silent drop of modifier types other than cap/floor; no `applyTo` passthrough.

**Branch note:** scaffold commit `2f9726e9` was authored on local `main`; remote `main` is branch-protected (push declined with `Changes must be made through a pull request`). CC reset local `main` to `origin/main` and moved the scaffold + all subsequent phase commits to feature branch `diag-043-hf223-surface-verification`. PR path remains the merge route per project discipline.

CC does not interpret findings. Architect dispositions in architect channel.
