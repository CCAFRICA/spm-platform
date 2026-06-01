# DIAG-054 — DAG Engine Full Pathway Trace

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PURPOSE

The DAG engine was introduced across HF-238, HF-238 R2, and HF-242 — touching 8+ files across 3 PRs. No end-to-end verification has been performed that a DAG tree produced by the LLM, stored in the database, fed through convergence, resolved to metrics, and evaluated by the walker produces the correct number for a real plan component.

Current BCL results: c0 (Credit Placement) = $0, c1 (Deposit Capture) = $0, c2 (Cross Products) = $8,480, c3 (Regulatory Compliance) = $7,950. Reference: $44,590 for October. c0 and c1 are zero despite convergence correctly binding their input fields.

This DIAG traces the ENTIRE DAG pathway — every file, every transformation, every data shape — from LLM prompt to final number. **Read-only. Zero code changes.**

---

## PROBE 1 — THE STORED DAG INTENTS (what the LLM emitted)

Write a script (`scripts/diag-054-probe1-stored-intents.ts`) that reads BCL's rule_set and extracts the stored `calculationIntent` for EACH of the 8 components (4 Senior Executive + 4 Executive variants).

For each component, print:
- Component name
- Component index
- `componentType`
- Full `calculationIntent` JSON (pretty-printed, no truncation)
- The DAG tree structure visualized as indented text (walk the prime nodes and indent by depth)

This shows exactly what the LLM produced. If the tree is malformed (wrong nesting, missing nodes, incorrect field references), it's visible here.

Paste full output.

---

## PROBE 2 — THE PROMPT THAT PRODUCED THE INTENTS (what we asked for)

Paste the current plan interpretation prompt from `anthropic-adapter.ts` — the section that teaches the nine primes and instructs the LLM to compose them.

Also paste the `convertComponent` function from `ai-plan-interpreter.ts` that parses the LLM's response into the stored intent shape. Show how the DAG tree arrives from the LLM response and gets stored.

---

## PROBE 3 — THE CONVERGENCE BINDING (what fields get mapped)

The BCL log shows:
```
component_0: period, calidad_cartera, entity_identifier, cumplimiento_colocacion
component_1: period, entity_identifier, cumplimiento_depositos
component_2: period, entity_identifier, productos_cruzados_vendidos
component_3: period, entity_identifier, infracciones_regulatorias
```

Write a script (`scripts/diag-054-probe3-bindings.ts`) that reads BCL's stored `input_bindings` and prints the FULL binding structure for each component — including column names, scale factors, confidence, match_pass, and any filters.

Cross-reference: for each binding entry, show the corresponding `reference` node in the DAG tree (from Probe 1) that will read this field. If any DAG `reference` node has a field name that does NOT appear in the bindings, flag it — that reference will resolve to 0 at evaluation time.

---

## PROBE 4 — THE METRIC RESOLUTION (what values each entity gets)

Write a script (`scripts/diag-054-probe4-metric-resolution.ts`) that simulates metric resolution for ONE entity (BCL-5001, Adriana Reyes Molina, Ejecutivo Senior, October 2025).

For this entity:
1. Read the committed_data rows for October
2. Print the raw row data (all 15 columns)
3. For each component (c0-c3), walk the stored DAG intent's reference nodes
4. For each reference field, look up the convergence binding → column name → raw value from the entity's row
5. Print: `field_name → binding_column → raw_value → scaled_value`
6. Print the complete `metrics` map that would be passed to `evaluate()`

This shows whether the metric values arriving at the evaluator are correct. If `cumplimiento_colocacion` maps to `Cumplimiento_Colocacion` which has value 260 for this entity, the metrics map should contain `cumplimiento_colocacion: 260`.

Reference from HF-196: BCL-5001 Adriana Reyes Molina October = $830 (c0:180, c1:400, c2:250, c3:0).

---

## PROBE 5 — THE DAG EVALUATION (what the walker computes)

Write a script (`scripts/diag-054-probe5-evaluation.ts`) that:

1. Takes BCL-5001's metrics map from Probe 4
2. Imports `evaluate` from `intent-executor.ts`
3. Imports `legacyIntentToDAG` from `legacy-intent-to-dag.ts`
4. For each component (c0-c3):
   a. Reads the stored intent
   b. If `componentType === 'prime_dag'` → use the intent directly as a PrimeNode
   c. If legacy format → translate via `legacyIntentToDAG`
   d. Calls `evaluate(dag, context)` with the entity's metrics and rows
   e. Prints the result
   f. If the result is 0, add VERBOSE tracing: walk the DAG tree manually, print the value at each node

This traces the actual evaluation path. If the tree structure is correct but a nested conditional evaluates to 0 because a compare node gets the wrong inputs, the verbose trace will show exactly where.

---

## PROBE 6 — THE LEGACY COMPARISON (what the old executor would have produced)

Write a script (`scripts/diag-054-probe6-legacy-compare.ts`) that:

1. Takes BCL-5001's data
2. Reads the LEGACY stored intents from the HF-196 era (these no longer exist in the DB — but we can construct them)
3. Actually — skip this. The legacy intents are gone (clean-slated). Instead:
   - Read the `legacyIntentToDAG` function
   - For the operation types BCL used (bounded_lookup_2d, bounded_lookup_1d, scalar_multiply, conditional_gate):
     - Show the translation rule
     - Show what DAG tree it would produce
     - Compare against what the LLM's prime_dag prompt actually produced for the equivalent component

This tells us: does the LLM's DAG-native interpretation of "bounded_lookup_2d" produce the same computational structure as `legacyIntentToDAG`'s translation of a stored `bounded_lookup_2d` intent?

---

## PROBE 7 — THE FULL FILE INVENTORY

For every file touched by HF-238, HF-238 R2, and HF-242, paste the current function signatures and exports. This is the complete surface area of the DAG engine:

```bash
# intent-types.ts — PrimeNode type definition
grep -n "type PrimeNode\|interface EvalContext\|export" web/src/lib/calculation/intent-types.ts | head -30

# intent-executor.ts — evaluate() and any other exports
grep -n "export\|function evaluate\|function build" web/src/lib/calculation/intent-executor.ts | head -20

# legacy-intent-to-dag.ts — all translation functions
grep -n "export\|function legacy\|function translate\|function component" web/src/lib/calculation/legacy-intent-to-dag.ts | head -20

# anthropic-adapter.ts — prime_dag prompt section line range
grep -n "prime\|building block\|compose\|nest these" web/src/lib/ai/providers/anthropic-adapter.ts | head -20

# ai-plan-interpreter.ts — convertComponent DAG handling
grep -n "prime_dag\|convertComponent\|VALID_PRIMES" web/src/lib/ai/ai-plan-interpreter.ts | head -20

# convergence-service.ts — extractReferencesFromDAG and prime_dag handling
grep -n "extractReferencesFromDAG\|prime_dag\|extractInputRequirements" web/src/lib/intelligence/convergence-service.ts | head -20

# run-calculation route — resolveMetricsFromConvergenceBindings prime_dag branch
grep -n "prime_dag\|extractReferencesFromDAG\|dagMetrics" web/src/app/api/calculation/run/route.ts | head -20

# primitive-registry.ts — prime_dag entry
grep -n "prime_dag" web/src/lib/calculation/primitive-registry.ts | head -10
```

Paste all output.

---

## PROBE 8 — THE LLM'S ACTUAL INTERPRETATION OF BCL'S PLAN

The key question: when the LLM reads BCL's plan document (which contains a 2D rate table for Credit Placement and a 1D rate table for Deposit Capture), what DAG tree does it produce?

Probe 1 shows the stored tree. But we need to understand WHY the LLM produced that tree. Read the BCL plan content from the stored `rule_set.metadata` or `rule_set.source_document` or wherever the original plan text is preserved.

```bash
# Find where the plan text is stored
cd web && npx tsx -e '
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await s.from("rule_sets").select("name, metadata, source_document_text").eq("tenant_id", "b1c2d3e4-aaaa-bbbb-cccc-111111111111").limit(1);
  for (const r of data || []) {
    console.log("Name:", r.name);
    if (r.source_document_text) console.log("Source text (first 500 chars):", r.source_document_text.substring(0, 500));
    if (r.metadata) console.log("Metadata keys:", Object.keys(r.metadata));
  }
}
run();
'
```

Print whatever plan text is available. Then print the LLM prompt + plan text that would be sent at interpretation time (the system prompt from anthropic-adapter.ts + the plan text). This is the complete input to the LLM that produced the stored DAG intents.

---

## COMPLETION

Save to `docs/diagnostics/DIAG-054_DAG_PATHWAY_TRACE.md` and commit.

The report is pasted output from Probes 1-8. No interpretation. No recommendations. Paste the evidence. The architect reads it and determines whether the DAG engine is structurally sound or needs rework.

Branch: `diag-054-dag-pathway-trace` off `main`.

`gh pr create --base main --head diag-054-dag-pathway-trace` with title: "DIAG-054: Full DAG engine pathway trace — LLM emission through evaluation, 8 probes, read-only"

PR body: "Read-only diagnostic. Eight probes tracing the complete DAG engine pathway: stored intents, prompt, convergence bindings, metric resolution, evaluation, legacy comparison, file inventory, and LLM interpretation context. Zero code changes."
