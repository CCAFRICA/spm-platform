# OB-223: End-to-End Pipeline Pattern Resolution

**Sequence:** OB-223 — architect-assigned 2026-06-19. Collision check mandatory.
**Repo:** `CCAFRICA/spm-platform` · **Branch:** `ob-223-pipeline-pattern-resolution` from `main`
**Type:** BUILD (pipeline wiring + conversion bridge + interpreter refinement, one PR)
**Effort:** ULTRATHINK / ULTRACODE
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

**Prerequisites (merged to `main`):** OB-220 (#552), OB-222 (#554).
**CC instance:** FRESH.

---

## §0 — CC STANDING RULES HEADER

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Commit + push after every phase. Kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root. Final: `gh pr create`. **DO NOT merge** (SR-44).

**First action:** write this directive to `docs/vp-prompts/OB-223_PIPELINE_PATTERN_RESOLUTION_DIRECTIVE_20260619.md` and commit.

### §0.1 Context — why this OB exists

Six OBs (217–222) built individual mechanisms: per-transaction traces, clawback engine, commission statement UI, string comparison, temporal binding, filtered aggregation. Each mechanism is proven in isolation (unit tested, BCL regression clean). But when exercised end-to-end through MIR's five plans, four of five fail because the mechanisms are not wired into the live pipeline's decision points.

Fixing these one at a time creates a cascade: each fix reveals the next gap at the next pipeline stage. This OB takes Approach B — a diagnostic-first pass that maps EVERY gap across ALL patterns, then fixes them all in one pass. One re-import, one verification, no cascade.

### §0.2 The five patterns (platform-general, not tenant-specific)

| Pattern | What the plan needs | Current state |
|---|---|---|
| P1: Category-differentiated rates | Filter rows by a categorical attribute, aggregate per-group, apply per-group rates, sum | Interpreter produced `scope` nodes (not in engine vocabulary). Filter values use plan abbreviations instead of actual data values. |
| P2: Wide-format temporal data | Bind a metric to the correct period column from a multi-column layout | Mechanism built (`detectTemporalColumnMap`). Not wired into convergence abstain path. |
| P3: Count of qualified rows | Count rows meeting a condition, multiply by per-unit amount | Count reduction built in engine. Convergence validator rejects attribute columns for count operations. |
| P4: Multiplicative component composition | One component's output multiplies another's (accelerator × commission) | Engine sums components. A multiplier component produces 1.25, gets ADDED to the commission instead of multiplying it. |
| P5: Cross-plan trace retrieval (clawback) | Reverse a prior calculation's result using stored traces | `retrieveOriginalTrace` built (OB-218). Interpreter doesn't produce `temporal_adjustment` modifier. Convergence has no binding path for clawback components. |

### §0.3 Governing constraints

**No developer vocabulary registry.** Category value grounding (plan says "ALI", data has "Alimentos") is a convergence problem — the same class as column binding (plan says "revenue_attainment", data has "Cumplimiento_Ingreso"). Convergence maps plan vocabulary to data vocabulary at CALC TIME, when data is guaranteed present. No file-sequence dependency. No maintained lookup table. The LLM proposes, the binding is stored.

**No file-sequence dependency.** Plans can be imported before, after, or simultaneously with data. Vocabulary grounding that requires data must happen at calc time, not at interpretation time. The interpretation produces a STRUCTURAL TEMPLATE with plan vocabulary. Convergence grounds it against actual data at calc time.

**Korean Test.** No hardcoded category values, column names, or domain vocabulary in engine code. Grounding is parameterized — the engine receives `{ field: string, value: string }` from convergence.

**No SQL plan corrections.** The platform fixes its own interpretation. No manual JSONB patches.

---

## §1 — PHASE 1: DIAGNOSTIC — Full Pipeline Walk

Walk each of the five patterns through every pipeline stage. For each stage, read the live code, trace the data flow, and record whether the pattern PASSES or FAILS at that stage. Paste code and findings for each.

### §1.1 Pipeline stages to walk

```
STAGE 1: Interpreter output (plan-component.ts → compositional_intent)
  → What shape did the interpreter produce?
  → What prime nodes are in the DAG?
  → What vocabulary does it use (column names, category values)?

STAGE 2: Intent conversion (intent-transformer.ts → calculationIntent / prime DAG)
  → Does the converter handle all prime nodes in the interpreter output?
  → Does it convert non-standard nodes (scope, scope_aggregate) to engine primes?
  → What calculationIntent is stored in rule_sets.components?

STAGE 3: Convergence binding (convergence-service.ts)
  → Does the LLM propose bindings for all required fields?
  → For abstained fields: is there a fallback mechanism?
  → For rejected bindings: what validation rule rejects them?

STAGE 4: Metric resolution (resolveMetricsFromConvergenceBindings + resolveColumnFromBatch)
  → Do the bindings resolve to actual data values?
  → For filtered/temporal/count: does the resolution path handle the binding type?

STAGE 5: DAG evaluation (intent-executor.ts evaluate())
  → Does the evaluator handle all nodes in the stored DAG?
  → Does it produce the correct result?

STAGE 6: Component composition (route.ts, the entity loop)
  → How are component results combined? Sum? Can they multiply?
  → Does the composition model support the plan's intent?
```

### §1.2 Walk Pattern P1 (category-differentiated rates)

Read the live MIR Plan 1 DAG:
```sql
SELECT jsonb_pretty(components) AS components
FROM rule_sets
WHERE id = '7aeb8fd8-e12f-4bf8-b384-3d7b2ff2ac89';
```

Then trace each stage:

**Stage 1:** What did the interpreter produce? Record the shape (`composed`), the prime types used (`scope`, `arithmetic`, `aggregate`, `constant`), and the category labels in the metadata (`ALI`, `BEB`, `LIM`, `CPE`).

**Stage 2:** Read `intent-transformer.ts`. Grep for every handled prime:
```bash
grep -n "'scope'\|\"scope\"\|'filter'\|\"filter\"\|'aggregate'\|'arithmetic'\|'conditional'\|'compare'\|'reference'\|'constant'" web/src/lib/calculation/intent-transformer.ts
```
Does it handle `scope`? What does it do with unknown primes — pass through, error, or drop?

**Stage 3:** Read the convergence log. Plan 1 bound `Monto_Total → Monto_Total`. No category-level binding. Record what convergence was asked for and what it returned.

**Stage 4:** Read the calc trace. `resolveColumnFromBatch` for entity 10300001 returned `Monto_Total = 917,616.21` (sum of ALL categories, no filter). Record `filteredOut=0`.

**Stage 5:** The evaluator encountered `scope` nodes. Record what happened — did it fall through? Return the unfiltered aggregate? Crash silently?

**Stage 6:** `c0=1,842,153 + c1=1 = 1,842,154`. The accelerator (1.25) was rounded to 1 and ADDED. Record the composition logic.

### §1.3 Walk Pattern P2 (wide-format temporal)

Read MIR Plan 2, same stages. Key question at Stage 3: where in convergence-service.ts does the ABSTAIN response get processed, and can `detectTemporalColumnMap` be called at that point?

### §1.4 Walk Pattern P3 (count of qualified rows)

Read MIR Plan 4, same stages. Key question at Stage 3: where is the role-consistency validation, and what conditional allows count operations to accept attribute columns?

### §1.5 Walk Pattern P4 (multiplicative composition)

This is Stage 6 from P1. Read the entity loop in route.ts:
```bash
grep -n 'total_payout\|components\[.*\]\|component.*result\|sum.*component\|add.*component' web/src/app/api/calculation/run/route.ts | head -20
```
Record how component results are combined. Is there a composition mode? Can components reference each other's outputs?

### §1.6 Walk Pattern P5 (clawback)

Read MIR Plan 5 DAG and the convergence log. Key questions: does the DAG have a `temporal_adjustment` modifier? Does convergence attempt to bind clawback-specific fields?

### §1.7 EPG-1: Diagnostic Summary

After walking all five patterns, produce a summary table:

```
| Pattern | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Stage 6 |
|---------|---------|---------|---------|---------|---------|---------|
| P1      | PASS/FAIL | ... | ... | ... | ... | ... |
| P2      | ... | ... | ... | ... | ... | ... |
| ...
```

With pasted evidence for every FAIL. Commit the diagnostic as `docs/diagnostics/OB-223_PIPELINE_DIAGNOSTIC.md`.

**HALT-SCOPE:** If more than 12 distinct code-change sites are identified, stop and report. The OB may need scoping.

---

## §2 — PHASE 2: Fix All Identified Gaps

Based on the diagnostic, fix every identified gap. The fixes below are PREDICTED based on current understanding — CC adjusts based on what the diagnostic actually finds.

### §2.1 Fix: scope→filter conversion with calc-time value grounding (P1)

The interpreter produced `scope` nodes because it invented a vocabulary for "partition by this attribute." The engine has `filter` nodes. The conversion bridge needs to translate.

**In `intent-transformer.ts`:** When the converter encounters a `scope` node with a `boundary` field and a `downstream` aggregate, convert it to:

```
filter(predicate: { field: <boundary>, operator: 'eq', value: <TO_BE_RESOLVED> })
  → aggregate(<downstream.op>, <downstream.field>)
```

The filter VALUE is not known at conversion time — the plan's category labels may not match the data values. Mark the filter value as `__CONVERGENCE_RESOLVE__` (a structural placeholder that convergence will replace at calc time).

**In convergence binding (convergence-service.ts):** When binding a component whose DAG contains `__CONVERGENCE_RESOLVE__` filter values, extend the binding step:

1. Query `committed_data` for distinct values of the filter field for this tenant:
   ```sql
   SELECT DISTINCT row_data->>'{filter_field}' AS val
   FROM committed_data
   WHERE tenant_id = ? AND row_data->>'{filter_field}' IS NOT NULL
   ```
2. Map the plan's category labels (from the metadata's `categoryRates`) to the actual data values. This is a convergence LLM call — the same class as column-name binding. "Plan says ALI, data has Alimentos, Bebidas, Limpieza, Cuidado Personal — which matches?"
3. Populate the filter values in the DAG with the grounded data vocabulary.
4. Store the grounded DAG in the component bindings (same lifecycle as column bindings — resolved once, reused for subsequent periods).

This runs at **calc time** (during calc-time convergence, `HF-165` path). Data is guaranteed present. No file-sequence dependency.

### §2.2 Fix: Accelerator as conditional wrapper, not separate additive component (P4)

The interpreter produced two components: commission (c0) and accelerator (c1). The engine ADDS them: `total = c0 + c1`. The plan says `total = c0 × c1`. Two resolution options — CC picks based on what the diagnostic finds:

**Option A — Interpreter fix (preferred, no engine change):** Update the prompt to instruct: "When a plan has an accelerator/multiplier condition that should multiply the base commission, fold it into the base component's DAG as a conditional wrapper: `conditional(threshold_met, base_result × multiplier, base_result)`. Do NOT produce a separate component for a multiplier."

Then re-import produces one component with the accelerator inside the DAG. No engine composition change needed.

**Option B — Engine composition mode (only if Option A fails):** Add a `composition` field to the component model: `"composition": "multiply"`. The engine loop: `total = sum(additive_components) × product(multiplicative_components)`. This is a larger change — only use if Option A is insufficient.

CC reads the engine's component composition code, assesses which option is cleaner, and implements.

### §2.3 Fix: Wire temporal binding into convergence abstain path (P2)

**In `convergence-service.ts`:** Locate the code that processes LLM ABSTAIN responses. After recording an abstain:

1. Call `detectTemporalColumnMap` with the available columns for the abstained field's sheet.
2. If a temporal map is returned, substitute it for the abstain — produce a temporal binding (`type: 'temporal_map'`, `columnMap: {...}`) instead of a gap.
3. At resolution time, `resolveMetricsFromConvergenceBindings` checks the binding type. If `temporal_map`, call `resolveTemporalColumn` with the current period to get the effective column name, then resolve normally.

### §2.4 Fix: Count binding role acceptance (P3)

**In `convergence-service.ts`:** Locate the role-consistency validation that rejects `attribute` columns when `numeric` is needed. Add a conditional:

When the binding key indicates a count operation (contains `count` in the key structure, or the intent source type is `cross_data` with `aggregation: 'count'`), accept attribute columns. The count reduction doesn't use the column's numeric value — it counts rows where the attribute matches. The engine's `resolveColumnFromBatch` with `reduction: 'count'` already handles this.

### §2.5 Fix: Clawback temporal_adjustment recognition (P5)

**In the interpreter prompt:** The OB-222 prompt already includes SC-09 (temporal_adjustment). If the diagnostic shows the interpreter still doesn't produce the modifier, strengthen the guidance with a more explicit structural constraint:

"When a plan reverses or adjusts a prior period's calculated result, the component MUST include a `temporal_adjustment` modifier in its metadata. The component's prime DAG should be `constant(0)` for the base case (no returns in the current period). The temporal_adjustment modifier tells the engine to use cross-period trace retrieval. Do NOT reference prior calculation outputs (rates, accelerators) as data column inputs."

**In convergence:** The clawback component's ABSTAIN (no binding proposal) should not abort the calculation. When a component has a `temporal_adjustment` modifier, convergence should accept an empty binding — the engine's Pattern D handler bypasses normal metric resolution and uses `retrieveOriginalTrace` instead.

### §2.6 Unit tests for each fix

For each fix, add targeted tests:

- **scope→filter conversion:** Input a `scope` node → output a `filter→aggregate` chain with `__CONVERGENCE_RESOLVE__` value placeholder.
- **Category value grounding:** Input plan labels + actual data values → output grounded filter values.
- **Temporal binding wiring:** Input an ABSTAIN + temporal columns → output a temporal_map binding.
- **Count role acceptance:** Input a count binding key + attribute column → ACCEPTED (not rejected).
- **Accelerator folding:** Either (A) re-import produces one component with accelerator inside, or (B) engine applies multiplicative composition correctly.
- **Clawback modifier acceptance:** Convergence accepts empty binding when temporal_adjustment modifier is present.

### §2.7 BCL regression

```bash
cd web && set -a && source .env.local && set +a && npx tsx scripts/ob217-verify-bcl-attribution.ts
```

Confirm 510/510 SR-38, $312,033. BCL uses none of these patterns — all fixes must be conditional on the new node types / binding keys / modifiers. Existing behavior is byte-identical.

Commit: `"OB-223 Phase 2: end-to-end pipeline pattern resolution"`

### §2.8 EPG-2

Paste: (a) every code diff. (b) unit test results. (c) BCL 510/510. (d) `npm run build` exit-0.

**HALT-REG:** BCL regression → stop.
**HALT-DUP:** If any fix creates a second resolution/evaluation/conversion path that duplicates existing functionality → stop and report.

---

## §3 — PHASE 3: MIR Verification + PR

### §3.1 Re-import test (if interpreter prompt changed)

If the interpreter prompt was modified (§2.2 Option A or §2.5), the MIR plans must be re-imported to get correct DAGs. CC cannot do this (auth-gated). Document what the architect needs to do:

1. Delete the affected rule_sets (Plan 1 if accelerator prompt changed, Plan 5 if clawback prompt changed).
2. Re-import the plan PDFs.
3. Verify the new DAGs contain the expected structure (filter nodes with `__CONVERGENCE_RESOLVE__`, or one component with accelerator folded in, or temporal_adjustment modifier).

**If no interpreter prompt was changed** (all fixes are in conversion/convergence/engine), re-import is NOT needed — the existing DAGs are fixed at the conversion/binding stage.

### §3.2 Architect calculation and reconciliation

After re-import (if needed), the architect calculates all 5 MIR plans for January. CC cannot run calculations (auth-gated).

Expected outcomes post-fix:
- Plan 1: Non-zero total with correct per-category rates (not >100% of sales). The category-differentiated computation should produce commissions in the 2-4% range of total sales.
- Plan 2: Non-zero total reflecting quota attainment for January (the temporal binding resolves to the January column).
- Plan 3: ~219,632 PEN (already working — should be unchanged).
- Plan 4: Non-zero total reflecting count of verified new clients × bonus amount.
- Plan 5: 0 for January (no returns in January data — correct).

Architect reconciles against `MIR_Resultados_Esperados.xlsx`.

### §3.3 PR

```bash
gh pr create --base main --head ob-223-pipeline-pattern-resolution \
  --title "OB-223: End-to-end pipeline pattern resolution" \
  --body "Diagnostic-first pass across five MIR plan patterns.
Fixes: scope→filter conversion with calc-time value grounding,
temporal binding wired into convergence abstain path,
count binding role acceptance for attribute columns,
accelerator as conditional wrapper (not additive component),
clawback temporal_adjustment modifier acceptance.
No SQL plan corrections — platform self-corrects.
No file-sequence dependency — grounding at calc time.
BCL: \$312,033 unchanged, 510/510 SR-38."
```

**DO NOT MERGE** (SR-44).

---

## §5A — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/OB-223_COMPLETION_REPORT.md`.

1. **Pasted evidence:** full diagnostic table, every code diff, unit tests, BCL regression.
2. **SHA:** merge-ready commit.
3. **ARTIFACT SYNC:**
   ```
   ARTIFACT SYNC
   MC: [Pipeline Pattern Resolution: 5 patterns diagnosed end-to-end, all gaps fixed.
        scope→filter conversion: WIRED. Temporal binding: WIRED. Count acceptance: WIRED.
        Accelerator composition: FIXED. Clawback modifier: WIRED.
        Calc-time value grounding: BUILT (no file-sequence dependency).
        MIR calculation verification: ARCHITECT-SIDE post-merge.]
   REGISTRY: [Conversion: scope→filter bridge. Convergence: temporal/count/clawback wiring.
              Interpreter: accelerator folding guidance.]
   BOARD: [MIR: 5 patterns end-to-end. Pipeline: conversion + convergence + composition gaps closed.]
   SUBSTRATE: [Korean Test, Decision 158, SR-38, no registry, no file-sequence, no SQL corrections.]
   ```

---

## §6 — OUT OF SCOPE

- **SQL plan corrections** — the platform fixes itself through improved interpretation + calc-time grounding.
- **MIR multi-period calculation** — after January works for all 5 plans, calculate Feb→Mar→Apr→May→Jun chronologically. March exercises the clawback.
- **OB-214 (Plan Interpretation Agent)** — if any pattern still fails after this OB, that's the OB-214 signal. This OB exhausts the non-agent approach.
- **Evaluate surface (user-confirmed bindings)** — the convergence grounding in this OB is LLM-proposed. The Evaluate surface (DS-009 Phase 5) would add user confirmation. Future.
- **Progressive Performance for category grounding** — the first calc-time grounding is LLM-assisted. The grounded binding is stored. Subsequent calculations reuse it deterministically. The flywheel stores it. Building the full PP loop is future.

---

## §6A — RESIDUALS

1. **Calc-time grounding cost:** The first calculation for a plan with category-differentiated rates requires an LLM call to map plan vocabulary to data vocabulary. This is a one-time cost per plan per tenant — the grounded binding is stored and reused. If this cost is unacceptable, the Evaluate surface (user confirmation) eliminates the LLM call entirely.

2. **Interpreter consistency:** OB-222's prompt taught the interpreter the concept (the metadata note is correct), but it produced `scope` instead of `filter`. The conversion bridge handles this. If the interpreter produces yet another invented vocabulary on a future re-import, the same bridge pattern applies — detect unknown primes in the conversion layer and map them to engine primes. A future cleanup (OB-214) standardizes the interpreter's output vocabulary.

3. **Per-transaction attribution for filtered components:** OB-222 documented that `walkDag` has no `filter` case. Filtered components are non-attributable (safe, no wrong traces). Per-transaction drill-down for category-differentiated plans is deferred until a BCL-like ground truth exists for regression testing.

4. **Component composition generality:** If Option A (accelerator folding) is used, the engine's additive composition model is unchanged. If Option B (multiplicative composition mode) is used, the composition model is extended. Either way, the general case (arbitrary component dependencies: c3 = c1 × c2 + c4) is not addressed. Future engine evolution.

---

*OB-223 · End-to-End Pipeline Pattern Resolution · 2026-06-19*
*Diagnostic-first: walk all five patterns through all six pipeline stages, fix every gap.*
*No SQL corrections. No file-sequence dependency. No vocabulary registry.*
*Architect gates: RE-IMPORT (if interpreter prompt changed) + CALCULATE + MERGE.*
