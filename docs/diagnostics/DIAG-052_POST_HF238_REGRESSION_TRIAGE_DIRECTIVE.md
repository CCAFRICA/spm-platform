# DIAG-052 — Post-HF-238 Proof Tenant State Triage

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PURPOSE

All three proof tenants' stored convergence bindings are empty (0 component bindings, 0 derivations) in production after HF-238 (PR #420) merged. BCL was PASS-RECONCILED ($312,033 across 6 periods, HF-196). This DIAG determines:

1. What is the actual state of stored data for all proof tenants
2. What HF-238 changed in the convergence write path
3. Whether the DAG engine evaluator produces different results from the same inputs as the old executor

**This is a read-only diagnostic. Zero code changes. Zero file modifications.**

---

## PROBE 1 — STORED BINDINGS (FULL JSONB)

Write a script (`scripts/diag-052-probe1-bindings.ts`) that reads ALL `rule_sets` and outputs:

For each rule_set:
- `name`
- `tenant_id`
- Full `input_bindings` JSONB — not a count, the ACTUAL content. If null, print "NULL". If empty object, print "{}". If populated, print the full JSON (pretty-printed, truncated to 2000 chars per rule_set if necessary).
- `component_bindings` array length (or absent)
- `metric_derivations` array length (or absent)
- Any other top-level keys in `input_bindings`

Also query `structural_fingerprints` for each tenant — how many rows, what are the `cache_key` values.

Paste full output.

---

## PROBE 2 — CONVERGENCE WRITE PATH DIFF

This probe determines what HF-238 changed in the code that writes `input_bindings` to `rule_sets`.

### 2A — Current write path

Run:
```bash
grep -rn "input_bindings" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```
Paste full output.

### 2B — The specific write site

Find the code that writes/updates `input_bindings` on `rule_sets`. It will be an `update` or `upsert` call on `rule_sets` setting `input_bindings`. Paste the function containing this write, with 30 lines of context above and below.

### 2C — Git diff of convergence changes

Run:
```bash
git diff 8600aaa7..63212283 -- web/src/lib/intelligence/convergence-service.ts
```

This shows exactly what HF-238 changed in convergence-service.ts (between pre-HF-238 HEAD and post-HF-238 HEAD). Paste the full diff.

### 2D — Git diff of route.ts convergence write

Run:
```bash
git diff 8600aaa7..63212283 -- web/src/app/api/plans/*/calculate/run-calculation.ts web/src/app/api/calculation/run/route.ts
```

Paste the full diff. This shows whether the binding write path changed.

---

## PROBE 3 — BCL CALCULATION TRACE

Write a script (`scripts/diag-052-probe3-bcl-trace.ts`) that:

1. Reads BCL's rule_set (tenant `b1c2d3e4-aaaa-bbbb-cccc-111111111111`)
2. Reads its stored `calculationIntent` (the component intents from `rule_sets.components` or wherever they're stored)
3. For each component, prints:
   - Component name
   - Whether the stored intent is legacy format (has `operation` field) or DAG format (has `prime` field)
   - The full stored intent JSON (truncated to 500 chars)
4. Reads the `input_bindings` for this rule_set — prints full content

Paste full output.

---

## PROBE 4 — CALCULATION RESULTS HISTORY

Write a script (`scripts/diag-052-probe4-calc-history.ts`) that reads `calculation_results` for BCL:

1. How many calculation_results rows exist for BCL
2. Group by period — which periods have results
3. For the October period (monthly_2025-10-01_2025-10-31): show the `created_at` timestamp of the most recent batch, the batch_id, and the grand total
4. Are there OLDER calculation_results for October from before HF-238 — check `created_at` timestamps before 2026-05-19

This tells us whether the old PASS-RECONCILED results are still in the database (overwritten vs preserved).

Paste full output.

---

## PROBE 5 — BINDING WRITE LIFECYCLE

Trace the full lifecycle of how `input_bindings` gets populated and persisted:

### 5A — Where convergence results are written

Find every code path that calls `.update()` or `.upsert()` on the `rule_sets` table with `input_bindings` as a field. Paste each occurrence with 20 lines of context.

### 5B — Where convergence results are CLEARED

Find every code path that sets `input_bindings` to null, empty, or `{}`. Run:
```bash
grep -rn "input_bindings.*null\|input_bindings.*{}\|input_bindings.*\[\]" web/src/ --include="*.ts" --include="*.tsx"
```
Also check:
```bash
grep -rn "\.update.*input_bindings\|\.upsert.*input_bindings" web/src/ --include="*.ts" --include="*.tsx"
```

Paste full output for both.

### 5C — HF-236 cache invalidation

HF-236 (PR #416) included CRP cache invalidation — clearing `structural_fingerprints`. Did it also clear `input_bindings`? Run:
```bash
git diff 9c5147e4..0fea552d -- web/src/ | grep -A5 -B5 "input_bindings"
```
(9c5147e4 is pre-HF-236, 0fea552d is HF-236 completion)

Paste full output.

---

## PROBE 6 — DAG EVALUATOR VS OLD EXECUTOR COMPARISON

Write a script (`scripts/diag-052-probe6-evaluator-compare.ts`) that:

1. Takes BCL entity BCL-5005 (Carlos Mauricio Reyes Vega) as the test case — October period
2. Reads the committed_data rows for this entity in October
3. Reads the stored component intents
4. For each component:
   - Translates via `legacyIntentToDAG` and prints the resulting DAG tree
   - Calls `evaluate(dag, context)` and prints the numeric result
5. Prints the total across all 4 components

The BCL log shows BCL-5005 = 585 (c0:240, c1:120, c2:225, c3:0). The reference spreadsheet value for this entity in October is what we need to compare against.

Paste full output.

---

## PROBE 7 — MERIDIAN AND CRP STATE

Write a script (`scripts/diag-052-probe7-all-tenants.ts`) that for EACH tenant:

1. Counts rule_sets
2. Counts committed_data rows
3. Counts calculation_results rows
4. Reports `input_bindings` state (null / empty / populated with N bindings)
5. Reports most recent `calculation_results.created_at`

This gives us the blast radius — are all tenants affected or just BCL.

Paste full output.

---

## COMPLETION

Save the full diagnostic report to `docs/diagnostics/DIAG-052_POST_HF238_REGRESSION_TRIAGE.md` and commit.

The report is the pasted output from Probes 1-7. No interpretation. No recommendations. Paste the evidence. The architect reads it.

Branch: `diag-052-post-hf238-triage` off `main`.

`gh pr create --base main --head diag-052-post-hf238-triage` with title: "DIAG-052: Post-HF-238 proof tenant regression triage — read-only diagnostic"

PR body: "Read-only diagnostic. Seven probes extracting binding state, convergence write path diffs, calculation traces, and evaluator comparison across all proof tenants. Zero code changes."
