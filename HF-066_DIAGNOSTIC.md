# HF-066 Task 1: Field Mapper Validation Diagnostic

## Root Cause Analysis

### The Symptom
User maps BranchName → "Branch Name" and ProductLicenses → "Product Licenses" via dropdown. Dropdown visually shows the selection. Next button stays disabled.

### Console Evidence
```
[Smart Import] Three-tier summary (AFTER second pass):
  Tier 1 (auto): 3 fields
  Tier 2 (suggested): 6 fields
  Tier 3 (unresolved): 2 fields ← BranchName, ProductLicenses
```

### The ACTUAL Root Cause

**The prompt's stated root cause (onChange doesn't update tier) is INCORRECT.**

The `updateFieldMapping` handler (line 1385) DOES correctly update both visual and validation state:
```typescript
const newTier: MappingTier = targetField ? 'auto' : 'unresolved';
return { ...m, targetField, confirmed: !!targetField, isRequired, tier: newTier };
```

**The REAL root cause is `canProceed` (line 2014-2026):**
```typescript
case 'map': {
  const allMapped = fieldMappings.flatMap(s => s.mappings.filter(m => m.targetField));
  const mappedIds = new Set(allMapped.map(m => m.targetField));
  const requiredIds = targetFields.filter(f => f.isRequired).map(f => f.id);
  return requiredIds.every(id => mappedIds.has(id));
}
```

`requiredIds` includes ALL `isRequired: true` fields from `extractTargetFieldsFromPlan()`:
- `entityId` (always required — base field)
- **PLUS every plan component metric** (matrixConfig.rowMetric, matrixConfig.columnMetric, tierConfig.metric, percentageConfig.appliedTo, conditionalConfig.conditions[].metric, conditionalConfig.appliedTo) — ALL marked `isRequired: true`

For Pipeline Test Co (6 components), this means 6-12 additional required field IDs beyond entityId. If the uploaded file doesn't have columns mapped to ALL of them, `requiredIds.every(id => mappedIds.has(id))` returns false — **regardless of what the user maps in the dropdown**.

### Why BranchName/ProductLicenses Don't Help
BranchName maps to `branch_name` (isRequired: false, category: hierarchy).
ProductLicenses maps to `product_licenses` (isRequired: false, category: employment).
Neither satisfies any plan component metric requirement.

### The Fix
`canProceed` for 'map' must only require `entityId` (the universal import requirement). Plan component metrics should be warned about in the validate step, not block the mapping step.

## File Locations
- `web/src/app/data/import/enhanced/page.tsx` — line 2014 (canProceed), line 1385 (updateFieldMapping)
- `web/src/components/import/field-mapper.tsx` — standalone FieldMapper component (NOT used by enhanced page)
- `web/src/lib/import-pipeline/smart-mapper.ts` — PLATFORM_FIELDS and synonym matching
