# OB-69 Diagnostic Report

**Date:** 2026-02-20

---

## 1. 406 Root Cause

### Query that fails
**File:** `web/src/contexts/persona-context.tsx`, line 100-104
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('auth_user_id', user!.id)
  .eq('tenant_id', currentTenant!.id)
  .single();
```

### Why it fails
- RetailCDMX tenant (`9b2bb4e3-...`) has **ZERO profiles** in the profiles table
- Platform admin profile (`497b8d67-...`) has `tenant_id = null` (not scoped to any tenant)
- `.single()` returns HTTP 406 when zero rows match (Supabase PostgREST behavior)
- This context fires on every page load → every page gets 406

### All profiles in DB
```json
[
  {"id":"02000000-0001-0000-0000-000000000001","auth_user_id":"28d0f742-...","tenant_id":"a1b2c3d4-...","email":"admin@opticaluminar.mx","role":"admin"},
  {"id":"02000000-0001-0000-0000-000000000002","auth_user_id":"99d22f6c-...","tenant_id":"a1b2c3d4-...","email":"gerente@opticaluminar.mx","role":"manager"},
  {"id":"02000000-0001-0000-0000-000000000003","auth_user_id":"ac03e07b-...","tenant_id":"a1b2c3d4-...","email":"vendedor@opticaluminar.mx","role":"viewer"},
  {"id":"b2000000-0040-0000-0000-000000000001","auth_user_id":"1c869082-...","tenant_id":"b2c3d4e5-...","email":"admin@velocidaddeportiva.mx","role":"admin"},
  {"id":"b2000000-0040-0000-0000-000000000002","auth_user_id":"c2f688c6-...","tenant_id":"b2c3d4e5-...","email":"gerente@velocidaddeportiva.mx","role":"manager"},
  {"id":"b2000000-0040-0000-0000-000000000003","auth_user_id":"893aae24-...","tenant_id":"b2c3d4e5-...","email":"asociado@velocidaddeportiva.mx","role":"viewer"},
  {"id":"497b8d67-...","auth_user_id":"5fb5f934-...","tenant_id":null,"email":"platform@vialuce.com","role":"vl_admin"}
]
```

### Other affected locations using .single() on profiles
- `web/src/middleware.ts:192` — login redirect (fires when navigating to /login while authenticated)
- `web/src/middleware.ts:218` — workspace auth (fires on restricted workspaces)
- `web/src/lib/supabase/auth-service.ts:139` — auth context (fires on every authenticated page)
- `web/src/contexts/locale-context.tsx:105` — ALREADY FIXED (uses .maybeSingle())
- All API routes (approvals, disputes, etc.) — server-side, use `.single()` but scoped by auth_user_id only

---

## 2. Pipeline Data State

### Row counts (live DB query, 2026-02-20)
| Table | Count | Notes |
|-------|-------|-------|
| rule_sets | 1 | "RetailCorp Optometrist Incentive Plan", status=active |
| entities | 24,833 | |
| periods | 7 | Jan-Jul 2024, canonical_key format "2024-01" etc |
| committed_data | 119,129 total | ALL 119,129 have period_id (0 without) |
| calculation_batches | **0** | NO calculation has ever been run |
| calculation_results | **0** | |
| rule_set_assignments | 24,833 | All entities assigned |
| entity_period_outcomes | **0** | |
| import_batches | exists | |

### Period data
```json
[
  {"label":"January 2024","canonical_key":"2024-01","period_type":"monthly","status":"open"},
  {"label":"February 2024","canonical_key":"2024-02","period_type":"monthly","status":"open"},
  {"label":"March 2024","canonical_key":"2024-03","period_type":"monthly","status":"open"},
  {"label":"April 2024","canonical_key":"2024-04","period_type":"monthly","status":"open"},
  {"label":"May 2024","canonical_key":"2024-05","period_type":"monthly","status":"open"},
  {"label":"June 2024","canonical_key":"2024-06","period_type":"monthly","status":"open"},
  {"label":"July 2024","canonical_key":"2024-07","period_type":"monthly","status":"open"}
]
```

---

## 3. Code Path Audit

### Import pipeline: web/src/app/api/import/commit/route.ts
- Creates periods with correct `canonical_key` column
- Sets `period_id` on all committed_data rows via `resolvePeriodId()`
- No hardcoded field names — uses client-provided AI mappings
- Auto-assigns entities to active rule set via rule_set_assignments

### Calculation pipeline: web/src/app/api/calculation/run/route.ts
- Reads committed_data filtered by tenant_id + period_id
- Creates calculation_batches (lifecycle_state = DRAFT → PREVIEW)
- Writes calculation_results with correct schema (batch_id, total_payout top-level)
- Also creates entity_period_outcomes (materialized)

### Dashboard: web/src/app/operate/page.tsx → web/src/lib/data/persona-queries.ts
- Reads from entity_period_outcomes (primary) with fallback to calculation_results
- Admin/Manager/Rep persona queries all query Supabase directly

---

## 4. Broken Links / Gaps

### Gap 1: 406 from .single() on empty profiles (BLOCKS ALL PAGES)
- persona-context.tsx, middleware.ts, auth-service.ts

### Gap 2: No calculation has been run (DATA GAP, NOT CODE BUG)
- Import pipeline is complete and correct
- Calculation code exists and uses correct schema
- But nobody has triggered a calculation yet
- Dashboard shows empty state because calculation_results is empty

### Gap 3: No profiles for RetailCDMX tenant (DATA GAP)
- Platform admin has tenant_id=null, not scoped to RetailCDMX
- /configure/users page shows "0 users" correctly — there ARE zero profiles for this tenant
