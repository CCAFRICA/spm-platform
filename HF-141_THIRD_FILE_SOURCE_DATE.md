# HF-141: MULTI-FILE IMPORT — PER-FILE DATA ISOLATION (N FILES)
## Single Issue: Files After the First Share Source_Dates and/or Content with Prior Files

**Date:** March 17, 2026
**Type:** Hot Fix
**Sequence:** HF-141
**Predecessors:** DIAG-004 (root cause: multi-file content sharing), HF-140 (partial fix: file upload isolation — fixed file 2, not file 3+)
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

## THE PROBLEM

HF-140 fixed multi-file upload so each file gets its own storage path and executeBulk call. This fixed file 2 (February) — it now calculates correctly at $53,215. But file 3 (March) still calculates to $9,150 (C4 only, same as pre-fix February).

**Evidence from Vercel production logs:**

February calculation:
- `OB-152 source_date path: 170 rows for 2026-02-01..2026-02-28` — found rows
- `Fetched 255 committed_data rows` — **TOO MANY.** Expected 170 (85 datos + 85 personal). The extra 85 rows are March's datos with February source_dates.

March calculation:
- `OB-152 period_id fallback: 0 rows` — source_date path line MISSING, jumped straight to fallback
- `Fetched 85 committed_data rows` — personal only, zero datos
- `HF-108 Resolution path: sheet-matching (fallback)` — convergence bindings failed
- `Grand total: 9,150` — C4 only

**Conclusion:** March's 85 datos rows EXIST in committed_data (the import reported 255 rows for 3 files) but were committed with February's source_date (2026-02-01) instead of March's source_date (2026-03-01). This is why February sees 255 rows (its own 85 + March's 85 + 85 personal) and March sees 0 datos rows.

**HF-140 fixed file upload isolation but did not fully fix source_date assignment per file.**

## THE STRUCTURAL REQUIREMENT (Standing Rule 2 — Scale by Design)

This fix MUST NOT be scoped to "3 files work." The multi-file import pipeline must handle N files — any number, any dates, any combination. If a user uploads 12 monthly files simultaneously, all 12 must commit with their own source_dates, their own data, their own classifications. The fix must eliminate ALL shared state between per-file execution calls, not just patch the specific failure observed with file 3 of 3.

**The diagnostic must trace every layer where state could leak between files and ensure complete isolation for the general case, not just the 3-file case.**

---

## PHASE 0: DIAGNOSTIC (MANDATORY — Standing Rule 29)

**Do NOT write any fix code until this diagnostic is complete and committed to git.**

The fix must address the correct layer. There are four possible failure points in the multi-file pipeline. Trace EACH ONE with pasted code evidence:

### Mission 0.1: Content unit sourceFile assignment
Find where each content unit gets its `sourceFile` property.
- Open the import page component and the SCI classification component
- When 3 files are uploaded and classified, each content unit card should have a `sourceFile` that identifies which file it came from
- **PASTE the code that assigns sourceFile to each content unit**
- **VERIFY:** Do all 3 files get DISTINCT sourceFile values? Or do file 2 and file 3 share a sourceFile?

### Mission 0.2: executeBulk grouping and storage path mapping
Open `SCIExecution.tsx` (modified by HF-140).
- **PASTE the fileGroups construction code** — how units are grouped by sourceFile
- **PASTE the loop that calls executeBulk per group** — specifically how storagePaths[sourceFile] is resolved
- **VERIFY:** If file 3's sourceFile is 'BCL_Datos_Mar2026.xlsx', does `storagePaths['BCL_Datos_Mar2026.xlsx']` exist and point to a DIFFERENT path than file 2?

### Mission 0.3: Storage upload — are all 3 files uploaded?
Open `page.tsx` (modified by HF-140).
- **PASTE the parallel upload code** — the map over spreadsheetFiles
- **VERIFY:** After upload completes, does `storagePathsRef.current` have 3 DISTINCT entries with 3 DISTINCT keys?
- Check for race conditions: does the upload Promise.all complete BEFORE executeBulk is called?

### Mission 0.4: Server-side execute-bulk — file download and source_date extraction
Open the `execute-bulk` API route.
- **PASTE the code that downloads the file from storage** — does it receive the storage path as a parameter?
- **PASTE the code that extracts source_date from the file's data** — specifically the Periodo column parsing
- **VERIFY:** Is there ANY module-level or closure-level variable that persists between calls? Any cache of parsed file content?

### Mission 0.5: committed_data INSERT — source_date assignment
In the execute-bulk route, find where committed_data rows are inserted.
- **PASTE the INSERT code** — how source_date is set per row
- **VERIFY:** Is source_date extracted per-row from the file, or is it extracted once and applied to all rows? If extracted once, from which row?

**Proof Gate 0:** Root cause identified with pasted code from the EXACT line where the contamination occurs. Committed to git before any fix code.

---

## PHASE 1: FIX

Based on Phase 0 findings, implement the fix. The fix must ensure:

1. **Complete per-file isolation for N files.** When N files are uploaded simultaneously, each file's content, source_dates, classification, and committed_data rows are fully independent. No shared mutable state between executeBulk calls — no module-level variables, no closures capturing prior iterations, no cached parsed content.
2. **Source_date extracted from each file's own data.** Each file's Periodo (or temporal) column produces source_dates specific to that file. File 1 → its dates. File 2 → its dates. File N → its dates. No cross-contamination regardless of N.
3. **Verify the general case, not just 3 files.** The localhost verification must confirm that the architecture supports N files, not that a specific 3-file test passes. The diagnostic in Phase 0 must identify and eliminate ALL shared state, not just the one variable that caused the 3-file failure.
4. **Add diagnostic logging.** In execute-bulk, log per-call: `[HF-141] File: {storagePath}, rows: {count}, source_dates: {unique dates found}`. This persists as evidence that each call processed a different file.

### Korean Test
The fix is structural file isolation. No domain-specific logic.

---

## PHASE 2: BUILD + LOCALHOST VERIFY

1. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`
2. On localhost, upload 3 files with different months of data
3. After import, run SQL to verify:
```sql
SELECT batch_id, min(source_date), max(source_date), count(*)
FROM committed_data
WHERE tenant_id = '[test_tenant_id]'
  AND created_at > NOW() - INTERVAL '5 minutes'
GROUP BY batch_id;
```
**Expected:** 3 batches, each with DIFFERENT source_dates.

---

## PHASE 3: DATA CLEANUP SQL FOR MARCH

Produce a cleanup SQL script for the March rows that have incorrect source_dates. Andrew will review and execute.

```sql
-- CLEANUP: Fix March data committed with February source_dates
-- After HF-141 merge, Andrew will:
-- 1. Delete the March batch with wrong source_dates
-- 2. Re-import March through the fixed pipeline

-- Find the March batch (committed during the multi-file import, has Feb source_dates)
-- [CC: populate with actual batch_id from diagnostic]
```

Save as `HF-141_CLEANUP.sql` in project root.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-141_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure (Rule 26 — MANDATORY)

```markdown
# HF-141 COMPLETION REPORT
## Date: [date]
## Execution Time: [start] to [end]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PHASE 0 DIAGNOSTIC
### Mission 0.1 — sourceFile assignment:
[paste code]
Finding: [distinct/shared sourceFile per file]

### Mission 0.2 — executeBulk grouping:
[paste code]
Finding: [correct/incorrect path mapping for file 3]

### Mission 0.3 — storage upload:
[paste code]
Finding: [3 distinct paths / race condition / missing entry]

### Mission 0.4 — server-side execute-bulk:
[paste code]
Finding: [shared state / clean per-call isolation]

### Mission 0.5 — committed_data INSERT:
[paste code]
Finding: [per-row source_date / shared source_date variable]

### ROOT CAUSE: [exact file, exact line, exact variable]

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1 | Each file's Periodo column produces source_dates specific to that file | | [paste log output showing 3 different source_dates from 3 calls] |
| HG-2 | No shared state between executeBulk calls | | [paste the code showing isolation — no module-level vars, no closures] |
| HG-3 | Localhost SQL shows 3 batches with different source_dates | | [paste query + results] |
| HG-4 | Cleanup SQL script produced | | [paste file path and first 3 lines] |

## STANDING RULE COMPLIANCE
- Rule 25 (report BEFORE final build): PASS/FAIL
- Rule 26 (mandatory structure): PASS — this structure
- Rule 27 (evidence = paste): PASS/FAIL
- Rule 28 (one commit per phase): PASS/FAIL
- Rule 30 (one issue): PASS — source_date contamination only

## KNOWN ISSUES
- [anything discovered]

## BUILD OUTPUT
[paste last 10 lines of npm run build]
```

### Workflow (Rule 25)
1. Execute Phase 0 diagnostic — commit
2. Execute Phase 1 fix — commit
3. Execute Phase 2 build + verify
4. Execute Phase 3 cleanup SQL — commit
5. **CREATE `HF-141_COMPLETION_REPORT.md` in project root with all evidence**
6. `git add -A && git commit -m "HF-141: Completion report"`
7. Kill dev server → `rm -rf .next` → `npm run build`
8. **APPEND build output to completion report**
9. `git add -A && git commit -m "HF-141: Build verification appended"`
10. `git push origin dev`
11. `gh pr create --base main --head dev --title "HF-141: Multi-file import per-file data isolation (N files)" --body "Fixes source_date contamination where file N rows get file N-1 source_dates. Diagnostic traced 5 pipeline layers. Ensures complete per-file isolation for any number of simultaneous uploads. Completion report: HF-141_COMPLETION_REPORT.md"`

---

## BROWSER TEST (Andrew — after merge + cleanup + re-import)

### Step 1: Run HF-141_CLEANUP.sql
Delete March batch with wrong source_dates.

### Step 2: Re-import March only
Upload BCL_Datos_Mar2026.xlsx as single file.

### Step 3: Verify source_dates
```sql
SELECT date_trunc('month', source_date)::date AS month, count(*)
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
```
**Expected:** 2026-03: 85 rows

### Step 4: Calculate March
/operate/calculate → March 2026 → Calculate.
**Must show $58,406 exactly.**

### Step 5: Verify 6-month total
$44,590 + $46,291 + $61,986 + $47,545 + $53,215 + $58,406 = **$312,033**

### Step 6 (after March is verified): Multi-file regression test — ALL 3 FILES SIMULTANEOUSLY
Delete all Jan/Feb/Mar batches and their committed_data. Re-import all 3 simultaneously via multi-file upload.
Verify source_dates:
```sql
SELECT date_trunc('month', source_date)::date AS month, count(*)
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date >= '2026-01-01'
GROUP BY 1 ORDER BY 1;
```
**Expected:** 3 months (Jan, Feb, Mar), 85 rows each, DISTINCT source_dates.
Calculate each: Jan = $47,545, Feb = $53,215, Mar = $58,406.

**This proves the multi-file pipeline works for N files with complete per-file isolation. The architecture must support any number of files — 3 is the test case, not the design limit.**

---

*Standing Rule 30: One issue per prompt. Per-file data isolation for N files.*
