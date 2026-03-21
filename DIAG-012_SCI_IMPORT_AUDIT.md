# DIAG-012: SCI Import Pipeline — Architectural Compliance Audit

## Date: March 21, 2026
## Type: DIAG (Diagnostic — READ-ONLY, NO CODE CHANGES)
## Severity: P0 — Architectural violation of sequence-independence principle

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## CONTEXT

Browser testing of the CRP third proof tenant has revealed that the SCI import pipeline performs operations at import time that architecturally belong at calculation time. This creates implicit ordering requirements (e.g., roster must exist before transaction data) that violate the platform's sequence-independence principle.

The violations discovered so far:
1. Entity binding at import time (OB-177 Three-Layer Entity Resolution runs during import)
2. source_date extraction failing (date column identified but not extracted to committed_data.source_date)
3. Convergence derivation running at import time (attempting to bind components before calculation)

There may be additional violations not yet discovered. This diagnostic audits the ENTIRE import pipeline.

**THIS IS READ-ONLY. CC DOES NOT CHANGE ANY CODE. CC ONLY REPORTS WHAT EXISTS.**

---

## STANDING RULES
- **Rule 40:** Diagnostic-first — examine before acting
- **Rule 27:** Evidence = paste code. NOT "this was implemented."
- **Rule 34:** No workarounds — structural diagnosis only

---

## MISSION 1: COMPLETE IMPORT PIPELINE TRACE

Trace the ENTIRE flow from file upload to committed_data storage. For EACH step, paste the actual code (function signature + body, not just the name).

### 1A: Upload Entry Point
- What happens when a file is uploaded at `/operate/import`?
- Paste the upload handler code
- Paste the SCIUpload component's onUpload/onChange handler
- What API route receives the file?

### 1B: Storage
- How is the file stored in Supabase storage?
- Paste the storage upload code
- What bucket? What path structure?

### 1C: Processing Job Creation
- How is the processing_job row created?
- Paste the code that creates the processing_jobs record
- What fields are populated at creation time?

### 1D: Content Analysis (SCI Classification)
- What API route triggers classification?
- Paste the full analyze-document route handler
- How does it handle PDF vs CSV vs XLSX?
- Paste the PDF text extraction code
- Paste the CSV parsing code

### 1E: SCI Proposal Generation
- After classification, how is the proposal generated?
- Paste the proposal generation code
- What data does the proposal contain?

### 1F: Import Execution (Confirm/Import)
- What happens when the user clicks "Import data"?
- Paste the execute-bulk route handler — THE ENTIRE FUNCTION
- This is the critical path. Every line matters.

### 1G: committed_data Writing
- How are rows written to committed_data?
- Paste the code that inserts into committed_data
- What columns are populated? What is source_date set to?
- Is entity_id set at this point? If so, HOW?

### 1H: Post-Import Operations
- What happens AFTER committed_data rows are written?
- Paste ALL post-import operations:
  - Entity binding (OB-177)
  - Convergence derivation
  - Entity resolution (HF-109)
  - Structural fingerprinting
  - Signal capture
  - Any other post-import hooks

**For each post-import operation, answer:**
- Does this operation REQUIRE data from other imports to function?
- Does this operation FAIL if entities don't exist yet?
- Does this operation FAIL if the plan hasn't been imported yet?
- Could this operation be deferred to calculation time without loss?

---

## MISSION 2: ENTITY BINDING AUDIT

### 2A: Where Entity Binding Occurs
- Grep for ALL references to entity binding in the codebase:
```bash
grep -rn "entity.binding\|entityBinding\|entity_binding\|bindEntit\|matchEntit\|resolveEntit\|linkEntit" web/src/ --include="*.ts" --include="*.tsx"
```
- Paste the full output

### 2B: OB-177 Entity Resolution Code
- Find and paste the COMPLETE Three-Layer Entity Resolution code
- Where is it called from?
- Is it called during import, during calculation, or both?

### 2C: Entity ID on committed_data
- Does committed_data have an entity_id column?
- Is it populated at import time or calculation time?
- Paste the schema:
```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns 
WHERE table_name = 'committed_data' ORDER BY ordinal_position;
```

### 2D: What Happens When Entity Binding Fails
- When binding fails (0.0% as seen in CRP), what state are the committed_data rows in?
- Is entity_id NULL? Empty? Missing?
- Can the calculation engine still use these rows?
- Paste the calculation engine's data loading code — how does it query committed_data?

---

## MISSION 3: SOURCE_DATE AUDIT

### 3A: source_date Population
- How is source_date populated on committed_data rows?
- Grep for source_date:
```bash
grep -rn "source_date" web/src/ --include="*.ts" --include="*.tsx"
```
- Paste the full output

### 3B: Date Column Detection
- The SCI assessment correctly identified the "date" column. How does that identification flow to source_date population?
- Is there a gap between "AI identifies date column" and "source_date gets populated"?
- Paste the code path from field mapping to source_date assignment

### 3C: Decision 92 Compliance
- Decision 92: "committed_data gets source_date (business date). period_id nullable. Engine binds at calc time."
- Is period_id on committed_data? Is it populated at import time?
- If period_id is populated at import time, that's ANOTHER violation of Decision 92.

---

## MISSION 4: CONVERGENCE AT IMPORT TIME

### 4A: When Does Convergence Run?
- The Vercel logs show convergence running immediately after import
- Grep for convergence:
```bash
grep -rn "convergence\|Convergence\|derivation" web/src/ --include="*.ts" --include="*.tsx" | head -40
```
- Paste the output

### 4B: What Convergence Does at Import Time
- Paste the convergence execution code
- Does it try to bind committed_data fields to plan components?
- Does it REQUIRE the plan to exist to function?
- Does it REQUIRE entities to exist to function?

### 4C: Should Convergence Run at Import Time?
- Convergence binds data fields to plan component inputs
- This binding is needed at CALCULATION time, not import time
- Is there any legitimate reason for convergence at import time?

---

## MISSION 5: FULL IMPORT-TIME DEPENDENCY MAP

Based on Missions 1-4, produce a complete dependency map:

```
WHAT RUNS AT IMPORT TIME:
1. [operation] — requires: [what must exist] — violation: [yes/no + why]
2. [operation] — requires: [what must exist] — violation: [yes/no + why]
...

WHAT SHOULD RUN AT IMPORT TIME:
- File storage ✅
- Processing job creation ✅
- Content parsing (PDF text extraction, CSV parsing) ✅
- SCI classification (structural heuristics) ✅
- committed_data row insertion with ALL columns preserved ✅
- source_date extraction from identified date column ✅
- Structural fingerprinting (for flywheel) ✅

WHAT SHOULD NOT RUN AT IMPORT TIME:
- Entity binding (belongs at calculation time)
- Convergence derivation (belongs at calculation time)
- Component binding (belongs at calculation time)
- Period assignment (Decision 92: engine binds at calc time)
- Anything that REQUIRES other data to have been imported first
```

---

## MISSION 6: CALCULATION ENGINE DATA LOADING

### 6A: How Does the Engine Load Data?
- Paste the calculation engine's data loading code (the part that reads committed_data)
- Does it JOIN on entity_id? If so, NULL entity_id rows are excluded — silent data loss
- Does it filter by period_id? If so, NULL period_id rows are excluded — silent data loss
- Does it filter by any other import-time-populated field?

### 6B: Can the Engine Resolve Entities at Calc Time?
- Is there any code that resolves entity identifiers at calculation time?
- Or does the engine DEPEND on import-time entity_id being populated?

### 6C: Engine's Entity Identifier Resolution
- The engine needs to know "this row belongs to entity CRP-6007"
- Currently: does it read entity_id (UUID) from committed_data?
- Alternative: could it read sales_rep_id (external_id) from committed_data.raw_data and resolve to entity UUID at calc time?

---

## OUTPUT FORMAT

For EACH mission, create a section with:
1. The grep/query command run
2. The COMPLETE output (paste, don't summarize)
3. The file path and line numbers for each relevant code block
4. The COMPLETE function body for each relevant function
5. A YES/NO assessment: does this violate sequence-independence?

**Save as `DIAG-012_SCI_IMPORT_AUDIT.md` in PROJECT ROOT.**
**Commit: "DIAG-012: SCI Import Pipeline architectural compliance audit"**
**DO NOT CHANGE ANY CODE.**

---

## PR Creation
```bash
gh pr create --base main --head dev --title "DIAG-012: SCI Import Pipeline Architectural Compliance Audit" --body "Read-only diagnostic. Audits the complete SCI import pipeline for sequence-independence violations. Traces every operation from file upload to committed_data storage. Maps import-time dependencies. Identifies operations that should be deferred to calculation time. No code changes."
```
