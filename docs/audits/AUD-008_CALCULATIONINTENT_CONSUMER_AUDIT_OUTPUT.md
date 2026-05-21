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

---

## Phase 5 -- Plan interpretation consumers

### Phase 5.1 -- `anthropic-adapter.ts`

```
$ grep -n "calculationIntent\|\.operation\b\|\.input\b\|modifiers" web/src/lib/ai/providers/anthropic-adapter.ts | grep -v "EXAMPLE\|prompt\|//"
435:  FOR EACH COMPONENT, also produce a "calculationIntent" field ...
461,477,502,511,542,552,566,575,593,602,620:   "calculationIntent": { ... }   (prompt example blocks; not runtime reads)
607:    "modifiers": [                                                          (prompt example)
616:  When the plan document specifies a constraint on the OUTPUT value ...    (SEMANTIC PRINCIPLE text)
636:  CRITICAL: Every component MUST include both "calculationMethod" ...
930-931:  pdfBase64, pdfMediaType (runtime adapter logic — not intent reads)
1043:  const input = request.input;                                            (adapter wiring; not intent shape)
```

**Readiness:** N/A for the runtime adapter — its role is constructing the prompt and dispatching to Anthropic. The 24 `calculationIntent` hits are all inside prompt template literals (EXAMPLE blocks teaching the LLM what to emit). HF-223 Phase 2 appended the SEMANTIC PRINCIPLE block + new conditional_gate-wrapped scalar_multiply example after line 611. Post-HF-223 verification confirmed the LLM now emits the new shape.

### Phase 5.2 -- `ai-plan-interpreter.ts`

```
$ grep -n "calculationIntent\|\.operation\b\|\.input\b\|\.source\b\|\.sourceSpec\b" web/src/lib/compensation/ai-plan-interpreter.ts | head -25
77:   calculationIntent?: Record<string, unknown>; // OB-77: AI-produced structural intent
193:  calculationIntent: c.calculationIntent && typeof c.calculationIntent === 'object'
194:    ? c.calculationIntent as Record<string, unknown>
302:  // store tier data in calculationIntent.outputGrid (2d) / .outputs (1d) / .rate (scalar)
307:  const intent = c.calculationIntent as Record<string, unknown> | undefined;
308:  const op = (intent?.operation as string) ?? c.componentType;
397:  calculationIntent: comp?.calculationIntent,
405:  const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || '';
409:  `(from calcMethod.type="${calcMethod?.type}", calculationIntent.operation="${base.calculationIntent?.operation}")`,
431:  const intent = base.calculationIntent as Record<string, unknown> | undefined;
473:  intent: base.calculationIntent, // copy for transformFromMetadata
```

ai-plan-interpreter reads `calculationIntent` at multiple sites for type/operation classification (line 308: `intent?.operation`; line 405: same as primary; line 431: similar). These are top-level operation reads — they do not traverse nested operation trees. They serve to dispatch tier-data storage paths (line 302 comment) based on the top-level primitive name. For HF-223 `scalar_multiply`, the top-level operation is `scalar_multiply` regardless of nested input shape, so these reads dispatch correctly to the scalar_multiply branch.

**Readiness:** indirect / top-level-only. Reads `intent.operation` (the top-level primitive name) but not nested input trees. Behaviorally correct for top-level dispatch; does not interrogate input semantics.

### Phase 5.3 -- `PlanComprehensionEmitter` (`web/src/lib/compensation/plan-comprehension-emitter.ts`, full file)

```typescript
/**
 * HF-198 E5 — Plan-agent comprehension as L2 signal
 * ...
 * declared_readers: web/src/lib/intelligence/convergence-service.ts
 *     (loadMetricComprehensionSignals)
 */

// OB-199 Phase 4: canonical writer migration. The load-bearing emitter for
// comprehension:plan_interpretation now routes through DS-023 §5.1 single
// entry point ...
import { writeSignalBatch, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';

interface PlanInterpretationLike {
  components?: Array<Record<string, unknown>>;
}

interface ComponentLike {
  id?: string;
  name?: string;
  type?: string;
  calculationMethod?: { type?: string; [key: string]: unknown } | null;
  calculationIntent?: Record<string, unknown> | null;
  confidence?: number;
  reasoning?: string;
  expectedMetrics?: string[];
  metrics?: Array<{ metric?: string; metricLabel?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export async function emitPlanComprehensionSignals(
  args: {
    tenantId: string;
    ruleSetId: string;
    interpretation: PlanInterpretationLike;
    planConfidence?: number;
  },
): Promise<{ emitted: number; errors: number }> {
  try {
    const components = Array.isArray(args.interpretation.components) ? args.interpretation.components : [];
    if (components.length === 0) {
      return { emitted: 0, errors: 0 };
    }

    const signals = components.map((rawComp) => {
      const comp = rawComp as ComponentLike;
      const calcMethod = (comp.calculationMethod ?? {}) as { type?: string };
      const calcIntent = (comp.calculationIntent ?? null) as Record<string, unknown> | null;

      // metric_op: prefer calculationIntent.calculationType (structural intent), then calculationMethod.type
      const metricOp =
        (calcIntent?.calculationType as string | undefined) ??
        calcMethod?.type ??
        comp.type ??
        'unknown';

      // metric_inputs: extract from calculationIntent.input, or fall back to expectedMetrics list
      const metricInputs =
        (calcIntent?.input as Record<string, unknown> | undefined) ??
        (comp.expectedMetrics ? { expectedMetrics: comp.expectedMetrics } : null);

      const signalValue: Record<string, unknown> = {
        metric_label: comp.name ?? comp.id ?? 'unnamed_component',
        metric_op: metricOp,
        metric_inputs: metricInputs,
        semantic_intent: comp.reasoning ?? null,
        component_id: comp.id ?? null,
        component_type: comp.type ?? null,
        source_evidence: {
          rule_set_id: args.ruleSetId,
          plan_confidence: args.planConfidence ?? null,
          component_confidence: comp.confidence ?? null,
        },
      };
      ...
    });
    ...
  }
}
```

The emitter at line 86 reads `calcIntent?.input` and assigns it verbatim to `metric_inputs`. For pre-HF-223 emission (top-level ratio), `metric_inputs` is `{ source: 'ratio', sourceSpec: { numerator, denominator } }`. For post-HF-223 emission (conditional_gate-wrapped), `metric_inputs` is `{ operation: 'conditional_gate', condition: {...}, onTrue: {...}, onFalse: {...} }` — exactly the shape DIAG-045 Phase 4.2 observed in `comprehension:plan_interpretation.signal_value.metric_inputs` for the new rule_set.

**Readiness:** passthrough. The emitter does not traverse or transform the input shape — it copies `calculationIntent.input` verbatim into the signal. Whether downstream consumers (convergence's `loadMetricComprehensionSignals` + extraction logic) handle the nested shape is the question.

Cross-reference to Phase 2: `loadMetricComprehensionSignals` populates `observations.metricComprehension`, which is threaded into `generateAllComponentBindings` as input. The metric_comprehension signal's `metric_inputs` field is consumed at line 580+ inside the Pass 4 AI prompt construction (`metricContexts: MetricContext[] = unresolvedForAI.map(metricName => ...)`) — the consumer reads `intent.input.sourceSpec` at line 583, which for the new shape is undefined (`input.sourceSpec` is undefined when `input` is a conditional_gate operation).

---

## Phase 6 -- Calculation route consumers (`web/src/app/api/calculation/run/route.ts`, 2915 LOC)

### Phase 6.1 -- Intent-shape reads

```
$ grep -n "calculationIntent\|\.operation\b\|\.sourceSpec\b\|\.onTrue\b\|\.onFalse\b\|intent\.input\b" web/src/app/api/calculation/run/route.ts | head -40
509:  const hasDeltaDerivations = metricDerivations.some(d => d.operation === 'delta');
1312: // Reads metric names from the binding-declared intent (component.calculationIntent
1313: // .input.sourceSpec.{numerator,denominator}), not from expectedMetrics position,
1319: const ratioIntent = (component.calculationIntent as Record<string, unknown> | undefined)?.input as ...
1321: const ratioSpec = ratioIntent?.sourceSpec as Record<string, unknown> | undefined;
2171: // OB-196 Phase 2: band-normalization reads foundational metadata.intent ...
2176: const intent = (meta.intent || component.calculationIntent) as Record<string, unknown> | undefined;
2178:   const op = intent.operation as string | undefined;
2183:   const spec = (o.sourceSpec || {}) as Record<string, unknown>;
2201:   const field = readField(intent.input);
2308: if (rule.operation !== 'sum' || !rule.source_field) continue;
2360: const compIntent = comp?.calculationIntent as Record<string, unknown> | undefined;
```

**(a) Lines 1312-1321 — ratio metric-name extraction inside `resolveMetricsFromConvergenceBindings`:**

```typescript
      // Reads metric names from the binding-declared intent (component.calculationIntent
      // .input.sourceSpec.{numerator,denominator}), not from expectedMetrics position,
      // to avoid fragility against AST walk order. Pre-HF-217 the function wrote the
      // pre-divided ratio to expectedMetrics[0] and left expectedMetrics[1] unfilled,
      ...
      const ratioIntent = (component.calculationIntent as Record<string, unknown> | undefined)?.input as
        Record<string, unknown> | undefined;
      const ratioSpec = ratioIntent?.sourceSpec as Record<string, unknown> | undefined;
```

For HF-223 emission, `component.calculationIntent.input` is the conditional_gate node, not a ratio source. `ratioSpec` becomes undefined; the metric-name resolution path that hands raw numerator/denominator to the ratio-write fails for ratios nested inside conditional_gate.

**Readiness:** does NOT handle. Reads `calculationIntent.input.sourceSpec` only.

**(b) Lines 2170-2207 — OB-196 Phase 2 band-normalization:**

```typescript
        // OB-196 Phase 2: band-normalization reads foundational metadata.intent (Decision 151
        // read-only projection). 1D lookup → intent.boundaries[0].max keyed by intent.input
        // metric field; 2D lookup → intent.rowBoundaries[0].max + intent.columnBoundaries[0].max
        const bandMaxByMetric: Record<string, number> = {};
        const meta = (component.metadata || {}) as Record<string, unknown>;
        const intent = (meta.intent || component.calculationIntent) as Record<string, unknown> | undefined;
        if (intent) {
          const op = intent.operation as string | undefined;
          const readField = (raw: unknown): string | undefined => {
            if (!raw || typeof raw !== 'object') return undefined;
            const o = raw as Record<string, unknown>;
            if (o.source === 'metric') {
              const spec = (o.sourceSpec || {}) as Record<string, unknown>;
              return typeof spec.field === 'string' ? spec.field : undefined;
            }
            return undefined;
          };
          if (op === 'bounded_lookup_2d') { ... }
          else if (op === 'bounded_lookup_1d') {
            const field = readField(intent.input);
            ...
          }
        }
```

Only fires for `op === 'bounded_lookup_1d'` or `'bounded_lookup_2d'`. For HF-223 `scalar_multiply` it skips entirely. `readField` requires `o.source === 'metric'` — would return undefined for nested operations.

**Readiness:** N/A for scalar_multiply path. Returns undefined for nested operation inputs.

**(c) Line 2360 — precision inference for rounding:** reads `comp?.calculationIntent` to call `inferOutputPrecision`. Decimal-precision module reads `calculationIntent` to collect output values (per Phase 1.1 hit list, decimal-precision.ts:85-92). Not nesting-sensitive in a binding sense.

### Phase 6.2 -- Trace emission

```
$ grep -n "executionTrace\|modifierLog\|intentTraces\|before.*after\|trace.*push" web/src/app/api/calculation/run/route.ts | head -20
136:   traceBuffer.push(line);
2244:  const intentTraces: unknown[] = [];
2356:  intentTraces.push(intentResult.trace);
2452:  intentTraces,
```

Line 2355-2356: per-component `intentResult.trace` (the `ExecutionTrace` from executor) is pushed onto `intentTraces[]` and persisted to `calculation_results.metadata.intentTraces` per DIAG-040 evidence. The trace structure includes `inputs: { ... resolvedValue }` recorded via `resolveSource` inputLog. For nested operations, `resolveValue` → `executeOperation` recursively populates the same inputLog with each nested resolution.

**Readiness:** YES via executor recursion. The intent trace records every leaf resolution including those reached through nested operations. The trace describes the actual data flow correctly.

### Phase 6.3 -- Fingerprint computation

```
$ grep -rn "fingerprint" web/src/app/api/calculation/run/route.ts | head -5
41:   import { decrementFingerprintConfidence } from '@/lib/sci/fingerprint-flywheel';
1897-1937:  HF-219 fingerprint trace + decrement (failure path; no hash of intent shape)
```

`route.ts` calc-time fingerprint usage is read-only: it traces a binding-failure-related fingerprint hash from `structural_fingerprints` table and decrements confidence. **No intent-tree hashing at calc time.** `computeFingerprintHashSync` is in `web/src/lib/sci/structural-fingerprint.ts` (DIAG-041 Phase 6.4 confirmed it hashes column-role + classification-result shape, not intent). Convergence-time fingerprint write (`writeFingerprint` from `web/src/lib/sci/fingerprint-flywheel.ts`) is called from `web/src/app/api/import/sci/execute/route.ts:420+` (HF-181 Layer 2; AUD-008 Phase 5 / non-bulk path per DIAG-044 Phase 2.3) — fingerprint scope is HC classification + bindings, not calculationIntent tree.

**Readiness:** orthogonal. Fingerprint surface does not hash intent operation tree. Different nested/flat shapes do not produce different fingerprints unless the underlying HC classifications differ.

### Phase 6.4 -- Explanation / reconciliation surfaces

```
$ grep -rn "explain\|reconcil\|describe.*component\|display.*intent" web/src/lib/ web/src/app/api/ web/src/components/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v test | grep -v node_modules | head -15
web/src/lib/reconciliation/report-engine.ts:72,132,205,342,367,436    (report generation, GT-vs-output)
web/src/lib/reconciliation/employee-reconciliation-trace.ts:139,461   (trace at line 461 reads metadata.intent || calculationIntent)
web/src/lib/reconciliation/comparison-depth-engine.ts:402,487         (comparison primitives)
web/src/lib/ingestion/pipeline-bridge.ts:69,76                          (context label only)
```

**employee-reconciliation-trace.ts:461** reads `(meta.intent || (component as unknown as Record<string, unknown>).calculationIntent)` — the same pattern as transformer + route.ts. Reads top-level intent for label generation; does not recurse into nested operations for description purposes.

**Readiness:** N/A for nested-operation describing. Reads top-level operation type only.

---

## Phase 7 -- UI consumers

### Phase 7.1 -- `.tsx` reads of calculationIntent / sub-shapes

```
$ grep -rn "calculationIntent|calcIntent|\.operation\b|\.sourceSpec\b" web/src/components/ web/src/app/ --include="*.tsx"
web/src/app/perform/statements/page.tsx:596:      if (d.source === 'calculationIntent' && d.operation === 'conditional_gate') {
web/src/app/data/import/enhanced/page.tsx:759:  const intent = (meta.intent || (comp as unknown as Record<string, unknown>).calculationIntent) ...
web/src/app/data/import/enhanced/page.tsx:762:  const op = intent.operation as string | undefined;
web/src/app/data/import/enhanced/page.tsx:779:  const spec = (o.sourceSpec || {}) as Record<string, unknown>;
```

Two `.tsx` files reference intent shape.

### Phase 7.2 -- `web/src/app/perform/statements/page.tsx:585-602` (verbatim)

```typescript
      return `${d.matchedTier || '—'} (${Number(d.metricValue || 0).toFixed(1)})`;
    case 'scalar_multiply':
      return `${d.baseAmount || 0} × ${d.rate || 0}`;
    case 'conditional_gate':
      return d.gateSemantics ? `${d.matchedCondition || 'Qualified'}` : `${d.matchedCondition || '—'}`;
    default:
      if (d.source === 'calculationIntent' && d.operation === 'conditional_gate') {
        return d.payout ? 'Qualified' : 'Not qualified';
      }
      // OB-196 Phase 3 (E4 / Q-A.5.4): graceful-with-explicit-label, never silent.
      return `Component type ${comp.componentType ?? 'unknown'} not supported in statement display`;
  }
}
```

Reads `d.operation` (the foundational primitive label, not the intent's recursive operation tree). The descriptor function switches on the top-level primitive; for HF-223 `scalar_multiply` with nested conditional_gate input, the case is `'scalar_multiply'` and produces `${d.baseAmount || 0} × ${d.rate || 0}` — the description does not surface the nested cap or the conditional gate. The default branch's `d.source === 'calculationIntent' && d.operation === 'conditional_gate'` would only fire for top-level conditional_gate components.

**Readiness:** N/A for nested-operation description. The statement page summarises top-level operation only.

### Phase 7.3 -- `web/src/app/data/import/enhanced/page.tsx:755-802` (verbatim of intent-reading block)

```typescript
  if (firstVariant?.components) {
    firstVariant.components.forEach((comp: PlanComponent) => {
      // OB-196 Phase 1.7: read metric names from foundational metadata.intent.
      const meta = (comp.metadata || {}) as Record<string, unknown>;
      const intent = (meta.intent || (comp as unknown as Record<string, unknown>).calculationIntent) as Record<string, unknown> | undefined;
      if (!intent) return;

      const op = intent.operation as string | undefined;
      const pushField = (id: string | undefined, category: 'metric' | 'amount') => {
        if (!id) return;
        componentFields.push({ ... });
      };
      const readField = (raw: unknown): string | undefined => {
        if (!raw || typeof raw !== 'object') return undefined;
        const o = raw as Record<string, unknown>;
        if (o.source === 'metric') {
          const spec = (o.sourceSpec || {}) as Record<string, unknown>;
          return typeof spec.field === 'string' ? spec.field : undefined;
        }
        return undefined;
      };

      if (op === 'bounded_lookup_2d') {
        const inputs = (intent.inputs || {}) as Record<string, unknown>;
        pushField(readField(inputs.row), 'metric');
        pushField(readField(inputs.column), 'amount');
      } else if (op === 'bounded_lookup_1d') {
        pushField(readField(intent.input), 'metric');
      } else if (op === 'scalar_multiply' || op === 'linear_function' || op === 'piecewise_linear') {
        pushField(readField(intent.input), 'amount');
      } else if (op === 'conditional_gate') {
        const cond = (intent.condition || {}) as Record<string, unknown>;
```

`readField` returns undefined when `o.source !== 'metric'` (i.e., when input is a nested operation like conditional_gate). For HF-223 `scalar_multiply` (line 791 branch), `readField(intent.input)` returns undefined and `pushField(undefined, 'amount')` is a no-op — no UI field surfaced for nested-input components.

**Readiness:** N/A for nested operations. The enhanced-import UI surfaces required-field metadata only for top-level flat sources; nested inputs produce no UI field entries.

---

## Phase 8 -- AUD-008 Complete

All seven audit phases executed. Output file contains verbatim code extractions for every consumer of calculationIntent or its sub-shapes across the codebase.

**Per-consumer nested-operation-tree readiness summary (verbatim observations from code, not interpretation):**

| Consumer surface | File / function | Nested-operation handling | Notes |
|---|---|---|---|
| Convergence — `extractInputRequirements` | convergence-service.ts:1245 | DOES NOT handle | `scalar_multiply` branch checks `input?.source === 'ratio'` only; falls to else returning `{role:'actual', metricField:'unknown', expectedRange:null}` for nested inputs |
| Convergence — `extractComponents` `walkNested` | convergence-service.ts:765-781 | partial | recurses on top-level `onTrue/onFalse/condition` only; produces flat metrics list, not requirement records; does not extract ratio numerator/denominator |
| Convergence — `scoreColumnForRequirement` | convergence-service.ts:1339 | indirect | inherits null `expectedRange` from extractInputRequirements; returns flat 0.1 baseline |
| Convergence — `estimateSampleResult` | convergence-service.ts:1497 | indirect (consumes compBindings, not intent) | returns 0 when bindings empty |
| Convergence — `getRequiredMeasureCount` | convergence-service.ts:2561 | top-level only | returns 1 for `scalar_multiply`; does not interrogate input shape |
| Convergence — Pass 4 AI prompt builder | convergence-service.ts:574-583 | DOES NOT handle | reads `intent.input.sourceSpec` only |
| Executor — `resolveValue` | intent-executor.ts:159 | YES (recursive) | discriminates `IntentOperation` vs `IntentSource`; recurses via `executeOperation` |
| Executor — `executeScalarMultiply` | intent-executor.ts:299 | YES (via resolveValue) | resolves `op.input` recursively |
| Executor — `executeConditionalGate` | intent-executor.ts:312 | partial | resolves `condition.left/right` via `resolveSource` (leaves only); recurses through `op.onTrue/onFalse` via `executeOperation` |
| Executor — `resolveSource` | intent-executor.ts:68 | N/A (leaf resolver) | handles IntentSource branches only |
| Transformer — `normalizeIntentInput` | intent-transformer.ts:86 | YES (recursive) | discriminates `operation` vs `source` and recurses |
| Transformer — `transformFromMetadata` | intent-transformer.ts:131 | YES (via normalizeIntentInput) | constructs nested operation trees for `scalar_multiply`/`conditional_gate`/`piecewise_linear` |
| Transformer — modifier handling | intent-transformer.ts:183-249 (HF-223 Phase 1) | YES | all 4 IntentModifier discriminants carried; validation-passthrough |
| Plan-interpretation — `anthropic-adapter.ts` | adapter prompt templates | N/A (prompt construction) | HF-223 Phase 2 added SEMANTIC PRINCIPLE + nested example |
| Plan-interpretation — `ai-plan-interpreter.ts` | lines 193, 307, 405, 431 | top-level only | reads `intent.operation` for type dispatch; does not traverse input |
| Plan-interpretation — `PlanComprehensionEmitter` | plan-comprehension-emitter.ts:75-100 | passthrough | copies `calculationIntent.input` verbatim into `metric_inputs` signal field |
| Calc route — ratio metric-name extractor | route.ts:1312-1321 | DOES NOT handle | reads `calculationIntent.input.sourceSpec.{numerator,denominator}` only |
| Calc route — OB-196 band normalization | route.ts:2170-2207 | partial | only fires for `bounded_lookup_1d`/`bounded_lookup_2d`; `readField` returns undefined for nested ops |
| Calc route — precision inference | route.ts:2360 + decimal-precision.ts:85 | indirect | collects output values from intent tree (recursive via `collectOutputValues`) |
| Calc route — intent trace emission | route.ts:2244, 2356 | YES (executor-driven) | `executeIntent` returns `ExecutionTrace` with all resolution events including nested |
| Calc route — fingerprint write | structural-fingerprint.ts via sci/execute | orthogonal | fingerprint hashes HC + classification, not intent tree |
| Reconciliation — `employee-reconciliation-trace.ts:461` | line 461 | top-level only | reads `intent.operation` for label generation |
| UI — statements page descriptor | perform/statements/page.tsx:585-602 | N/A | switches on top-level primitive; nested inputs not surfaced |
| UI — enhanced import field metadata | data/import/enhanced/page.tsx:755-802 | N/A | `readField` returns undefined for non-leaf inputs; nested-shape components produce no UI field entries |

**Three structural readiness classes surfaced in this audit:**
1. **YES (recursive)** — executor `resolveValue`/`executeScalarMultiply`/`executeConditionalGate`; transformer `normalizeIntentInput`/`transformFromMetadata`; trace emission. These layers handle HF-223 nested shapes structurally.
2. **DOES NOT handle (flat-shape assumption)** — convergence `extractInputRequirements`; calc route `resolveMetricsFromConvergenceBindings` ratio-name extractor; convergence Pass 4 AI prompt builder. These are the surfaces where HF-223 nested emission produces no binding / wrong metric resolution.
3. **N/A or top-level only** — UI surfaces, reconciliation trace, plan-interpreter dispatch. These read the top-level operation primitive for labels/dispatch and don't interrogate nested input semantics. Nested inputs produce missing fields or generic labels but do not actively break.

CC does not interpret findings. CC does not propose fixes. Architect dispositions in architect channel.
