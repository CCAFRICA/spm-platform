# DIAG-038 — Empirical Audit of HF-214 Phase 2 Impact and Ratio-by-100 Scaling Location

**Status:** ACTIVE
**Type:** Read-only diagnostic; zero code changes
**Repository:** `CCAFRICA/spm-platform`
**Branch policy:** create branch `diag-038-hf-214-phase2-audit` from `main` for the completion report file ONLY; no source modifications
**Predecessor probes:** DIAG-035 (PR #377), DIAG-036 (PR #378), DIAG-037 (PR #379)
**Predecessor instrumentation:** HF-214 Phase 1 (PR #380, commit 7ca17c4a)
**Predecessor behavioral change:** HF-214 Phase 2 (PR #381, commits 72571889 + b26ece05)

---

## Architect-channel context

HF-214 was opened to close the c4 (Fleet Utilization) magnitude defect: per-employee c4 producing $66,340-range values when ground truth indicates ~$663-range (a roughly 100x scaling error). The original DIAG-035 finding identified that the engine multiplies the ratio (e.g., 0.829) by 100 to produce a percentage value (82.9), then applies the rate (800), yielding 66,340 instead of 663.

HF-214 Phase 2 (PR #381) shipped a confidence-convention fix at three sites: AI prompt amendment, AI response normalization, writer-side defense-in-depth clamp on `classification_signals.confidence`.

Architect concern: HF-214 Phase 2 may have shipped a fix to a different defect than the one HF-214 was opened to address; per-entity calculation values may not have changed; the writer-side clamp may have altered foundational behavior with downstream consequences not yet visible.

This DIAG produces empirical evidence for architect disposition. CC produces evidence; CC does NOT produce recommendations or interpretations.

---

## Standing Rules (apply throughout)

- **Rule: Read-only.** Zero modifications to any file under `web/` or any other source path. Only the completion report file is created and committed.
- **Rule 24 (SR-34: No Bypass).** If any verification surface is blocked or returns ambiguous results, halt and surface to architect-channel. Do not work around.
- **Rule (Korean Test, T1-E910).** Grep patterns use structural value-range or schema-name vocabulary, not domain-specific literals.
- **Rule: Verbatim evidence.** Every claim in the completion report is supported by pasted command output, source code excerpt with line numbers, or SQL result. No narrative claims. No interpretation.
- **Rule: Halt on threshold conditions** (enumerated below).

### Halt conditions

CC halts and surfaces to architect-channel BEFORE proceeding to subsequent phases if any of the following:

1. Phase 2 commits 72571889 and b26ece05 are not present on main, or contain content different from the HF-214 Phase 2 completion report
2. The three Phase 2 modifications (B1 prompt, B2 normalizer, A clamp) are not present in the live source files
3. Any reader of `classification_signals.confidence` treats the value 0.9999 differently than 1.0
4. The ratio-by-100 scaling identified in DIAG-035 is in a code path that PR #381 modified
5. Per-entity calculation values are bit-for-bit identical between pre-Phase-2 and post-Phase-2 calculation runs (suggesting Phase 2 did not affect the calculation surface)
6. Per-entity calculation values changed in any direction Phase 2 did not anticipate (e.g., c0/c1/c2/c3 values shifted, not just c4)

---

## Phase 1 — Verify Phase 2 commits exist on main

### Step 1.1 — Confirm commits on main

```bash
cd /path/to/spm-platform
git fetch origin
git log origin/main --oneline | head -20
git show --stat 72571889 2>&1 | head -50
git show --stat b26ece05 2>&1 | head -50
```

Capture verbatim output. The first 20 lines of `git log` must show 72571889 and b26ece05 in chronological order. If either commit is absent on main, halt.

### Step 1.2 — Confirm files modified by each commit

```bash
git show --name-status 72571889
git show --name-status b26ece05
```

Capture verbatim. Expected per HF-214 Phase 2 completion report:
- 72571889: `web/src/lib/ai/providers/anthropic-adapter.ts`, `web/src/lib/compensation/ai-plan-interpreter.ts`, `web/src/lib/ai/signal-persistence.ts`, completion report
- b26ece05: completion report Section 6 update only

If any unexpected file appears in either commit, halt.

### Step 1.3 — Capture full diff

```bash
git diff 7ca17c4a..b26ece05 -- web/src/lib/ai/providers/anthropic-adapter.ts
git diff 7ca17c4a..b26ece05 -- web/src/lib/compensation/ai-plan-interpreter.ts
git diff 7ca17c4a..b26ece05 -- web/src/lib/ai/signal-persistence.ts
```

Capture verbatim diffs. (`7ca17c4a` is the HF-214 Phase 1 merge commit; this captures everything Phase 2 added on top of Phase 1.) These three diffs are the source of truth for what Phase 2 actually changed.

---

## Phase 2 — Read live source files and verify Phase 2 modifications are present

### Step 2.1 — anthropic-adapter.ts (B1 prompt amendment site)

```bash
cd /path/to/spm-platform
wc -l web/src/lib/ai/providers/anthropic-adapter.ts
sed -n '400,420p' web/src/lib/ai/providers/anthropic-adapter.ts
```

Capture verbatim. Per the completion report, the (0-100) clause at line 408 was amended to specify decimal probability ratio [0.0, 1.0]. Confirm the current line 408 (or wherever the amended clause now lives) contains the decimal-ratio language. Capture the exact text.

```bash
grep -n "0-100\|0\.0.*1\.0\|decimal.*ratio\|integer.*percent\|confidence" web/src/lib/ai/providers/anthropic-adapter.ts
```

Capture verbatim. List every line in this file that mentions confidence-format vocabulary. If any other site in the template still mandates (0-100) for confidence, halt.

### Step 2.2 — ai-plan-interpreter.ts (B2 normalizer site)

```bash
wc -l web/src/lib/compensation/ai-plan-interpreter.ts
sed -n '200,260p' web/src/lib/compensation/ai-plan-interpreter.ts
```

Capture verbatim. Per the completion report, a private `normalizeConfidence` method was added; values >1 are rescaled by /100, values <0 clamp to 0; applied at top-level (line 213) and per-component (line 246).

```bash
grep -n "normalizeConfidence\|\.confidence\|Number(.*confidence)\|conf.*\/.*100\|/100" web/src/lib/compensation/ai-plan-interpreter.ts
```

Capture verbatim. Confirm normalizeConfidence is defined and called at exactly the sites the completion report claims. Confirm no other normalization site exists. Confirm no domain-specific or language-specific literals.

### Step 2.3 — signal-persistence.ts (A writer clamp site + Phase 1 instrumentation preservation)

```bash
wc -l web/src/lib/ai/signal-persistence.ts
sed -n '1,200p' web/src/lib/ai/signal-persistence.ts
```

Capture verbatim. Read the full file body up to line 200 to surface ALL clamp logic and ALL catch-block instrumentation in their actual current form.

```bash
grep -n "0\.9999\|Math\.min\|Math\.max\|clamp\|persistSignal\|persistSignalBatch\|catch" web/src/lib/ai/signal-persistence.ts
```

Capture verbatim. Required confirmations:
- Phase 1 catch-block instrumentation (HF-214 Phase 1, PR #380) is preserved byte-identical
- Clamp logic exists in both `persistSignal` and `persistSignalBatch`
- Clamp uses structural value-range vocabulary; no schema-precision string references like "5,4" appear in clamp code
- Clamp fires before the database insert call, not after

If clamp logic is absent from either function, halt. If Phase 1 instrumentation has been altered, halt.

---

## Phase 3 — Audit every consumer of classification_signals.confidence

### Step 3.1 — Find every code site that reads `confidence` from classification_signals

```bash
cd /path/to/spm-platform
grep -rn "classification_signals" web/src/ --include="*.ts" --include="*.tsx"
```

Capture verbatim. Every result is a candidate reader. Filter to sites that read (not just write) the `confidence` column.

```bash
grep -rn "\.confidence\|confidence:" web/src/ --include="*.ts" --include="*.tsx" | head -200
```

Capture verbatim. This surfaces all `.confidence` accesses across the codebase.

### Step 3.2 — Per-reader behavioral audit

For each reader of `classification_signals.confidence` identified in Step 3.1, paste the function name, file path, line range, and verbatim source code. Report whether the function:

- Treats `confidence === 1.0` as a special signal (e.g., "fully certain", "exact match", "skip downstream")
- Treats `confidence < threshold` differently (and what threshold)
- Compares confidence values across signals (e.g., max, average, sort)
- Logs or surfaces confidence to the user
- Stores confidence in any derived state (e.g., copies into another column, uses as a key)

For each reader, evaluate: does the reader produce a different output for `confidence=0.9999` vs `confidence=1.0`?

If any reader does, that reader is broken by the writer-side clamp. Halt.

### Step 3.3 — Find every other code site that hardcodes 0.9999 or values in [0.99, 1.0)

```bash
grep -rn "0\.9999\|0\.999\b" web/src/ --include="*.ts" --include="*.tsx"
grep -rn "0\.99\b\|0\.995\|0\.998" web/src/ --include="*.ts" --include="*.tsx"
```

Capture verbatim. For each result, paste the surrounding 5 lines of source. The architect needs to know:

- Was 0.9999 used elsewhere with a different intent (e.g., as a threshold, ceiling, sentinel)?
- Did Phase 2's choice of 0.9999 collide with prior usage that has a different semantic?
- Was the value purposeful in another context, or was it a defect that hadn't surfaced yet?

CC enumerates without interpretation. The architect dispositions.

### Step 3.4 — Find every other code site that clamps or normalizes confidence-like values

```bash
grep -rn "Math\.min(Math\.max\|Math\.max(Math\.min" web/src/ --include="*.ts" --include="*.tsx"
grep -rn "if.*>.*1.*=.*\/.*100\|if.*<.*0.*=.*0" web/src/ --include="*.ts" --include="*.tsx"
```

Capture verbatim. For each result, paste the surrounding 10 lines. The architect needs to know:

- Are there other clamp sites that should be reconciled with Phase 2's clamp?
- Are there other normalizer sites that should be reconciled with B2?
- Is Phase 2's transformation symmetric with prior transformations or in conflict?

---

## Phase 4 — Database state confirmation

### Step 4.1 — Comprehension signal persistence

```sql
SELECT
  signal_type,
  count(*) AS row_count,
  min(confidence) AS min_conf,
  max(confidence) AS max_conf,
  avg(confidence)::numeric(6,4) AS avg_conf
FROM classification_signals
WHERE rule_set_id = 'cf64da66-017e-417b-932a-32bd763bf5d9'
GROUP BY signal_type
ORDER BY signal_type;
```

Capture verbatim output. Expected per HF-214 Phase 2 completion report Section 5:
- `comprehension:plan_interpretation` count = 10
- All confidence values in [0.0, 1.0) range

If count is not exactly 10, surface. If any confidence value is exactly 0.9999, that confirms the writer clamp fired on this signal_type (which would mean B1+B2 producer-side fix did NOT fully resolve the convention drift). If any confidence value > 0.9999, the clamp is not actually firing.

### Step 4.2 — All confidence values across all signal_types

```sql
SELECT
  signal_type,
  confidence,
  count(*) AS occurrences
FROM classification_signals
WHERE confidence IS NOT NULL
GROUP BY signal_type, confidence
ORDER BY signal_type, confidence DESC;
```

Capture verbatim. This surfaces:
- Whether 0.9999 appears as a confidence value (clamp firings)
- Whether any other writer is producing values that would have triggered the clamp pre-Phase-2
- Whether 1.0 appears as a confidence value (which would indicate a writer bypassing the clamp, or pre-Phase-2 historical data)

### Step 4.3 — Confidence value distribution

```sql
SELECT
  CASE
    WHEN confidence IS NULL THEN 'null'
    WHEN confidence = 0 THEN 'exact_0'
    WHEN confidence > 0 AND confidence < 0.5 THEN '0_to_0.5'
    WHEN confidence >= 0.5 AND confidence < 0.9 THEN '0.5_to_0.9'
    WHEN confidence >= 0.9 AND confidence < 0.9999 THEN '0.9_to_0.9999'
    WHEN confidence = 0.9999 THEN 'exact_0.9999_clamp'
    WHEN confidence > 0.9999 THEN 'over_0.9999'
    ELSE 'unexpected'
  END AS bucket,
  count(*) AS row_count
FROM classification_signals
GROUP BY bucket
ORDER BY bucket;
```

Capture verbatim. The "exact_0.9999_clamp" bucket count is the empirical clamp-fire count across the entire signal surface.

---

## Phase 5 — Per-entity calculation comparison (pre-Phase-2 vs post-Phase-2)

### Step 5.1 — Locate the two relevant calculation_runs

```sql
SELECT
  id,
  created_at,
  tenant_id,
  rule_set_id,
  period_id,
  status
FROM calculation_runs
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;
```

Capture verbatim. Identify the most recent calculation_run BEFORE PR #381 merged and the most recent calculation_run AFTER PR #381 merged. The HF-214 Phase 2 completion report timestamp is the cut line.

If two calculation_runs flanking the merge cannot be identified for the same tenant + rule_set_id + period_id, halt and surface to architect-channel.

### Step 5.2 — Per-entity comparison

For each entity in Meridian (tenant 5035b1e8), produce a comparative row:

```sql
WITH pre_phase2 AS (
  SELECT entity_id, total_payout, components
  FROM calculation_results
  WHERE calculation_run_id = '<pre-merge-run-id>'
),
post_phase2 AS (
  SELECT entity_id, total_payout, components
  FROM calculation_results
  WHERE calculation_run_id = '<post-merge-run-id>'
)
SELECT
  COALESCE(pre.entity_id, post.entity_id) AS entity_id,
  pre.total_payout AS pre_total,
  post.total_payout AS post_total,
  (post.total_payout - pre.total_payout) AS delta_total,
  pre.components->'c0'->>'payout' AS pre_c0,
  post.components->'c0'->>'payout' AS post_c0,
  pre.components->'c1'->>'payout' AS pre_c1,
  post.components->'c1'->>'payout' AS post_c1,
  pre.components->'c2'->>'payout' AS pre_c2,
  post.components->'c2'->>'payout' AS post_c2,
  pre.components->'c3'->>'payout' AS pre_c3,
  post.components->'c3'->>'payout' AS post_c3,
  pre.components->'c4'->>'payout' AS pre_c4,
  post.components->'c4'->>'payout' AS post_c4
FROM pre_phase2 pre
FULL OUTER JOIN post_phase2 post ON pre.entity_id = post.entity_id
ORDER BY entity_id;
```

(Adjust `components` JSONB path based on actual schema — use Phase 2 Step 2.3 grep to verify the live structure if needed.)

Capture verbatim output for ALL entities. Do not truncate.

### Step 5.3 — Aggregate comparison

```sql
SELECT
  '<pre-merge-run-id>' AS run_id,
  count(*) AS entity_count,
  sum(total_payout) AS grand_total,
  avg(total_payout)::numeric(10,2) AS avg_payout
FROM calculation_results
WHERE calculation_run_id = '<pre-merge-run-id>'
UNION ALL
SELECT
  '<post-merge-run-id>',
  count(*),
  sum(total_payout),
  avg(total_payout)::numeric(10,2)
FROM calculation_results
WHERE calculation_run_id = '<post-merge-run-id>';
```

Capture verbatim. The architect needs the grand totals side by side.

### Step 5.4 — Verdict on calculation surface

CC produces a single line of structured output (no interpretation):

- `delta_grand_total = <post> - <pre> = <number>`
- `entities_with_any_component_change = <count>`
- `entities_with_c0_change = <count>`
- `entities_with_c1_change = <count>`
- `entities_with_c2_change = <count>`
- `entities_with_c3_change = <count>`
- `entities_with_c4_change = <count>`

If `delta_grand_total = 0` and all `entities_with_*_change = 0`, this is empirical confirmation that HF-214 Phase 2 did not alter the calculation surface. CC reports this as a fact. CC does NOT interpret what it means.

---

## Phase 6 — Locate the ratio-by-100 scaling

### Step 6.1 — Find every site that multiplies a ratio-related value by 100

```bash
cd /path/to/spm-platform
grep -rn "\* 100\|\*100\b" web/src/ --include="*.ts" | grep -i "ratio\|numerator\|denominator\|fleet\|util" | head -50
grep -rn "\* 100\|\*100\b" web/src/lib/compensation/ --include="*.ts" | head -100
grep -rn "\* 100\|\*100\b" web/src/lib/calculation/ --include="*.ts" | head -100
```

Capture verbatim.

### Step 6.2 — Find every site related to scale_factor application

```bash
grep -rn "scale_factor\|scaleFactor\|applyScale" web/src/ --include="*.ts" | head -100
```

Capture verbatim. The DIAG-035 finding noted `scale_factor: 100` on the row binding for c0 and on the actual binding for c1, but no scale_factor on the c4 numerator/denominator. The current behavior may differ now that convergence chose a ratio binding for c4.

### Step 6.3 — Read intent-executor.ts and run-calculation.ts ratio handling

Per DIAG-036 §2.2 line ranges, the convergence-binding ratio resolution is at `route.ts:1201-1221` (numerator/denominator path). Per DIAG-036 §2.3, scalar_multiply intent execution is at `intent-executor.ts:299-310`.

```bash
sed -n '1180,1230p' web/src/app/api/calculations/route.ts
sed -n '290,320p' web/src/lib/compensation/intent-executor.ts
```

Capture verbatim. Confirm or refute:
- The ratio resolution path multiplies `numerator / denominator` and then applies `* 100` (the DIAG-035 finding)
- OR the ratio resolution path multiplies `numerator / denominator` only, and the `* 100` happens elsewhere

If the `* 100` is at `route.ts:1201-1221`, capture that line verbatim.
If the `* 100` is at `intent-executor.ts:299-310`, capture that line verbatim.
If the `* 100` is at neither location, search broader and capture wherever it is.

### Step 6.4 — Phase 2 commit overlap with ratio-handling code

```bash
git show 72571889 --name-only
git show b26ece05 --name-only
```

Confirm the modified files are EXACTLY:
- `web/src/lib/ai/providers/anthropic-adapter.ts`
- `web/src/lib/compensation/ai-plan-interpreter.ts`
- `web/src/lib/ai/signal-persistence.ts`
- `docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md`

The files containing the ratio-by-100 scaling (per Step 6.3) are:
- `web/src/app/api/calculations/route.ts` (per DIAG-036 line range)
- `web/src/lib/compensation/intent-executor.ts` (per DIAG-036 line range)

If neither route.ts nor intent-executor.ts appears in 72571889 or b26ece05, that is empirical confirmation that HF-214 Phase 2 did not modify the ratio-handling surface. CC reports this as a fact.

---

## Phase 7 — Completion report

CC writes `docs/completion-reports/DIAG-038_COMPLETION_REPORT_HF_214_Phase2_Audit.md`:

```markdown
# DIAG-038 COMPLETION REPORT — HF-214 Phase 2 Audit and Ratio-by-100 Scaling Location

**Date:** [ISO timestamp]
**Branch:** diag-038-hf-214-phase2-audit
**Type:** Read-only diagnostic; zero source modifications
**Predecessor:** HF-214 Phase 2 (PR #381)

---

## Section 1 — Phase 2 commit verification

### 1.1 Commits on main

[verbatim git log output]

### 1.2 Files modified per commit

[verbatim git show --name-status output]

### 1.3 Full diffs

[verbatim git diff output for all three source files]

### 1.4 Verdict

| Item | Status |
|---|---|
| Commit 72571889 present on main | [Y/N] |
| Commit b26ece05 present on main | [Y/N] |
| Files modified match completion report | [Y/N] |

---

## Section 2 — Live source file state

### 2.1 anthropic-adapter.ts

[verbatim sed output around lines 400-420]
[verbatim grep output for confidence-format vocabulary]

### 2.2 ai-plan-interpreter.ts

[verbatim sed output around lines 200-260]
[verbatim grep output for normalizeConfidence and confidence-handling sites]

### 2.3 signal-persistence.ts

[verbatim sed output for full file]
[verbatim grep output for clamp logic and Phase 1 instrumentation]

### 2.4 Verdict

| Item | Status |
|---|---|
| B1 (line 408 amendment) present | [Y/N] |
| B2 (normalizeConfidence) present | [Y/N] |
| A (writer clamp in persistSignal) present | [Y/N] |
| A (writer clamp in persistSignalBatch) present | [Y/N] |
| Phase 1 catch-block instrumentation byte-identical | [Y/N] |
| No domain-specific or language-specific literals | [Y/N] |

---

## Section 3 — Reader audit on classification_signals.confidence

### 3.1 All readers enumerated

| File | Line | Function | Operation on confidence |
|---|---|---|---|
| ... | ... | ... | ... |

### 3.2 Per-reader behavioral audit

For each reader:

**Reader: [function name]**
- File: [path]
- Lines: [range]
- Source code (verbatim):
  [paste]
- Behavioral analysis: [structured: special-cases 1.0? threshold-based? compares across signals? logs to user? stores derived?]
- Output for confidence=0.9999 vs confidence=1.0: [SAME / DIFFERENT]

### 3.3 Other 0.9999 / [0.99, 1.0) usages

| File | Line | Context | Apparent intent |
|---|---|---|---|
| ... | ... | ... | ... |

### 3.4 Other clamp/normalizer sites

| File | Line | Pattern | Apparent intent |
|---|---|---|---|
| ... | ... | ... | ... |

### 3.5 Verdict

| Item | Status |
|---|---|
| Total readers of confidence | [count] |
| Readers where 0.9999 output ≠ 1.0 output | [count] |
| Other 0.9999 hardcode sites | [count] |
| Other clamp/normalizer sites | [count] |

---

## Section 4 — Database state

### 4.1 Comprehension signal persistence

[verbatim SQL output]

### 4.2 All confidence values

[verbatim SQL output]

### 4.3 Confidence distribution

[verbatim SQL output]

### 4.4 Verdict

| Item | Value |
|---|---|
| comprehension:plan_interpretation row count | [N] |
| Rows with confidence = exact 0.9999 (clamp fired) | [N] |
| Rows with confidence > 0.9999 (clamp not firing) | [N] |
| Rows with confidence = 1.0 (potential reader sensitivity) | [N] |

---

## Section 5 — Per-entity calculation comparison

### 5.1 Calculation runs identified

| Run | ID | Created at | Pre/Post Phase 2 |
|---|---|---|---|
| Pre-Phase-2 | [uuid] | [timestamp] | pre |
| Post-Phase-2 | [uuid] | [timestamp] | post |

### 5.2 Per-entity comparison

[verbatim SQL output for all entities, no truncation]

### 5.3 Aggregate comparison

| Run | Entity count | Grand total | Avg payout |
|---|---|---|---|
| Pre-Phase-2 | [N] | [amount] | [amount] |
| Post-Phase-2 | [N] | [amount] | [amount] |
| Delta | [N] | [delta] | [delta] |

### 5.4 Component-level change counts

| Item | Value |
|---|---|
| delta_grand_total | [number] |
| entities_with_any_component_change | [count] |
| entities_with_c0_change | [count] |
| entities_with_c1_change | [count] |
| entities_with_c2_change | [count] |
| entities_with_c3_change | [count] |
| entities_with_c4_change | [count] |

---

## Section 6 — Ratio-by-100 scaling location

### 6.1 Multiplication-by-100 sites

[verbatim grep output]

### 6.2 scale_factor application sites

[verbatim grep output]

### 6.3 Ratio-handling code paths

[verbatim sed output for route.ts:1180-1230]
[verbatim sed output for intent-executor.ts:290-320]

### 6.4 Phase 2 commit overlap

[verbatim git show --name-only output]

### 6.5 Verdict

| Item | Value |
|---|---|
| File containing ratio-by-100 multiplication | [path:line] |
| Phase 2 modified this file | [Y/N] |
| HF-214 Phase 2 affects this surface | [Y/N] |

---

## Section 7 — Halt conditions evaluation

| Halt condition | Triggered? |
|---|---|
| Phase 2 commits not on main, or content differs from completion report | [Y/N] |
| Phase 2 source modifications not present in live files | [Y/N] |
| Reader of confidence treats 0.9999 ≠ 1.0 | [Y/N] |
| Ratio-by-100 in code path PR #381 modified | [Y/N] |
| Per-entity values bit-identical pre/post Phase 2 | [Y/N] |
| Per-entity values changed in unexpected components | [Y/N] |

---

## Section 8 — Summary tables (architect-channel reading material)

CC produces ONLY structured tables. NO interpretation. NO recommendation. NO narrative analysis.

### 8.1 What HF-214 Phase 2 changed

| Change | Live confirmation |
|---|---|
| AI prompt amended | [verbatim line from current source] |
| Response normalizer added | [verbatim function signature] |
| Writer clamp added | [verbatim lines from current source] |

### 8.2 What HF-214 Phase 2 did NOT change

| Surface | Confirmation |
|---|---|
| route.ts ratio handling | [Y/N modified by PR #381] |
| intent-executor.ts scalar_multiply | [Y/N modified by PR #381] |
| convergence-service.ts | [Y/N modified by PR #381] |
| plan-comprehension-emitter.ts | [Y/N modified by PR #381] |
| classification_signals schema | [Y/N modified by PR #381] |

### 8.3 Empirical impact on calculation surface

| Metric | Value |
|---|---|
| Grand total delta pre/post | [amount] |
| c0 change count | [N] |
| c1 change count | [N] |
| c2 change count | [N] |
| c3 change count | [N] |
| c4 change count | [N] |

### 8.4 Empirical impact on signal surface

| Metric | Value |
|---|---|
| comprehension:plan_interpretation rows pre-Phase-2 | 0 (per DIAG-037) |
| comprehension:plan_interpretation rows post-Phase-2 | [N] |
| Rows with confidence = 0.9999 (clamp fired) | [N] |
| Rows where reader behavior differs at 0.9999 vs 1.0 | [N] |

---

## Section 9 — At-close verification

- [ ] All 7 phases executed
- [ ] All halt conditions evaluated and reported
- [ ] Zero source files modified outside the completion report
- [ ] All evidence captured verbatim (no interpretation, no narrative)
- [ ] Section 8 tables fully populated
- [ ] "COMPLETION REPORT" appears in H1 title and filename
- [ ] PR opened with --base main --head diag-038-hf-214-phase2-audit
```

CC commits and pushes:
```bash
git add docs/completion-reports/DIAG-038_COMPLETION_REPORT_HF_214_Phase2_Audit.md
git commit -m "DIAG-038: read-only audit of HF-214 Phase 2 impact and ratio-by-100 scaling location"
git push -u origin diag-038-hf-214-phase2-audit
gh pr create --base main --head diag-038-hf-214-phase2-audit --title "DIAG-038: HF-214 Phase 2 Audit" --body "Read-only diagnostic. Zero source modifications. Output: docs/completion-reports/DIAG-038_COMPLETION_REPORT_HF_214_Phase2_Audit.md"
```

---

## What this directive does NOT do

- ❌ NO source file modifications
- ❌ NO PR creation that modifies any source file
- ❌ NO substrate amendments
- ❌ NO IRA invocation
- ❌ NO HF-214 disposition
- ❌ NO recommendation framing in CC output
- ❌ NO interpretation of findings
- ❌ NO assertion that any finding is good or bad

CC produces evidence. The architect dispositions.

---

## Closing checklist (CC verifies before final commit)

1. ☐ Only `docs/completion-reports/DIAG-038_COMPLETION_REPORT_HF_214_Phase2_Audit.md` is created (`git status` shows exactly this one new file)
2. ☐ `git diff main..HEAD --stat` confirms only the completion report file
3. ☐ All 7 phases executed in order
4. ☐ Halt conditions evaluated; if any triggered, completion report Section 7 captures which one(s)
5. ☐ All source code excerpts captured verbatim with file paths and line numbers
6. ☐ All SQL output captured verbatim, no truncation on per-entity comparison
7. ☐ Section 8 summary tables fully populated
8. ☐ No interpretation, no narrative, no recommendation in any section
9. ☐ "COMPLETION REPORT" in H1 title and filename
10. ☐ PR opened against main

End of directive.
