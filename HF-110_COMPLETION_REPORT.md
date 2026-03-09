# HF-110 Completion Report: Field Identity Pipeline — Three Root Cause Fixes

## Specification
**HF-110**: FIELD IDENTITY PIPELINE — THREE ROOT CAUSE FIXES FROM PRODUCTION VERIFICATION

## Phases Executed

### Phase 0: Three Root Cause Diagnostic (`913b333`)
Diagnosed three root causes from production Supabase queries:
- **Root Cause A**: `field_identities` never stored — frontend doesn't pass `classificationTrace` to execute
- **Root Cause B**: Convergence `extractComponents()` doesn't handle direct array format
- **Root Cause C**: Entity resolution scans ALL batches — reference hubs pollute entity list

### Phase 1: Bridge HC output to committed_data field_identities (`5876d7e`)
**Files modified:**
- `web/src/components/sci/SCIExecution.tsx` — Pass `classificationTrace`, `structuralFingerprint`, `vocabularyBindings` from proposal to execute request (both legacy and bulk paths)
- `web/src/app/api/import/sci/execute/route.ts` — Added `buildFieldIdentitiesFromBindings()` fallback; all 4 pipelines now guarantee field_identities write

**Korean Test:** `buildFieldIdentitiesFromBindings` maps SemanticRole → ColumnRole generically. No hardcoded field names.

### Phase 2: Convergence handles both component structures (`ee90fa5`)
**Files modified:**
- `web/src/lib/intelligence/convergence-service.ts` — `extractComponents()` rewritten to handle both `{variants: [{components: [...]}]}` and direct `[{...}]` formats; added `inputs` (plural) field parsing alongside `input` (singular)

**Korean Test:** Component extraction is structural, not name-based.

### Phase 3: Entity resolution — batch prioritization + row index guard (`738c531`)
**Files modified:**
- `web/src/lib/sci/entity-resolution.ts` — Added `looksLikeRowIndex()` guard; batch prioritization by `informational_label` (entity/transaction/target only for discovery, reference excluded); semantic_roles fallback when field_identities absent

**Korean Test:** Batch filtering uses `informational_label` metadata, not column names or language.

## Evidentiary Gates

### Gate 1: field_identities stored in committed_data
**Verification SQL:**
```sql
SELECT id, (metadata->>'field_identities') IS NOT NULL AS has_fi
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
LIMIT 10;
```
**Expected:** After re-import, all rows show `has_fi = true`.

### Gate 2: Convergence bindings populated
**Verification SQL:**
```sql
SELECT id, jsonb_array_length(convergence_bindings->'bindings') AS binding_count
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
**Expected:** After re-import + convergence, `binding_count > 0`.

### Gate 3: Entity resolution produces correct entities
**Verification SQL:**
```sql
SELECT COUNT(*) AS entity_count,
       COUNT(CASE WHEN display_name ~ '^\d+$' THEN 1 END) AS digit_only_names
FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
**Expected:** ~50 entities (employees), 0 digit-only names. Not 9 hubs + 9 digits.

## Cleanup SQL (run before re-import to clear bad data)
```sql
-- Clear bad entities from Root Cause C misidentification
DELETE FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Clear entity_id backfill on committed_data
UPDATE committed_data
SET entity_id = NULL
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Clear stale convergence bindings
UPDATE rule_sets
SET convergence_bindings = NULL
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

## Ground Truth
**Target:** MX$185,063 — Meridian Logistics Group, January 2025
**Requires:** Re-import with fixed pipeline → entity resolution → convergence → calculation engine

## Commit History
| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `913b333` | Three root cause diagnostic |
| 1 | `5876d7e` | HC → field_identities bridge |
| 2 | `ee90fa5` | Convergence variant/array handling |
| 3 | `738c531` | Entity resolution batch prioritization |
| 4 | This commit | Completion report |

---
*HF-110 Complete | March 9, 2026*
