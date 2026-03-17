# HF-109: DS-009 SPECIFICATION ADHERENCE — FOUR ARCHITECTURAL CORRECTIONS
## Decision 111 Built as Designed, Not as Convenient

**Priority:** P0 — Architecture Integrity
**Trigger:** Forensic review of OB-162 + HF-108 against DS-009 specification. Four deviations from the locked specification identified. All four must be corrected before production verification.
**Branch:** dev
**Ground truth:** MX$185,063 — Meridian Logistics Group, January 2025
**Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
**VL Admin:** `9c179b53-c5ee-4af7-a36b-09f5db3e35f2` (platform@vialuce.com, role='platform', tenant_id IS NULL)
**Depends on:** OB-162 (PR #210) + HF-108 (PR #211) merged to main
**Controlling specification:** DS-009_Field_Identity_Architecture_20260308.md — this is the authoritative design. Every implementation detail in this HF must trace back to a specific section of DS-009. If the implementation contradicts DS-009, the implementation is wrong.

AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase sequentially. Commit and push after every change. If a phase fails, diagnose and fix — do not stop and ask.

---

## READ FIRST

1. Read `CC_STANDING_ARCHITECTURE_RULES.md` in the repo root.
2. Read `DS-009_Field_Identity_Architecture_20260308.md` in project knowledge. This is the controlling specification. Every change in this HF must implement DS-009 as written, not as approximated.

---

## WHY THIS HF EXISTS

OB-162 and HF-108 implemented Decision 111 directionally but deviated from the specification in four ways. Each deviation was accepted by reviewers under time pressure. Each contradicts what DS-009 requires. Building a platform means building to specification — not building something that works for the current test case.

### THE FOUR DEVIATIONS

**Deviation 1 (P0): Engine resolves data by entity_id FK, not by convergence binding column + external_id.**

DS-009 Section 5.1 specifies:
```sql
SELECT row_data
FROM committed_data
WHERE tenant_id = $1
  AND import_batch_id = $bound_batch_id
  AND row_data->>$entity_column = $entity_external_id
  AND source_date BETWEEN $period_start AND $period_end;
```

HF-108 built:
```typescript
const key = row.entity_id || '__no_entity__';
```

The engine indexes by entity_id (UUID FK) instead of by `row_data->>entity_column` (the convergence binding's entity identifier column + value). This means the engine depends on entity resolution populating entity_id before calculation can work. If entity resolution fails or matches wrong, the engine cannot recover. DS-009 says: *"convergence told me to get the value from column X in batch Y for entity Z in period W."* The "entity Z" is the external_id resolved through the convergence binding's entity_identifier column — NOT the entity_id FK.

**Deviation 2 (P1): metric_derivations still actively written alongside convergence_bindings.**

DS-009 Section 4.3 specifies input_bindings with convergence_bindings as THE format — no dual structure. The specification shows a single `component_0` object with actual/target/entity_identifier/period bindings. There is no `metric_derivations` field in the specification. HF-108 still writes both. This is AP-17 (dual code paths) at the data layer.

**Deviation 3 (P1): Entity resolution runs during import execution, not post-import.**

DS-009 Section 3.3 specifies:
> "Entity resolution runs after import completes, not during import. The sequence:
> 1. User uploads file → import stores in committed_data with field identities
> 2. Post-import: entity resolution scans committed_data for person identifiers
> 3. New entities created in entities table
> 4. entity_id on committed_data rows populated"

HF-108 runs entity resolution inside the entity pipeline function during SCI execute — entities are created in the same request cycle as the committed_data insert. This prevents entity resolution from being re-run independently, prevents cross-sheet entity discovery (a transaction sheet imported separately can't contribute to entity resolution), and violates the specification's explicit timing requirement.

**Deviation 4 (P1): Convergence Pass 2 uses token overlap between component names and contextualIdentity.**

DS-009 Section 4.2 specifies:
> "Pass 2: Contextual match. Among structurally valid candidates, use HC contextual identity to disambiguate. If two sheets both have measures, but one has currency_amount and the other has delivery_percentage, the plan component's description aligns with currency_amount."

The specification says Pass 2 disambiguates using the TYPE of contextual identity (currency_amount vs delivery_percentage), not linguistic overlap between component names and identity strings. OB-162's implementation tokenizes both component names and contextualIdentity strings and does token overlap — this fails the Korean Test because component names in Hangul won't overlap with English contextual identities.

The correct Pass 2: match the component's INPUT REQUIREMENTS (what structural types + contextual types does this component need?) against the batch's field identities. A 2D lookup component that operates on a ratio (actual/target) needs TWO measure columns. A gate component needs ONE measure column. The component's STRUCTURAL PATTERN disambiguates — not the linguistic content of its name.

---

## WHAT NOT TO DO

1. **DO NOT use entity_id FK for data resolution.** Use convergence binding entity_identifier column + external_id. entity_id FK is for entity iteration (which entities to calculate) ONLY.
2. **DO NOT write metric_derivations when convergence_bindings succeeds.** Single output format.
3. **DO NOT run entity resolution inside the SCI execute pipeline function.** Separate it into a post-import step.
4. **DO NOT tokenize component names for Pass 2 matching.** Use component structural patterns (operation type, input count, input types) to disambiguate.
5. **DO NOT hardcode column names, field names, or domain vocabulary.** Korean Test (AP-25).
6. **DO NOT provide answer values (MX$185,063) to the engine.** Fix logic, not data.
7. **DO NOT create parallel code paths.** Replace the deviating code, don't add alternatives alongside it. AP-17.

---

## PHASE 0: DIAGNOSTIC — LOCATE ALL FOUR DEVIATIONS

### 0.1: Deviation 1 — Find engine entity_id FK usage in data resolution

```bash
# Find where the engine uses entity_id to index committed_data for component resolution
grep -rn "entity_id\|entityId.*data\|dataByEntity\|dataByBatch.*entity_id" \
  web/src/app/api/calculation/run/route.ts | head -20

# Find the HF-108 batch cache construction
grep -rn "dataByBatch\|resolveMetrics\|resolveColumn\|ConvergenceBinding" \
  web/src/app/api/calculation/run/route.ts | head -20

# Find where entity_id FK is used vs where external_id + column binding should be used
grep -rn "entity_id\|external_id\|entityExternalId\|entity_identifier" \
  web/src/app/api/calculation/run/route.ts | head -30
```

### 0.2: Deviation 2 — Find metric_derivations dual write

```bash
# Find where convergence output writes both formats
grep -rn "metric_derivations\|convergence_bindings" \
  web/src/app/api/import/sci/execute/route.ts \
  web/src/lib/intelligence/convergence-service.ts | head -20
```

### 0.3: Deviation 3 — Find entity resolution inside SCI execute

```bash
# Find entity creation inside execute pipeline
grep -rn "entities.*insert\|deriveEntities\|sharedEntityMap\|entityCreate" \
  web/src/app/api/import/sci/execute/route.ts | head -20

# Find if a separate entity resolution endpoint/function exists
grep -rn "entityResolution\|resolveEntities\|deriveEntities" \
  web/src/app/api/ web/src/lib/ --include="*.ts" -l
```

### 0.4: Deviation 4 — Find Pass 2 token overlap code

```bash
# Find convergence matching code
grep -rn "compTokens\|ciTokens\|tokenize.*contextual\|token.*overlap\|Pass.*2\|contextual.*match" \
  web/src/lib/intelligence/convergence-service.ts | head -20
```

### 0.5: Decision 78 — SQL test of the CORRECT engine query pattern

Before writing any code, prove DS-009's engine query pattern works with SQL:

```sql
-- This is the query DS-009 specifies the engine should use.
-- It does NOT use entity_id FK. It uses row_data->>column from convergence bindings.

-- Step 1: Get convergence_bindings
SELECT input_bindings->'convergence_bindings' as cb
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Step 2: Get one entity's external_id
SELECT external_id FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
LIMIT 1;

-- Step 3: Resolve data using convergence binding pattern (NOT entity_id FK)
-- Replace $BATCH_ID, $ENTITY_COL, $EXT_ID, $VALUE_COL with values from steps 1-2
SELECT
  row_data->>$ENTITY_COL as entity_key,
  row_data->>$VALUE_COL as value,
  source_date
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND import_batch_id = $BATCH_ID
  AND row_data->>$ENTITY_COL = $EXT_ID;

-- Step 4: Compare results — same query using entity_id FK (the WRONG way for DS-009)
SELECT
  entity_id,
  row_data as all_data,
  source_date
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND entity_id = (SELECT id FROM entities WHERE external_id = $EXT_ID AND tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79');
```

Both queries should return the same data. The first query (DS-009 pattern) is the correct one because it works WITHOUT entity_id FK being populated. The second query fails if entity resolution missed.

**If convergence_bindings is empty** (data not yet imported), note this and prepare the SQL for Andrew to run after re-import. But write the code to the specification pattern regardless.

### PROOF GATE 0:
```
□ Deviation 1 code location: entity_id FK usage in engine data resolution (file:line)
□ Deviation 2 code location: metric_derivations dual write (file:line)
□ Deviation 3 code location: entity resolution inside SCI execute (file:line)
□ Deviation 4 code location: Pass 2 token overlap (file:line)
□ SQL test of DS-009 engine query pattern attempted (paste SQL + results, or note if data pending)
□ All four deviations confirmed in code with exact file:line references
```

**Commit:** `HF-109 Phase 0: specification deviation diagnostic` + push

---

## PHASE 1: ENGINE DATA RESOLUTION VIA CONVERGENCE BINDING COLUMN + EXTERNAL_ID

This is the most important fix. The engine must resolve data as DS-009 Section 5.1 specifies.

### 1.1: Redesign the batch data cache

The current cache (HF-108) is:
```typescript
Map<batchId, Map<entity_id_uuid, Array<row_data>>>
```

The correct cache (DS-009) is:
```typescript
Map<batchId, Map<entity_external_id_value, Array<row_data>>>
```

The difference: the inner map key is NOT the entity_id UUID. It is the VALUE of the entity identifier column from `row_data`, as specified by the convergence binding's `entity_identifier.column`.

```typescript
// DS-009 compliant batch cache construction
function buildConvergenceBatchCache(
  committedData: Array<{ import_batch_id: string | null; row_data: Record<string, unknown> }>,
  convergenceBindings: Record<string, Record<string, ConvergenceBindingEntry>>
): Map<string, Map<string, Array<Record<string, unknown>>>> {
  
  // Collect all entity_identifier columns referenced by any component binding
  const entityColsByBatch = new Map<string, string>();
  for (const compBindings of Object.values(convergenceBindings)) {
    const entityIdBinding = compBindings.entity_identifier as ConvergenceBindingEntry | undefined;
    if (entityIdBinding?.source_batch_id && entityIdBinding?.column) {
      entityColsByBatch.set(entityIdBinding.source_batch_id, entityIdBinding.column);
    }
  }
  
  const cache = new Map<string, Map<string, Array<Record<string, unknown>>>>();
  
  for (const row of committedData) {
    const batchId = row.import_batch_id;
    if (!batchId) continue;
    
    // Get the entity identifier column for this batch (from convergence bindings)
    const entityCol = entityColsByBatch.get(batchId);
    if (!entityCol) continue; // This batch has no convergence binding — skip
    
    // Key by the VALUE in the entity identifier column, NOT by entity_id UUID
    const entityKey = String(row.row_data[entityCol] ?? '');
    if (!entityKey) continue;
    
    if (!cache.has(batchId)) cache.set(batchId, new Map());
    const entityMap = cache.get(batchId)!;
    if (!entityMap.has(entityKey)) entityMap.set(entityKey, []);
    entityMap.get(entityKey)!.push(row.row_data);
  }
  
  return cache;
}
```

### 1.2: Redesign the resolution function

```typescript
// DS-009 compliant data resolution
function resolveFromConvergenceBinding(
  cache: Map<string, Map<string, Array<Record<string, unknown>>>>,
  binding: ConvergenceBindingEntry,
  entityExternalId: string,
  entityIdentifierBinding: ConvergenceBindingEntry,
  periodStart: string | null,
  periodEnd: string | null,
): number | null {
  // The batch to query comes from the binding
  const batchId = binding.source_batch_id;
  // The column to read comes from the binding
  const column = binding.column;
  // The entity is identified by external_id looked up via the entity_identifier binding's column
  
  const batchData = cache.get(batchId);
  if (!batchData) return null;
  
  const entityRows = batchData.get(entityExternalId);
  if (!entityRows || entityRows.length === 0) return null;
  
  // If period filtering needed, filter by source_date
  let rows = entityRows;
  if (periodStart && periodEnd) {
    rows = entityRows.filter(row => {
      // Find the temporal column from convergence bindings (not hardcoded)
      // For now, use source_date from committed_data (already extracted at import)
      // TODO: Use the period binding's column for row-level temporal matching
      return true; // Period filtering handled at the committed_data query level
    });
  }
  
  // Extract the bound column value
  if (rows.length === 0) return null;
  const val = rows[0][column];
  if (val === null || val === undefined) return null;
  return typeof val === 'number' ? val : parseFloat(String(val)) || null;
}
```

### 1.3: Wire into the component loop

The entity iteration loop still uses entity_id (from rule_set_assignments) to determine WHICH entities to calculate. That's correct — rule_set_assignments bind entities to plans using UUIDs.

But the DATA RESOLUTION uses external_id + convergence binding column. The entity's external_id bridges the two worlds: entity UUID for iteration, external_id for data lookup.

```typescript
// In the component calculation loop:
for (const entityId of calculationEntityIds) {
  // Get entity's external_id for convergence binding lookup
  const entityInfo = entityInfoMap.get(entityId);
  const externalId = entityInfo?.external_id;
  
  if (!externalId) {
    addLog(`WARNING: Entity ${entityId} has no external_id — cannot resolve via convergence bindings`);
    // Fall back to old path for this entity
    continue;
  }
  
  for (const [compIdx, component] of components.entries()) {
    const compKey = `component_${compIdx}`;
    const compBindings = convergenceBindings?.[compKey];
    
    if (compBindings) {
      const entityIdBinding = compBindings.entity_identifier as ConvergenceBindingEntry;
      const actualBinding = compBindings.actual as ConvergenceBindingEntry;
      const targetBinding = compBindings.target as ConvergenceBindingEntry | undefined;
      
      // Resolve actual value: DS-009 pattern
      // "convergence told me to get the value from column X in batch Y for entity Z"
      const actualValue = resolveFromConvergenceBinding(
        batchCache, actualBinding, externalId, entityIdBinding,
        currentPeriod?.start_date, currentPeriod?.end_date
      );
      
      // Resolve target value (if component needs it)
      const targetValue = targetBinding 
        ? resolveFromConvergenceBinding(
            batchCache, targetBinding, externalId, entityIdBinding,
            currentPeriod?.start_date, currentPeriod?.end_date
          )
        : null;
      
      // Build metrics from resolved values
      // ... map to expected metric names for the evaluator
    } else {
      // FALLBACK: old resolution path for components without convergence bindings
    }
  }
}
```

### 1.4: Remove entity_id FK from data resolution path

The old `dataByEntity[entityId]` lookup and the HF-108 `dataByBatch` with entity_id key must be replaced, not supplemented. The convergence binding path uses external_id + column. The old path stays ONLY as fallback when convergence_bindings is empty (pre-Decision 111 data).

```bash
# After implementation, verify:
# The convergence binding resolution path should NOT reference entity_id for data lookup
grep -n "entity_id" web/src/app/api/calculation/run/route.ts | grep -v "calculationEntityIds\|entityInfoMap\|for.*entity\|assignments\|entity_period_outcomes\|calculation_results"
# Any remaining entity_id references should be in: iteration, assignments, results storage — NOT data resolution
```

### PROOF GATE 1:
```
□ Batch cache indexed by row_data entity column value, NOT entity_id UUID (paste cache construction code)
□ resolveFromConvergenceBinding uses external_id + binding column (paste full function)
□ Component loop uses external_id for data resolution (paste wiring code)
□ Old entity_id data resolution removed from convergence binding path (grep confirmation)
□ entity_id still used for iteration (calculationEntityIds) — that's correct (paste iteration code unchanged)
□ Zero hardcoded column names (grep confirmation)
□ npm run build exits 0
```

**Commit:** `HF-109 Phase 1: engine data resolution via convergence binding column + external_id (DS-009 5.1)` + push

---

## PHASE 2: STOP WRITING METRIC_DERIVATIONS

### 2.1: Convergence output — single format

When convergence produces convergence_bindings, do NOT also write metric_derivations. The output is ONE structure.

Find the convergence output write in execute/route.ts and convergence-service.ts:

```bash
grep -rn "metric_derivations\|convergence_bindings" \
  web/src/app/api/import/sci/execute/route.ts \
  web/src/lib/intelligence/convergence-service.ts | head -20
```

Change to:

```typescript
// When convergence_bindings succeeds:
if (Object.keys(result.componentBindings).length > 0) {
  updatedBindings = {
    convergence_bindings: result.componentBindings,
    // NO metric_derivations — convergence_bindings is the sole output
  };
} else {
  // Fallback: write metric_derivations only when convergence_bindings fails
  updatedBindings = {
    metric_derivations: merged,
    // NO convergence_bindings — failed to generate
  };
}
```

### 2.2: Engine reads accordingly

```typescript
// Engine priority — already correct from HF-108, verify:
if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
  // DS-009 path — use convergence_bindings exclusively
} else if (metricDerivations && metricDerivations.length > 0) {
  // Legacy path — use metric_derivations
}
// No scenario where both coexist for the same convergence run
```

### 2.3: Verify no dual writes

```bash
# After implementation:
grep -n "metric_derivations" web/src/app/api/import/sci/execute/route.ts
# Should appear ONLY in the fallback branch, never alongside convergence_bindings
```

### PROOF GATE 2:
```
□ Convergence writes convergence_bindings WITHOUT metric_derivations when bindings succeed (paste code)
□ metric_derivations written ONLY in fallback when convergence_bindings fails (paste fallback code)
□ Engine reads convergence_bindings first, metric_derivations as fallback (paste priority code — should be unchanged from HF-108)
□ grep confirms no dual-write scenario (paste grep output)
□ npm run build exits 0
```

**Commit:** `HF-109 Phase 2: single convergence output format (DS-009 4.3)` + push

---

## PHASE 3: ENTITY RESOLUTION — POST-IMPORT, CROSS-BATCH

### 3.1: Extract entity resolution from SCI execute into a separate function

Create a new function (or API endpoint) that performs entity resolution by scanning ALL committed_data for a tenant:

```typescript
// Location: web/src/lib/sci/entity-resolution.ts (NEW FILE)

/**
 * DS-009 Layer 3: Entity Resolution — Derived, Not Routed
 * 
 * Scans ALL committed_data for a tenant to discover person identifiers
 * from field identities. Creates/updates entities table. Backfills entity_id.
 * 
 * This function is called:
 * 1. After SCI execute completes ALL content units (not per-unit)
 * 2. On demand (e.g., when field identities are corrected)
 * 3. When new data is imported (progressive resolution)
 * 
 * It is NOT called inside any individual pipeline function.
 */
export async function resolveEntitiesFromCommittedData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ created: number; updated: number; linked: number }> {
  
  // Step 1: Scan ALL committed_data for this tenant
  // Find batches that have field_identities with identifier + person contextualIdentity
  const { data: batches } = await supabase
    .from('committed_data')
    .select('import_batch_id, metadata')
    .eq('tenant_id', tenantId)
    .not('metadata->field_identities', 'is', null)
    .limit(1000); // Get metadata per batch (dedup in code)
  
  if (!batches || batches.length === 0) return { created: 0, updated: 0, linked: 0 };
  
  // Step 2: From field identities, identify which columns are person identifiers
  // Korean Test: match on structuralType + contextualIdentity pattern, NOT column names
  const batchIdentifiers = new Map<string, { idColumn: string; nameColumn: string | null }>();
  
  const seenBatches = new Set<string>();
  for (const row of batches) {
    const batchId = row.import_batch_id;
    if (!batchId || seenBatches.has(batchId)) continue;
    seenBatches.add(batchId);
    
    const fieldIds = row.metadata?.field_identities as Record<string, {
      structuralType?: string;
      contextualIdentity?: string;
    }> | undefined;
    
    if (!fieldIds) continue;
    
    // Find person identifier columns
    let idColumn: string | null = null;
    let nameColumn: string | null = null;
    
    for (const [colName, fi] of Object.entries(fieldIds)) {
      if (fi.structuralType === 'identifier' &&
          fi.contextualIdentity?.toLowerCase().includes('person')) {
        idColumn = colName;
      }
      if (fi.structuralType === 'name') {
        nameColumn = colName;
      }
    }
    
    // Fallback: any identifier column if no 'person' contextual identity
    if (!idColumn) {
      for (const [colName, fi] of Object.entries(fieldIds)) {
        if (fi.structuralType === 'identifier') {
          idColumn = colName;
          break;
        }
      }
    }
    
    if (idColumn) {
      batchIdentifiers.set(batchId, { idColumn, nameColumn });
    }
  }
  
  if (batchIdentifiers.size === 0) return { created: 0, updated: 0, linked: 0 };
  
  // Step 3: Scan committed_data for unique entity identifiers across ALL batches
  const allEntities = new Map<string, string>(); // external_id → display_name
  
  for (const [batchId, { idColumn, nameColumn }] of batchIdentifiers) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .eq('import_batch_id', batchId);
    
    if (!rows) continue;
    
    for (const row of rows) {
      const extId = String(row.row_data[idColumn] ?? '');
      if (!extId) continue;
      const name = nameColumn ? String(row.row_data[nameColumn] ?? extId) : extId;
      if (!allEntities.has(extId)) {
        allEntities.set(extId, name);
      }
    }
  }
  
  // Step 4: Dedup against existing entities
  const { data: existing } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', tenantId);
  
  const existingMap = new Map((existing || []).map(e => [e.external_id, e.id]));
  
  // Step 5: Create new entities
  const newEntities = [];
  for (const [extId, name] of allEntities) {
    if (!existingMap.has(extId)) {
      newEntities.push({
        tenant_id: tenantId,
        external_id: extId,
        display_name: name,
        entity_type: 'individual',
        status: 'active',
        temporal_attributes: {},
        metadata: {},
      });
    }
  }
  
  let created = 0;
  if (newEntities.length > 0) {
    // Bulk insert (AP-2)
    const chunkSize = 500;
    for (let i = 0; i < newEntities.length; i += chunkSize) {
      const chunk = newEntities.slice(i, i + chunkSize);
      await supabase.from('entities').insert(chunk);
    }
    created = newEntities.length;
  }
  
  // Step 6: Backfill entity_id on ALL committed_data rows across ALL batches
  // Re-fetch full entity list (including newly created)
  const { data: allEntityRows } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', tenantId);
  
  const entityLookup = new Map((allEntityRows || []).map(e => [e.external_id, e.id]));
  let linked = 0;
  
  for (const [batchId, { idColumn }] of batchIdentifiers) {
    // Get committed_data rows with null entity_id for this batch
    const { data: unlinkeds } = await supabase
      .from('committed_data')
      .select('id, row_data')
      .eq('tenant_id', tenantId)
      .eq('import_batch_id', batchId)
      .is('entity_id', null);
    
    if (!unlinkeds || unlinkeds.length === 0) continue;
    
    // Group by entity for batch update
    const updatesByEntityUuid = new Map<string, string[]>();
    for (const row of unlinkeds) {
      const extId = String(row.row_data[idColumn] ?? '');
      const entityUuid = entityLookup.get(extId);
      if (entityUuid) {
        if (!updatesByEntityUuid.has(entityUuid)) updatesByEntityUuid.set(entityUuid, []);
        updatesByEntityUuid.get(entityUuid)!.push(row.id);
      }
    }
    
    // Batch update entity_id (AP-4 — batch, not per-row)
    for (const [entityUuid, rowIds] of updatesByEntityUuid) {
      // Batch ≤ 200 for .in() (standing rule)
      for (let i = 0; i < rowIds.length; i += 200) {
        const chunk = rowIds.slice(i, i + 200);
        await supabase
          .from('committed_data')
          .update({ entity_id: entityUuid })
          .in('id', chunk);
        linked += chunk.length;
      }
    }
  }
  
  return { created, updated: 0, linked };
}
```

### 3.2: Remove entity resolution from inside entity pipeline

The entity pipeline in execute/route.ts should ONLY:
1. Write rows to committed_data with field_identities and `informational_label: 'entity'`
2. NOT create entities directly
3. NOT populate sharedEntityMap during pipeline execution

Remove entity creation code from inside `executeEntityPipeline` (or equivalent function at route.ts:683-832). The entity pipeline becomes just another committed_data insert — same as transaction, target, and reference.

### 3.3: Call entity resolution after ALL content units complete

At the end of the SCI execute route, after the `for` loop over content units, call:

```typescript
// After ALL content units processed:
const entityResult = await resolveEntitiesFromCommittedData(supabase, tenantId);
addLog(`Entity resolution: ${entityResult.created} created, ${entityResult.linked} rows linked`);
```

This is the DS-009 specification: *"Post-import: entity resolution scans committed_data for person identifiers."* It runs ONCE for the entire import, not per-content-unit. It scans ALL committed_data for the tenant, including transaction sheets that might contain entity identifiers.

### 3.4: Verify entity pipeline is now uniform

After this change, all five pipelines (entity, transaction, target, reference, plan) should follow the same pattern:
- Entity, transaction, target, reference → committed_data with field_identities + informational_label
- Plan → rule_sets (unchanged — plans aren't data)
- Entity resolution → post-import, tenant-wide, from committed_data

```bash
# Verify: no direct entity creation inside pipeline functions
grep -n "\.from('entities').*insert\|entities.*upsert" \
  web/src/app/api/import/sci/execute/route.ts
# Should appear ZERO times inside pipeline functions
# Should appear ONLY in resolveEntitiesFromCommittedData (separate file)
```

### PROOF GATE 3:
```
□ resolveEntitiesFromCommittedData function in separate file (paste full file path + function)
□ Function scans ALL committed_data batches for person identifiers (paste batch scanning code)
□ Korean Test: identifier detection by structuralType + contextualIdentity, NOT column names (paste filter logic)
□ Entity pipeline writes to committed_data ONLY, no direct entity creation (paste modified pipeline code)
□ Entity resolution called AFTER all content units complete (paste wiring in SCI execute route)
□ entity_id backfill uses .in() with ≤200 batches (paste batch update code)
□ grep confirms zero entity inserts inside pipeline functions (paste grep output)
□ npm run build exits 0
```

**Commit:** `HF-109 Phase 3: post-import entity resolution from committed_data (DS-009 3.3)` + push

---

## PHASE 4: CONVERGENCE PASS 2 — STRUCTURAL CO-LOCATION, NOT TOKEN OVERLAP

### 4.1: Redesign Pass 2

Pass 2 should disambiguate among structurally valid candidates using the component's STRUCTURAL PATTERN, not linguistic overlap with the component name.

Each component type has a structural signature:

| Component Operation | Structural Signature |
|---|---|
| bounded_lookup_2d | Needs 2 measure columns (actual + target) + identifier + temporal |
| bounded_lookup_1d | Needs 1 measure column + identifier + temporal |
| scalar_multiply | Needs 1 measure column + identifier + temporal |
| conditional_gate | Needs 1 measure column (boolean/threshold) + identifier + temporal |
| ratio | Needs 2 measure columns (numerator + denominator) + identifier + temporal |
| aggregate | Needs 1 measure column + grouping identifier + temporal |

Pass 2 matches these signatures against batch field identities:

```typescript
function pass2StructuralDisambiguation(
  structuralCandidates: BatchCandidate[],
  component: PlanComponent,
): BatchCandidate | null {
  
  const operation = component.calculationIntent?.operation || component.calculationType;
  
  // Count how many measure columns the component needs
  const needsMeasures = getRequiredMeasureCount(operation);
  // e.g., bounded_lookup_2d → 2, scalar_multiply → 1, ratio → 2
  
  // Count how many measure columns each candidate has
  for (const candidate of structuralCandidates) {
    const measureCount = Object.values(candidate.fieldIdentities)
      .filter(fi => fi.structuralType === 'measure').length;
    
    candidate.structuralFitScore = 0;
    
    // Does the batch have the right NUMBER of measures?
    if (measureCount >= needsMeasures) {
      candidate.structuralFitScore += 0.5;
    }
    
    // Does the batch have a temporal column?
    const hasTemporal = Object.values(candidate.fieldIdentities)
      .some(fi => fi.structuralType === 'temporal');
    if (hasTemporal) {
      candidate.structuralFitScore += 0.25;
    }
    
    // For ratio/2D: does the batch have contextually DIFFERENT measures?
    // (e.g., one currency_amount and one percentage — likely actual + target)
    if (needsMeasures >= 2) {
      const contextualTypes = new Set(
        Object.values(candidate.fieldIdentities)
          .filter(fi => fi.structuralType === 'measure')
          .map(fi => fi.contextualIdentity)
      );
      if (contextualTypes.size >= 2) {
        candidate.structuralFitScore += 0.25; // Diverse measures = likely actual+target pair
      }
    }
  }
  
  // Sort by structural fit score
  structuralCandidates.sort((a, b) => (b.structuralFitScore || 0) - (a.structuralFitScore || 0));
  
  // If top candidate has significantly better fit than second, use it
  if (structuralCandidates.length === 1) return structuralCandidates[0];
  if (structuralCandidates.length >= 2) {
    const gap = (structuralCandidates[0].structuralFitScore || 0) - 
                (structuralCandidates[1].structuralFitScore || 0);
    if (gap >= 0.25) return structuralCandidates[0];
  }
  
  // Ambiguous — return null (ambiguity resolution on Evaluate surface)
  return null;
}
```

### 4.2: Korean Test verification

The Pass 2 implementation must not contain:
- Component name tokenization
- contextualIdentity string tokenization
- Any string comparison between component names and field identity values
- Any language-specific strings

It MUST use only:
- structuralType counts (how many measures, identifiers, temporals)
- contextualIdentity TYPE comparison (are the measures of different kinds? — uses set cardinality, not string matching)
- Component operation type (bounded_lookup_2d, scalar_multiply, etc. — these are structural, not linguistic)

```bash
# Verify Korean Test compliance:
grep -n "tokenize\|compTokens\|ciTokens\|component.*name.*token\|name.*split\|name.*match" \
  web/src/lib/intelligence/convergence-service.ts
# ZERO results in Pass 2 code
```

### 4.3: Remove old token overlap Pass 2

Find and replace the old Pass 2 code that tokenizes component names and contextualIdentity strings.

### PROOF GATE 4:
```
□ Pass 2 uses structural signatures (operation type + measure count), NOT token overlap (paste code)
□ getRequiredMeasureCount function maps operation types to measure counts (paste function)
□ Disambiguation by contextual type DIVERSITY (set cardinality), not linguistic overlap (paste code)
□ Zero tokenization of component names in Pass 2 (grep confirmation)
□ Zero language-specific strings in Pass 2 (grep confirmation)
□ Ambiguous cases return null (deferred to Evaluate surface) (paste null return path)
□ npm run build exits 0
```

**Commit:** `HF-109 Phase 4: convergence Pass 2 structural co-location (DS-009 4.2)` + push

---

## PHASE 5: SQL VERIFICATION + BUILD + PR

### 5.1: Decision 78 SQL tests

After Andrew runs cleanup SQL and re-imports Meridian XLSX, verify:

```sql
-- 1. DS-009 engine query pattern works
-- Get a convergence binding
SELECT input_bindings->'convergence_bindings'->'component_0'->'actual'->>'column' as actual_col,
       input_bindings->'convergence_bindings'->'component_0'->'entity_identifier'->>'column' as entity_col,
       input_bindings->'convergence_bindings'->'component_0'->'actual'->>'source_batch_id' as batch_id
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- 2. Verify data is resolvable via convergence binding (NOT entity_id FK)
-- Replace $ACTUAL_COL, $ENTITY_COL, $BATCH_ID from query 1 above
-- Replace $EXT_ID with any entity external_id
SELECT
  row_data->>$ENTITY_COL as entity,
  row_data->>$ACTUAL_COL as actual_value,
  source_date
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND import_batch_id = $BATCH_ID
  AND row_data->>$ENTITY_COL = $EXT_ID;

-- 3. Verify no metric_derivations when convergence_bindings exists
SELECT
  input_bindings ? 'convergence_bindings' as has_cb,
  input_bindings ? 'metric_derivations' as has_md
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
-- Expected: has_cb = true, has_md = false

-- 4. Verify entity data in committed_data (not just entities table)
SELECT metadata->>'informational_label' as label, count(*)
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
GROUP BY metadata->>'informational_label';
-- Expected: entity, transaction, reference all present

-- 5. Engine Contract 7-value
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_items,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
```

### 5.2: Build and PR

```bash
kill dev server
rm -rf .next
npm run build   # MUST exit 0
npm run dev

gh pr create --base main --head dev \
  --title "HF-109: DS-009 specification adherence — four architectural corrections" \
  --body "Corrects four deviations from DS-009 (Decision 111) specification in OB-162/HF-108.

## What Changed
1. Engine data resolution via convergence binding column + external_id (NOT entity_id FK)
2. Stop writing metric_derivations when convergence_bindings succeeds (single output format)
3. Entity resolution extracted to post-import function, scans ALL committed_data
4. Convergence Pass 2 uses structural co-location (measure count, operation type), NOT token overlap

## Specification Compliance
Every change traces to a specific DS-009 section:
- Phase 1 → DS-009 Section 5.1 (engine query pattern)
- Phase 2 → DS-009 Section 4.3 (input_bindings format)
- Phase 3 → DS-009 Section 3.3 (entity resolution timing)
- Phase 4 → DS-009 Section 4.2 (convergence matching algorithm)

## Korean Test
Pass 2 convergence matching uses structural signatures (operation type, measure count),
not linguistic overlap. Zero language-specific strings added.

## Ground Truth
MX\$185,063 pending Andrew's production verification after merge."
```

### PROOF GATE 5:
```
□ npm run build exits 0 (paste last 5 lines)
□ PR created with descriptive title and body (paste PR URL)
□ SQL tests prepared (paste all SQL, note if data pending)
□ Completion report saved as HF-109_COMPLETION_REPORT.md
```

---

## COMPLETION REPORT REQUIREMENTS (Evidentiary Gates — Slot 25)

The completion report MUST include:
1. **For every proof gate:** pasted code, terminal output, grep results. NOT PASS/FAIL claims.
2. **For every deviation fix:** side-by-side comparison of old code vs new code, with DS-009 section reference.
3. **For the SQL tests:** either pasted results (if data exists) or prepared SQL with note that Andrew will run post-import.
4. **For Korean Test:** grep showing zero language-specific strings in new code.

---

## ANDREW'S PRODUCTION VERIFICATION (Post-Merge)

After Andrew merges HF-109 and Vercel deploys:

1. **Run cleanup SQL** from OB-162_CLEANUP_SQL.md
2. **Upload Meridian XLSX** on vialuce.ai
3. **Check Vercel Runtime Logs** for:
   - `HF-109 Using convergence_bindings (Decision 111)` — engine used DS-009 path
   - `HF-109 Batch cache built with external_id keys` — cache indexed by external_id, not entity_id
   - `Entity resolution: N created, M rows linked` — post-import entity resolution
   - `Convergence Pass 2: structural disambiguation` — structural, not token overlap
4. **Run SQL verification queries** from Phase 5.1
5. **Navigate to Calculate** → run January 2025
6. **Verify MX$185,063** rendered
7. **Screenshot** as production evidence

**No finding marked ✅ without production evidence.** Localhost PASS ≠ production PASS.

---

## ANTI-PATTERN CHECKLIST

```
Before submitting completion report, verify:
□ Every change traces to a specific DS-009 section? (cite section for each phase)
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ Korean Test: would this work with Hangul column names AND Hangul component names?
□ Single code path (no duplicate pipelines)? AP-17
□ Atomic operations (clean state on failure)?
□ No SQL with unverified column names (FP-49)?
□ Decision 78: SQL test BEFORE code implementation?
□ Evidentiary gates: pasted code/output/grep, not PASS/FAIL?
□ No deviation from DS-009 accepted as "pragmatic" or "for now"?
```

---

*HF-109 — DS-009 Specification Adherence | March 9, 2026*

*"The specification exists so we don't have to re-derive what 'correct' means every time we review code. If the implementation contradicts the specification, the implementation is wrong. Not 'pragmatically different.' Not 'acceptable for now.' Wrong."*
