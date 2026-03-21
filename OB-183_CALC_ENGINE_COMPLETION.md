# OB-183: OB-182 Completion — Calc Engine Resolution + Multi-File Upload + source_date Fix

## Date: March 21, 2026
## Type: OB (Objective Build)
## Scope: Complete the deferred items from OB-182 so Andrew can run a clean browser test

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## CONTEXT

OB-182 successfully removed import-time entity binding, postCommitConstruction, and convergence derivation. Import is now pure storage. But the corresponding calculation-time operations were deferred. The engine must now handle what import no longer does.

### What OB-182 Completed
- ✅ Entity binding removed from import
- ✅ postCommitConstruction removed from import
- ✅ Convergence removed from import
- ✅ entity_id_field preserved in committed_data.metadata
- ✅ ComponentType extended (linear_function, piecewise_linear, scope_aggregate)
- ✅ transformFromMetadata reads intent from component.metadata

### What This OB Must Complete
- ❌ source_date extraction — findDateColumnFromBindings not receiving AI-identified date column
- ❌ Calc engine entity resolution as PRIMARY path (not fallback)
- ❌ crossDataCounts population on EntityData before intent execution
- ❌ scopeAggregates population on EntityData before intent execution
- ❌ Convergence at calc time when not cached
- ❌ Multi-file upload — process all selected files
- ❌ BCL regression verification ($312,033)
- ❌ Plan reimport verification (4 CRP plans produce correct intents)

---

## STANDING RULES

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 25-28:** Completion report enforcement
- **Rule 34:** No bypass recommendations
- **Rule 40:** Diagnostic-first

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### SQL VERIFICATION GATE (FP-49)
Before writing ANY SQL, verify against SCHEMA_REFERENCE_LIVE.md or live DB.

---

## PHASE 0: DIAGNOSTIC

**READ-ONLY. Verify current state after OB-182.**

### 0A: source_date Extraction
1. Paste the `extractSourceDate` function — full body
2. Paste the `findDateColumnFromBindings` function — full body
3. Trace: when a CSV with a "date" column is imported, what value does `dateColumnHint` receive? Is it the string "date", NULL, or something else?
4. The AI assessment identifies `date → date (90%)` — where is this mapping stored after classification? Is it in processing_jobs.classification_result? In the proposal? In confirmedBindings?
5. Does `findDateColumnFromBindings` read from the same place the AI assessment writes to?

### 0B: Calculation Engine Data Loading
1. Paste the COMPLETE data loading section of run/route.ts (the part that queries committed_data and groups by entity)
2. Identify: which path handles rows with entity_id = NULL?
3. The convergence/dataByBatch path (lines ~397-444) — paste it completely
4. Does this path resolve entity by matching `row_data[entity_column]` against `entities.external_id`?
5. What happens if convergence bindings don't exist yet (rule_sets.input_bindings is empty)?

### 0C: crossDataCounts and scopeAggregates
1. Search for where EntityData is constructed before intent execution
2. Are crossDataCounts and scopeAggregates fields defined on EntityData? (OB-181 added them to intent-types.ts)
3. Is there ANY code that populates them? Grep:
```bash
grep -rn "crossDataCounts\|scopeAggregates" web/src/ --include="*.ts" --include="*.tsx"
```
4. Paste the full output

### 0D: Multi-File Upload
1. Paste the SCIUpload component's file handling code
2. Does it accept multiple files? (check `multiple` attribute on input)
3. When multiple files are selected, how many API calls are made?
4. Paste the analyze-document route handler — does it process one file or iterate over multiple?

### 0E: Plan Converter Verification
1. Paste the current `convertComponent` function (or equivalent after OB-182 changes)
2. Paste the `transformFromMetadata` function added in OB-182
3. How does the AI assessment output reach the converter? What is the data flow?

**Commit: "OB-183 Phase 0: Diagnostic"**

---

## PHASE 1: FIX source_date EXTRACTION

### The Problem
The AI assessment correctly identifies the "date" column at 90% confidence. But `extractSourceDate` receives an empty `dateColumnHint` because `findDateColumnFromBindings` doesn't read from where the AI assessment writes.

### The Fix
Based on Phase 0 findings, connect the AI assessment's date column identification to `extractSourceDate`:

1. Find where the AI assessment stores the date column identification (likely in processing_jobs.classification_result or the proposal's confirmedBindings)
2. Find where `findDateColumnFromBindings` reads from
3. Bridge the gap — either fix `findDateColumnFromBindings` to read from the assessment, or pass the date column hint explicitly from the confirmed bindings

### Verification
After fix, import a CSV with a "date" column. Query:
```sql
SELECT source_date, row_data->>'date' as raw_date 
FROM committed_data 
WHERE tenant_id = '{CRP}' 
AND source_date IS NOT NULL 
LIMIT 10;
```
source_date must match the raw date values. Zero NULL source_dates on rows that have a date value.

**Commit: "OB-183 Phase 1: source_date extraction fix"**

---

## PHASE 2: CALCULATION ENGINE — ENTITY RESOLUTION AS PRIMARY PATH

### The Problem
After OB-182, entity_id is always NULL on committed_data rows. The engine's primary path (`if (row.entity_id)` → dataByEntity) gets zero rows. The convergence/dataByBatch path must become the primary path.

### The Fix
Restructure the engine data loading:

1. Query committed_data for the tenant + period (by source_date range)
2. Determine the entity identifier column:
   - Read from committed_data.metadata.entity_id_field (set by OB-182 at import time)
   - OR from rule_sets.input_bindings (convergence bindings)
   - OR from processing_jobs classification (entity_identifier semantic role)
3. For EACH committed_data row:
   - Read the entity identifier value from `row_data[entity_id_field]`
   - Resolve to entity UUID by matching against `entities.external_id`
   - Group by resolved entity
4. Rows that cannot resolve (entity doesn't exist) → excluded from this calculation, logged
5. Do NOT depend on entity_id FK being populated

### Critical: This Must Not Break BCL
BCL has existing committed_data rows that MAY have entity_id populated from before OB-182. The engine must handle BOTH:
- Old rows with entity_id populated → use entity_id directly
- New rows with entity_id NULL → resolve from row_data

The simplest approach: try entity_id first, fall back to row_data resolution. This maintains backward compatibility.

### Verification
- BCL calculates $312,033 (old rows with entity_id) ✅
- CRP calculates (new rows without entity_id, resolved from row_data) ✅

**Commit: "OB-183 Phase 2: Entity resolution as primary path"**

---

## PHASE 3: CONVERGENCE AT CALC TIME

### The Problem
Convergence derivation was removed from import (OB-182). If rule_sets.input_bindings is empty when the engine runs, it has no field-to-component mappings.

### The Fix
At calculation time, before executing intents:
1. Check rule_sets.input_bindings for the current rule_set
2. If populated → use them
3. If empty → run convergence derivation NOW:
   - Analyze committed_data field names for this tenant
   - Derive metric bindings (map data fields to component inputs)
   - Write to rule_sets.input_bindings (cache for next calculation)
4. Log: "Convergence derived at calc time for rule_set {id}"

### Verification
- Delete rule_sets.input_bindings for a CRP plan
- Run calculation
- Engine derives convergence, calculation succeeds
- rule_sets.input_bindings now populated

**Commit: "OB-183 Phase 3: Convergence at calc time"**

---

## PHASE 4: CROSSDATACOUNTS + SCOPEAGGREGATES POPULATION

### 4A: crossDataCounts
Before executing intents for an entity:

1. Query committed_data for this entity (resolved by external_id from Phase 2) in the current period
2. Group rows by `data_type` field
3. For each data_type, count rows and sum monetary columns
4. Populate `EntityData.crossDataCounts`:
```typescript
crossDataCounts: {
  [data_type: string]: {
    count: number;
    sum: number; // sum of the primary monetary field
  }
}
```
5. The conditional_gate with `source: 'cross_data'` reads from this to evaluate gates like "entity has ≥1 Capital Equipment transactions in this period"

### 4B: scopeAggregates
Before executing intents for a manager entity:

1. Determine the manager's scope:
   - Query `entity_relationships` for entities where this manager is the target of a 'reports_to' or 'manages' relationship
   - OR read the manager's district/region from `entities.metadata` and find all entities with matching values
2. For each entity in scope, sum their committed_data metrics for the period
3. Populate `EntityData.scopeAggregates`:
```typescript
scopeAggregates: {
  [scope_key: string]: {
    [metric: string]: number;
  }
}
```
4. The scope_aggregate IntentSource reads from this

### 4C: Korean Test
- data_type values come from import classification — they are structural, not hardcoded
- Scope resolution uses relationship graph or metadata field matching — no role name checks
- No `if (data_type === 'equipment')` in the engine

### Verification
- Entity with equipment transactions in period → crossDataCounts has entry with count > 0
- District Manager → scopeAggregates has sum of all reps' revenue in their district
- Entity with no data in period → crossDataCounts is empty (not error)

**Commit: "OB-183 Phase 4: crossDataCounts + scopeAggregates population"**

---

## PHASE 5: MULTI-FILE UPLOAD

### The Fix
Based on Phase 0 diagnostic:

1. If SCIUpload only sends one file → fix to iterate over all selected files and call analyze-document for each
2. If analyze-document only processes one file → fix to handle multiple files (one processing_job per file)
3. Each file appears as a separate content unit in the import review panel
4. Each can be classified and confirmed independently

### Verification
- Select 4 PDF files
- All 4 appear in import review
- Each shows its own classification and confidence

**Commit: "OB-183 Phase 5: Multi-file upload"**

---

## PHASE 6: BCL REGRESSION + BUILD VERIFICATION

### 6A: BCL Regression
Run BCL calculation. Must produce $312,033 exact. This verifies that:
- Old committed_data rows (with entity_id populated) still work
- The engine handles both old and new data formats
- No import removal broke existing tenants

### 6B: Build
1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000

### PR Creation
```bash
gh pr create --base main --head dev --title "OB-183: Calc Engine Resolution + source_date + Multi-File + BCL Regression" --body "Completes OB-182 deferred items. source_date extraction fixed. Calc engine entity resolution is now the primary path (handles NULL entity_id from sequence-independent import). Convergence runs at calc time when not cached. crossDataCounts and scopeAggregates populated before intent execution. Multi-file upload processes all selected files. BCL regression verified at $312,033."
```

**Commit: "OB-183 Phase 6: BCL regression + build verification"**

---

## PROOF GATES — HARD

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | source_date populated on committed_data after CSV import | Paste DB query showing source_date values, zero NULLs |
| PG-02 | Transaction data imports with NO roster present, NO errors | Paste Vercel log showing successful import |
| PG-03 | Engine resolves entities at calc time from row_data when entity_id is NULL | Paste engine code showing resolution path |
| PG-04 | Engine resolves entities from entity_id when populated (backward compat) | Paste code showing dual-path |
| PG-05 | Convergence derives at calc time when input_bindings empty | Paste code + log output |
| PG-06 | crossDataCounts populated before intent execution | Paste code showing population |
| PG-07 | scopeAggregates populated before intent execution | Paste code showing population |
| PG-08 | Multi-file upload: 4 files all appear in review | Paste code fix |
| PG-09 | BCL regression: $312,033 | Paste calculation output |
| PG-10 | npm run build exits 0 | Paste exit code |
| PG-11 | Zero Korean Test violations | Paste grep for hardcoded names |

## PROOF GATES — SOFT

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| SG-01 | Mixed cadence: same row binds to different period types per plan | Paste period binding code |
| SG-02 | Entity with no data → crossDataCounts empty, not error | Paste handling code |
| SG-03 | Manager with no reports → scopeAggregates empty, not error | Paste handling code |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-183_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## POST-MERGE PRODUCTION VERIFICATION (MANDATORY)

After the PR is merged and deployed to production:

1. **Vercel deployment:** Confirm build succeeded
2. **BCL regression:** $312,033 in production
3. **Import test:** Upload CSV to CRP tenant without roster — no errors, source_date populated
4. **No production errors in Vercel logs**

**No finding marked ✅ without production evidence.**

---

## AFTER THIS OB — ANDREW'S BROWSER TEST

All deferred items complete. Andrew runs the full CLT with the 8 incremental files:

```
01: Roster (31 employees)
02: Sales Jan 1-15 (182 transactions) 
03: Sales Jan 16-31 (207 transactions)
04: Roster update — Rachel Green hired
05: Sales Feb 1-15 (197 transactions)
06: Roster update — Samuel Osei promoted
07: Sales Feb 16-28 (170 transactions)
08: Returns — Tyler Morrison clawback
→ Calculate all plans
→ Reconcile against GT
→ Lifecycle through POSTED
→ Manager + Rep persona login
→ Payroll export
```
