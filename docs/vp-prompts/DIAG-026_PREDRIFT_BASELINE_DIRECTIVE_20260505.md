# DIAG-026_PREDRIFT_BASELINE — Meridian Reconciled-Proof Code Path Forensic

**Sequence:** 026 (per VP DIAG counter; DIAG-025 assigned this session)
**Authoring:** VP architect-channel 2026-05-05
**Type:** Read-only forensic diagnostic
**Question answered:** Was Meridian reconciled (MX$185,063) at any prior commit? If yes, what did the canonicalization code path look like at that commit?
**Decides:** Whether HF-200 frame is RESTORATION (revert drift) or RECONSTRUCTION (new architecture).

## Why this exists

Reconciled proof historically achieved across BCL ($312,033), CRP ($566,728.97 pre-clawback), Meridian (MX$185,063). DIAG-025 established that recent commits (OB-156, OB-177, HF-190, HF-199 D3) introduced canonicalization-layer drift. DIAG-025 did NOT establish what existed before those commits or whether Meridian was reconciled before they shipped. HF-200 scoping cannot proceed without that evidence — wrong frame produces wrong scope.

## CC PASTE BLOCK

```markdown
# DIAG-026_PREDRIFT_BASELINE

**Repo:** `~/spm-platform`
**Branch:** create `diag-026-predrift-baseline` from main HEAD
**Type:** READ-ONLY. No code modifications. No commits.
**Bindings:** T1-E905 (verbatim evidence); T1-E953 (no claims without paste); T2-E46 (facts only; architect interprets)

## TASK

Determine whether Meridian was reconciled (MX$185,063) at any commit prior to the four drift introductions, and capture the pre-drift code path for the four canonicalization sites.

## DIMENSION 1 — RECONCILIATION HISTORY SEARCH

Find every commit referencing Meridian reconciliation:

```bash
git log --all --oneline | grep -iE "meridian|185.?063" | head -50
```

For each result, capture full commit message:

```bash
git log -1 --format="%H%n%ad%n%s%n%n%b" <SHA>
```

PASTE all output verbatim.

Find any reconciliation/baseline artifacts in the repo:

```bash
find . -type f \( -name "*.md" -o -name "*.ts" \) | xargs grep -l "185.?063\|MX\$185" 2>/dev/null | head -20
```

PASTE output. For each file, paste the matching context (`grep -B 2 -A 5`).

## DIMENSION 2 — DRIFT-COMMIT TIMELINE ANCHORS

From DIAG-025 findings, the drift commits are:
- OB-156 (canonicalization contributor; SHA in DIAG-025 audit report at `/tmp/DIAG_025_TIPO_DRIFT_REPORT_20260505.md`)
- OB-177 — `65ce08f4` (2026-03-18; temporal_attributes literal-key path)
- HF-190 P1 — `294be7ec` (2026-04-03)
- HF-190 P2 — `8d90eaca` (2026-04-03; metadata literal-key spread)
- HF-199 D3 — `a21d8913` (2026-05-04; raw-column-name preservation)

For each, capture the parent commit SHA (the immediately-prior state):

```bash
for sha in 65ce08f4 294be7ec 8d90eaca a21d8913; do
  echo "=== $sha ==="
  git log -1 --format="parent: %P%nsubject: %s%ndate: %ad" $sha
done
```

PASTE output. Plus OB-156 parent (CC reads OB-156 SHA from DIAG-025 audit report and runs same query).

## DIMENSION 3 — PRE-DRIFT CODE STATES OF FOUR SITES

For each drift commit, show the four-site code AS IT EXISTED at the parent (pre-drift) commit.

For OB-177 parent (pre-OB-177 state of `web/src/app/api/import/sci/execute-bulk/route.ts`):

```bash
git show <ob-177-parent-SHA>:web/src/app/api/import/sci/execute-bulk/route.ts | grep -n -B 3 -A 10 "ROLE_TARGETS\|meta\.role\|enrichment"
```

PASTE output.

For HF-190 P1 parent — same file, same grep pattern.

For HF-190 P2 parent — same file, same grep pattern.

For HF-199 D3 parent (pre-HF-199-D3 state of `web/src/lib/sci/entity-resolution.ts`):

```bash
git show <hf-199-d3-parent-SHA>:web/src/lib/sci/entity-resolution.ts | grep -n -B 3 -A 10 "temporal_attributes\|buildTemporalAttrs"
```

PASTE output.

For OB-156 parent — read OB-156 changeset (`git show <OB-156-SHA>`) to identify which file(s) it touched, then run pre-OB-156 versions of those file sections.

## DIMENSION 4 — RECONCILIATION-COMMIT ALIGNMENT

For each Meridian-reconciliation commit identified in Dimension 1:
- Was it BEFORE or AFTER each drift commit?
- Produce a timeline table:

| Date | SHA | Type (reconciliation / drift) | Description |
|---|---|---|---|

## DIMENSION 5 — TENANT-DATA EVIDENCE (READ-ONLY)

If any reconciliation script or test fixture is present in the repo for Meridian, paste its content:

```bash
find . -path ./node_modules -prune -o -type f -name "*.ts" -print | xargs grep -l "Meridian\|tipo_coordinador\|185063\|185,063" 2>/dev/null | head -20
```

For each file, paste the relevant excerpt. CC does NOT execute the scripts; only reads them.

## DIMENSION 6 — EMPIRICAL FINDINGS

CC writes 5-7 single-sentence facts:
- Did Meridian have a reconciled baseline at any point in git history? (yes/no + commit SHA + date)
- Did the pre-OB-177 / pre-HF-190 / pre-HF-199-D3 states of the four sites have ROLE_TARGETS? Same allowlist, different allowlist, or no ROLE_TARGETS at all?
- Did pre-drift code preserve literal source field names, or canonicalize differently, or not write to those substrate surfaces at all?
- Was the reconciliation-commit timeline before or after the drift-commit timeline?
- Are there any reconciliation scripts referencing Meridian's variant attribute (`tipo_coordinador` or other canonical name)?

NO interpretation. NO recommendations. Architect interprets.

## REPORT

Write findings to `/tmp/DIAG_026_PREDRIFT_BASELINE_REPORT_<YYYYMMDD>.md` with sections corresponding to Dimensions 1-6.

Then create completion report at `docs/completion-reports/DIAG-026_PREDRIFT_BASELINE_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure.

PASTE both file paths + ls -la verification + completion report content in chat.

NO commits. Branch left untracked for architect disposition.
```
