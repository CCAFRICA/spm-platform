# HF-238 — Prime-Level DAG Calculation Engine

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

The calculation engine dispatches through an 11-case convenience-type registry (`linear_function`, `piecewise_linear`, `conditional_gate`, `scalar_multiply`, etc.) and an 8-case source-type switch. The plan interpretation prompt enumerates source types for the LLM to choose from. This architecture has two structural failures:

1. **Every novel plan structure requires new engine code.** A plan that doesn't match an existing named type cannot be calculated. The registry grows by one each time. This is the registry/cherry-pick defect class — the dominant defect class across the platform, closed at four surfaces (HF-223, HF-224, HF-224 patch, HF-236) and re-encountered at the prompt layer.

2. **LLM comprehension is truncated to the registry.** The prompt says "pick from this list." Whatever the LLM actually comprehends about the plan structure is forced through named buckets. If the plan describes a computation that doesn't match a listed type, the LLM must distort its comprehension or fail. Transformer passthrough (HF-223) established that LLM emissions should flow faithfully — the prompt registry violates this at the source.

**This HF replaces the convenience-primitive architecture with a prime-level recursive DAG walker.** Every compensation calculation decomposes into compositions of irreducible operations. The LLM describes what the plan says as a DAG of primes. The engine evaluates the DAG. No registry. No dispatch table. No silent discard of LLM comprehension.

---

## ARCHITECTURE DECISION RECORD

```
ARCHITECTURE DECISION RECORD
============================
Problem: Engine dispatches through enumerated convenience types.
         LLM forced to pick from a source-type list.
         Novel plan structures require new engine code + new prompt entries.

Option A: Extend the registry (add types as new plan structures appear)
  - Scale test: FAILS — every new plan pattern = new engine code
  - AI-first: FAILS — LLM comprehension truncated to registry
  - Korean Test: FAILS — silent discard of unrecognized types
  - This is the pattern that has been closed four times and re-emerged.
  REJECTED.

Option B: Prime-level DAG engine
  - Scale test: PASSES — any composition of primes, no new code
  - AI-first: PASSES — LLM emits DAG of primes, full comprehension preserved
  - Korean Test: PASSES — structured failure on unrecognized prime, emission preserved
  - AP-17: PASSES — ONE evaluator. Old executor DELETED, not retained.
  - Domain-agnostic: PASSES — primes are mathematical operations, not plan-type names

CHOSEN: Option B — expressiveness comes from composition, not registry extension.
REJECTED: Option A — registry extension is the dominant defect class.
```

---

## GOVERNING CONSTRAINTS

1. **ONE evaluator.** The old `executeOperation` dispatch and `resolveSource` switch are DELETED. Not retained. Not behind a flag. Deleted. The single `evaluate()` DAG walker is the only execution path.

2. **Format adapters are NOT execution paths.** Existing stored intents carry the old format. A read-time translation function `legacyIntentToDAG()` converts old storage shapes into `PrimeNode` trees BEFORE they reach the evaluator. Same for derivations: `legacyDerivationToDAG()`. These produce `PrimeNode` trees; the ONE evaluator runs. If you find yourself writing `if (oldFormat) { executeOperation(...) } else { evaluate(...) }` — STOP. That is a dual code path. AP-17 violation.

3. **LLM intelligence flows through.** The prompt does NOT list source types for the LLM to choose from. The prompt describes building blocks and says "compose them however the plan requires." The LLM emits a DAG that mirrors its actual comprehension. The engine evaluates exactly what the LLM emitted.

4. **Structured failure, never silent discard.** If the LLM emits a prime the engine doesn't recognize, `convertComponent` throws with the LLM's original emission preserved. Korean Test v2 compliance.

5. **Domain-agnostic.** The primes are mathematical operations. No tenant names, no plan names, no product category names anywhere in the engine, the prompt, or this directive. The engine evaluates DAGs. What those DAGs represent is the LLM's comprehension of whatever plan it read.

6. **Reconciliation-channel separation.** After calculating, report calculated values per plan per period per tenant. Do not interpret whether they match expectations. Report the numbers.

7. **Legacy adapter coverage gate.** Before deleting old executor code, verify the format adapter covers every stored intent shape and every modifier shape in production across all active tenants. Read every distinct `calculationIntent` shape and every distinct modifier shape from the database. Every shape must have a translation rule. Structured failure on untranslatable shapes — not silent omission.

---

## THE PRIMES

Every compensation calculation decomposes into compositions of these irreducible operations:

| Prime | What it does | Signature |
|---|---|---|
| **arithmetic** | Scalar math on two values | `{ prime: 'arithmetic', op: 'add'\|'subtract'\|'multiply'\|'divide', inputs: [PrimeNode, PrimeNode] }` |
| **aggregate** | Reduce data rows to one value | `{ prime: 'aggregate', op: 'sum'\|'count'\|'avg'\|'min'\|'max', field: string }` |
| **filter** | Select which rows participate | `{ prime: 'filter', predicate: { field: string, operator: string, value: any }, downstream: PrimeNode }` |
| **conditional** | If/then/else branching | `{ prime: 'conditional', condition: PrimeNode, then: PrimeNode, else: PrimeNode }` |
| **scope** | Change whose data | `{ prime: 'scope', boundary: string, downstream: PrimeNode }` |
| **compare** | Relational comparison, returns 1 or 0 | `{ prime: 'compare', op: 'gt'\|'gte'\|'lt'\|'lte'\|'eq'\|'neq', inputs: [PrimeNode, PrimeNode] }` |
| **logical** | Boolean combination of comparisons | `{ prime: 'logical', op: 'and'\|'or'\|'not', inputs: PrimeNode[] }` |

Plus two leaf node types:

| Leaf | What it does | Signature |
|---|---|---|
| **constant** | Fixed number | `{ prime: 'constant', value: number }` |
| **reference** | Read from entity data or resolved metrics | `{ prime: 'reference', field: string }` |

**Why these nine.** Arithmetic, aggregation, filter, scope, and conditional are the five operations that produce or transform values. Compare and logical are the relational and boolean operations that make conditional's branching evaluable — without them, conditions like "attainment ≥ threshold" or compound boolean gates cannot be expressed. These seven + two leaves are irreducible: none can be expressed as a composition of the others, and any compensation calculation composes from them.

**Modifiers.** Cap, floor, proration, minimum, temporal_adjustment, and any future modifier compose from existing primes:
- **Cap:** `conditional(compare(gt, value, cap_limit), constant(cap_limit), value)`
- **Floor:** `conditional(compare(lt, value, floor_limit), constant(floor_limit), value)`
- **Proration:** `arithmetic(multiply, value, arithmetic(divide, reference(actual_days), reference(total_days)))`
- **Minimum guarantee:** `conditional(compare(lt, calculated, minimum), constant(minimum), calculated)`

Modifiers do NOT need their own prime type. They are compositions. The legacy adapter must translate stored modifier shapes into these compositions.

**Tiered/piecewise structures.** Nested conditionals with compare nodes:
```
conditional(
  compare(gte, attainment, constant(threshold_high)),
  <top tier payout>,
  conditional(
    compare(gte, attainment, constant(threshold_mid)),
    <mid tier payout>,
    <base tier payout>
  )
)
```
No special piecewise type. Tiers compose from conditional + compare + arithmetic.

**Bounded lookups.** Nested conditionals on one dimension (1D) or two dimensions (2D, nested along both axes). Same composition pattern. No special lookup type.

**Node topology:** `filter` and `scope` carry `downstream: PrimeNode` — they modify context for the sub-tree below them. `aggregate` operates on whatever `activeRows` are in context (narrowed by upstream filter/scope). `arithmetic`, `compare`, and `logical` operate on values via `inputs`. `conditional` evaluates `condition`, then evaluates `then` or `else`. `constant` and `reference` are leaves.

---

## PHASE 0 — LEGACY SHAPE INVENTORY (MANDATORY BEFORE ANY CODE CHANGES)

Before writing any new code or deleting any old code, read every active tenant's stored intents and derivations from the database to enumerate every shape in production.

### 0.1 Enumerate stored intent shapes

Write a script (`scripts/audit-intent-shapes.ts`) that:
1. Reads all `rule_sets` with non-null `input_bindings` from every active tenant
2. For each plan component's `calculationIntent`, extracts: `operation` type, source types used, modifier types used, any nested operation structures
3. Produces a deduplicated inventory: "These are the N distinct operation types, M distinct source types, and K distinct modifier shapes that exist in production"

Paste the full inventory into the completion report.

### 0.2 Enumerate stored derivation shapes

Same script reads all `metric_derivations` from `input_bindings` across all tenants. Extracts: operation types, filter shapes, source patterns.

Paste the full inventory into the completion report.

### 0.3 Coverage verification

For every shape in the inventory, confirm the format adapter (`legacyIntentToDAG`, `legacyDerivationToDAG`) has a translation rule. If any shape has no translation rule, HALT and report to architect. Do not proceed to Phase 1 until coverage is 100%.

---

## PHASE 1 — TYPE DEFINITION AND DAG WALKER

### 1.1 Define PrimeNode type

File: `web/src/lib/calculation/intent-types.ts`

Add the `PrimeNode` union type — 9 node types as specified above. Add `EvalContext` interface:

```typescript
interface EvalContext {
  entity: { metadata: Record<string, unknown> };
  activeRows: Record<string, unknown>[];
  allEntityRows: { entityMetadata: Record<string, unknown>; [key: string]: unknown }[];
  metrics: Record<string, number>;
}
```

Retain old named types (`LinearFunctionOp`, etc.) in the file marked with comment: `// Legacy format — read by legacyIntentToDAG() format adapter only. Not used by evaluate().` These are consumed by the format adapter, not by the evaluator.

### 1.2 Implement DAG walker

File: `web/src/lib/calculation/intent-executor.ts`

Add `evaluate(node: PrimeNode, context: EvalContext): number` — recursive DAG walker. Nine cases:

- `constant`: return `node.value`
- `reference`: return `context.metrics[node.field] ?? 0`
- `arithmetic`: evaluate both inputs, apply op. Division by zero → 0.
- `aggregate`: reduce `context.activeRows` by op and field. `avg` = sum / count. Handle empty rows (return 0).
- `filter`: filter `context.activeRows` by predicate, call `evaluate(node.downstream, { ...context, activeRows: filtered })`
- `scope`: read `node.boundary` from `context.entity.metadata`, filter `context.allEntityRows` to matching boundary value, call `evaluate(node.downstream, { ...context, activeRows: siblingRows })`
- `conditional`: evaluate `condition` node. If result > 0 (truthy), evaluate `then`. Else evaluate `else`.
- `compare`: evaluate both inputs, apply relational op, return 1 (true) or 0 (false).
- `logical`: evaluate inputs. `and` = all > 0. `or` = any > 0. `not` = input == 0 ? 1 : 0. Return 1 or 0.

The existing predicate evaluation helper (`evaluatePredicate` / `rowMatchesFilters`) can be reused by the filter prime — read the existing code and determine if it's compatible.

### 1.3 Delete old executor

**After Phase 0 coverage is verified and Phase 1.1/1.2 are implemented:** DELETE `executeOperation` 11-case dispatch. DELETE `resolveSource` 8-case switch. DELETE `executePiecewiseLinear`, `executeLinearFunction`, `executeConditionalGate`, `executeScalarMultiply`, and all other named convenience executors. DELETE `resolveValue`.

**Verification gate:** `grep -rn "executeOperation\|resolveSource\|executePiecewiseLinear\|executeLinearFunction\|executeConditionalGate\|executeScalarMultiply" web/src/` returns zero hits outside comments. Paste results.

---

## PHASE 2 — PROMPT AND PLAN INTERPRETER

### 2.1 Replace prompt source-type registry

File: `web/src/lib/ai/providers/anthropic-adapter.ts`

Remove from the plan interpretation prompt:
- Any enumerated `calculationMethod.type` values
- Any enumerated `source` type values
- Any "WHEN TO USE" disambiguation block
- Any instruction telling the LLM to "choose" from a list
- Any enumerated scope/boundary values

Replace with composition instruction:

```
When interpreting a plan component's calculation method, describe HOW the commission is computed using these building blocks. Compose them as needed — any combination is valid:

- filter: select which data rows participate. {prime: 'filter', predicate: {field, operator, value}, downstream: <next node>}
- aggregate: reduce filtered rows to a number. Operations: sum, count, avg, min, max. {prime: 'aggregate', op, field}
- arithmetic: math on values. Operations: add, subtract, multiply, divide. {prime: 'arithmetic', op, inputs: [<node>, <node>]}
- compare: relational comparison, produces true (1) or false (0). Operations: gt, gte, lt, lte, eq, neq. {prime: 'compare', op, inputs: [<node>, <node>]}
- logical: combine comparisons. Operations: and, or, not. {prime: 'logical', op, inputs: [<node>, ...]}
- conditional: if/then/else. {prime: 'conditional', condition: <node>, then: <node>, else: <node>}
- scope: change whose data is used. Default is the individual entity's data. Use scope when the plan references group-level data (district total, region revenue, team aggregate). {prime: 'scope', boundary: '<entity metadata field>', downstream: <next node>}

Leaf values:
- constant: a fixed number. {prime: 'constant', value: <number>}
- reference: read a value from entity data or a previously resolved metric. {prime: 'reference', field: '<name>'}

Modifiers (caps, floors, minimums, proration) are expressed as conditional + compare compositions around the base calculation. A cap is: conditional(compare(gt, <base>, constant(<limit>)), constant(<limit>), <base>).

Nest these to describe the full calculation from raw data to final payout amount. The result should be a single tree of nodes.
```

### 2.2 Update convertComponent

File: `web/src/lib/ai/ai-plan-interpreter.ts`

`convertComponent` must:

1. **Detect format.** `prime` field present → new DAG, parse as `PrimeNode` tree. `operation` or `calculationMethod.type` field present → legacy format, translate via `legacyIntentToDAG()`.

2. **Validate new-format DAGs.** Walk tree. Every node must have a recognized `prime` from `VALID_PRIMES`. Unrecognized → structured error with LLM emission preserved:

```typescript
const VALID_PRIMES = new Set([
  'arithmetic', 'aggregate', 'filter', 'conditional', 'scope',
  'compare', 'logical', 'constant', 'reference'
]);
```

3. **Implement `legacyIntentToDAG()`.** Format adapter translating old shapes to `PrimeNode` trees. Coverage MUST match the Phase 0 inventory — every shape in the inventory gets a translation rule. This includes modifier translation (cap → conditional+compare, floor → conditional+compare, etc.).

Read the existing `convertComponent` code at HEAD to identify every operation type, source type, and modifier type currently handled. Cross-reference against the Phase 0 inventory.

### 2.3 Implement `legacyDerivationToDAG()`

Format adapter for stored derivations (flat records → DAG fragments):
- Build aggregate node from `operation` + `source_field`
- Wrap in filter chain from `filters` array if present
- No execution logic — just shape translation

---

## PHASE 3 — DERIVATION AND SCOPE INTEGRATION

### 3.1 Update convergence derivation output

File: `web/src/lib/intelligence/convergence-service.ts`

Update Pass 5 (`generateAISemanticDerivations`) prompt to produce DAG-format derivation rules:

```typescript
{ metric: string, dag: PrimeNode }
```

The DAG fragment is the sub-tree producing the metric value. Scope-qualified derivations include a scope node wrapping the aggregate. Same metric name, different scope — expressed structurally in the DAG, not as a field on a flat record.

### 3.2 Wire `applyMetricDerivations` to DAG evaluator

File: wherever `applyMetricDerivations` lives (read code at HEAD to confirm location).

For each derivation: if `dag` field exists → `evaluate(derivation.dag, context)`. If `operation` field exists → `evaluate(legacyDerivationToDAG(derivation), context)`. Store result in `context.metrics[derivation.metric]`.

Both paths produce a `PrimeNode` and feed the single `evaluate()`. Format detection at storage boundary, not execution boundary.

### 3.3 Delete scope pre-computation

File: `web/src/app/api/plans/[planId]/calculate/route.ts`

Delete the separate scope aggregation pre-computation (around lines 2345-2397). Scope evaluation is inside the DAG walker — the `scope` prime reads entity metadata, filters `allEntityRows`, passes to downstream sub-tree.

**Verification gate:** `grep -rn "aggregateScopeRows\|scopePreCompute" web/src/` returns zero hits outside comments.

---

## PHASE 4 — CALCULATE AND REPORT

### 4.1 Calculate all active tenants

Trigger calculation for every active tenant across all periods. This is not tenant-specific — run every tenant.

Report per-tenant, per-plan, per-period commission totals. Report grand totals per tenant.

Do NOT interpret the results. Report the numbers.

### 4.2 Confirm legacy adapter fired

For tenants whose plans have NOT been re-imported through the new prompt (which is all of them at this point — re-import is an architect-manual browser action), confirm the legacy format adapter translated their stored intents successfully. Report any structured errors from untranslatable shapes.

---

## PHASE 5 — COMPLETION REPORT

Save to `docs/completion-reports/HF-238_COMPLETION_REPORT.md` and commit.

Must include:

1. **Phase 0 inventory.** Full list of distinct operation types, source types, modifier shapes, and derivation shapes found in production.

2. **Legacy adapter coverage map.** Each production shape → its translation rule → the resulting PrimeNode structure.

3. **Code evidence — deletions.** `grep` results confirming zero hits for: `executeOperation`, `resolveSource`, `executePiecewiseLinear`, `executeLinearFunction`, `executeConditionalGate`, `executeScalarMultiply`, `aggregateScopeRows`, outside comments.

4. **Code evidence — additions.** Paste the `evaluate()` function as implemented. Paste the `PrimeNode` type definition.

5. **Calculation results.** Per-tenant, per-plan, per-period totals. Grand totals per tenant.

6. **Build verification.** `npm run build` clean. `localhost:3000` responding. Browser console clean.

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must complete with zero errors
4. `npm run dev` — confirm `localhost:3000` responds
5. Git commands from repo root (`spm-platform`), NOT from `web/`
6. Branch: `hf-238-prime-dag-engine` off `main`
7. `gh pr create --base main --head hf-238-prime-dag-engine` with title: "HF-238: Prime-level DAG calculation engine — replace convenience-type registry with recursive DAG walker"
8. PR body: "Replaces 11-case executeOperation dispatch + 8-case resolveSource switch with recursive DAG walker over 7 primes (arithmetic, aggregate, filter, conditional, scope, compare, logical) + 2 leaves (constant, reference). Removes source-type registry from plan interpretation prompt. Format adapters for legacy stored intents at read boundary. Single execution path. Modifiers compose from conditional+compare. Tiered structures compose from nested conditional+compare+arithmetic."

---

## ANTI-PATTERN CHECKLIST

```
Before submitting completion report, verify:
□ Phase 0 inventory complete — every production shape catalogued?
□ Legacy adapter coverage 100% — every shape has a translation rule?
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
  □ AP-5/AP-6: No hardcoded field names or language-specific patterns?
  □ AP-17: ONE code path — evaluate() only. No executeOperation retained.
  □ AP-13: Schema columns verified by reading code, not assumed?
□ Scale test: works for 10x current volume?
□ AI-first: LLM composes freely, no source-type list to pick from?
□ Domain-agnostic: zero tenant names, zero plan names, zero product category names in engine or prompt?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
□ Structured failure on unrecognized primes — LLM emission preserved in error?
```
