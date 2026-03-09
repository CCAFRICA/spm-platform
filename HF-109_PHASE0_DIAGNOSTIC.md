# HF-109 Phase 0: Specification Deviation Diagnostic

## Deviation 1: Engine entity_id FK in data resolution (DS-009 5.1)

**File:** `web/src/app/api/calculation/run/route.ts`

- Line 367-369: Batch cache indexed by entity_id UUID:
  ```typescript
  const key = row.entity_id || '__no_entity__';
  ```
- Line 857-858: resolveColumnFromBatch uses entity_id FK as PRIMARY lookup:
  ```typescript
  let rows = batchEntityMap.get(entityId);
  ```
- Line 864-866: external_id + column match is FALLBACK only

DS-009 Section 5.1 requires: `row_data->>$entity_column = $entity_external_id` — NOT entity_id FK.

## Deviation 2: metric_derivations dual write (DS-009 4.3)

**File:** `web/src/app/api/import/sci/execute/route.ts`

- Lines 147-149: When convergence_bindings exist, BOTH are written:
  ```typescript
  updatedBindings.convergence_bindings = result.componentBindings;
  if (result.derivations.length > 0) {
    updatedBindings.metric_derivations = result.derivations;
  }
  ```

DS-009 Section 4.3 specifies convergence_bindings as THE sole format.

## Deviation 3: Entity resolution inside SCI execute (DS-009 3.3)

**File:** `web/src/app/api/import/sci/execute/route.ts`

- Lines 893-933: Entity creation (entities.insert) inside executeEntityPipeline
- Lines 937-952: sharedEntityMap populated during pipeline
- Lines 954-995: entity_id backfill inside pipeline function

DS-009 Section 3.3 requires entity resolution post-import, not during import.

## Deviation 4: Pass 2 token overlap (DS-009 4.2)

**File:** `web/src/lib/intelligence/convergence-service.ts`

- Line 579: `const compTokens = tokenize(comp.name);`
- Line 586: `const ciTokens = tokenize(fi.contextualIdentity);`
- Line 587: Token overlap: `compTokens.filter(t => ciTokens.some(ci => ci.includes(t) || t.includes(ci)))`

DS-009 Section 4.2 requires structural co-location (measure count, operation type), not token overlap.

## SQL Test

Data cleaned before OB-162 merge — convergence_bindings empty. SQL prepared for post-import verification.

---

*HF-109 Phase 0 | March 9, 2026*
