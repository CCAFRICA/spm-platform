# HF-238 R2 — DAG Engine Completion

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

HF-238 (PR #420) replaced the convenience-primitive executor with a prime-level DAG walker. AUD-011 (PR #421) verified the core architecture is genuine — the adapter constructs trees, the evaluator walks them, the prompt teaches composition.

Six violations remain. Each is a surface where the old architecture survives alongside the new. SR-34 prohibits merging with known structural bypasses. This R2 closes all six before PR #420 merges.

**This R2 is applied to the `hf-238-prime-dag-engine` branch (PR #420). Not a new branch. Commits append to the existing PR.**

---

## CLOSURE 1 — primitive-registry.ts: collapse, don't extend

**File:** `web/src/lib/calculation/primitive-registry.ts`

**Problem:** `FOUNDATIONAL_PRIMITIVES` has 13 entries — the original 12 convenience types + `prime_dag`. The old entries retain `promptStructuralExample` strings. The REGISTRY was extended, not replaced. If any prompt builder iterates REGISTRY entries and emits `promptStructuralExample` blocks, old convenience-type examples leak alongside the new prime composition prompt.

**Fix:**
1. Search the codebase for every consumer of `FOUNDATIONAL_PRIMITIVES`, `REGISTRY`, and `PrimitiveEntry.promptStructuralExample`. Run:
   ```bash
   grep -rn "FOUNDATIONAL_PRIMITIVES\|REGISTRY\|promptStructuralExample\|PrimitiveEntry" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v primitive-registry.ts
   ```
   Paste full output.

2. For every consumer found: determine if it reads old entries. If a prompt builder iterates REGISTRY and emits `promptStructuralExample` into prompts, the old examples must be removed.

3. Strip `promptStructuralExample` from every legacy entry in REGISTRY (bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate, linear_function, piecewise_linear). These examples teach named convenience patterns — they conflict with the prime-composition prompt.

4. Update `PrimitiveEntry.kind` description (line ~2004) — remove "handled by `executeOperation`" reference. Replace with accurate description of the current architecture.

5. Consider whether FOUNDATIONAL_PRIMITIVES should be reduced to the nine primes + legacy types marked `deprecated: true`, or whether the array should be split into `PRIME_TYPES` (the nine) and `LEGACY_TYPES` (the twelve, adapter-only). Either approach is acceptable as long as prompt builders cannot read old `promptStructuralExample` values.

**Verification gate:** `grep -rn "promptStructuralExample" web/src/ --include="*.ts"` — paste output. Old convenience-type entries must not carry this field. Only `prime_dag` (or the nine primes, if restructured) may carry prompt-facing examples.

---

## CLOSURE 2 — eliminate dual scope data supply

**File:** `web/src/lib/calculation/intent-executor.ts`

**Problem:** Two data paths supply scope values:
- Path A: `EntityData.scopeAggregates` → `buildEvalContext` → `metrics['scope_aggregate:...']` → `reference` prime reads it
- Path B: `EntityData.allEntityRows` → `evaluate` scope prime → filters siblings → aggregates

Both produce values. Which fires depends on caller population. Ambiguity.

**Fix:**
1. Remove `scopeAggregates` from the `EntityData` interface (line ~39).
2. Remove the `scopeAggregates` population block from `buildEvalContext` (lines ~305-310).
3. Search for any caller that populates `data.scopeAggregates`. Run:
   ```bash
   grep -rn "scopeAggregates" web/src/ --include="*.ts" --include="*.tsx"
   ```
   Paste full output.
4. If any caller populates `scopeAggregates`, redirect it to populate `allEntityRows` instead (or confirm it already does via `allEntityRowsForPeriod`).
5. The scope prime at evaluate() lines ~193-207 is the ONE path for scope values. No synthetic key fallback.

**Verification gate:** `grep -rn "scopeAggregates" web/src/ --include="*.ts"` returns zero hits outside comments.

---

## CLOSURE 3 — inline executeOperation, restructure call site

**File:** `web/src/lib/calculation/intent-executor.ts` + `web/src/lib/calculation/run-calculation.ts`

**Problem:** `executeOperation` wrapper (lines ~396-416) preserves the old function interface. `run-calculation.ts:343` calls it through an `isIntentOperation` gate. The old interface persists as a callable surface.

**Fix:**
1. Read `run-calculation.ts:320-370` (the call site and its surrounding context — already visible in AUD-011 Probe 4B). Understand the flow: this is a fallback path that fires when the primary `executeIntent` path doesn't produce a payout.

2. At the call site (`run-calculation.ts:~343`), replace `executeOperation(intentOp, entityData, inputLog, {})` with the three inline operations:
   ```typescript
   const dag = legacyIntentToDAG(intentOp);
   const context = buildEvalContext(entityData);
   const intentPayoutDecimal = evaluate(dag, context);
   ```
   Import `legacyIntentToDAG` from `legacy-intent-to-dag.ts` and `buildEvalContext` (which must be exported from `intent-executor.ts` if not already).

3. Delete the `executeOperation` function from `intent-executor.ts`.

4. Remove `executeOperation` from the import statement at `run-calculation.ts:22`.

**Verification gate:** `grep -rn "executeOperation" web/src/ --include="*.ts"` returns zero hits outside comments.

---

## CLOSURE 4 — remove isMarginal named-type dispatch

**File:** `web/src/lib/calculation/run-calculation.ts`

**Problem:** Lines ~1547-1558 check `intentOp.operation === 'bounded_lookup_1d'` and mutate `isMarginal` on the legacy intent before translation. This is named-type dispatch at a call site — the calculation pipeline examines operation names.

**Fix:**
1. Read the adapter's handling of `isMarginal` (Probe 1, lines 412-418). The adapter already expresses isMarginal as `arithmetic(multiply, constant(output), inputNode)` vs `constant(output)` based on `op.isMarginal`. The auto-detect at the call site sets `isMarginal = true` before the adapter runs.

2. Move the isMarginal auto-detection INTO the adapter. In `legacy-intent-to-dag.ts`, in the `bounded_lookup_1d` case (lines ~370-428), add the same heuristic: if `!op.isMarginal && Array.isArray(op.outputs)`, check if all non-zero outputs are < 1.0 and > 0, and set `isMarginal = true` before constructing the tree.

3. Delete the OB-120 block at `run-calculation.ts:~1547-1558`.

**Verification gate:** `grep -rn "isMarginal" web/src/lib/calculation/run-calculation.ts` returns zero hits. The heuristic lives in the adapter only.

---

## CLOSURE 5 — delta derivation through DAG

**File:** `web/src/lib/calculation/run-calculation.ts` + `web/src/lib/calculation/intent-types.ts` + `web/src/lib/calculation/intent-executor.ts`

**Problem:** Delta derivation (`operation === 'delta'`) retains a hybrid sum-and-subtract path at `applyMetricDerivations` lines ~1675-1699. This is a dual execution path — delta bypasses the DAG evaluator.

**Fix:**
1. Extend `EvalContext` with an optional `priorPeriodRows` field:
   ```typescript
   interface EvalContext {
     entity: { metadata: Record<string, unknown> };
     activeRows: Record<string, unknown>[];
     allEntityRows: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }>;
     metrics: Record<string, number>;
     priorPeriodRows?: Record<string, unknown>[];
   }
   ```

2. In `applyMetricDerivations`, populate `context.priorPeriodRows` from `priorPeriodData` parameter (flatten same as `allRows`).

3. Update `legacyDerivationToDAG` to handle delta: instead of throwing `UntranslatableLegacyIntentError`, produce a DAG:
   ```
   arithmetic(subtract,
     filter(predicates, aggregate(sum, field)),         // current period
     filter(predicates, aggregate(sum, field))           // prior period — uses priorPeriodRows
   )
   ```
   This requires the `aggregate` prime to know which row set to read. Two approaches:
   - **Option A:** Add a `source` field to aggregate: `{ prime: 'aggregate', op, field, source?: 'prior' }`. When `source === 'prior'`, evaluate reads `context.priorPeriodRows` instead of `context.activeRows`.
   - **Option B:** Add a `prior_rows` prime that switches activeRows to priorPeriodRows for its downstream, analogous to how `scope` switches to sibling rows.

   Option B is cleaner — it's the same pattern as `scope` (context modifier with downstream):
   ```typescript
   { prime: 'prior_period'; downstream: PrimeNode }
   ```
   Evaluate: `return evaluate(node.downstream, { ...context, activeRows: context.priorPeriodRows ?? [] })`

   Delta becomes:
   ```
   arithmetic(subtract,
     filter(predicates, aggregate(sum, field)),
     prior_period(filter(predicates, aggregate(sum, field)))
   )
   ```

   This adds a 10th node type to PrimeNode. Update `VALID_PRIMES` to include `prior_period`. Update evaluate() with the case.

4. Remove the delta hybrid block at `applyMetricDerivations` lines ~1675-1699.

**Verification gate:** `grep -rn "operation === 'delta'" web/src/lib/calculation/run-calculation.ts` returns zero hits. Delta flows through the DAG evaluator.

**Note:** If delta derivations are not in the Phase 0 production inventory (completion report confirms they are not), the `prior_period` prime and delta adapter path can be implemented defensively (tested with synthetic data) without immediate production validation risk. The adapter throws on untranslatable if `priorPeriodRows` is absent and delta is requested.

---

## CLOSURE 6 — convergence Pass 5 DAG-native emission (DESIGN GATE)

**Problem:** The observatory identified the convergence derivation schema as a GAP — flat records `{metric, operation, source_field, filters}` cannot express scope, composition, or any structure beyond single-field aggregation with filters. HF-238's runtime adapter (`legacyDerivationToDAG`) translates at read time, but the convergence pipeline itself is not DAG-native. LLM intelligence at the derivation layer is constrained to the flat schema.

**This closure requires a design decision before implementation.** Two options:

**Option A — Pass 5 emits DAG fragments natively.**
- The Pass 5 prompt teaches the same nine primes used by plan interpretation
- The LLM emits `{ metric: string, dag: PrimeNode }` instead of `{ metric, operation, source_field, filters }`
- Scope-qualified derivations include scope nodes
- `legacyDerivationToDAG` becomes the adapter for pre-HF-238 stored derivations only
- Requires persistence schema awareness — stored `input_bindings.metric_derivations` would carry DAG shapes

**Option B — Convergence emits DAG fragments, runtime translates old stored derivations.**
- Same as Option A for new convergence runs
- Old stored `metric_derivations` (flat format) translated by `legacyDerivationToDAG` at read time
- No migration of existing stored derivations
- Same pattern as plan intent: new imports produce DAGs, old stored intents translate through adapter

Option B is consistent with how HF-238 handles plan intents. The design gate is: does the persistence schema need to change, or can `metric_derivations` carry either format with runtime detection?

**This closure is NOT implemented in R2.** It is scoped and specified. Implementation requires architect disposition on the design gate. Flag it as the next HF after R2 merges. The convergence stage remains GAP until this ships.

---

## PHASE ORDER

1. Closure 1 (primitive-registry cleanup) — removes prompt contamination risk
2. Closure 2 (scope data supply) — eliminates dual path
3. Closure 3 (inline executeOperation) — deletes old interface
4. Closure 4 (isMarginal into adapter) — removes named-type dispatch
5. Closure 5 (delta through DAG) — closes last hybrid execution path
6. Closure 6 — DESIGN GATE ONLY, no implementation in this R2

After all closures, the PR #420 state is:
- ONE evaluator (evaluate), zero wrappers, zero named-type dispatch outside adapter
- ONE data supply for scope (allEntityRows → scope prime)
- Primitive registry cleaned of old promptStructuralExamples
- All derivation types through DAG (including delta via prior_period prime)
- Convergence DAG-native emission scoped for next HF

---

## COMPLETION REPORT

Append to existing `docs/completion-reports/HF-238_COMPLETION_REPORT.md` as "## R2 — Closures" section.

Must include:

1. **Per-closure grep evidence.** Each closure has a verification gate. Paste results.

2. **Updated evaluate() function** if modified (Closure 5 adds prior_period case).

3. **Updated PrimeNode type** if modified (Closure 5 adds prior_period).

4. **Primitive registry state.** Paste FOUNDATIONAL_PRIMITIVES and REGISTRY after Closure 1.

5. **Build verification.** `npm run build` clean. `localhost:3000` responding.

Do NOT create a separate PR. Commit to the existing `hf-238-prime-dag-engine` branch. PR #420 accumulates the R2 commits.

---

## ANTI-PATTERN CHECKLIST

```
Before completing, verify:
□ Closure 1: promptStructuralExample stripped from all legacy entries?
□ Closure 2: scopeAggregates zero hits outside comments?
□ Closure 3: executeOperation zero hits outside comments?
□ Closure 4: isMarginal zero hits in run-calculation.ts?
□ Closure 5: delta hybrid block removed from applyMetricDerivations?
□ Closure 5: prior_period prime added to PrimeNode, VALID_PRIMES, evaluate()?
□ AP-17: ONE code path — evaluate() only?
□ AP-5/AP-6: No hardcoded field names added?
□ Domain-agnostic: zero tenant names?
□ Build clean?
□ SR-34: No known bypasses remaining?
```
