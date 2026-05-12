# DIAG-027_RECONCILED_CALC_MECHANISM — MX$185,063 Calc-Time Path Forensic

**Sequence:** 027 (DIAG-025 + DIAG-026 assigned this session)
**Type:** Read-only forensic diagnostic
**Question answered:** What calc-time mechanism produced MX$185,063 for Meridian at SHAs `cbaacb12` (HF-123 P5, 2026-03-10) and `1bd8100b` (OB-169 P6, 2026-03-14)?
**Decides:** HF-200 scope (mechanism-still-present / mechanism-removed / fixture-dependent)
**Predecessor:** DIAG-026 Finding 10 — `tipo_coordinador` did NOT match ROLE_TARGETS at reconciliation; calc must have read variant data from a different surface

## CC PASTE BLOCK

```markdown
# DIAG-027_RECONCILED_CALC_MECHANISM

**Repo:** `~/spm-platform`
**Branch:** create `diag-027-reconciled-calc-mechanism` from main HEAD
**Type:** READ-ONLY. No code modifications. No commits.
**Bindings:** T1-E905 (verbatim evidence); T1-E953 (no claims without paste); T2-E46 (facts only; architect interprets); T5-E1064 (single statement; no per-step ceremony)

## TASK

Identify the calc-time mechanism that produced Meridian MX$185,063 at SHAs `cbaacb12` and `1bd8100b`. Walk the variant-attribute data flow from Meridian's `Tipo Coordinador` source column through to calculation output at those commits.

## DIMENSION 1 — CALC-TIME ENTRY POINT AT RECONCILIATION SHAs

For each reconciliation SHA, identify the calc-time entry point and capture variant-attribute resolution logic.

```bash
git show cbaacb12 --stat | head -30
git show 1bd8100b --stat | head -30
```

PASTE both outputs.

For each SHA, list the calc-related files that existed:

```bash
for sha in cbaacb12 1bd8100b; do
  echo "=== $sha ==="
  git ls-tree -r --name-only $sha | grep -E "calc|engine|run|convergence|resolution" | head -20
done
```

PASTE output.

## DIMENSION 2 — VARIANT-ATTRIBUTE READ PATH AT RECONCILIATION

For each reconciliation SHA, locate where variant-attribute data is read at calc time:

```bash
for sha in cbaacb12 1bd8100b; do
  echo "=== $sha — calc/run/route.ts ==="
  git show $sha:web/src/app/api/calculate/run/route.ts 2>/dev/null | grep -n -B 3 -A 10 "meta\.role\|metadata\.role\|tipo\|coordinator\|variant\|role.*resolved" | head -100
done
```

PASTE output for each SHA. If file did not exist at that SHA, paste the error.

If `calc/run/route.ts` did not exist, find the calc dispatch file at that SHA:

```bash
for sha in cbaacb12 1bd8100b; do
  echo "=== $sha — calc files ==="
  git ls-tree -r --name-only $sha | grep -iE "calculate|engine|dispatch" | head -20
done
```

PASTE output. Then for each identified file at each SHA, extract variant-resolution logic with `grep -n -B 3 -A 15` for similar patterns (`role|variant|resolved|coordinator|tipo`).

PASTE all output.

## DIMENSION 3 — COMMITTED_DATA + ENTITIES SCHEMA AT RECONCILIATION

DIAG-026 Finding 10 hypothesized variant data may have been read from `committed_data.row_data` directly via convergence-bound metric columns. Test that hypothesis.

For each reconciliation SHA, identify schema/migration state:

```bash
for sha in cbaacb12 1bd8100b; do
  echo "=== $sha — migrations ==="
  git ls-tree -r --name-only $sha | grep -E "migrations|supabase.*sql" | tail -20
done
```

PASTE output.

For each SHA, locate any read of `committed_data.row_data` or `committed_data` in calc-related files:

```bash
for sha in cbaacb12 1bd8100b; do
  echo "=== $sha — committed_data reads ==="
  git ls-tree -r --name-only $sha | grep -E "\.(ts|tsx)$" | while read f; do
    git show $sha:$f 2>/dev/null | grep -l "committed_data\|row_data" 2>/dev/null && echo "  → $f"
  done | head -30
done
```

PASTE output. For each file flagged, run:

```bash
git show <sha>:<file> | grep -n -B 3 -A 10 "committed_data\|row_data"
```

PASTE the matching context.

## DIMENSION 4 — CONVERGENCE BINDING SHAPE AT RECONCILIATION

DIAG-026 Finding 10 also hypothesized convergence-bound metric columns. Inspect convergence-binding shape at reconciliation SHAs:

```bash
for sha in cbaacb12 1bd8100b; do
  echo "=== $sha — convergence ==="
  git ls-tree -r --name-only $sha | grep -iE "convergence|binding" | head -20
done
```

PASTE output. For each identified file, paste the file's variant-attribute / metric-column-binding logic:

```bash
git show <sha>:<file> | grep -n -B 3 -A 15 "metric\|column\|binding\|variant\|attribute"
```

PASTE.

## DIMENSION 5 — RECONCILIATION SCRIPT EXECUTION TRACE

The reconciliation script `ob169-meridian-check.ts` exists in current main per DIAG-026 Finding 7. Read it:

```bash
find . -name "ob169-meridian-check*" -type f 2>/dev/null
cat $(find . -name "ob169-meridian-check*" -type f 2>/dev/null | head -1)
```

PASTE full file content.

Also locate any HF-123 P5 reconciliation script:

```bash
find . -name "*hf-123*" -o -name "*hf123*" 2>/dev/null | head -10
```

For each found, PASTE full file content.

## DIMENSION 6 — DELTA: WHAT CHANGED BETWEEN RECONCILIATION AND CURRENT MAIN

For the calc-time entry point file identified in Dimension 1, capture the changes between reconciliation SHA and current main:

```bash
git log --oneline cbaacb12..HEAD -- <calc-entry-file>
```

PASTE list of commits touching the calc-time entry path. For commits authored by HF/OB identifiers (HF-130 onward, OB-170 onward), paste the commit message:

```bash
git log -1 --format="%H%n%ad%n%s%n%n%b" <SHA>
```

PASTE.

## DIMENSION 7 — EMPIRICAL FINDINGS

CC writes 5-7 single-sentence facts:

- At reconciliation SHA <X>, variant-attribute data for Meridian was read from <surface name> at <file>:<line>
- The mechanism reads <data shape> via <function/query>
- Schema state at reconciliation: committed_data/entities columns relevant to variant resolution were <list>
- Convergence binding shape at reconciliation: <description>
- Between reconciliation and current main, the calc-time entry path was modified by <list of HF/OB commits>
- Mechanism status in current main: PRESENT / REMOVED / REFACTORED / NEEDS-VERIFICATION
- Reconciliation script `ob169-meridian-check.ts` exercises <description of what it actually tests>

NO interpretation. NO recommendations. NO disposition options. Architect interprets.

## REPORT

Write evidence document to `/tmp/DIAG_027_RECONCILED_CALC_MECHANISM_REPORT_<YYYYMMDD>.md` with sections corresponding to Dimensions 1-7.

Write completion report to `docs/completion-reports/DIAG-027_RECONCILED_CALC_MECHANISM_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure (Commits → Files Created → Files Modified → Hard Gates → Soft Gates → Standing Rule Compliance → Known Issues → Verification Script Output). Hard Gates evidence references the `/tmp/` evidence document by section; do not re-paste full output into completion report.

PASTE both file paths + ls -la verification + completion report content in chat.

NO commits. Branch left untracked for architect disposition.
```
