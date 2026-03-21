# HF-155: Complete Deferred Items — crossDataCounts + scopeAggregates + Multi-File Upload

## Date: March 21, 2026
## Type: HF (Hot Fix)
## Scope: THREE items deferred from OB-182 AND OB-183. This is the THIRD request. No further deferral.

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## WHY THIS HF EXISTS

OB-182 deferred three items to OB-183. OB-183 deferred the SAME three items again. This is unacceptable. These items are required for CRP Plans 3 and 4 to calculate and for multi-file import to work. Without them, Andrew cannot run the browser test.

**NOTHING IN THIS HF MAY BE DEFERRED.** Every phase must be completed with pasted code evidence. If a phase cannot be completed, CC must explain EXACTLY why and what specific information is missing — not "requires runtime data" or "needs browser investigation." Those are not reasons. They are avoidance.

---

## STANDING RULES

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 25-28:** Completion report enforcement
- **Rule 27:** Evidence = paste code. NOT "this was implemented." NOT "deferred."
- **Rule 34:** No bypass recommendations. No deferrals. No "partial."

### ZERO DEFERRAL RULE (THIS HF ONLY)

If CC writes "deferred", "partial", "requires runtime", "needs investigation", or "browser-level" in the completion report for ANY of the three items below, the ENTIRE HF is considered FAILED. CC must complete all three items or explain with SPECIFIC technical detail (file path, line number, exact error) why completion is impossible.

---

## ITEM 1: crossDataCounts POPULATION

### What It Is
Before the intent executor runs for an entity, the engine must populate `EntityData.crossDataCounts` — a map of data_type → { count, sum } from that entity's committed_data rows in the current period.

### Why It's Needed
Plan 3 (Cross-Sell Bonus) has a conditional_gate with `source: 'cross_data'`. The gate checks: "does this entity have ≥1 Capital Equipment transaction in this month?" The gate reads from `crossDataCounts`. If crossDataCounts is empty, the gate fails for ALL entities and Plan 3 pays $0 to everyone.

### What To Build
In the calculation engine (run/route.ts), after resolving entities and before executing intents:

```typescript
// For each entity, query their committed_data rows in the period
// Group by data_type
// Populate crossDataCounts on EntityData

for (const [entityId, entityRows] of dataByEntity) {
  const crossDataCounts: Record<string, { count: number; sum: number }> = {};
  
  for (const row of entityRows) {
    const dataType = row.data_type || 'unknown';
    if (!crossDataCounts[dataType]) {
      crossDataCounts[dataType] = { count: 0, sum: 0 };
    }
    crossDataCounts[dataType].count += 1;
    // Sum the primary monetary field (from row_data)
    const amount = parseFloat(row.row_data?.total_amount || row.row_data?.amount || '0');
    crossDataCounts[dataType].sum += amount;
  }
  
  // Set on EntityData before intent execution
  entityData.crossDataCounts = crossDataCounts;
}
```

**The key question CC must answer:** What is the actual field name on EntityData and how is it passed to the intent executor? Grep for crossDataCounts in intent-executor.ts and intent-types.ts, find the resolveSource case for 'cross_data', and wire the population to match what the executor expects.

### Proof Gate
```
PG-01: crossDataCounts is populated before intent execution
  Evidence: paste the population code AND the resolveSource('cross_data') code
  showing they read/write the same structure
  
PG-02: Entity with committed_data rows has non-empty crossDataCounts
  Evidence: paste a console.log or test showing crossDataCounts for an entity
  with data = { [data_type]: { count: N, sum: N } }

PG-03: Entity with zero committed_data rows has empty crossDataCounts (not error)
  Evidence: paste the handling for empty case
```

**Commit: "HF-155 Item 1: crossDataCounts population"**

---

## ITEM 2: scopeAggregates POPULATION

### What It Is
Before the intent executor runs for a manager entity (District Manager or Regional VP), the engine must populate `EntityData.scopeAggregates` — aggregated metrics from all entities in the manager's organizational scope.

### Why It's Needed
Plan 4 (District Override) pays a District Manager 1.5% of their district's total equipment revenue. The scope_aggregate IntentSource reads from `scopeAggregates`. If scopeAggregates is empty, Plan 4 pays $0 to every manager.

### What To Build
In the calculation engine, after resolving entities and before executing intents for manager-role entities:

```typescript
// 1. Determine which entities are managers (assigned to the District Override plan)
// 2. For each manager, determine their scope:
//    Option A: query entity_relationships for 'reports_to' relationships
//    Option B: read manager's district/region from entities.metadata, 
//              find all entities with matching district/region
// 3. Sum committed_data metrics across all entities in scope for the period
// 4. Populate scopeAggregates on the manager's EntityData

for (const [managerId, managerData] of managerEntities) {
  // Find entities in manager's scope
  const scopeEntities = findEntitiesInScope(managerId, allEntities, entityRelationships);
  
  const scopeAggregates: Record<string, Record<string, number>> = {};
  
  for (const scopeEntityId of scopeEntities) {
    const scopeRows = dataByEntity.get(scopeEntityId) || [];
    for (const row of scopeRows) {
      const dataType = row.data_type || 'unknown';
      if (!scopeAggregates[dataType]) {
        scopeAggregates[dataType] = { count: 0, sum: 0 };
      }
      scopeAggregates[dataType].count += 1;
      const amount = parseFloat(row.row_data?.total_amount || row.row_data?.amount || '0');
      scopeAggregates[dataType].sum += amount;
    }
  }
  
  managerData.scopeAggregates = scopeAggregates;
}
```

**The key questions CC must answer:**
1. How does the engine know which entities are in a manager's scope? Check entity_relationships table OR entities.metadata for district/region values.
2. How does the scope_aggregate IntentSource resolve in intent-executor.ts? Grep for 'scope_aggregate' and find the resolveSource case.
3. Wire population to match what the executor expects.

### Proof Gate
```
PG-04: scopeAggregates is populated before intent execution for manager entities
  Evidence: paste the population code AND the resolveSource('scope_aggregate') code

PG-05: District Manager's scopeAggregates includes data from all reps in their district
  Evidence: paste code showing scope member resolution

PG-06: Regional VP's scopeAggregates includes data from all reps in their region
  Evidence: paste code showing region-level scope resolution

PG-07: Manager with no reports has empty scopeAggregates (not error)
  Evidence: paste empty-case handling
```

**Commit: "HF-155 Item 2: scopeAggregates population"**

---

## ITEM 3: MULTI-FILE UPLOAD

### What It Is
When a user selects multiple files at the /operate/import surface, all files should be processed — not just the first one.

### Why It's Needed
CRP has 4 PDF plans and 8 data files. Uploading one at a time works but is tedious. Multi-file upload was listed as a finding (CLT-181 F02).

### What To Build
1. Find the SCIUpload component
2. Check if the file input has `multiple` attribute
3. Check if the upload handler iterates over all selected files or just files[0]
4. Fix: iterate over ALL files. For each file:
   - Upload to Supabase storage
   - Create a processing_job
   - Trigger classification
5. All files appear as separate content units in the import review panel

### Proof Gate
```
PG-08: SCIUpload accepts multiple files
  Evidence: paste the input element showing multiple attribute

PG-09: Upload handler iterates over all files
  Evidence: paste the loop code

PG-10: Each file creates its own processing_job
  Evidence: paste the processing_job creation inside the loop
```

**Commit: "HF-155 Item 3: Multi-file upload"**

---

## PHASE FINAL: BUILD VERIFICATION

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000
5. BCL regression: $312,033

### PR Creation
```bash
gh pr create --base main --head dev --title "HF-155: crossDataCounts + scopeAggregates + Multi-File Upload" --body "Completes the three items deferred from OB-182 and OB-183. crossDataCounts populated on EntityData before intent execution (enables Plan 3 cross-plan gate). scopeAggregates populated for manager entities (enables Plan 4 district override). Multi-file upload processes all selected files. All CLT-181 P0 findings now addressed."
```

**Commit: "HF-155: Build verification"**

---

## PROOF GATES — HARD (ALL REQUIRED, NO DEFERRALS)

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | crossDataCounts populated before intent execution | Paste population code + resolveSource code |
| PG-02 | Entity with data has non-empty crossDataCounts | Paste test or log |
| PG-03 | Entity with no data has empty crossDataCounts (not error) | Paste handling |
| PG-04 | scopeAggregates populated for manager entities | Paste population code + resolveSource code |
| PG-05 | District Manager scope includes all district reps | Paste scope resolution |
| PG-06 | Regional VP scope includes all region reps | Paste scope resolution |
| PG-07 | Manager with no reports has empty scopeAggregates | Paste handling |
| PG-08 | SCIUpload accepts multiple files | Paste input element |
| PG-09 | Upload handler iterates all files | Paste loop code |
| PG-10 | Each file creates its own processing_job | Paste creation code |
| PG-11 | npm run build exits 0 | Paste exit code |
| PG-12 | BCL regression $312,033 | Paste output |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-155_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- If ANY gate says "deferred" or "partial", the HF is FAILED
- Committed to git as part of the batch

---

## POST-MERGE PRODUCTION VERIFICATION (MANDATORY)

After merge and deploy:
1. Vercel deployment succeeded
2. BCL regression: $312,033
3. No production errors

**After this HF, ALL CLT-181 P0 findings are addressed. Andrew runs the full browser test.**
