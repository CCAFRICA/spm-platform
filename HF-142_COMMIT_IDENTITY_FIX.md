# HF-142: MULTI-FILE COMMIT — CONTENT UNIT IDENTITY + STORAGE PATH MATCHING
## Dual Fault Fix: DIAG-005 Root Cause (Fault 1 + Fault 2)

**Date:** March 17, 2026
**Type:** Hot Fix
**Sequence:** HF-142
**Predecessor:** DIAG-005 (PR #261) — dual fault confirmed with code evidence
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.

---

## STANDING RULES ACTIVE

All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Read that file first.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## THE PROBLEM — CONFIRMED BY DIAG-005

Two faults combine to break multi-file data commitment. Both must be fixed together.

### Fault 1 (Primary): contentUnitId uses sheet name, not unique identifier

`buildProposalFromState` in SCIExecution.tsx uses the `profileMap` key (sheet name "Datos") as the `contentUnitId`. When multiple files share the same sheet name (which is the common case — BCL has 6 files all with sheet "Datos"), all content units get the same ID. The `find()` call during commit always returns the first match. Result: one file group, one executeBulk call, one file downloaded for all 510 rows.

**DIAG-005 evidence:** All 6 content units have `contentUnitId: "Datos"`. The grouping code `fileGroups.get(sourceFile)` collapses all into one group.

### Fault 2 (Contributing): Storage path prefix regex doesn't match HF-141 format

The `process-job/route.ts` line 140 regex `^\d+_[a-f0-9]{8}_` was designed to strip old-format prefixes but doesn't match the HF-141 format `timestamp_index_uuid8_`. Even with unique contentUnitIds, `sourceFile` (prefixed) doesn't match `storagePathsRef` keys (original filenames), so the lookup fails.

**DIAG-005 evidence:** Regex tested against actual storage paths shows no match.

---

## PHASE 0: DIAGNOSTIC VERIFICATION (MANDATORY)

**Confirm DIAG-005 findings before writing any fix.**

### Mission 0.1: Verify Fault 1
Open `SCIExecution.tsx`, find `buildProposalFromState` or the function that constructs content units for the proposal.
- **PASTE the code that assigns contentUnitId.**
- **CONFIRM:** contentUnitId uses sheet name (e.g., "Datos"), not the unique `fileName::sheetName::tabIndex` format from `profile.contentUnitId`.

### Mission 0.2: Verify Fault 2
Open `process-job/route.ts` (or the file containing the regex).
- **PASTE the regex and the code that uses it to strip prefixes.**
- **PASTE an actual storage path from the latest import** (from DIAG-005 Query 2.3).
- **CONFIRM:** the regex does not match the actual path format.

### Mission 0.3: Verify the unique identifier exists
- Search for `contentUnitId` across the codebase. Where is the unique `fileName::sheetName::tabIndex` format generated?
- **PASTE the code that generates the unique ID.**
- **CONFIRM:** the unique ID exists in the pipeline but is not used in `buildProposalFromState`.

**Proof Gate 0:** All three faults confirmed with pasted code. Committed to git before fix.

---

## PHASE 1: FIX FAULT 1 — CONTENT UNIT IDENTITY

### Mission 1.1: Use unique contentUnitId in buildProposalFromState
- Replace the sheet-name-based contentUnitId with the unique identifier that distinguishes each file's content unit
- The unique ID must incorporate the source file name so that files with the same sheet name ("Datos") produce different contentUnitIds
- Format: `{originalFileName}::{sheetName}::{tabIndex}` or equivalent — as long as it is unique per file

### Mission 1.2: Propagate unique ID through the commit chain
- The contentUnitId assigned in the proposal must survive through: user confirmation → commit trigger → executeBulk call → file download
- The grouping code (`fileGroups`) must group by the SOURCE FILE, not by sheet name
- Each group's executeBulk call must receive the CORRECT storage path for that specific file

### Korean Test
- The fix must work when multiple files from different tenants, in different languages, all have the same sheet name
- Sheet name "Datos" = sheet name "Data" = sheet name "시트1" — all must produce unique contentUnitIds when from different files

### Hard Proof Gates — Phase 1
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-1-1 | contentUnitId is unique per file even when sheet names are identical | Paste the new assignment code |
| HG-1-2 | 6 files with sheet "Datos" produce 6 DIFFERENT contentUnitIds | Paste log or test output showing 6 distinct IDs |
| HG-1-3 | Grouping produces 6 file groups, not 1 | Paste the grouping code and log showing 6 groups |

### Commit
`git add -A && git commit -m "HF-142 Phase 1: Unique contentUnitId per file"`

---

## PHASE 2: FIX FAULT 2 — STORAGE PATH MATCHING

### Mission 2.1: Fix the prefix stripping regex
- The regex must match the ACTUAL storage path format produced by HF-141: `timestamp_index_uuid8_originalFilename.xlsx`
- Test the regex against real storage paths from the latest import (paste from DIAG-005)
- After stripping, the result must equal the original filename

### Mission 2.2: Verify storagePathsRef key format
- Confirm what keys storagePathsRef uses (original filenames? prefixed names?)
- Ensure the stripped sourceFile matches the storagePathsRef key format
- If storagePathsRef uses original filenames, the regex must strip to original filename
- If storagePathsRef uses prefixed names, the regex is not needed

### Mission 2.3: Add defensive logging
Add a log line at the point where sourceFile is resolved to a storage path:
```
[HF-142] sourceFile: {sourceFile} → storagePath: {resolvedPath} (matched: {true/false})
```
This proves each file resolves to its own storage path.

### Hard Proof Gates — Phase 2
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-2-1 | Regex matches actual HF-141 storage path format | Paste regex test against real path showing successful strip |
| HG-2-2 | Each sourceFile resolves to a DIFFERENT storagePath | Paste log output showing 6 different resolved paths |
| HG-2-3 | No fallback to a shared/default path occurs | Paste code showing multi-file mode has no cross-file fallback (Standing Rule from HF-141) |

### Commit
`git add -A && git commit -m "HF-142 Phase 2: Storage path regex fix for HF-141 format"`

---

## PHASE 3: END-TO-END VERIFICATION ON LOCALHOST

### Mission 3.1: Build
Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`

### Mission 3.2: Localhost test (if possible with test data)
Upload multiple files with the same sheet name on localhost. Verify:
- Each file produces a unique contentUnitId
- Each executeBulk call downloads a DIFFERENT file
- Each batch has DIFFERENT source_dates in committed_data

### Hard Proof Gates — Phase 3
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-3-1 | npm run build: zero errors | Paste last 5 lines |
| HG-3-2 | Multiple files produce multiple executeBulk calls | Paste log or code trace |

### Commit
`git add -A && git commit -m "HF-142 Phase 3: Build verification"`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-142_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure (Rule 26 — MANDATORY)

```markdown
# HF-142 COMPLETION REPORT
## Date: [date]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES MODIFIED
| File | Change |

## PHASE 0 DIAGNOSTIC VERIFICATION
### Mission 0.1 — Fault 1 confirmed:
[paste contentUnitId assignment code — before fix]

### Mission 0.2 — Fault 2 confirmed:
[paste regex + test against real path]

### Mission 0.3 — Unique ID exists:
[paste where unique ID is generated]

## PROOF GATES — HARD
| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1-1 | contentUnitId unique per file | | [paste new code] |
| HG-1-2 | 6 files produce 6 different IDs | | [paste log/test] |
| HG-1-3 | Grouping produces 6 groups | | [paste code + log] |
| HG-2-1 | Regex matches HF-141 format | | [paste regex test] |
| HG-2-2 | 6 different resolved paths | | [paste log] |
| HG-2-3 | No cross-file fallback | | [paste code] |
| HG-3-1 | Build clean | | [paste output] |
| HG-3-2 | Multiple executeBulk calls | | [paste log/trace] |

## STANDING RULE COMPLIANCE
- Rule 25 (report BEFORE build): PASS/FAIL
- Rule 27 (evidence = paste): PASS/FAIL
- Rule 28 (one commit per phase): PASS/FAIL
- Rule 30 (one issue — dual fault counts as one): PASS

## KNOWN ISSUES
- [anything discovered]

## BUILD OUTPUT
[paste last 10 lines]
```

### Workflow (Rule 25)
1. Execute Phase 0 diagnostic verification — commit
2. Execute Phase 1 Fault 1 fix — commit
3. Execute Phase 2 Fault 2 fix — commit
4. Execute Phase 3 build verification
5. **CREATE `HF-142_COMPLETION_REPORT.md` in project root with all evidence**
6. `git add -A && git commit -m "HF-142: Completion report"`
7. Kill dev server → `rm -rf .next` → `npm run build`
8. **APPEND build output to completion report**
9. `git add -A && git commit -m "HF-142: Build verification appended"`
10. `git push origin dev`
11. `gh pr create --base main --head dev --title "HF-142: Multi-file commit content unit identity + storage path matching" --body "Fixes DIAG-005 dual fault: (1) contentUnitId uses unique per-file identifier instead of shared sheet name, (2) storage path regex matches HF-141 prefix format. Both faults fixed together — either alone still produces wrong results. Completion report: HF-142_COMPLETION_REPORT.md"`

---

## BROWSER TEST (Andrew — after merge)

### Step 1: Clean slate
```sql
DELETE FROM committed_data WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND source_date IS NOT NULL;
DELETE FROM processing_jobs WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

### Step 2: Upload 6 files simultaneously
Upload Oct/Nov/Dec/Jan/Feb/Mar BCL files.

### Step 3: Confirm and import

### Step 4: Verify source_dates
```sql
SELECT date_trunc('month', source_date)::date AS month, count(*)
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND source_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
```
**Expected: 6 months, 85 rows each. NOT 510 rows at one date.**

### Step 5: Calculate all 6 months
Calculate each period (Oct 2025 through Mar 2026). Andrew will verify each result against the ground truth file (BCL_Resultados_Esperados.xlsx). All 6 months must be 100% exact. The 6-month total must match GT exactly.

**CC does not receive GT values. Andrew verifies independently.**

### Step 6: Verify flywheel
```sql
SELECT fingerprint_hash, match_count, confidence
FROM structural_fingerprints
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```
**Expected: One fingerprint with match_count >= 5.**

**If source_dates are wrong again, the fix failed. Do not calculate.**

---

*Standing Rule 30: One issue (dual fault = one root cause at the commit identity layer).*
*"The third time the same class of bug appears, the fix must address the FULL CHAIN."*
