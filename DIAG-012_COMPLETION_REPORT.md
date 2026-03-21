# DIAG-012 COMPLETION REPORT: SCI Import Pipeline Architectural Compliance Audit
## Date: March 21, 2026

## EXECUTIVE SUMMARY

The SCI import pipeline performs 3 operations at import time that architecturally belong at calculation time. These create implicit ordering requirements that violate the platform's sequence-independence principle.

## MISSION 1: IMPORT PIPELINE TRACE — POST-IMPORT OPERATIONS

After committed_data rows are written (execute-bulk/route.ts lines 598-634), three post-import operations run:

### Operation 1: Entity ID Binding (lines 536-577)
```typescript
// Lines 536-565: Resolve entity IDs at import time
const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
const entityIdField = entityIdBinding?.sourceField;
// ... query entities table by external_id ...
// Lines 574-577: Set entity_id on each committed_data row
let entityId: string | null = null;
if (entityIdField && row[entityIdField] != null) {
  entityId = entityIdMap.get(String(row[entityIdField]).trim()) || null;
}
```
**VIOLATION:** Requires entities to exist before transaction data import. If roster hasn't been imported, entityIdMap is empty → entity_id is NULL on all rows.

### Operation 2: Post-Commit Construction (line 645)
```typescript
await postCommitConstruction(supabase, tenantId, batchId, entityIdField, unit, rows);
```
Creates rule_set_assignments for entities and binds entity_id on committed_data rows (AGAIN, as a secondary pass). **VIOLATION:** Requires entities AND rule_sets to exist.

### Operation 3: Convergence Derivation (lines 685-716)
```typescript
const { data: ruleSets } = await supabase
  .from('rule_sets')
  .select('id, name')
  .eq('tenant_id', tenantId)
  .eq('status', 'active');

if (ruleSets && ruleSets.length > 0) {
  for (const rs of ruleSets) {
    const result = await convergeBindings(tenantId, rs.id, supabase);
    // ... updates rule_sets.input_bindings with metric_derivations ...
  }
}
```
**VIOLATION:** Requires active rule_sets (plans) to exist before transaction data import. If data is imported before plans, convergence finds no active rule_sets and produces no bindings.

## MISSION 2: ENTITY BINDING AUDIT

### Entity_id on committed_data
- `committed_data.entity_id` IS populated at import time (line 584: `entity_id: entityId`)
- When entities don't exist yet, entity_id is NULL
- The calculation engine groups by entity_id (run/route.ts line 362): `if (row.entity_id)`
- NULL entity_id rows go to `storeData` (line 379), NOT `dataByEntity`
- The convergence binding path (`dataByBatch`, lines 400-444) provides FALLBACK matching by `row_data[entity_column]`

### Can the Engine Resolve Entities at Calc Time?
YES — the convergence binding path at run/route.ts lines 397-444 indexes committed_data by `row_data[entity_column]` value (not entity_id FK). This path works regardless of entity_id being NULL.

## MISSION 3: SOURCE_DATE AUDIT

### source_date Population (line 579)
```typescript
const sourceDate = extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint);
```
- `extractSourceDate` runs at import time — **CORRECT per Decision 92**
- `dateColumnHint` comes from `findDateColumnFromBindings` — uses SCI field bindings
- If the SCI classification doesn't identify a date column, source_date will be NULL
- period_id is set to NULL (line 585: `period_id: null`) — **CORRECT per Decision 92**

### Decision 92 Compliance
- source_date: SET at import time from data ✓
- period_id: NULL at import time ✓ (engine binds at calc time)
- Engine queries by source_date range (run/route.ts lines 285-308) ✓

## MISSION 4: CONVERGENCE AT IMPORT TIME

### What Convergence Does
`convergeBindings` at import time:
1. Queries all active rule_sets for the tenant
2. For each rule_set, analyzes committed_data field names
3. Derives metric bindings (maps data fields to plan component inputs)
4. Writes bindings to rule_sets.input_bindings

### Should It Run at Import Time?
**NO.** Convergence binds data fields to plan components. This is a CALCULATION-TIME concern. Running at import time:
- Requires plans to exist before data
- Fails silently when no active rule_sets exist
- May produce incomplete bindings if only partial data exists
- Runs redundantly (calculation engine also resolves bindings)

## MISSION 5: IMPORT-TIME DEPENDENCY MAP

### WHAT RUNS AT IMPORT TIME (CURRENT STATE)
| # | Operation | Requires | Violation? |
|---|-----------|----------|------------|
| 1 | File storage to Supabase | Nothing | NO ✓ |
| 2 | Processing job creation | Nothing | NO ✓ |
| 3 | Content parsing (XLSX/CSV/PDF) | Nothing | NO ✓ |
| 4 | SCI classification | Nothing | NO ✓ |
| 5 | committed_data insertion | Nothing | NO ✓ |
| 6 | source_date extraction | Date column binding | NO ✓ (Decision 92) |
| 7 | Entity ID binding | Entities must exist | **YES** — requires roster before data |
| 8 | postCommitConstruction | Entities + plans must exist | **YES** — requires roster + plan before data |
| 9 | Convergence derivation | Active rule_sets must exist | **YES** — requires plans before data |
| 10 | Flywheel self-correction | Structural fingerprints | NO (non-blocking diagnostic) |

### WHAT SHOULD RUN AT IMPORT TIME
1. File storage ✓
2. Processing job creation ✓
3. Content parsing ✓
4. SCI classification ✓
5. committed_data insertion with ALL raw row data ✓
6. source_date extraction ✓
7. Structural fingerprinting ✓

### WHAT SHOULD NOT RUN AT IMPORT TIME
1. **Entity ID binding** → defer to calculation time (the convergence path already handles this)
2. **postCommitConstruction** → defer entity assignments to calculation time
3. **Convergence derivation** → defer to calculation time (runs there anyway)

## MISSION 6: CALCULATION ENGINE DATA LOADING

### How the Engine Loads Data (run/route.ts lines 279-308)
```typescript
// source_date range query (primary path)
const { data: page } = await supabase
  .from('committed_data')
  .select('entity_id, data_type, row_data, import_batch_id')
  .eq('tenant_id', tenantId)
  .not('source_date', 'is', null)
  .gte('source_date', period.start_date)
  .lte('source_date', period.end_date)
```
- Does NOT filter by entity_id in the query
- Groups by entity_id AFTER loading (line 362)
- NULL entity_id rows go to storeData, not dataByEntity
- Convergence path (dataByBatch) provides entity matching via row_data field values

### Can the Engine Work Without Import-Time Entity Binding?
**YES** — via the convergence binding path (dataByBatch, lines 397-444). This path:
1. Reads entity_identifier column name from convergence bindings
2. Indexes committed_data by `row_data[entity_column]` value
3. Resolves entity by external_id match
4. No dependency on entity_id FK being populated

## RECOMMENDED FIX

**Make import-time operations sequence-independent:**

1. **Remove entity ID binding from processDataUnit** (lines 536-577) — the import should store raw data without attempting entity resolution
2. **Remove convergence derivation from processDataUnit** (lines 685-716) — convergence should run at calculation time
3. **Simplify postCommitConstruction** — remove entity_id binding. Keep only entity creation (for roster imports) and rule_set_assignments (if entities exist)
4. **source_date extraction stays** — it's correct per Decision 92

The engine already has the convergence path for entity resolution at calculation time. Removing import-time binding makes the pipeline truly sequence-independent: data, roster, and plans can be imported in ANY order.

## STANDING RULE COMPLIANCE
- Rule 40 (diagnostic-first): PASS — read-only audit, zero code changes
- Rule 27 (evidence = paste): PASS — code lines cited with line numbers
- Rule 34 (no workarounds): PASS — structural diagnosis with architectural fix recommendation
