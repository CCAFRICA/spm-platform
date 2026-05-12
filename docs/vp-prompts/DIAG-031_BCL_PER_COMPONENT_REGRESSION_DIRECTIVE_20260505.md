# DIAG-031_BCL_PER_COMPONENT_REGRESSION — Calc-Execution Path Static Comparison

**Sequence:** 031 (DIAG-025/026/027/028/029/030 assigned this session)
**Type:** Read-only forensic diagnostic; static code comparison at two SHAs (no execution; no database access)
**Question answered:** Which commit between HF-196 closure SHA `27c8b3a4` and current main `9f209bdf` changed per-component calculation behavior such that Gabriela Vascones Delgado October output dropped from `1,400` (cell-exact at HF-196 closure: C1=600, C2=400, C3=250, C4=150) to `560` (current main, post-HF-201)?
**Decides:** Scope of next remediation HF (revert specific commit / scope-expand to multiple commits / new architectural work)
**Predecessor evidence chain:**
- HF-196 closure SHA `27c8b3a4`; PR #359 merged 2026-05-03 SHA `73d52791`; **PASS-RECONCILED at 2,040 cells exact** ($312,033 = ground truth; 85 entities × 4 components × 6 months)
- Per-period reconciliation standard: every cell exact (Gabriela Oct: C1=600, C2=400, C3=250, C4=150, total=1,400)
- Current main `9f209bdf` (post-HF-201): Gabriela Oct = 560 (regression of -840; -60% of GT value)
- DIAG-029 audited convergence-binding path (convergence-service.ts, run-calculation.ts, calc/run/route.ts, ai-plan-interpreter.ts) — found 3 commits touched convergence-service; 0 touched run-calculation
- DIAG-029 did NOT audit calc-execution path (intent-executor.ts, boundary-canonicalizer.ts, scale-factor handling, per-operation execution logic)
- HF-201 closed Pass 4 derivation completeness (5 derivations / 0 gaps) but per-entity totals UNCHANGED — confirming defect is not in convergence binding/derivation path
- HF-196 Phase 1G-15 introduced `boundary-canonicalizer.ts` (commit `6f46c58e`); per-component calculation defect may live in this file or adjacent execution surfaces

**Substrate authority:**
- **Decision 109 (WITHDRAWN — empirically unfounded thresholds):** remediation must NOT introduce developer-set magic numbers
- **Decision 124 (Research-Derived Design):** correctness derives from proven-research grounding, not heuristic calibration
- **T1-E907 (Fix Logic Not Data):** code change only; no data manipulation
- **T1-E952 (Adjacent-Arm Drift Discipline):** if defect class spans multiple files, fix at construction layer not instance

## CC PASTE BLOCK

```markdown
# DIAG-031_BCL_PER_COMPONENT_REGRESSION

**Repo:** `~/spm-platform`
**Branch:** create `diag-031-bcl-per-component-regression` from main HEAD
**Type:** READ-ONLY. No code modifications. No commits. No execution. No database access.
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim git output + file content per claim
- T1-E953 (Decision-Implementation Gap) — empirical evidence per claim
- T2-E46 (Reconciliation-Channel Separation) — facts only; architect interprets
- T5-E1064 (Procedural Theater Minimization) — single statement per phase
- Decision 109 + Decision 124 — substrate authority for remediation framing

## TASK

Identify which commit(s) between HF-196 closure SHA `27c8b3a4` and current main HEAD `9f209bdf` changed per-component calculation behavior on the calc-execution path. The convergence-binding path was audited in DIAG-029; this audit covers the complementary calc-execution path that DIAG-029 did NOT touch.

## DIMENSION 1 — CALC-EXECUTION FILES INVENTORY

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b diag-031-bcl-per-component-regression
git rev-parse HEAD
```

PASTE output. Confirm HEAD at `9f209bdf`.

Identify all calc-execution path files in current main:

```bash
find web/src/lib/calculation -type f -name "*.ts" | sort
find web/src/lib/intelligence -type f -name "*.ts" | grep -iE "intent|executor|boundary|operation" | sort
find web/src -type f -name "*.ts" | xargs grep -l "executeBoundedLookup\|executeScalarMultiply\|executeConditionalGate\|executePiecewiseLinear\|findBoundaryIndex\|boundary-canonicalizer\|intent-executor" 2>/dev/null | sort -u
```

PASTE all output. CC produces single canonical list of files in scope.

## DIMENSION 2 — PER-FILE COMMIT LOG IN RANGE

For each file identified in Dimension 1, run:

```bash
git log --oneline 27c8b3a4..HEAD -- <file>
```

PASTE output for each file. Aggregate into a per-file commit-count table:

| File | Commits in range | Commits |
|---|---|---|

CC produces table with all files (commit count >= 0). Files with 0 commits in range remain in the table — important to confirm they were NOT modified.

## DIMENSION 3 — PER-COMMIT DIFF SCOPE

For every commit identified in Dimension 2 (any commit touching any calc-execution file), capture full message + diff stat:

```bash
# CC iterates per SHA
git log -1 --format="%H%n%ad%n%s%n%n%b" <SHA>
git show --stat <SHA>
```

PASTE for each.

## DIMENSION 4 — INTENT-EXECUTOR CODE STATE COMPARISON

The intent executor processes bounded_lookup_2d, bounded_lookup_1d, scalar_multiply, conditional_gate, piecewise_linear operations. Compare its state at HF-196 closure vs current main.

```bash
git show 27c8b3a4:web/src/lib/calculation/intent-executor.ts > /tmp/intent-executor.27c8b3a4.ts
git show HEAD:web/src/lib/calculation/intent-executor.ts > /tmp/intent-executor.HEAD.ts
diff /tmp/intent-executor.27c8b3a4.ts /tmp/intent-executor.HEAD.ts
```

PASTE diff output. If file did not exist at one SHA, paste error verbatim.

If diff is empty or trivial (whitespace only), state explicitly. If diff contains structural changes, capture each delta with surrounding context (before/after for each delta block).

## DIMENSION 5 — BOUNDARY-CANONICALIZER CODE STATE COMPARISON

HF-196 Phase 1G-15 introduced `boundary-canonicalizer.ts` (commit `6f46c58e` per artifact). Verify state at HF-196 closure (should be present per Phase 1G-15 closure) and compare with current main.

```bash
git show 27c8b3a4:web/src/lib/calculation/boundary-canonicalizer.ts > /tmp/boundary-canonicalizer.27c8b3a4.ts 2>&1
git show HEAD:web/src/lib/calculation/boundary-canonicalizer.ts > /tmp/boundary-canonicalizer.HEAD.ts 2>&1
diff /tmp/boundary-canonicalizer.27c8b3a4.ts /tmp/boundary-canonicalizer.HEAD.ts
```

PASTE output. If path differs (file is at a different location), CC searches and reports actual path.

Same delta-capture protocol as Dimension 4.

## DIMENSION 6 — RUN-CALCULATION CODE STATE COMPARISON

DIAG-029 found 0 commits touched `run-calculation.ts` in range — but the file may have changed via dependency updates or imports. Compare state directly:

```bash
git show 27c8b3a4:web/src/lib/calculation/run-calculation.ts > /tmp/run-calculation.27c8b3a4.ts
git show HEAD:web/src/lib/calculation/run-calculation.ts > /tmp/run-calculation.HEAD.ts
diff /tmp/run-calculation.27c8b3a4.ts /tmp/run-calculation.HEAD.ts | head -200
```

PASTE output. State whether file is byte-identical or not.

## DIMENSION 7 — SCALE-FACTOR + METADATA BUILD CODE COMPARISON

The calc log shows `scale=100` for `cumplimiento_colocacion` and `Pct_Meta_Depositos` (percentage columns). Identify scale-factor application code and compare:

```bash
grep -rn "scale_factor\|scaleFactor\|scale\s*=" web/src/lib/calculation/ web/src/lib/intelligence/ --include="*.ts" 2>/dev/null | head -30
```

PASTE output (current main). For each file identified with scale-factor logic, run:

```bash
git log --oneline 27c8b3a4..HEAD -- <file>
```

PASTE output. For any file with commits in range, capture diff:

```bash
git show 27c8b3a4:<file> > /tmp/<basename>.27c8b3a4.ts
git show HEAD:<file> > /tmp/<basename>.HEAD.ts
diff /tmp/<basename>.27c8b3a4.ts /tmp/<basename>.HEAD.ts
```

PASTE.

## DIMENSION 8 — METADATA INTENT TRANSFORM CODE COMPARISON

`intent-transformer.ts` (HF-187 era) transforms metadata.intent shape across consumers. Verify state:

```bash
find web/src -name "intent-transformer*" -type f 2>/dev/null
```

For each found, compare:

```bash
git show 27c8b3a4:<file> > /tmp/<basename>.27c8b3a4.ts
git show HEAD:<file> > /tmp/<basename>.HEAD.ts
diff /tmp/<basename>.27c8b3a4.ts /tmp/<basename>.HEAD.ts
```

PASTE output.

## DIMENSION 9 — getExpectedMetricNames + AST VISITOR COMPARISON

HF-196 Phase 1G-14 rewrote `getExpectedMetricNames` as recursive visitor over IntentOperation AST (`run-calculation.ts:434-491`). Verify integrity at current main:

```bash
git show HEAD:web/src/lib/calculation/run-calculation.ts | sed -n '420,510p'
```

PASTE output.

Compare against HF-196 closure:

```bash
git show 27c8b3a4:web/src/lib/calculation/run-calculation.ts | sed -n '420,510p'
```

PASTE output.

State: byte-identical / structural-differences-present.

## DIMENSION 10 — EMPIRICAL FINDINGS

CC writes 5-7 single-sentence facts:

- Calc-execution files inventoried in current main: <count>; canonical list
- Files modified between HF-196 closure and current main on calc-execution path: <count>; commit attribution per file
- Intent-executor state comparison: <BYTE-IDENTICAL / DIFFERS at <line ranges> / FILE-RENAMED>
- Boundary-canonicalizer state comparison: <BYTE-IDENTICAL / DIFFERS at <line ranges> / FILE-NOT-PRESENT-AT-SHA>
- Scale-factor logic state comparison: <list of files; per-file modification status>
- getExpectedMetricNames AST visitor state: <BYTE-IDENTICAL / STRUCTURAL-CHANGE>
- Surfaces NOT covered by this audit (calc-execution files modified post-HF-196 but not in inventory): <list if any>

NO interpretation. NO recommendations. NO disposition options. Architect interprets.

## REPORT

Write evidence document to `/tmp/DIAG_031_BCL_PER_COMPONENT_REGRESSION_REPORT_<YYYYMMDD>.md` with sections corresponding to Dimensions 1-10.

Write completion report to `docs/completion-reports/DIAG-031_BCL_PER_COMPONENT_REGRESSION_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure (Commits → Files Created → Files Modified → Hard Gates → Soft Gates → Standing Rule Compliance → Known Issues → Verification Script Output). Hard Gates evidence references `/tmp/` evidence document by section.

PASTE both file paths + ls -la verification + completion report content in chat.

NO commits. Branch left untracked for architect disposition.
```
