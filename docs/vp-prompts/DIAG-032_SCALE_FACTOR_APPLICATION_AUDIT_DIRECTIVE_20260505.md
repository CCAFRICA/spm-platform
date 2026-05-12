# DIAG-032_SCALE_FACTOR_APPLICATION_AUDIT — Convergence-Path Adjacent-Arm Drift

**Sequence:** 032 (DIAG-025 through 031 assigned this session)
**Type:** Read-only forensic diagnostic; static code reading at calc-execution sites consuming convergence-bound metrics
**Question answered:** When the calc engine runs the convergence-bindings path (`HF-108 Resolution path: convergence_bindings`), is the `scale_factor` produced by HF-112/HF-114 convergence binding actually APPLIED to the metric value before bounded_lookup band index lookup?
**Decides:** Whether the defect is Adjacent-Arm Drift recurrence of OB-167 (scale_factor detected at convergence layer but never applied at execution layer) or a different failure mode

## Forensic precedent

**OB-167 (PR #235, March 13, 2026):** band-aware normalization in `run-calculation.ts`. Fixed BCL C2 Captación de Depósitos $0 → $10,625 by detecting decimal-vs-percentage scale mismatch and multiplying ×100 before band lookup. **Critical detail:** OB-167 is gated on `if (!usedConvergenceBindings)` (per AUD-001 line 34770) — meaning OB-167 ONLY fires on the legacy fallback path. The convergence path was assumed to handle scale via `scale_factor` from convergence binding output.

**HF-116 comment in code:** "Still skip for convergence path (scale_factor handles it there)."

**Current calc log evidence:**
- `HF-108 Resolution path: convergence_bindings (Decision 111)` — convergence path active; OB-167 SKIPPED
- `component_1: actual=Pct_Meta_Depositos (AI+validated, scale=100)` — scale=100 detected by convergence binding
- C2 calc = $0 across all 85 entities; C2 GT = $10,170 (October) — full-component zero failure

If `scale_factor` is detected at convergence binding (proven by log) but never applied at execution time, the assumption HF-116 made ("scale_factor handles it there") is structurally false. This would be Adjacent-Arm Drift (T1-E952): OB-167 fixed defect at one path, convergence path inherited responsibility for same protection, never implemented it. Same failure mode now ships under different gating.

## Substrate authority

- **T1-E907 (Fix Logic Not Data):** code change only; no data manipulation
- **T1-E952 (Adjacent-Arm Drift Discipline):** if defect class spans multiple paths, fix at construction layer not instance
- **T1-E953 (Decision-Implementation Gap):** OB-167's stated assumption ("scale_factor handles it there") needs empirical verification — if the assumption isn't realized in code, it's a Decision-Implementation Gap
- **Decision 109 (WITHDRAWN):** no developer-set thresholds; remediation must derive from architectural mechanism, not magic number
- **Decision 124 (Research-Derived Design):** empirical evidence first; remediation grounded in observed code behavior

## CC PASTE BLOCK

```markdown
# DIAG-032_SCALE_FACTOR_APPLICATION_AUDIT

**Repo:** `~/spm-platform`
**Branch:** create `diag-032-scale-factor-application-audit` from main HEAD
**Type:** READ-ONLY. No code modifications. No commits. No execution.
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim code excerpts per claim
- T1-E953 (Decision-Implementation Gap) — empirical evidence per claim
- T2-E46 (Reconciliation-Channel Separation) — facts only; architect interprets
- T5-E1064 (Procedural Theater Minimization) — single statement per phase
- T1-E952 (Adjacent-Arm Drift Discipline) — defect-class framing

## TASK

Determine whether `scale_factor` from convergence binding is APPLIED to metric values at calc execution time before bounded_lookup band index lookup, when the calc engine takes the convergence-bindings resolution path.

## DIMENSION 1 — CONVERGENCE BINDING SCALE_FACTOR PRODUCTION

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b diag-032-scale-factor-application-audit
git rev-parse HEAD
```

PASTE output.

Locate scale_factor production in convergence-service.ts:

```bash
grep -n "scale_factor\|scaleFactor" web/src/lib/intelligence/convergence-service.ts | head -50
```

PASTE output. For each match site, capture surrounding context (5 lines before, 15 lines after):

```bash
# CC iterates per line number
grep -B 5 -A 15 -n "scale_factor\|scaleFactor" web/src/lib/intelligence/convergence-service.ts
```

PASTE output. Identify: where scale_factor is computed, what value range it can produce, where it's stored on `ComponentBinding`.

## DIMENSION 2 — COMPONENTBINDING TYPE DEFINITION

```bash
grep -n "interface ComponentBinding\|type ComponentBinding" web/src/lib/intelligence/convergence-service.ts web/src/lib/calculation/ web/src/types/ -r --include="*.ts" 2>/dev/null
```

PASTE output. Then capture the full type definition:

```bash
grep -B 2 -A 20 "interface ComponentBinding" web/src/lib/intelligence/convergence-service.ts
```

PASTE output. Confirm `scale_factor` is present in the persisted shape.

## DIMENSION 3 — SCALE_FACTOR PERSISTENCE INTO RULE_SETS

The convergence binding shape (with scale_factor) is persisted to `rule_sets.input_bindings.convergence_bindings`. Find the persistence code:

```bash
grep -rn "convergence_bindings\|convergenceBindings" web/src/app/api/ web/src/lib/ --include="*.ts" 2>/dev/null | head -30
```

PASTE output. For each persistence site, capture context.

## DIMENSION 4 — CALC-TIME CONSUMPTION OF SCALE_FACTOR

This is the decisive dimension. At calc execution time, how is `scale_factor` consumed from the persisted convergence binding and applied to the metric value before band lookup?

Search for scale_factor reads at calc-execution sites:

```bash
grep -rn "scale_factor\|scaleFactor" web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts" 2>/dev/null
```

PASTE output. For each match, capture surrounding context.

If 0 matches: **scale_factor is NEVER read at calc-execution time**. State this verbatim. This would confirm Adjacent-Arm Drift hypothesis — convergence binding produces scale_factor but execution never consumes it.

If matches present: capture each consumption site verbatim. Trace whether the read value is multiplied against the metric value before bounded_lookup execution.

## DIMENSION 5 — BAND LOOKUP EXECUTION SITES

Locate bounded_lookup execution code:

```bash
grep -n "executeBoundedLookup\|findBoundaryIndex\|bounded_lookup_1d\|bounded_lookup_2d" web/src/lib/calculation/intent-executor.ts | head -30
```

PASTE output. For each match, capture surrounding context (10 before, 30 after):

```bash
grep -B 10 -A 30 "executeBoundedLookup1D\|executeBoundedLookup2D" web/src/lib/calculation/intent-executor.ts
```

PASTE output. Specifically: at the moment bounded_lookup reads the metric value to find band index, is there any scale-factor application visible? Is the value as-passed-in, or transformed?

## DIMENSION 6 — METRIC VALUE FLOW TO BAND LOOKUP

Trace the metric value from convergence-binding-resolved column → metric resolution → band lookup. The path includes:
- `resolveSource` in intent-executor (reads metric from data row)
- `metrics` map population in run-calculation
- `executeBoundedLookup1D` / `executeBoundedLookup2D` consumption

```bash
grep -n "resolveSource\|data\.metrics\[\|metrics\[key\]" web/src/lib/calculation/intent-executor.ts web/src/lib/calculation/run-calculation.ts | head -30
```

PASTE output. For key sites, capture context.

Specifically identify: where does the engine receive the metric value (e.g., 0.85 for Pct_Meta_Depositos in decimal form)? Where, if anywhere, is scale_factor multiplied? At what point does the value reach `findBoundaryIndex`?

## DIMENSION 7 — OB-167 BAND-AWARE NORMALIZATION CURRENT STATE

OB-167 normalization is gated on `!usedConvergenceBindings`. Verify state at HEAD:

```bash
grep -B 5 -A 30 "OB-167\|band-aware\|!usedConvergenceBindings" web/src/lib/calculation/run-calculation.ts | head -80
```

PASTE output. Confirm the gating is intact.

Then identify what the convergence path is supposed to do INSTEAD — does any code path replace OB-167's work for the convergence case?

## DIMENSION 8 — EMPIRICAL FINDINGS

CC writes 5-7 single-sentence facts:

- scale_factor production sites in convergence-service.ts: <count>; produces values <range>
- ComponentBinding type includes scale_factor field: <YES (line N) / NO>
- scale_factor persisted into rule_sets.input_bindings.convergence_bindings: <YES (file:line) / NO>
- scale_factor consumption sites in calc-execution code (web/src/lib/calculation/, web/src/app/api/calculation/): <count>; if zero, state "scale_factor is NEVER read at calc-execution time"
- bounded_lookup execution receives metric value: <as-passed-in / scale-factor-transformed / other>
- OB-167 band-aware normalization current state: <gated on !usedConvergenceBindings as documented / different / removed>
- Adjacent-Arm Drift conclusion (factual): <CONFIRMED — scale_factor produced but never applied / REFUTED — scale_factor IS applied at <site> / OTHER>

NO interpretation. NO recommendations. Architect interprets.

## REPORT

Write evidence document to `/tmp/DIAG_032_SCALE_FACTOR_APPLICATION_AUDIT_REPORT_<YYYYMMDD>.md` with sections corresponding to Dimensions 1-8.

Write completion report to `docs/completion-reports/DIAG-032_SCALE_FACTOR_APPLICATION_AUDIT_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure.

PASTE both file paths + ls -la verification + completion report content in chat.

NO commits. Branch left untracked for architect disposition.
```
