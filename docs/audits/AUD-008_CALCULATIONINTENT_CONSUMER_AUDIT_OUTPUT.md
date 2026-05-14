# AUD-008 -- CalculationIntent Consumer Audit Output

**Date:** 2026-05-14
**Branch:** aud-008-calculationintent-consumer-audit
**HEAD commit at scaffold:** ab76ae3676e654f453dcae3e76133b8a7298fb91 (post-HF-223 merge)
**Scope:** Every consumer of calculationIntent or its sub-shapes. Nested operation tree readiness assessment.

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No fix proposals.

---

## Phase 1 -- Consumer enumeration

### Phase 1.1 -- `calculationIntent` / `calculation_intent` / `calcIntent` references

Total hits: **93 lines** across 17 files. Distribution (selected representative hits, full list saved to branch via Phase 1 commit):

```
web/src/app/api/calculation/run/route.ts:1312,1319,2176,2360       (4 hits)
web/src/app/api/import/sci/execute/route.ts:1531                   (1 hit)
web/src/app/data/import/enhanced/page.tsx:759                      (1 hit)
web/src/app/perform/statements/page.tsx:596                        (1 hit)
web/src/lib/ai/providers/anthropic-adapter.ts:435,459,461,475,477,500,502,509,511,540,542,550,552,564,566,573,575,591,593,600,602,618,620,636   (24 hits — mostly prompt examples)
web/src/lib/calculation/decimal-precision.ts:85,90,91,92            (4 hits)
web/src/lib/calculation/intent-executor.ts:485                     (1 hit — comment)
web/src/lib/calculation/intent-transformer.ts:42,74,136,235,265    (5 hits)
web/src/lib/calculation/run-calculation.ts:281,282,284,285,287,333,432,454,1403   (9 hits)
web/src/lib/compensation/plan-comprehension-emitter.ts:38,51,52,75,77,79,84,86   (8 hits)
web/src/lib/intelligence/convergence-service.ts:34,35,574,580,710,798,799,1236,1246,1502,2546   (11 hits)
web/src/lib/intelligence/trajectory-engine.ts:10,90                (2 hits)
web/src/lib/orchestration/metric-resolver.ts:232,238,243,246       (4 hits)
web/src/lib/reconciliation/employee-reconciliation-trace.ts:461    (1 hit)
web/src/lib/sci/tenant-context.ts:93,100,101                       (3 hits)
web/src/types/compensation-plan.ts:86                              (1 hit — type definition)
```

### Phase 1.2 -- intent sub-shape references (`.operation`, `.input`, `.source`, `.sourceSpec`, `.rate`, `.modifiers`, `.condition`, `.onTrue`, `.onFalse`, `.lookupTable`, `.segments`)

Total hits: **203 lines** across `web/src/lib/calculation/`, `web/src/lib/intelligence/`, `web/src/lib/ai/`, `web/src/app/api/calculation/`, `web/src/app/api/import/`.

### Phase 1.3 -- Type references (`IntentOperation`, `IntentSource`, `IntentModifier`, `ComponentIntent`, `CalculationIntent`)

Total hits: **116 lines** across the codebase.

### Phase 1.4 -- Deduplicated consumer file list (21 files, 19915 LOC total)

```
   4306 web/src/app/data/import/enhanced/page.tsx
   2915 web/src/app/api/calculation/run/route.ts
   2593 web/src/lib/intelligence/convergence-service.ts
   1865 web/src/app/api/import/sci/execute/route.ts
   1506 web/src/lib/calculation/run-calculation.ts
   1289 web/src/lib/ai/providers/anthropic-adapter.ts
    707 web/src/lib/calculation/intent-executor.ts
    700 web/src/lib/reconciliation/employee-reconciliation-trace.ts
    611 web/src/app/perform/statements/page.tsx
    534 web/src/lib/compensation/ai-plan-interpreter.ts
    448 web/src/lib/calculation/intent-validator.ts
    336 web/src/lib/orchestration/metric-resolver.ts
    323 web/src/lib/calculation/intent-types.ts
    276 web/src/lib/calculation/primitive-registry.ts
    275 web/src/lib/sci/tenant-context.ts
    271 web/src/lib/intelligence/trajectory-engine.ts
    268 web/src/lib/calculation/intent-transformer.ts
    258 web/src/types/compensation-plan.ts
    202 web/src/lib/calculation/decimal-precision.ts
    134 web/src/lib/compensation/plan-comprehension-emitter.ts
     98 web/src/lib/calculation/pattern-signature.ts
```

These 21 files are the population of consumers audited in Phases 2-7.

---

## Phase 2 -- Convergence consumers (`web/src/lib/intelligence/convergence-service.ts`)

### Phase 2.1 -- `extractInputRequirements` (lines 1245-1320)

Already extracted verbatim in DIAG-045 Phase 1 (commits `f28096ab`, file `docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md` §Phase 1). Function body unchanged at HEAD `ab76ae36`. Key shape: switch on `intent.operation`. **`scalar_multiply` branch (lines 1277-1290) checks `input?.source === 'ratio'` at top level only.** When `input.source` is undefined (input is itself an operation node, e.g., nested `conditional_gate`), falls through to else (line 1285), reads `input?.sourceSpec` (undefined for nested ops), returns `{ role: 'actual', metricField: 'unknown', expectedRange: null }`.

**Readiness for nested operation trees:** does NOT handle. The `case 'conditional_gate'` (line 1291) only fires when `intent.operation === 'conditional_gate'` at the TOP level; it does not recurse into nested conditional_gate inside scalar_multiply's input.

### Phase 2.2 -- Other intent-shape readers in convergence-service.ts

**(a) `extractComponents` (around line 705-803):** reads `comp.calculationIntent` to build the flat `metrics: string[]` list. Handles ratio, inputs (plural), ratioInput/baseInput (piecewise_linear), and crucially includes a `walkNested` helper (lines 765-781) that recurses through `onTrue`/`onFalse` chains. **However:** the `walkNested` recursion is gated on `intent.onTrue || intent.onFalse || intent.condition` at line 781 — fires only when the TOP-LEVEL intent carries those fields. For HF-223 emission (top-level `scalar_multiply` with `conditional_gate` nested *inside `input`*), gate is false, recursion never runs.

```typescript
      // OB-185: Walk nested onTrue/onFalse for conditional_gate chains
      const walkNested = (obj: Record<string, unknown>) => {
        const spec = (obj.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
        if (spec?.field) {
          const f = String(spec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        const condLeft = (obj.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
        const condSpec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
        if (condSpec?.field) {
          const f = String(condSpec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        if (obj.onTrue && typeof obj.onTrue === 'object') walkNested(obj.onTrue as Record<string, unknown>);
        if (obj.onFalse && typeof obj.onFalse === 'object') walkNested(obj.onFalse as Record<string, unknown>);
      };
      if (intent.onTrue || intent.onFalse || intent.condition) walkNested(intent);
```

Additionally, `walkNested` only reads `obj.input.sourceSpec.field` and `obj.condition.left.sourceSpec.field` — it does not handle `numerator`/`denominator` in `sourceSpec` (the ratio case). So even if it fired, the C5 ratio inside `conditional_gate.onTrue` would not produce `numerator`/`denominator` entries in the `metrics` list.

**Readiness:** partial. Recurses on `onTrue`/`onFalse` chains at the top level only; ignores nesting inside `scalar_multiply.input`; does not extract ratio numerator/denominator from sourceSpec inside the walk.

**(b) `estimateSampleResult` (lines 1497-1620, scalar_multiply branch at 1506-1536):**

```typescript
function estimateSampleResult(
  component: PlanComponent,
  compBindings: Record<string, ComponentBinding>,
  distributions: Record<string, ColumnDistribution>,
): number {
  const intent = component.calculationIntent;
  const op = (intent?.operation || component.calculationOp) as string;

  switch (op) {
    case 'scalar_multiply': {
      const rate = component.calculationRate ?? (intent?.rate as number | undefined) ?? 0;
      if (rate === 0) return 0;

      // Ratio input (numerator/denominator)
      const numBinding = compBindings.numerator;
      const denBinding = compBindings.denominator;
      if (numBinding && denBinding) {
        const numDist = distributions[numBinding.column];
        const denDist = distributions[denBinding.column];
        ...
        return rate * ratio;
      }

      // Single input
      const actualBinding = compBindings.actual;
      if (actualBinding) { ... }
      return 0;
    }
    ...
  }
}
```

**Readiness:** consumes `compBindings` (the OUTPUT of binding) rather than the intent directly. If binding produced no numerator/denominator/actual, estimateSampleResult returns 0 for scalar_multiply (regardless of nested-shape semantics).

**(c) Line 2546 — `getBoundaryUpperBound` (inferred from grep context around `getRequiredMeasureCount`):**

```typescript
  const intent = comp.calculationIntent as Record<string, unknown> | undefined;
  const boundaries = (intent?.boundaries as Array<Record<string, unknown>>) ?? [];
  for (const b of boundaries) {
    const min = b.min as number | null;
    const max = b.max as number | null;
    if ((min !== null && min > 1) || (max !== null && max > 1)) {
      return 100;
    }
  }
```

Reads `intent.boundaries` only — does not traverse nested operations.

**(d) `getRequiredMeasureCount` (line 2561-2574):**

```typescript
function getRequiredMeasureCount(operation: string): number {
  switch (operation) {
    case 'ratio':
    case 'bounded_lookup_2d':
      return 2;
    case 'sum':
    case 'count':
    case 'bounded_lookup_1d':
    case 'scalar_multiply':
    case 'conditional_gate':
    case 'aggregate':
    default:
      return 1;
  }
}
```

Takes only the top-level operation string. Returns `1` for `scalar_multiply` — does not know the input is a ratio (would need 2 measures: numerator + denominator). This baseline-count drives downstream pattern matching.

**(e) Other intent-reading sites:** lines 574-583 (`metricContexts` for Pass 4 AI), line 1278 (the scalar_multiply branch of extractInputRequirements above), line 1292 (the top-level conditional_gate branch), lines 1299-1305 (piecewise_linear ratioInput/baseInput), line 1310 (linear_function input). None recurse into nested operations inside `input`.

### Phase 2.3 -- `scoreColumnForRequirement` (lines 1339-1386)

Already extracted verbatim in DIAG-045 Phase 2.4. Function body unchanged at HEAD. **Consumes the output of extractInputRequirements** (a `ComponentInputRequirement` with `expectedRange` field), not the intent shape directly. When `requirement.expectedRange` is null (which happens for HF-223 fallback C5 case where extractInputRequirements returned `{ role: 'actual', metricField: 'unknown', expectedRange: null }`), returns flat `{ score: 0.1, scaleFactor: 1 }` for every candidate column — producing the `top=0.1000` uniform-distribution failure observed in DIAG-045.

**Readiness:** indirect dependency. Does not read intent. Inherits the nested-operation blindness via `extractInputRequirements`.

---

## Phase 3 -- Executor consumers (`web/src/lib/calculation/intent-executor.ts`, 707 LOC)

### Phase 3.1 -- Intent-shape readers per function

```
$ grep -nE "^function|^async function|^export function|^export async function|resolveValue\(|resolveSource\(" web/src/lib/calculation/intent-executor.ts | head -40
68:   function resolveSource(
159:  function resolveValue(
170:  return resolveSource(sourceOrOp, data, inputLog);
186:  export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
215:  function executeBoundedLookup1D(
221:    const inputValue = resolveValue(op.input, data, inputLog, trace);
257:  function executeBoundedLookup2D(
263:    const rowValue = resolveValue(op.inputs.row, data, inputLog, trace);
264:    const colValue = resolveValue(op.inputs.column, data, inputLog, trace);
299:  function executeScalarMultiply(
305:    const inputValue = resolveValue(op.input, data, inputLog, trace);
308:      : resolveValue(op.rate, data, inputLog, trace);
312:  function executeConditionalGate(
318:    const leftVal = resolveSource(op.condition.left, data, inputLog);
319:    const rightVal = resolveSource(op.condition.right, data, inputLog);
336:  function executeAggregateOp(
341:    return resolveSource(op.source, data, inputLog);
344:  function executeRatioOp(
349:    const num = resolveSource(op.numerator, data, inputLog);
350:    const den = resolveSource(op.denominator, data, inputLog);
357:  function executeConstantOp(op: ConstantOp): Decimal {
365:  function executeWeightedBlend(
383:    const value = resolveValue(input.source, data, inputLog, trace);
399:  function executeTemporalWindow(
405:    const currentValue = resolveValue(op.input, data, inputLog, trace);
486:  export function executeOperation(
520:  function executeLinearFunction(
526:    const inputValue = resolveValue(op.input, data, inputLog, trace);
535:  function executePiecewiseLinear(
541:  let ratio = toNumber(resolveValue(op.ratioInput, data, inputLog, trace));
542:  const baseValue = resolveValue(op.baseInput, data, inputLog, trace);
572:  function applyModifiers(
596:    const num = resolveSource(mod.numerator, data, inputLog);
597:    const den = resolveSource(mod.denominator, data, inputLog);
617:  export function executeIntent(
650:    attrValue = toNumber(resolveSource(attrSrc, entityData, inputLog));
```

### Phase 3.2 -- `resolveValue` (lines 159-171, verbatim)

```typescript
// ──────────────────────────────────────────────
// Composable Value Resolution — handles IntentSource or nested IntentOperation
// ──────────────────────────────────────────────

function resolveValue(
  sourceOrOp: IntentSource | IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  if (isIntentOperation(sourceOrOp)) {
    // Recursive: execute the nested operation to get a value
    return executeOperation(sourceOrOp, data, inputLog, trace);
  }
  // Existing: resolve from entity data
  return resolveSource(sourceOrOp, data, inputLog);
}
```

**Readiness for nested operation trees:** YES. `resolveValue` discriminates on `isIntentOperation(sourceOrOp)` and recursively calls `executeOperation` for nested operations, or falls through to `resolveSource` for leaf `IntentSource`. The executor's recursive resolution is the structural mechanism that handles HF-223's `scalar_multiply { input: conditional_gate {...} }` shape correctly.

### Phase 3.3 -- `executeScalarMultiply` (lines 299-310, verbatim)

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

**Readiness:** YES. Resolves `op.input` via `resolveValue` (recursive). For HF-223's `scalar_multiply { input: conditional_gate(...) }`, `resolveValue` recognises the nested `conditional_gate` operation, dispatches through `executeOperation` → `executeConditionalGate`, which resolves the condition and returns the matched branch's value. The cap-at-1.5 semantic is honored structurally inside the input resolution.

### Phase 3.4 -- `resolveSource` (lines 68-153, verbatim)

```typescript
function resolveSource(
  src: IntentSource,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  switch (src.source) {
    case 'metric': { ... }
    case 'ratio': { ... }
    case 'aggregate': { ... }
    case 'constant': { ... }
    case 'entity_attribute': { ... }
    case 'prior_component': { ... }
    case 'cross_data': { ... }
    case 'scope_aggregate': { ... }
  }
}
```

**Readiness:** N/A (leaf resolver). Handles only `IntentSource` leaves; nested operations are routed to `executeOperation` via `resolveValue` before reaching here.

### Phase 3.5 -- Other executor functions

All of `executeBoundedLookup1D`, `executeBoundedLookup2D`, `executeConditionalGate`, `executeLinearFunction`, `executePiecewiseLinear`, `executeTemporalWindow`, `executeWeightedBlend`, `executeScalarMultiply` route their inputs through `resolveValue` (which handles nesting) and their leaf operands through `resolveSource` (for IntentSource fields like ratio numerator/denominator). `executeConditionalGate` reads `op.condition.left` and `op.condition.right` via `resolveSource` directly (IntentSource shape only — not nested operations). `executeAggregateOp` and `executeRatioOp` similarly read from `resolveSource` only.

**Readiness summary for executor layer:** the recursive `resolveValue` is the structural primitive that handles nested operation trees. The HF-223 nested shape (`scalar_multiply { input: conditional_gate(...) }`) flows correctly through the executor IF the binding layer has populated the necessary metric→column mappings AND if `op.condition.left.source === 'ratio'` resolves through `resolveSource`'s ratio branch (numerator/denominator keyed by `metric:` prefix; convergence binding maps `hub_total_loads`/`hub_total_capacity` to actual data columns). The executor itself is structurally ready.

---

## Phase 4 -- Transformer consumers (`web/src/lib/calculation/intent-transformer.ts`, 268 LOC post-HF-223)

### Phase 4.1 -- Functions

```
$ grep -nE "^function|^export function|^export async function" web/src/lib/calculation/intent-transformer.ts
28:  export function transformComponent(
52:  export function transformVariant(
67:  function entityScope(level: string): 'entity' | 'group' {
86:  function normalizeIntentInput(raw: unknown): IntentSource | IntentOperation {
131: function transformFromMetadata(
```

### Phase 4.2 -- `normalizeIntentInput` (lines 86-129, already extracted in DIAG-043 Phase 1.2)

Discriminates between leaf `IntentSource` and nested `IntentOperation`. Recurses on `obj.operation === 'ratio'` constructing a `ratio` operation node with `normalizeIntentInput`-normalized `numerator` and `denominator`. Returns the broader `IntentSource | IntentOperation` union — callers may need to assert narrower type via cast (per HF-223 Phase 1 transformer edits at the `proration`/`temporal_adjustment` modifier branches).

**Readiness:** YES. Recursive normalization. Handles the LLM emission of both flat and nested input shapes.

### Phase 4.3 -- `transformFromMetadata` (lines 131-onward)

```typescript
function transformFromMetadata(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  const meta = (component.metadata || {}) as Record<string, unknown>;
  const rawIntent = (meta?.intent || (component as unknown as Record<string, unknown>).calculationIntent) as Record<string, unknown> | undefined;
  if (!rawIntent) return null;

  let operation: IntentOperation;
  if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
    operation = {
      operation: 'linear_function',
      input: normalizeIntentInput(rawIntent.input),
      slope: Number(rawIntent.rate),
      intercept: Number(rawIntent.additionalConstant),
    } as IntentOperation;
  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
    operation = {
      operation: 'scalar_multiply',
      input: normalizeIntentInput(rawIntent.input),
      rate: Number(rawIntent.rate),
    } as IntentOperation;
  } else if (rawIntent.operation === 'piecewise_linear') {
    ...
  } else if (rawIntent.operation === 'conditional_gate') {
    const cond = (rawIntent.condition || {}) as Record<string, unknown>;
    operation = {
      operation: 'conditional_gate',
      condition: {
        left: normalizeIntentInput(cond.left),
        operator: String(cond.operator || '>='),
        right: normalizeIntentInput(cond.right),
      },
      onTrue: normalizeIntentInput(rawIntent.onTrue) as IntentOperation,
      onFalse: normalizeIntentInput(rawIntent.onFalse) as IntentOperation,
    } as IntentOperation;
  } else {
    operation = rawIntent as unknown as IntentOperation;
  }
  ...
}
```

For HF-223's `scalar_multiply { input: conditional_gate {...}, rate: 800 }`:
- Matches the `else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null)` branch at line 147
- Calls `normalizeIntentInput(rawIntent.input)` where `rawIntent.input` is the nested conditional_gate object
- `normalizeIntentInput` at line 86 checks `'operation' in obj && typeof obj.operation === 'string'` (line 99); for the conditional_gate input, this is true; falls to the catchall return at line 109: `return obj as unknown as IntentOperation;` (the conditional_gate node is passed through as-is)

**Readiness:** YES. `transformFromMetadata` produces a structurally valid nested `ComponentIntent` for HF-223 emission. The `else` catch-all at line 109 of `normalizeIntentInput` passes nested operations through.

**Modifier handling (HF-223 Phase 1, lines 183-249 post-edit):** validation-passthrough for all four `IntentModifier` discriminants (cap/floor/proration/temporal_adjustment). Already extracted in DIAG-043 Phase 4 + HF-223 PR (`9dbc0fea`). Confirms HF-223 closed the `scope` overwrite + `proration`/`temporal_adjustment` drop defects.
