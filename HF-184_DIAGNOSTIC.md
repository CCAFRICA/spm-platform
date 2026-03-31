# HF-184 Phase 0: Diagnostic — committed_data Write Comparison

## Actual Code State

| Pipeline | File | committed_data | source_date | entity_id_field |
|----------|------|---------------|-------------|-----------------|
| processEntityUnit (bulk) | execute-bulk/route.ts | NOT written | N/A | N/A |
| processReferenceUnit (bulk) | execute-bulk/route.ts | ✅ written | ✅ extracted | ✅ present |
| processDataUnit (bulk) | execute-bulk/route.ts | ✅ written | ✅ extracted | ✅ present |
| executeEntityPipeline | execute/route.ts | ✅ written | ❌ null | ❌ missing |
| executeReferencePipeline | execute/route.ts | ✅ written | ❌ null | ❌ missing |
| executeTargetPipeline | execute/route.ts | ✅ written | ✅ extracted | ❌ missing |
| executeTransactionPipeline | execute/route.ts | ✅ written | ✅ extracted | ❌ missing |

## Gap 1: processEntityUnit (execute-bulk/route.ts:316-489)

Does NOT write to committed_data at all. Only creates/enriches entities in the `entities` table.
Need to ADD a committed_data write section WITH source_date + entity_id_field after entity creation.

## Gap 2: executeEntityPipeline (execute/route.ts:883-899)

```typescript
source_date: null as string | null,  // ← BUG: not extracted
metadata: {
    source: 'sci',
    proposalId,
    semantic_roles: semanticRoles,
    resolved_data_type: dataType,
    field_identities: entityFieldIdentities,
    informational_label: 'entity',
    // ← MISSING: entity_id_field
},
```

## Gap 3: executeReferencePipeline (execute/route.ts:1005-1021)

```typescript
source_date: null as string | null,  // ← BUG: not extracted
metadata: {
    source: 'sci',
    proposalId,
    semantic_roles: semanticRoles,
    resolved_data_type: dataType,
    field_identities: refFieldIdentities,
    informational_label: 'reference',
    // ← MISSING: entity_id_field
},
```

## Reference Implementation: processDataUnit (execute-bulk/route.ts:539-567)

```typescript
const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
const entityIdField = entityIdBinding?.sourceField;
const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
const periodMarkerHint = detectPeriodMarkerColumns(rows);

const insertRows = rows.map((row, i) => {
    const sourceDate = extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint);
    return {
        ...
        source_date: sourceDate,
        metadata: {
            ...
            entity_id_field: entityIdField || null,
        },
    };
});
```

## Note: Bulk reference pipeline already fixed

processReferenceUnit in execute-bulk/route.ts (lines 696-725) already has extractSourceDate,
entity_id_field, and the full unified write pattern. No changes needed.
