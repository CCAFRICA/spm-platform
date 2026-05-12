# DIAG-037 — Comprehension Signal Write Failure (Phase 0 Read-Only)

**Status:** ACTIVE
**Type:** Diagnostic, read-only (Phase 0)
**Scope:** Empirical interrogation of the post-HF-193 `comprehension:plan_interpretation` signal write path. Establish: (a) the exact write payload shape constructed at calc-time, (b) the live schema constraints on `classification_signals`, (c) the row-level mismatch that produces "numeric field overflow," (d) whether the failure is structural or content-dependent.
**Repository:** `CCAFRICA/spm-platform`
**Branch:** create new branch `diag-037-comprehension-signal-write-probe` from `main`
**Output:** Single `.md` file at `docs/completion-reports/DIAG-037_COMPLETION_REPORT_Comprehension_Signal_Write_Failure.md`
**Forbidden:** any behavioral change, fix, migration, schema modification, or commit to existing files outside `docs/completion-reports/`.

---

## Standing Rules (apply throughout)

This directive operates under **CC Standing Architecture Rules v2.1+**.

- **Rule 1 (Korean Test):** structural inspection only. No language-specific string literals in any analysis.
- **Rule 2 (Scale by Design):** observations apply at the structural class layer.
- **Rule 24 (SR-34: No Bypass):** no workarounds, no reduced-scope tests. If a probe surface is unreadable, surface that fact.
- **Rule 26 (SR-42: Locked-Rule Halt):** if any locked decision dictates a different action mid-probe, halt verbatim.
- **Evidence gates:** every claim in the output `.md` must include verbatim code excerpts (file path + line range), pasted query results, or pasted log lines. No PASS/FAIL self-attestation. No paraphrasing.
- **No reconciliation:** report what the code does and what the data shows. Architect performs reconciliation in architect-channel.
- **No fix prediction:** do not say "this is the bug" or propose a remediation. Just paste structure and data.

---

## Phase 0 mandate

Read six surfaces. Capture verbatim code, verbatim schema, verbatim payload data. Produce one structured `.md` file with "COMPLETION REPORT" in the H1 title.

If a surface is unreadable, missing, or surfaces an unexpected structure, document that fact in the output and continue. Do not halt the entire probe on a single missing surface.

---

## Surface 1 — `plan-comprehension-emitter.ts` full source

**Why:** DIAG-036 §5.1 named this file as the writer site (persistSignalBatch at line 111). The directive needs the FULL writer to understand payload construction, not just the call line.

**Operation:** read-only file inspection.

```bash
echo "=== Locate file and confirm line count ==="
ls -la web/src/lib/compensation/plan-comprehension-emitter.ts
wc -l web/src/lib/compensation/plan-comprehension-emitter.ts

echo "=== Top-level structure ==="
grep -n "^export\|^function\|^async function\|^const\|^class" web/src/lib/compensation/plan-comprehension-emitter.ts

echo "=== Signal type literal occurrences ==="
grep -n "comprehension:plan_interpretation\|signal_type" web/src/lib/compensation/plan-comprehension-emitter.ts

echo "=== persistSignalBatch call context ==="
grep -n "persistSignalBatch\|persistSignal" web/src/lib/compensation/plan-comprehension-emitter.ts
```

**Capture in output:**
- Full file source — verbatim with line numbers (file is small per directory listing — paste in entirety)
- Specifically isolate and label the function that constructs the signal payload object (the object being passed to `persistSignalBatch`)
- Specifically isolate and label every field/key being assigned to that payload object
- Specifically isolate the `signal_type`, `signal_value`, `confidence`, `metric_name`, `component_index`, `rule_set_id` field assignments — these correspond to columns on `classification_signals` (per DIAG-036 schema dump)

**Do not interpret. Just paste.**

---

## Surface 2 — `signal-persistence.ts` (`persistSignalBatch` and `persistSignal`)

**Why:** the emitter calls `persistSignalBatch`. We need the function the emitter delegates to, to see if the payload is transformed/projected before the database insert, and which columns the SQL INSERT targets.

**Operation:** read-only file inspection.

```bash
echo "=== Locate file and confirm line count ==="
ls -la web/src/lib/ai/signal-persistence.ts
wc -l web/src/lib/ai/signal-persistence.ts

echo "=== Function exports ==="
grep -n "^export\|^function\|^async function" web/src/lib/ai/signal-persistence.ts

echo "=== Insert/upsert call sites ==="
grep -n "\.insert\|\.upsert\|from('classification_signals')" web/src/lib/ai/signal-persistence.ts

echo "=== Numeric coercion sites ==="
grep -n "Number(\|parseFloat\|parseInt\|toNumber\|toFixed\|\.toFixed\|Math\." web/src/lib/ai/signal-persistence.ts
```

**Capture in output:**
- Full source of `persistSignal` (referenced in DIAG-036 as 13 call sites generic writer) — verbatim with line numbers
- Full source of `persistSignalBatch` — verbatim with line numbers
- The exact `.from('classification_signals').insert(...)` invocation with the payload-construction object — verbatim with surrounding 30 lines
- Any numeric coercion, rounding, or transform applied to payload values before insert — paste verbatim
- Any try/catch error handling that translates Postgres errors — paste verbatim

**Do not interpret. Just paste.**

---

## Surface 3 — Live schema constraints on `classification_signals` numeric columns

**Why:** "numeric field overflow" is a Postgres error indicating a value exceeds the precision/scale defined on a `numeric(p, s)` column. The 2026-05-07 schema dump shows `classification_signals.confidence` as `numeric` with no precision/scale visible from `information_schema.columns`. The actual constraint lives in `pg_attribute` typmod. We need that.

**Operation:** read-only Supabase query via service role.

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use a raw SQL query for column type details (information_schema.columns is the standard surface)
const { data, error } = await sb.rpc('exec_sql', {
  query: \`
    SELECT
      column_name,
      data_type,
      numeric_precision,
      numeric_scale,
      character_maximum_length,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'classification_signals'
    ORDER BY ordinal_position;
  \`
});
if (error) { console.error('exec_sql may not exist; falling back...'); console.error(JSON.stringify(error, null, 2)); }
else { console.log('=== 3a CLASSIFICATION_SIGNALS COLUMN CONSTRAINTS ==='); console.log(JSON.stringify(data, null, 2)); }
"
```

**If `exec_sql` RPC does not exist**, CC notes that fact in the output and uses the standard schema query path:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fall back to information_schema query — Supabase exposes this via Postgrest REST
const { data, error } = await sb
  .from('information_schema.columns' as any)
  .select('column_name, data_type, numeric_precision, numeric_scale, character_maximum_length, is_nullable, column_default')
  .eq('table_schema', 'public')
  .eq('table_name', 'classification_signals');

if (error) { console.error('Postgrest schema query failed:', JSON.stringify(error, null, 2)); }
else { console.log('=== 3a CLASSIFICATION_SIGNALS COLUMN CONSTRAINTS (information_schema) ==='); console.log(JSON.stringify(data, null, 2)); }
"
```

**Architect-channel fallback if both query paths fail:** CC documents the failure and notes "schema column-precision query unavailable via service-role RPC. Architect must run query directly in Supabase SQL Editor and paste output." Halt this surface only — continue to Surface 4.

**Capture in output:**
- The query that succeeded (or the fact that no programmatic query path worked)
- The full result row for EVERY column on `classification_signals` — column_name, data_type, numeric_precision, numeric_scale, character_maximum_length, is_nullable, column_default
- Specifically isolate any column where data_type = `numeric` with a defined precision and scale

**Do not interpret. Just paste.**

---

## Surface 4 — Sample existing `classification_signals` rows (any signal_type)

**Why:** establish what column values look like in practice — particularly for the `confidence`, `signal_value`, and any other numeric-typed columns. This anchors the abstract precision/scale to actual values being persisted successfully.

**Operation:** read-only Supabase query.

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 4a. Distinct signal_types persisted across all tenants (helps surface what writes succeed today)
const { data: types } = await sb
  .from('classification_signals')
  .select('signal_type')
  .limit(5000);
const typeCounts: Record<string, number> = {};
for (const r of types ?? []) {
  typeCounts[r.signal_type] = (typeCounts[r.signal_type] ?? 0) + 1;
}
console.log('=== 4a SIGNAL_TYPE distribution (top 5000 rows) ===');
console.log(JSON.stringify(typeCounts, null, 2));

// 4b. Sample 5 rows per most-populated signal_type — full payload
const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
console.log('=== 4b TOP 5 SIGNAL_TYPES ===');
console.log(topTypes);
for (const st of topTypes) {
  const { data: rows } = await sb
    .from('classification_signals')
    .select('*')
    .eq('signal_type', st)
    .limit(3);
  console.log(\`=== 4b SAMPLE rows for signal_type='\${st}' ===\`);
  console.log(JSON.stringify(rows, null, 2));
}

// 4c. Specifically: any 'comprehension:plan_interpretation' rows ANYWHERE (across all tenants)
const { data: compRows, count: compCount } = await sb
  .from('classification_signals')
  .select('*', { count: 'exact' })
  .eq('signal_type', 'comprehension:plan_interpretation')
  .limit(5);
console.log(\`=== 4c comprehension:plan_interpretation rows: count=\${compCount} ===\`);
console.log(JSON.stringify(compRows, null, 2));
"
```

**Capture in output:**
- 4a: Full distribution of `signal_type` values in classification_signals (count per type)
- 4b: Sample of 3 full rows for each of the top 5 most-populated `signal_type` values — verbatim
- 4c: Total count and sample rows of `comprehension:plan_interpretation` ACROSS ALL TENANTS (not just Meridian) — establishes whether ANY tenant has successfully persisted these signals
- Specifically: examine the `confidence`, `signal_value`, `metric_name`, `component_index`, `rule_set_id` columns in successful sample rows

**Do not interpret. Just paste.**

---

## Surface 5 — Reproduce the payload that fails

**Why:** the import log shows `Batch failed: numeric field overflow | count: 10`. Ten signals attempted to write at once. Reproduce the payload construction *without* invoking persistSignalBatch — read the payloads CC's writer would have built for the Meridian plan, then inspect each numeric value against the schema precision/scale from Surface 3.

**Operation:** read-only — re-invoke the bridge and emitter logic in a code probe that captures the payloads in-memory rather than persisting them. CC may need to construct a minimal harness file (in `docs/completion-reports/` ONLY — no production code touched).

If reconstruction is too invasive, the alternate path is: read `processing_jobs.classification_result` for the most recent Meridian import (which contains the AI plan interpretation that the emitter would have consumed), and trace which fields in that result feed which columns in the would-be signal payload. This requires reading Surface 1 (the emitter) carefully to know the field mapping.

**Operation A — re-invoke the bridge logic in a read-only harness:**

```bash
npx tsx <<'EOF'
// Read-only payload reconstruction — does NOT persist.
// Goal: produce the EXACT payload object plan-comprehension-emitter would have built
// for Meridian's most recent import, then inspect each numeric value.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Find the most recent processing_job for Meridian
const { data: jobs } = await sb
  .from('processing_jobs')
  .select('id, file_name, classification_result, proposal, created_at')
  .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
  .order('created_at', { ascending: false })
  .limit(3);

console.log('=== 5a Most recent Meridian processing_jobs (3) ===');
for (const j of jobs ?? []) {
  console.log({
    id: j.id,
    file_name: j.file_name,
    has_classification_result: !!j.classification_result,
    has_proposal: !!j.proposal,
    classification_result_keys: j.classification_result ? Object.keys(j.classification_result) : null,
    created_at: j.created_at,
  });
}

// 5b. Most recent Meridian import_batch with content unit hash (post-HF-213)
const { data: batches } = await sb
  .from('import_batches')
  .select('id, file_name, content_unit_hash_sha256, file_hash_sha256, metadata, created_at, status')
  .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
  .order('created_at', { ascending: false })
  .limit(5);
console.log('=== 5b Most recent Meridian import_batches (5) ===');
console.log(JSON.stringify(batches, null, 2));

// 5c. The Meridian rule_set's components — these are what the emitter would have iterated to build signals
const { data: rs } = await sb
  .from('rule_sets')
  .select('id, name, components')
  .eq('id', '3d629051-f788-44f6-a546-45876dd187b1')
  .single();
console.log('=== 5c Meridian rule_set component count by variant ===');
const variants = (rs as any)?.components?.variants ?? [];
for (const v of variants) {
  console.log({ variantId: v.variantId, componentCount: v.components?.length });
}
console.log('=== 5c Total variant×component count (would be signal-emit count) ===');
const totalSignals = variants.reduce((sum: number, v: any) => sum + (v.components?.length ?? 0), 0);
console.log({ totalSignals });
EOF
```

**Operation B — inspect the AI plan interpretation that fed the emitter:**

```bash
# Continuation of the harness above — extract the AI's "metricSemantics" or equivalent field
# that the emitter consumes. This requires Surface 1 to have established the field name.
# CC inspects Surface 1 first to know which key to query in classification_result/proposal.
echo "(Surface 5 continuation — CC fills in based on field name discovered in Surface 1)"
```

**Capture in output:**
- 5a: Most recent processing_jobs for Meridian — id, file_name, keys present in classification_result and proposal, created_at
- 5b: Most recent 5 import_batches for Meridian — full record verbatim
- 5c: Meridian rule_set variant×component count (this should match the "count: 10" from the failure log if 5 components × 2 variants)
- 5d (CC adds based on Surface 1 findings): the AI plan interpretation field that the emitter consumes — paste 1-3 sample entries verbatim, especially any numeric values
- 5e (CC adds): for each numeric value found in 5d, compare against Surface 3 schema constraints — does it fit within numeric_precision and numeric_scale? Tabular form:

| Field | Sample value | Target column | Column data_type | numeric_precision | numeric_scale | Fits? (yes/no/n/a) |
|---|---|---|---|---|---|---|

  Status options: `yes`, `no`, `n/a`. Do not classify as "the bug" — just report the fit.

**Do not interpret. Just paste.**

---

## Surface 6 — Other writers of `comprehension:plan_interpretation`

**Why:** DIAG-036 §5.1 named plan-comprehension-emitter.ts:111 as a writer. Before concluding it's the only one, verify across the codebase. If other writers exist, they may succeed or fail with different patterns.

**Operation:** read-only grep.

```bash
echo "=== All writers of signal_type='comprehension:plan_interpretation' ==="
grep -rn "comprehension:plan_interpretation" web/src --include="*.ts"

echo "=== persistSignal/persistSignalBatch invocation matrix ==="
grep -rln "persistSignal\b" web/src --include="*.ts"
grep -rln "persistSignalBatch" web/src --include="*.ts"

echo "=== For each persistSignal/persistSignalBatch call site, capture surrounding context ==="
# CC iterates the matches above and captures 25 lines around each call site.
# Specifically: identify which signal_type each caller is writing.
```

**Capture in output:**
- Every file that contains the literal string `'comprehension:plan_interpretation'` (or `\"comprehension:plan_interpretation\"`) — paste line + 10 lines context
- Every `persistSignal` and `persistSignalBatch` call site — file, line, 25 lines context, AND the `signal_type` value being passed (verbatim from the call)
- Tabular summary:

| Caller file | Line | Function name | signal_type value | Notes |
|---|---|---|---|---|

**Do not interpret. Just paste.**

---

## Output file specification

**Path:** `docs/completion-reports/DIAG-037_COMPLETION_REPORT_Comprehension_Signal_Write_Failure.md`

**Required structure:**

```markdown
# DIAG-037 COMPLETION REPORT — Comprehension Signal Write Failure (Phase 0 Read-Only)

**Date:** [ISO timestamp at execution]
**Branch:** diag-037-comprehension-signal-write-probe
**Commit:** [SHA at probe start]
**Tenant:** Meridian Logistics Group (5035b1e8-0754-4527-b7ec-9f93f85e4c79)
**Rule set:** 3d629051-f788-44f6-a546-45876dd187b1
**Predecessor probes:** DIAG-035 (PR #377), DIAG-036 (PR #378)
**Trigger evidence (architect-channel context only):** Vercel runtime log at 2026-05-08 04:00:51.870 — `[SignalPersistence] Batch failed: numeric field overflow | count: 10 | tenant: 5035b1e8-...`

---

## Section 1 — Surface 1: plan-comprehension-emitter.ts full source

### 1.1 File location and structure
[ls/wc output, grep top-level structure]

### 1.2 Full file source
**File:** web/src/lib/compensation/plan-comprehension-emitter.ts
**Lines:** [1–EOF]

```typescript
[verbatim]
```

### 1.3 Payload-constructing function (isolated)
[function name, line range, verbatim]

### 1.4 Payload field assignments
[for each field assigned to the signal payload object: source line, target column-name, value-construction expression — verbatim]

---

## Section 2 — Surface 2: signal-persistence.ts (persistSignal + persistSignalBatch)

### 2.1 File location and structure
[ls/wc output, grep exports]

### 2.2 persistSignal — full source
**File:** web/src/lib/ai/signal-persistence.ts
**Lines:** [start–end]

```typescript
[verbatim]
```

### 2.3 persistSignalBatch — full source
**File:** web/src/lib/ai/signal-persistence.ts
**Lines:** [start–end]

```typescript
[verbatim]
```

### 2.4 Insert call site with payload object
[verbatim, with surrounding 30 lines]

### 2.5 Numeric coercion / transform sites
[per occurrence: line, code, OR "no coercion in this file"]

### 2.6 Error handling for Postgres errors
[verbatim, OR "no Postgres-specific error handling found"]

---

## Section 3 — Surface 3: classification_signals schema constraints

### 3.1 Query method used
[which query path succeeded: exec_sql RPC / Postgrest information_schema / architect-channel fallback]

### 3.2 Full column inventory
| column_name | data_type | numeric_precision | numeric_scale | character_maximum_length | is_nullable | column_default |
|---|---|---|---|---|---|---|

### 3.3 Numeric columns specifically
[isolated rows where data_type = 'numeric' with precision and scale defined]

---

## Section 4 — Surface 4: Sample existing classification_signals rows

### 4.1 Signal type distribution
[count per signal_type, verbatim JSON]

### 4.2 Sample rows per top signal_type
[for each: 3 full rows verbatim]

### 4.3 comprehension:plan_interpretation rows (across all tenants)
[count, sample rows OR "zero rows found across all tenants"]

---

## Section 5 — Surface 5: Payload reconstruction

### 5.1 Most recent Meridian processing_jobs
[verbatim, 3 jobs]

### 5.2 Most recent Meridian import_batches
[verbatim, 5 batches]

### 5.3 Meridian rule_set variant×component count
[count breakdown — should match the "count: 10" failure-log signal from architect context]

### 5.4 AI plan interpretation field consumed by emitter
[field name from Surface 1 findings, sample entries verbatim]

### 5.5 Numeric value vs schema fit table
| Field | Sample value | Target column | Column data_type | numeric_precision | numeric_scale | Fits? |
|---|---|---|---|---|---|---|

---

## Section 6 — Surface 6: Other writers of comprehension:plan_interpretation

### 6.1 Literal string occurrences
[file:line + 10-line context for each]

### 6.2 persistSignal/persistSignalBatch call inventory
[every call site — file:line, 25-line context, signal_type value]

### 6.3 Tabular summary
| Caller file | Line | Function name | signal_type value | Notes |
|---|---|---|---|---|

---

## Section 7 — Surface read-back inventory

| Surface | Read | Findings captured | Notes |
|---|---|---|---|
| 1: plan-comprehension-emitter.ts | [yes/no] | [yes/no] | [empty or "surface unreadable: <reason>"] |
| 2: signal-persistence.ts | [yes/no] | [yes/no] | |
| 3: classification_signals schema constraints | [yes/no] | [yes/no] | |
| 4: Sample existing rows | [yes/no] | [yes/no] | |
| 5: Payload reconstruction | [yes/no] | [yes/no] | |
| 6: Other comprehension writers | [yes/no] | [yes/no] | |

---

## Section 8 — Read-only execution log

[Paste full terminal output of all queries and grep operations executed during this probe, in order, with timestamps. No editorialization.]
```

---

## Closing checklist (CC verifies before final commit)

Before committing the `.md` file and pushing the branch, CC verifies:

1. ☐ The `.md` file is at `docs/completion-reports/DIAG-037_COMPLETION_REPORT_Comprehension_Signal_Write_Failure.md`
2. ☐ "COMPLETION REPORT" appears in the H1 title of the document
3. ☐ All six surfaces have a section, even if a surface returned "unreadable" or "no matches"
4. ☐ Every section contains either verbatim code paste, verbatim JSON paste, or an explicit "no such surface found" / "not present" statement — no paraphrase, no summary
5. ☐ No PASS/FAIL claims appear in the document
6. ☐ No reconciliation statements appear (no "this is correct/incorrect," no "expected vs actual," no "this is the bug")
7. ☐ No fix proposals appear
8. ☐ Section 5.5 (numeric value vs schema fit table) is fully populated, even if "Fits?" is left as observation rather than judgment
9. ☐ Section 8 contains the full execution log, unedited
10. ☐ No source files outside `docs/completion-reports/` were modified

CC then:
- `git add docs/completion-reports/DIAG-037_COMPLETION_REPORT_Comprehension_Signal_Write_Failure.md`
- `git commit -m "DIAG-037: Comprehension signal write failure Phase 0 read-only probe"`
- `git push -u origin diag-037-comprehension-signal-write-probe`
- `gh pr create --base main --head diag-037-comprehension-signal-write-probe --title "DIAG-037 Phase 0: Comprehension signal write failure read-only probe" --body "Read-only probe per HF-214 carry-forward. Predecessors: DIAG-035 (PR #377), DIAG-036 (PR #378). No code changes. Output: docs/completion-reports/DIAG-037_COMPLETION_REPORT_Comprehension_Signal_Write_Failure.md"`

End of directive.
