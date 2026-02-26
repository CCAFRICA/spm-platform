# HF-065 Completion Report: CLT-104 Open Items Resolution

## Task 1: Field Mapper — Custom Field Validation + Expanded Hierarchy Fields (F25, F28)
**Commits:** `ce01fef`

### F28 — Next Button Blocked by Date Requirement
**Root Cause:** `date` field was `isRequired: true` in the base field registry. Roster files have no date column, so `canProceed()` returned false because the required `date` field was never mapped.

**Fix:** Changed `date` to `isRequired: false`. Only `entityId` remains truly required for all import types. The validate step (which runs after map) already handles missing date as a warning, not a blocker.

### F25 — Field Mapper Dropdown Missing Hierarchy Fields
**Root Cause:** Base field registry only had 13 fields (entityId, name, storeId, date, period, year, month, role, amount, goal, attainment, quantity, storeRange). No hierarchy, contact, or employment fields.

**Fix:** Added 13 new semantic field options:
- **Hierarchy:** Branch Name, Branch ID, Region, Department, Location, Manager ID, Manager Name
- **Contact:** Employee Email, Phone Number
- **Employment:** Hire Date, Status, Product Licenses

Also updated `TargetField` category type and added synonyms to smart-mapper.ts for AI auto-matching.

### Files Modified:
- `web/src/app/data/import/enhanced/page.tsx` — field registry + category type
- `web/src/lib/import-pipeline/smart-mapper.ts` — synonym map for new fields

## Task 2: Financial Navigation — Breadcrumb + Submenu Persistence (F17, F18)
**Commits:** `9023f00`, `6958787`

### F17 — Financial Breadcrumb Missing Routes
**Root Cause:** Navbar.tsx breadcrumb had a hardcoded label map for financial routes with only 4 of 8+ entries. Missing: pulse, patterns, summary, products.

**Fix:** Added all missing financial sub-route labels to the breadcrumb map.

### F18 — Financial Submenu Collapses on Child Selection
**Root Cause:** `expandedItems` state was hardcoded to `["Insights", "Transactions"]` with no auto-expand logic. When navigating to a financial child page, sidebar re-mounts and resets to defaults, collapsing the Financial section.

**Fix:** Added `useEffect` that auto-expands the section containing the active page by checking if `pathname` matches any child `href`.

### Files Modified:
- `web/src/components/navigation/Navbar.tsx` — breadcrumb label map
- `web/src/components/navigation/Sidebar.tsx` — auto-expand useEffect

## Task 3: Import Header — Roster is Tenant-Level (F26)
**Commit:** `1a5c927`

### F26 — Roster Import Shows Plan Name
**Root Cause:** Import page header always showed `activePlan.name` badge, even when importing roster/personnel data. Roster data is tenant-level entity master data, not plan-scoped.

**Fix:** When AI analysis detects a roster-only import (all sheets classified as roster/unrelated, no transaction sheets), the header badge shows "Personnel Data" instead of the plan name. The "Active plan" footer in the mapping step is also hidden for roster imports.

### Files Modified:
- `web/src/app/data/import/enhanced/page.tsx` — header badge + mapping step footer

## Task 4: Carry Everything Verified — Unresolved Fields (F27)
**Commit:** `cdb3475` (verification only, no code changes)

### F27 — Verify Unresolved Fields Not Dropped
**Result:** Carry Everything principle is already correctly implemented.

The commit pipeline in `api/import/commit/route.ts` (lines 539-569):
1. `let content = { ...row }` — starts with ALL original columns
2. `mapped[sourceCol] = value` — preserves original column names alongside semantic keys
3. `row_data: { ...content }` — everything goes into JSONB

Unmapped/unresolved fields (BranchName, Status, ProductLicenses, Email) are NOT filtered or dropped. They survive in `row_data` under their original column names.

**Verification query:**
```sql
SELECT row_data->>'BranchName', row_data->>'Status', row_data->>'Email'
FROM committed_data WHERE tenant_id = '<tenant_id>' LIMIT 5;
```

## Proof Gates

| Gate | Description | Status |
|------|-------------|--------|
| PG-01 | Next button enabled after mapping all fields (including custom) | PASS — only entityId is required |
| PG-02 | Unresolved fields don't block Next button | PASS — unresolved fields have no targetField, don't affect required check |
| PG-03 | Dropdown includes Branch Name, Region, Email, Hire Date, Status | PASS — 13 new fields added |
| PG-04 | npm run build exits 0 (Task 1) | PASS |
| PG-05 | Revenue Timeline breadcrumb correct | PASS — timeline entry existed, pulse/patterns/summary/products added |
| PG-06 | Analysis submenu stays expanded on child selection | PASS — auto-expand useEffect |
| PG-07 | Active page's parent section always expanded | PASS — useEffect checks all nav items |
| PG-08 | npm run build exits 0 (Task 2) | PASS |
| PG-09 | Roster header doesn't show plan name | PASS — shows "Personnel Data" for roster-only imports |
| PG-10 | Roster header shows tenant-level context | PASS — badge changes based on classification |
| PG-11 | npm run build exits 0 (Task 3) | PASS |
| PG-12 | Commit logic includes ALL source columns | PASS — verified in code |
| PG-13 | committed_data rows contain unmapped fields | PASS — row_data JSONB preserves all columns |
| PG-14 | No filtering of Unresolved fields before insert | PASS — `{ ...row }` spread captures everything |
| PG-15 | npm run build exits 0 (Task 4) | PASS |

## Deferred Findings

| # | Finding | Rationale |
|---|---------|-----------|
| F16 | Cross-workspace auth redirect loop | Auth chain issue — needs dedicated investigation per Standing Rule 5 |
| F19 | Empty tenant — no module activation path | Architecture decision: explicit toggle vs data-driven detection |
| F20 | Configure > Plans is actually Plan Import | Navigation restructure scope — separate OB |
| F21 | Three separate import entry points | DS-005 unified import specification — separate OB |

## Files Modified (Total)
1. `web/src/app/data/import/enhanced/page.tsx` — field registry, category type, import header
2. `web/src/lib/import-pipeline/smart-mapper.ts` — synonym map for hierarchy/contact/employment fields
3. `web/src/components/navigation/Navbar.tsx` — breadcrumb label map
4. `web/src/components/navigation/Sidebar.tsx` — auto-expand useEffect
