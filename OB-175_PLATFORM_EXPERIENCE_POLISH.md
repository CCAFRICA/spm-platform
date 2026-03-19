# OB-175: PLATFORM EXPERIENCE POLISH — PRE-WALKTHROUGH READINESS
## Import Display + Calculate UX + Stream Refinement + Stale Artifact Cleanup

**Date:** March 17, 2026
**Type:** Objective Build
**Sequence:** OB-175
**Governing Specifications:** DS-013 (Platform Experience Architecture), DS-016/017 (Ingestion Architecture)
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.

---

## STANDING RULES ACTIVE

All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Read that file first.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### ADDITIONAL RULES
- Standing Rule 4: Do NOT include ground truth values in any output. Andrew verifies independently.
- Standing Rule 34: No bypass recommendations.
- Korean Test on all code.

---

## PURPOSE

The BCL 6-month proof is complete ($312,033 exact through async pipeline). The engine and import pipeline are proven. This OB addresses the accumulated UX and display findings so the platform is ready for a clean-site end-to-end walkthrough.

**This OB does NOT modify the calculation engine, convergence bindings, SCI classification logic, or any API that produces correct results.**

---

## READ THESE DOCUMENTS BEFORE PROCEEDING

1. `CC_STANDING_ARCHITECTURE_RULES.md` — at repo root
2. `DS-013_Platform_Experience_Architecture_20260310.docx` — in project knowledge

---

## PHASE 1: IMPORT DISPLAY — FILE NAMES AND CONTENT UNIT IDENTITY

### CLT Findings Addressed
| Finding | Description | Sev |
|---|---|---|
| CLT174-F02 | File names display as internal storage paths with timestamps/UUIDs | P0 |
| CLT174-F03 | All content units labeled "Datos" — no file-of-origin indicator | P1 |
| CLT174-F05 | File list displayed twice (gray box + individual entries) | P2 |
| CLT173-F23 | Classification metadata exposed to user (identifierRepeatRatio) | P2 |

### Mission 1.1: Display original file names, not storage paths
On the import review page (after file upload, before confirm):
- The file list at the top should show ORIGINAL file names: `BCL_Datos_Oct2025.xlsx`, not `1773764413261_5_b37b293b_BCL_Datos_Oct2025.xlsx`
- Strip the HF-141 storage prefix (`timestamp_index_uuid8_`) from display names
- The regex from HF-142 (`^\d+_\d+_[a-f0-9]{8}_`) can be reused for display stripping
- Apply wherever file names are rendered: file list, content unit cards, import complete summary

### Mission 1.2: Content unit cards show source file name
Each content unit card currently shows only "Datos" (the sheet name). Add the source file name:
- Display: "Datos — BCL_Datos_Oct2025.xlsx" or "BCL_Datos_Oct2025.xlsx > Datos"
- The source file name is available from the content unit's `sourceFile` property or `contentUnitId` (format: `fileName::sheetName::tabIndex`)
- This allows the user to distinguish which month is which when all sheets have the same name

### Mission 1.3: Remove duplicate file list
The import review page shows the file list twice — once in a gray box at the top and again as individual file path entries below it. Remove the duplicate. Keep ONE clear file list.

### Mission 1.4: Hide developer metadata from user
The classification display should NOT show:
- `identifierRepeatRatio`, `numericFieldRatio`, `idRepeatRatio`
- composite signature details
- Any internal scoring metrics
The user sees: classification type (Transaction), confidence percentage (84%), and field role summary (13 columns, 9 measures, 1 identifier, 1 temporal). Not the raw heuristic scores.

### Hard Proof Gates — Phase 1
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-1-1 | File names display as original names without storage prefix | Paste rendered HTML or DOM showing clean file names |
| HG-1-2 | Each content unit card shows source file name alongside sheet name | Paste card content showing "Datos — BCL_Datos_Oct2025.xlsx" or equivalent |
| HG-1-3 | File list appears once, not twice | Paste page structure showing single file list |
| HG-1-4 | No identifierRepeatRatio or internal metrics visible to user | Paste expanded card content showing only user-facing information |

### Commit
`git add -A && git commit -m "OB-175 Phase 1: Import display — clean file names, source file identity, no dev metadata"`

---

## PHASE 2: IMPORT COMPLETE — POST-IMPORT SUMMARY

### CLT Findings Addressed
| Finding | Description | Sev |
|---|---|---|
| CLT174-F03 | Import complete page shows "Datos" × 6 with no month distinction | P1 |
| CLT173-F04 | Confidence display doesn't reflect Tier 1 recognition | P1 |

### Mission 2.1: Import complete shows file-of-origin per content unit
The "WHAT WAS IMPORTED" section shows 6 rows all labeled "Datos — Transaction Data — 85 rows". Each row must include the source file name so the user can verify which months were imported.

### Mission 2.2: Show recognition tier on import complete
If DS-017 fingerprinting classified a file as Tier 1 (recognized instantly), show this on the import complete page:
- "Recognized instantly" or "⚡ Instant" badge for Tier 1
- "Classified" for Tier 3
- This information is available from the `processing_jobs.recognition_tier` column

### Hard Proof Gates — Phase 2
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-2-1 | Import complete shows source file name per content unit | Paste import complete section showing distinct file names |
| HG-2-2 | Recognition tier visible per content unit | Paste tier badge or label |

### Commit
`git add -A && git commit -m "OB-175 Phase 2: Import complete — file names and recognition tier"`

---

## PHASE 3: CALCULATE PAGE — COMPONENT BREAKDOWN VERIFICATION

### CLT Findings Addressed
| Finding | Description | Sev |
|---|---|---|
| CLT173-F08 | Component breakdown on Calculate page (OB-173B built, needs verification) | P1 |
| CLT173-F09 | Period comparison on Calculate page (OB-173B built, needs verification) | P1 |

### Mission 3.1: Verify component breakdown renders after calculation
OB-173B added component breakdown to PlanCard. Verify it works with the current data:
- After calculating any period, the plan card should show per-component totals
- Component names should come from the plan, not generic labels
- Component amounts should sum to the grand total

### Mission 3.2: Verify period comparison renders
After calculating 2+ periods, the plan card should show:
- "vs. $X last period (+Y%)" with green/red trend indicators
- "First calculation — no prior period" for the first period calculated

### Mission 3.3: Fix any rendering issues discovered
If component breakdown or period comparison don't render (due to data shape changes from OB-174 async pipeline), fix the rendering. The PlanCard component may need to handle the new import batch structure.

### Hard Proof Gates — Phase 3
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-3-1 | Component breakdown visible after calculation with named components | Paste DOM or screenshot showing component names and amounts |
| HG-3-2 | Component amounts sum to grand total | Paste values and sum |
| HG-3-3 | Period comparison shows delta and percentage | Paste comparison text |

### Commit
`git add -A && git commit -m "OB-175 Phase 3: Calculate page component breakdown + period comparison verification"`

---

## PHASE 4: STREAM — DISPLAY REFINEMENTS

### CLT Findings Addressed
| Finding | Description | Sev |
|---|---|---|
| CLT173-F16 | Unnecessary .00 on whole-dollar amounts (OB-173 partially fixed) | P2 |
| CLT174-F01 | Empty tenant landing should show tenant context, not just "No Intelligence" | P1 |

### Mission 4.1: Verify currency formatting globally
OB-173 added currency formatting to suppress .00 on whole-dollar amounts. Verify this is applied:
- On /stream: trajectory amounts, system health total, component velocities
- On /operate/calculate: grand total, component breakdown
- On import complete: if any amounts are shown

Fix any locations where .00 still appears on whole-dollar amounts.

### Mission 4.2: Empty tenant landing context
When /stream has no calculation results (clean tenant), show tenant context instead of bare "No Intelligence Available":
- Plan name and entity count (from rule_sets and entities tables)
- Period count (from periods table)
- Data status: "X rows of transaction data imported" or "No data imported"
- Pipeline readiness: what's ready, what's missing
- This transforms "empty" from "nothing here" to "here's what exists, here's what's needed"

This is a domain-agnostic empty state — works for any tenant, any module. Korean Test applies.

### Hard Proof Gates — Phase 4
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-4-1 | No .00 on whole-dollar amounts anywhere on /stream | Paste DOM showing clean currency |
| HG-4-2 | Empty tenant landing shows plan name, entity count, period count | Paste empty state content |

### Commit
`git add -A && git commit -m "OB-175 Phase 4: Stream currency formatting + empty state context"`

---

## PHASE 5: STALE ARTIFACT CLEANUP

### Mission 5.1: Verify HF-141 superseded by OB-174/HF-142
HF-141 (PR #259) added strict per-file path resolution and diagnostic logging. OB-174 and HF-142 superseded this with the async pipeline and content unit identity fix. Verify:
- Are there any HF-141-specific code paths that are now dead code?
- Is the HF-141 diagnostic logging still useful or is it noise?
- Clean up any dead code paths left by the HF-139/140/141 fix chain that OB-174 replaced

### Mission 5.2: Remove legacy synchronous import fallback dead code
OB-174 introduced the async pipeline. The old synchronous path may still exist as fallback. If the async path is the canonical path and the fallback is unreachable in production:
- Mark the fallback clearly with comments: "Legacy synchronous path — retained for graceful degradation when processing_jobs table unavailable"
- OR remove if truly unreachable
- Do NOT remove if it serves as a genuine fallback for infrastructure issues

### Mission 5.3: Verify rawDataRef.current legacy path
CLT173-F24: `rawDataRef.current = files[0].parsedData` still stores only first file for the legacy non-storage execution path. If this path is retained as fallback, it needs the same multi-file treatment. If the path is removed, this finding is resolved.

### Hard Proof Gates — Phase 5
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-5-1 | Dead code from HF-139/140/141 chain identified and cleaned or marked | Paste grep results or code inventory |
| HG-5-2 | Legacy fallback path status documented (retained with comment or removed) | Paste code showing the decision |
| HG-5-3 | rawDataRef.current multi-file status resolved | Paste code showing fix or removal |

### Commit
`git add -A && git commit -m "OB-175 Phase 5: Stale artifact cleanup — HF chain and legacy fallback"`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-175_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure (Rule 26 — MANDATORY)

```markdown
# OB-175 COMPLETION REPORT
## Date: [date]
## Execution Time: [start] to [end]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
[All proof gates from Phases 1-5]

## STANDING RULE COMPLIANCE
- Rule 25 (report BEFORE final build): PASS/FAIL
- Rule 26 (mandatory structure): PASS
- Rule 27 (evidence = paste): PASS/FAIL
- Rule 28 (one commit per phase): PASS/FAIL

## KNOWN ISSUES
- [anything discovered]

## BUILD OUTPUT
[paste last 10 lines of npm run build]
```

### Workflow (Rule 25)
1. Execute Phase 1 — commit
2. Execute Phase 2 — commit
3. Execute Phase 3 — commit
4. Execute Phase 4 — commit
5. Execute Phase 5 — commit
6. **CREATE `OB-175_COMPLETION_REPORT.md` in project root with all evidence**
7. `git add -A && git commit -m "OB-175: Completion report"`
8. Kill dev server → `rm -rf .next` → `npm run build`
9. **APPEND build output to completion report**
10. `git add -A && git commit -m "OB-175: Build verification appended"`
11. `git push origin dev`
12. `gh pr create --base main --head dev --title "OB-175: Platform Experience Polish — Pre-Walkthrough Readiness" --body "Import display fixes (file names, content unit identity, dev metadata removal), Calculate page verification, Stream currency + empty state, stale artifact cleanup. Completion report: OB-175_COMPLETION_REPORT.md"`

---

## BROWSER TEST (Andrew — after merge)

### Test 1: Import display
Upload 2+ BCL files simultaneously.
- File names show original names (no storage prefixes)
- Content unit cards show source file name alongside sheet name
- File list appears once
- No developer metrics visible in expanded card

### Test 2: Import complete
After importing:
- Each content unit shows source file name
- Recognition tier visible (Tier 1 = "Recognized instantly" for known structures)

### Test 3: Calculate
Calculate any period.
- Component breakdown visible with named components
- Components sum to total
- Period comparison shows delta (if 2+ periods calculated)
- No .00 on whole-dollar amounts

### Test 4: Stream
Navigate to /stream after calculations.
- No .00 on whole-dollar amounts
- Cards visually differentiated (status/info/action from OB-173B)

### Test 5: Empty state
Clear all calculation data. Navigate to /stream.
- Shows tenant context (plan name, entity count, data status)
- Not bare "No Intelligence Available"

---

*"The engine is proven. The pipeline is proven. Now the experience must match."*
