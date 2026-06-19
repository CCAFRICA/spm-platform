# OB-222: Filtered Aggregation — Per-Row Categorical Resolution in the Calculation Engine

**Sequence:** OB-222 — architect-assigned 2026-06-19. Collision check mandatory.
**Repo:** `CCAFRICA/spm-platform` · **Branch:** `ob-222-filtered-aggregation` from `main`
**Type:** BUILD (engine capability + interpreter improvement, one PR)
**Effort:** ULTRATHINK / ULTRACODE
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

**Prerequisites (merged to `main`):** OB-220 (#552 — string comparison fix required; filtered references with string values would crash without it).
**CC instance:** FRESH.

---

## §0 — CC STANDING RULES HEADER

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Commit + push after every phase. Kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root. Final: `gh pr create`. **DO NOT merge** (SR-44).

**First action:** write this directive to `docs/vp-prompts/OB-222_FILTERED_AGGREGATION_DIRECTIVE_20260619.md` and commit.

### §0.1 The defect

The engine aggregates ALL of an entity's transaction rows into one value per metric before evaluating the computation tree. Aggregation destroys per-row categorical identity. An entity whose transactions span multiple categories produces one number — the sum of ALL categories. The per-row category field ceases to exist at the aggregate level.

Plans that differentiate rates by a per-row categorical attribute (product type, sales channel, customer segment, geographic region) cannot compute correctly. The computation tree says `if category == "X" then rate × amount` — but at the aggregate level `category` has no value (the entity transacts across multiple categories) and `amount` is the total across all categories.

The correct computation filters the entity's rows by category BEFORE aggregating. The prime DAG vocabulary lists `filter` as one of the five primitives. The engine does not implement it.

### §0.2 Scope boundary — no SQL plan corrections

This OB builds the engine capability and improves the interpreter. It does NOT manually correct plan DAGs via SQL. The platform's workflow is: upload plan document → platform interprets → correct structure → calculate → correct results. If the interpretation is wrong, the fix is to improve the interpreter and re-process, not to patch the database.

After this OB merges, the architect clean-slates MIR and re-imports. The improved interpreter produces correct DAG structures. If the interpreter still produces wrong DAGs, that is the signal for OB-214 (self-correcting agent) — not for SQL patches.

### §0.3 Codebase context

| Fact | Value |
|---|---|
| `resolveColumnFromBatch` | `route.ts` — iterates entity's `row_data` objects, sums a column, returns one number. No filter parameter. All callers pass (batchId, column, entityExternalId) only. |
| `dataByBatch` | `Map<batchId, Map<entityExternalId, row_data[]>>` — the raw rows are in memory during calculation. Each `row_data` carries all original columns including categorical attributes. |
| `attribRowsByBatch` (OB-217) | Parallel structure carrying `committed_data.id + row_data + metadata`. Same rows, same keys, plus the structural identity for per-transaction traces. |
| Prime DAG evaluator | `intent-executor.ts` `evaluate()` — recursive walker. Handles `conditional`, `arithmetic`, `compare`, `reference`, `constant`. Does NOT handle `filter` or `aggregate` as prime nodes. |
| `reference` node resolution | Currently reads from a pre-resolved `metrics` dictionary (flat `Record<string, number>`). The dictionary is populated by `resolveMetricsFromConvergenceBindings` before DAG evaluation. |
| Compositional intent construction | `plan-component.ts` — sends plan section to LLM, gets structured intent back. The LLM prompt determines the DAG structure. |
| OB-220 string comparison | Live on main. `compare` handles string operands via type detection. Required for filtered references with string filter values. |

---

## §1 — PROBLEM STATEMENT

Two computation patterns are structurally impossible in the current engine:

**Pattern 1 — Category-differentiated rates:** A plan applies different rates based on a per-row categorical attribute. The correct computation: filter rows by attribute value → aggregate per-group → apply per-group rate → sum results. The engine cannot filter during aggregation.

**Pattern 2 — Conditional count:** A plan's payout depends on counting rows meeting a condition. The correct computation: filter rows by condition → count qualifying rows → multiply by per-unit amount. The engine produces one aggregated value, not a count of a subset.

A third pattern is an interpreter-level gap (no engine change needed):

**Pattern 3 — Temporal adjustment (clawback/reversal):** A plan reverses a prior calculation's result. The reversal amount is NOT a data column — it's the output of a prior plan's calculation, stored in `calculation_traces`. The interpreter must produce a `temporal_adjustment` modifier (OB-218's design) that tells the engine to use `retrieveOriginalTrace`, rather than referencing non-existent data columns.

### §1.1 Definition of done

1. `resolveColumnFromBatch` accepts an optional filter `{ field: string, value: string | number }`. When present, only matching rows are included. When absent, behavior is byte-identical.
2. `resolveColumnFromBatch` accepts an optional `reduction: 'count'` mode that counts qualifying rows instead of summing a column's values.
3. The prime DAG evaluator handles reference nodes with `filter` and `reduction` attributes, resolving them via the extended `resolveColumnFromBatch`.
4. The compositional intent construction prompt includes structural guidance about the aggregation model: filtered references for per-row categorical differentiation, filtered count for conditional counting, and temporal_adjustment modifier for reversal/clawback plans.
5. BCL regression: $312,033 unchanged, 510/510 SR-38.
6. Unit tests: filtered aggregation (sum with filter, count with filter, no-filter byte-identical, partition property).
7. `npm run build` exit-0; PR opened (not merged).

---

## §2 — SUBSTRATE DISCIPLINES

**Korean Test:** The filter is `{ field: string, value: string | number }` — structural parameters read from the DAG node. The engine does not know what the field or value represents. No column names, no category values, no domain vocabulary in engine code.

**Decision 158:** The LLM produces DAGs with filter specifications. The engine applies the filter deterministically: `String(row_data[field]) === String(value)` is a comparison, not an AI decision.

**No registry / No LLM limitation:** The interpreter prompt adds understanding of the computational model, not a list of patterns. The LLM is told how the engine works (aggregation destroys per-row identity). The LLM determines when to use filtered references based on the plan's structure — any categorical attribute, not a predefined list.

**No duplicative path:** `resolveColumnFromBatch` is ONE function, extended with optional parameters. Existing callers are unmodified. No second function.

**SR-38:** The sum of filtered aggregates across all category values equals the unfiltered total (partition property: each row belongs to exactly one category value). This is provable by construction and must be verified in unit tests.

**No SQL plan corrections:** The platform fixes its own interpretation on re-import. Manual database patches are not a platform capability.

---

## §3 — PHASE 1: Engine — Filtered Aggregation + DAG Resolution

### §3.1 Read `resolveColumnFromBatch`

```bash
grep -n 'resolveColumnFromBatch' web/src/app/api/calculation/run/route.ts
```

Read the full function body. Record with pasted code:
1. How it receives the entity's rows (from `dataByBatch`).
2. How it iterates and sums (the `for (const rd of rows)` loop).
3. Where the OB-216 reduction recognition occurs (sum vs snapshot).
4. All call sites — every place that calls this function.

### §3.2 Extend with optional filter and count reduction

The function gains optional parameters. When omitted, behavior is byte-identical:

```typescript
function resolveColumnFromBatch(
  batchId: string,
  column: string,
  entityExternalId: string,
  options?: {
    filter?: { field: string; value: string | number };
    reduction?: 'sum' | 'snapshot' | 'count';
  }
): number | null {
  // ... existing batch/entity lookup (UNCHANGED) ...

  let sum = 0;
  let found = false;
  for (const rd of rows) {
    // NEW: skip rows that don't match the filter
    if (options?.filter) {
      const rowVal = rd[options.filter.field];
      if (String(rowVal ?? '') !== String(options.filter.value)) continue;
    }

    if (options?.reduction === 'count') {
      // Count qualifying rows (column value is irrelevant)
      sum += 1;
      found = true;
    } else {
      // EXISTING sum/snapshot logic (UNCHANGED)
      const val = rd[column];
      // ... existing numeric parsing and summing ...
    }
  }
  return found ? sum : null;
}
```

**Verify byte-identical behavior:** No existing caller passes `options`. The function signature is backward-compatible. All existing tests must pass unchanged.

### §3.3 Read the prime DAG evaluator

```bash
grep -n 'evaluate\|reference\|constant\|compare\|conditional\|arithmetic\|prime' \
  web/src/lib/calculation/intent-executor.ts | head -40
```

Read the `evaluate` function (recursive DAG walker). Record:
1. How `reference` nodes resolve their field value — from a `metrics` dictionary? Directly from row data?
2. Whether the evaluator has access to `resolveColumnFromBatch` or the raw `dataByBatch` — through closure, parameter, or module scope.
3. How adding a filtered-reference resolution path would integrate: does the evaluator need a new parameter (a resolution callback), or can it access the resolution through existing scope?

### §3.4 Add filtered reference resolution to the DAG evaluator

When the evaluator encounters a `reference` node with a `filter` attribute:

```json
{
  "prime": "reference",
  "field": "amount_field",
  "filter": { "field": "category_field", "value": "category_value" }
}
```

It resolves the reference by calling `resolveColumnFromBatch` with the filter, rather than reading from the pre-resolved `metrics` dictionary. The evaluator needs access to the resolution function.

**Two integration approaches (CC determines which fits the live code):**

**Approach A — Resolution callback:** The evaluator receives an optional `resolveFiltered` callback when invoked. When a filtered reference is encountered, the evaluator calls the callback. When no filter is present, the existing `metrics` dictionary path is used. The callback is wired in `route.ts` where `resolveColumnFromBatch` is in scope.

**Approach B — Inline resolution:** The evaluator receives the entity's raw row data (already available via `attribRowsByBatch` from OB-217 or `dataByBatch`). When a filtered reference is encountered, the evaluator filters and aggregates inline. When no filter is present, the existing path is used.

Either approach: the non-filtered path is UNCHANGED. Only filtered references use the new path. CC reads the live code and determines which integrates more cleanly.

For count reduction:
```json
{
  "prime": "reference",
  "field": "*",
  "filter": { "field": "condition_field", "value": "qualifying_value" },
  "reduction": "count"
}
```

Resolves to the count of rows matching the filter. The `field: "*"` signals "count rows, not sum a column."

### §3.5 Unit tests

**`resolveColumnFromBatch` extension:**
- No filter → sum all rows (existing behavior, byte-identical)
- Filter present → sum only matching rows
- Filter with zero matches → null
- Count reduction → count all rows
- Count with filter → count matching rows only
- String filter value matches string row value
- Numeric filter value matches numeric row value
- Mixed: filter field is string, other fields are numeric → correct sum of numeric column for matching rows

**DAG evaluator filtered reference:**
- Filtered reference produces filtered sum (not full sum)
- Non-filtered reference produces full sum (existing behavior)
- Count reference produces row count
- Nested DAG: `add(multiply(filtered_ref_A, rate_A), multiply(filtered_ref_B, rate_B))` → sum of per-category contributions
- **Partition property (SR-38):** sum of filtered aggregates for all distinct category values equals unfiltered total

### §3.6 BCL regression

```bash
cd web && set -a && source .env.local && set +a && npx tsx scripts/ob217-verify-bcl-attribution.ts
```

Confirm 510/510 SR-38, $312,033. BCL has no filtered references — byte-identical results.

Commit: `"OB-222 Phase 1: filtered aggregation + DAG evaluator resolution"`

### §3.7 EPG-1

Paste: (a) `resolveColumnFromBatch` full diff. (b) DAG evaluator diff showing filtered reference path. (c) unit test results (all passing). (d) BCL 510/510 + $312,033. (e) `npm run build` exit-0.

**HALT-REG:** BCL regression → stop.
**HALT-DUP:** If the implementation requires a second resolution function instead of extending the existing one → stop and report.

---

## §4 — PHASE 2: Interpreter Prompt Improvement

### §4.1 Read the compositional intent construction

```bash
grep -rn 'compositional_intent\|composit\|system.*prompt\|instruction' \
  web/src/lib/compensation/plan-component.ts \
  web/src/lib/compensation/plan-orchestrator.ts | head -30
```

Read the file where the LLM prompt for per-component intent construction is assembled. Record with pasted code:
1. The full prompt or system instruction the LLM receives when constructing a component's intent.
2. What structural shapes are described or exemplified (conditional, arithmetic, banded_lookup, etc.).
3. Whether the prompt mentions filtering, aggregation behavior, per-row attributes, or the engine's aggregation model.
4. The exact location where additional guidance can be inserted without restructuring the prompt.

### §4.2 Add computational model awareness

Insert structural guidance about how the engine processes data. This is understanding of the computational model, NOT a pattern registry:

```
ENGINE AGGREGATION MODEL:
The calculation engine aggregates all of an entity's transaction rows 
into one value per metric before evaluating the computation tree.

Key implications for intent construction:

1. Per-row categorical attributes (product type, region, channel, segment,
   status — any field whose values partition the rows into groups) do not 
   exist at the aggregate level. An entity whose transactions span multiple 
   attribute values has no single attribute value after aggregation.

   When a plan applies different rates or rules based on a per-row attribute,
   the intent must use a filtered reference:
   { "prime": "reference", "field": "<measure>", 
     "filter": { "field": "<attribute>", "value": "<group_value>" } }
   This resolves to the sum of <measure> ONLY for rows where <attribute> 
   equals <group_value>. One filtered reference per attribute value, combined 
   with arithmetic.

   A conditional that checks a categorical attribute at the aggregate level 
   is INCORRECT — the attribute value is per-row, not per-entity.

2. When a plan's payout depends on counting rows that meet a condition,
   the intent must use a filtered count reference:
   { "prime": "reference", "field": "*", 
     "filter": { "field": "<condition_field>", "value": <qualifying_value> }, 
     "reduction": "count" }
   This resolves to the number of rows where the condition is met.

3. When a plan reverses or adjusts a prior period's calculation result,
   the reversal amount is NOT a data column — it is the stored output of 
   a prior calculation. The intent must include a temporal_adjustment 
   modifier that tells the engine to look up the stored result:
   { "modifier": "temporal_adjustment", 
     "adjustmentType": "per_transaction_reversal",
     "referenceMapping": { 
       "returnField": "<field linking to original>", 
       "originalField": "<matching field in original data>" },
     "recoveryRate": <reversal_multiplier> }
   Do NOT reference prior calculation outputs (rates, multipliers, 
   accelerators from other plans) as data column inputs — they do not 
   exist in the data.
```

**HALT-REGISTRY:** If inserting this guidance requires adding an enumerated list of attribute names, a switch/case on field types, or a taxonomy of plan patterns → stop. The guidance describes the computational model and how the engine works. The LLM applies it to any plan structure it encounters.

### §4.3 Verify prompt does not regress existing interpretations

The prompt change must not alter the interpretation of plans that don't use categorical differentiation, count operations, or temporal adjustments. These plans use numeric conditionals, arithmetic, and constant nodes — none of which are affected by the new guidance.

Verify: read the prompt before and after. Confirm the new guidance is ADDITIVE — it adds understanding, it doesn't remove or modify existing shape descriptions. The LLM's ability to produce conditional, arithmetic, banded_lookup, and other existing shapes is unaffected.

Commit: `"OB-222 Phase 2: interpreter computational model awareness"`

### §4.4 EPG-2

Paste: (a) the prompt before (relevant section). (b) the prompt after (with new guidance). (c) confirmation that existing shape descriptions are unchanged. (d) `npm run build` exit-0.

---

## §5 — PHASE 3: Build + PR

### §5.1 Final verification

- `npx tsc --noEmit` → exit 0
- `bash scripts/verify-korean-test.sh` → PASS
- `bash scripts/no-developer-numbers-scan.sh` → clean
- `npm run build` → exit 0
- BCL verification script → 510/510, $312,033

### §5.2 PR

```bash
gh pr create --base main --head ob-222-filtered-aggregation \
  --title "OB-222: Filtered aggregation — per-row categorical resolution" \
  --body "Engine: resolveColumnFromBatch gains optional filter { field, value } + count reduction.
DAG evaluator: reference nodes with filter/reduction attributes resolve via filtered aggregation.
Interpreter: prompt gains computational model awareness (filtered references for categorical 
differentiation, filtered count for conditional counting, temporal_adjustment for reversals).
No SQL plan corrections — platform fixes itself on re-import through improved interpreter.
BCL: \$312,033 unchanged, 510/510 SR-38.
Partition property proven: sum of filtered aggregates = unfiltered total."
```

**DO NOT MERGE** (SR-44).

---

## §5A — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/OB-222_COMPLETION_REPORT.md`.

1. **Pasted evidence:** `resolveColumnFromBatch` diff, DAG evaluator diff, unit tests (all), interpreter prompt diff, BCL regression, build/scanners.
2. **SHA:** merge-ready commit.
3. **ARTIFACT SYNC:**
   ```
   ARTIFACT SYNC
   MC: [Filtered aggregation: ENGINE GAP → FIXED. Interpreter: computational model awareness added.
        Category-differentiated rates: PATTERN SUPPORTED in engine + interpreter.
        Count-based operations: PATTERN SUPPORTED in engine + interpreter.
        Temporal adjustment: INTERPRETER AWARENESS added (engine already built in OB-218).]
   REGISTRY: [Calculation Engine → filtered aggregation (resolveColumnFromBatch extended, not duplicated)]
   BOARD: [Engine: filtered aggregation capability. Interpreter: three structural patterns.]
   SUBSTRATE: [Korean Test (structural parameters), Decision 158 (deterministic filter),
               SR-38 (partition property), no registry, no duplicative path, no SQL corrections.]
   ```

---

## §6 — OUT OF SCOPE

- **SQL plan corrections** — the platform fixes itself. After this OB merges, architect clean-slates MIR and re-imports through the improved interpreter. If the interpreter still produces wrong DAGs, that signals OB-214 (self-correcting agent), not SQL patches.
- **OB-214 (Plan Interpretation Agent)** — the prompt improvement in this OB is compatible with the future agent. The agent's system prompt includes the same computational model awareness.
- **MIR re-import and calculation** — architect-side after merge. The improved interpreter processes the plan PDFs on re-import. Architect verifies correct DAG structures, calculates, reconciles against ground truth.
- **Per-transaction attribution for filtered components** — OB-217's `extractAdditiveTerms` may need minor extension to handle filtered reference nodes. If the existing walker handles them naturally (they're still `reference` nodes), no change needed. Note in the completion report.

---

## §6A — RESIDUALS

1. **Post-merge MIR workflow:** Architect clean-slates MIR → re-imports plan PDFs + data files → verifies interpreter produced correct DAGs (filtered references in Plan 1, count in Plan 4, temporal_adjustment in Plan 5) → calculates January → reconciles against `MIR_Resultados_Esperados.xlsx`. If DAGs are still wrong after the improved interpreter, that's OB-214 territory.

2. **Partition property edge case:** If a row has NULL or unexpected values for the filter field, it won't match any filtered reference. The plan's DAG should handle this via an "else" branch (default rate for uncategorized rows) or the unmatched rows should sum to zero. The engine doesn't enforce partition coverage — it's the plan's responsibility to handle all category values.

3. **Per-transaction attribution compatibility:** Filtered reference nodes are still `reference` nodes in the DAG. OB-217's `extractAdditiveTerms` recursively collects `{rate, metricField}` terms from `multiply(reference, constant)` patterns. If the walker skips filtered references, a small extension (recognize reference nodes WITH filter attributes) is needed. CC checks this during Phase 1 and notes the finding.

4. **OB-214 compatibility:** The three structural patterns added to the interpreter prompt (filtered references, filtered count, temporal_adjustment) are prompt content. When OB-214 replaces or wraps the interpreter, the agent's system prompt includes the same guidance. No conflict — the engine capability is independent of whether the interpreter is HF-248 or OB-214.

---

*OB-222 · Filtered Aggregation — Per-Row Categorical Resolution · 2026-06-19*
*Platform capability: filtered aggregation + interpreter computational model awareness*
*Architect gates: ZERO. Fully autonomous CC execution.*
*Post-merge: architect re-imports MIR through improved interpreter to verify.*
