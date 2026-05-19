# HF-238 — Prime-Level DAG Calculation Engine — Completion Report

**Branch:** `hf-238-prime-dag-engine`
**Base:** `main @ 8600aaa7` (HF-237 merge)
**Commits:** 5
- `04661054` HF-238 Phase 0: legacy shape inventory script
- `5ffef54b` HF-238 Phase 1 — Prime-Level DAG calculation engine
- `efbfac6c` HF-238 Phase 2 — Plan-interpretation prompt rewritten to 9-prime composition
- `2419a47b` HF-238 Phase 3 — Derivation DAG wiring + scope pre-compute deletion
- `78970cc8` HF-238 Phase 4 — Adapter coverage + stored-totals verification

Date: 2026-05-19

---

## What changed

The 11-case `executeOperation` dispatch + 8-case `resolveSource` switch in
`intent-executor.ts` has been replaced by a single recursive `evaluate()`
walker over nine `PrimeNode` types. Every stored intent — legacy
named-operation format and the new prime-DAG composition format — flows
through translation adapters at the storage boundary and produces a
`PrimeNode` tree that the one evaluator processes.

The nine primes:
1. `arithmetic` (add / subtract / multiply / divide, zero-guarded)
2. `aggregate`  (sum / count / avg / min / max)
3. `filter`     (predicate-narrowed sub-tree)
4. `conditional` (if / then / else over truthy Decimal)
5. `scope`      (peer-narrowed sub-tree by entity-metadata boundary, self-excluded)
6. `compare`    (gt / gte / lt / lte / eq / neq → 1 or 0)
7. `logical`    (and / or / not over truthy Decimals → 1 or 0)
8. `constant`   (leaf literal)
9. `reference`  (leaf metric/synthetic-key lookup)

---

## Phase 0 — Legacy intent shape inventory

`web/scripts/audit-intent-shapes.ts` enumerated every distinct
`calculationIntent` shape across all stored `rule_sets` for the three
active tenants:

```
Distinct operation types (legacy intent operation field):
  bounded_lookup_1d
  bounded_lookup_2d
  conditional_gate
  constant
  linear_function
  piecewise_linear
  scalar_multiply

Distinct source types (legacy intent IntentSource.source field):
  aggregate
  constant
  metric
  ratio
  scope_aggregate

Distinct intent signatures (operation + carried keys):
  bounded_lookup_1d :: { boundaries, input, isMarginal, noMatchBehavior, outputs }
  bounded_lookup_2d :: { columnBoundaries, inputs, noMatchBehavior, outputGrid, rowBoundaries }
  conditional_gate  :: { condition, onFalse, onTrue }
  constant          :: { value }
  linear_function   :: { input, intercept, slope }
  piecewise_linear  :: { baseInput, ratioInput, segments, targetValue }
  scalar_multiply   :: { input, rate }
  <no-operation>    :: { source, sourceSpec }       (8 Meridian Fleet Utilization components — bare IntentSource at top level)

Distinct modifier signatures:
  cap :: { maxValue, scope }

Distinct metric_derivation signatures (operation + carried keys):
  sum   :: { filters, metric, operation, source_field, source_pattern }
```

Coverage gate: every signature above is exercised by `legacyIntentToDAG`
in `web/src/lib/calculation/legacy-intent-to-dag.ts`. Forward-compatibility
branches for `weighted_blend`, `temporal_window`, `bounded_lookup_2d`,
`bounded_lookup_1d`, `floor`, and `proration` are present even though
those signatures are absent from the current inventory.

---

## Phase 1 — `evaluate()` + legacy adapter

### Files changed

- **NEW** `web/src/lib/calculation/legacy-intent-to-dag.ts` (724 lines)
- **REWRITTEN** `web/src/lib/calculation/intent-executor.ts` (721 → 386 lines)
- **EXTENDED** `web/src/lib/calculation/intent-types.ts` (added `PrimeNode`,
  `EvalContext`, `VALID_PRIMES`, `isPrimeNode`)

### Deletion evidence (intent-executor.ts)

```bash
$ git diff 8600aaa7 -- web/src/lib/calculation/intent-executor.ts | grep -E '^- (function|export function) '
- function resolveSource(
- function resolveValue(
- function executeBoundedLookup1D(
- function executeBoundedLookup2D(
- function executeScalarMultiply(
- function executeConditionalGate(
- function executeAggregateOp(
- function executeRatioOp(
- function executeConstantOp(
- function executeWeightedBlend(
- function executeTemporalWindow(
- function executeLinearFunction(
- function executePiecewiseLinear(
- function applyModifiers(
```

All 14 named functions removed; their semantics live in `legacyIntentToDAG`
+ `evaluate()`. `executeOperation` is retained as a thin back-compat
wrapper at the bottom of `intent-executor.ts` (called by the
`run-calculation.ts:335` calculationIntent fallback path); it forwards
through `legacyIntentToDAG` + `evaluate`.

### `evaluate()` (verbatim, intent-executor.ts:113-237)

```typescript
export function evaluate(node: PrimeNode, context: EvalContext): Decimal {
  switch (node.prime) {
    case 'constant': {
      return toDecimal(node.value);
    }
    case 'reference': {
      const raw = context.metrics[node.field];
      return raw === undefined || raw === null ? ZERO : toDecimal(raw);
    }
    case 'arithmetic': {
      const a = evaluate(node.inputs[0], context);
      const b = evaluate(node.inputs[1], context);
      switch (node.op) {
        case 'add':      return a.plus(b);
        case 'subtract': return a.minus(b);
        case 'multiply': return a.mul(b);
        case 'divide':   return b.isZero() ? ZERO : a.div(b);
      }
      return ZERO;
    }
    case 'compare': {
      const a = evaluate(node.inputs[0], context);
      const b = evaluate(node.inputs[1], context);
      let result: boolean;
      switch (node.op) {
        case 'gt':  result = a.gt(b); break;
        case 'gte': result = a.gte(b); break;
        case 'lt':  result = a.lt(b); break;
        case 'lte': result = a.lte(b); break;
        case 'eq':  result = a.eq(b); break;
        case 'neq': result = !a.eq(b); break;
        default:    result = false;
      }
      return result ? toDecimal(1) : ZERO;
    }
    case 'logical': {
      const inputs = node.inputs.map(n => evaluate(n, context));
      let result: boolean;
      switch (node.op) {
        case 'and': result = inputs.every(d => d.gt(ZERO)); break;
        case 'or':  result = inputs.some(d => d.gt(ZERO)); break;
        case 'not': result = inputs.length > 0 ? inputs[0].isZero() : true; break;
        default:    result = false;
      }
      return result ? toDecimal(1) : ZERO;
    }
    case 'conditional': {
      const cond = evaluate(node.condition, context);
      const isTrue = cond.gt(ZERO);
      return evaluate(isTrue ? node.then : node.else, context);
    }
    case 'filter': {
      const filtered = context.activeRows.filter(r => rowMatchesPredicate(r, node.predicate));
      return evaluate(node.downstream, { ...context, activeRows: filtered });
    }
    case 'scope': {
      const boundaryValue = context.entity.metadata[node.boundary];
      const selfEntityId = context.entity.metadata.entityId;
      const siblings = context.allEntityRows
        .filter(r =>
          r.entityMetadata[node.boundary] === boundaryValue
          && r.entityMetadata.entityId !== selfEntityId
        )
        .map(r => r.row);
      return evaluate(node.downstream, { ...context, activeRows: siblings });
    }
    case 'aggregate': {
      const rows = context.activeRows;
      if (rows.length === 0) return ZERO;
      if (node.op === 'count') return toDecimal(rows.length);
      const values = rows.map(r => {
        const v = r[node.field];
        return typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : 0) || 0;
      });
      switch (node.op) {
        case 'sum': { let total = ZERO; for (const v of values) total = total.plus(toDecimal(v)); return total; }
        case 'avg': { let total = ZERO; for (const v of values) total = total.plus(toDecimal(v)); return total.div(toDecimal(values.length)); }
        case 'min': { let m = toDecimal(values[0]); for (let i = 1; i < values.length; i++) { const d = toDecimal(values[i]); if (d.lt(m)) m = d; } return m; }
        case 'max': { let m = toDecimal(values[0]); for (let i = 1; i < values.length; i++) { const d = toDecimal(values[i]); if (d.gt(m)) m = d; } return m; }
      }
      return ZERO;
    }
    default: {
      const prime = (node as { prime?: string }).prime ?? '<undefined>';
      throw new IntentExecutorUnknownOperationError(
        `[evaluate] Unrecognized PrimeNode discriminator "${prime}". Node: ${JSON.stringify(node)}.`
      );
    }
  }
}
```

### Legacy adapter coverage map

| Inventory signature                                                                  | Adapter case in `legacy-intent-to-dag.ts`                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `linear_function :: { input, intercept, slope }`                                     | `translateOperation` → `arithmetic(add, mul, intercept)` |
| `scalar_multiply :: { input, rate }`                                                 | `translateOperation` → `arithmetic(multiply)`            |
| `conditional_gate :: { condition, onTrue, onFalse }`                                 | `translateOperation` → `conditional(compare(...))`       |
| `piecewise_linear :: { ratioInput, baseInput, segments, targetValue }`               | nested `conditional` chain with OB-186 zero-ratio fallback |
| `bounded_lookup_1d :: { boundaries, input, isMarginal, outputs }`                    | nested `conditional` on per-boundary `compare`           |
| `bounded_lookup_2d :: { rowBoundaries, columnBoundaries, outputGrid, ... }`          | nested 2D `conditional` chain                            |
| `constant :: { value }`                                                              | `constant` leaf                                          |
| `<no-operation> :: { source, sourceSpec }`                                           | `translateOperation` source-position branch → `translateSource` |
| `cap :: { maxValue, scope }`                                                         | `wrapModifier` → `conditional(compare(gt), const, value)` |
| `sum :: { filters, source_field, ... }` (metric derivation)                          | `legacyDerivationToDAG` → `filter`-chain + `aggregate`   |

---

## Phase 2 — Prompt rewrite + format detection

### Files changed

- `web/src/lib/ai/providers/anthropic-adapter.ts` — calculationIntent
  block of `plan_interpretation` prompt rewritten to describe the nine
  primes as building blocks. Removed: enumerated `IntentSource` types
  (`metric`, `ratio`, `aggregate`, `constant`, `entity_attribute`,
  `prior_component`, `scope_aggregate`). Replaced with: synthetic-key
  `reference` semantics and prime-composition examples (A–H) covering
  scalar rate, linear function, conditional gate, piecewise tier, scope
  override, cap modifier, floor modifier, input-constrained ratio.
- `web/src/lib/compensation/ai-plan-interpreter.ts` — `convertComponent`
  gains format detection: when `calculationIntent.prime` is present, the
  whole tree is validated against `VALID_PRIMES` (recursive
  `validatePrimeNodeTree`) and the component is persisted with
  `componentType: 'prime_dag'`. Legacy emissions with `operation` continue
  through the existing dispatch.
- `web/src/lib/calculation/primitive-registry.ts` — adds `prime_dag` to
  `FOUNDATIONAL_PRIMITIVES` and `REGISTRY` with `kind: 'operation'`.
- `web/src/types/compensation-plan.ts` — `ComponentType` union admits
  `'prime_dag'`.
- `web/src/lib/calculation/legacy-intent-to-dag.ts` — `componentIntentToDAG`
  short-circuits when the stored `intent` shape is already a `PrimeNode`,
  passing it through directly with modifier wrapping.

---

## Phase 3 — Derivation DAG + scope pre-compute deletion

### Files changed

- `web/src/lib/calculation/run-calculation.ts` — `applyMetricDerivations`
  routes sum / count / avg / min / max / ratio derivations through
  `legacyDerivationToDAG` + `evaluate()`. The legacy hardcoded operation
  branches removed; `delta` retains a hybrid path (prior-period rows are
  not in the row-context `EvalContext`).
- `web/src/lib/calculation/legacy-intent-to-dag.ts` — `scope_aggregate`
  adapter switched from the Phase 1 reference-form to the structural
  composition `{ prime: 'scope', boundary, downstream: { prime: 'aggregate', op, field } }`.
- `web/src/lib/calculation/intent-executor.ts` — `scope` prime case
  excludes the current entity by `entityId` to preserve the legacy
  `aggregateScopeRows` semantic ("manager does not earn override on own
  revenue").
- `web/src/app/api/calculation/run/route.ts` — `allEntityRowsForPeriod`
  built once before the entity loop; entity attributes from
  `entities.metadata` populated into `EntityData.attributes` so the scope
  prime can read the boundary value from `context.entity.metadata`.
  **Deleted:** `aggregateScopeRows` helper, `entityScopeAgg` map, and the
  `scopeAggregates` surface on `EntityData` consumed by it.
- `web/src/lib/intelligence/convergence-service.ts` — Pass 5 prompt
  (`generateAISemanticDerivations`) gains an HF-238 NOTE block explaining
  the DAG semantics behind each emission operation; emission shape
  preserved (runtime translation via `legacyDerivationToDAG` covers it).

### Deletion grep

```bash
$ grep -n 'aggregateScopeRows\|entityScopeAgg\|scopeAggregates:' src/app/api/calculation/run/route.ts
(no matches)
```

---

## Phase 4 — Adapter coverage + stored-totals baseline

### Adapter smoke test

`web/scripts/hf238-phase4-adapter-smoke.ts` loads every stored
`calculationIntent` across all 3 active tenants and walks each through
`componentIntentToDAG + evaluate` with a synthetic `EvalContext`.

```
Total components exercised: 67
Status summary: { "ok": 67 }
```

Every component translates to a `PrimeNode` tree and walks to a numeric
outcome with zero failures. The 8 Meridian Fleet Utilization components
that initially surfaced as `untranslatable` (bare-IntentSource at top
level — the Phase 0 audit's `<no-operation> :: {source, sourceSpec}`
signature) were closed by a `translateOperation` source-position branch
added in commit `78970cc8`.

### Stored-totals baseline

Verbatim from `web/scripts/hf238-phase4-totals.ts` against
`calculation_results`:

| Tenant | Plan | Period | Entities | Total |
|---|---|---|---|---|
| CRP | Consumables Commission Plan | January 2026 | 24 | 31,403.51 |
| CRP | Consumables Commission Plan | February 2026 | 24 | 34,337.20 |
| CRP | Capital Equipment Commission Plan | Jan 1-15 / 16-31 / Feb 1-15 / Feb 16-28, 2026 | 24/24/24/24 | 73,142.72 / 109,139.46 / 93,524.42 / 84,201.24 |
| CRP | Cross-Sell Bonus Plan | January 2026 / February 2026 | 32 / 32 | 2,400.00 / 2,050.00 |
| CRP | District Override Plan (44a00635) | January 2026 / February 2026 | 6 / 6 | 0.00 / 0.00 |
| Meridian | Incentive Plan 2025 (19f56c1d) | Jan/Feb/Mar 2025 | 67/67/67 | 185,063.00 / 175,585.00 / 196,337.00 |
| Meridian | Incentive Plan 2025 (9ac467ba) | Jan/Feb/Mar 2025 | 67/67/67 | 150,284.00 / 140,584.00 / 160,184.00 |
| BCL | Retail Banking Commission Plan 2025-2026 | Oct/Nov/Dec 2025 | 85/85/85 | 44,590.00 / 46,291.00 / 61,986.00 |

These are pre-HF-238 stored values. Fresh calculation runs through the
new engine are gated on UI re-trigger (architect-manual per the directive's
"UI re-import is architect-manual" caveat).

---

## Build verification

```bash
$ npx tsc --noEmit ; echo exit=$?
exit=0

$ npm run build ; echo exit=$?
... (full output: 0 errors)
exit=0
```

TypeScript clean; Next.js production build clean across all four phase
commits.

---

## Architectural notes / Phase 5 follow-ups

1. **Pass 5 emission shape**. The convergence Pass 5 prompt now documents
   the prime-DAG semantics inline, but the emission shape itself remains
   `{ metric, operation, source_field, filters }` for backward compatibility
   with stored `input_bindings`. A subsequent HF can swap to first-class
   `{ metric, dag: PrimeNode }` emission once persistence schema migrations
   accompany the change.

2. **`temporal_window` and `temporal_adjustment`** are not in the Phase 0
   inventory but the adapter throws `UntranslatableLegacyIntentError`
   with a clear structured message if either is emitted. The row-context
   `EvalContext` does not carry period history; restoring that requires
   plumbing `periodHistory` through `EvalContext`.

3. **`delta` derivation** retains the legacy hybrid sum-and-subtract path
   in `applyMetricDerivations` for the same reason — prior-period rows
   are not in the current `EvalContext` shape.

4. **CC cannot trigger fresh calculations**. Fresh calculation runs
   through the new engine require an authenticated UI session. The
   adapter smoke test verifies translation and evaluation coverage at the
   library level; per-entity numeric reconciliation against the stored
   baseline requires architect-triggered UI calculation across all
   tenant × plan × period combinations.

---

## PR
`hf-238-prime-dag-engine → main`

---

## R2 — Closures

R2 applies six AUD-011 closures to the same branch (PR #420 accumulates the
R2 commits). Each closure has a verification gate; pasted code and grep
output below.

### Closure 1 — primitive-registry cleanup

Stripped `promptStructuralExample` from every legacy entry; added
`deprecated: true` to every legacy entry; prompt builders filter
deprecated entries before surfacing the vocabulary.

**Verification gate (`grep -rn "promptStructuralExample" web/src/ --include="*.ts"`):**

```
src/lib/calculation/primitive-registry.ts:116:   * linear_function, piecewise_linear) had their `promptStructuralExample`
src/lib/calculation/primitive-registry.ts:132:  readonly promptStructuralExample?: string;
src/lib/calculation/primitive-registry.ts:154:  // promptStructuralExample stripped — these examples teach named convenience
src/lib/ai/providers/anthropic-adapter.ts:75:// primitives and emits the promptStructuralExample field where populated.
src/lib/ai/providers/anthropic-adapter.ts:79:// promptStructuralExample stripped from the registry because they conflict
src/lib/ai/providers/anthropic-adapter.ts:85:      && typeof p.promptStructuralExample === 'string'
src/lib/ai/providers/anthropic-adapter.ts:86:      && p.promptStructuralExample.length > 0,
src/lib/ai/providers/anthropic-adapter.ts:91:      '  [No active primitives carry promptStructuralExample content.',
src/lib/ai/providers/anthropic-adapter.ts:98:    ...withExamples.map((p) => `  - ${p.id}:\n    ${p.promptStructuralExample!.replace(/\n/g, '\n    ')}`),
```

The only remaining matches are: the interface field declaration
(line 132), comments documenting the strip, and the prompt builder
that filters by `!p.deprecated && p.promptStructuralExample`. Zero legacy
entries carry the field value.

**Final registry state — `FOUNDATIONAL_PRIMITIVES` array:**

```typescript
export const FOUNDATIONAL_PRIMITIVES = [
  'bounded_lookup_1d',
  'bounded_lookup_2d',
  'scalar_multiply',
  'conditional_gate',
  'aggregate',
  'ratio',
  'constant',
  'weighted_blend',
  'temporal_window',
  'linear_function',
  'piecewise_linear',
  'scope_aggregate',
  // HF-238: prime-DAG composition format. A `prime_dag` component carries a
  // recursive PrimeNode tree (intent-types.ts) under metadata.intent rather
  // than one of the legacy operation shapes. The engine routes prime_dag
  // components straight through evaluate() without going through
  // legacyIntentToDAG.
  'prime_dag',
] as const;
```

Twelve legacy entries are marked `deprecated: true`; only `prime_dag`
carries the active flag. The registry is retained at 13 entries (not
collapsed) so the `ComponentType` and `FoundationalPrimitive` unions
continue to provide compile-time narrowing for stored intents handled by
the storage-boundary adapter.

### Closure 2 — eliminate dual scope data supply

`scopeAggregates` removed from `EntityData` interface and the
corresponding pre-population block removed from `buildEvalContext`. The
scope prime walks `allEntityRows` as the sole data source.

**Verification gate (`grep -rn "scopeAggregates" web/src/ --include="*.ts" --include="*.tsx"`):**

```
src/app/api/calculation/run/route.ts:499:  // HF-157: Added metadata for HF-155 scopeAggregates (district/region resolution)
src/app/api/calculation/run/route.ts:2410:        // scopeAggregates surface; the scope prime walks these rows directly.
src/lib/calculation/intent-executor.ts:39:  // HF-238 R2 Closure 2: scopeAggregates field deleted. The scope prime
```

All three hits are comments. Zero live-code references.

The prompt's synthetic-key list (anthropic-adapter.ts:432-444) was
updated: `scope_aggregate:<scope>:<field>:<agg>` reference syntax removed;
the LLM is instructed to compose `scope` + `aggregate` primes directly
(see Example E).

### Closure 3 — inline executeOperation

`buildEvalContext` exported from `intent-executor.ts`. The single
remaining caller of `executeOperation` (the fallback path at
`run-calculation.ts:343`) inlined to `legacyIntentToDAG + buildEvalContext +
evaluate`. The `executeOperation` function deleted.

**Inlined call site (`run-calculation.ts:317-338`):**

```typescript
      // HF-238 R2 Closure 4: OB-120 isMarginal auto-detection moved into the
      // bounded_lookup_1d case of legacyIntentToDAG (legacy-intent-to-dag.ts).
      // The call site no longer dispatches on operation names — every legacy
      // shape flows through translateOperation, which carries the heuristic.

      if (isIntentOperation(intentOp)) {
        // HF-238 R2 Closure 3: inlined the prior executeOperation wrapper.
        // The three operations below are the only execution path — translate
        // legacy shape to DAG, build the evaluation context, walk it.
        const entityData: EntityData = {
          entityId: '',
          metrics,
          attributes: {},
        };
        const dag = legacyIntentToDAG(intentOp);
        const context = buildEvalContext(entityData);
        const intentPayoutDecimal = evaluate(dag, context);
        const intentPayout = toNumber(intentPayoutDecimal);
        if (intentPayout > 0) {
          payout = intentPayout;
          details = {
            ...details,
            fallbackSource: 'calculationIntent',
            intentOperation: intentOp.operation,
            intentPayout,
          };
        }
      }
```

**Verification gate (`grep -rn "executeOperation" web/src/ --include="*.ts" --include="*.tsx"`):**

```
src/lib/calculation/intent-executor.ts:395:// HF-238 R2 Closure 3: executeOperation wrapper deleted. The single
src/lib/calculation/run-calculation.ts:320:        // HF-238 R2 Closure 3: inlined the prior executeOperation wrapper.
```

Both hits are R2 closure markers. Zero live-code references.

### Closure 4 — isMarginal heuristic into adapter

The OB-120 isMarginal auto-detection block (formerly at
`run-calculation.ts:322-334`, dispatching on
`intentOp.operation === 'bounded_lookup_1d'`) deleted; the heuristic
relocated into the `bounded_lookup_1d` case of `legacyIntentToDAG` where
it sits naturally alongside the DAG construction for that legacy shape.

**Adapter (`legacy-intent-to-dag.ts` bounded_lookup_1d, with the new block):**

```typescript
    case 'bounded_lookup_1d': {
      const inputNode = translateSource(op.input);
      const boundaries = Array.isArray(op.boundaries) ? op.boundaries : [];
      const outputs = Array.isArray(op.outputs) ? op.outputs : [];

      // HF-238 R2 Closure 4 (relocated OB-120): auto-detect isMarginal for
      // rate-like output sets. Mirrors the pre-HF-238 heuristic at the call
      // site (run-calculation.ts) — if every non-zero output is in (0, 1.0),
      // treat outputs as rates and multiply against the input value.
      // Localizing the heuristic inside the adapter keeps call sites free
      // of named-type dispatch.
      let isMarginal = !!op.isMarginal;
      if (!isMarginal && Array.isArray(outputs)) {
        const nonZero = outputs.filter(v => v !== 0);
        if (nonZero.length > 0 && nonZero.every(v => v > 0 && v < 1.0)) {
          isMarginal = true;
        }
      }

      // ...nested conditional/compare construction follows...
```

**Verification gate (`grep -n "isMarginal" web/src/lib/calculation/run-calculation.ts`):**

```
src/lib/calculation/run-calculation.ts:314:      // HF-238 R2 Closure 4: OB-120 isMarginal auto-detection moved into the
```

The single remaining hit is the closure comment. Zero live-code
references in `run-calculation.ts`.

### Closure 5 — delta through DAG via `prior_period` prime

**PrimeNode now carries ten discriminators.** `prior_period` added; it
modifies context by switching `activeRows` to `priorPeriodRows` for its
downstream sub-tree, analogous to how `scope` switches to peer rows.

**Updated `PrimeNode` type and `VALID_PRIMES` set
(`intent-types.ts`):**

```typescript
export type PrimeNode =
  | { prime: 'arithmetic'; op: 'add' | 'subtract' | 'multiply' | 'divide'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'aggregate'; op: 'sum' | 'count' | 'avg' | 'min' | 'max'; field: string }
  | { prime: 'filter'; predicate: PrimePredicate; downstream: PrimeNode }
  | { prime: 'conditional'; condition: PrimeNode; then: PrimeNode; else: PrimeNode }
  | { prime: 'scope'; boundary: string; downstream: PrimeNode }
  | { prime: 'compare'; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'logical'; op: 'and' | 'or' | 'not'; inputs: PrimeNode[] }
  | { prime: 'constant'; value: number }
  | { prime: 'reference'; field: string }
  | { prime: 'prior_period'; downstream: PrimeNode };

export const VALID_PRIMES = new Set<PrimeNode['prime']>([
  'arithmetic',
  'aggregate',
  'filter',
  'conditional',
  'scope',
  'compare',
  'logical',
  'constant',
  'reference',
  'prior_period',
]);
```

**`EvalContext` carries `priorPeriodRows?` (optional):**

```typescript
export interface EvalContext {
  entity: { metadata: Record<string, unknown> };
  activeRows: Record<string, unknown>[];
  allEntityRows: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }>;
  metrics: Record<string, number>;
  priorPeriodRows?: Record<string, unknown>[];
}
```

**`evaluate()` case for `prior_period` (`intent-executor.ts`):**

```typescript
    case 'prior_period': {
      // HF-238 R2 Closure 5: switch activeRows to the prior-period rows
      // for the downstream sub-tree. Absent prior_period data resolves to
      // an empty active set (downstream aggregates return zero).
      return evaluate(node.downstream, {
        ...context,
        activeRows: context.priorPeriodRows ?? [],
      });
    }
```

**Adapter — `legacyDerivationToDAG` delta branch
(`legacy-intent-to-dag.ts`):**

```typescript
  if (d.operation === 'delta') {
    const field = d.source_field ?? '';
    const buildAggregateWithFilters = (): PrimeNode => {
      let node: PrimeNode = { prime: 'aggregate', op: 'sum', field };
      if (Array.isArray(d.filters) && d.filters.length > 0) {
        for (let i = d.filters.length - 1; i >= 0; i--) {
          const f = d.filters[i];
          node = {
            prime: 'filter',
            predicate: { field: f.field, operator: f.operator, value: f.value },
            downstream: node,
          };
        }
      }
      return node;
    };
    const currentSide = buildAggregateWithFilters();
    const priorSide: PrimeNode = {
      prime: 'prior_period',
      downstream: buildAggregateWithFilters(),
    };
    return {
      prime: 'arithmetic',
      op: 'subtract',
      inputs: [currentSide, priorSide],
    };
  }
```

**Hybrid block removed from `applyMetricDerivations`.** The function now
flattens `priorPeriodData` into a `priorRows` array once and passes it
through `EvalContext.priorPeriodRows`:

```typescript
  // HF-238 R2 Closure 5: flatten prior-period rows once into a single array,
  // matching the activeRows shape so the `prior_period` prime can switch
  // EvalContext.activeRows to this set when delta derivations run.
  const priorRows: Record<string, unknown>[] = [];
  if (priorPeriodData) {
    for (const [, rows] of Array.from(priorPeriodData.entries())) {
      for (const r of rows) {
        const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
          ? r.row_data as Record<string, unknown>
          : {};
        priorRows.push(rd);
      }
    }
  }

  for (const rule of derivations) {
    // HF-238 R2 Closure 5: delta hybrid block deleted. Delta derivations now
    // flow through the same legacyDerivationToDAG → evaluate() pipeline as
    // every other operation; the prior_period prime switches activeRows to
    // priorRows for the prior side of the subtraction.

    // Build the LegacyDerivation shape from the rule and translate to DAG.
    // ...
    const context: EvalContext = {
      entity: { metadata: {} },
      activeRows: allRows,
      allEntityRows: [],
      metrics: { ...derived },
      priorPeriodRows: priorRows,
    };
    // ...
```

**Verification gate (`grep -n "if (rule.operation === 'delta'" web/src/lib/calculation/run-calculation.ts`):** zero hits — no delta dispatch in `applyMetricDerivations`.

A separate `operation === 'delta'` hit remains at `run-calculation.ts:920`
inside `hasDeltaDerivations` — this is **data-loading planning**, not
execution dispatch. It decides whether to query the prior-period
record from the database; the execution path still runs uniformly
through `evaluate()` regardless. Documented here so the strict-grep
gate reader can distinguish.

**`validatePrimeNodeTree` updated** (`ai-plan-interpreter.ts`) to
accept `prior_period` as a recognized downstream-carrying prime.

**Synthetic verification (`scripts/hf238-r2-prior-period-smoke.ts`):**

```
=== Synthetic prior_period smoke ===
Translated DAG shape:
arithmetic(subtract)
  filter(category eq "A")
    aggregate(sum, amount)
  prior_period
    filter(category eq "A")
      aggregate(sum, amount)

Result: 70
Expected: 70
OK

Empty prior set result: 150
Expected: 150 (current sum, prior_period yields 0 on empty rows)
OK

Absent prior set result: 150
Expected: 150 (priorPeriodRows undefined → empty active set)
OK
```

### Closure 6 — Convergence Pass 5 DAG-native emission (DESIGN GATE)

Not implemented in R2 per directive. Scoped for the next HF. The
convergence stage remains GAP until DAG-native emission ships at the
LLM-output layer; the runtime adapter (`legacyDerivationToDAG`) is the
holding pattern.

Design gate: does `input_bindings.metric_derivations` persistence
need to evolve into a DAG-bearing shape, or can the column carry either
format with runtime detection (matching how plan intents work today)?
Architect disposition required.

### R2 build verification

```bash
$ npx tsc --noEmit ; echo exit=$?
exit=0

$ npm run build ; echo exit=$?
exit=0

$ npm run dev (smoke)
✓ Ready in 1932ms
HTTP 307  (root redirect to login — expected)
```

### R2 regression smoke — adapter coverage preserved

`scripts/hf238-phase4-adapter-smoke.ts` re-run after R2:

```
=== HF-238 Phase 4 Adapter Smoke Test ===
Total components exercised: 67
Status summary: { "ok": 67 }
```

All 67 stored components across CRP / Meridian / BCL continue to
translate cleanly and walk to numeric outcomes through
componentIntentToDAG + evaluate. No regressions from the R2 closures.

### R2 anti-pattern checklist

```
[x] Closure 1: promptStructuralExample stripped from all legacy entries
[x] Closure 2: scopeAggregates — zero live-code hits (3 comment-only)
[x] Closure 3: executeOperation — zero live-code hits (2 comment-only)
[x] Closure 4: isMarginal — zero live-code hits in run-calculation.ts (1 comment)
[x] Closure 5: delta hybrid block removed; prior_period prime added to
                PrimeNode / VALID_PRIMES / evaluate() / validatePrimeNodeTree
[x] AP-17:    one execution path — evaluate() only
[x] AP-5/AP-6: no hardcoded field names added
[x] Domain-agnostic: no tenant names in code
[x] Build clean (tsc + next build)
[x] SR-34:    no known structural bypasses remaining
```

