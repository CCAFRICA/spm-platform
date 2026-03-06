# OB-160F PHASE F: EXECUTE PIPELINE + ROUTING
## "Classified content reaches the correct tables"
## SCI Development Plan Phase F of 12 (A through L)
## Target: Current release
## Depends on: HF-092 (PR #187 — merged), OB-160E (PR #186 — must be merged)
## Priority: P0 — Implements SCI Spec Layer 5 + populates Engine Contract tables
## CLT after ALL phases (A-L) complete. NO browser testing until after Phase L.

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 5: Routing and Semantic Binding
4. `web/src/lib/sci/synaptic-ingestion-state.ts` — SynapticIngestionState with TenantContext, ClassificationTrace, priorSignals
5. `web/src/lib/sci/sci-types.ts` — ContentProfile, ContentUnitProposal, ContentUnitExecution interfaces
6. `web/src/lib/sci/content-profile.ts` — identifierColumn, hasTemporalColumns, hasStructuralName
7. `web/src/lib/sci/classification-signal-service.ts` — writeClassificationSignal (Phase E — signals written here)
8. `web/src/app/api/import/sci/execute/route.ts` — the current execute route (this is what Phase F rewrites)
9. `web/src/app/api/import/sci/analyze/route.ts` — the analyze route (provides the proposal that execute receives)

---

## MANDATORY INTERFACE VERIFICATION

Before writing ANY code, verify and paste the output for each of these:

```bash
# 1. Current execute route — what does it do today?
cat web/src/app/api/import/sci/execute/route.ts

# 2. ContentUnitProposal / ContentUnitExecution — what fields carry from analyze to execute?
grep -A 30 "interface ContentUnitProposal\|interface ContentUnitExecution\|type ContentUnitProposal\|type ContentUnitExecution" \
  web/src/lib/sci/sci-types.ts

# 3. ContentProfile — identifier and name column field names
grep -n "identifierColumn\|identifierField\|nameColumn\|structuralNameColumn\|hasStructuralName\|hasIdentifier" \
  web/src/lib/sci/sci-types.ts web/src/lib/sci/content-profile.ts | head -20

# 4. Does committed_data have source_date column?
# Run in Supabase SQL Editor:
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'committed_data' ORDER BY ordinal_position;

# 5. Does reference_data table exist? What columns?
# Run in Supabase SQL Editor:
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'reference_data' ORDER BY ordinal_position;
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'reference_items' ORDER BY ordinal_position;

# 6. What does the existing entity creation code look like?
grep -rn "entities.*insert\|from.*entities.*upsert\|createEntit" \
  web/src/app/api/import/ web/src/lib/sci/ --include="*.ts" | head -15

# 7. What does the existing committed_data insert look like?
grep -rn "committed_data.*insert\|from.*committed_data" \
  web/src/app/api/import/ web/src/lib/sci/ --include="*.ts" | head -15

# 8. How does file storage transport work? (OB-156)
grep -rn "storage.*download\|supabase.*storage\|getPublicUrl\|createSignedUrl" \
  web/src/app/api/import/ --include="*.ts" | head -10

# 9. Header comprehension — how are column roles accessed?
grep -n "columnRole\|semanticMeaning\|HeaderInterpretation" \
  web/src/lib/sci/sci-types.ts | head -10
```

Paste ALL output into your Architecture Decision record. This is non-negotiable — Phase F builds on everything from A-E and touches the most critical data tables. Assumptions here cause data corruption.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160F Phase 0: Interface verification + schema audit + architecture decision" && git push origin dev`

---

## CONTEXT

### What Phases A-E + HF-092 Delivered

**Phase A (PR #182):** Content Profile — structural truth. Identifier column detection, temporal column detection, name column detection, numeric/categorical ratios.
**Phase B (PR #183):** Header comprehension — LLM interprets headers, vocabulary binding interface.
**Phase C (PR #184):** Agent scoring — signatures, Round 2, ClassificationTrace, SynapticIngestionState.
**Phase D (PR #185):** Tenant context — presence-based entity ID overlap, score adjustments.
**Phase E (PR #186):** Classification signals — flywheel storage, prior signal consultation, vocabulary binding persistence, trace API.
**HF-092 (PR #187):** Schema correction — dedicated indexed columns on classification_signals.

### What Phase F Delivers

Phase F is where data actually lands in the database tables that the engine reads. Before Phase F, the SCI pipeline classifies content and proposes what it found. After Phase F, the execute route takes confirmed proposals and routes each content unit to the correct table:

- **Entity-classified → `entities` table** (external_id, display_name, dedup)
- **Transaction-classified → `committed_data` table** (entity_id, source_date, row_data)
- **Reference-classified → `reference_data` table** (key_field, structural detection)

This is where the SCI specification meets the Engine Contract. After Phase F, three of the five engine contract tables have data (rule_sets from plan import, entities and committed_data from Phase F).

### SCI Development Plan Position

```
  Phase A: Content Profile Foundation ✅ (PR #182)
  Phase B: Header Comprehension ✅ (PR #183)
  Phase C: Agent Scoring + Signatures + Negotiation ✅ (PR #184)
  Phase D: Tenant Context ✅ (PR #185)
  Phase E: Classification Signals + Flywheel ✅ (PR #186)
  HF-092: Schema Correction ✅ (PR #187)
→ PHASE F: Execute Pipeline + Routing ← YOU ARE HERE
  Phase G: Convergence + input_bindings
  Phase H: Field-Level PARTIAL Claims
  Phase I: Cross-Tenant Flywheel
  Phase J: Domain Flywheel
  Phase K: Synaptic Density for SCI
  Phase L: Pattern Promotion
```

### Controlling Decisions

| # | Decision | Relevance |
|---|---|---|
| 25 | Korean Test | Entity resolution uses structural identifier column, not field names |
| 92 | Temporal binding: source_date on committed_data | source_date extracted structurally. period_id = NULL. Engine binds at calc time. |
| 93 | Period is NOT an import concept | ZERO period creation, period lookup, or period API calls in execute |
| 97 | File storage transport | Full row data comes from Supabase Storage, not HTTP bodies |
| 98 | Audit attribution = auth.uid() | No FK to profiles. created_by uses auth.uid() directly. |

### Meridian Data Expectations

| Sheet | Classification | Target Table | Expected Rows |
|---|---|---|---|
| Plantilla | Entity | entities | ~50 (67 employees, some may be in data but not roster) |
| Datos_Rendimiento | Transaction | committed_data | ~150 (50 employees × 3 months) |
| Datos_Flota_Hub | Reference | reference_data | ~12 (hub fleet data) |

### Schema Dependencies — VERIFY BEFORE CODING

**committed_data.source_date:** Decision 92 specifies this column. SCHEMA_REFERENCE.md (Feb 18) does NOT show it. OB-152 was supposed to add it. The nuclear clear may have wiped the migration. **Phase F must verify the column exists. If it doesn't, add it via ALTER TABLE in Supabase SQL Editor.**

```sql
-- Check if source_date exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'committed_data' AND column_name = 'source_date';

-- If NOT exists, add it:
ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS source_date DATE;
```

**reference_data table:** Decision 92 created this table. Verify it exists with the expected columns (id, tenant_id, name, key_field, data JSONB, metadata JSONB, created_at).

---

## ARCHITECTURE DECISION GATE

```
DECISION 1: Processing order for execute

  Content units must be processed in dependency order:
  1. Entity-classified FIRST (entities must exist before transaction data can reference them)
  2. Reference-classified SECOND (reference data may be needed for entity enrichment)
  3. Transaction-classified LAST (transactions reference entity_id via FK)
  
  This is the same processing order used in analyze (Phase C).
  CHOSEN: Entity → Reference → Transaction

DECISION 2: Entity resolution for transaction data

  Problem: Each transaction row has an identifier value (e.g., employee ID "C001").
  This must resolve to an entity UUID (entities.id) for the entity_id FK on committed_data.
  
  Option A: Resolve at insert time — for each row, look up entity by external_id
    - Pro: Simple, correct
    - Con: N+1 query if done per-row
    REJECTED: N+1 violates AP-4
  
  Option B: Batch resolve — load all tenant entities into a Map<external_id, uuid>, then resolve in-memory
    - Pro: One query, O(1) lookup per row
    - Con: Memory for large entity sets
    CHOSEN: One query loads entity map, all rows resolved in-memory
  
  Option C: Resolve via SQL JOIN at insert time
    - Pro: Database handles it
    - Con: Complex bulk insert with JOIN
    NOTED: Could optimize later, but B is correct and scale-ready through "Large" tier

DECISION 3: Source date extraction

  The Content Profile (Phase A) detects temporal columns.
  Header comprehension (Phase B) may identify which column is month, year, date.
  
  source_date composition:
  1. If a date-type column exists → use that value directly
  2. If separate month + year columns exist → compose as YYYY-MM-01
  3. If only month column exists (1-12) → compose with current year as YYYY-MM-01
  4. If no temporal columns → source_date = NULL (engine will need manual period binding)
  
  Detection is STRUCTURAL (Korean Test compliant):
  - Use hasTemporalColumns from Content Profile
  - Use columnRole from Header Comprehension (if available)
  - Never match on column name strings
  
  CHOSEN: Structural temporal detection with graceful NULL fallback

DECISION 4: Bulk insert strategy

  AP-2: minimum 5,000 row chunks for bulk inserts.
  Meridian: ~150 transaction rows, ~50 entities, ~12 reference rows.
  At scale: 100K+ transaction rows.
  
  Strategy:
  - Entities: single bulk upsert (ON CONFLICT external_id + tenant_id)
  - committed_data: single bulk insert (no upsert — each import adds rows)
  - reference_data: single bulk upsert (ON CONFLICT key_field + tenant_id)
  - All use service role client (AP-3)
  
  CHOSEN: Bulk operations with service role client
```

---

## PHASE 1: SCHEMA VERIFICATION + ENTITY PIPELINE

### 1A: Verify and Fix Schema

Run in Supabase SQL Editor. Paste results.

```sql
-- Verify committed_data has source_date
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'committed_data' ORDER BY ordinal_position;

-- If source_date missing:
ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS source_date DATE;

-- Verify reference_data exists
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'reference_data' ORDER BY ordinal_position;

-- Verify reference_items exists
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'reference_items' ORDER BY ordinal_position;
```

### 1B: Entity Pipeline

Create `web/src/lib/sci/execute-entity.ts`:

```typescript
/**
 * Entity Execute Pipeline
 * Processes entity-classified content units into the entities table.
 * 
 * Uses structural detection from Content Profile:
 * - identifierColumn → external_id
 * - structuralNameColumn → display_name (or cardinality-based detection)
 * - Dedup: upsert on (tenant_id, external_id, entity_type)
 * 
 * Phase F of 12 (SCI Development Plan v2)
 */

import { createClient } from '@supabase/supabase-js';
import type { ContentProfile } from './sci-types';

export interface EntityExecutionResult {
  created: number;
  updated: number;
  total: number;
  errors: string[];
  entityMap: Map<string, string>;  // external_id → entity UUID (for downstream transaction resolution)
}

export async function executeEntityPipeline(
  tenantId: string,
  profile: ContentProfile,
  rows: Record<string, unknown>[],
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<EntityExecutionResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const errors: string[] = [];

  // 1. Identify columns from Content Profile structural detection
  // Use profile.identifierColumn for external_id
  // Use profile structural name detection for display_name
  // NEVER match on column names — Korean Test
  const identifierCol = profile.identifierColumn;  // verify exact field name from Phase 0
  const nameCol = profile.structuralNameColumn;     // verify exact field name from Phase 0

  if (!identifierCol) {
    return { created: 0, updated: 0, total: 0, errors: ['No identifier column detected in Content Profile'], entityMap: new Map() };
  }

  // 2. Build entity records from rows
  const entityRecords: Array<{
    tenant_id: string;
    external_id: string;
    display_name: string;
    entity_type: string;
    status: string;
    metadata: Record<string, unknown>;
  }> = [];

  const seen = new Set<string>();
  for (const row of rows) {
    const externalId = String(row[identifierCol] ?? '').trim();
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);

    const displayName = nameCol ? String(row[nameCol] ?? '').trim() : externalId;

    entityRecords.push({
      tenant_id: tenantId,
      external_id: externalId,
      display_name: displayName || externalId,
      entity_type: 'individual',
      status: 'active',
      metadata: {},
    });
  }

  if (entityRecords.length === 0) {
    return { created: 0, updated: 0, total: 0, errors: ['No valid entity records extracted'], entityMap: new Map() };
  }

  // 3. Bulk upsert — ON CONFLICT (tenant_id, external_id, entity_type) update display_name
  const { data, error } = await supabase
    .from('entities')
    .upsert(entityRecords, {
      onConflict: 'tenant_id,external_id,entity_type',
      ignoreDuplicates: false,
    })
    .select('id, external_id');

  if (error) {
    return { created: 0, updated: 0, total: 0, errors: [`Entity upsert failed: ${error.message}`], entityMap: new Map() };
  }

  // 4. Build entity map for downstream transaction resolution
  const entityMap = new Map<string, string>();
  for (const entity of (data ?? [])) {
    entityMap.set(entity.external_id, entity.id);
  }

  // If upsert didn't return all entities (some were updates), query the full set
  if (entityMap.size < entityRecords.length) {
    const { data: allEntities } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId);
    
    for (const e of (allEntities ?? [])) {
      entityMap.set(e.external_id, e.id);
    }
  }

  return {
    created: entityRecords.length,  // approximate — upsert doesn't distinguish
    updated: 0,
    total: entityMap.size,
    errors,
    entityMap,
  };
}
```

### Proof Gates — Phase 1
- PG-01: committed_data.source_date column exists (paste schema query)
- PG-02: reference_data table exists (paste schema query)
- PG-03: execute-entity.ts created
- PG-04: Entity pipeline uses structural identifierColumn, not field name matching
- PG-05: Entity pipeline uses bulk upsert (not per-row insert)
- PG-06: Entity pipeline returns entityMap (external_id → UUID) for transaction resolution
- PG-07: Entity pipeline deduplicates within the sheet (seen Set)
- PG-08: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160F Phase 1: Schema verification + entity execute pipeline — bulk upsert with structural detection" && git push origin dev`

---

## PHASE 2: TRANSACTION PIPELINE

Create `web/src/lib/sci/execute-transaction.ts`:

```typescript
/**
 * Transaction Execute Pipeline
 * Processes transaction-classified content units into committed_data.
 * 
 * - Entity resolution: batch lookup, in-memory Map resolution
 * - Source date extraction: structural temporal detection (Decision 92)
 * - row_data: full row preserved (Carry Everything, Express Contextually)
 * - period_id: NULL (engine binds at calc time — Decision 92)
 * - Bulk insert (AP-2)
 * 
 * Phase F of 12 (SCI Development Plan v2)
 */

export interface TransactionExecutionResult {
  inserted: number;
  unmatchedEntities: number;
  unmatchedRows: Array<{ row: number; identifierValue: string }>;
  errors: string[];
}

export async function executeTransactionPipeline(
  tenantId: string,
  profile: ContentProfile,
  rows: Record<string, unknown>[],
  entityMap: Map<string, string>,  // external_id → entity UUID (from entity pipeline)
  importBatchId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<TransactionExecutionResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const identifierCol = profile.identifierColumn;
  if (!identifierCol) {
    return { inserted: 0, unmatchedEntities: 0, unmatchedRows: [], errors: ['No identifier column detected'] };
  }

  // If entityMap is empty, load all entities for this tenant
  if (entityMap.size === 0) {
    const { data: entities } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId);
    for (const e of (entities ?? [])) {
      entityMap.set(e.external_id, e.id);
    }
  }

  // Source date extraction — structural, type-agnostic (Decision 92)
  const temporalColumns = findTemporalColumns(profile);

  // Build committed_data records
  const records: Array<{
    tenant_id: string;
    entity_id: string;
    import_batch_id: string;
    data_type: string;
    source_date: string | null;
    row_data: Record<string, unknown>;
    period_id: null;
    metadata: Record<string, unknown>;
  }> = [];

  const unmatchedRows: Array<{ row: number; identifierValue: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const identifierValue = String(row[identifierCol] ?? '').trim();
    const entityId = entityMap.get(identifierValue);

    if (!entityId) {
      unmatchedRows.push({ row: i, identifierValue });
      continue;  // Log but don't crash — unmatched rows are expected for partial data
    }

    const sourceDate = extractSourceDate(row, temporalColumns);

    records.push({
      tenant_id: tenantId,
      entity_id: entityId,
      import_batch_id: importBatchId,
      data_type: 'transaction',
      source_date: sourceDate,
      row_data: row,  // Carry Everything — full row preserved
      period_id: null,  // Decision 92 — engine binds at calc time
      metadata: {},
    });
  }

  if (records.length === 0) {
    return { inserted: 0, unmatchedEntities: unmatchedRows.length, unmatchedRows, errors: ['No records matched to entities'] };
  }

  // Bulk insert — AP-2 compliant
  // Batch in chunks of 5000 for scale
  const CHUNK_SIZE = 5000;
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('committed_data')
      .insert(chunk);
    
    if (error) {
      errors.push(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1} failed: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
  }

  return {
    inserted,
    unmatchedEntities: unmatchedRows.length,
    unmatchedRows: unmatchedRows.slice(0, 20),  // cap logged unmatched for readability
    errors,
  };
}

/**
 * Find temporal columns from Content Profile structural detection.
 * Returns column names that contain temporal data — detected by Phase A's
 * type-agnostic temporal analysis, NOT by matching column names.
 */
function findTemporalColumns(profile: ContentProfile): { dateCol?: string; monthCol?: string; yearCol?: string } {
  // Use Content Profile's hasTemporalColumns + field-level observations
  // Look for fields with temporal type scores from Phase A
  // Header comprehension (Phase B) may have identified columnRole = 'temporal'
  
  const result: { dateCol?: string; monthCol?: string; yearCol?: string } = {};
  
  // Check fields for temporal indicators from Content Profile
  if (profile.fields) {
    for (const [colName, field] of Object.entries(profile.fields)) {
      // Phase A marks temporal columns via ProfileObservation
      // Phase B's headerComprehension may add columnRole = 'temporal'
      if (field.isTemporalColumn || field.temporalRole === 'date') {
        result.dateCol = colName;
      } else if (field.temporalRole === 'month') {
        result.monthCol = colName;
      } else if (field.temporalRole === 'year') {
        result.yearCol = colName;
      }
    }
  }
  
  return result;
}

/**
 * Extract source_date from a row using structural temporal detection.
 * Decision 92: source_date is a business date, not a period reference.
 * 
 * Composition rules:
 * 1. If a date column exists → parse and use directly
 * 2. If month + year columns → compose as YYYY-MM-01
 * 3. If month only → compose with data year context or current year
 * 4. If nothing → null (engine needs manual period binding)
 */
function extractSourceDate(
  row: Record<string, unknown>,
  temporal: { dateCol?: string; monthCol?: string; yearCol?: string }
): string | null {
  // Try date column first
  if (temporal.dateCol) {
    const dateVal = row[temporal.dateCol];
    if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
    if (typeof dateVal === 'string') {
      const parsed = new Date(dateVal);
      if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    }
  }

  // Try month + year composition
  if (temporal.monthCol) {
    const month = Number(row[temporal.monthCol]);
    if (month >= 1 && month <= 12) {
      let year: number;
      if (temporal.yearCol) {
        year = Number(row[temporal.yearCol]);
      } else {
        year = new Date().getFullYear();  // fallback — structural detection couldn't find year
      }
      if (year >= 2000 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-01`;
      }
    }
  }

  return null;  // no temporal data detected — engine needs manual binding
}
```

### Proof Gates — Phase 2
- PG-09: execute-transaction.ts created
- PG-10: Entity resolution uses in-memory Map (batch load, O(1) lookup per row)
- PG-11: Source date extraction is structural — uses Content Profile temporal detection, not column name matching
- PG-12: row_data preserves full row (Carry Everything)
- PG-13: period_id is explicitly NULL (Decision 92)
- PG-14: Bulk insert uses 5,000-row chunks (AP-2)
- PG-15: Unmatched entity rows logged but don't crash import
- PG-16: ZERO period creation or period API calls
- PG-17: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160F Phase 2: Transaction execute pipeline — entity resolution, source_date extraction, bulk insert" && git push origin dev`

---

## PHASE 3: REFERENCE PIPELINE

Create `web/src/lib/sci/execute-reference.ts`:

```typescript
/**
 * Reference Execute Pipeline
 * Processes reference-classified content units into reference_data.
 * 
 * - key_field: structural key detection (highest cardinality column serving as lookup dimension)
 * - NOT a fallback to first column — structural detection required
 * - Bulk upsert
 * 
 * Phase F of 12 (SCI Development Plan v2)
 */

export interface ReferenceExecutionResult {
  inserted: number;
  keyField: string | null;
  errors: string[];
}

export async function executeReferencePipeline(
  tenantId: string,
  profile: ContentProfile,
  rows: Record<string, unknown>[],
  sheetName: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<ReferenceExecutionResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Detect key_field structurally
  // The key field is the column with highest cardinality that serves as a lookup dimension
  // NOT the identifier column (that's for entities) — this is the reference lookup key
  const keyField = detectReferenceKeyField(profile);

  if (!keyField) {
    return { inserted: 0, keyField: null, errors: ['No structural key field detected for reference data'] };
  }

  // Upsert into reference_data
  const { data, error } = await supabase
    .from('reference_data')
    .upsert({
      tenant_id: tenantId,
      name: sheetName,
      key_field: keyField,
      data: rows,  // store all rows as JSONB
      metadata: {
        row_count: rows.length,
        columns: Object.keys(rows[0] ?? {}),
        imported_at: new Date().toISOString(),
      },
    }, {
      onConflict: 'tenant_id,name',
    })
    .select('id');

  if (error) {
    return { inserted: 0, keyField, errors: [`Reference upsert failed: ${error.message}`] };
  }

  return {
    inserted: rows.length,
    keyField,
    errors: [],
  };
}

/**
 * Detect the key field for reference data using structural analysis.
 * 
 * The key field is the categorical column with highest cardinality
 * that serves as a lookup dimension (e.g., hub_id in fleet data).
 * 
 * This is NOT the same as the entity identifier — reference data
 * has lookup keys, not person identifiers.
 * 
 * Detection: highest-cardinality categorical column that isn't a name column.
 */
function detectReferenceKeyField(profile: ContentProfile): string | null {
  if (!profile.fields) return null;

  let bestCol: string | null = null;
  let bestCardinality = 0;

  for (const [colName, field] of Object.entries(profile.fields)) {
    // Skip numeric-heavy columns (measures, not keys)
    // Skip name columns (person names, not lookup keys)
    // Look for categorical columns with high relative cardinality
    const isCategorical = field.categoricalScore > 0.5 || field.dataType === 'string';
    const isNotName = !field.isStructuralName;
    const cardinality = field.uniqueCount ?? 0;

    if (isCategorical && isNotName && cardinality > bestCardinality) {
      bestCardinality = cardinality;
      bestCol = colName;
    }
  }

  return bestCol;
}
```

### Proof Gates — Phase 3
- PG-18: execute-reference.ts created
- PG-19: key_field detection is structural (highest cardinality categorical), not first-column fallback
- PG-20: Reference data stored in reference_data table with key_field
- PG-21: Bulk upsert with ON CONFLICT
- PG-22: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160F Phase 3: Reference execute pipeline — structural key detection, reference_data upsert" && git push origin dev`

---

## PHASE 4: WIRE EXECUTE ROUTE

### 4A: Rewrite Execute Route

The execute route receives confirmed proposals from the UI and routes each content unit to the correct pipeline. Processing order: Entity → Reference → Transaction.

```typescript
// web/src/app/api/import/sci/execute/route.ts

import { executeEntityPipeline } from '@/lib/sci/execute-entity';
import { executeTransactionPipeline } from '@/lib/sci/execute-transaction';
import { executeReferencePipeline } from '@/lib/sci/execute-reference';
import { writeClassificationSignal, computeStructuralFingerprint } from '@/lib/sci/classification-signal-service';

export async function POST(request: Request) {
  // 1. Parse request — confirmed content units with classifications
  // 2. Create import_batch record
  // 3. Sort by processing order: entity → reference → transaction
  // 4. Execute each content unit through its pipeline
  // 5. Write classification signals (Phase E)
  // 6. Return execution results

  // Processing order matters:
  // - Entities first → entityMap available for transaction resolution
  // - Reference second → reference data available for convergence (Phase G)
  // - Transactions last → can resolve entity_id from entityMap

  const entityUnits = confirmedUnits.filter(u => u.classification === 'entity');
  const referenceUnits = confirmedUnits.filter(u => u.classification === 'reference');
  const transactionUnits = confirmedUnits.filter(u => u.classification === 'transaction');

  // Step 1: Execute entities
  let entityMap = new Map<string, string>();
  for (const unit of entityUnits) {
    const result = await executeEntityPipeline(
      tenantId, unit.profile, unit.rows, supabaseUrl, supabaseServiceKey
    );
    entityMap = result.entityMap;
    // ... collect results
  }

  // Step 2: Execute reference data
  for (const unit of referenceUnits) {
    const result = await executeReferencePipeline(
      tenantId, unit.profile, unit.rows, unit.sheetName, supabaseUrl, supabaseServiceKey
    );
    // ... collect results
  }

  // Step 3: Execute transactions (uses entityMap from step 1)
  for (const unit of transactionUnits) {
    const result = await executeTransactionPipeline(
      tenantId, unit.profile, unit.rows, entityMap, importBatchId, supabaseUrl, supabaseServiceKey
    );
    // ... collect results
  }

  // Step 4: Write classification signals for ALL content units (Phase E)
  for (const unit of confirmedUnits) {
    try {
      const fingerprint = computeStructuralFingerprint(unit.profile);
      await writeClassificationSignal(
        tenantId, unit.sourceFileName, unit.sheetName,
        fingerprint, unit.classification, unit.confidence,
        unit.decisionSource, unit.classificationTrace,
        unit.headerComprehension, unit.vocabularyBindings,
        unit.agentScores, unit.humanCorrectionFrom,
        supabaseUrl, supabaseServiceKey
      );
    } catch (e) {
      // Fire-and-forget — signal failure doesn't block import
      console.error('[SCI Execute] Signal write failed:', e);
    }
  }

  // Return results
}
```

### 4B: Full Row Data Access

The execute route needs full row data, not just the sample rows used in analyze. The file storage transport (OB-156) stores the full file in Supabase Storage. The execute route must:

1. Download the file from Supabase Storage
2. Parse all sheets with all rows
3. Route each sheet's full data to the correct pipeline

```typescript
// Access full data from Supabase Storage
// The file path should be available from the proposal/execution request
// OB-156 established this pattern — verify the exact storage path format
```

### Proof Gates — Phase 4
- PG-23: Execute route processes entity → reference → transaction in order
- PG-24: EntityMap passed from entity pipeline to transaction pipeline
- PG-25: Classification signals written for all content units (Phase E integration)
- PG-26: Full row data loaded from Supabase Storage (not just sample rows)
- PG-27: Import batch created before execution
- PG-28: Results returned with per-unit execution status
- PG-29: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160F Phase 4: Wire execute route — entity→reference→transaction with signal write" && git push origin dev`

---

## PHASE 5: BUILD + VERIFY + PR

### 5A: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 5B: Code Review Verification

```bash
# 1. Verify all three pipeline files exist
ls -la web/src/lib/sci/execute-entity.ts \
  web/src/lib/sci/execute-transaction.ts \
  web/src/lib/sci/execute-reference.ts

# 2. Verify ZERO Korean Test violations in execute pipelines
grep -rn '"ID_Empleado"\|"Nombre"\|"employee"\|"name"\|"hub"\|"target"\|"mes"\|"month"' \
  web/src/lib/sci/execute-entity.ts \
  web/src/lib/sci/execute-transaction.ts \
  web/src/lib/sci/execute-reference.ts | grep -v "// " | grep -v "console.log"
# Should return ZERO

# 3. Verify ZERO period creation/lookup in execute pipeline
grep -rn "createPeriod\|/api/periods\|periodId\|period_id.*=" \
  web/src/lib/sci/execute-entity.ts \
  web/src/lib/sci/execute-transaction.ts \
  web/src/lib/sci/execute-reference.ts \
  web/src/app/api/import/sci/execute/route.ts | grep -v "null\|NULL\|// "
# Should return ZERO (period_id = null is OK, period_id = <value> is not)

# 4. Verify period_id is explicitly NULL in transaction pipeline
grep -n "period_id" web/src/lib/sci/execute-transaction.ts
# Should show period_id: null

# 5. Verify entity resolution is batch-based, not per-row
grep -n "entityMap\|Map<string\|\.get(" web/src/lib/sci/execute-transaction.ts | head -10

# 6. Verify bulk insert with chunk size
grep -n "CHUNK_SIZE\|chunk\|slice" web/src/lib/sci/execute-transaction.ts | head -5

# 7. Verify source_date extraction is structural
grep -n "findTemporalColumns\|extractSourceDate\|temporalCol\|isTemporalColumn" \
  web/src/lib/sci/execute-transaction.ts | head -10

# 8. Verify reference key_field detection is structural
grep -n "detectReferenceKeyField\|categoricalScore\|uniqueCount\|cardinality" \
  web/src/lib/sci/execute-reference.ts | head -10

# 9. Verify row_data preserves full row
grep -n "row_data.*row\|row_data:" web/src/lib/sci/execute-transaction.ts

# 10. Verify execute route processing order
grep -n "entityUnits\|referenceUnits\|transactionUnits\|Step 1\|Step 2\|Step 3" \
  web/src/app/api/import/sci/execute/route.ts | head -10

# 11. Verify committed_data.source_date column exists (Supabase SQL Editor)
# SELECT column_name FROM information_schema.columns 
# WHERE table_name = 'committed_data' AND column_name = 'source_date';
```

### 5C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160F: Execute Pipeline + Routing — classified content reaches correct tables" \
  --body "Phase F of 12-phase SCI Development Plan. Implements SCI Spec Layer 5.

## What Changed

### 1. Entity Execute Pipeline (execute-entity.ts — NEW)
- Structural identifier detection from Content Profile (not field name matching)
- Structural name detection for display_name
- Bulk upsert with ON CONFLICT deduplication
- Returns entityMap (external_id → UUID) for downstream transaction resolution

### 2. Transaction Execute Pipeline (execute-transaction.ts — NEW)
- Batch entity resolution: one query loads all entities, O(1) per-row lookup
- Source date extraction: structural temporal detection (Decision 92)
- period_id = NULL (engine binds at calc time)
- row_data preserves full row (Carry Everything)
- 5,000-row chunk inserts (AP-2)
- Unmatched entity rows logged, not crashed

### 3. Reference Execute Pipeline (execute-reference.ts — NEW)
- Structural key_field detection (highest cardinality categorical column)
- Reference data stored in reference_data with key_field
- Bulk upsert

### 4. Execute Route Rewrite
- Processing order: Entity → Reference → Transaction (dependency order)
- EntityMap threaded from entity pipeline to transaction pipeline
- Classification signals written per content unit (Phase E integration)
- Full row data loaded from Supabase Storage

### 5. Schema Verification
- committed_data.source_date verified/added (Decision 92)
- reference_data table verified

## Implementation Completeness
SCI Spec Layer 5: 'Each claimed content unit routes to its processing pipeline.'
Phase F delivers: entity, transaction, and reference routing with structural detection.
After Phase F: rule_sets > 0, entities > 0, committed_data > 0.
Gap: input_bindings (how committed_data columns map to component inputs) — Phase G."
```

### Proof Gates — Phase 5
- PG-30: `npm run build` exits 0
- PG-31: localhost:3000 responds
- PG-32: Zero Korean Test violations (grep returns zero)
- PG-33: Zero period creation in execute pipeline (grep returns zero)
- PG-34: period_id explicitly NULL in transaction records
- PG-35: Entity resolution uses batch Map, not per-row queries
- PG-36: Bulk insert with ≥5,000-row chunks
- PG-37: row_data preserves full row
- PG-38: Source date extraction is structural
- PG-39: Reference key_field detection is structural (not first-column fallback)
- PG-40: Execute route processes entity → reference → transaction
- PG-41: committed_data.source_date column exists in database
- PG-42: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160F Complete: Execute Pipeline + Routing — SCI Spec Layer 5" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- execute-entity.ts (entity pipeline)
- execute-transaction.ts (transaction pipeline)
- execute-reference.ts (reference pipeline)
- Execute route rewrite (processing order, signal write, full data access)
- Schema verification (source_date, reference_data)
- Entity resolution (batch Map)
- Source date extraction (structural)
- Reference key_field detection (structural)
- import_batch creation
- Classification signal write integration (Phase E)

### OUT OF SCOPE — DO NOT TOUCH
- Analyze route (Phase A-E — completed)
- Agent scoring (Phase C)
- Tenant context (Phase D)
- Signal service internals (Phase E / HF-092)
- Convergence / input_bindings (Phase G)
- Plan import pipeline (separate from SCI data execute)
- Calculation engine
- Auth files

### CRITICAL CONSTRAINTS

1. **Korean Test.** Entity resolution uses structural identifierColumn, not column names. Source date extraction uses structural temporal detection, not column name matching. Reference key detection uses cardinality, not column name patterns.
2. **Decision 92/93.** period_id = NULL on all committed_data rows. source_date extracted from structural temporal columns. ZERO period creation, period lookup, or period API calls.
3. **Decision 97.** Full row data comes from Supabase Storage (file storage transport), not HTTP request bodies.
4. **AP-2.** Bulk inserts with ≥5,000-row chunks. No per-row sequential inserts.
5. **AP-4.** Entity resolution via batch Map, not per-row database lookups.
6. **Carry Everything.** row_data contains the full original row. All columns preserved. The engine activates what it needs at calculation time.
7. **Processing order is a dependency chain.** Entity → Reference → Transaction. Entities must exist before transactions can reference them. This is structural, not configurable.
8. **Unmatched rows don't crash.** If a transaction row's identifier doesn't match any entity, log it and continue. The import should succeed with a count of unmatched rows reported.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-2 | Sequential 500-row chunk inserts | 5,000-row chunks minimum, single bulk insert preferred |
| AP-3 | Browser Supabase client for bulk writes | Service role client on server-side |
| AP-4 | Per-row entity lookups | Batch load into Map, O(1) resolution |
| AP-8 | Migration file without execution | Execute source_date ALTER TABLE in SQL Editor |
| AP-13 | Schema assumption without verification | Phase 0 schema verification mandatory |
| AP-25 | Field name matching | All detection is structural |
| AP-30 | Period references in import code | period_id = null everywhere |
| AP-34 | Stuffing data into generic JSONB | HF-092 corrected this — don't reintroduce |

---

## IMPLEMENTATION COMPLETENESS GATE

**SCI Specification Layer 5 says:**
"Each claimed content unit routes to its processing pipeline. The routing carries semantic bindings that preserve both customer vocabulary and platform vocabulary."

**After Phase F:**
- Entity routing: ✅ entity-classified → entities table with structural external_id + display_name
- Transaction routing: ✅ transaction-classified → committed_data with entity_id + source_date + full row_data
- Reference routing: ✅ reference-classified → reference_data with structural key_field
- Processing order: ✅ entity → reference → transaction (dependency chain)
- Carry Everything: ✅ row_data contains full original row
- Decision 92: ✅ source_date extracted, period_id = NULL
- Bulk operations: ✅ AP-2/AP-4 compliant
- Classification signals: ✅ Phase E integration (signals written at execute time)

**Layer 5 is complete.** Phase G builds the Convergence Layer (input_bindings — how committed_data columns map to component inputs).

**Engine Contract after Phase F:**
- rule_sets: 1 (from plan import)
- entities: ≥50 (from entity pipeline)
- committed_data: ≥150 (from transaction pipeline)
- reference_data: ≥1 (from reference pipeline)
- periods: 0 (engine creates at calc time)
- rule_set_assignments: 0 (Phase G or manual)

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-160F_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification

### Completion Report Structure
1. **Phase 0 interface verification** — paste ALL grep output (9 commands)
2. **Schema verification** — paste committed_data and reference_data schema queries
3. **Architecture Decisions** — processing order, entity resolution, source date, bulk strategy
4. **Commits** — all with hashes, one per phase
5. **Files created** — execute-entity.ts, execute-transaction.ts, execute-reference.ts
6. **Files modified** — execute/route.ts
7. **Entity pipeline** — paste the upsert call, entityMap construction
8. **Transaction pipeline** — paste entity resolution (Map), source_date extraction, period_id=null, row_data preservation
9. **Reference pipeline** — paste key_field detection logic
10. **Execute route** — paste processing order code (entity → reference → transaction)
11. **Korean Test verification** — paste grep results
12. **Period reference verification** — paste grep results
13. **Proof gates** — 42 gates, each PASS/FAIL with pasted evidence
14. **Implementation Completeness Gate** — Layer 5 complete, Engine Contract status

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read?
□ Phase 0 interface verification complete (ALL 9 commands, output pasted)?
□ committed_data.source_date column exists (DB query pasted)?
□ reference_data table exists (DB query pasted)?
□ execute-entity.ts created with structural identifier detection?
□ execute-transaction.ts created with batch entity resolution?
□ execute-reference.ts created with structural key detection?
□ Execute route processes entity → reference → transaction?
□ EntityMap threaded from entity to transaction pipeline?
□ period_id = NULL on all committed_data rows?
□ ZERO period creation/lookup in execute code?
□ Source date extraction is structural (Korean Test compliant)?
□ Reference key_field detection is structural (not first-column fallback)?
□ row_data preserves full row (Carry Everything)?
□ Bulk inserts with ≥5,000-row chunks?
□ Classification signals written per content unit?
□ Unmatched entity rows logged, not crashed?
□ ZERO Korean Test violations (grep)?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Implementation Completeness Gate in completion report?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-160F: "Classification is a promise. Execution is the delivery. When the system says 'this is transaction data about your employees,' it must prove it — by resolving every identifier, extracting every date, preserving every column, and placing the data exactly where the engine expects it. No shortcuts. No approximations."*
