# DIAG-005: EXECUTE-BULK COMMIT PATH — SINGLE FILE FOR ALL CONTENT UNITS
## Diagnostic Only — No Code Changes Until Root Cause Evidenced

**Date:** March 17, 2026
**Type:** Diagnostic
**Sequence:** DIAG-005
**Predecessor:** OB-174 (async pipeline), DIAG-004 (multi-file content sharing)
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.

---

## STANDING RULES ACTIVE

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## THE PROBLEM

OB-174 implemented async classification: 6 parallel workers each download their own file, classify independently, produce correct fingerprints. This works — logs confirm 6 separate downloads, 6 separate classifications, 6 correct fingerprint hashes.

But the **commit path** (execute-bulk) produces 510 rows all with source_date 2026-02-01. Only February's file was downloaded during commitment. All 6 content units were committed using February's data.

**Evidence from production logs:**

Classification phase (CORRECT — 6 parallel workers):
```
[SCI-WORKER] Job fa9848bb: Downloading BCL_Datos_Feb2026.xlsx — Tier 3 — 11.9s
[SCI-WORKER] Job 317fc8a1: Downloading BCL_Datos_Dic2025.xlsx — Tier 3 — 14.0s
[SCI-WORKER] Job f9d00f8c: Downloading BCL_Datos_Mar2026.xlsx — Tier 3 — 13.5s
[SCI-WORKER] Job f819830a: Downloading BCL_Datos_Nov2025.xlsx — Tier 3 — 13.9s
[SCI-WORKER] Job 688b9ad9: Downloading BCL_Datos_Oct2025.xlsx — Tier 3 — 14.3s
[SCI-WORKER] Job 9bd1e438: Downloading BCL_Datos_Ene2026.xlsx — Tier 3 — 25.4s
```

Commit phase (BROKEN — single file for all 6):
```
[SCI Bulk] Downloading from Storage: ...BCL_Datos_Feb2026.xlsx  ← ONLY ONE DOWNLOAD
[HF-141] File: ...BCL_Datos_Feb2026.xlsx, rows: 85, source_dates: [2026-02-01]
[SCI Bulk] Chunk 1/1: 85/85 rows committed  ← Feb data committed 6 times
[SCI Bulk] Chunk 1/1: 85/85 rows committed
[SCI Bulk] Chunk 1/1: 85/85 rows committed
[SCI Bulk] Chunk 1/1: 85/85 rows committed
[SCI Bulk] Chunk 1/1: 85/85 rows committed
[SCI Bulk] Chunk 1/1: 85/85 rows committed
[SCI Bulk] Complete: 510 rows in 5298ms
```

**Database confirmation:**
```sql
SELECT date_trunc('month', source_date)::date AS month, count(*)
FROM committed_data WHERE tenant_id = 'b1c2d3e4-...' AND source_date IS NOT NULL
GROUP BY 1 ORDER BY 1;

-- Result: 2026-02-01 | 510  (all rows have February date)
```

**Root cause pattern:** This is the THIRD occurrence of the same architectural failure:
- DIAG-004: files[0] content used for all files (upload layer)
- HF-140: storagePaths fallback to first file (classification layer)
- DIAG-005: execute-bulk downloads one file for all content units (commit layer)

Each fix addressed one layer but did not verify the full chain from upload through commit.

---

## DIAGNOSTIC PROTOCOL — READ-ONLY CODE ANALYSIS

**DO NOT WRITE ANY CODE. DO NOT MODIFY ANY DATA.**

---

## PHASE 1: TRACE THE COMMIT CALL CHAIN

The commit is triggered after the user clicks "Import 510 rows" on the import complete screen. Trace the EXACT code path from that button click to the execute-bulk API call.

### Mission 1.1: Find the import/confirm trigger
- What component renders the "Import 510 rows" button?
- What function is called when the user clicks it?
- How does it determine which files/content units to commit?
- **PASTE the onClick handler or submit function.**

### Mission 1.2: Find how execute-bulk is called
- Is execute-bulk called ONCE for all 6 content units, or ONCE PER content unit?
- What parameters are passed: specifically, what storage path(s)?
- Does it receive per-file storage paths, or a single storage path?
- **PASTE the code that calls the execute-bulk API endpoint.**

### Mission 1.3: Find how execute-bulk selects the file to download
- In the execute-bulk route handler, how is the storage path determined?
- Does it receive the path as a parameter, or look it up?
- If it receives one path, does it use that same file for all content units?
- **PASTE the code in execute-bulk/route.ts that determines which file to download.**

### Mission 1.4: Find the SCIExecution.tsx commit path
- HF-140 fixed the classification path in SCIExecution.tsx to group by sourceFile
- Is the COMMIT path (after user confirms) using the same per-file grouping?
- Or does the commit path use the old synchronous pattern (single storagePath)?
- **PASTE the commit/execute function in SCIExecution.tsx that fires after user confirmation.**

### Mission 1.5: Compare classification path vs commit path
- Classification: each worker downloads its own file (PROVEN by logs)
- Commitment: how many downloads happen? (PROVEN: only 1 download in logs)
- Where do these two paths diverge?
- **PASTE both code paths side by side — the worker download and the commit download.**

---

## PHASE 2: DATABASE EVIDENCE

### Query 2.1: Verify all 510 rows have same source_date
```sql
SELECT source_date, count(*), count(DISTINCT batch_id) AS batches
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date IS NOT NULL
GROUP BY source_date ORDER BY source_date;
```

### Query 2.2: Check import_batches for the 6-file import
```sql
SELECT id, file_name, row_count, status, created_at
FROM import_batches
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND created_at > '2026-03-17 15:00:00'
ORDER BY created_at;
```
**Expected:** 6 batches with different file names. Check: do all 6 batches point to the same storage path or different paths?

### Query 2.3: Check processing_jobs for storage paths
```sql
SELECT id, file_name, file_storage_path, status, recognition_tier
FROM processing_jobs
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND created_at > '2026-03-17 15:00:00'
ORDER BY created_at;
```
**Expected:** 6 jobs with 6 DIFFERENT file_storage_path values. This proves the async workers had the right paths. The question is whether the commit path uses these paths.

---

## PHASE 3: ROOT CAUSE DETERMINATION

Based on Phases 1-2, determine ONE of these:

**A. Execute-bulk is called once with a single storagePath.** The commit function passes one file path (e.g., the first file or the "active" file) to a single execute-bulk call. All 6 content units are processed against that one file.

**B. Execute-bulk is called 6 times but all receive the same storagePath.** The commit function iterates per content unit but resolves the same storage path for all (shared variable, fallback, or incorrect lookup).

**C. The commit path does not use processing_jobs.file_storage_path at all.** The async classification stores per-file paths in processing_jobs, but the commit path uses a different mechanism (e.g., the old storagePath from the import page state) that wasn't updated for multi-file.

**D. The OB-174 async path fell back to the synchronous path for commitment.** Classification went async (workers), but commitment went through the old synchronous SCIExecution.tsx path which still has the single-file bug.

**State which root cause the evidence supports, citing specific code lines and query results.**

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-005_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE any final steps
- Contains ALL code pastes and query results verbatim
- Committed to git as part of the diagnostic
- If this file does not exist at diagnostic end, the diagnostic is considered INCOMPLETE.

### Completion Report Structure

```markdown
# DIAG-005 COMPLETION REPORT
## Date: [date]

## PHASE 1: CODE TRACE
### Mission 1.1 — Import trigger:
[paste code]

### Mission 1.2 — Execute-bulk call:
[paste code]

### Mission 1.3 — File download selection:
[paste code]

### Mission 1.4 — SCIExecution commit path:
[paste code]

### Mission 1.5 — Classification vs commit comparison:
[paste both paths]

## PHASE 2: DATABASE EVIDENCE
### Query 2.1: [paste output]
### Query 2.2: [paste output]
### Query 2.3: [paste output]

## ROOT CAUSE DETERMINATION
[A / B / C / D — with evidence citations]

## RECOMMENDED FIX
[Describe what needs to change — do NOT implement]

## KNOWN ISSUES
[Anything discovered]
```

### Workflow
1. Execute Phase 1 code analysis
2. Execute Phase 2 queries
3. Determine root cause
4. **CREATE `DIAG-005_COMPLETION_REPORT.md` in project root**
5. `git add -A && git commit -m "DIAG-005: Execute-bulk commit path diagnostic"`
6. `git push origin dev`
7. `gh pr create --base main --head dev --title "DIAG-005: Execute-bulk single-file commit diagnostic" --body "Read-only diagnostic. Root cause: [state]. Completion report: DIAG-005_COMPLETION_REPORT.md"`

---

## CONSTRAINTS

- **NO CODE CHANGES.** Read-only analysis and queries only.
- **NO DATA MODIFICATIONS.**
- **NO SPECULATIVE FIXES.**
- **PASTE ALL CODE AND QUERY OUTPUT.** Not summaries.

---

*This is the third diagnostic for the same class of bug: per-file isolation breaks at a different pipeline layer each time. The fix must address the FULL CHAIN from upload through commit, not just the current failing layer.*
