# OB-223: End-to-End Pipeline Pattern Resolution (Redraft)

**Sequence:** OB-223 — architect-assigned 2026-06-19. Branch `ob-223-pipeline-pattern-resolution` exists (diagnostic committed). Continue on this branch.
**Repo:** `CCAFRICA/spm-platform`
**Type:** BUILD (pipeline wiring + interpreter prompt + calc-time grounding, one PR)
**Effort:** ULTRATHINK / ULTRACODE
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

**Prerequisites (merged to `main`):** OB-220 (#552), OB-222 (#554).
**CC instance:** SAME as diagnostic (has context). If FRESH, read `docs/diagnostics/OB-223_PIPELINE_DIAGNOSTIC.md` first — it maps every real file location.

---

## §0 — CC STANDING RULES HEADER

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Commit + push after every phase. Kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root. Final: `gh pr create`. **DO NOT merge** (SR-44).

### §0.1 Phase 1 is DONE

The diagnostic (`docs/diagnostics/OB-223_PIPELINE_DIAGNOSTIC.md`) walked all 5 patterns × 6 stages. It is committed on this branch. Do NOT re-run. Use its findings directly.

### §0.2 The first draft was wrong — these are the REAL fix sites

The diagnostic proved the first draft pointed at wrong files. Corrected map:

| First draft said | Reality (from diagnostic) |
|---|---|
| `intent-transformer.ts` (Stage 2 conversion) | LEGACY-ONLY — all MIR components are `prime_dag`, which bypasses it. The `calculationIntent` in `rule_sets.components` IS the live DAG. |
| `convergence-service.ts` (Stage 3 binding) | 3402 lines, zero abstain/count/temporal/role/filter logic. The binding proposal + validation lives in `anthropic-adapter.ts`. |
| Composition via separate function | `route.ts:2831` — `.plus()` in the entity loop. SUM only. |
| Interpreter prompt in `plan-component.ts` | Prompt grammar in `prime-grammar.ts` (`generatePromptGrammarSection()`). The conflicting "use variants" instruction is here. |
| `scope` is a conversion gap | `scope` is what the interpreter INVENTED because the prompt forbids per-row categorical structure. The evaluator in `intent-executor.ts` passes it through as unknown → full aggregate, no filtering. |

### §0.3 Governing constraints

**No developer vocabulary registry.** Category value grounding (plan says "ALI", data has "Alimentos") is convergence's job at calc time — same class as column binding.

**No file-sequence dependency.** Grounding runs at calc time. Data is always present.

**No SQL plan corrections.** The platform re-interprets on re-import.

**Korean Test.** No hardcoded category values or domain vocabulary in engine code.

---

## §1 — PHASE 2: COMPREHENSIVE FIX (Five Patterns, One Pass)

All five patterns are fixed in this phase. Every fix is conditional on the new node type, binding key, or modifier — existing behavior (BCL, Meridian) is byte-identical. Commit after each sub-section.

### §1.1 Fix the interpreter prompt (addresses P1, P4-accelerator, P5)

**File:** `prime-grammar.ts` — `generatePromptGrammarSection()`

**Read first.** Paste the FULL current prompt text that the function returns. Identify:

1. The instruction that says "use variants" for entity differentiation (the CONFLICT with OB-222's filter→aggregate guidance). Paste the exact text.
2. The OB-222 ENGINE AGGREGATION MODEL section and SC-07/08/09 illustrations. Paste to confirm they're present.
3. Any other instruction that discourages per-row filtering or encourages aggregate-level conditionals.

**Then fix three things in the prompt:**

**Fix 1 — Remove the conflicting variant instruction.** The "use variants for differentiation" instruction tells the interpreter that categorical differences are ENTITY-LEVEL (one variant per category). This is wrong — a single entity can have transactions across multiple categories. Remove or narrow this instruction to apply ONLY to entity-type differentiation (Vendedor vs Supervisor), NOT to per-transaction attribute differentiation.

The replacement should explicitly state: "Variants are for entity-type differentiation (different roles with different plans). Per-row attribute differentiation (different rates for different product categories within the same entity's transactions) uses filter→aggregate, NOT variants."

**Fix 2 — Accelerator folding.** Add to the prompt: "When a plan has an accelerator or multiplier condition (e.g., 'if total sales > threshold, multiply commission by X'), express it as a conditional wrapper INSIDE the base component's DAG:

```
conditional(
  compare(aggregate(sum, measure_field), threshold, gte),
  multiply(base_computation, multiplier),
  base_computation
)
```

Do NOT produce a separate component for the multiplier. A multiplier that outputs a scalar (e.g., 1.0 or 1.25) added to a dollar commission produces a wrong result — the engine sums components."

**Fix 3 — Strengthen clawback modifier.** Verify SC-09 is present. If the interpreter still didn't emit `temporal_adjustment` despite SC-09, the instruction may need to be a STRUCTURAL CONSTRAINT rather than an illustration: "Components that reverse, adjust, or claw back a prior period's calculated result MUST include `modifier: 'temporal_adjustment'` in the component metadata. The prime DAG MUST be `constant(0)` as the base case. DO NOT reference prior calculation outputs as data fields."

Commit: `"OB-223 §1.1: interpreter prompt — variant/filter disambiguation, accelerator folding, clawback modifier"`

### §1.2 scope→filter bridge in the DAG evaluator (P1 safety net)

**File:** `intent-executor.ts` — `evaluate()` function

The interpreter may still produce `scope` nodes on future imports (LLM output is non-deterministic). The evaluator needs a bridge so existing `scope` DAGs and any future ones are handled correctly.

**Read first.** Find the point where unknown primes are handled. Currently `scope` falls through — the boundary is ignored, the downstream aggregate receives all rows unfiltered.

**Add a handler for `scope` nodes:**

When the evaluator encounters `{ prime: "scope", boundary: "<field>", downstream: { prime: "aggregate", op: "<op>", field: "<measure>" } }`:

1. Read the `boundary` field name (e.g., `Categoria`).
2. This is structurally equivalent to a filtered aggregate, but the FILTER VALUE is not in the node — the node says "partition by this field" without specifying which partition.
3. The evaluator needs the per-partition values from the entity's raw rows. Use `activeRows` (the entity's rows, already in scope from OB-222):
   - Get distinct values of `boundary` field from the entity's rows.
   - For each distinct value, filter rows where `row_data[boundary] === value`, aggregate `measure` with `op`.
   - Return the aggregated value for THIS branch.

But there's a structural problem: all four branches have identical `scope` nodes (same boundary, same downstream). The evaluator doesn't know WHICH partition value goes with WHICH rate. The mapping lives in `metadata.compositional_intent.metadata.categoryRates` — not in the DAG itself.

**Two approaches (CC picks based on code structure):**

**Approach A — Rate mapping from metadata.** The evaluator receives the component metadata (or it's in scope). Read `categoryRates` from metadata. For each branch in the `add(multiply(scope, rate), ...)` tree, pair the scope→aggregate with its sibling constant (the rate). Use the rate to look up the matching category from `categoryRates`. This is fragile — it depends on the metadata structure.

**Approach B — Positional mapping.** The `add` tree has N children, each `multiply(scope, constant)`. The `categoryRates` object has N entries. Map by position: first child → first category, second → second, etc. Also fragile — depends on ordering.

**Approach C — Calc-time grounding (cleanest).** At calc-time convergence, when the DAG contains `scope` nodes, the convergence step:
1. Queries distinct values of the `boundary` field from `committed_data`.
2. Matches each scope branch to a category value (using the `categoryRates` metadata labels → LLM maps to actual data values, same as column binding).
3. Replaces each `scope` node with a `filter(predicate: {field, operator: eq, value: <grounded_value>}) → aggregate(op, measure)`.
4. Stores the grounded DAG.

Subsequent calculations reuse the grounded DAG. The LLM call is one-time per plan.

CC implements Approach C if the convergence binding step has access to the component DAG and metadata (it likely does — it already reads the component structure). If not, implement Approach A or B as a bridge and note the limitation.

Commit: `"OB-223 §1.2: scope→filter bridge with calc-time value grounding"`

### §1.3 Wire temporal binding into abstain handler (P2)

**File:** `anthropic-adapter.ts` — where LLM binding proposals are processed

**Read first.** Find the code that processes an LLM ABSTAIN response for a binding field. Paste the function/block.

**Then wire:** After recording an abstain for a field, check whether the available columns for that sheet contain a temporal pattern:

```typescript
import { detectTemporalColumnMap } from '../calculation/temporal-binding';

// After LLM abstains for a field:
const temporalMap = detectTemporalColumnMap(availableColumnsForSheet);
if (temporalMap) {
  // Replace the abstain with a temporal binding
  binding = {
    type: 'temporal_map',
    columnMap: temporalMap,
    reduction: 'snapshot', // or infer from the field's expected type
    // resolveTemporalColumn handles period→column at calc time
  };
  // Store this binding instead of recording a gap
}
```

**Verify the resolution path:** The diagnostic says `resolveTemporalColumn` IS wired at resolution time (in `resolveMetricsFromConvergenceBindings`). Confirm by reading the code — trace from `resolveMetricsFromConvergenceBindings` to where it checks for temporal bindings and calls `resolveTemporalColumn`. If it's wired, the only missing piece is producing the temporal binding at the abstain step.

Commit: `"OB-223 §1.3: temporal binding wired into convergence abstain handler"`

### §1.4 Count binding role acceptance (P3)

**File:** `anthropic-adapter.ts` — binding validation

**Read first.** Find the role-consistency check that rejects attribute columns when numeric is needed. The diagnostic showed:
```
Verificado (attribute): role-inconsistent, needs numeric → gap
```

Paste the validation code.

**Then fix:** When the binding key indicates a count operation (the key contains `count` — e.g., `cross_data:clientes_nuevos:count:Verificado`), accept attribute columns. The count reduction doesn't need the column's numeric value — it counts rows. The engine's `resolveColumnFromBatch` with `reduction: 'count'` handles this (OB-222).

```typescript
// In role-consistency validation:
const isCountOperation = bindingKey.includes(':count:') || 
                         bindingKey.includes('count');
if (isCountOperation && proposedColumn.role === 'attribute') {
  // Accept: count operations don't need numeric values
  // The engine counts rows matching the attribute, not the value
  return ACCEPTED;
}
```

Commit: `"OB-223 §1.4: count binding accepts attribute columns"`

### §1.5 Multiplicative component composition (P4)

**File:** `route.ts` — the entity loop, line ~2831

**Read first.** Paste the code that combines component results into the entity total. The diagnostic says it's `.plus()` (decimal.js addition).

**Then fix — Option B (engine composition mode):**

Add a composition mode check. Components whose metadata indicates a multiplier (the accelerator: `conditional → constant(1.0 or 1.25)`) are applied multiplicatively:

```typescript
// Current: total = c0 + c1 + c2 + ...
// Fixed:
let additiveTotal = new Decimal(0);
let multiplicativeProduct = new Decimal(1);

for (const componentResult of componentResults) {
  if (isMultiplicativeComponent(componentResult)) {
    multiplicativeProduct = multiplicativeProduct.times(componentResult.outcome);
  } else {
    additiveTotal = additiveTotal.plus(componentResult.outcome);
  }
}
const entityTotal = additiveTotal.times(multiplicativeProduct);
```

`isMultiplicativeComponent`: detect from the component's metadata or DAG structure. A component whose DAG is `conditional → constant(multiplier) / constant(1.0)` and whose output is a pure scalar (not currency-denominated) is multiplicative. CC reads the component structure and determines the cleanest detection.

**Alternative (if §1.1's accelerator-folding prompt fix works on re-import):** The re-import produces one component with the accelerator inside the DAG. The multiplicative composition is never needed for this plan. BUT: other future plans may have multiplicative components. Build the capability anyway — it's small and general.

**Also fix the rounding:** The diagnostic says `decimalPlaces:0` rounds the accelerator (1.25 → 1). The multiplier should NOT be rounded to zero decimal places — it's a dimensionless multiplier, not a currency amount. When composition is multiplicative, rounding should apply AFTER multiplication, not per-component.

Commit: `"OB-223 §1.5: multiplicative component composition"`

### §1.6 Clawback empty-binding acceptance (P5)

**File:** `route.ts` or `anthropic-adapter.ts` — where `HF-281` aborts on incomplete bindings

**Read first.** Find the HF-281 check that aborts calculation when a component binding is incomplete:
```
HF-281: Convergence produced an INCOMPLETE binding set — not persisting; aborting calc.
```

**Then fix:** When a component has a `temporal_adjustment` modifier in its metadata, it does NOT need convergence bindings. The engine's Pattern D handler (OB-218) bypasses normal metric resolution and uses `retrieveOriginalTrace`. An empty binding for a temporal_adjustment component is EXPECTED, not an error.

```typescript
// In HF-281 check:
const hasTemporalAdjustment = component.metadata?.modifiers?.some(
  m => m.modifier === 'temporal_adjustment'
) || component.metadata?.modifier === 'temporal_adjustment';

if (hasTemporalAdjustment) {
  // Skip binding completeness check for this component
  // Pattern D handles resolution via retrieveOriginalTrace
  continue;
}
```

Commit: `"OB-223 §1.6: clawback components bypass binding completeness check"`

### §1.7 Calc-time category value grounding (P1 convergence)

**File:** `anthropic-adapter.ts` or the binding step in `route.ts` — where bindings are resolved for prime_dag components

This is the most substantial new logic. It solves: "the plan says ALI, the data has Alimentos."

**Read first.** Trace the flow: when a plan has a `scope` or `filter` node with a `boundary` field, how does convergence currently handle it? The diagnostic shows it doesn't — `Monto_Total` is bound but `Categoria` is never mentioned in the binding proposals.

**The grounding step:**

At calc-time convergence (the `HF-165` path), after the LLM produces binding proposals, inspect the component DAG for `scope` or `filter` nodes:

1. **Detect:** Walk the DAG looking for nodes with a `boundary` or `filter.field` attribute. Extract the field name (e.g., `Categoria`) and any plan-vocabulary labels from the metadata's `categoryRates`.

2. **Query:** Get distinct values of that field from the entity's committed_data:
   ```sql
   SELECT DISTINCT row_data->>'{field}' AS val
   FROM committed_data
   WHERE tenant_id = ? AND row_data->>'{field}' IS NOT NULL
   LIMIT 20
   ```

3. **Map:** Match the plan's labels to the data values. For simple cases (ALI → Alimentos, BEB → Bebidas), prefix/substring matching may suffice. For ambiguous cases, use an LLM call (same pattern as column-name binding — one-time cost, result stored).

4. **Rewrite:** Replace the `scope` nodes in the DAG with `filter → aggregate` nodes using the grounded data values. Each branch of the `add(multiply(scope, rate), ...)` tree gets a specific filter value:
   ```
   multiply(
     filter(predicate: {field: "Categoria", operator: "eq", value: "Alimentos"})
       → aggregate(sum, "Monto_Total"),
     constant(0.025)
   )
   ```

5. **Store:** The grounded DAG is stored in the component bindings. Subsequent calculations reuse it — no LLM call. This is the same lifecycle as column bindings: resolve once, reuse.

**This runs at calc time.** Data is guaranteed present. No file-sequence dependency. The grounding is stored per-plan per-tenant. The LLM call (if needed) is one-time.

Commit: `"OB-223 §1.7: calc-time category value grounding"`

---

## §2 — PHASE 3: Tests + Regression + PR

### §2.1 Unit tests

For each fix, add targeted tests. At minimum:

- **Prompt:** Verify the conflict is removed (grep for the old "use variants" text — should be absent or narrowed).
- **scope→filter bridge:** Input a `scope` node + entity rows with 3 category values → output 3 filtered aggregates with correct sums. Partition property: sum of filtered aggregates = unfiltered total.
- **Temporal wiring:** Input an ABSTAIN + columns matching temporal pattern → output a temporal_map binding (not a gap).
- **Count acceptance:** Input a count binding key + attribute column → ACCEPTED.
- **Multiplicative composition:** Input two components: one additive ($1000), one multiplicative (1.25) → total = $1250 (not $1001).
- **Clawback bypass:** A component with temporal_adjustment modifier + empty binding → calculation proceeds (no HF-281 abort).
- **Value grounding:** Input plan labels [ALI, BEB, LIM, CPE] + data values [Alimentos, Bebidas, Limpieza, Cuidado Personal] → correct mapping.

### §2.2 BCL regression

```bash
cd web && set -a && source .env.local && set +a && npx tsx scripts/ob217-verify-bcl-attribution.ts
```

510/510 SR-38, $312,033. BCL has none of these patterns — every fix is conditional on new node types, binding keys, or modifiers. Byte-identical.

**HALT-REG:** BCL regression → stop.

### §2.3 Build + PR

```bash
npx tsc --noEmit  # exit 0
bash scripts/verify-korean-test.sh  # PASS
npm run build  # exit 0

gh pr create --base main --head ob-223-pipeline-pattern-resolution \
  --title "OB-223: End-to-end pipeline pattern resolution — 5 patterns × 6 stages" \
  --body "Comprehensive pipeline fix: all five MIR patterns diagnosed end-to-end, all gaps fixed.
- Interpreter: variant/filter disambiguation, accelerator folding, clawback modifier
- Evaluator: scope→filter bridge for existing DAGs
- Convergence: temporal abstain→map wiring, count role acceptance, clawback binding bypass
- Engine: multiplicative component composition
- Grounding: calc-time category value mapping (no file-sequence dependency, no registry)
BCL: \$312,033 unchanged, 510/510 SR-38.
Post-merge: architect re-imports MIR plans, calculates all 5, reconciles vs ground truth."
```

**DO NOT MERGE** (SR-44).

---

## §3 — POST-MERGE: Architect Verification

After merge, the architect:

1. **Clean-slate MIR plans only** (delete the 5 rule_sets, keep entities + data).
2. **Re-import the 5 plan PDFs.** The improved interpreter produces:
   - Plan 1: filter→aggregate per category (not scope), accelerator folded into the DAG (one component, not two).
   - Plan 2: banded_lookup with quota metric (unchanged — convergence handles temporal at calc time).
   - Plan 3: conditional with ratio (unchanged — already works).
   - Plan 4: count-based arithmetic with Verificado (unchanged — convergence handles count acceptance at calc time).
   - Plan 5: arithmetic with temporal_adjustment modifier in metadata, DAG = constant(0).
3. **Calculate January for all 5 plans.** At calc time:
   - Plan 1: convergence grounds category values (ALI→Alimentos etc.), filter→aggregate produces per-category amounts, accelerator applies multiplicatively.
   - Plan 2: convergence detects temporal abstain, produces temporal_map, resolution selects January column.
   - Plan 3: ~219,632 PEN (unchanged).
   - Plan 4: convergence accepts Verificado (attribute) for count, engine counts qualified rows × bonus.
   - Plan 5: 0 for January (no returns — correct). HF-281 does not abort (temporal_adjustment bypass).
4. **Reconcile against `MIR_Resultados_Esperados.xlsx`.**

If any pattern still fails after re-import through the corrected prompt, that is the OB-214 signal — the self-correcting agent is needed. This OB exhausts the non-agent approach.

---

## §4 — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/OB-223_COMPLETION_REPORT.md`.

**ARTIFACT SYNC:**
```
ARTIFACT SYNC
MC: [Pipeline Pattern Resolution: 5 patterns × 6 stages diagnosed + fixed.
     Interpreter: variant/filter conflict resolved, accelerator folding, clawback modifier.
     Evaluator: scope→filter bridge. Convergence: temporal/count/clawback wiring.
     Engine: multiplicative composition. Grounding: calc-time category mapping.
     No SQL corrections. No file-sequence dependency. No vocabulary registry.]
REGISTRY: [Conversion: scope→filter. Convergence: temporal/count/clawback.
           Engine: multiplicative composition. Grounding: calc-time value mapping.]
BOARD: [MIR: all 5 patterns end-to-end. Architect re-import+verify post-merge.]
SUBSTRATE: [Korean Test, Decision 158, SR-38, no registry, no file-sequence, no SQL.]
```

---

## §5 — OUT OF SCOPE

- **SQL plan corrections** — the platform self-corrects on re-import.
- **MIR multi-period** — after January works, calculate Feb→Jun chronologically. March exercises clawback.
- **OB-214** — if any pattern still fails after this OB, the self-correcting agent is needed.
- **Evaluate surface** — user-confirmed bindings (DS-009 Phase 5) remove the LLM call from grounding. Future.
- **Per-transaction attribution for filtered components** — walkDag has no filter case. Deferred (OB-222 residual).
- **Progressive Performance for grounding** — first grounding is LLM-assisted, stored for reuse. Full PP loop is future.

---

*OB-223 · End-to-End Pipeline Pattern Resolution (Redraft) · 2026-06-19*
*Diagnostic-first: DONE. Comprehensive fix: all five patterns, all six stages, one pass.*
*Real file locations from diagnostic. No cascade. No SQL. No registry. No file-sequence.*
*Architect gates: MERGE + RE-IMPORT + CALCULATE.*
