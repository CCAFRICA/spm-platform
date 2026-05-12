# HF-214 Phase 2 — Confidence Convention Contract Enforcement

**Status:** ACTIVE
**Type:** Hotfix, behavioral change
**Parent HF:** HF-214 (c4 Fleet Utilization magnitude defect; Meridian reconciliation gate)
**Predecessor probes:** DIAG-035 (PR #377), DIAG-036 (PR #378), DIAG-037 (PR #379)
**Predecessor instrumentation:** HF-214 Phase 1 (PR #380, merged commit 7ca17c4a)
**Substrate authority:** IRA invocation HF-214 Phase 2 (vialuce-governance commits 167f816 / 9e41513 / 5d5386e; ira_request_hash db65a45f59c67bb334d5e4a99691d14038427e76be9075250bdf57122bae9a2b; cost $1.354245)
**Repository:** `CCAFRICA/spm-platform`
**Branch:** create new branch `hf-214-phase2-confidence-convention-enforcement` from `main`
**Files modified:** THREE source files + ONE completion report

---

## Substrate context (architect-supplied; CC operates within)

The IRA verdict ranked four candidate remediation paths. The architect has dispositioned: rank-1 producer-side normalization combined with rank-2 writer-side defense-in-depth. The fix shape in plain language:

> The fix happens in two places. First, where the AI produces its plan interpretation: the prompt explicitly asks for confidence as a decimal between zero and one, and the code that receives the AI's response divides any value greater than one by one hundred to convert percentages back into decimals. Second, at the canonical layer where signals are written to the database: a safety check clamps any out-of-range value into the allowed range and logs a warning, protecting all writers symmetrically against any future drift, not just this one.

**Substrate-grounding (per IRA verdict, architect-channel context only):**
- T1-E907 (Fix Logic, Not Data): producer-side fix addresses derivation at origin
- T1-E910 (Korean Test): structural heuristic on value range; no domain-specific literals
- T1-E906 (Closed-Loop Intelligence): writer clamp protects all signal writers symmetrically
- T1-E922 (AI-First): producer fix ensures AI's decision is correctly produced before reaching the canonical surface
- T1-E947 (Reasoning-Scope Binding Specificity): c4 magnitude verification is downstream and OUT of scope

---

## Standing Rules (apply throughout)

This directive operates under **CC Standing Architecture Rules v2.1+**.

- **Rule 1 (Korean Test):** value-range checks use structural heuristics only — no language-specific or domain-specific literals.
- **Rule 2 (Scale by Design):** changes work for any tenant, any rule_set, any signal writer.
- **Rule 24 (SR-34: No Bypass):** if implementation reveals an unexpected dependency, halt and surface to architect-channel — do not introduce workarounds.
- **Rule 25 (SR-41: Revert Discipline):** contamination on pushed commit = `git revert <SHA>`, not reset + force-push.
- **Rule 26 (SR-42: Locked-Rule Halt):** if any locked decision dictates a different action mid-implementation, halt verbatim and surface.
- **Rule 35-38: Mandatory verification gates** apply for any math-touching change.
- **Evidence gates:** completion report must include verbatim before/after diff, build output, lint output, and an architect-verifiable empirical assertion (the test the architect runs post-merge).

---

## Scope

### In scope (only these things)

**Change 1 — B1 (prompt amendment):**
The system prompt for AI plan interpretation must explicitly request confidence values as decimal ratios between 0.0 and 1.0. The prompt must include language that prevents the AI from emitting integer percentages (e.g., 90, 95) for any field labeled `confidence`.

**Change 2 — B2 (response normalization):**
In `web/src/lib/compensation/ai-plan-interpreter.ts`, the response normalization layer must detect and convert any `confidence` value greater than 1.0 by dividing by 100 to produce the ratio form. This applies before `interpretation.components[i].confidence` is populated.

**Change 3 — A (writer-side defense-in-depth):**
In `web/src/lib/ai/signal-persistence.ts`, the `persistSignal` and `persistSignalBatch` functions must, before insert, clamp the `confidence` field of each signal payload to the structural range allowed by the schema. When clamping fires, emit a warning log line that names the original value, the clamped value, the signal_type, and (if present) the metric_name and component_index. This warning identifies upstream defects that a clamp would otherwise silently mask.

### Out of scope (CC must NOT do these things)

- ❌ NO modification to `classification_signals` schema or any migration file
- ❌ NO change to `plan-comprehension-emitter.ts` (the writer-of-the-emit, distinct from the AI normalizer)
- ❌ NO change to `convergence-service.ts` or any reader of `classification_signals`
- ❌ NO promotion of non-blocking failure handling to blocking (Option D — separate substrate work)
- ❌ NO c4 magnitude defect verification (T1-E947 — separate observation)
- ❌ NO modification to any other signal_type emitter
- ❌ NO other coercion or transformation beyond the specified normalization and clamp
- ❌ NO new dependencies, NO new helper modules — changes inline in the two specified files

If implementation surfaces ambiguity (e.g., the prompt is not in `ai-plan-interpreter.ts` but in a separate template file), CC halts and surfaces to architect-channel. Do not extend scope unilaterally.

---

## Phase 0 — Pre-flight verification (read-only)

### Step 0.1 — Locate the AI plan interpretation prompt (already established)

Per CC's Phase 0 read on the predecessor directive draft, the AI plan interpretation prompt lives at:

- **File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
- **Template line range:** 185–593 (template `plan_interpretation`)
- **Offending instruction (B1 target):** line 408, currently states "Return confidence scores (0-100) for each component and overall."

CC re-runs the location verification to confirm no drift between this directive's drafting and current main:

```bash
grep -n "Return confidence scores\|confidence scores" web/src/lib/ai/providers/anthropic-adapter.ts | head -5
sed -n '405,415p' web/src/lib/ai/providers/anthropic-adapter.ts
wc -l web/src/lib/ai/providers/anthropic-adapter.ts
```

If line 408 no longer contains the `(0-100)` clause (e.g., another commit superseded it), halt and surface to architect-channel — directive scope assumes the offending instruction is present.

### Step 0.2 — Locate the response normalization site (already established)

Per CC's Phase 0 read on the predecessor directive draft:

- **File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
- **Top-level confidence population:** line 213 (`Number(parsed.confidence)`)
- **Per-component confidence population:** line 246 (`Number(c.confidence)`)
- Both sites populate from raw AI response with no range check

CC re-runs to confirm no drift:

```bash
grep -n "Number(parsed\.confidence)\|Number(c\.confidence)\|\.confidence" web/src/lib/compensation/ai-plan-interpreter.ts | head -10
sed -n '210,250p' web/src/lib/compensation/ai-plan-interpreter.ts
```

If the line numbers have shifted, capture current line numbers for the completion report.

### Step 0.3 — Verify signal-persistence.ts current state (Phase 1 instrumentation preserved)

Per CC's Phase 0 read, HF-214 Phase 1 catch-block instrumentation is at:

- `persistSignal` catch block: lines 76–84
- `persistSignalBatch` catch block: lines 130–148

These lines must remain byte-identical post-Phase 2.

```bash
grep -n "persistSignal\|persistSignalBatch\|SignalPersistence" web/src/lib/ai/signal-persistence.ts | head -20
sed -n '70,90p' web/src/lib/ai/signal-persistence.ts
sed -n '125,155p' web/src/lib/ai/signal-persistence.ts
wc -l web/src/lib/ai/signal-persistence.ts
```

Capture current state for completion report Section 1.3.

### Step 0.4 — Document Phase 0 findings before proceeding

In the completion report draft (Section 1), record:
- Path of AI plan interpretation prompt (file + line range)
- Path of response normalization site (file + line range)
- Confirmation that signal-persistence.ts Phase 1 instrumentation is preserved
- Any anomaly or ambiguity surfaced

If anomaly surfaced, halt and surface to architect-channel before Phase 1.

---

## Phase 1 — B1 implementation (AI prompt amendment)

CC modifies the AI plan interpretation system prompt in `web/src/lib/ai/providers/anthropic-adapter.ts` to require confidence values as decimal ratios between 0.0 and 1.0.

**The offending instruction at line 408 currently states (verbatim):**
> "Return confidence scores (0-100) for each component and overall."

**The (0-100) clause is the source of the percentage-format AI output.** Pure-additive instruction cannot resolve this — leaving the (0-100) mandate in place while adding a "use ratio form" instruction creates a self-contradictory prompt that the AI cannot honor coherently.

**Implementation requirements:**
- Amend line 408's `(0-100)` clause to specify decimal ratio between 0.0 and 1.0
- Wording is at CC discretion; structural intent is binding (the AI must understand: confidence is a probability ratio, not a percentage; emit values like 0.95, not 95)
- Examples in the amended instruction are encouraged (e.g., "0.95 means 95% confidence; do NOT emit 95")
- Search the entire `plan_interpretation` template (lines 185–593) for any other `(0-100)` or percentage-format reference to confidence and amend those as well — the structural fix is the contract on confidence representation, not just one line
- Do NOT modify other instructions in the template that are unrelated to confidence representation
- Do NOT add new sections or restructure the template hierarchy

CC commits this change as a single atomic edit. Verbatim before/after for the completion report.

**Korean Test reminder:** the amended prompt MUST NOT introduce any domain-specific (compensation, ICM) or language-specific (Spanish, Korean) literals. Use general probability vocabulary ("decimal ratio between 0.0 and 1.0", "probability score").

---

## Phase 2 — B2 implementation (response normalization)

CC modifies the response normalization layer to detect confidence values >1.0 and divide by 100.

**Implementation requirements:**
- The normalization fires BEFORE `interpretation.components[i].confidence` is populated
- For any confidence field where `value > 1`, transform via `value / 100`
- Values already in 0.0–1.0 range pass through unchanged
- Negative values (if any appear) clamp to 0
- Apply to ALL confidence fields in the AI response, not just per-component (i.e., plan-level, component-level, any nested confidence)
- Log when normalization fires, identifying the original value and the field path being normalized
- No additional transformation (no rounding, no precision change beyond what division produces)

CC commits this change as a single atomic edit. Verbatim before/after for the completion report.

---

## Phase 3 — A implementation (writer-side defense-in-depth clamp)

CC modifies `persistSignal` and `persistSignalBatch` to clamp confidence at the canonical writer.

**Implementation requirements:**
- The clamp fires immediately before the database insert call
- Clamping logic: `if (confidence != null) { clamped = Math.min(Math.max(confidence, 0), 0.9999) }` — applied per signal in the batch
- The structural value 0.9999 is the maximum representable in NUMERIC(5,4); CC must NOT hardcode the literal "5,4" or any reference to schema precision in the clamp logic. The clamp uses the value-range heuristic (0.0 to <1.0) which is structurally correct independent of schema choice.
- When the original value differs from the clamped value (i.e., clamping fired), emit a warning log line containing: original confidence value, clamped confidence value, signal_type, and (if present in the payload) metric_name and component_index
- The clamp applies to the value stored in the insert row, not to the original signal object passed in
- Both `persistSignal` (single-row path) and `persistSignalBatch` (batch path) include the clamp
- The HF-214 Phase 1 catch-block instrumentation is preserved exactly — DO NOT remove or modify the per-row diagnostic emission added in Phase 1

CC commits this change as a single atomic edit. Verbatim before/after for the completion report.

---

## Phase 4 — Build, lint, type-check, dev server verification

```bash
cd /path/to/spm-platform
npm run build
npm run lint
npx tsc --noEmit
```

Capture exit codes and output for the completion report.

```bash
# Restart dev server cleanly
pkill -f "next dev" 2>/dev/null
rm -rf .next
npm run dev &
sleep 5
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```

Confirm dev server starts and login route returns 200. Capture for completion report.

---

## Phase 5 — Completion report

CC writes `docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md`:

```markdown
# HF-214 Phase 2 COMPLETION REPORT — Confidence Convention Contract Enforcement

**Date:** [ISO timestamp]
**Branch:** hf-214-phase2-confidence-convention-enforcement
**Commit SHA:** [pre-PR HEAD]
**Type:** Behavioral change — producer-side normalization + writer-side defense-in-depth clamp
**Predecessor:** HF-214 Phase 1 (PR #380, commit 7ca17c4a — instrumentation preserved)
**Substrate authority:** IRA invocation HF-214 Phase 2 (db65a45f59c67bb334d5e4a99691d14038427e76be9075250bdf57122bae9a2b)

---

## Section 1 — Phase 0 findings (verbatim from pre-flight)

### 1.1 AI plan interpretation prompt location
**File:** [path]
**Line range:** [start-end]
**Prompt construction site:** [verbatim excerpt]

### 1.2 Response normalization site
**File:** [path]
**Line range:** [start-end]
**Site context:** [verbatim excerpt]

### 1.3 signal-persistence.ts current state
**File:** web/src/lib/ai/signal-persistence.ts
**Total lines:** [count]
**HF-214 Phase 1 instrumentation:** preserved at lines [start-end]
**Catch-block emission lines:** [verbatim excerpt of preserved Phase 1 code]

### 1.4 Anomalies / ambiguities surfaced
[either "none" or itemized list of issues halted on]

---

## Section 2 — Verbatim diffs

### 2.1 Change 1 (B1) — AI plan interpretation prompt
**File:** [path]
**Lines changed:** [start-end]

**Before:**
```typescript
[verbatim]
```

**After:**
```typescript
[verbatim]
```

### 2.2 Change 2 (B2) — response normalization
**File:** web/src/lib/compensation/ai-plan-interpreter.ts
**Lines changed:** [start-end]

**Before:**
```typescript
[verbatim]
```

**After:**
```typescript
[verbatim]
```

### 2.3 Change 3 (A) — writer-side clamp (single-row)
**File:** web/src/lib/ai/signal-persistence.ts (persistSignal)
**Lines changed:** [start-end]

**Before:**
```typescript
[verbatim]
```

**After:**
```typescript
[verbatim]
```

### 2.4 Change 3 (A) — writer-side clamp (batch path)
**File:** web/src/lib/ai/signal-persistence.ts (persistSignalBatch)
**Lines changed:** [start-end]

**Before:**
```typescript
[verbatim]
```

**After:**
```typescript
[verbatim]
```

---

## Section 3 — Out-of-scope verification

CC explicitly confirms:

- ☐ NO modification to `classification_signals` schema or any migration file
- ☐ NO modification to `plan-comprehension-emitter.ts`
- ☐ NO modification to `convergence-service.ts` or any reader
- ☐ NO promotion of non-blocking-to-blocking failure handling
- ☐ NO modification to any other signal_type emitter
- ☐ NO new dependencies; NO new helper modules
- ☐ HF-214 Phase 1 catch-block instrumentation preserved exactly (paste before/after of Phase 1 lines showing zero change)
- ☐ Clamp logic uses no domain-specific or language-specific literals (Korean Test compliant)
- ☐ Clamp logic does not hardcode schema precision references

Paste full `git diff main..HEAD --stat` output here to surface ONLY the three source files modified (anthropic-adapter.ts, ai-plan-interpreter.ts, signal-persistence.ts).

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

This section documents the empirical observation the architect performs after merging this PR and triggering a Meridian reimport. CC writes this section as forward-looking documentation:

> "After this PR merges and the architect triggers a Meridian plan reimport on production, the architect will observe in the database:
>
> 1. **Comprehension signals persist:** `SELECT count(*) FROM classification_signals WHERE rule_set_id = '3d629051-f788-44f6-a546-45876dd187b1' AND signal_type = 'comprehension:plan_interpretation'` returns a non-zero count (expected: 10, matching the variant×component count for Meridian).
> 2. **Confidence values are in 0.0–1.0 range:** the persisted rows show confidence values as decimals (e.g., 0.90, 0.95), not integer percentages (90, 95).
> 3. **Vercel logs may show clamp warnings** if any confidence value still exceeds the range despite producer-side normalization. If clamp warnings appear, this signals that the B1+B2 producer fix is incomplete and architect-channel investigation is warranted. If no clamp warnings appear, B1+B2 is sufficient and A is correctly serving as defense-in-depth.
> 4. **The c4 magnitude defect (Antonio López Hernández, January 2025, hub_utilization_rate_capped resolving to 121.56)** may or may not resolve as a downstream consequence. This Phase 2 does NOT adjudicate c4 — c4 verification is a separate empirical observation per T1-E947 reasoning-scope binding specificity. Architect determines next phase scope based on c4 observation post-Phase 2."

The architect performs the reimport and observes the database. CC does NOT perform the verification.

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

- ☐ Two source files modified, no others
- ☐ Three changes (B1, B2, A) implemented per scope
- ☐ Build clean, lint clean, type-check clean
- ☐ Dev server starts and login route responds 200
- ☐ Section 3 out-of-scope verification fully populated
- ☐ HF-214 Phase 1 instrumentation preserved exactly
- ☐ Korean Test compliance verified (no domain-specific literals)
- ☐ Section 5 architect-verifiable empirical assertion documented
- ☐ "COMPLETION REPORT" appears in H1 title and filename
- ☐ git diff pasted in Section 3
- ☐ PR opened with --base main --head hf-214-phase2-confidence-convention-enforcement
```

---

## Closing checklist (CC verifies before final commit)

Before committing the changed source files, the completion report, and pushing the branch, CC verifies:

1. ☐ Only `web/src/lib/ai/providers/anthropic-adapter.ts`, `web/src/lib/compensation/ai-plan-interpreter.ts`, `web/src/lib/ai/signal-persistence.ts`, and the new completion report file are modified (`git status` shows exactly these four)
2. ☐ `git diff main..HEAD --stat` confirms only the three source files plus completion report
3. ☐ Build clean, lint clean, type-check clean
4. ☐ Dev server starts and responds at port 3000
5. ☐ HF-214 Phase 1 catch-block instrumentation byte-identical to its state on main (paste before/after diff of Phase 1 lines)
6. ☐ Completion report at `docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md`
7. ☐ "COMPLETION REPORT" in H1 title and filename
8. ☐ All sections of the completion report populated; no placeholder text remains
9. ☐ Section 3 explicitly confirms each out-of-scope item with the prefixed checkbox
10. ☐ Section 5 architect-verifiable empirical assertion present and forward-looking only (no CC-side verification claims)

CC then:
- `git add web/src/lib/ai/providers/anthropic-adapter.ts web/src/lib/compensation/ai-plan-interpreter.ts web/src/lib/ai/signal-persistence.ts docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md`
- `git commit -m "HF-214 Phase 2: Confidence convention contract enforcement (B1+B2 producer + A writer defense-in-depth)"`
- `git push -u origin hf-214-phase2-confidence-convention-enforcement`
- `gh pr create --base main --head hf-214-phase2-confidence-convention-enforcement --title "HF-214 Phase 2: Confidence convention contract enforcement" --body "Behavioral change per HF-214 Phase 2 directive. Predecessor instrumentation: HF-214 Phase 1 (PR #380). Substrate authority: IRA invocation HF-214 Phase 2 (vialuce-governance ira_request_hash db65a45f59c6). Three changes in single PR per Vertical Slice Rule: B1 AI prompt amendment, B2 response normalization, A writer-side defense-in-depth clamp with warning log. Output: docs/completion-reports/HF-214_Phase2_COMPLETION_REPORT_Confidence_Convention_Enforcement.md"`

End of directive.
