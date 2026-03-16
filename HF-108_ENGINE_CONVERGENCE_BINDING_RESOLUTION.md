# HF-108: ENGINE CONVERGENCE BINDING RESOLUTION + ENTITY DERIVATION
## Fixes OB-162 Deficiency 1 (P0) + Deficiency 2 (P1)

**Priority:** P0 — Architecture Completion
**Trigger:** OB-162 forensic analysis — engine logs convergence_bindings but does not USE them; entity resolution still classification-routed
**Branch:** dev
**Ground truth:** MX$185,063 — Meridian Logistics Group, January 2025
**Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
**VL Admin:** `9c179b53-c5ee-4af7-a36b-09f5db3e35f2` (platform@vialuce.com, role='platform', tenant_id IS NULL)
**Depends on:** OB-162 (PR #210) merged to main

AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase sequentially. Commit and push after every change. If a phase fails, diagnose and fix — do not stop and ask.

---

## READ FIRST — CC_STANDING_ARCHITECTURE_RULES.md

Read the full contents of `CC_STANDING_ARCHITECTURE_RULES.md` in the repo root before proceeding. Every principle, anti-pattern, and operational rule applies to this HF.

---

## WHY THIS HF EXISTS

OB-162 implemented Decision 111's import-side architecture correctly: HC asks the stable question, all data routes to committed_data with field_identities in metadata, reference pipeline redirected, convergence generates convergence_bindings with per-component column-level bindings.

**But two critical gaps remain:**

### Gap 1 (P0): Engine logs convergence_bindings but does not use them

OB-162 added 12 lines to the calculation engine that PARSE and LOG convergence_bindings:
```typescript
const convergenceBindings = inputBindings?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
if (convergenceBindings) {
  addLog(`OB-162 Convergence bindings: ${bindingCount} component bindings`);
  // ... more logging
}
```

The engine then proceeds with the OLD data resolution path (sheet-matching via data_type + entity_id). The convergence_bindings are never consumed for actual data fetching. **The vertical slice chain breaks at convergence → calculation.**

Decision 111 (DS-009 Section 5.1) requires:
> "The engine queries committed_data filtered by field identity matched through convergence bindings."
> "convergence told me to get the value from column X in batch Y for entity Z in period W."

### Gap 2 (P1): Entity resolution still classification-routed

The entity pipeline at route.ts:683-832 still creates entities directly from entity-classified sheets. Under Decision 111 (DS-009 Layer 3):
> "Entity population is no longer determined by import-time classification. It is derived from committed_data."
> "Entity resolution runs after import completes, not during import."

Entity-classified sheets should write to committed_data (like transaction and reference now do), and entity resolution should scan committed_data for person identifier field identities post-import.

---

## WHAT THIS HF DOES

1. **Engine data resolution via convergence_bindings** — for each component, the engine reads the bound batch_id + column from convergence_bindings and queries committed_data using those bindings
2. **Entity pipeline → committed_data** — entity-classified sheets write to committed_data with field_identities, same as transaction/target/reference
3. **Entity resolution from committed_data** — post-import scan of committed_data for person identifier field identities creates/updates entities table
4. **Deprecate metric_derivations** — convergence_bindings is the authoritative source; metric_derivations preserved as read-only fallback but no longer written

---

## WHAT NOT TO DO

1. **DO NOT leave the old sheet-matching data resolution as the primary path.** convergence_bindings is the primary path. Old path is fallback ONLY when convergence_bindings is empty (pre-OB-162 data).
2. **DO NOT hardcode column names, entity identifier patterns, or domain vocabulary.** Korean Test (AP-25).
3. **DO NOT create a parallel entity resolution path.** Modify the existing entity pipeline to write to committed_data, then run entity resolution from committed_data. AP-17.
4. **DO NOT provide answer values (MX$185,063) to the engine.** Fix logic, not data.
5. **DO NOT delete metric_derivations from existing input_bindings.** Preserve for backward compatibility with pre-OB-162 data. Stop writing new ones.
6. **DO NOT modify plan import, HC prompt, or convergence matching.** OB-162 got those right.

---

## PHASE 0: DIAGNOSTIC — CURRENT ENGINE DATA RESOLUTION

Before any changes, trace exactly how the engine currently resolves data for a component. This is Decision 65 + Decision 78.

### 0.1: Find the engine's data fetching code

```bash
# How does the engine get data for a component?
grep -rn "committed_data\|row_data\|entity_id.*data\|getEntityData\|fetchData\|resolveMetric" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ \
  --include="*.ts" | head -40

# How does the engine iterate over entities?
grep -rn "entities.*forEach\|entities.*map\|for.*entity\|entityLoop" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ \
  --include="*.ts" | head -20

# How does the engine resolve input sources (metric:actual, metric:target)?
grep -rn "metric.*actual\|metric.*target\|resolveInput\|inputSource\|source.*metric" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ \
  --include="*.ts" | head -20
```

### 0.2: Find the entity pipeline's current write target

```bash
# Where does the entity pipeline write?
grep -rn "\.from('entities')\|\.insert.*entities\|entities.*upsert" \
  web/src/app/api/import/sci/execute/route.ts | head -10

# Does it also write to committed_data?
grep -n "committed_data" \
  web/src/app/api/import/sci/execute/route.ts | head -10
```

### 0.3: Test with SQL first (Decision 78)

**THIS IS MANDATORY.** OB-162 skipped this. We will not skip it.

Run these queries to prove the data resolution path works before writing any code:

```sql
-- Step 1: Get convergence_bindings from rule_set
SELECT jsonb_pretty(input_bindings->'convergence_bindings')
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

If convergence_bindings is populated (from OB-162's convergence), extract one component's bindings and manually resolve data:

```sql
-- Step 2: Pick one entity
SELECT id, external_id, display_name
FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
LIMIT 1;

-- Step 3: Using the binding's source_batch_id and column name,
-- fetch that entity's data from committed_data
-- (Replace $BATCH_ID, $ENTITY_COLUMN, $EXTERNAL_ID, $VALUE_COLUMN with actual values from bindings)
SELECT
  row_data->>$ENTITY_COLUMN as entity_key,
  row_data->>$VALUE_COLUMN as actual_value,
  source_date
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND import_batch_id = $BATCH_ID
  AND row_data->>$ENTITY_COLUMN = $EXTERNAL_ID;
```

**Paste the actual SQL with real values substituted and the actual result rows.** This proves the data resolution path before any code changes.

If convergence_bindings is empty (convergence didn't run yet because data was cleaned before OB-162 merge), note this and proceed — the SQL test will run after re-import.

### PROOF GATE 0:
```
□ Engine data fetching code identified (file:line for each data query)
□ Engine entity iteration code identified (file:line)
□ Engine input source resolution code identified (file:line)
□ Entity pipeline write target identified (file:line — expect entities table direct write)
□ SQL test with convergence_bindings attempted (paste SQL + results, or note if bindings empty)
□ Current engine data resolution path fully traced: entity loop → data fetch → input resolution → primitive execution
```

**Commit:** `HF-108 Phase 0: engine data resolution diagnostic` + push

---

## PHASE 1: ENGINE DATA RESOLUTION VIA CONVERGENCE BINDINGS

### 1.1: Design the resolution function

Create a function that resolves a component's input from convergence_bindings:

```typescript
interface ConvergenceBinding {
  source_batch_id: string;
  column: string;
  field_identity: { structuralType: string; contextualIdentity: string };
  match_pass: number;
  confidence: number;
}

/**
 * Resolve a single input value for one entity from convergence bindings.
 * 
 * @param supabase - service role client
 * @param tenantId - tenant UUID
 * @param binding - the convergence binding (batch_id + column)
 * @param entityExternalId - the entity's external_id
 * @param entityIdentifierColumn - which column holds the entity identifier (from bindings)
 * @param periodStart - period start date (Decision 92)
 * @param periodEnd - period end date (Decision 92)
 * @returns The resolved value as a number, or null if not found
 */
async function resolveFromBinding(
  supabase: SupabaseClient,
  tenantId: string,
  binding: ConvergenceBinding,
  entityExternalId: string,
  entityIdentifierColumn: string,
  periodStart: string | null,
  periodEnd: string | null
): Promise<number | null> {
  // Query committed_data using the binding's batch_id and column
  // Filter by entity identifier and period (source_date BETWEEN)
  // Extract the bound column value from row_data
}
```

**Critical implementation detail:** The entity identifier column itself comes from the convergence_bindings (the `entity_identifier` binding). The period column comes from the `period` binding. Both are resolved from convergence, not hardcoded.

### 1.2: Wire into the calculation loop

Find the engine's per-entity per-component calculation loop. Currently it resolves inputs via the old path (sheet matching by data_type, entity_id FK). Add a conditional:

```typescript
// Pseudocode — locate the actual resolution point
if (convergenceBindings && convergenceBindings[`component_${componentIndex}`]) {
  // NEW PATH: resolve via convergence bindings
  const compBindings = convergenceBindings[`component_${componentIndex}`];
  const actualBinding = compBindings.actual as ConvergenceBinding;
  const entityIdBinding = compBindings.entity_identifier as ConvergenceBinding;
  
  const actualValue = await resolveFromBinding(
    supabase, tenantId, actualBinding,
    entity.external_id, entityIdBinding.column,
    period.start_date, period.end_date
  );
  // ... resolve target, other inputs similarly
} else {
  // FALLBACK: old sheet-matching path (for pre-OB-162 data)
  // ... existing code unchanged
}
```

**The convergence binding path is PRIMARY.** The old path is FALLBACK for data imported before OB-162. Log which path is taken for every entity-component combination.

### 1.3: Handle the five component types

Meridian has 5 components. Each needs different inputs resolved from convergence bindings:

1. **Rendimiento de Ingreso (2D lookup)** — needs actual (measure) + target (measure) + entity identifier + period
2. **Entrega a Tiempo (1D lookup)** — needs actual (measure) + entity identifier + period
3. **Cuentas Nuevas (scalar)** — needs actual (measure) + entity identifier + period
4. **Seguridad (gate)** — needs actual (measure) + entity identifier + period
5. **Utilización de Flota (ratio)** — needs actual (measure) + target/reference (measure) + entity identifier + period

The convergence_bindings structure should have per-component bindings for each input role. If any component is missing bindings, fall back to the old path for THAT component only (not all components).

### 1.4: Batch the queries

**AP-2 / AP-4 compliance.** Do NOT query committed_data once per entity per component. Instead:

1. Read all convergence_bindings upfront
2. For each unique batch_id in the bindings, fetch ALL rows from that batch in one query
3. Build an in-memory lookup: `Map<batch_id, Map<entity_key, row_data>>`
4. Resolve individual entity-component values from the lookup

This is O(batches) queries, not O(entities × components) queries. For Meridian: ~3 queries (one per import batch) instead of 50 × 5 = 250 queries.

```typescript
// Pseudocode for batched data loading
const batchDataCache = new Map<string, Map<string, Record<string, unknown>>>();

for (const [batchId, entityColumn] of uniqueBatches) {
  const { data: rows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .eq('import_batch_id', batchId);
  
  const entityMap = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const entityKey = String(row.row_data[entityColumn] ?? '');
    entityMap.set(entityKey, row.row_data);
  }
  batchDataCache.set(batchId, entityMap);
}

// Then for each entity-component:
function resolveFromCache(
  batchId: string, 
  entityKey: string, 
  column: string
): number | null {
  const entityMap = batchDataCache.get(batchId);
  if (!entityMap) return null;
  const rowData = entityMap.get(entityKey);
  if (!rowData) return null;
  const val = rowData[column];
  return typeof val === 'number' ? val : parseFloat(String(val)) || null;
}
```

**Scale analysis:** At 10x (860 rows), this fetches 860 rows in ~3 queries and builds an in-memory map. At 100x (8,600 rows), same approach with batching ≤200 for `.in()` queries if needed (standing rule). At enterprise (50M rows), chunk loading + streaming required — but architecture supports it without redesign.

### PROOF GATE 1:
```
□ resolveFromBinding function created (paste full function code)
□ Batched data loading implemented (paste cache-building code)
□ Engine calculation loop wired to use convergence_bindings as PRIMARY path (paste the conditional + wiring)
□ Old sheet-matching path preserved as FALLBACK with logging (paste fallback code)
□ All 5 Meridian component types handled (paste evidence or explain)
□ AP-2/AP-4: batch queries, not per-entity queries (paste query code showing batch approach)
□ Zero hardcoded column names in resolution code (grep confirmation)
□ npm run build exits 0
```

**Commit:** `HF-108 Phase 1: engine data resolution via convergence bindings` + push

---

## PHASE 2: ENTITY PIPELINE → COMMITTED_DATA + DERIVED RESOLUTION

### 2.1: Modify entity pipeline to write to committed_data

Find the entity pipeline function (route.ts:683-832). Currently it reads entity-classified sheet data and writes directly to the `entities` table.

Change to:
1. Write ALL rows to committed_data with `informational_label: 'entity'` and field_identities in metadata (same pattern as transaction/target/reference from OB-162)
2. AFTER the committed_data insert, run entity resolution from committed_data

```typescript
// Entity pipeline — BEFORE (writes to entities table directly)
// ... CC will find this code at route.ts:683-832

// Entity pipeline — AFTER (writes to committed_data, then derives entities)
// Step 1: Insert to committed_data
const entityRows = rawRows.map(row => ({
  tenant_id: tenantId,
  import_batch_id: batchId,
  data_type: dataType,
  row_data: row,
  metadata: {
    source: 'sci',
    proposalId,
    semantic_roles: semanticRoles,
    resolved_data_type: dataType,
    ...(entityFieldIdentities ? { field_identities: entityFieldIdentities } : {}),
    informational_label: 'entity',
  },
  source_date: null, // entity records don't have temporal dates
}));

// Bulk insert to committed_data (AP-2)
await supabase.from('committed_data').insert(entityRows);

// Step 2: Derive entities from committed_data
await deriveEntitiesFromCommittedData(supabase, tenantId, batchId, entityFieldIdentities);
```

### 2.2: Implement deriveEntitiesFromCommittedData

```typescript
/**
 * Scan committed_data for person identifier field identities and create/update entities.
 * Decision 111 Layer 3: Entity resolution is derived, not routed.
 */
async function deriveEntitiesFromCommittedData(
  supabase: SupabaseClient,
  tenantId: string,
  batchId: string,
  fieldIdentities: Record<string, FieldIdentity> | null
): Promise<{ created: number; updated: number }> {
  if (!fieldIdentities) return { created: 0, updated: 0 };
  
  // Find identifier columns (structuralType = 'identifier', contextualIdentity contains 'person')
  // Korean Test: we match on structuralType (structural) + contextualIdentity pattern (from HC LLM)
  // We do NOT match on column names
  const personIdColumns = Object.entries(fieldIdentities)
    .filter(([_, fi]) => 
      fi.structuralType === 'identifier' && 
      fi.contextualIdentity.toLowerCase().includes('person'))
    .map(([colName]) => colName);
  
  // Find name columns
  const nameColumns = Object.entries(fieldIdentities)
    .filter(([_, fi]) => fi.structuralType === 'name')
    .map(([colName]) => colName);
  
  if (personIdColumns.length === 0) {
    // No person identifiers found — try broader: any 'identifier' column
    // This handles cases where HC says "employee_identifier" not "person_identifier"
    const anyIdColumns = Object.entries(fieldIdentities)
      .filter(([_, fi]) => fi.structuralType === 'identifier')
      .map(([colName]) => colName);
    if (anyIdColumns.length === 0) return { created: 0, updated: 0 };
    personIdColumns.push(anyIdColumns[0]); // Use first identifier as entity key
  }
  
  const idColumn = personIdColumns[0];
  const nameColumn = nameColumns.length > 0 ? nameColumns[0] : null;
  
  // Fetch committed_data rows for this batch
  const { data: rows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .eq('import_batch_id', batchId);
  
  if (!rows || rows.length === 0) return { created: 0, updated: 0 };
  
  // Extract unique entity identifiers
  const entityMap = new Map<string, string>(); // external_id → display_name
  for (const row of rows) {
    const extId = String(row.row_data[idColumn] ?? '');
    const name = nameColumn ? String(row.row_data[nameColumn] ?? extId) : extId;
    if (extId) entityMap.set(extId, name);
  }
  
  // Dedup against existing entities
  const { data: existing } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', tenantId);
  
  const existingIds = new Set((existing || []).map(e => e.external_id));
  
  let created = 0;
  let updated = 0;
  
  const newEntities = [];
  for (const [extId, name] of entityMap) {
    if (!existingIds.has(extId)) {
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
  
  if (newEntities.length > 0) {
    await supabase.from('entities').insert(newEntities);
    created = newEntities.length;
  }
  
  // Backfill entity_id on committed_data rows
  const { data: allEntities } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', tenantId);
  
  const entityLookup = new Map((allEntities || []).map(e => [e.external_id, e.id]));
  
  // Update committed_data rows with entity_id
  // Batch by entity to avoid per-row updates (AP-4)
  for (const [extId, entityUuid] of entityLookup) {
    await supabase
      .from('committed_data')
      .update({ entity_id: entityUuid })
      .eq('tenant_id', tenantId)
      .eq('import_batch_id', batchId)
      .filter('row_data->>?' || '', 'eq', extId); 
      // NOTE: The actual JSONB filter syntax may need adjustment — verify with Supabase docs
  }
  
  return { created, updated };
}
```

**IMPORTANT:** The entity_id backfill on committed_data rows is critical — the engine needs entity_id to iterate over entities. The convergence_bindings tell the engine WHICH column holds the entity identifier, but the engine still uses entity_id FK for the entity iteration loop. Both mechanisms coexist: entity_id for "which entities to calculate" and convergence_bindings column for "which row_data column holds the value."

### 2.3: Run entity resolution for ALL committed_data batches (not just entity-classified)

Entity resolution should also scan transaction-classified and reference-classified committed_data for person identifiers. A transaction sheet with an employee number column should contribute to entity resolution even if it wasn't classified as "entity."

After ALL content units are executed (not per-unit), run a tenant-wide entity resolution pass:

```typescript
// At the end of SCI execute, after all content units processed:
await deriveEntitiesFromAllCommittedData(supabase, tenantId);
```

This function scans ALL committed_data for the tenant, finds rows with person identifier field identities, and ensures entities exist for all discovered identifiers. It also backfills entity_id on all committed_data rows.

### PROOF GATE 2:
```
□ Entity pipeline now writes to committed_data with field_identities + informational_label: 'entity' (paste code)
□ deriveEntitiesFromCommittedData function created (paste full function)
□ Entity resolution scans for person identifier field identities, not classification label (paste filter logic)
□ Dedup against existing entities preserved (paste dedup code)
□ entity_id backfilled on committed_data rows (paste backfill code)
□ Post-import entity resolution runs for ALL batches, not just entity-classified (paste wiring)
□ Zero hardcoded column names in entity resolution (grep confirmation)
□ npm run build exits 0
```

**Commit:** `HF-108 Phase 2: entity pipeline to committed_data + derived entity resolution` + push

---

## PHASE 3: DEPRECATE METRIC_DERIVATIONS IN CONVERGENCE OUTPUT

### 3.1: Convergence writes convergence_bindings only

Modify convergence service to write convergence_bindings as the PRIMARY output. Stop writing metric_derivations for new convergence runs.

```typescript
// convergence-service.ts — after generating convergence_bindings:
await supabase
  .from('rule_sets')
  .update({ 
    input_bindings: { 
      convergence_bindings: componentBindings,
      // metric_derivations deliberately NOT written for new convergence runs
      // Old metric_derivations preserved if they exist (backward compat)
    } as unknown as Json 
  })
  .eq('id', ruleSet.id);
```

### 3.2: Engine reads convergence_bindings FIRST, metric_derivations as fallback

```typescript
// Engine resolution priority:
// 1. convergence_bindings (Decision 111) — if present, use exclusively
// 2. metric_derivations (pre-Decision 111) — fallback for old data
const convergenceBindings = inputBindings?.convergence_bindings;
const metricDerivations = inputBindings?.metric_derivations;

if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
  addLog('Using convergence_bindings (Decision 111) for data resolution');
  // ... new path from Phase 1
} else if (metricDerivations && metricDerivations.length > 0) {
  addLog('Using metric_derivations (legacy) for data resolution');
  // ... old path
} else {
  addLog('WARNING: No input_bindings found — calculation may produce incomplete results');
}
```

### PROOF GATE 3:
```
□ Convergence writes convergence_bindings without metric_derivations for new runs (paste code)
□ Engine checks convergence_bindings FIRST (paste priority logic)
□ metric_derivations preserved as read-only fallback (paste fallback code)
□ Logging indicates which resolution path is taken (paste log lines)
□ npm run build exits 0
```

**Commit:** `HF-108 Phase 3: deprecate metric_derivations, convergence_bindings primary` + push

---

## PHASE 4: SQL VERIFICATION + LOCALHOST PROOF (Decision 78)

### 4.1: Test with SQL first

After re-import (Andrew runs cleanup SQL + uploads Meridian XLSX), verify the full chain with SQL:

```sql
-- 1. Verify field_identities in committed_data metadata
SELECT
  import_batch_id,
  metadata->>'informational_label' as label,
  jsonb_object_keys(metadata->'field_identities') as field_columns,
  count(*) as rows
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND metadata->'field_identities' IS NOT NULL
GROUP BY import_batch_id, metadata->>'informational_label', jsonb_object_keys(metadata->'field_identities')
LIMIT 30;

-- 2. Verify convergence_bindings populated
SELECT jsonb_pretty(input_bindings->'convergence_bindings')
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- 3. For one entity, manually resolve data through convergence bindings
-- (Extract actual batch_id and column from convergence_bindings result above)
-- This is the SQL equivalent of what the engine should do
SELECT
  row_data->>'{entity_column}' as entity,
  row_data->>'{actual_column}' as actual_value,
  source_date
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND import_batch_id = '{batch_id_from_bindings}'
  AND row_data->>'{entity_column}' = '{entity_external_id}'
ORDER BY source_date;

-- 4. Verify reference_data = 0 (Decision 111 unified storage)
SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

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

**Paste ALL SQL results with real values.** These results prove the data resolution path works at the SQL level before the engine executes.

### 4.2: Localhost build and test

```bash
kill dev server
rm -rf .next
npm run build   # MUST exit 0
npm run dev     # confirm localhost:3000
```

### PROOF GATE 4:
```
□ SQL test 1: field_identities in committed_data (paste query + results)
□ SQL test 2: convergence_bindings populated (paste full JSON)
□ SQL test 3: manual data resolution through bindings for one entity (paste query + results showing actual values)
□ SQL test 4: reference_data = 0, reference_items = 0 (paste counts)
□ SQL test 5: Engine Contract 7-value (paste results)
□ npm run build exits 0 (paste last 5 lines)
□ localhost:3000 responds (paste confirmation)
```

**Commit:** `HF-108 Phase 4: SQL verification + localhost proof` + push

---

## PHASE 5: BUILD + PR

```bash
kill dev server
rm -rf .next
npm run build   # MUST exit 0
npm run dev

gh pr create --base main --head dev \
  --title "HF-108: Engine convergence binding resolution + entity derivation (Decision 111)" \
  --body "Completes Decision 111 vertical slice by wiring engine data resolution through convergence_bindings.

## What Changed
- Engine resolves component inputs via convergence_bindings (batch_id + column) as PRIMARY path
- Batched data loading: O(batches) queries not O(entities × components)
- Entity pipeline writes to committed_data with field_identities (same as transaction/target/reference)
- Entity resolution derives from committed_data person identifier field identities post-import
- metric_derivations deprecated — convergence_bindings is authoritative source
- Old sheet-matching path preserved as FALLBACK for pre-OB-162 data

## Fixes
- OB-162 Deficiency 1 (P0): Engine now USES convergence_bindings for data resolution, not just logs them
- OB-162 Deficiency 2 (P1): Entity resolution derived from committed_data, not classification-routed

## Proof
- SQL verification: manual data resolution through convergence bindings returns correct values
- Engine Contract: reference_data = 0, reference_items = 0 (unified storage)
- Ground truth: MX\$185,063 pending Andrew's production verification"
```

### PROOF GATE 5:
```
□ npm run build exits 0 (paste last 5 lines)
□ PR created with descriptive title and body (paste PR URL)
□ Completion report saved as HF-108_COMPLETION_REPORT.md
```

---

## COMPLETION REPORT REQUIREMENTS (Evidentiary Gates — Slot 25)

The completion report MUST include pasted evidence for EVERY proof gate. PASS/FAIL self-attestation is NOT accepted.

For each proof gate, paste the actual code, actual terminal output, actual grep results, actual DB query results. If any proof gate cannot produce evidence, mark as INCOMPLETE — not PASS.

**Special emphasis:** Phase 4 SQL tests are MANDATORY. OB-162 skipped Decision 78 (test with SQL first). HF-108 will not skip it. If the SQL tests cannot run because data hasn't been re-imported yet, note this explicitly and provide the SQL ready for Andrew to run.

---

## ANDREW'S PRODUCTION VERIFICATION (Post-Merge)

After Andrew merges HF-108 to main and Vercel deploys:

1. **Run cleanup SQL** from OB-162_CLEANUP_SQL.md in Supabase (if not already done)
2. **Upload Meridian XLSX** on vialuce.ai
3. **Check Vercel Runtime Logs** — look for:
   - `OB-162 Convergence bindings:` — convergence produced bindings
   - `Using convergence_bindings (Decision 111)` — engine used new path
   - Entity resolution log lines — entities derived from committed_data
4. **Verify in Supabase:**
   - committed_data has field_identities in metadata
   - committed_data has `informational_label` in metadata for all batches (entity/transaction/reference)
   - reference_data = 0, reference_items = 0
   - entities created with correct count (≥ 50)
   - entity_id populated on committed_data rows
   - input_bindings has convergence_bindings (not just metric_derivations)
5. **Navigate to Calculate** → run January 2025
6. **Verify MX$185,063** rendered in browser
7. **Screenshot** as production evidence

**No finding marked ✅ without production evidence.** Localhost PASS ≠ production PASS.

---

## SCOPE BOUNDARIES

**IN SCOPE:**
- Engine data resolution via convergence_bindings (P0 fix)
- Entity pipeline → committed_data storage (P1 fix)
- Entity resolution from committed_data field identities
- metric_derivations deprecation in convergence output
- Batched data loading for scale (AP-2/AP-4)
- SQL verification (Decision 78)
- entity_id backfill on committed_data rows

**OUT OF SCOPE:**
- HC prompt changes (OB-162 got this right)
- Convergence matching algorithm (OB-162 got this right)
- Reference pipeline changes (OB-162 got this right)
- Evaluate surface (future OB)
- Flywheel semantic identity (future)
- Korean Test fix for convergence Pass 2 token overlap (noted as P2, future HF)
- CRR convergence-time disambiguation (future)

---

## ANTI-PATTERN CHECKLIST

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation? (OB-162 covers this)
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
□ Korean Test: would this work with Hangul column names?
□ No SQL with unverified column names (FP-49)?
□ Git commands from repo root, not web/?
□ Evidentiary gates: pasted code/output/grep, not PASS/FAIL?
□ Decision 78: SQL test BEFORE code implementation?
```

---

*HF-108 — Engine Convergence Binding Resolution + Entity Derivation | March 8, 2026*

*"OB-162 built the road. HF-108 connects it to the destination. The engine doesn't just see the convergence bindings — it drives on them."*
