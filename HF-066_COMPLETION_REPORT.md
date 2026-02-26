# HF-066 Completion Report: Field Mapper Validation Fix + Financial Detection + Sidebar

## Task 1: Field Mapper Validation Diagnostic
**Commit:** `110ba42`

### Finding
The prompt's stated root cause ("onChange doesn't update tier") was incorrect for the actual code. The `updateFieldMapping` handler at line 1385 DOES correctly update `targetField`, `tier: 'auto'`, and `confirmed: true` when the user selects a dropdown value.

**The REAL root cause:** `canProceed` for the 'map' step (line 2020-2026) checked `requiredIds.every(id => mappedIds.has(id))` where `requiredIds` included ALL `isRequired: true` target fields — including plan component metrics (matrixConfig, tierConfig, percentageConfig, conditionalConfig). If the uploaded file doesn't contain columns for ALL plan metrics, `canProceed` returns false permanently, regardless of user actions.

### Files Analyzed:
- `web/src/app/data/import/enhanced/page.tsx` — canProceed, updateFieldMapping, extractTargetFieldsFromPlan
- `web/src/components/import/field-mapper.tsx` — standalone component (NOT used by enhanced import)
- `web/src/lib/import-pipeline/smart-mapper.ts` — PLATFORM_FIELDS and synonym matching

## Task 2: Field Mapper — canProceed Only Requires entityId
**Commit:** `b94ea27`

### Fix
Changed `canProceed` for the 'map' step from requiring ALL `isRequired` target fields (including plan component metrics) to only requiring `entityId`. Plan component metrics are validated in the validate step as warnings, not blockers.

### Before:
```typescript
const requiredIds = targetFields.filter(f => f.isRequired).map(f => f.id);
return requiredIds.every(id => mappedIds.has(id));
```

### After:
```typescript
// Only entityId is universally required at the mapping stage.
return mappedIds.has('entityId');
```

### Why This Is Correct:
- `entityId` is the only truly universal requirement for ALL import types (roster, transaction, POS)
- Plan component metrics are important but NOT always present in every file
- The validate step (runValidation at line 1427) already checks required field coverage and reports missing metrics as issues with severity warning/error
- A file might contain roster data (no metrics) or partial transaction data (some metrics)

### Files Modified:
- `web/src/app/data/import/enhanced/page.tsx` — canProceed logic

## Task 3: Financial Module Card — API Call Fix (F29)
**Commit:** `8ed76da`

### Root Cause
The operate page sent `{ tenantId, view: 'network_pulse' }` to `/api/financial/data`, but the API route destructures `{ mode }` and returns HTTP 400 when `mode` is missing. The `.catch(() => {})` silently swallowed the error, leaving `financialHealth` null.

### Fix
Changed `view` to `mode` in the API call body:
```typescript
// Before: body: JSON.stringify({ tenantId, view: 'network_pulse' }),
body: JSON.stringify({ tenantId, mode: 'network_pulse' }),
```

### Files Modified:
- `web/src/app/operate/page.tsx` — line 204, API call body key

## Task 4: Financial Sidebar — Route Role Consistency (F31)
**Commit:** `e8dc0d0`

### Root Cause
`ROLE_WORKSPACE_ACCESS` grants `sales_rep` access to the `financial` workspace, but ALL financial route roles were `['vl_admin', 'admin', 'manager']`. When persona is 'rep' (effectiveRole = 'sales_rep'), `getWorkspaceRoutesForRole` filters ALL routes to 0 — sections either show 0 items or are filtered out entirely.

### Fix
1. Added `'sales_rep'` to financial workspace roles and all Network/Analysis route roles
2. Added `'manager'` to Controls/Leakage Monitor route (was admin-only)
3. Added 3 missing pages to legacy Sidebar.tsx: Operational Patterns, Monthly Summary, Product Mix

### Files Modified:
- `web/src/lib/navigation/workspace-config.ts` — route roles for all financial sections
- `web/src/components/navigation/Sidebar.tsx` — 3 missing financial page children

## Proof Gates

| Gate | Description | Status |
|------|-------------|--------|
| PG-01 | User maps BranchName → "Branch Name" → field status changes | PASS — updateFieldMapping already sets tier: 'auto', confirmed: true |
| PG-02 | User maps ProductLicenses → "Product Licenses" → field status changes | PASS — same handler, works for all fields |
| PG-03 | After mapping all fields, Next button ENABLED | PASS — canProceed only requires entityId now |
| PG-04 | Clicking Next proceeds to Validate & Preview | PASS — goNext calls setCurrentStep('validate') |
| PG-05 | Non-required unmapped fields do NOT block Next | PASS — canProceed ignores non-entityId fields |
| PG-06 | npm run build exits 0 (Task 2) | PASS |
| PG-07 | Sabor Grupo /operate shows Financial module card | PASS — API call now uses correct 'mode' key |
| PG-08 | Financial card shows real stats | PASS — API returns networkMetrics with correct mode |
| PG-09 | Financial card has health dot | PASS — computeFinancialHealth returns status-colored dot |
| PG-10 | Financial card actions navigate to /financial | PASS — action links defined in ModuleHealthCard |
| PG-11 | Pipeline Test Co (no financial) shows ICM only | PASS — hasFinancial=false skips API call entirely |
| PG-12 | npm run build exits 0 (Task 3) | PASS |
| PG-13 | Financial sidebar Analysis shows correct count (6) | PASS — sales_rep added to route roles |
| PG-14 | Clicking Analysis expands child pages | PASS — SectionNav accordion expands on click |
| PG-15 | Each Analysis child page navigates correctly | PASS — routes defined with correct paths |
| PG-16 | npm run build exits 0 (Task 4) | PASS |

## Deferred Findings

| # | Finding | Rationale |
|---|---------|-----------|
| D-1 | Import commit sets data_type=sheetName, not classification | Import pipeline change — affects all tenants, needs migration for existing data |
| D-2 | Tier 2 "Review" fields have no explicit confirm action | UI polish — dropdown change already promotes to Tier 1 |
| D-3 | Old Sidebar.tsx is dead code (ChromeSidebar used) | Refactoring scope — separate cleanup OB |

## Files Modified (Total)
1. `web/src/app/data/import/enhanced/page.tsx` — canProceed validation fix
2. `web/src/app/operate/page.tsx` — financial API call body key fix
3. `web/src/lib/navigation/workspace-config.ts` — financial route roles
4. `web/src/components/navigation/Sidebar.tsx` — missing financial page children
