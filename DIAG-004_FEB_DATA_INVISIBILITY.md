# DIAG-004: FEBRUARY/MARCH DATA INVISIBILITY — MULTI-FILE IMPORT BATCH BINDING
## Diagnostic Only — No Code Changes Until Root Cause Evidenced

**Date:** March 16, 2026
**Type:** Diagnostic
**Sequence:** DIAG-004
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

BCL tenant (b1c2d3e4-aaaa-bbbb-cccc-111111111111) has 6 months of data imported. The calculation engine produces exact results for October ($44,590), November ($46,291), December ($61,986), and January ($47,545). February produces $9,150 instead of GT $53,215. March has not been calculated yet.

**Key evidence from February calculation logs:**
1. `Fetched 85 committed_data rows` — working months fetch 170 (85 datos + 85 personal)
2. `HF-108 Resolution path: sheet-matching (fallback)` — working months use `convergence_bindings (Decision 111)`
3. `OB-152 period_id fallback: 0 rows` — source_date path found 0 rows for February
4. `HF-109 Batch cache: 1 batches` — working months show 2 batches
5. Only C4 (Regulatory Compliance) has non-zero values — $150/$100 per entity = $9,150. C1, C2, C3 all $0.

**Import context:** October, November, December were imported as individual single-file uploads. January, February, March were imported simultaneously via multi-file upload (3 files selected at once) after HF-139 fix. January calculates correctly. February does not.

---

## DIAGNOSTIC PROTOCOL — READ-ONLY QUERIES ONLY

**DO NOT WRITE ANY CODE. DO NOT MODIFY ANY DATA. DO NOT CREATE ANY FIX.**

This diagnostic produces SQL evidence only. Every query must be pasted with its full output.

---

## PHASE 1: DATA INVENTORY

### Query 1.1: Total committed_data by source_date month
```sql
SELECT 
  date_trunc('month', source_date)::date AS month,
  count(*) AS row_count,
  count(DISTINCT entity_id) AS distinct_entities,
  count(DISTINCT batch_id) AS distinct_batches
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date IS NOT NULL
GROUP BY date_trunc('month', source_date)
ORDER BY month;
```
**Expected:** 6 months (Oct 2025 through Mar 2026), each with 85 rows. If February or March show 0 rows, the data was not committed with correct source_dates.

### Query 1.2: Total committed_data by batch_id
```sql
SELECT 
  cd.batch_id,
  ib.file_name,
  ib.created_at AS import_date,
  ib.row_count AS declared_rows,
  count(cd.id) AS actual_rows,
  min(cd.source_date) AS min_source_date,
  max(cd.source_date) AS max_source_date,
  cd.data_type
FROM committed_data cd
LEFT JOIN import_batches ib ON cd.batch_id = ib.id
WHERE cd.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
GROUP BY cd.batch_id, ib.file_name, ib.created_at, ib.row_count, cd.data_type
ORDER BY ib.created_at;
```
**Expected:** One batch per file upload. Check whether Jan/Feb/Mar files produced separate batch_ids or share a single batch_id.

### Query 1.3: committed_data with NULL source_date
```sql
SELECT 
  count(*) AS null_source_date_count,
  count(DISTINCT entity_id) AS distinct_entities,
  count(DISTINCT batch_id) AS distinct_batches,
  data_type
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date IS NULL
GROUP BY data_type;
```
**Expected:** Personal/roster data has NULL source_date (period-agnostic). Transaction data should NOT have NULL source_date. If Feb/Mar transaction rows have NULL source_date, that's the root cause.

---

## PHASE 2: ENTITY-LEVEL TRACE — VALENTINA SALAZAR

### Query 2.1: All committed_data for Valentina Salazar (BCL-5012)
```sql
SELECT 
  cd.id,
  cd.batch_id,
  cd.source_date,
  cd.data_type,
  cd.entity_id,
  ib.file_name,
  cd.created_at,
  substring(cd.row_data::text, 1, 200) AS row_data_preview
FROM committed_data cd
LEFT JOIN import_batches ib ON cd.batch_id = ib.id
WHERE cd.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND cd.entity_id IN (
    SELECT id::text FROM entities 
    WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' 
    AND external_id = 'BCL-5012'
  )
ORDER BY cd.source_date NULLS FIRST, cd.created_at;
```
**Expected:** 7 rows (1 personal + 6 datos months). Check if February and March datos rows exist with correct source_dates.

### Query 2.2: If entity_id is stored as external_id string instead of UUID
```sql
SELECT 
  cd.id,
  cd.batch_id,
  cd.source_date,
  cd.data_type,
  cd.entity_id,
  ib.file_name,
  cd.created_at
FROM committed_data cd
LEFT JOIN import_batches ib ON cd.batch_id = ib.id
WHERE cd.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND (cd.row_data::text ILIKE '%5012%' OR cd.row_data::text ILIKE '%Salazar%')
ORDER BY cd.source_date NULLS FIRST, cd.created_at;
```
**Expected:** Find all rows referencing Valentina regardless of how entity_id is stored.

---

## PHASE 3: PERIOD BOUNDARIES

### Query 3.1: Period definitions
```sql
SELECT 
  id,
  name,
  start_date,
  end_date,
  status
FROM periods
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY start_date;
```
**Expected:** 6 periods. Check that February's start_date = 2026-02-01 and end_date = 2026-02-28 (or 2026-03-01 for half-open). If period boundaries are wrong, source_date matching fails.

### Query 3.2: Source_date rows that SHOULD match February period
```sql
SELECT count(*), min(source_date), max(source_date)
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date >= '2026-02-01'
  AND source_date < '2026-03-01';
```
**Expected:** 85 rows. If 0, the February datos were committed with wrong source_dates or not committed at all.

### Query 3.3: Source_date distribution for the multi-file import batches
```sql
SELECT 
  ib.file_name,
  cd.source_date,
  count(*) AS rows
FROM committed_data cd
JOIN import_batches ib ON cd.batch_id = ib.id
WHERE cd.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND ib.created_at > '2026-03-16 20:00:00'  -- Today's multi-file import
GROUP BY ib.file_name, cd.source_date
ORDER BY ib.file_name, cd.source_date;
```
**Expected:** Three files, each with 85 rows at different source_dates (Jan=2026-01-xx, Feb=2026-02-xx, Mar=2026-03-xx). If all 255 rows share the same source_date (e.g., all January), the multi-file import assigned the first file's dates to all files.

---

## PHASE 4: CONVERGENCE BINDING PATH

### Query 4.1: What the engine sees for February
```sql
-- Reproduce the engine's data fetch for February
SELECT 
  count(*) AS total_rows,
  count(DISTINCT cd.entity_id) AS distinct_entities,
  count(DISTINCT cd.batch_id) AS distinct_batches,
  min(cd.source_date) AS min_date,
  max(cd.source_date) AS max_date
FROM committed_data cd
WHERE cd.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND (
    -- source_date path (Decision 92)
    cd.source_date >= '2026-02-01' AND cd.source_date <= '2026-02-28'
    -- OR period-agnostic
    OR cd.source_date IS NULL
  );
```
**Expected:** 170 rows (85 Feb datos + 85 personal). If only 85, February datos rows don't have source_dates in the February range.

### Query 4.2: Convergence bindings for the plan
```sql
SELECT 
  metadata->'convergence_bindings' AS convergence_bindings
FROM rule_sets
WHERE id = 'f270f34c-d49e-42e6-a82b-eb7535e736d9';
```
**Expected:** 4 component bindings. Paste the full JSON. Check whether bindings reference specific batch_ids (would break for new imports) or resolve by structure (would work).

---

## PHASE 5: ROOT CAUSE DETERMINATION

Based on the evidence from Phases 1-4, determine ONE of these root causes:

**A. February datos rows not in committed_data at all.**
The multi-file import committed January's 85 rows but did not commit February's or March's. The 255 row count on the import page was a UI count, not a commit count.

**B. February datos rows committed with wrong source_date.**
All 255 rows were committed but February and March rows received January's source_date (or NULL). The engine's source_date path correctly skips them for February's period.

**C. February datos rows committed with correct source_date but wrong batch metadata.**
Rows exist with correct dates but the convergence binding path cannot find them because the batch_id or import_batch metadata doesn't match what the engine expects.

**D. Period boundary mismatch.**
February period has incorrect start/end dates. The source_dates are correct but fall outside the period's range.

**E. Something else entirely.**
The evidence points to a cause not listed above. Describe it.

**State which root cause the evidence supports, citing specific query results.**

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-004_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE any final steps
- Contains ALL query results pasted verbatim
- Committed to git as part of the diagnostic
- If this file does not exist at diagnostic end, the diagnostic is considered INCOMPLETE.

### Completion Report Structure (Rule 26)

```markdown
# DIAG-004 COMPLETION REPORT
## Date: [date]

## QUERY RESULTS
### Query 1.1: [paste full output]
### Query 1.2: [paste full output]
### Query 1.3: [paste full output]
### Query 2.1: [paste full output]
### Query 2.2: [paste full output]
### Query 3.1: [paste full output]
### Query 3.2: [paste full output]
### Query 3.3: [paste full output]
### Query 4.1: [paste full output]
### Query 4.2: [paste full output]

## ROOT CAUSE DETERMINATION
[A / B / C / D / E — with evidence citations]

## RECOMMENDED FIX
[What needs to change — do NOT implement, only describe]

## KNOWN ISSUES
[Anything discovered during diagnosis]
```

### Workflow
1. Run all queries in order
2. **CREATE `DIAG-004_COMPLETION_REPORT.md` in project root with all pasted results**
3. Determine root cause from evidence
4. `git add -A && git commit -m "DIAG-004: February data invisibility diagnostic"`
5. `git push origin dev`
6. `gh pr create --base main --head dev --title "DIAG-004: February data invisibility diagnostic" --body "Read-only diagnostic. Root cause: [state here]. Completion report: DIAG-004_COMPLETION_REPORT.md"`

---

## CONSTRAINTS

- **NO CODE CHANGES.** Read-only queries only.
- **NO DATA MODIFICATIONS.** No INSERT, UPDATE, DELETE.
- **NO SPECULATIVE FIXES.** Determine root cause from evidence. The fix comes in a separate HF after Andrew reviews the diagnostic.
- **PASTE ALL QUERY OUTPUT.** Not summaries. Full output.

---

*Standing Rule 29: No code changes until root cause is evidenced with database evidence.*
