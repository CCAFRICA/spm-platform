# OB-225: Decision 158 Pipeline Completion

## §0 CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. This directive references `INF_Structured_Compliant_Drafting_Reference_20260513.md` for drafting discipline. AP-25, SR-34, SR-35, SR-38, SR-41 binding throughout.

**IRA brief (binding, IRA invocation ded357c9):** 11 substrate entries bound. Three supersession candidates identified (E910 construction boundary, E902 round-trip closure, E906 signal-accumulation contract). Core finding: the LLM currently performs BOTH recognition AND construction (Decision 158 violation); three remediation attempts (OB-222, OB-223, OB-223-R2) loaded engine-vocabulary guidance into the prompt, which is registry propagation (E907 violation, E920 pattern). The structural response: complete the existing intent-transformer so deterministic code constructs the DAG.

## §1 Problem Statement

The plan interpretation pipeline has a designed three-stage architecture:

1. **Recognition (LLM):** reads plan document, produces `compositional_intent` -- a structured declaration of what the plan means
2. **Construction (intent-transformer):** deterministic code that converts `compositional_intent` into a `prime_dag` -- a tree of engine primitives
3. **Evaluation (prime DAG evaluator):** deterministic code that evaluates the DAG against resolved data

Stage 3 is proven correct (BCL $312,033, 510/510, byte-identical across 8 merged PRs). Stage 2 exists (`intent-transformer.ts`, 444 lines) but is bypassed -- the LLM produces the `prime_dag` directly, skipping the transformer. Stage 1's prompt has been progressively loaded with engine-vocabulary guidance (OB-222, OB-223, OB-223-R2) to compensate for the bypassed transformer, creating a registry pattern.

Empirical evidence (MIR, 5 plans, January 2025, reconciled against `MIR_Resultados_Esperados.xlsx`):

- P1: 1,104,032 vs GT 593,117 (1.86x) -- LLM produced duplicate components + flat rate without category filtering
- P2: 0 vs GT 210,000 -- temporal_map produced but resolver has no consumer (hardcoded vocabulary)
- P3: 219,632 vs GT 148,306 -- formula correct (17/17 match), eligibility gate omitted
- P4: 1,759,800 vs GT 8,850 (199x) -- counted all entity rows instead of filter(Verificado=Si) then count
- P5: 0 vs GT 0 -- correct for January

The LLM correctly recognized every plan's intent (metadata proves it). It incorrectly constructed the engine DAG because it does not understand the engine's computational model. This is the Decision 158 violation the IRA identified.

The resolver's hardcoded consumption paths (sum, snapshot, distinct_count) create vocabulary-coupling between convergence and the resolver. temporal_map was produced but has no consumer. Silent $0 on unrecognized bindings violates E910 (structured failure required, never silent fallback).

## §2 Substrate-Bound Discipline

**Decision 158 (LLM recognizes; deterministic code constructs):** The LLM stops producing `calculationIntent` / `prime_dag`. It produces ONLY `compositional_intent`. The intent-transformer reads the intent's structural properties and constructs the prime_dag deterministically.

**E910 (Korean Test, construction boundary extension):** The transformer derives from the canonical primitive declaration (`prime-grammar.ts`). It does not maintain a private copy of the vocabulary. Observable, named, structured failure on unrecognizable intent shapes -- never silent fallback. The LLM prompt contains NO engine primitive vocabulary (filter, aggregate, compare, etc.).

**E907 (Fix Logic Not Data):** No prompt-vocabulary additions. No workarounds. Complete the designed pipeline.

**E902 (Carry Everything, round-trip closure):** Every binding type convergence produces must be consumable by the resolver. The resolver executes structural specifications, not enumerated types.

**E906 (Closed-Loop Intelligence):** The transformer reads prior construction validation signals before constructing. Validated intent-to-DAG mappings accumulate across imports.

**E903 (No Hardcoded Assumptions):** The resolver's enumerated consumption paths are eliminated. Bindings carry structural specifications.

**Regression anchors (reconciliation-channel, architect-verified only):**
- BCL: $312,033 (6 periods, 510/510 SR-38)
- Meridian: $556,985
- MIR Plan 3 (Cobranza): 219,632 PEN January (the formula is correct; the gate is a separate concern)

## §3 Phase 1 -- Diagnostic (read-only, no code changes)

**Objective:** Map the exact current state of the three pipeline stages. Every subsequent phase depends on this inventory.

### §3.1 Read the interpreter output pipeline

```bash
grep -n 'compositional_intent\|calculationIntent\|prime_dag\|PrimeNode' web/src/lib/plan-interpretation/plan-component.ts | head -40
grep -n 'compositional_intent\|calculationIntent\|prime_dag\|PrimeNode' web/src/lib/plan-interpretation/plan-orchestrator.ts | head -40
```

Document:
- Where does the LLM produce the `compositional_intent`?
- Where does the LLM produce the `calculationIntent` (the prime_dag that bypasses the transformer)?
- What is the exact JSONB shape of the `compositional_intent` for each of the 5 MIR plans? Query:

```sql
SELECT name, jsonb_pretty(components->'variant_0'->'components'->0->'metadata'->'compositional_intent') AS intent
FROM rule_sets
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a' AND status = 'active';
```

### §3.2 Read the intent-transformer

```bash
wc -l web/src/lib/calculation/intent-transformer.ts
grep -n 'function\|export\|switch\|case\|compositional_intent\|calculationIntent' web/src/lib/calculation/intent-transformer.ts | head -30
```

```bash
grep -n 'function\|export' web/src/lib/calculation/intent-resolver.ts | head -20
```

Document:
- What intent shapes does the transformer currently handle?
- What is the fallback path when the LLM's `calculationIntent` is valid (does it skip the transformer entirely)?
- What structural properties does the transformer read from the intent?

### §3.3 Read the resolver's consumption paths

```bash
grep -an 'reduction\|sum\|snapshot\|distinct_count\|temporal_map' web/src/lib/calculation/convergence-service.ts | head -30
grep -n 'reduction\|resolveColumn\|resolveMetrics' web/src/app/api/calculation/run/route.ts | head -30
```

Document:
- Where are the hardcoded consumption types enumerated?
- How does `resolveColumnFromBatch` dispatch on `reduction`?
- Where does `temporal_map` fail (the exact line that produces `no_real_column_match`)?

### §3.4 Read the signal infrastructure

```bash
grep -n 'construction_validation\|signal_type.*plan\|comprehension.*signal' web/src/lib/supabase/calculation-service.ts | head -20
grep -n 'classification_signals\|signal_type' web/src/lib/plan-interpretation/plan-component.ts | head -20
```

Document:
- What signal types does the PlanComprehensionEmitter currently write?
- Is there any existing signal_type that captures validated DAG constructions?

### §3.5 Commit the diagnostic

Commit message: `"OB-225 Phase 1: pipeline diagnostic"`. File: `docs/diagnostics/OB-225_PIPELINE_DIAGNOSTIC.md`. Include the exact JSONB shapes, function signatures, and dispatch points discovered.

**HALT-DIAG:** If the intent-transformer handles MORE shapes than documented in this directive, or if the resolver has consumption paths beyond sum/snapshot/distinct_count, report the full inventory before proceeding. The Phase 2 design depends on an accurate diagnostic.

## §4 Phase 2 -- Separate Recognition from Construction

**Objective:** The LLM produces only compositional_intent. The intent-transformer produces the prime_dag. The LLM prompt contains no engine primitive vocabulary.

### §4.1 Complete the intent-transformer

The transformer reads STRUCTURAL PROPERTIES of the compositional_intent, not type labels. Design the transformer to handle any intent that declares:

**Property: categorized rates.** The intent has a `categories` or `categoryRates` field (an array of {name, rate} or {category, rate} entries) and a `measure` field. The transformer produces: `add(` for each category: `multiply(filter(predicate: {field: <category_field>, operator: eq, value: <category_name>}), aggregate(op: sum, field: <measure>), constant(<rate>))` `)`. The category field name comes from the intent's structural declaration (e.g., `differentiationField` or similar).

**Property: threshold gate.** The intent has a `gate` or `condition` field with a threshold expression and an inner formula. The transformer produces: `conditional(compare(<gate_expression>), <inner_formula_dag>, constant(0))`.

**Property: count of qualified rows.** The intent has a `count` or `countField` field with a filter condition. The transformer produces: `multiply(filter(predicate: {field, operator, value}), aggregate(op: count), constant(<bonus_amount>))`.

**Property: banded lookup.** The intent has a `tiers` or `bands` field with threshold-value pairs and an input expression (possibly a ratio). The transformer produces the existing `bounded_lookup_1d` DAG shape.

**Property: multiplicative modifier.** The intent has a `modifier` field with `type: multiplicative` and a tier table. The transformer folds the modifier INTO the base component's DAG by wrapping the base's output in `multiply(base_output, modifier_lookup)`.

**Property: temporal_adjustment.** The intent has a `temporal_adjustment` modifier. The transformer produces a DAG marker that tells the engine to use `retrieveOriginalTrace` (OB-218) instead of evaluating a formula.

The transformer reads the JSONB structure to detect which properties are present. It does NOT switch on a type string. If the intent has properties the transformer cannot read, it produces an observable error:

```typescript
throw new IntentTransformError(
  `Unrecognizable intent structure: properties [${unknownProps.join(', ')}] ` +
  `not handled by the transformer. This is a construction gap, not a silent fallback.`
);
```

This is NOT a type registry because:
- The LLM is unconstrained in what structural properties it declares
- The transformer reads whatever structure is present
- Unknown structures produce visible errors (E910), not silent fallback
- New properties are handled by extending the transformer (deterministic code), not the prompt (LLM vocabulary)

### §4.2 Modify the interpreter prompt

Remove ALL engine primitive vocabulary from the plan interpretation prompt. The prompt must NOT contain: `filter`, `aggregate`, `compare`, `reference`, `constant`, `prime_dag`, `PrimeNode`, `scope`, `scope_aggregate`, or any other engine-layer terms.

The prompt tells the LLM to produce a `compositional_intent` that declares:
- What metrics the plan references (token names)
- What rates or bonus amounts the plan specifies (numeric constants)
- Whether rates differ by a categorical field (and if so, the field concept and the rate table)
- Whether a threshold gate determines eligibility (and if so, the threshold expression)
- Whether the output is a count of qualified rows (and if so, the qualification condition)
- Whether a multiplier/accelerator modifies the base calculation (and if so, the tier table)
- Whether the component reverses a prior calculation (temporal_adjustment)

The LLM uses the PLAN'S OWN VOCABULARY. If the plan says "Alimentos: 2.5%", the intent says `{category: "Alimentos", rate: 0.025}`. If the plan says "ALI: 2.5%", the intent says `{category: "ALI", rate: 0.025}`. The intent carries the plan's terms. Vocabulary grounding (ALI -> Alimentos) happens at finalization (Phase 4), not interpretation.

### §4.3 Modify the intent-resolver

The `resolveIntent` function in `intent-resolver.ts` currently tries the AI-produced `calculationIntent` first, then falls back to the transformer. Invert this:

1. Always use the transformer to produce the prime_dag from the compositional_intent
2. The `calculationIntent` field is no longer produced by the LLM
3. If the transformer produces an error (unknown structure), that error propagates -- no silent fallback

The existing `validateIntent` function validates the transformer's output, not the LLM's. This is the correct direction: deterministic code is validated, not LLM output.

### §4.4 Unit tests

Test the transformer against the 5 MIR plan intent shapes (from the Phase 1 diagnostic). For each:
- Input: the compositional_intent JSONB from the MIR plan
- Expected output: a prime_dag that uses only the canonical primitives
- Verify: the DAG structure matches what the engine needs to produce the correct result

Test the transformer against BCL plan intent shapes (regression). BCL's existing prime_dags are correct. The transformer must produce equivalent DAGs from BCL's compositional_intents.

**HALT-REGRESSION:** If any BCL plan's transformer-produced DAG differs structurally from its current prime_dag (verified against the live rule_sets), HALT. BCL is the regression anchor. Report the divergence with both DAG shapes.

### §4.5 Commit

Commit message: `"OB-225 Phase 2: Decision 158 enforcement -- intent-transformer completion"`. Build must pass. BCL regression must hold.

## §5 Phase 3 -- Eliminate Resolver Vocabulary Coupling

**Objective:** The resolver consumes structural specifications from bindings. No hardcoded consumption paths. Observable failure on malformed specifications.

### §5.1 Refactor the binding specification

Convergence bindings currently carry: `{column: string, reduction: 'sum' | 'snapshot' | 'distinct_count' | 'temporal_map'}`.

New shape: `{column: string, aggregation: {op: string, ...params}, filter?: {field, operator, value}, period_key?: string}`.

- `sum` becomes `{column: "Monto_Total", aggregation: {op: "sum"}}`
- `snapshot` becomes `{column: "Saldo_Pendiente", aggregation: {op: "snapshot"}}`
- `distinct_count` becomes `{column: "Verificado", aggregation: {op: "distinct_count"}}`
- `temporal_map` becomes `{column: "Enero_2025", aggregation: {op: "snapshot"}, period_key: "2025-01"}`
- `count` becomes `{column: "Verificado", aggregation: {op: "count"}, filter: {field: "Verificado", operator: "eq", value: "Si"}}`

### §5.2 Refactor resolveColumnFromBatch

The function reads `aggregation.op` from the binding specification and applies it. The switch on `reduction` string is replaced by a structural dispatch on the aggregation spec. If `filter` is present, rows are filtered before aggregation. If `period_key` is present, the correct temporal column is selected before aggregation.

Unknown `aggregation.op` values produce observable error:

```typescript
throw new ResolutionError(
  `Unknown aggregation operation: ${aggregation.op}. ` +
  `Binding spec: ${JSON.stringify(binding)}. ` +
  `This is a round-trip closure failure (E902).`
);
```

### §5.3 Backward compatibility

Existing convergence bindings with the old shape (`{reduction: 'sum'}`) must still work during the transition. The resolver detects the old shape and converts:

```typescript
if ('reduction' in binding && !('aggregation' in binding)) {
  binding = convertLegacyBinding(binding);
}
```

This conversion is logged as a deprecation warning. It is NOT a silent fallback -- it is a documented migration path.

### §5.4 Unit tests

Test that every existing binding type (sum, snapshot, distinct_count) produces byte-identical results through the new structural dispatch as through the old switch/case. Test that temporal_map produces the correct period-specific value. Test that count with filter produces the correct filtered count.

### §5.5 Commit

Commit message: `"OB-225 Phase 3: resolver vocabulary elimination (E902 round-trip closure)"`. Build must pass.

## §5A Phase 4 -- Binding Materialization at Finalization

**Objective:** Import finalization materializes bindings from stored signals. No LLM at calc time for binding discovery.

### §5A.1 Read the finalization pipeline

```bash
grep -n 'finalize\|post-commit\|binding\|assignment' web/src/app/api/import/finalize/route.ts | head -30
```

### §5A.2 Binding materialization step

After entity resolution and assignment creation, finalization checks: does this tenant have rule_sets with unbound tokens AND committed_data with classified columns?

If yes:
1. Read plan comprehension signals (token names, required types) from `classification_signals WHERE signal_type = 'comprehension:plan_interpretation'`
2. Read data classification signals (column names, types, sample values) from `classification_signals` for the tenant's committed_data
3. Match tokens to columns deterministically (exact name match first, then semantic similarity from stored HC labels)
4. For categorized-rate components: read the plan's category names from the compositional_intent, read the data's actual category values from committed_data (SELECT DISTINCT), produce the vocabulary mapping (ALI -> Alimentos)
5. Store the materialized bindings on the rule_set (input_bindings or a new field)
6. Store the vocabulary mapping as a grounding signal

This runs after every import. If plans exist without data, tokens are unbound (partial materialization). If data exists without plans, signals are stored. When the missing half arrives, the next finalization completes the binding.

### §5A.3 Remove calc-time LLM binding

The convergence path that invokes the LLM for binding (`OB-216 §2-S4 requesting LLM binding for variant group`) is replaced by reading the materialized bindings. If bindings are not materialized (finalization hasn't run or was partial), convergence falls back to the LLM -- but this fallback is logged as a degraded path, not the normal path.

### §5A.4 Commit

Commit message: `"OB-225 Phase 4: binding materialization at finalization"`. Build must pass.

## §5B Phase 5 -- Signal Accumulation

**Objective:** The intent-transformer accumulates construction signals from validated DAG evaluations.

### §5B.1 Construction validation signal

When a calculation completes and produces results that are committed (batch transitions to COMMITTED), the intent-to-DAG mapping is stored as a construction signal:

```typescript
signal_type: 'construction_validation',
rule_set_id: <rule_set>,
signal_value: JSON.stringify({
  intent_shape: <hash of compositional_intent structure>,
  dag_shape: <hash of prime_dag structure>,
  verified: true,
  tenant_id: <tenant>,
  period_id: <period>
})
```

### §5B.2 Transformer signal reading

Before constructing a new prime_dag, the transformer queries: `SELECT * FROM classification_signals WHERE signal_type = 'construction_validation' AND signal_value LIKE '%<intent_shape_hash>%'`. If a validated construction exists for this intent shape, the transformer reuses the validated DAG structure (adapting field names and constants from the current intent). This is deterministic reuse, not cold-start construction.

### §5B.3 Commit

Commit message: `"OB-225 Phase 5: construction signal accumulation (E906 closed-loop)"`. Build must pass.

## §5C Phase 6 -- Verification

### §5C.1 BCL regression

Recalculate BCL. Must produce $312,033, 510/510 SR-38 byte-identical. The transformer produces BCL's prime_dags from BCL's compositional_intents and the evaluator produces the same results.

### §5C.2 Meridian regression

Recalculate Meridian. Must match the stored total ($556,985 or whatever the current verified anchor is).

### §5C.3 Build and PR

```bash
npm run build
```

Exit code 0. Open PR against main. Do not merge (SR-44).

### §5C.4 Completion report

File: `docs/completion-reports/OB-225_COMPLETION_REPORT.md`. Per Rules 25-28. Include:
- Phase 1 diagnostic findings
- Transformer structural property inventory (what it handles, how)
- Resolver binding specification shape
- BCL/Meridian regression evidence
- ARTIFACT SYNC block

## §6 Out of Scope

- MIR ground-truth reconciliation (architect-gated: clean-slate, re-import, calculate, reconcile vs MIR_Resultados_Esperados.xlsx). This is the verification that happens AFTER merge.
- Plan 3 eligibility gate (interpreter comprehension of the plan document's qualifying condition -- this is a plan-reading question, not a construction question)
- OB-214 (self-correcting interpreter agent) -- if MIR still fails after the transformer is complete, that is the OB-214 signal
- VG governance extensions (E910 construction boundary, E902 round-trip closure rule, E906 signal-accumulation contract) -- separate VG repo work item
- Multi-period MIR calculation (January through June chronologically) -- post-verification

## §6A Residuals

- The OB-222/OB-223/OB-223-R2 prompt additions (engine-vocabulary guidance in the interpreter prompt) should be removed once the transformer handles the corresponding structural properties. They are technical debt per E907.
- The `intent-transformer.ts` existing 444 lines handle legacy component shapes. They should be preserved as a legacy compatibility path, not deleted, but new components flow through the new structural-property-based construction.
- The convergence LLM fallback (§5A.3) is a degraded path. It should emit a flywheel signal so the IMA can track how often finalization fails to materialize bindings. The goal is zero calc-time LLM invocations for binding.
- Plan 3's eligibility gate is the one MIR defect that may not be construction-related. If the plan document describes the gate, the compositional_intent should declare it, and the transformer should produce a conditional wrapper. If the plan document does NOT describe the gate (the gate is implicit from domain knowledge), this is an OB-214 class problem.
