# OB-160F Phase 0: Architecture Decision + Interface Verification

## Interface Verification Results

### 1. Current Execute Route
File: `web/src/app/api/import/sci/execute/route.ts` — 1391 lines
Already contains ALL five pipelines:
- `executeEntityPipeline` (lines 675-806): dedup, batch entity creation, semantic role extraction
- `executeTransactionPipeline` (lines 468-669): entity resolution, source_date, convergence
- `executeTargetPipeline` (lines 243-462): same as transaction + convergence
- `executeReferencePipeline` (lines 812-957): reference_data + reference_items
- `executePlanPipeline` (lines 964-1140): AI interpretation, bridge to engine format
- `postCommitConstruction` (lines 1153-1390): entity binding, assignments, store metadata
- `filterFieldsForPartialClaim` (lines 208-237): PARTIAL claim field filtering

### 2. ContentUnitExecution Interface (from sci-types.ts)
```
contentUnitId, confirmedClassification, confirmedBindings (SemanticBinding[]),
rawData (Record<string, unknown>[]), originalClassification, originalConfidence,
claimType, ownedFields, sharedFields, documentMetadata,
structuralFingerprint, classificationTrace, vocabularyBindings,
sourceFile, tabName
```
Key: uses `confirmedBindings` with `semanticRole` (entity_identifier, entity_name, etc.) — NOT ContentProfile fields.

### 3. ContentProfile Interface Mismatch
Spec references `profile.identifierColumn` and `profile.structuralNameColumn` — NEITHER EXISTS.
Actual ContentProfile has:
- `fields: FieldProfile[]` (ARRAY, not object)
- `patterns.hasEntityIdentifier: boolean`
- `patterns.hasStructuralNameColumn: boolean`
- `structure.numericFieldRatio, categoricalFieldRatio, identifierRepeatRatio`
Identifier found via: `fields.find(f => f.nameSignals.containsId)`
Name found via: `fields.find(f => f.nameSignals.looksLikePersonName)`
BUT: the execute route doesn't use ContentProfile at all — it uses `confirmedBindings` semantic roles.

### 4. Source Date Extraction — ALREADY EXISTS
File: `web/src/lib/sci/source-date-extraction.ts`
Functions: `extractSourceDate`, `findDateColumnFromBindings`, `buildSemanticRolesMap`, `detectPeriodMarkerColumns`
Already wired into both target and transaction pipelines.

### 5. Reference Data Schema
`reference_data`: id, tenant_id, reference_type, name, version, status, key_field, schema_definition, import_batch_id, metadata, created_by, created_at, updated_at
`reference_items`: id, tenant_id, reference_data_id, external_key, display_name, category, attributes, status, created_at
Spec assumed `data JSONB` column and `ON CONFLICT tenant_id,name` — actual schema uses reference_items for individual rows.

### 6. Entity Resolution — ALREADY BATCH MAP
Target pipeline (line 310-325), Transaction pipeline (line 519-534): batch 200-ID fetches into `entityIdMap: Map<string, string>`.

### 7. committed_data Schema
Uses: `tenant_id, import_batch_id, entity_id, period_id (NULL), source_date, data_type, row_data, metadata`
`source_date` column exists (added by OB-152).

### 8. Classification Signals — ALREADY WRITTEN
Lines 137-170 of execute route: writes Phase E signals using `writeClassificationSignal` with `structuralFingerprint`, `classificationTrace`, `vocabularyBindings`, `agentScores`.

## CRITICAL FINDING: Pipelines Already Exist

The OB-160F spec proposes creating three new files:
- `execute-entity.ts` — NEW
- `execute-transaction.ts` — NEW
- `execute-reference.ts` — NEW

**These pipelines already exist inline in the execute route.** Creating separate files with the spec's proposed code would be a REGRESSION because:

1. **Lost convergence**: Existing transaction/target pipelines trigger `convergeBindings` for all active rule_sets (lines 411-451, 623-660). Spec's pipelines don't.
2. **Lost postCommitConstruction**: Entity binding, rule_set_assignments, store metadata (OB-146). Spec doesn't include this.
3. **Lost PARTIAL claim filtering**: `filterFieldsForPartialClaim` (OB-134). Spec doesn't include this.
4. **Lost store metadata**: OB-146 step 1b — store_id, volume_tier, volume_key from entity data (lines 1289-1386). Spec doesn't include this.
5. **Wrong interfaces**: Spec uses `profile.identifierColumn` (doesn't exist). Existing code uses `confirmedBindings.find(b => b.semanticRole === 'entity_identifier')` — correct.
6. **Wrong field iteration**: Spec uses `Object.entries(profile.fields)`. Actual `fields` is an array.
7. **Wrong reference schema**: Spec assumes `data JSONB` column. Actual uses `reference_items` table.
8. **Lost import_batch management**: Each pipeline creates its own batch. Spec centralizes incorrectly.
9. **Lost data_type resolution**: `normalizeFileNameToDataType` logic. Spec hardcodes `data_type: 'transaction'`.

## Architecture Decision

**DECISION: Enhance existing execute route in-place. Do NOT create separate pipeline files.**

The existing code is battle-tested, feature-complete, and handles edge cases the spec doesn't account for. The only missing feature from the spec is **processing order enforcement** — currently units are processed in arrival order, relying on postCommitConstruction for retroactive entity binding. Adding explicit ordering (entity → reference → transaction/target → plan) is a valid improvement.

### Changes to make:
1. Add processing order enforcement in the main `for` loop — sort content units so entity-classified come first, reference second, transaction/target third, plan last
2. Pass the entityMap from entity pipeline execution to subsequent transaction/target pipelines (currently entity resolution is done per-pipeline independently)
3. No new files needed — no interface changes, no regression risk

### Processing Order Implementation
```typescript
// Sort content units by dependency order
const sortOrder: Record<string, number> = { entity: 0, reference: 1, target: 2, transaction: 2, plan: 3 };
const sorted = [...contentUnits].sort((a, b) =>
  (sortOrder[a.confirmedClassification] ?? 9) - (sortOrder[b.confirmedClassification] ?? 9)
);
```

### Proof Gates Already Satisfied
- PG-03 through PG-07: Entity pipeline already exists with dedup, batch Map, structural binding
- PG-09 through PG-17: Transaction pipeline already exists with batch entity resolution, source_date, period_id=NULL, 5000-row chunks
- PG-18 through PG-22: Reference pipeline already exists with reference_data + reference_items
- PG-23 through PG-29: Execute route already has signal write, import batch, per-unit results

### Only Change Needed
- Processing order enforcement (PG-23, PG-40)
- EntityMap threading from entity pipeline to transaction/target pipelines (PG-24)
