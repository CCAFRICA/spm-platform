# HF-237 Regression Correction + Prime-Level Calculation Engine

**Date:** 2026-05-19
**Problem:** HF-237 (PR #419, merged to production) extended the source-type registry in the plan interpretation prompt by adding `scope_aggregate` as another enumerated option. This is the same registry/cherry-pick pattern (T1-E952) that DIAG-050 closed at the SCI layer. The fix to Plan 4 is not "add scope_aggregate to the registry." The fix is "remove the registry."
**Governing principles:** T1-E910 v2 (Korean Test: no registries, structured failure), T1-E902 v2 (Carry Everything: LLM comprehension persists faithfully), Scale by Design (reject convenience over architecture)

---

## §1 — What HF-237 did wrong

HF-237 changed `anthropic-adapter.ts:617-668`. Specifically:

- Replaced two `aggregate`-source examples with `scope_aggregate`-source examples
- Added a "WHEN TO USE" disambiguation block enumerating `metric` vs `aggregate` vs `scope_aggregate` source choice criteria
- Removed the prior prohibition "Do NOT use 'scope_aggregate'"
- Added engine-recognized scope values (`'district'`, `'region'`)

This is a registry extension at the prompt layer. The LLM is given a list of source types and told to pick from it. The list grew from N to N+1. The next plan structure that doesn't match a listed source type will require N+2.

The session conversation preceding HF-237 explicitly identified this as the wrong pattern:

- "The fix isn't 'add scope_aggregate to the prompt's allowed source types.' That's extending the registry."
- "The engine should execute at the prime level — a DAG of filter → aggregate → conditional → arithmetic nodes that compose arbitrarily."
- "The 11-case dispatch table becomes 5. Permanently."

HF-237 ignored the architectural decision and shipped a tactical fix. The fix now needs to be replaced with the correct approach.

---

## §2 — The five primes

Every compensation calculation decomposes into compositions of five irreducible operations:

### Prime 1: Arithmetic
Scalar math on values.
```
{ prime: 'arithmetic', op: 'multiply' | 'add' | 'subtract' | 'divide', inputs: [Node, Node] }
```
Example: `revenue × 0.06`, `attainment × rate`, `commission + draw`

### Prime 2: Aggregation
Reduce a set of data rows to a single value.
```
{ prime: 'aggregate', op: 'sum' | 'count' | 'avg' | 'min' | 'max', field: string }
```
Example: `sum(total_amount)`, `count(transactions)`

The input rows come from upstream in the DAG — whatever filter and scope nodes have already narrowed.

### Prime 3: Filter
Select which data rows participate. Predicate applied to each row.
```
{ prime: 'filter', predicate: { field: string, operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in', value: any } }
```
Example: `product_category = 'Capital Equipment'`, `order_type = 'Cross-Sell'`

Multiple filters compose by chaining (AND semantics): `filter(A) → filter(B)` means rows must satisfy both.

### Prime 4: Conditional
Boolean evaluation with branching. Produces one of two sub-DAGs.
```
{ prime: 'conditional', condition: { left: Node, operator: string, right: Node }, then: Node, else: Node }
```
Example: "If attainment ≥ 120%, use 8% rate; else if attainment ≥ 100%, use 5% rate; else 3%."

Piecewise/tiered structures are nested conditionals. Each tier is a conditional whose `else` branch is the next tier.

### Prime 5: Scope
Change whose data the downstream nodes operate on. Shifts from entity-level to group-level.
```
{ prime: 'scope', boundary: string }
```
Where `boundary` is the entity metadata field that defines the group: `'district'`, `'region'`, `'team'`, or any other grouping the entity model carries.

When scope is present, all downstream aggregation and filter nodes operate on the combined rows of every entity sharing that boundary value — not just the current entity's rows.

Without scope (default), every downstream node operates on the current entity's committed_data rows.

---

## §3 — CRP plans as prime compositions

### Plan 1: Capital Equipment Commission (linear_function)

**English:** "6% of Capital Equipment revenue + $200 base"

**DAG:**
```
arithmetic(add,
  arithmetic(multiply,
    aggregate(sum, total_amount,
      filter(product_category = 'Capital Equipment')
    ),
    constant(0.06)
  ),
  constant(200)
)
```

Three primes composing: filter → aggregate → arithmetic → arithmetic. No convenience type needed.

### Plan 2: Consumables Commission (piecewise_linear)

**English:** "Commission on Consumables revenue at tiered rates based on attainment vs quota. Below 100%: 3%. 100-119%: 5%. 120%+: 8%."

**DAG:**
```
conditional(
  gte(
    arithmetic(divide,
      aggregate(sum, total_amount, filter(product_category = 'Consumables')),
      aggregate(sum, monthly_quota)
    ),
    constant(1.2)
  ),
  arithmetic(multiply,
    aggregate(sum, total_amount, filter(product_category = 'Consumables')),
    constant(0.08)
  ),
  conditional(
    gte(attainment, constant(1.0)),
    arithmetic(multiply, consumable_revenue, constant(0.05)),
    arithmetic(multiply, consumable_revenue, constant(0.03))
  )
)
```

Four primes composing: filter → aggregate → arithmetic (attainment) → conditional (tier) → arithmetic (rate × revenue). The piecewise structure is nested conditionals — not a special-purpose `PiecewiseLinearOp` type.

Note: sub-expression references (`consumable_revenue`, `attainment`) are DAG node references, not metric names. The DAG evaluator computes each node once and caches. This is standard DAG evaluation.

### Plan 3: Cross-Sell Bonus (conditional_gate)

**English:** "If the rep has ≥1 Capital Equipment deal AND ≥1 Cross-Sell deal, pay $50 per Cross-Sell."

**DAG:**
```
conditional(
  and(
    gte(
      aggregate(count, transaction_id, filter(product_category = 'Capital Equipment')),
      constant(1)
    ),
    gte(
      aggregate(count, transaction_id, filter(order_type = 'Cross-Sell')),
      constant(1)
    )
  ),
  arithmetic(multiply,
    aggregate(count, transaction_id, filter(order_type = 'Cross-Sell')),
    constant(50)
  ),
  constant(0)
)
```

Three primes composing: filter → aggregate (count) → conditional (gate) → arithmetic. No special `ConditionalGateOp`.

### Plan 4: District Override (scope_aggregate)

**English:** "DM receives 1.5% of their district's total Capital Equipment revenue."

**DAG:**
```
arithmetic(multiply,
  scope(district,
    aggregate(sum, total_amount,
      filter(product_category = 'Capital Equipment')
    )
  ),
  constant(0.015)
)
```

Four primes composing: scope → filter → aggregate → arithmetic. The scope node changes the data context from "this entity's rows" to "all entities in this entity's district." Everything downstream — the filter, the aggregation — operates on the scoped data set.

No `scope_aggregate` source type. No `ScalarMultiplyOp`. No special case. The same filter and aggregate primes used in Plans 1-3 compose with scope to produce Plan 4. The engine code that evaluates filter and aggregate is the SAME code — scope changes the input data set, not the evaluation logic.

---

## §4 — Engine implementation: DAG walker

### 4.1 — Node type definition

Replace the current `IntentSource` union (8 enumerated types at `intent-types.ts:23-43`) and the named operation types (`LinearFunctionOp`, `PiecewiseLinearOp`, etc.) with:

```typescript
type PrimeNode =
  | { prime: 'arithmetic'; op: 'add' | 'subtract' | 'multiply' | 'divide'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'aggregate'; op: 'sum' | 'count' | 'avg' | 'min' | 'max'; field: string }
  | { prime: 'filter'; predicate: { field: string; operator: string; value: unknown } }
  | { prime: 'conditional'; condition: PrimeNode; then: PrimeNode; else: PrimeNode }
  | { prime: 'scope'; boundary: string }
  | { prime: 'constant'; value: number }
  | { prime: 'reference'; field: string }  // reads a value from entity data or resolved metrics
```

Seven node types total. `constant` and `reference` are leaf nodes (data sources). The five primes are operation nodes. Any compensation structure composes from these.

### 4.2 — DAG evaluator

Replace the 11-case `executeOperation` dispatch at `intent-executor.ts:506-528` with a recursive DAG evaluator:

```typescript
function evaluate(node: PrimeNode, context: EvalContext): number {
  switch (node.prime) {
    case 'constant':
      return node.value;

    case 'reference':
      return context.metrics[node.field] ?? 0;

    case 'arithmetic': {
      const left = evaluate(node.inputs[0], context);
      const right = evaluate(node.inputs[1], context);
      switch (node.op) {
        case 'add': return left + right;
        case 'subtract': return left - right;
        case 'multiply': return left * right;
        case 'divide': return right === 0 ? 0 : left / right;
      }
    }

    case 'aggregate': {
      const rows = context.activeRows;  // filtered + scoped by upstream nodes
      return rows.reduce((acc, row) => {
        const val = Number(row[node.field]) || 0;
        switch (node.op) {
          case 'sum': return acc + val;
          case 'count': return acc + 1;
          case 'min': return Math.min(acc, val);
          case 'max': return Math.max(acc, val);
          case 'avg': /* handled post-reduce */ return acc + val;
        }
      }, node.op === 'min' ? Infinity : 0);
      // avg: divide by rows.length after reduce
    }

    case 'filter': {
      const filtered = context.activeRows.filter(row =>
        evaluatePredicate(row, node.predicate)
      );
      // Push filtered rows into context for downstream nodes
      return evaluate(context.downstream, { ...context, activeRows: filtered });
    }

    case 'scope': {
      const currentEntity = context.entity;
      const boundaryValue = currentEntity.metadata[node.boundary];
      const siblingRows = context.allEntityRows.filter(row =>
        row.entityMetadata[node.boundary] === boundaryValue
      );
      // Push scoped rows into context for downstream nodes
      return evaluate(context.downstream, { ...context, activeRows: siblingRows });
    }

    case 'conditional': {
      const conditionResult = evaluate(node.condition, context);
      return conditionResult ? evaluate(node.then, context) : evaluate(node.else, context);
    }
  }
}
```

The evaluator is ~50 lines. It replaces `executePiecewiseLinear` (30+ lines), `executeLinearFunction` (10 lines), `executeConditionalGate` (20+ lines), `executeScalarMultiply`, and 7 other dispatch cases. The evaluation logic for scope is 4 lines — read the boundary field from entity metadata, filter all entity rows by that boundary value, pass to downstream. The same filter evaluator that works for `product_category = 'Capital Equipment'` now works inside a scope context without any new code.

### 4.3 — Evaluation context

```typescript
interface EvalContext {
  entity: Entity;                          // current entity being calculated
  activeRows: Record<string, unknown>[];   // current data set (narrowed by scope + filter)
  allEntityRows: EntityRow[];              // all entities' committed_data (for scope lookups)
  metrics: Record<string, number>;         // pre-resolved metric values (for reference nodes)
}
```

The context flows through the DAG. Scope nodes widen `activeRows` to sibling entities. Filter nodes narrow `activeRows` to matching rows. Aggregate nodes reduce `activeRows` to a value. Arithmetic and conditional nodes operate on values.

### 4.4 — What this replaces in intent-executor.ts

| Current code | Lines (AUD-010) | Replaced by |
|---|---|---|
| `executeOperation` 11-case switch | 506-528 | `evaluate()` recursive DAG walker, 7 cases |
| `executePiecewiseLinear` | 549-580 | Nested `conditional` + `arithmetic` nodes |
| `executeLinearFunction` | 534-543 | `arithmetic(add, arithmetic(multiply, ...), constant)` |
| `executeConditionalGate` | 326-348 | `conditional` node with `aggregate(count)` sub-DAGs |
| `resolveSource` 8-case switch | 80-167 | `reference` and `constant` leaf nodes |
| `resolveValue` | 168-200 | Eliminated — values resolve via DAG evaluation |
| `IntentSource` 8-type union | intent-types.ts:23-43 | `PrimeNode` 7-type union |
| `LinearFunctionOp` type | intent-types.ts | Eliminated |
| `PiecewiseLinearOp` type | intent-types.ts | Eliminated |
| `ConditionalGateOp` type | intent-types.ts | Eliminated |
| `ScalarMultiplyOp` type | intent-types.ts | Eliminated |

---

## §5 — Prompt changes: remove the registry

### 5.1 — What to remove from anthropic-adapter.ts

Remove from `anthropic-adapter.ts:617-668` (HF-237's changes):
- The "WHEN TO USE" disambiguation block enumerating `metric` vs `aggregate` vs `scope_aggregate`
- The enumerated source type examples
- The scope value enumeration (`'district' | 'region'`)
- Any instruction telling the LLM to "choose" a source type from a list

Remove from the broader prompt (pre-HF-237 content):
- The enumerated `calculationMethod.type` values (`linear_function`, `piecewise_linear`, `conditional_gate`, `scalar_multiply`, etc.)
- The `source` field's enumerated values (`metric`, `aggregate`, `constant`, `entity_attribute`, `prior_component`, `cross_data`, `ratio`)
- Any response schema that constrains the LLM to a fixed set of operation types

### 5.2 — What to replace it with

The prompt tells the LLM to describe the compensation structure using five building blocks:

```
When interpreting a plan component's calculation method, describe HOW the commission is computed using these building blocks. Compose them as needed — any combination is valid:

- filter: select which data rows participate. Example: {prime: 'filter', predicate: {field: 'product_category', operator: 'eq', value: 'Capital Equipment'}}
- aggregate: reduce filtered rows to a single number. Operations: sum, count, avg, min, max. Example: {prime: 'aggregate', op: 'sum', field: 'total_amount'}
- arithmetic: math on values. Operations: add, subtract, multiply, divide. Example: {prime: 'arithmetic', op: 'multiply', inputs: [<node>, <node>]}
- conditional: if/then/else. Example: {prime: 'conditional', condition: <node>, then: <node>, else: <node>}
- scope: change whose data is used. Default is the individual rep's data. Use scope when the plan says "district revenue" or "region total." Example: {prime: 'scope', boundary: 'district'}

Leaf values:
- constant: a fixed number. Example: {prime: 'constant', value: 0.06}
- reference: read a value from entity data. Example: {prime: 'reference', field: 'monthly_quota'}

Nest these to describe the full calculation from raw data to commission amount.
```

The LLM reads "1.5% of your district's Capital Equipment revenue" and emits:

```json
{
  "prime": "arithmetic",
  "op": "multiply",
  "inputs": [
    {
      "prime": "scope",
      "boundary": "district",
      "downstream": {
        "prime": "aggregate",
        "op": "sum",
        "field": "total_amount",
        "upstream": {
          "prime": "filter",
          "predicate": {"field": "product_category", "operator": "eq", "value": "Capital Equipment"}
        }
      }
    },
    {"prime": "constant", "value": 0.015}
  ]
}
```

No source type registry. No convenience type name. The LLM describes what the plan says. The engine evaluates what the LLM described.

### 5.3 — Structured failure at convertComponent

`convertComponent` (`ai-plan-interpreter.ts`) translates the LLM's DAG into the engine's `PrimeNode` tree. The translation is structural — validate that each node has a recognized `prime` field and that its children are valid nodes. If any node has an unrecognized `prime` value:

```typescript
if (!VALID_PRIMES.has(node.prime)) {
  throw new UnconvertibleComponentError(
    `Unrecognized prime "${node.prime}" in plan component "${componentName}". ` +
    `LLM emission preserved: ${JSON.stringify(node)}. ` +
    `Engine supports: arithmetic, aggregate, filter, conditional, scope, constant, reference.`
  );
}
```

This is Korean Test v2 compliance: structured failure on unrecognized identifiers, with the LLM's original emission preserved for architect review. The plan does not silently import with a broken intent. The gap is visible at import time.

Note: `VALID_PRIMES` is not a registry in the sense we've been discussing. It's the engine's executable primitive set — the finite set of operations the engine can actually evaluate. This is the legitimate boundary (per the session conversation): "When the engine genuinely can't execute something, it says so. That tells you what primitive to build next."

---

## §6 — Derivation rules become DAG fragments

### 6.1 — Current derivation shape (flat record)

```typescript
{
  metric: string,
  operation: string,
  source_field: string,
  filters: Filter[],
  source_pattern: string
}
```

This is a convenience record that hardcodes `filter → aggregate` as the only derivation pattern. It cannot express scope. It cannot express conditional derivations. It cannot express derived metrics that depend on other metrics.

### 6.2 — New derivation shape (DAG fragment)

A derivation rule IS a DAG fragment — the sub-tree that produces a metric value from committed_data rows:

```typescript
{
  metric: string,        // the name this derivation produces
  dag: PrimeNode         // the computation tree
}
```

For Plan 1's `equipment_revenue`:
```json
{
  "metric": "equipment_revenue",
  "dag": {
    "prime": "aggregate",
    "op": "sum",
    "field": "total_amount",
    "upstream": {
      "prime": "filter",
      "predicate": {"field": "product_category", "operator": "eq", "value": "Capital Equipment"}
    }
  }
}
```

For Plan 4's scoped `equipment_revenue`:
```json
{
  "metric": "equipment_revenue",
  "dag": {
    "prime": "scope",
    "boundary": "district",
    "downstream": {
      "prime": "aggregate",
      "op": "sum",
      "field": "total_amount",
      "upstream": {
        "prime": "filter",
        "predicate": {"field": "product_category", "operator": "eq", "value": "Capital Equipment"}
      }
    }
  }
}
```

Same metric name, same column, same filter — the only difference is the scope node wrapping the aggregate. The engine evaluates both with the same DAG walker. No `scope` field on a flat record. No special-case code path.

### 6.3 — applyMetricDerivations becomes DAG evaluation

Current `applyMetricDerivations` (`run-calculation.ts:119-200`) iterates rows and applies flat derivation rules with hardcoded `rowMatchesFilters` + aggregation. Replace with:

```typescript
function resolveMetricFromDerivation(derivation: { metric: string, dag: PrimeNode }, context: EvalContext): number {
  return evaluate(derivation.dag, context);
}
```

One line. The DAG walker handles filter, scope, and aggregation recursively. The `rowMatchesFilters` function still exists — it's called by the filter prime evaluator inside the DAG walker.

### 6.4 — Cross-plan resolution

Derivation DAGs persist to `input_bindings.metric_derivations` as JSONB. Cross-plan resolution at `route.ts:318-337` searches sibling plans' derivations by metric name (unchanged). The DAG is the value — when Plan 4 finds Plan 1's `equipment_revenue` derivation, it gets the complete computation tree including filter. Plan 4 wraps it in a scope node if needed.

The metric name mismatch issue (`period_equipment_revenue` vs `equipment_revenue`) is addressed by the LLM using consistent metric naming across plans (since both plans read the same plan PDF set and the prompt doesn't constrain naming). If names still diverge, that's a plan comprehension prompt quality issue, not an engine architecture issue.

---

## §7 — Scope aggregation: no special code path

The current scope aggregation pre-computation at `route.ts:2345-2397` is a separate code path that runs before the entity loop. In the DAG model, scope evaluation is INSIDE the DAG walker — it's the scope prime's evaluation logic:

```typescript
case 'scope': {
  const boundaryValue = context.entity.metadata[node.boundary];
  const siblingRows = context.allEntityRows.filter(row =>
    row.entityMetadata[node.boundary] === boundaryValue
  );
  return evaluate(node.downstream, { ...context, activeRows: siblingRows });
}
```

This replaces `aggregateScopeRows` (`route.ts:2345-2397`). The scope logic moves from a pre-computation step into the DAG evaluator where it belongs. The evaluator handles it lazily — scope resolution happens when the DAG walker reaches a scope node, not eagerly for all entities before the loop starts.

Performance consideration: evaluating scope inside the entity loop means re-computing the sibling aggregate for each DM in the same district. If James Whitfield and Robert Vasquez share district NE-NE, both evaluate the same scope aggregate independently. For correctness this is fine. For performance, the DAG evaluator can memoize scope aggregate results by `(boundary_field, boundary_value, dag_hash)`. This is an optimization, not a correctness concern, and can be added after the core DAG walker ships.

---

## §8 — Migration path from current code

The current codebase has live tenants with stored `input_bindings` in the old format (flat derivation records, named operation types). The migration:

### 8.1 — Backward compatibility bridge

`convertComponent` reads both formats:
- If `input_bindings.metric_derivations[].dag` exists → new format, evaluate as DAG
- If `input_bindings.metric_derivations[].operation` exists → old format, translate to equivalent DAG at read time:

```typescript
function legacyDerivationToDAG(d: LegacyDerivation): PrimeNode {
  let node: PrimeNode = { prime: 'aggregate', op: d.operation, field: d.source_field };
  if (d.filters?.length) {
    for (const f of d.filters) {
      node = { prime: 'filter', predicate: f, downstream: node };
    }
  }
  return node;
}
```

Old derivations transparently upgrade to DAGs on read. No migration script needed for existing tenants. When convergence re-runs for a plan, it writes new-format DAG derivations. Over time, all tenants' derivations become DAGs.

### 8.2 — Intent compatibility bridge

Same pattern for stored intents:
- If `calculationIntent.prime` exists → new format, evaluate as DAG
- If `calculationIntent.operation` exists (e.g. `'linear_function'`) → translate to equivalent DAG:

```typescript
function legacyIntentToDAG(intent: LegacyIntent): PrimeNode {
  switch (intent.operation) {
    case 'linear_function':
      return { prime: 'arithmetic', op: 'add', inputs: [
        { prime: 'arithmetic', op: 'multiply', inputs: [
          { prime: 'reference', field: intent.input.sourceSpec?.field },
          { prime: 'constant', value: intent.rate }
        ]},
        { prime: 'constant', value: intent.intercept ?? 0 }
      ]};
    case 'scalar_multiply':
      return { prime: 'arithmetic', op: 'multiply', inputs: [
        translateSource(intent.input),
        { prime: 'constant', value: intent.rate }
      ]};
    // ... other legacy types
  }
}
```

This bridge translates old intents to DAGs at evaluation time. Plans re-imported through the new prompt produce DAGs natively. Plans that haven't been re-imported continue to work through the bridge.

---

## §9 — What HF-237 specifically introduced that gets replaced

| HF-237 change | Location | What replaces it |
|---|---|---|
| "WHEN TO USE" disambiguation block (metric vs aggregate vs scope_aggregate) | anthropic-adapter.ts:617-668 | Removed entirely. Prompt describes five primes instead. |
| `scope_aggregate` source examples in prompt | anthropic-adapter.ts:617-668 | Scope is a prime node in the DAG, not a source type. Prompt shows scope composition example. |
| Engine-recognized scope values in prompt (`'district' \| 'region'`) | anthropic-adapter.ts:617-668 | Scope boundary is whatever entity metadata field the LLM identifies from the plan text. Not enumerated. |

The executor's `scope_aggregate` case at `intent-executor.ts:159` and `convertComponent`'s `case 'scope_aggregate':` at `ai-plan-interpreter.ts:467` are absorbed into the DAG walker — they don't need to be explicitly removed, they become unreachable as the DAG evaluator handles all evaluation. They can be removed in a cleanup pass.

---

## §10 — Verification

After shipping, re-import all 4 CRP plans through the updated prompt. Each plan's stored `calculationIntent` should be a DAG of prime nodes. Calculate all plans across all periods. Reconcile:

| Plan | Structure | Reference |
|---|---|---|
| Plan 1 (CE) | filter → aggregate → arithmetic | $360,007.84 (4 periods, should remain exact) |
| Plan 2 (CN) | filter → aggregate + aggregate → arithmetic → conditional → arithmetic | $60,328.79 (2 periods, delta investigation continues) |
| Plan 3 (XS) | filter → aggregate → conditional → filter → aggregate → arithmetic | $4,450.00 (2 periods, should remain exact) |
| Plan 4 (DO) | scope → filter → aggregate → arithmetic | $136,530.42 (2 periods, first non-zero result) |

Plans 1 and 3 must not regress — the DAG walker evaluating their compositions must produce identical results to the current named-primitive executors. The backward compatibility bridge (§8) ensures existing stored intents evaluate correctly during the transition.

---

## §11 — Code change inventory

| File | Change | Nature |
|---|---|---|
| `intent-types.ts` | Define `PrimeNode` union type. Old types (`LinearFunctionOp`, etc.) retained for backward compat bridge. | Additive |
| `intent-executor.ts` | Add `evaluate(node: PrimeNode, context: EvalContext)` recursive DAG walker (~50 lines). Old `executeOperation` retained behind compat bridge. | Additive, then old path deprecated |
| `anthropic-adapter.ts` | Remove source type registry from prompt. Replace with five-primes composition instruction. | Replace HF-237 content |
| `ai-plan-interpreter.ts` | `convertComponent` parses LLM DAG output. Validates each node has recognized prime. Structured failure on unrecognized. Legacy format detection + bridge. | Modify |
| `convergence-service.ts` | Pass 5 derivation output becomes DAG fragment. Prompt change to emit DAG-format derivations. Legacy derivation bridge at read time. | Modify |
| `run-calculation.ts` / `route.ts` | `applyMetricDerivations` calls `evaluate()` on derivation DAGs. Remove separate `aggregateScopeRows` pre-computation — scope handled inside DAG walker. | Simplify |

The net code change is small — the DAG walker is ~50 lines, the prompt changes are a replacement not an addition, the compatibility bridges are mechanical translations. The deleted code (11 executor cases, 8 source-type cases, separate scope pre-computation) exceeds the added code.
