# AUD-011 — HF-238 Architectural Integrity Audit

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PURPOSE

HF-238 claims to replace the convenience-primitive calculation architecture with a prime-level recursive DAG walker. This audit verifies whether the change is genuine or facade — whether computation logic moved from the old executor into the adapter, or was genuinely replaced by prime composition evaluated by a single recursive walker.

**This is a read-only audit. Zero code changes. Zero file modifications.**

The audit answers one question: **does `evaluate()` perform the computation, or does `legacyIntentToDAG()` pre-compute values and wrap them in `constant()` nodes so the evaluator is unwrapping pre-computed results?**

---

## GOVERNING CONSTRAINT

Paste verbatim code. Do not summarize. Do not paraphrase. Do not describe what a function does — paste it. Every probe below specifies exactly what to paste.

Self-attestation is not evidence. "The function delegates to evaluate()" is not evidence. The pasted function body is evidence.

---

## PROBE 1 — THE ADAPTER

**File:** `web/src/lib/calculation/legacy-intent-to-dag.ts`

**Paste the entire file.** All 724 lines.

The audit question: does this file CONSTRUCT `PrimeNode` trees (format adapter), or does it COMPUTE values (displaced executor)?

Signs of facade:
- Calls to math operations (multiplication, division, aggregation) that produce numeric results wrapped in `constant()` nodes
- Reading entity data or row data and computing intermediate values
- Any function that takes data rows as input and returns a number
- `toDecimal()`, `.mul()`, `.div()`, `.plus()` calls that compute values rather than constructing nodes

Signs of genuine adapter:
- Functions that take old-format intent shapes and return `PrimeNode` objects
- No access to entity data, row data, or metric values
- No numeric computation — only tree construction
- Output is always a `PrimeNode`, never a number

---

## PROBE 2 — THE EVALUATOR

**File:** `web/src/lib/calculation/intent-executor.ts`

**Paste the entire file.** All 386 lines.

The audit question: is `evaluate()` the ONLY function that dispatches on operation type?

Signs of facade:
- Multiple functions that switch/dispatch on type discriminators
- Helper functions that reproduce old execution patterns under new names
- `buildEvalContext` doing computation (aggregation, filtering, metric resolution) rather than assembling a struct
- Any function besides `evaluate()` that takes data and produces a calculated number

Signs of genuine replacement:
- `evaluate()` is the sole recursive walker
- `buildEvalContext` assembles `{entity, activeRows, allEntityRows, metrics}` from inputs without computation
- No dispatch tables outside `evaluate()`
- `executeOperation` wrapper is literally 3 lines: translate → build context → evaluate

---

## PROBE 3 — THE PROMPT

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`

**Paste lines 580-720** (the plan interpretation prompt section that was rewritten in Phase 2).

The audit question: does the prompt teach COMPOSITION ("nest these building blocks however the plan requires"), or does it teach SELECTION ("choose the pattern that matches")?

Signs of facade:
- Named examples that map 1:1 to old convenience types (Example A = scalar_multiply, Example B = linear_function, Example C = conditional_gate)
- Fixed response schemas constraining the LLM to specific tree shapes
- Enumerated boundary values for scope
- "WHEN TO USE" blocks telling the LLM which pattern to pick

Signs of genuine replacement:
- Building blocks described generically
- Examples show nesting/composition, not named patterns
- No enumerated source types, boundary values, or operation types
- LLM composes freely from primes

---

## PROBE 4 — THE CALL SITES

### 4A — executeOperation wrapper

**File:** `web/src/lib/calculation/intent-executor.ts`

**Paste the `executeOperation` function** (lines ~392-416 per completion report).

**Also paste every call site.** Run:

```bash
grep -rn "executeOperation" web/src/lib/ web/src/app/ --include="*.ts" --include="*.tsx"
```

Paste full grep output.

### 4B — isIntentOperation gate

**File:** `web/src/lib/calculation/run-calculation.ts`

**Paste lines 320-370** (the `isIntentOperation` gate, the executeOperation call, and its surrounding context).

The audit question: is this a last-resort error-recovery fallback, or is it the primary execution path for every stored intent?

### 4C — evaluate() call sites

Run:

```bash
grep -rn "evaluate(" web/src/lib/calculation/ web/src/app/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".test."
```

Paste full grep output. The audit wants to know: how many call sites invoke `evaluate()` directly vs going through `executeOperation`?

---

## PROBE 5 — THE DERIVATION PATH

### 5A — applyMetricDerivations

**File:** `web/src/lib/calculation/run-calculation.ts`

**Paste the `applyMetricDerivations` function in full** — from function signature to closing brace.

The audit question: does this function route ALL derivation types through `legacyDerivationToDAG` → `evaluate()`, or does it retain operation-specific branches?

Signs of facade:
- `switch` or `if/else` on `derivation.operation` with per-type logic
- Direct aggregation/filtering code alongside the DAG call
- "delta retains hybrid path" meaning delta derivations bypass the DAG entirely

Signs of genuine:
- Every derivation type → `legacyDerivationToDAG()` → `evaluate()`
- No per-type branches
- Delta included (with `EvalContext` extended) or explicitly isolated with a structured TODO

### 5B — legacyDerivationToDAG

**File:** `web/src/lib/calculation/legacy-intent-to-dag.ts`

If not already visible in Probe 1's full paste, locate and confirm the `legacyDerivationToDAG` function. Verify it constructs a `PrimeNode` tree (filter chain + aggregate node), not a pre-computed value.

---

## PROBE 6 — THE SCOPE PATH

### 6A — Scope pre-computation deletion

Run:

```bash
grep -rn "aggregateScopeRows\|entityScopeAgg\|scopeAggregates\|scopePreCompute" web/src/ --include="*.ts" --include="*.tsx"
```

Paste full output. Zero hits expected outside comments.

### 6B — allEntityRowsForPeriod construction

**File:** `web/src/app/api/calculation/run/route.ts`

**Paste the section where `allEntityRowsForPeriod` is built** (should be before the entity loop). Include 20 lines of context above and below.

The audit question: is `allEntityRows` populated correctly so the scope prime's `context.allEntityRows` has data to filter?

---

## PROBE 7 — THE TYPE SYSTEM

**File:** `web/src/lib/calculation/intent-types.ts`

**Paste the `PrimeNode` type definition, `EvalContext` interface, and `VALID_PRIMES` set.**

Also paste any OLD named types that remain in the file (`LinearFunctionOp`, `PiecewiseLinearOp`, etc.) — they should be marked as legacy format adapter types.

Run:

```bash
grep -rn "LinearFunctionOp\|PiecewiseLinearOp\|ConditionalGateOp\|ScalarMultiplyOp" web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "legacy-intent-to-dag"
```

Paste full output. These types should appear ONLY in `intent-types.ts` (definition) and `legacy-intent-to-dag.ts` (consumption by format adapter). Zero hits in the evaluator, the prompt, or any other file.

---

## PROBE 8 — PRIMITIVE REGISTRY

**File:** `web/src/lib/calculation/primitive-registry.ts`

Phase 2 of HF-238 added `prime_dag` to `FOUNDATIONAL_PRIMITIVES` and `REGISTRY`.

**Paste the full `FOUNDATIONAL_PRIMITIVES` array and `REGISTRY` object.**

The audit question: did HF-238 ADD an entry to the existing convenience-type registry instead of replacing it? If `REGISTRY` still contains `linear_function`, `piecewise_linear`, `conditional_gate`, `scalar_multiply` AND now also `prime_dag`, the registry grew — it didn't shrink.

---

## COMPLETION

Save this audit report to `docs/audits/AUD-011_HF238_ARCHITECTURAL_INTEGRITY.md` and commit.

The report is the pasted code from Probes 1-8. No interpretation. No assessment. No recommendations. Paste the code. The architect reads it.

Branch: `aud-011-hf238-integrity` off `main`.

`gh pr create --base main --head aud-011-hf238-integrity` with title: "AUD-011: HF-238 architectural integrity audit — read-only code extraction"

PR body: "Read-only audit. Eight probes extracting verbatim code from the HF-238 implementation. Zero code changes. Architect review determines genuine vs facade."
