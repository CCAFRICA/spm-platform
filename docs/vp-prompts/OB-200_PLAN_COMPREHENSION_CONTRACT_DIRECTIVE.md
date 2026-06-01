# OB-200: Plan Comprehension Contract — Grammar, Scale, Convergence Unification

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Drafting reference: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.
Binding rules: AP-17 (single pipeline), AP-25 (Korean Test), SR-34 (no bypass), SR-35 (EPG for math), SR-38 (mathematical review gate), Rules 25-28 (completion report discipline).
Decisions: 127 (half-open intervals), 151 (intent executor sole authority), 153 (plan intelligence as L2 signals), 154 (Korean Test four classes).

---

## §1 Problem Statement

The platform transitioned from human-encoded plan semantics (seeded SQL) to AI-interpreted plan semantics (LLM DAG emission). The translation surface between plan comprehension and engine execution has five structural defects that have persisted through six audit/diagnostic iterations (AUD-011 → AUD-013, DIAG-052 → DIAG-054) because each iteration fixed an instance, not the class. Per T1-E920: repeated fix failure is a pattern, not a bug. Structural response required.

**Defect 1 — Incomplete LLM emission.** BCL C0 (6×5 matrix) emitted as 2-branch tree. 28 of 30 cells missing. Root cause: prompt teaches via 8 examples (A-H), which are a private copy of valid compositions. No example covers 2D band lookup or 1D fixed-output band. The LLM improvises and collapses. Per T1-E910 v2: structural primitives must exist in exactly one canonical declaration; every boundary derives from it. Examples are a private copy — violation.

**Defect 2 — Scale mismatch.** Plan says "120%", DAG carries `constant(120)`, data stores `1.1354`. Compare fails. HF-243 heuristic (`extractExpectedRangeFromDAG`) works for non-degenerate trees, fails for degenerate. Per T1-E904: engine depends ONLY on committed data and active plan. Inferred scale factor is ambient context — violation. Per T1-E907: fix the derivation, not the data. Heuristic is a workaround — violation.

**Defect 3 — Convergence pipeline dual path.** Pass 1-3 resolves column mappings without filters (`filters: []`). Pass 4 (filter-aware derivations) fires only for unresolved metrics — bypassed. CRP Plans 2+4 blocked. Per AP-17: two separate code paths for the same feature — violation.

**Defect 4 — Convergence derivation schema cannot express scope.** Flat `{metric, operation, source_field, filters}`. No scope field. CRP Plan 4 scope_aggregate blocked. Per T1-E902 v2: round-trip closure — scope prime recognized at DAG boundary but not at convergence boundary — violation.

**Defect 5 — Evaluator boundary semantics.** `intent-executor.ts:572` uses strict `<` regardless of `maxInclusive`. Decision 127 mandates `[min, max)`. Values at exact boundaries → $0 — violation.

This OB closes all five as a single structural response. One PR.

---

## §2 Substrate-Bound Discipline Applications

**T1-E910 v2 (Korean Test):** The compositional grammar (`prime-grammar.ts`) is the single canonical declaration of valid prime compositions. The prompt, the validator, and the evaluator all derive from this file. No boundary maintains a private copy.

**T1-E902 v2 (Carry Everything):** Round-trip closure — every prime composition expressible at the DAG emission boundary is expressible at the convergence binding boundary and evaluable at the engine boundary. Scale metadata on constant nodes traverses all boundaries.

**T1-E904 (Calculation Sovereignty):** Scale metadata lives ON the DAG tree (part of the plan — sovereign input). Not as ambient context.

**T1-E907 (Fix Logic, Not Data):** LLM emits scale as part of its interpretation. Downstream consumes. No re-derivation.

**T1-E906 v2 (Closed-Loop Intelligence):** Plan interpretation reads prior classification signals before emitting DAG trees. Not a cold start.

**Decision 127:** Half-open `[min, max)` enforced by grammar type constraints and validator.

**Reconciliation-channel separation:** GT values ($312,033 / MX$185,063 / $364,457.84) are architect-channel only. CC reports calculated values. Architect reconciles.

---

## §3 Phase 1 — Compositional Grammar

### 3.1 Create `web/src/lib/calculation/prime-grammar.ts`

This file IS the canonical declaration. It defines:

- The nine primes: constant, reference, arithmetic, compare, logical, conditional, filter, scope, aggregate.
- Output type per prime: numeric, boolean, or inherited.
- Arity constraints: arithmetic takes 2 numeric inputs; compare takes 2 numeric inputs and produces boolean; logical takes 2+ boolean inputs; conditional takes 1 boolean condition + 2 same-type branches; filter takes 1 downstream; scope takes 1 downstream; aggregate takes 0-1 downstream.
- Valid nesting rules: any prime can nest any compatible-typed prime.
- Scale annotation slot on `constant`: `{ prime: "constant", value: number, meta?: { unit: string, scale: number, confidence: number } }`.
- Scope extension on `scope`: `{ prime: "scope", boundary: string, temporal_range?: { offset: number, length: number }, downstream: PrimeNode }`.
- Reference extension: synthetic key patterns `prior:<N>`, `attr:<name>`, `cross_data:<type>:<agg>`, `group:<metric>`.
- Half-open interval rule (Decision 127): a constraint specification that band-selection conditionals use `compare(gte, input, min) AND compare(lt, input, max)` for non-final tiers, `compare(gte, input, min)` only for the final tier.

Export: `PRIME_GRAMMAR`, `PrimeType`, `validatePrimeTree(node): ValidationResult`, `generatePromptGrammarSection(): string`.

The function `generatePromptGrammarSection()` produces the prompt text that teaches the LLM. The prompt does NOT contain a hand-written grammar section — it calls this function. One source of truth.

### 3.2 Update `web/src/lib/ai/providers/anthropic-adapter.ts`

Replace the existing CALCULATION INTENT (PRIME-DAG COMPOSITION) block (lines ~428-1070, the nine primes + 8 examples A-H) with a call to `generatePromptGrammarSection()`.

Retain 3-4 examples as grammar ILLUSTRATIONS. These examples are generated from `prime-grammar.ts` or hand-written but marked as illustrations, not the teaching mechanism. Include illustrations for: simple rate × metric (SC-01), 1D fixed-output band (SC-04, 5 tiers), 2D fixed-output band (SC-06, 3×3 matrix), piecewise rate × base (SC-05, 3 tiers).

Include the exhaustive emission instruction: "When the plan contains a rate table with N tiers (1D) or N×M cells (2D), emit exactly N or N×M constant leaf nodes. Every cell must appear. Do not summarize, collapse, or omit."

Include scale metadata instruction: "For every constant node used in a compare, annotate with `meta: { unit: '<percent|ratio|currency|count>', scale: <multiplier>, confidence: <0-1> }`. If the plan says '120%', emit `constant(120, {unit: 'percent', scale: 100, confidence: 0.95})`."

### 3.3 Halt conditions

- HALT-1: If `generatePromptGrammarSection()` produces output > 4000 tokens, halt. The grammar must be compact — T0-E01 Efficiency.
- HALT-2: If removing the old prompt block breaks `npm run build`, halt and report the compile error verbatim.

### 3.4 Commit

```
git add -A && git commit -m "OB-200 Phase 1: prime-grammar.ts canonical declaration + prompt generation" && git push origin dev
```

---

## §4 Phase 2 — Scale Metadata Emission and Consumption

### 4.1 Update `PrimeNode` type in `web/src/lib/calculation/intent-types.ts`

The constant node type gains optional `meta`:

```typescript
interface ConstantNode {
  prime: 'constant';
  value: number;
  meta?: { unit: string; scale: number; confidence: number };
}
```

This is an additive type change. Existing trees without `meta` remain valid.

### 4.2 Update convergence binding in `web/src/lib/intelligence/convergence-service.ts`

In `extractInputRequirements` for the `prime_dag` case: after `extractReferencesFromDAG` collects field names, also call a new function `extractScaleMetadataFromDAG(intent, field)` that walks the tree and collects `meta` from constant nodes in compare nodes referencing the field. If `meta.scale` is present, set it directly on the requirement's `expectedRange` (or a new `scaleMetadata` field). This replaces the `extractExpectedRangeFromDAG` path for trees that carry metadata.

`extractExpectedRangeFromDAG` remains as fallback for trees WITHOUT metadata. No change to its behavior. No extension.

In `scoreColumnForRequirement`: when `scaleMetadata.scale` is present, apply it directly instead of running the ×1 vs ×100 trial. The LLM told us the scale — consume it.

### 4.3 Update evaluator in `web/src/lib/calculation/intent-executor.ts`

In `evaluate()`, the `compare` case: when comparing a reference value against a constant that has `meta.scale`, apply the scale to the reference value before comparing. Example: `reference(cumplimiento_colocacion)` returns `1.1354`. The constant `120` has `meta.scale: 100`. The evaluator computes `1.1354 × 100 = 113.54` and compares against `120`. Result: `113.54 < 120 → false`.

Alternative: apply scale at metric resolution time (in `resolveMetricsFromConvergenceBindings`). Choose whichever is cleaner. The architectural constraint: scale reconciliation must happen at ONE site, not spread across multiple.

### 4.4 Verify Decision 127 boundary semantics

While in `intent-executor.ts`, verify that the `evaluate()` function for `conditional` nodes with band-selection patterns correctly implements half-open `[min, max)`. If `compare(lt, input, max)` is used for non-final tiers and `compare(gte, input, min)` for the final tier, this is correct. If any code path uses strict `<` without respecting the `lt` vs `lte` distinction in the compare node, fix it. The DAG tree's compare nodes carry the operator explicitly — the evaluator must honor it.

### 4.5 Commit

```
git add -A && git commit -m "OB-200 Phase 2: scale metadata on constant nodes + convergence consumption + D127 boundary fix" && git push origin dev
```

---

## §5 Phase 3 — Convergence Pipeline Unification

### 5.1 Understand the current dual-path problem

Read `web/src/lib/intelligence/convergence-service.ts` in full. The current flow:

- Pass 1: `inventoryData` — catalogs committed_data columns.
- Pass 2: `resolveColumnMappingsViaAI` — AI maps roles to columns. Hardcodes `filters: []`.
- Pass 3: targets-pair-ratio — pairs numerator/denominator for ratio components.
- Pass 4: `generateAllComponentBindings` — finalizes bindings with distribution-distinct fallback.
- Pass 5: `generateAISemanticDerivations` — AI produces filter-aware derivation rules. BUT only fires for metrics NOT already resolved by Pass 2-4.

The defect: Pass 2 resolves metrics WITHOUT filters. Pass 5 only fires for UNRESOLVED metrics. Since Pass 2 resolves them (without filters), Pass 5 never runs. Filter capability exists but is architecturally unreachable.

### 5.2 Unify into a single derivation pass

Collapse the five passes into a unified flow where the AI ALWAYS produces complete derivation rules — including filters AND scope — for every component, regardless of whether column mappings were resolved earlier.

The architectural shape: column mapping (Pass 1-2) discovers WHICH columns exist and which component roles they serve. Derivation rule generation (new unified pass) produces the COMPLETE specification of how to derive each metric from those columns — including filters, scope, and aggregation. These are not alternatives — they are complementary. Column mapping answers "which column is the revenue column." Derivation answers "sum the revenue column WHERE product_category = 'Capital Equipment'."

The unified derivation pass:
- Reads the column inventory from Pass 1.
- Reads the component requirements from the plan (including DAG tree reference fields).
- For EVERY component metric, produces a derivation rule: `{metric, operation, source_field, filters, scope}`.
- The `scope` field carries `{entity_group_by, temporal_range, aggregation_function}` when the component uses the scope prime.
- Column mapping results from Pass 2 inform the derivation (the AI knows which column to reference) but do NOT bypass derivation.

### 5.3 Update the derivation schema

The `MetricDerivationRule` type in the convergence service or intent-types gains:

```typescript
interface MetricDerivationRule {
  metric: string;
  operation: string;
  source_field: string;
  filters: Filter[];
  scope?: {
    entity_group_by?: string;
    temporal_range?: { offset: number; length: number };
    aggregation_function?: string;
  };
}
```

Existing bindings without `scope` continue to work (defaults to single-entity, current-period).

### 5.4 Wire derivation rules to the engine

In `web/src/app/api/calculation/run/route.ts`, the `applyMetricDerivations` function: when a derivation rule has `scope`, use the existing `aggregateScopeRows` function at `route.ts:2345-2397` to aggregate across sibling entities before applying the derivation's operation. This wiring already exists structurally — it just never receives scoped derivation input.

### 5.5 Halt conditions

- HALT-3: If unifying the passes requires changing the convergence function signature (the callers in `route.ts`), list all call sites before making changes.
- HALT-4: If the convergence output shape changes in a way that breaks existing bindings for BCL or Meridian (which work today), halt. The change must be additive — new fields, not changed existing fields.

### 5.6 Commit

```
git add -A && git commit -m "OB-200 Phase 3: convergence pipeline unification — single derivation pass with filters + scope" && git push origin dev
```

---

## §6 Phase 4 — Post-Generation Constraint Validator

### 6.1 Create `web/src/lib/calculation/prime-validator.ts`

Import `PRIME_GRAMMAR` and `validatePrimeTree` from `prime-grammar.ts`. The validator runs after every plan interpretation, before persisting to `rule_sets.components`.

Five checks:
1. **Type correctness:** every node's inputs match grammar arity and type constraints.
2. **Exhaustive emission:** for trees with band-selection patterns (nested conditionals over the same reference field with compare nodes), count constant leaf nodes. If the plan metadata indicates a rate table with N cells and the tree has < N leaves, emit structured warning.
3. **Scale annotation presence:** every constant node used in a compare carries `meta`.
4. **Decision 127 compliance:** every band-selection conditional uses `compare(gte)` for lower bound, `compare(lt)` for upper bound on non-final tiers.
5. **Terminal completeness:** the tree's else chain terminates in an explicit `constant(0)` or equivalent.

Validation failure is structured: `{ valid: false, violations: [{ check, node_path, message }] }`. The plan interpretation pipeline logs violations and can retry with the violation as feedback.

### 6.2 Wire into `ai-plan-interpreter.ts`

After `convertComponent` produces a `prime_dag` component, call `validatePrimeTree` on the intent. Log violations. If critical violations (type correctness, terminal completeness), throw `UnconvertibleComponentError`. If warnings (exhaustive emission, scale annotation), log and proceed — the deterministic fallback handles missing scale.

### 6.3 Commit

```
git add -A && git commit -m "OB-200 Phase 4: prime-validator.ts post-generation constraint validation" && git push origin dev
```

---

## §7 Phase 5 — Verification

### 5.1 Build verification

Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` responds. Zero TypeScript errors. Zero build warnings from new code.

### 5.2 BCL verification

Wipe BCL bindings:
```sql
UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

Calculate BCL October through the browser. Report:
- Convergence log: confirm scale metadata consumed (not inferred) for `cumplimiento_colocacion`, `calidad_cartera`, `cumplimiento_depositos`.
- Convergence log: confirm derivation rules include filters where applicable.
- Convergence log: confirm 8 component bindings (all variants).
- Per-component totals for October.
- Grand total for October.

Calculate all 6 periods. Report per-period grand totals.

Do NOT interpret. Report numbers. Architect reconciles.

### 5.3 CRP verification

Wipe CRP bindings:
```sql
UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

Calculate CRP Plans 1+3. Report per-plan totals.
Calculate CRP Plans 2+4. Report per-plan totals.

Do NOT interpret. Report numbers.

### 5.4 Commit

```
git add -A && git commit -m "OB-200 Phase 5: verification evidence" && git push origin dev
```

---

## §8 HALT Conditions

| ID | Condition | Action |
|---|---|---|
| HALT-1 | Grammar prompt section > 4000 tokens | Report token count. Architect dispositions. |
| HALT-2 | Removing old prompt block breaks build | Report compile error verbatim. Do not fix speculatively. |
| HALT-3 | Convergence unification requires changing caller signatures | List all call sites with line numbers. Architect dispositions. |
| HALT-4 | Convergence output shape change breaks existing BCL/Meridian bindings | Report the breaking change. This must be additive. |
| HALT-5 | Plan re-interpretation required (existing rule_sets carry old-format intents without scale metadata) | Report. Architect dispositions whether to clean-slate and reimport or provide migration path. |

---

## §9 Reporting Discipline

Completion report: `docs/completion-reports/OB-200_COMPLETION_REPORT.md`

Per Rules 25-28. Structure per `COMPLETION_REPORT_ENFORCEMENT.md`. Evidence means paste, not describe. Commit-per-phase.

Additional required evidence:
- `prime-grammar.ts` — paste the exported `PRIME_GRAMMAR` object in full.
- `generatePromptGrammarSection()` — paste the generated prompt text in full.
- `validatePrimeTree` — paste the function body.
- Convergence log for BCL October — paste relevant lines showing scale metadata consumption + derivation rules with filters.
- Per-component totals for BCL October — paste verbatim.
- Per-period grand totals for BCL 6 periods — paste verbatim.
- CRP per-plan totals — paste verbatim.

---

## §10 Out of Scope

- Plan supersession fix (DIAG-054 Probe 1: 2 active rule_sets) — separate HF. Does not block this OB.
- Evaluator unit test suite — separate HF after this OB proves the pipeline.
- Temporal prime extensions (clawback SC-15, retroactive SC-16, accelerator SC-17, draw SC-18, cumulative SC-20) — separate DS.
- Substrate supersession candidates (T1-E902/E910/E906/E903 extensions) — VG-side work.
- Read-before-derive at plan interpretation (T1-E906 v2 — reading prior classification signals) — separate HF. Valuable but not blocking reconciliation.

---

## §10A Residuals

- The grammar is generative: it covers the 14 non-deferred structure classes. Novel structures the grammar doesn't anticipate will compose from the same rules but may need additional grammar illustrations in future HFs.
- Existing rule_sets with old-format intents (no scale metadata) will use the `extractExpectedRangeFromDAG` fallback. A migration HF to re-interpret existing plans through the new grammar is deferred.
- The convergence unification (Phase 3) is the most architecturally significant change. If it requires more investigation than a single phase allows, it may split into a diagnostic (read current code) + implementation (change code) sub-phasing within this OB. CC should read the full convergence service before writing any changes.

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`) NOT `web/`
6. `gh pr create --base main --head dev` with title: "OB-200: Plan Comprehension Contract — compositional grammar, LLM-emitted scale metadata, convergence pipeline unification"
7. PR body: "Structural response to six-iteration audit-fix pattern. Three changes: (1) prime-grammar.ts as canonical declaration — prompt generated from grammar, not hand-written examples; (2) scale metadata on constant nodes — LLM emits unit/scale, convergence consumes directly; (3) convergence pipeline unified — single pass producing filter-aware scope-aware derivation rules, closing the CRP dual-path bypass. Verification: BCL 6-period, CRP Plans 1-4."
