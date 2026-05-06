# DIAG-034 / AUD-005 — Calc-Execution Live Code Reference (Substrate Promotion)

**Sequence:** DIAG-034 (this extraction); AUD-005 (substrate-promoted artifact, deliverable)
**Type:** Read-only forensic extraction; substrate-grade reference establishment
**Substrate authority:**
- T1-E905 (Prove Don't Describe) — substrate references must be live verifiable code, not stale snapshots
- T1-E906 (Closed-Loop Intelligence) — re-derivation requires reading current state, not assumed state
- Decision 124 (Research-Derived Design) — every architectural decision derived from proven research; research must be current
- T2-E46 (Reconciliation-Channel Separation) — CC executes extraction; architect reads; IRA cites
- T5-E1064 (Procedural Theater Minimization) — single extraction, structured for repeated reuse

**Predicate failure surfaced this session:** `AUD-001_CODE_EXTRACTION.md` was generated at HF-196 closure (commit `27c8b3a4`). Six HF-level commits have shipped since (HF-200 `2f2160c5`, HF-201 `63eed0a7`, HF-202 `b2b0c402`, HF-203 `6d03d54a`, HF-204 `6320faae`, HF-205 `61ae2524`). Architect-channel directives drafted from AUD-001 line numbers proved misaligned with live code (HF-205 directive cited line 34910; live code line was 1787 — different file structure entirely). HF-205 implemented valid cleanup but at wrong surface for BCL defect resolution.

**Resolution:** establish AUD-005 as a living, periodically-refreshed calc-execution code reference. Extraction follows commit cadence; refresh trigger is "any HF/OB/DIAG that modifies calc-execution surfaces." Each refresh produces a new versioned AUD-005 file at `/mnt/project/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<short_SHA>.md` so IRA + architect-channel + CC can cite the version-pinned reference rather than a stale singleton.

## DELIVERABLES

This DIAG produces:
1. **AUD-005 file at `/mnt/project/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<short_SHA>.md`** — verbatim live-code extraction, structured for substrate citation
2. **Completion report at `docs/completion-reports/DIAG-034_AUD-005_ESTABLISHMENT_COMPLETION_REPORT_20260506.md`** — proof gates, metadata, refresh discipline definition

## CC PASTE BLOCK

```markdown
# DIAG-034 / AUD-005 — Calc-Execution Live Code Reference

**Repo:** `~/spm-platform`
**Branch:** main (no branch creation; read-only diagnostic)
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-28 (read-only Phases adapt Rule 28)
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim source extraction
- T1-E906 (Closed-Loop Intelligence) — read-before-derive on current state
- Decision 124 (Research-Derived Design) — research must reflect current code
- T2-E46 (Reconciliation-Channel Separation) — CC extracts; architect reads; IRA cites
- T5-E1064 (Procedural Theater Minimization) — single extraction; structured reuse

## SCOPE

Read-only extraction of calc-execution code surfaces from current main HEAD. Output a single AUD-005 reference file in project knowledge format. Establish refresh discipline for future commits.

**No code modifications. No commits to spm-platform. No PRs.**

The single artifact produced (the AUD-005 file) is staged in repo at `docs/code-references/` AND copied to `/mnt/project/` for project-knowledge availability. The completion report at `docs/completion-reports/` is committed per Rule 6.

## EXECUTION

### Phase 0 — Establish baseline

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git rev-parse HEAD
git rev-parse --short HEAD
git log --oneline -30
```

PASTE output. Capture full SHA + short SHA + recent commit history for AUD-005 metadata.

### Phase 1 — Locate target files

```bash
find web/src -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs grep -l "resolveMetricsFromConvergenceBindings\|resolveColumnFromBatch\|executeBoundedLookup\|EntityData\|allEntityMetrics\|perComponentMetrics" | sort -u
```

PASTE output. This is the file inventory of calc-execution surfaces.

### Phase 2 — Capture target file structures

For EACH file from Phase 1, run:

```bash
wc -l <file>
git log --oneline -5 -- <file>
```

PASTE per-file output. Captures current line count + recent change history per file.

### Phase 3 — Extract calc-execution surfaces (verbatim)

For the following functions/interfaces, paste verbatim with file path + line range header:

#### 3.1 — `web/src/app/api/calculation/run/route.ts`

Extract lines 1-100 (imports + module-level setup). Then extract these surface ranges by locating the function/site and capturing 30-60 lines around each:

- `resolveColumnFromBatch` function (full body)
- `resolveMetricsFromConvergenceBindings` function (full body)
- The per-entity calc loop (the loop that iterates `calculationEntityIds` or equivalent — the surface where `perComponentMetrics` is populated and intent-executor is invoked)
- `EntityData` construction site within that loop
- All four sites where `allEntityMetrics` is referenced (per HF-205 completion report: lines 1434/1785/1853/1854 — verify in current code; lines may have shifted post-HF-205 merge)
- The `addLog COMPLETE` site at end of calc

For each surface, format the extraction as:

````
### `web/src/app/api/calculation/run/route.ts:<start>-<end>` — `<function or section name>`

```typescript
<verbatim code with leading line numbers>
```
````

#### 3.2 — `web/src/lib/calculation/intent-executor.ts`

Extract:
- File header + imports (lines 1-50 or until first export)
- `EntityData` interface definition (full)
- `executeIntent` function (full body)
- `resolveSource` function (full body)
- `executeBoundedLookup1D` function (full body)
- `executeBoundedLookup2D` function (full body)
- `findBoundaryIndex` function (full body)
- Any other exported function

Format each as in 3.1.

#### 3.3 — Other surfaces flagged by Phase 1

For any file from Phase 1 not covered in 3.1 / 3.2, extract the calc-execution-relevant functions in the same format.

### Phase 4 — Compose AUD-005 reference

Create file `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<short_SHA>.md` with the following structure:

```markdown
# AUD-005 — Calc-Execution Live Code Reference

**Generated at commit:** `<full SHA>` (short: `<short SHA>`)
**Generated by:** DIAG-034 (`docs/completion-reports/DIAG-034_AUD-005_ESTABLISHMENT_COMPLETION_REPORT_20260506.md`)
**Source repo:** `~/spm-platform` / `CCAFRICA/spm-platform`
**Generated date:** 2026-05-06
**Refresh discipline:** regenerate when any HF/OB/DIAG modifies surfaces in this reference. Refresh produces a new version `AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<new_short_SHA>.md`. Old versions retained for historical citation.
**Substrate role:** authoritative live-code reference for calc-execution forensic work; cited by IRA invocations, architect-channel directives, and CC dispatch payloads in lieu of stale AUD-001.
**Scope:** calc-execution code surfaces only. Excludes: ingestion, plan interpretation, convergence binding production, governance loops, agent/intelligence layers.

## Recent commit history (preceding 30 commits)

[Phase 0 git log output verbatim]

## File inventory (calc-execution surfaces)

[Phase 1 file list with Phase 2 per-file metadata]

## Extracted surfaces

[Phase 3 extractions, in order: 3.1 → 3.2 → 3.3]

## Refresh log

| Date | Commit | Trigger | Notes |
|---|---|---|---|
| 2026-05-06 | `<short_SHA>` | DIAG-034 establishment | Initial creation post-HF-205 merge |

(Subsequent refreshes append rows here per discipline.)
```

PASTE the AUD-005 file content in chat (or attach as separate paste if size warrants).

### Phase 5 — Stage AUD-005 in repo

```bash
mkdir -p docs/code-references
# AUD-005 file already created in Phase 4
ls -la docs/code-references/
```

PASTE output.

### Phase 6 — Copy AUD-005 to project knowledge surface

NOTE: this step is architect-side. CC notes the path in completion report; architect copies to `/mnt/project/` after CC completion.

CC paste block: "Architect: copy `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<short_SHA>.md` to `/mnt/project/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<short_SHA>.md` for project-knowledge availability."

### Phase 7 — Commit AUD-005 + completion report

```bash
cd ~/spm-platform
git checkout -b diag-034-aud-005-establishment
git add docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<short_SHA>.md
git commit -m "DIAG-034: AUD-005 calc-execution live code reference established

Establishes AUD-005 as living calc-execution code reference superseding
stale AUD-001 pattern. AUD-001 was generated at HF-196 closure (27c8b3a4)
and decayed across 6 HF-level commits; architect-channel directives drafted
from AUD-001 line numbers misaligned with live code (HF-205 cited line
34910 in AUD-001; actual live code line was 1787).

AUD-005 refresh discipline: regenerate when any HF/OB/DIAG modifies
surfaces. Each refresh creates new versioned file
AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<short_SHA>.md preserving prior
versions for historical citation.

AUD-005 substrate role: authoritative live-code reference for IRA
invocations, architect-channel directives, CC dispatch payloads.
Replaces AUD-001 citation pattern.

Substrate: T1-E905 (verbatim live code); T1-E906 (closed-loop on current
state); Decision 124 (research-derived from current code); T2-E46
(CC extracts; architect reads; IRA cites); T5-E1064 (single extraction,
structured for reuse)."
git push origin diag-034-aud-005-establishment
```

PASTE output including commit SHA.

### Phase 8 — Open PR

```bash
gh pr create --title "DIAG-034: AUD-005 calc-execution live code reference establishment" \
  --body "Establishes living calc-execution code reference superseding stale AUD-001. See commit message for refresh discipline and substrate role."
```

PASTE PR number.

### Phase 9 — Completion report

Write `docs/completion-reports/DIAG-034_AUD-005_ESTABLISHMENT_COMPLETION_REPORT_20260506.md` per Rule 26.

Hard Gates:
- Phase 0 SHA + git log captured
- Phase 1 file inventory captured
- Phase 2 per-file metadata captured
- Phase 3 all surfaces extracted verbatim with line numbers
- Phase 4 AUD-005 file composed with full structure
- Phase 5 file staged in `docs/code-references/`
- Phase 6 architect-action note included
- Phase 7 commit SHA + push confirmation
- Phase 8 PR number

Soft Gates:
- T1-E905 PASS (verbatim only)
- T1-E906 PASS (current state read)
- Decision 124 PASS (research = current code)
- T2-E46 PASS (CC extract; architect interpret)
- T5-E1064 PASS (single extraction, structured reuse)

Substrate promotion candidates surfaced:
- "AUD-005 established as living reference; AUD-001 citation pattern deprecated; future IRA invocations cite AUD-005 by version-pinned commit SHA"
- "Refresh discipline: regenerate on any HF/OB/DIAG modifying calc-execution surfaces"

Known Issues:
- Initial AUD-005 generated post-HF-205 — captures HF-205-altered surfaces alongside legacy structure
- Refresh cadence is per-commit-trigger, not scheduled; relies on architect/CC discipline to remember
- AUD-005 scope limited to calc-execution; ingestion / plan interpretation / convergence-binding-production / governance loops would require AUD-006/-007/-008 follow-on if substrate citation needed

PASTE completion report content in chat.

## HALT CONDITIONS

HALT if:
- Phase 1 returns zero matches (file moves; surface to architect)
- Phase 3 extraction reveals function not present at expected surface (function rename; surface to architect with current name)
- Phase 4 AUD-005 file exceeds 5000 lines (unusually large extraction; verify scope before composing)

Otherwise: execute continuously through Phases 0-9.

## NO FURTHER SCOPE

Single deliverable: AUD-005 establishment + completion report. No code changes. No defect remediation. No HF/OB. Substrate promotion of AUD-005 (formal ICA capture) deferred to focused promotion wave per architect direction.

END OF DIRECTIVE.
```

## ARCHITECT POST-COMPLETION ACTIONS

1. **Copy AUD-005 file** from `~/spm-platform/docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<SHA>.md` to `/mnt/project/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<SHA>.md` for Claude project-knowledge availability
2. **Drop AUD-001** from active citation (keep file as historical artifact)
3. **Use AUD-005 in subsequent forensic / IRA / HF directive drafting**
4. **Add AUD-005 refresh trigger to standing rules** (post-reconciliation focused effort): "any commit touching calc-execution surfaces requires AUD-005 refresh"

## SUBSTRATE PROMOTION ALIGNMENT

This DIAG is itself a substrate-coherence event:
- Establishes AUD-005 pattern (verifiable, refreshable, version-pinned code reference)
- Surfaces the failure mode of AUD-001 (singleton snapshot decay) as architectural lesson
- Adds to pending promotion wave: 6 supersession_candidates now (5 prior from IRA HF-201 + IRA HF-205; 1 new from DIAG-034 — "snapshot-singleton code-reference pattern superseded by versioned-living-reference pattern")
