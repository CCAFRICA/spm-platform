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
