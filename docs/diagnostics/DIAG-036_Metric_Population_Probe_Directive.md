# DIAG-036 — Metric Population Path + Post-Seeds-Eradication Orphan Inventory (Phase 0 Read-Only)

**Status:** ACTIVE
**Type:** Diagnostic, read-only (Phase 0)
**Scope:** Two arms in one probe — (A) complete metric-population data flow from convergence_bindings to engine consumption, (B) orphan/disconnect inventory of structures that may have been left behind or abandoned during the HF-193 seeds-eradication arc.
**Repository:** `CCAFRICA/spm-platform`
**Branch:** create new branch `diag-036-metric-population-orphan-probe` from `main`
**Output:** Single `.md` file at `docs/completion-reports/DIAG-036_COMPLETION_REPORT_Metric_Population_Path_and_Orphan_Inventory.md`
**Forbidden:** any behavioral change, fix, migration, schema modification, or commit to existing files outside `docs/completion-reports/`.

---

## Standing Rules (apply throughout this directive)

This directive operates under **CC Standing Architecture Rules v2.1+**. The following rules apply with particular force here:

- **Rule 1 (Korean Test):** structural inspection only. No language-specific string literals in any analysis.
- **Rule 2 (Scale by Design):** observations apply at the structural class layer, not single-tenant instance.
- **Rule 24 (SR-34: No Bypass):** no workarounds, no reduced-scope tests, no interim measures. If a probe surface is unreadable, surface that fact and halt — do not substitute.
- **Rule 25 (SR-41: Revert Discipline):** N/A — no commits to existing code.
- **Rule 26 (SR-42: Locked-Rule Halt):** if any locked decision dictates a different action mid-probe, halt and surface verbatim — do not proceed.
- **Evidence gates:** every claim in the output `.md` must include verbatim code excerpts (file path + line range), pasted query results, or pasted log lines. No PASS/FAIL self-attestation. No paraphrasing of code — paste it.
- **No reconciliation:** do not produce reconciliation statements, comparisons to expected values, or judgments of correctness/incorrectness. Report what the code does and what the data shows. Architect performs reconciliation in architect-channel.
- **No interpretation:** do not say "this is the bug" or "this looks wrong." Just paste structure and data.

---

## Phase 0 mandate

Read seven surfaces across two scope arms. Capture verbatim code and verbatim data. Produce one structured `.md` file. No reasoning about fixes. No proposing changes. No predicting root cause.

If a surface is unreadable, missing, or surfaces an unexpected structure, document that fact in the output and continue to the next surface. Do not halt the entire probe on a single missing surface.

---

# ARM A — Metric Population Data Flow

## Surface 1 — The metric{} construction site

**Why:** establish where in the calculation flow `data.metrics` (the object the intent executor reads from in Surface 2 of DIAG-035) is constructed and populated.

**Operation:** read-only file inspection.

```bash
# Locate the calc route entry point
find web/src/app/api/calculation -name "*.ts" -type f
ls -la web/src/app/api/calculation/run/

# Find every site that constructs or mutates `metrics`
grep -n "metrics\s*=\s*{" web/src/app/api/calculation/run/route.ts
grep -n "metrics\[" web/src/app/api/calculation/run/route.ts
grep -n "Object\.assign.*metrics" web/src/app/api/calculation/run/route.ts
grep -n "spread.*metrics\|\.\.\.metrics\|metrics\.\.\." web/src/app/api/calculation/run/route.ts

# Find the EntityData shape definition (intent executor consumes this)
grep -rn "interface EntityData\|type EntityData" web/src --include="*.ts"
```

**Capture in output:**
- Full path of the calc route entry point (`route.ts`)
- The `EntityData` type/interface definition — verbatim with line numbers
- The entire per-entity loop that builds `data.metrics` for a single entity, from start to where it's passed to intent executor — verbatim with line numbers (paste the entire function or block, not snippets)
- Every line that writes to `metrics[someKey] = someValue` — paste each with surrounding 10 lines of context
- Every line that reads from `convergence_bindings` (or `input_bindings.convergence_bindings`) — paste each with surrounding 10 lines of context

**Do not interpret.** Just paste.

---

## Surface 2 — The convergence_bindings → metrics{} key mapping logic

**Why:** the rule_set stores bindings as `convergence_bindings.component_4.actual.column = "Tasa_Utilizacion_Hub"`. The intent executor reads `metrics['hub_utilization_rate_capped']`. There must be a piece of code that maps `component_4` → `hub_utilization_rate_capped`, and that reads `Tasa_Utilizacion_Hub` to populate the metric.

**Operation:** read-only file inspection.

```bash
# Find code that translates component_N to metric_name
grep -rn "component_\${" web/src --include="*.ts"
grep -rn "componentIndex\|component_index" web/src/app/api/calculation --include="*.ts"
grep -rn "calculationIntent\.input\.sourceSpec\.field" web/src --include="*.ts"
grep -rn "sourceSpec\.field" web/src --include="*.ts"

# Find code that reads from row_data using a column name extracted from convergence_bindings
grep -rn "row_data\[" web/src/app/api/calculation --include="*.ts"
grep -rn "actual\.column\|\.row\.column\|\.column\.column" web/src --include="*.ts"
```

**Capture in output:**
- Every site where `componentIndex` or `component_index` is used as a key to look up bindings — verbatim with 20 lines of context per occurrence
- The function (if any) that takes `(component, convergence_bindings, entity_row_data)` and returns the resolved value to store in `metrics{}` — paste verbatim
- The function that derives the metric KEY NAME (e.g., `hub_utilization_rate_capped`) from a component definition — paste verbatim
- Specifically: how does the metric key `hub_utilization_rate_capped` get associated with `convergence_bindings.component_4`? Paste the linking code.

**Do not interpret.** Just paste.

---

## Surface 3 — The 121.56 value provenance trace

**Why:** entity 70010 January 2025 produces `metrics['hub_utilization_rate_capped'] = 121.56`. The committed_data row contains `Tasa_Utilizacion_Hub = 0.8292` and `Cumplimiento_Ingreso = 1.2156`. Establish empirically which committed_data field becomes `metrics['hub_utilization_rate_capped']`.

**Operation:** read-only — re-query and trace.

```bash
# Re-query the entity 70010 result and the rule_set to get current state
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 3a. The rule_set's full input_bindings shape (NOT just convergence_bindings)
const { data: rs } = await sb
  .from('rule_sets')
  .select('id, name, input_bindings')
  .eq('id', '3d629051-f788-44f6-a546-45876dd187b1')
  .single();
console.log('=== 3a INPUT_BINDINGS top-level keys ===');
console.log(Object.keys(rs.input_bindings));
console.log('=== 3a FULL input_bindings ===');
console.log(JSON.stringify(rs.input_bindings, null, 2));

// 3b. All 5 components' calculationIntent.input definitions
const { data: rsComps } = await sb
  .from('rule_sets')
  .select('components')
  .eq('id', '3d629051-f788-44f6-a546-45876dd187b1')
  .single();
console.log('=== 3b ALL 5 component INTENT INPUTS (variant 0) ===');
const v0 = rsComps.components.variants[0].components;
for (const c of v0) {
  console.log({
    componentId: c.id,
    operation: c.calculationIntent?.operation,
    input: c.calculationIntent?.input,
    inputs: c.calculationIntent?.inputs,
  });
}

// 3c. Which classification_signals rows exist for this rule_set (post-seeds-eradication)
const { data: signals } = await sb
  .from('classification_signals')
  .select('signal_type, signal_value, metric_name, component_index, rule_set_id, created_at')
  .eq('rule_set_id', '3d629051-f788-44f6-a546-45876dd187b1');
console.log('=== 3c CLASSIFICATION_SIGNALS for this rule_set ===');
console.log('Count:', signals?.length);
if (signals) {
  for (const s of signals) {
    console.log({
      signal_type: s.signal_type,
      metric_name: s.metric_name,
      component_index: s.component_index,
      created_at: s.created_at,
    });
  }
}
console.log('=== 3c FULL signals dump ===');
console.log(JSON.stringify(signals, null, 2));
"
```

**Capture in output:**
- Top-level keys of `input_bindings` — note specifically whether `plan_agent_seeds`, `metric_mappings`, `metric_derivations`, `convergence_bindings` exist
- Every component's `calculationIntent.input` shape (5 components in variant 0)
- All `classification_signals` rows for this rule_set — full dump
- Specifically isolate: any row with `signal_type = 'metric_comprehension'` and its `metric_name` field — does it list `hub_utilization_rate_capped`?
- Specifically isolate: are there signals with `component_index = 4`?

**Do not interpret.** Just paste.

---

# ARM B — Post-Seeds-Eradication Orphan Inventory

## Surface 4 — Reader-without-writer scan on input_bindings keys

**Why:** April 10 audit identified `metric_mappings` as a reader without a writer. After HF-193's seeds eradication, similar orphans may exist. Establish the complete reader/writer matrix for input_bindings keys.

**Operation:** read-only grep across the codebase.

```bash
# Every input_bindings key that gets READ
echo "=== READS of input_bindings keys ==="
grep -rn "input_bindings\[" web/src --include="*.ts"
grep -rn "input_bindings\." web/src --include="*.ts"
grep -rn "inputBindings\[" web/src --include="*.ts"
grep -rn "inputBindings\." web/src --include="*.ts"

# Every input_bindings key that gets WRITTEN
echo "=== WRITES to input_bindings keys ==="
grep -rn "input_bindings\s*:" web/src --include="*.ts"
grep -rn "inputBindings\s*:" web/src --include="*.ts"
grep -rn "input_bindings\s*=" web/src --include="*.ts"
grep -rn "inputBindings\s*=" web/src --include="*.ts"

# Specifically check for keys named in past architecture
echo "=== plan_agent_seeds residue ==="
grep -rn "plan_agent_seeds" web/src --include="*.ts"
grep -rn "planAgentSeeds" web/src --include="*.ts"

echo "=== metric_mappings ==="
grep -rn "metric_mappings" web/src --include="*.ts"
grep -rn "metricMappings" web/src --include="*.ts"

echo "=== convergence_bindings ==="
grep -rn "convergence_bindings" web/src --include="*.ts"
grep -rn "convergenceBindings" web/src --include="*.ts"

echo "=== metric_derivations ==="
grep -rn "metric_derivations" web/src --include="*.ts"
grep -rn "metricDerivations" web/src --include="*.ts"

echo "=== additional candidates from past architecture ==="
grep -rn "agent_seeds\|agentSeeds" web/src --include="*.ts"
grep -rn "seedsValid\|validSeeds\|seedSemantics" web/src --include="*.ts"
```

**Capture in output:**
- Per-key reader/writer matrix:

| Key | Read sites (file:line) | Write sites (file:line) | Status |
|---|---|---|---|

  Status options: `reader+writer`, `reader-without-writer`, `writer-without-reader`, `not-found`. Do not classify as "orphan" — just report the matrix.

- For each key, paste 5 lines of context for each occurrence
- Specifically flag: any key whose ONLY writer is in test files, or whose ONLY reader is in test files

**Do not interpret.** Just paste.

---

## Surface 5 — classification_signals reader/writer matrix for `metric_comprehension` signal_type

**Why:** Decision 153 LOCKED specified the cutover from `plan_agent_seeds` (in input_bindings) to `classification_signals` rows with `signal_type='metric_comprehension'`. Verify the writer wires to a reader.

**Operation:** read-only grep.

```bash
echo "=== signal_type writes ==="
grep -rn "metric_comprehension" web/src --include="*.ts"
grep -rn "'metric_comprehension'" web/src --include="*.ts"
grep -rn '"metric_comprehension"' web/src --include="*.ts"

echo "=== persistSignal calls ==="
grep -rn "persistSignal\|persistSignalBatch" web/src --include="*.ts"

echo "=== classification_signals read patterns ==="
grep -rn "from\(.classification_signals.\)" web/src --include="*.ts"
grep -rn "\.from('classification_signals')" web/src --include="*.ts"

echo "=== signal_type column in queries ==="
grep -rn "signal_type" web/src --include="*.ts"
```

**Capture in output:**
- Every site that WRITES a row with `signal_type = 'metric_comprehension'` (or via a constant resolving to that string) — paste with 15 lines of context
- Every site that QUERIES `classification_signals` filtering on `signal_type = 'metric_comprehension'` — paste with 15 lines of context
- The complete data flow: writer site → field set → reader site → field consumed
- Specifically: when convergence runs at calc-time, does it query `classification_signals` for `metric_comprehension` rows, or does it query something else?

**Do not interpret.** Just paste.

---

## Surface 6 — `bridgeAIToEngineFormat` current state

**Why:** the bridge function was the focal site of the HF-193 cutover. Per memory, it was supposed to switch from writing `plan_agent_seeds` to writing signals. Establish current state.

**Operation:** read-only file inspection.

```bash
echo "=== Locate bridgeAIToEngineFormat ==="
grep -rn "bridgeAIToEngineFormat\|bridge_ai_to_engine\|bridgeAIToEngine" web/src --include="*.ts"

echo "=== ai-plan-interpreter.ts content ==="
wc -l web/src/lib/compensation/ai-plan-interpreter.ts
grep -n "function\|export" web/src/lib/compensation/ai-plan-interpreter.ts
```

**Capture in output:**
- Full source of `bridgeAIToEngineFormat` (or its current named equivalent) — verbatim with line numbers
- Whether it returns `inputBindings: { plan_agent_seeds: ... }` (legacy seeds shape) or whether it persists signals via `persistSignal`/`persistSignalBatch` (post-cutover shape) — paste the actual return statement and any signal-persistence calls
- Both call sites of this function (per memory: `web/src/app/api/import/sci/execute/route.ts:1265, 1501`) — paste with 20 lines of context each

**Do not interpret.** Just paste.

---

## Surface 7 — Convergence service entry point and its signal-surface read

**Why:** post-HF-193, convergence at calc-time should read `classification_signals` (signal surface) instead of `plan_agent_seeds`. Establish whether the convergence service was wired to the new read path.

**Operation:** read-only file inspection.

```bash
echo "=== convergence-service.ts top-level structure ==="
wc -l web/src/lib/intelligence/convergence-service.ts
grep -n "^export\|^function\|^async function" web/src/lib/intelligence/convergence-service.ts
grep -n "classification_signals" web/src/lib/intelligence/convergence-service.ts
grep -n "plan_agent_seeds\|planAgentSeeds" web/src/lib/intelligence/convergence-service.ts
grep -n "metric_comprehension" web/src/lib/intelligence/convergence-service.ts

echo "=== convergeBindings entry point body (first 100 lines after declaration) ==="
grep -n "export async function convergeBindings\|export function convergeBindings" web/src/lib/intelligence/convergence-service.ts
```

**Capture in output:**
- Full `convergeBindings` function signature and the first ~150 lines of its body — verbatim with line numbers
- Any `classification_signals` queries within `convergence-service.ts` — verbatim with 20 lines of context
- Any residual `plan_agent_seeds` or `planAgentSeeds` references — verbatim with 20 lines of context
- The site within convergence that produces the `componentBindings` result — verbatim with 30 lines of context (this is what gets persisted to `rule_sets.input_bindings.convergence_bindings`)
- The site within convergence that produces `derivations` (MetricDerivationRule[]) — verbatim with 30 lines of context

**Do not interpret.** Just paste.

---

## Output file specification

**Path:** `docs/completion-reports/DIAG-036_COMPLETION_REPORT_Metric_Population_Path_and_Orphan_Inventory.md`

**Required structure:**

```markdown
# DIAG-036 COMPLETION REPORT — Metric Population Path + Post-Seeds-Eradication Orphan Inventory (Phase 0 Read-Only)

**Date:** [ISO timestamp at execution]
**Branch:** diag-036-metric-population-orphan-probe
**Commit:** [SHA at probe start]
**Tenant:** Meridian Logistics Group (5035b1e8-0754-4527-b7ec-9f93f85e4c79) — for Surface 3 live trace
**Rule set:** 3d629051-f788-44f6-a546-45876dd187b1
**Reference batch:** dcba5168-f67b-49a2-8e48-b3f3f292677e (January 2025, run 1)
**Reference entity:** 70010 — Antonio López Hernández — variant_0 (Senior)
**Predecessor probe:** DIAG-035 (PR #377, merge commit [SHA])

---

# ARM A — Metric Population Data Flow

## Section 1 — Surface 1: metric{} construction site

### 1.1 Calc route file inventory
[paths]

### 1.2 EntityData type definition
[verbatim with line numbers]

### 1.3 Per-entity metric construction loop (full function/block)
**File:** [path]
**Lines:** [start–end]

```typescript
[verbatim code]
```

### 1.4 All `metrics[key] = value` write sites (with context)
[for each: file, lines, 10-line context block, verbatim]

### 1.5 All convergence_bindings read sites (with context)
[for each: file, lines, 10-line context block, verbatim]

---

## Section 2 — Surface 2: convergence_bindings → metrics{} key mapping

### 2.1 component_index lookup sites (with context)
[for each occurrence: file, lines, 20-line context]

### 2.2 The function that resolves (component, binding, row_data) → metric_value
[path, lines, full source verbatim — or "no such function found, surface candidates listed below"]

### 2.3 The function that derives metric KEY NAME from component definition
[path, lines, full source verbatim — or "no such function found, surface candidates listed below"]

### 2.4 The component_4 → hub_utilization_rate_capped linking code
[path, lines, full source verbatim]

---

## Section 3 — Surface 3: Live data — 121.56 value provenance

### 3.1 Top-level keys of input_bindings
[list]

### 3.2 Full input_bindings JSONB
[verbatim JSON]

### 3.3 All 5 component calculationIntent.input shapes
[verbatim per component]

### 3.4 classification_signals rows for this rule_set
[count, full dump verbatim]

### 3.5 metric_comprehension signals (filtered)
[isolated rows verbatim, especially any with metric_name = "hub_utilization_rate_capped" or component_index = 4]

---

# ARM B — Post-Seeds-Eradication Orphan Inventory

## Section 4 — Surface 4: input_bindings reader/writer matrix

### 4.1 Reader/writer matrix table

| Key | Read sites (file:line) | Write sites (file:line) | Status |
|---|---|---|---|
| convergence_bindings | ... | ... | reader+writer / reader-only / writer-only / not-found |
| metric_derivations | ... | ... | ... |
| metric_mappings | ... | ... | ... |
| plan_agent_seeds | ... | ... | ... |
| [any other discovered] | ... | ... | ... |

### 4.2 Per-key context blocks
[for each key in matrix: 5-line context for each read and write site]

### 4.3 Test-only writer/reader flags
[any key whose only writer or only reader is in a test file]

---

## Section 5 — Surface 5: classification_signals + metric_comprehension wiring

### 5.1 metric_comprehension write sites
[per site: file, lines, 15-line context, verbatim]

### 5.2 metric_comprehension read sites
[per site: file, lines, 15-line context, verbatim]

### 5.3 Complete data flow diagram
[For each metric_comprehension write → read pair: writer file:line → fields populated → reader file:line → fields consumed. Tabular.]

### 5.4 Convergence-time consumption check
[Does convergence-service.ts query classification_signals for metric_comprehension? Verbatim quote of relevant code or "no such query found".]

---

## Section 6 — Surface 6: bridgeAIToEngineFormat current state

### 6.1 Function location and full source
[path, lines, verbatim]

### 6.2 Return shape — what does it write to input_bindings?
[paste return statement verbatim]

### 6.3 Signal persistence calls within bridge
[paste any persistSignal/persistSignalBatch calls verbatim, or "no signal persistence calls in bridge"]

### 6.4 Bridge call sites
[for each call site: path, lines, 20-line context, verbatim]

---

## Section 7 — Surface 7: Convergence service signal-surface read path

### 7.1 convergeBindings function signature and opening body
[path, lines, verbatim]

### 7.2 classification_signals queries within convergence-service
[verbatim with context, or "no such query found"]

### 7.3 Residual plan_agent_seeds references
[verbatim with context, or "no plan_agent_seeds references found"]

### 7.4 componentBindings construction
[path, lines, 30-line context, verbatim]

### 7.5 derivations (MetricDerivationRule[]) construction
[path, lines, 30-line context, verbatim]

---

## Section 8 — Surface read-back inventory

| Surface | Read | Findings captured | Notes |
|---|---|---|---|
| 1: metric{} construction site | [yes/no] | [yes/no] | [empty or "surface unreadable: <reason>"] |
| 2: convergence → metrics key mapping | [yes/no] | [yes/no] | |
| 3: Live 121.56 trace | [yes/no] | [yes/no] | |
| 4: input_bindings reader/writer matrix | [yes/no] | [yes/no] | |
| 5: metric_comprehension wiring | [yes/no] | [yes/no] | |
| 6: bridgeAIToEngineFormat | [yes/no] | [yes/no] | |
| 7: convergeBindings signal-surface read | [yes/no] | [yes/no] | |

---

## Section 9 — Read-only execution log

[Paste full terminal output of all queries and grep operations executed during this probe, in order, with timestamps. No editorialization.]
```

---

## Closing checklist (CC verifies before final commit)

Before committing the `.md` file and pushing the branch, CC verifies:

1. ☐ The `.md` file is at `docs/completion-reports/DIAG-036_COMPLETION_REPORT_Metric_Population_Path_and_Orphan_Inventory.md`
2. ☐ "COMPLETION REPORT" appears in the H1 title of the document
3. ☐ All seven surfaces have a section, even if a surface returned "unreadable" or "no such code found"
4. ☐ Every section contains either verbatim code paste, verbatim JSON paste, or an explicit "no such surface found" / "not present" statement — no paraphrase, no summary
5. ☐ No PASS/FAIL claims appear in the document
6. ☐ No reconciliation statements appear (no "this is correct/incorrect," no "expected vs actual," no "this is the bug")
7. ☐ No fix proposals appear
8. ☐ Section 9 contains the full execution log, unedited
9. ☐ No source files outside `docs/completion-reports/` were modified
10. ☐ The reader/writer matrix in Section 4.1 is fully populated (no blank cells)

CC then:
- `git add docs/completion-reports/DIAG-036_COMPLETION_REPORT_Metric_Population_Path_and_Orphan_Inventory.md`
- `git commit -m "DIAG-036: Metric population path + post-seeds-eradication orphan inventory Phase 0 read-only probe"`
- `git push -u origin diag-036-metric-population-orphan-probe`
- `gh pr create --base main --head diag-036-metric-population-orphan-probe --title "DIAG-036 Phase 0: Metric population path + orphan inventory read-only probe" --body "Read-only probe per HF-214 Phase 0. Predecessor: DIAG-035 (PR #377). No code changes. Output: docs/completion-reports/DIAG-036_COMPLETION_REPORT_Metric_Population_Path_and_Orphan_Inventory.md"`

End of directive.
