# HF-140: MULTI-FILE IMPORT — FILE CONTENT ISOLATION
## Single Issue: SCI Bulk Execution Reads First File's Content for All Files

**Date:** March 16, 2026
**Type:** Hot Fix
**Sequence:** HF-140
**Predecessor:** DIAG-004 (PR #257) — root cause confirmed with database evidence
**Governing Specification:** DS-013 (Platform Experience Architecture)
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

## THE PROBLEM — CONFIRMED BY DIAG-004

When a user selects multiple files simultaneously (e.g., BCL_Datos_Ene2026.xlsx + BCL_Datos_Feb2026.xlsx + BCL_Datos_Mar2026.xlsx), the SCI bulk import pipeline:

1. Creates 3 separate `import_batches` records (correct)
2. Creates 3 separate content unit cards on the UI (correct — HF-139 fixed this)
3. **Reads the FIRST file's content and commits it to ALL 3 batches** (BUG)

**DIAG-004 evidence:**
- 255 rows at source_date 2026-01-01 instead of 85 Jan + 85 Feb + 85 Mar
- All 3 batches have identical row_data (same Periodo: 2026-01-01, same metrics)
- All 3 batches have data_type: `datos_ene` (January's classification)
- Zero rows exist for 2026-02 or 2026-03 source_dates
- Shared SCI execution ID (`e6c28629`) across all 3 batches

**The bug is in the SCI execution pipeline, not the UI and not the engine.**

---

## PHASE 0: DIAGNOSTIC (MANDATORY — Standing Rule 29)

**Do NOT write any fix code until this diagnostic is complete and committed to git.**

**Mission 0.1:** Locate the SCI bulk execution pipeline.
- The import_batches created by multi-file upload have file_name pattern `sci-bulk-{executionId}...`
- Find the code path that handles multi-file uploads: from file selection through SCI classification to committed_data insertion
- Trace the exact point where file content is read and passed to the SCI execution

**Mission 0.2:** Identify how files are iterated.
- The pipeline creates multiple content units from multiple files
- Find the loop or iteration that processes each file
- Paste the code that reads file content (e.g., XLSX parsing, sheet extraction)
- Identify: is there a shared variable, closure, or reference that causes all iterations to read the same file?

**Mission 0.3:** Identify how source_date is extracted.
- source_date comes from the file's data (e.g., the "Periodo" column)
- If all 3 batches get the same source_date, the source_date extraction is reading from the first file's parsed content, not each file's content independently

**Proof Gate 0:** Paste the exact code that reads file content during multi-file processing. Identify the specific variable or reference that causes the first file's content to be reused. Commit diagnostic to git.

---

## PHASE 1: FIX — FILE CONTENT ISOLATION

Based on Phase 0 diagnostic, implement the fix. The fix MUST achieve:

### 1.1 Each file's content is read independently
- When N files are selected for upload, the pipeline must parse each file separately
- Each file's parsed content (rows, column names, sheet names) is bound to its own content unit / import batch
- No shared mutable state between file processing iterations

### 1.2 Each batch receives its own file's data
- committed_data rows for batch 1 contain file 1's row_data with file 1's source_dates
- committed_data rows for batch 2 contain file 2's row_data with file 2's source_dates
- committed_data rows for batch 3 contain file 3's row_data with file 3's source_dates

### 1.3 source_date extracted per file
- Each file's "Periodo" or temporal column produces source_dates specific to that file
- File 1 (Ene): source_date = 2026-01-01
- File 2 (Feb): source_date = 2026-02-01
- File 3 (Mar): source_date = 2026-03-01

### 1.4 data_type classified per file
- Each file receives its own SCI classification
- File 1 should not force its data_type (datos_ene) onto File 2 and File 3
- Each file's content determines its own classification independently

### Korean Test
- No domain-specific logic in the fix
- The fix works for ANY set of files with ANY column names in ANY language
- File isolation is structural, not content-dependent

---

## PHASE 2: BUILD + VERIFY ON LOCALHOST

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must complete with zero errors
4. `npm run dev`
5. **Localhost verification (MANDATORY before completion report):**
   - Upload 2+ files simultaneously on localhost
   - After import, run SQL to verify each batch has DIFFERENT row_data content
   - Paste the SQL query and results

---

## PHASE 3: DATA CLEANUP SQL

After the code fix is verified, produce a SQL script that Andrew will run to clean up the corrupted data from the prior multi-file import. This is a SCRIPT to be reviewed, not executed by CC.

```sql
-- CLEANUP: Remove 3 duplicate January batches from multi-file import
-- These batches contain January data incorrectly committed for Feb/Mar
-- Batch IDs from DIAG-004: f3581470, ddb8cd9a, f0b7b125

-- Step 1: Delete committed_data for the 3 duplicate batches
DELETE FROM committed_data 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND batch_id IN ('f3581470-...', 'ddb8cd9a-...', 'f0b7b125-...');
-- Expected: 255 rows deleted (85 × 3)

-- Step 2: Delete the import_batches records
DELETE FROM import_batches
WHERE id IN ('f3581470-...', 'ddb8cd9a-...', 'f0b7b125-...');
-- Expected: 3 rows deleted

-- Step 3: Verify cleanup
SELECT count(*) FROM committed_data 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
-- Expected: 340 rows (85 Oct + 85 Nov + 85 Dec + 85 personal = 340)
-- Jan/Feb/Mar datos will be re-imported through the fixed pipeline
```

**IMPORTANT:** The full UUIDs for the 3 batches must come from DIAG-004 Query 1.2. Paste the full UUIDs in the cleanup script — do not use truncated IDs.

Save this script as `DIAG-004_CLEANUP.sql` in the project root. Andrew will review and execute it manually.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-140_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure (Rule 26 — MANDATORY)

```markdown
# HF-140 COMPLETION REPORT
## Date: [date]
## Execution Time: [start] to [end]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PHASE 0 DIAGNOSTIC
Root cause location: [exact file, exact line, exact variable]
Code before fix: [paste the buggy code]

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1 | Each file's content is read independently | | [paste the fixed code showing per-file iteration] |
| HG-2 | Each batch receives its own file's data | | [paste localhost SQL showing different row_data per batch] |
| HG-3 | source_date extracted per file | | [paste localhost SQL showing different source_dates per batch] |
| HG-4 | data_type classified per file | | [paste localhost SQL or log showing different classifications] |
| HG-5 | Cleanup SQL script produced with full UUIDs | | [paste script location and first 3 lines] |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL — ___ commits for ___ phases
- Rule 25 (report BEFORE final build): PASS/FAIL
- Rule 26 (mandatory structure): PASS — this structure
- Rule 27 (evidence = paste): PASS/FAIL
- Rule 28 (one commit per phase): PASS/FAIL
- Rule 30 (one issue): PASS — multi-file content isolation only

## KNOWN ISSUES
- [anything discovered during fix]

## BUILD OUTPUT
[paste last 10 lines of npm run build]
```

### Workflow (Rule 25 — REPORT IS FIRST DELIVERABLE, NOT LAST)
1. Execute Phase 0 diagnostic — commit
2. Execute Phase 1 fix — commit
3. Execute Phase 2 build + localhost verify
4. Execute Phase 3 cleanup script — commit
5. **CREATE `HF-140_COMPLETION_REPORT.md` in project root with all evidence**
6. `git add -A && git commit -m "HF-140: Completion report"`
7. Kill dev server → `rm -rf .next` → `npm run build`
8. **APPEND build output to completion report**
9. `git add -A && git commit -m "HF-140: Build verification appended"`
10. `git push origin dev`
11. `gh pr create --base main --head dev --title "HF-140: Multi-file import file content isolation" --body "Fixes DIAG-004 root cause: SCI bulk execution read first file content for all files. Each file now parsed independently. Includes data cleanup SQL for Andrew to review. Completion report: HF-140_COMPLETION_REPORT.md"`

---

## BROWSER TEST (Andrew — after merge + data cleanup + re-import)

### Step 1: Run cleanup SQL
Execute `DIAG-004_CLEANUP.sql` in Supabase SQL Editor. Verify 340 rows remain.

### Step 2: Re-import Feb + Mar via multi-file upload
Navigate to /operate/import → select BCL_Datos_Feb2026.xlsx AND BCL_Datos_Mar2026.xlsx simultaneously.

**Expected:**
1. Two content unit cards, independently expandable
2. Confirm All → "2 of 2 confirmed"
3. Import button active → Import 170 rows
4. After import, verify in Supabase:
```sql
SELECT date_trunc('month', source_date)::date AS month, count(*)
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
```
**Expected:** 2026-02: 85 rows, 2026-03: 85 rows (with distinct data, not duplicates)

### Step 3: Calculate February
/operate/calculate → February 2026 → Calculate.
**Must show $53,215 exactly.**

### Step 4: Calculate March
/operate/calculate → March 2026 → Calculate.
**Must show $58,406 exactly.**

### Step 5: Verify 6-month total
$44,590 + $46,291 + $61,986 + $47,545 + $53,215 + $58,406 = **$312,033**

**If ANY month is wrong, the fix failed.**

---

## WHAT THIS HF DOES NOT ADDRESS

- SCI confidence flat at 90% (DIAG future)
- Flywheel not improving (DIAG future)
- OB-173B remaining findings already delivered in PR #256
- Entity-to-user linking (separate OB)
- Manager/rep persona (separate OB)

---

*Standing Rule 30: One issue per prompt. Multi-file content isolation only.*
