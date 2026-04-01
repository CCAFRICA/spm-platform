# HF-185 Completion Report

## Changes Summary

**Fix A — extractSourceDate semantic negative filter** (`source-date-extraction.ts`):
- Added `NON_TEMPORAL_ROLES` set: `entity_attribute`, `entity_identifier`, `entity_name`, `transaction_identifier`, `category_code`, `descriptive_label`, `entity_license`
- Strategy 1: If dateColumnHint's semantic role is non-temporal, skip it (fall through to Strategy 2+)
- Strategy 4: Changed `Object.values` to `Object.entries`; skip fields with non-temporal semantic roles
- Result: roster `hire_date` (classified as `entity_attribute`) no longer produces source_date

**Fix B — Period detection transaction-only filter** (`detect/route.ts`, `create-from-data/route.ts`):
- All 7 committed_data queries in detect/route.ts now filter with `.or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target')`
- Both committed_data queries in create-from-data/route.ts have same filter
- Entity/reference rows excluded from period suggestions, transaction counts, and orphaned data detection

## Verification Gates

| # | Gate | PASS/FAIL | Evidence |
|---|------|-----------|----------|
| 1 | `npm run build` exits 0 | PASS | Build completed, 0 errors |
| 2 | `tsc --noEmit` exits 0 | PASS | No output (0 errors) |
| 3 | `npx next lint` exits 0 | PASS | Pre-existing warnings only |
| 4 | NON_TEMPORAL_ROLES exists | PASS | Lines 19, 40, 85 in source-date-extraction.ts |
| 5 | Strategy 1 checks semantic role | PASS | Line 40: `if (hintRole && NON_TEMPORAL_ROLES.has(hintRole))` |
| 6 | Strategy 4 uses Object.entries + role check | PASS | Line 85: `if (semanticRoles?.[key] && NON_TEMPORAL_ROLES.has(semanticRoles[key])) continue` |
| 7 | Period detection filters informational_label | PASS | 7 queries in detect/route.ts, 2 in create-from-data/route.ts |
| 8 | No unauthorized changes | PASS | 3 files: source-date-extraction.ts, detect/route.ts, create-from-data/route.ts |

## Files Modified (3)

```
web/src/lib/sci/source-date-extraction.ts         +29/-3  (semantic negative filter)
web/src/app/api/periods/detect/route.ts           +17/-5  (transaction-only filter)
web/src/app/api/periods/create-from-data/route.ts +4/-0   (transaction-only filter)
```
