# HF-125 Phase 2/2B: Calculate Access + Data Path

## Phase 2: Calculate Access

### Root Cause
Sidebar linked to `/admin/launch/calculate`. Middleware restricts `/admin/*` to `platform` role only.
Patricia (role='admin') was blocked at middleware level before RequireRole even ran.

### Fix Applied (Phase 1)
- Sidebar calculate link changed to `/operate/calculate`
- `/operate/*` middleware allows `['platform', 'admin', 'tenant_admin']`
- `/operate/calculate/page.tsx` RequireRole allows `['platform', 'admin']`
- Both middleware and page-level access now allow tenant admin

### No JWT Update Needed
Middleware checks `user_metadata.role` first, falls back to `profiles.role`.
If Patricia's JWT has role='admin', she passes middleware for `/operate/*`.
If JWT role is null/missing, middleware queries `profiles.role` → 'admin' → passes.

## Phase 2B: Calculation Data Path

### How calculation routes entities
`web/src/app/api/calculation/run/route.ts` line 164:
1. Queries `rule_set_assignments WHERE tenant_id AND rule_set_id`
2. Gets entity_ids from assignments
3. If zero → returns 400 "No entities assigned to this rule set"
4. Otherwise proceeds with calculation

### What creates rule_set_assignments
1. `web/src/app/api/import/sci/execute/route.ts` line 1148 — SCI pipeline import
2. `web/src/app/api/import/commit/route.ts` line 903 — Browser import commit
3. `web/src/app/api/intelligence/wire/route.ts` line 211 — Wire API

### BCL Status
BCL has calculation_results from OB-164 pipeline import → assignments existed then.
Browser import also creates assignments automatically via import commit route.

### Risk Assessment
- **If Patricia imports new data via browser**: Import commit route creates assignments → calc should work
- **If she just runs calc on existing data**: Assignments from OB-164 still exist → calc works
- **If data was wiped**: Assignments would be gone. New import needed first, which creates assignments.

### Verification
Production test needed to confirm: after Patricia imports data and runs calculation,
results are non-zero. Cannot test on localhost without BCL auth credentials.
