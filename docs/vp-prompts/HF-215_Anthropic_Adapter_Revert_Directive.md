# HF-215 — Revert anthropic-adapter.ts:408 Prompt Amendment

**Status:** ACTIVE
**Type:** Single-line revert; restores pre-Phase-2 prompt behavior at AI plan interpretation site
**Repository:** `CCAFRICA/spm-platform`
**Branch:** create new branch `hf-215-revert-anthropic-adapter-prompt` from `main`
**Files modified:** ONE source file + ONE completion report
**Predecessor probes:** DIAG-035 (PR #377), DIAG-036 (PR #378), DIAG-037 (PR #379), DIAG-038 (PR #382)
**Predecessor instrumentation:** HF-214 Phase 1 (PR #380, commit 7ca17c4a)
**Predecessor behavioral change:** HF-214 Phase 2 (PR #381, squash-merged commit 5418f4f4)

---

## Architect-channel context

DIAG-038 surfaced empirically: HF-214 Phase 2's B1 prompt amendment at `anthropic-adapter.ts:408` broke the pre-existing `/100` normalizer at `anthropic-adapter.ts:973-975`. Empirical evidence in `classification_signals` post-Phase-2: one `comprehension:ai_plan_interpretation` row at `confidence=0.0093` — exactly the under-division pattern (`0.93 / 100 = 0.0093`).

The pre-existing normalizer at line 974 unconditionally divides AI confidence by 100 when positive:

```typescript
const confidence = typeof result.confidence === 'number' && result.confidence > 0
  ? result.confidence / 100
  : 0;
```

Pre-Phase-2 contract: AI emits percentage (95). `95 / 100 = 0.95`. Correct ratio.
Post-Phase-2 with B1: AI emits ratio (0.95). `0.95 / 100 = 0.0095`. Wrong by 100x.

Affected consumers of the resulting `response.confidence` per DIAG-038 Section 3.4:
- `interpret-import/route.ts:99` (multiplies by 100 for display — partially compensates by accident)
- `analyze-workbook/route.ts:187` (same — partially compensates)
- `classify-file/route.ts:78` (same — partially compensates)
- `import/sci/execute/route.ts:1345, 1596` (`planConfidence: response.confidence` — does NOT compensate; planConfidence is now 100x lower than intended)
- `training-signal-service.ts:73` (does NOT compensate)

The B2 normalizer (`ai-plan-interpreter.ts:222-232`) and A writer-side clamp (`signal-persistence.ts:62-76, 135-149`) remain in place. With B1 reverted, the pipeline returns to pre-Phase-2 contract:
- AI emits 95 (percentage)
- `anthropic-adapter:974` divides by 100 → 0.95 (correct)
- `response.confidence = 0.95` (correct ratio for downstream consumers)
- B2 sees 0.95, already <=1, passes through unchanged
- Writer clamp sees 0.95, in valid range, no clamping fires
- `comprehension:plan_interpretation` persists at 0.95
- `planConfidence` restored to 0.95
- Training-signal pipeline restored

The B2 normalizer is harmless with the revert: it normalizes values >1 by dividing by 100, but the AI will emit values <=100 (percentage form) which `anthropic-adapter:974` already divides to <=1.0. B2's `>1` branch will not fire on the post-revert value; B2 acts as defense-in-depth for any future drift.

The A writer-side clamp is harmless with the revert: valid ratio values <=0.9999 do not trigger the clamp. The clamp continues to protect against any future writer producing out-of-range values.

---

## Standing Rules (apply throughout)

This directive operates under **CC Standing Architecture Rules v2.1+**.

- **Rule 1 (Korean Test):** prompt language uses general probability vocabulary; no domain-specific or language-specific literals introduced.
- **Rule 2 (Scale by Design):** revert applies to all tenants, all rule_sets, all signal writers consuming `response.confidence`.
- **Rule 24 (SR-34: No Bypass):** if line 408 has drifted, halt and surface to architect-channel. Do not work around.
- **Rule 25 (SR-41: Revert Discipline):** if implementation surfaces unexpected dependency, halt; do not introduce workarounds.
- **Evidence gates:** completion report includes verbatim before/after diff, build output, lint output, type-check output, dev server confirmation, and an architect-verifiable empirical assertion.

---

## Scope

### In scope (only this thing)

**Change 1 — Revert line 408 (or current location of B1 amendment) to pre-Phase-2 verbatim text.**

The replacement source-of-truth is the version of `anthropic-adapter.ts` at commit `7ca17c4a` (HF-214 Phase 1 merge, immediately pre-Phase-2). CC reads that version verbatim to extract the original line text and replaces the current B1-amended line with that exact text.

### Out of scope (CC must NOT do these things)

- ❌ NO modification to `web/src/lib/compensation/ai-plan-interpreter.ts` (B2 normalizer remains)
- ❌ NO modification to `web/src/lib/ai/signal-persistence.ts` (A writer clamp remains; HF-214 Phase 1 catch-block instrumentation remains)
- ❌ NO modification to `anthropic-adapter.ts:973-975` (`/100` normalizer remains)
- ❌ NO modification to any other prompt template inside `anthropic-adapter.ts` (file_classification, sheet_classification, field_mapping, workbook_analysis, import_field_mapping, entity_extraction, anomaly_detection, recommendation, etc.)
- ❌ NO modification to any other line of `anthropic-adapter.ts` outside the B1 amendment site
- ❌ NO modification to `route.ts`, `run-calculation.ts`, `intent-executor.ts`, `convergence-service.ts`, or `plan-comprehension-emitter.ts`
- ❌ NO addressing c4 magnitude defect (the original HF-214 target; separate work)
- ❌ NO addressing the 30 globally exact-1.0 confidence rows (bypass writer asymmetry; separate work)
- ❌ NO substrate amendments
- ❌ NO new dependencies; NO new helper modules

If implementation surfaces ambiguity (e.g., line 408 has drifted, or the pre-Phase-2 text contains content other than what DIAG-038 Section 2.1 documented), CC halts and surfaces to architect-channel. Do not extend scope unilaterally.

---

## Phase 0 — Pre-flight verification (read-only)

### Step 0.1 — Locate the current B1 amendment

```bash
cd /path/to/spm-platform
git fetch origin
git checkout main
git pull origin main
sed -n '400,415p' web/src/lib/ai/providers/anthropic-adapter.ts
grep -n "decimal probability ratio\|0\.0.*1\.0\|ratio form\|integer percent\|0-100" web/src/lib/ai/providers/anthropic-adapter.ts
```

Capture verbatim output. Per DIAG-038 Section 2.1, the B1-amended language is at line 408 of the live file. If line number has drifted, capture the actual current line number and surrounding context for the completion report.

If the B1 amendment is not present at all on main, halt — this would mean PR #381 was reverted via another path; HF-215 is unnecessary.

### Step 0.2 — Locate the pre-Phase-2 source text

```bash
git log --all --oneline -- web/src/lib/ai/providers/anthropic-adapter.ts | head -10
git show 7ca17c4a:web/src/lib/ai/providers/anthropic-adapter.ts | sed -n '400,415p'
```

Capture verbatim output. Per DIAG-038 Section 2.1 commentary and the HF-214 Phase 2 directive's pre-flight reading, the original line at commit `7ca17c4a` reads:

```
Return confidence scores (0-100) for each component and overall.
```

CC empirically confirms this verbatim from `git show 7ca17c4a:...`. If the text differs from this expectation, capture the actual verbatim text and use that as the revert target.

### Step 0.3 — Verify B2 and A are unchanged on main

```bash
sed -n '220,240p' web/src/lib/compensation/ai-plan-interpreter.ts
sed -n '60,80p' web/src/lib/ai/signal-persistence.ts
sed -n '130,155p' web/src/lib/ai/signal-persistence.ts
```

Capture verbatim. Confirm the B2 `normalizeConfidence` method and the A writer-side clamp at lines 62-76 + 135-149 are present and byte-identical to DIAG-038 Section 2.2 / 2.3 readings.

If B2 or A have changed since DIAG-038, halt — this directive's preservation assumption no longer holds.

---

## Phase 1 — Revert implementation

### Step 1.1 — Create branch

```bash
git checkout -b hf-215-revert-anthropic-adapter-prompt
```

### Step 1.2 — Replace the B1-amended line with the pre-Phase-2 verbatim text

Using the verbatim text captured in Phase 0 Step 0.2 (`git show 7ca17c4a:...` output), CC modifies `web/src/lib/ai/providers/anthropic-adapter.ts` at the location of the B1 amendment.

The replacement is **one line for one line**. The only acceptable diff is:

- ONE `-` line: the current B1-amended text (whatever the live line says, as captured in Phase 0 Step 0.1)
- ONE `+` line: the pre-Phase-2 verbatim text (as captured in Phase 0 Step 0.2)

No other lines in `anthropic-adapter.ts` change. No other files change.

If the B1 amendment spans more than one line in the live file (e.g., the amendment expanded the original single-line instruction into multiple lines with examples), the revert restores the original single-line form. CC captures the full multi-line removal in the diff.

### Step 1.3 — Verify the only modification

```bash
git diff main..HEAD --stat
git diff main..HEAD
```

Expected: exactly one file modified — `web/src/lib/ai/providers/anthropic-adapter.ts`. The diff shows the B1 amendment removed and the pre-Phase-2 text restored. No other content changes.

If anything else appears in the diff, halt.

---

## Phase 2 — Build, lint, type-check, dev server verification

```bash
cd /path/to/spm-platform
npm run build 2>&1 | tee /tmp/hf215-build.log
echo "BUILD_EXIT_CODE=$?"
```

Capture verbatim output. Expected: clean build.

```bash
npm run lint 2>&1 | tee /tmp/hf215-lint.log
echo "LINT_EXIT_CODE=$?"
```

Capture verbatim output. Expected: zero new warnings, zero errors.

```bash
npx tsc --noEmit 2>&1 | tee /tmp/hf215-tsc.log
echo "TSC_EXIT_CODE=$?"
```

Capture verbatim output. Expected: clean (the pre-existing `__tests__/round-trip-closure/run.ts:285` error noted in HF-214 Phase 2 may persist; that is acceptable carry-forward).

```bash
pkill -f "next dev" 2>/dev/null
rm -rf .next
npm run dev > /tmp/hf215-dev.log 2>&1 &
sleep 6
curl -sS -o /dev/null -w "HTTP_STATUS=%{http_code}\n" http://localhost:3000/login
```

Capture verbatim output. Expected: HTTP 200 on `/login`.

---

## Phase 3 — Completion report

CC writes `docs/completion-reports/HF-215_COMPLETION_REPORT_Anthropic_Adapter_Revert.md`:

```markdown
# HF-215 COMPLETION REPORT — Revert anthropic-adapter.ts:408 Prompt Amendment

**Date:** [ISO timestamp]
**Branch:** hf-215-revert-anthropic-adapter-prompt
**Commit SHA:** [pre-PR HEAD]
**Type:** Single-line revert; restores pre-Phase-2 confidence prompt
**Reverts:** HF-214 Phase 2 B1 amendment (PR #381 squash-merged 5418f4f4)
**Predecessor diagnostic:** DIAG-038 (PR #382)

---

## Section 1 — Phase 0 verification (verbatim)

### 1.1 Current B1 amendment location

[verbatim sed output for lines 400-415 of anthropic-adapter.ts]

[verbatim grep output for confidence-format vocabulary]

**Confirmed line(s):** [line number(s) and verbatim text of B1 amendment as live]

### 1.2 Pre-Phase-2 source text

[verbatim git log output]

[verbatim git show 7ca17c4a:web/src/lib/ai/providers/anthropic-adapter.ts output for lines 400-415]

**Confirmed pre-Phase-2 text (verbatim):** [the exact text from git show]

### 1.3 B2 and A preservation status

[verbatim sed output for ai-plan-interpreter.ts:220-240]

[verbatim sed output for signal-persistence.ts:60-80]

[verbatim sed output for signal-persistence.ts:130-155]

| Item | Status |
|---|---|
| B2 normalizeConfidence present | [Y/N] |
| A writer clamp present (persistSignal) | [Y/N] |
| A writer clamp present (persistSignalBatch) | [Y/N] |
| HF-214 Phase 1 catch-block instrumentation byte-identical | [Y/N] |

---

## Section 2 — Verbatim diff

### 2.1 Removed line(s) (B1 amendment)

```typescript
[verbatim removed lines]
```

### 2.2 Restored line (pre-Phase-2)

```typescript
Return confidence scores (0-100) for each component and overall.
```

(or actual verbatim text if it differed from above)

### 2.3 git diff main..HEAD

[verbatim git diff output]

### 2.4 git diff main..HEAD --stat

[verbatim git diff --stat output]

---

## Section 3 — Out-of-scope verification

CC explicitly confirms:

- ☐ NO modification to `web/src/lib/compensation/ai-plan-interpreter.ts`
- ☐ NO modification to `web/src/lib/ai/signal-persistence.ts`
- ☐ NO modification to `anthropic-adapter.ts:973-975` (`/100` normalizer)
- ☐ NO modification to any other prompt template inside `anthropic-adapter.ts`
- ☐ NO modification to any other line of `anthropic-adapter.ts` outside the B1 amendment site
- ☐ NO modification to `route.ts`, `run-calculation.ts`, `intent-executor.ts`, `convergence-service.ts`, `plan-comprehension-emitter.ts`
- ☐ NO new dependencies; NO new helper modules

`git diff main..HEAD --stat` confirms: ONE file modified (`web/src/lib/ai/providers/anthropic-adapter.ts`) plus completion report.

---

## Section 4 — Build, lint, type-check, dev server evidence

### 4.1 npm run build
**Exit code:** [code]
```
[verbatim output]
```

### 4.2 npm run lint
**Exit code:** [code]
```
[verbatim output]
```

### 4.3 npx tsc --noEmit
**Exit code:** [code]
```
[verbatim output]
```

### 4.4 Dev server start + login route check
**HTTP status:** [code]
```
[verbatim curl output]
```

---

## Section 5 — Architect-verifiable empirical assertion (post-merge)

After this PR merges and the architect performs a clean-slate Meridian reimport, the architect will observe in the database:

1. **AI plan interpretation prompt restored to (0-100):** the next plan interpretation call will be made with the pre-Phase-2 prompt instruction
2. **AI emits percentage form:** the AI's `confidence` values in the response will be in the 0-100 integer range (e.g., 95, 90)
3. **anthropic-adapter:974 produces correct ratio:** `response.confidence` will be in 0.0-1.0 range (e.g., 0.95, 0.90)
4. **comprehension:plan_interpretation persists at correct ratio:** the 10 emitted signals will have `confidence` in [0.85, 0.99] range, not under-divided
5. **comprehension:ai_plan_interpretation no longer at 0.0093:** subsequent rows will be at correct ratio
6. **planConfidence restored:** consumers at `import/sci/execute/route.ts:1345` and `:1596` will receive 0.95-range values, not 0.0095
7. **Writer clamp does NOT fire on `comprehension:plan_interpretation` or any related signal_type:** valid ratio values are well below the 0.9999 threshold
8. **B2 normalizer's `>1` branch does NOT fire:** values arrive already in ratio form

The c4 magnitude defect remains unresolved by this revert. c4 is the separate empirical observation per T1-E947, addressed by future work on `route.ts:1793/1798`.

---

## Section 6 — PR and merge

| Item | Value |
|---|---|
| PR number | [#] |
| PR URL | [link] |
| Vercel deploy preview status | [SUCCESS / FAIL] |
| Build check status | [SUCCESS / FAIL] |
| Mergeable | [CLEAN / DIRTY] |

---

## Section 7 — Closing checklist

- ☐ Single source file modified: `web/src/lib/ai/providers/anthropic-adapter.ts`
- ☐ Verbatim revert of B1 amendment to pre-Phase-2 text from commit 7ca17c4a
- ☐ B2 and A unchanged byte-identical
- ☐ Build clean, lint clean, type-check clean
- ☐ Dev server starts and login route responds 200
- ☐ Section 3 out-of-scope verification fully populated
- ☐ Section 5 architect-verifiable empirical assertion documented
- ☐ "COMPLETION REPORT" appears in H1 title and filename
- ☐ git diff pasted in Section 2
- ☐ PR opened with --base main --head hf-215-revert-anthropic-adapter-prompt
```

---

## Closing checklist (CC verifies before final commit)

Before committing the changed source file, the completion report, and pushing the branch, CC verifies:

1. ☐ Only `web/src/lib/ai/providers/anthropic-adapter.ts` and the new completion report file are modified (`git status` shows exactly these two)
2. ☐ `git diff main..HEAD --stat` confirms only the one source file plus completion report
3. ☐ The diff shows ONLY the B1 amendment site changed; ONE `-` block, ONE `+` line at that site
4. ☐ Build clean, lint clean, type-check clean
5. ☐ Dev server starts and responds at port 3000
6. ☐ HF-214 Phase 1 catch-block instrumentation byte-identical to its state on main pre-PR
7. ☐ B2 normalizeConfidence byte-identical to its state on main pre-PR
8. ☐ A writer clamp byte-identical to its state on main pre-PR
9. ☐ Completion report at `docs/completion-reports/HF-215_COMPLETION_REPORT_Anthropic_Adapter_Revert.md`
10. ☐ "COMPLETION REPORT" in H1 title and filename
11. ☐ All sections of the completion report populated; no placeholder text remains
12. ☐ Section 3 explicitly confirms each out-of-scope item with the prefixed checkbox
13. ☐ Section 5 architect-verifiable empirical assertion present and forward-looking only

CC then:

```bash
git add web/src/lib/ai/providers/anthropic-adapter.ts docs/completion-reports/HF-215_COMPLETION_REPORT_Anthropic_Adapter_Revert.md
git commit -m "HF-215: Revert anthropic-adapter.ts:408 prompt amendment to restore pre-Phase-2 (0-100) confidence convention"
git push -u origin hf-215-revert-anthropic-adapter-prompt
gh pr create --base main --head hf-215-revert-anthropic-adapter-prompt --title "HF-215: Revert anthropic-adapter.ts:408 prompt amendment" --body "Restores pre-Phase-2 (0-100) confidence instruction. Closes HF-214 Phase 2 over-division defect at anthropic-adapter.ts:974 surfaced by DIAG-038. B2 normalizer and A writer-side clamp unchanged. Output: docs/completion-reports/HF-215_COMPLETION_REPORT_Anthropic_Adapter_Revert.md"
```

End of directive.
