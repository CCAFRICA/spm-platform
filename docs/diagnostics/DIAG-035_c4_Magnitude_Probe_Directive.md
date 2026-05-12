# DIAG-035 — c4 Fleet Utilization Magnitude Defect (Phase 0 Read-Only Probe)

**Status:** ACTIVE
**Type:** Diagnostic, read-only (Phase 0)
**Scope:** Meridian tenant, post-HF-213 main; fresh clean-slate reimport completed 2026-05-08 04:01.
**Repository:** `CCAFRICA/spm-platform`
**Branch:** create new branch `diag-019-c4-magnitude-probe` from `main`
**Output:** Single `.md` file at `docs/completion-reports/DIAG-035_c4_Fleet_Utilization_Magnitude_Probe.md`
**Forbidden:** any behavioral change, fix, migration, schema modification, or commit to existing files outside `docs/completion-reports/`.

---

## Standing Rules (apply throughout this directive)

This directive operates under **CC Standing Architecture Rules v2.1+**. The following rules apply with particular force here:

- **Rule 1 (Korean Test):** structural inspection only. No language-specific string literals in any analysis.
- **Rule 2 (Scale by Design):** observations apply at the structural class layer, not single-tenant instance.
- **Rule 24 (SR-34: No Bypass):** no workarounds, no reduced-scope tests, no interim measures. If a probe surface is unreadable, surface that fact and halt — do not substitute.
- **Rule 25 (SR-41: Revert Discipline):** N/A — no commits to existing code in this directive.
- **Rule 26 (SR-42: Locked-Rule Halt):** if any locked decision dictates a different action mid-probe, halt and surface verbatim — do not proceed.
- **Evidence gates:** every claim in the output `.md` must include verbatim code excerpts (file path + line range), pasted query results, or pasted log lines. No PASS/FAIL self-attestation. No paraphrasing of code — paste it.
- **No reconciliation:** do not produce reconciliation statements, comparisons to expected values, or judgments of correctness/incorrectness. Report what the code does and what the data shows. Architect performs reconciliation in architect-channel.

---

## Phase 0 mandate

Read four surfaces. Capture verbatim code and verbatim data. Produce one structured `.md` file. No reasoning about fixes. No proposing changes. No predicting root cause.

If a surface is unreadable, missing, or surfaces an unexpected structure, document that fact in the output and continue to the next surface. Do not halt the entire probe on a single missing surface.

---

## Surface 1 — Live rule_set component definition for c4 (both variants)

**Why:** establish what c4's structural shape is in the operative rule_set post-fresh-import.

**Operation:** read-only Supabase query via service role.

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { data, error } = await sb
  .from('rule_sets')
  .select('id, name, components, input_bindings')
  .eq('id', '3d629051-f788-44f6-a546-45876dd187b1')
  .single();
if (error) { console.error(JSON.stringify(error)); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
"
```

**Capture in output:**
- Full `components` JSONB structure (both variants, all 5 components per variant) — verbatim JSON paste
- Full `input_bindings` JSONB structure — verbatim JSON paste
- Specifically isolate and label the c4 component object from variant 0 (Senior) and variant 1 (Standard)
- Specifically isolate and label the convergence_binding for component_4 from `input_bindings`
- Specifically isolate and label the metric_derivation rules from `input_bindings.metric_derivations` (or wherever they live in the bindings shape)

**Do not interpret.** Do not say "the rate appears to be X." Just paste the structure.

---

## Surface 2 — Intent executor c4 / scalar_multiply evaluation code path

**Why:** establish what code actually computes c4's value at calc time. Per memory, intent-executor.ts is the sole authority (HF-188); legacy engine is concordance shadow.

**Operation:** read-only file inspection.

```bash
# Locate the intent executor
find web/src -name "intent-executor*" -type f 2>/dev/null
find web/src -name "scalar*multiply*" -type f -o -name "*scalar*" 2>/dev/null
grep -rln "scalar_multiply" web/src/lib --include="*.ts" 2>/dev/null
```

**Capture in output:**
- File path of intent-executor.ts (and any scalar_multiply-specific module)
- The full function or method that handles `scalar_multiply` calc type — paste verbatim with line numbers
- The full function or method that resolves component inputs for scalar_multiply — paste verbatim with line numbers
- Any rate/multiplier extraction logic — paste verbatim
- Any unit-conversion, percentage-to-ratio, or scaling logic in the scalar_multiply path — paste verbatim
- If multiple scalar_multiply implementations exist, paste all of them and label by file path

**Do not interpret.** Do not say "this looks like a unit-contract bug." Just paste the code.

---

## Surface 3 — Convergence binding construction for hub_utilization_rate_capped

**Why:** the calc logs show `existingKey=hub_utilization_rate_capped preserved=convergence` on every c4 entity. Two metric derivations exist for this key; the merge guard preserves the convergence-path one. This surface establishes how that convergence-path metric_derivation gets constructed.

**Operation:** read-only file inspection.

```bash
grep -rln "hub_utilization_rate_capped" web/src --include="*.ts" 2>/dev/null
grep -rln "convergence_bindings" web/src/lib --include="*.ts" 2>/dev/null
grep -rln "metric_derivations" web/src/lib --include="*.ts" 2>/dev/null
grep -rln "ob118" web/src --include="*.ts" -i 2>/dev/null
```

**Capture in output:**
- File path(s) where `hub_utilization_rate_capped` appears as a literal — paste each occurrence with surrounding 30 lines of context
- File path(s) where convergence_bindings are constructed — paste the construction function verbatim with line numbers
- File path(s) where metric_derivations are constructed — paste the construction function verbatim with line numbers
- The OB-118 merge guard logic — paste the function verbatim with line numbers
- Specifically: how does the merge guard decide between two competing metric derivations for the same key? Paste the decision logic verbatim.

**Do not interpret.** Do not say "this preserves convergence over X." Just paste the code.

---

## Surface 4 — c4 component value computation trace (live data)

**Why:** establish exactly what numbers flow into c4's calc for one specific entity, end-to-end.

**Operation:** read-only Supabase query against committed_data and calculation_results.

Use entity 70010 (Antonio López Hernández, variant_0/Senior, January 2025) as the trace target — the calc batch is `dcba5168-f67b-49a2-8e48-b3f3f292677e`, period `92abe950-d50c-44fb-8436-a88e3697a612`.

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 4a. Find entity 70010's UUID
const { data: ent } = await sb
  .from('entities')
  .select('id, external_id, display_name, metadata')
  .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
  .eq('external_id', '70010')
  .single();
console.log('=== 4a ENTITY ==='); console.log(JSON.stringify(ent, null, 2));

// 4b. Committed_data rows for that entity
const { data: cd } = await sb
  .from('committed_data')
  .select('id, data_type, row_data, period_id, source_date, metadata')
  .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
  .eq('entity_id', ent.id);
console.log('=== 4b COMMITTED_DATA ==='); console.log(JSON.stringify(cd, null, 2));

// 4c. Hub-level reference rows (Datos_Flota_Hub) — period-agnostic
const { data: hub } = await sb
  .from('committed_data')
  .select('id, data_type, row_data, source_date')
  .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
  .is('entity_id', null);
console.log('=== 4c HUB REFERENCE ==='); console.log(JSON.stringify(hub, null, 2));

// 4d. Calculation result for entity 70010 in batch dcba5168-f67b-49a2-8e48-b3f3f292677e
const { data: res } = await sb
  .from('calculation_results')
  .select('id, total_payout, components, metrics, attainment, metadata')
  .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
  .eq('batch_id', 'dcba5168-f67b-49a2-8e48-b3f3f292677e')
  .eq('entity_id', ent.id)
  .single();
console.log('=== 4d CALCULATION_RESULT ==='); console.log(JSON.stringify(res, null, 2));

// 4e. Calculation traces for that result (component-level breakdown)
if (res) {
  const { data: tr } = await sb
    .from('calculation_traces')
    .select('component_name, formula, inputs, output, steps')
    .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
    .eq('result_id', res.id);
  console.log('=== 4e CALCULATION_TRACES ==='); console.log(JSON.stringify(tr, null, 2));
}
"
```

**Capture in output:**
- Entity 70010 record (id, external_id, display_name, metadata) — verbatim
- All committed_data rows for entity 70010 — verbatim
- All hub-level reference rows (entity_id IS NULL) — verbatim, including row_data showing what columns exist and what values
- The calculation_result for entity 70010 in this batch — verbatim, full components JSONB
- All calculation_traces for that result — verbatim, especially the c4 (component_index 4 / Fleet Utilization) trace showing inputs, formula, output, steps

**Do not interpret.** Do not flag values as "too large" or "expected." Just paste.

---

## Output file specification

**Path:** `docs/completion-reports/DIAG-035_c4_Fleet_Utilization_Magnitude_Probe.md`

**Required structure:**

```markdown
# DIAG-035 — c4 Fleet Utilization Magnitude Probe (Phase 0 Read-Only)

**Date:** [ISO timestamp at execution]
**Branch:** diag-019-c4-magnitude-probe
**Commit:** [SHA at probe start]
**Tenant:** Meridian Logistics Group (5035b1e8-0754-4527-b7ec-9f93f85e4c79)
**Rule set:** 3d629051-f788-44f6-a546-45876dd187b1 (Meridian Logistics Group Incentive Plan 2025)
**Reference batch:** dcba5168-f67b-49a2-8e48-b3f3f292677e (January 2025, run 1)
**Reference entity:** 70010 — Antonio López Hernández — variant_0 (Senior)

---

## Section 1 — Surface 1: Rule set component definition

### 1.1 Full components JSONB
[verbatim JSON]

### 1.2 Full input_bindings JSONB
[verbatim JSON]

### 1.3 c4 component (variant 0 — Senior)
[isolated JSON object]

### 1.4 c4 component (variant 1 — Standard)
[isolated JSON object]

### 1.5 c4 convergence binding
[isolated JSON object from input_bindings.convergence_bindings]

### 1.6 c4 metric derivations
[isolated entries from input_bindings.metric_derivations]

---

## Section 2 — Surface 2: Intent executor c4 / scalar_multiply path

### 2.1 File inventory
[grep/find results]

### 2.2 scalar_multiply evaluation function — full source
**File:** [path]
**Lines:** [start–end]

```typescript
[verbatim code]
```

### 2.3 Component input resolution function — full source
[path, lines, code]

### 2.4 Rate/multiplier extraction — full source
[path, lines, code]

### 2.5 Unit-conversion or scaling logic (if present)
[path, lines, code OR "no such logic found in scalar_multiply path"]

---

## Section 3 — Surface 3: Convergence binding construction

### 3.1 hub_utilization_rate_capped occurrences
[for each: file, lines, ~30 line context block, verbatim]

### 3.2 convergence_bindings construction — full source
[path, lines, code]

### 3.3 metric_derivations construction — full source
[path, lines, code]

### 3.4 OB-118 merge guard — full source
[path, lines, code]

### 3.5 Merge-guard decision logic (which derivation wins, and why)
[path, lines, code — the specific decision branch]

---

## Section 4 — Surface 4: Live data trace for entity 70010

### 4a Entity record
[verbatim JSON]

### 4b committed_data rows for entity
[verbatim JSON, all rows]

### 4c Hub reference rows (entity_id IS NULL)
[verbatim JSON, all rows]

### 4d calculation_result for entity 70010 in reference batch
[verbatim JSON, full components breakdown]

### 4e calculation_traces for c4 component
[verbatim JSON — formula, inputs, output, steps]

---

## Section 5 — Surface read-back inventory

| Surface | Read | Findings captured | Notes |
|---|---|---|---|
| 1: Rule set | [yes/no] | [yes/no] | [empty or "surface unreadable: <reason>"] |
| 2: Intent executor | [yes/no] | [yes/no] | |
| 3: Convergence binding | [yes/no] | [yes/no] | |
| 4: Live data trace | [yes/no] | [yes/no] | |

---

## Section 6 — Read-only execution log

[Paste full terminal output of all queries and grep operations executed during this probe, in order, with timestamps. No editorialization.]
```

---

## Closing checklist (CC verifies before final commit)

Before committing the `.md` file and pushing the branch, CC verifies:

1. ☐ The `.md` file is at `docs/completion-reports/DIAG-035_c4_Fleet_Utilization_Magnitude_Probe.md`
2. ☐ All four surfaces have a section, even if a surface returned "unreadable"
3. ☐ Every section contains either verbatim code paste, verbatim JSON paste, or an explicit "no such surface found" statement — no paraphrase, no summary
4. ☐ No PASS/FAIL claims appear in the document
5. ☐ No reconciliation statements appear (no "this is correct/incorrect," no "expected vs actual")
6. ☐ No fix proposals appear
7. ☐ Section 6 contains the full execution log, unedited
8. ☐ No source files outside `docs/completion-reports/` were modified

CC then:
- `git add docs/completion-reports/DIAG-035_c4_Fleet_Utilization_Magnitude_Probe.md`
- `git commit -m "DIAG-035: c4 Fleet Utilization magnitude Phase 0 read-only probe"`
- `git push -u origin diag-019-c4-magnitude-probe`
- `gh pr create --base main --head diag-019-c4-magnitude-probe --title "DIAG-035 Phase 0: c4 magnitude read-only probe" --body "Read-only probe per HF-214 Phase 0. No code changes. Output: docs/completion-reports/DIAG-035_c4_Fleet_Utilization_Magnitude_Probe.md"`

End of directive.
