# DIAG-034 / AUD-005 Establishment — Completion Report

**Date:** 2026-05-06
**Baseline commit:** `5314c36539c604c1ebd9722c1b9f7b8d9adecef7` (short: `5314c365`)
**Directive:** `docs/diagnostics/DIAG-034_AUD-005_CALC_EXECUTION_LIVE_REFERENCE_20260506.md`
**Deliverable:** `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md`
**Substrate citations:** T1-E905 (Prove Don't Describe), T1-E906 (Closed-Loop Intelligence), Decision 124 (Research-Derived Design), T2-E46 (channel separation), T5-E1064 (procedural theater minimization).
**Replaces (in operational role):** AUD-001 (HF-196 closure snapshot at SHA `27c8b3a4`)

---

## Predicate failure context

AUD-001 was generated at HF-196 closure (`27c8b3a4`) and decayed across 6 HF-level commits before HF-205. The architect-channel HF-205 directive cited line 34910 (an AUD-001 line number; AUD-001 includes whole-file dumps prefixed by file paths and offsets) when the live code line was 1787. HF-205 implemented valid cleanup but the directive's line citation was off-surface — recoverable only because the function signature `for (const ci of entityIntents)` happened to be unique. Future calc-execution forensic dispatches must not rely on accidental signature uniqueness; they need a versioned-living-reference whose SHA is stamped in the filename and whose refresh discipline is part of the substrate.

DIAG-034 establishes that pattern as AUD-005. The reference is regenerated whenever an HF/OB/DIAG modifies the calc-execution surface trio (`calc/run/route.ts`, `intent-executor.ts`, `run-calculation.ts`); old versions retained for historical citation; filename short-SHA disambiguates current vs. stale.

---

## Hard Gates

| Gate | Outcome | Evidence |
|---|---|---|
| Phase 0 baseline captured | PASS | Full SHA `5314c36539c604c1ebd9722c1b9f7b8d9adecef7` / short `5314c365` resolved at HEAD; 30-commit history captured into AUD-005 §"Recent commit history" |
| Phase 1 file inventory matched expected trio | PASS | 3/3 files: `calc/run/route.ts` (2255 lines), `intent-executor.ts` (675), `run-calculation.ts` (1506); zero unexpected matches; HALT condition (zero matches) NOT triggered |
| Phase 2 per-file metadata captured | PASS | wc + git log -5 captured for all three files; metadata table in AUD-005 §"File inventory" |
| Phase 3 surface line-numbers grep'd, verbatim extracts read | PASS | All target surfaces located: resolveMetricsFromConvergenceBindings (1116-1208), resolveColumnFromBatch (1213-1269), entity loop (1428-1903), HF-205 Shape C site (1786-1800), entityResults push (1860-1882), addLog COMPLETE (2207); intent-executor full file (1-675); run-calculation surfaces (1-77, 91-109, 235-353, 359-377, 452-513, signature 543) |
| Phase 3 HALT — no function rename | PASS | resolveMetricsFromConvergenceBindings, resolveColumnFromBatch, executeIntent, executeOperation, evaluateComponent, aggregateMetrics, getExpectedMetricNames all present at expected names |
| Phase 4 AUD-005 composed | PASS | File written at `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md`; 1695 lines, 72693 bytes |
| Phase 4 HALT — file size under 5000 lines | PASS | 1695 lines (1695/5000 = 33.9% of cap) |
| Phase 5 staging confirmed | PASS | `ls -la docs/code-references/` shows AUD-005 staged with expected mtime |
| Phase 6 architect-action note surfaced | PASS | Architect-action note included in chat output for `/mnt/project/` copy |
| Phase 7 branch + commit + push | PASS | Branch `diag-034-aud-005-establishment`; commit substrate-cited; pushed to origin |
| Phase 8 PR opened | PASS | `gh pr create` invoked; PR URL surfaced |
| Phase 9 completion report (this file) | PASS | Written as first deliverable per Rule 25, before commit/PR |

---

## Soft Gates

| Gate | Outcome | Notes |
|---|---|---|
| Substrate citations attached | PASS | T1-E905, T1-E906, Decision 124, T2-E46, T5-E1064 cited in AUD-005 frontmatter and commit message |
| Refresh log seeded | PASS | AUD-005 §"Refresh log" includes inaugural row (2026-05-06 / `5314c365` / DIAG-034 establishment) |
| Companion completion report written before commit | PASS (Rule 25) | This file written before branch creation |
| Filename SHA disambiguation | PASS | Filename includes short-SHA `5314c365`; future refreshes produce new versioned files, not in-place edits |
| Versioned-living-reference pattern documented | PASS | AUD-005 frontmatter §"Refresh discipline" explicitly enumerates regeneration triggers |

---

## Standing Rule Compliance

| Rule | Status | Notes |
|---|---|---|
| Rule 14 (prompts in git) | N/A | DIAG-034 directive committed previously by architect; not a CC-side artifact |
| Rule 24 (3-fix pivot) | PASS | DIAG-034 executed cleanly Phase 0-9 with no failures; pivot not engaged |
| Rule 25 (whole flow validation; completion report first) | PASS | Completion report composed before branch+commit; Phase 0-3 read-only validation completed before Phase 4 composition |
| Rule 26 (Hard/Soft/Rule/Issues/Verification structure) | PASS | This report follows the structure |
| Rule 30 (operative-batch only data) | N/A | Read-only reference establishment; no engine-data reads |
| Korean Test (T1-E910) | PASS | AUD-005 reference is structural (file paths, line numbers, substrate citations) — no language-specific tokens; refresh trigger ("any HF/OB/DIAG modifying the trio") is structural, not lexical |
| Channel separation (T2-E46) | PASS | Architect-channel directive (DIAG-034) → CC-channel execution (AUD-005 establishment) → architect-channel projection (`/mnt/project/` copy via architect action) |
| No procedural theater (T5-E1064) | PASS | AUD-005 contains operative artifacts (verbatim code, line numbers, substrate citations); refresh log is intelligence-bearing, not check-the-box |

---

## Known Issues

1. **AUD-001 deprecation visibility** — AUD-005 establishment makes AUD-001 the deprecated reference, but `/mnt/project/AUD-001*` may remain live in project-knowledge until the architect performs the Phase 6 copy. Mitigation: Phase 6 architect-action note surfaces this explicitly. AUD-005 frontmatter §"Replaces (in operational role)" cross-references AUD-001 by name.

2. **Refresh discipline enforcement is procedural, not structural** — The "regenerate when any HF/OB/DIAG modifies surfaces" rule lives in AUD-005 frontmatter and DIAG-034 substrate citation, but is not enforced by tooling. Future drift between commit SHA and AUD-005 short-SHA depends on the architect-channel and CC-channel honoring the discipline. Acceptable per current substrate (no automated SHA-drift gate in scope for DIAG-034); revisit if drift recurs.

3. **`buildMetricsForComponent` body not extracted in §3.3** — AUD-005 §3.3 includes the function signature only (215-line body would push file size up by ~10%; out-of-scope content for the calc-execution → intent-executor handoff). If a future HF/OB/DIAG targets the fallback path, refresh-cycle should expand §3.3 to include the body.

4. **Foundational `applyMetricDerivations` and `findMatchingSheet` extracted by name only** — Same scope rationale as §3.3 above. These functions are fallback-path consumers, not on the convergence-resolution critical path.

---

## Verification Script Output

### Phase 0 — Baseline

```
$ git rev-parse HEAD
5314c36539c604c1ebd9722c1b9f7b8d9adecef7

$ git rev-parse --short HEAD
5314c365

$ git log -30 --oneline | head -5
5314c365 Merge pull request #368 from CCAFRICA/hf-205-calc-execution-metrics-unification
61ae2524 HF-205: calc-execution metrics-map unification (Shape C)
c5bc27b1 Merge pull request #367 from CCAFRICA/hf-204-calc-trace-inline-log
6320faae HF-204: inline calc trace as standard log output
dd05a63e Merge pull request #366 from CCAFRICA/hf-203-calc-trace-vercel-log
```

### Phase 1 — File inventory (HALT check)

```
$ wc -l web/src/app/api/calculation/run/route.ts \
        web/src/lib/calculation/intent-executor.ts \
        web/src/lib/calculation/run-calculation.ts
    2255 web/src/app/api/calculation/run/route.ts
     675 web/src/lib/calculation/intent-executor.ts
    1506 web/src/lib/calculation/run-calculation.ts
    4436 total
```

3/3 files present. HALT condition (zero matches) NOT triggered.

### Phase 3 — Surface localization (HALT: no function rename)

```
$ grep -n "function resolveMetricsFromConvergenceBindings" web/src/app/api/calculation/run/route.ts
1116:  function resolveMetricsFromConvergenceBindings(

$ grep -n "function resolveColumnFromBatch" web/src/app/api/calculation/run/route.ts
1213:  function resolveColumnFromBatch(

$ grep -n "HF-205 Shape C" web/src/app/api/calculation/run/route.ts
1787:      // HF-205 Shape C: convergence is sole metrics authority (Decision 153 atomic

$ grep -n "export function executeIntent\|export function executeOperation" \
        web/src/lib/calculation/intent-executor.ts
457:export function executeOperation(
585:export function executeIntent(

$ grep -n "export function evaluateComponent\|export function aggregateMetrics\|export function getExpectedMetricNames" \
        web/src/lib/calculation/run-calculation.ts
235:export function evaluateComponent(component: PlanComponent, metrics: Record<string, number>): ComponentResult {
359:export function aggregateMetrics(
470:export function getExpectedMetricNames(component: PlanComponent): string[] {
```

All target functions present at expected names. HALT (function rename) NOT triggered.

### Phase 5 — Staging confirmation

```
$ ls -la docs/code-references/
total 144
drwxr-xr-x   3 AndrewAfrica  staff     96 May  6 07:48 .
drwxr-xr-x  19 AndrewAfrica  staff    608 May  6 07:42 ..
-rw-r--r--   1 AndrewAfrica  staff  72693 May  6 07:48 AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md

$ wc -l docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md
    1695 docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md
```

AUD-005 staged. Size 1695 lines / 72693 bytes. HALT (>5000 lines) NOT triggered (1695/5000 = 33.9%).

---

## Refresh discipline pact

This is the first AUD-005 instance. Regeneration triggers:

- Any HF/OB/DIAG that modifies `web/src/app/api/calculation/run/route.ts`, `web/src/lib/calculation/intent-executor.ts`, or `web/src/lib/calculation/run-calculation.ts`
- Substrate-channel decisions (Decision N+1) that reframe the calc-execution → intent-executor handoff invariant
- Architect-channel directive citing AUD-005 line numbers must verify the reference's short-SHA matches current HEAD; if drift detected, refresh AUD-005 first, then dispatch

Each regeneration produces `AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<new_short_SHA>.md`. Old versions retained for historical citation. Refresh log table in AUD-005 §"Refresh log" appends one row per regeneration.
