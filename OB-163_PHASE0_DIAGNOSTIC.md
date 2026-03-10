# OB-163 Phase 0: Diagnostic — Platform State Inventory

## 0A: Platform Infrastructure State

### Current Routes (145 total)
Key routes for OB-163:
- `/operate/calculate` — Main calculation interface (DS-007 results)
- `/admin/launch/calculate` — Admin calculation launcher (VL Admin only)
- No `/briefing` route exists — must be created

### Sidebar/Nav Config
- `src/components/navigation/Sidebar.tsx` — Main sidebar with module tokens, feature gates, role checks
- `src/contexts/navigation-context.tsx` — Navigation state
- `src/middleware.ts` — Auth enforcement + workspace authorization

### Persona Context
- `src/contexts/persona-context.tsx` — WORKING
  - Types: admin, manager, rep
  - Derivation: `derivePersona()` from role + capabilities
  - Override: `setPersonaOverride()` via sessionStorage (`vl_persona_override`)
  - Scope: admin=canSeeAll, manager=profile_scope, rep=store_id
  - Hook: `usePersona()` returns `{ persona, tokens, scope, profileId, entityId, setPersonaOverride }`

### Calculation Engine
- `src/lib/calculation/run-calculation.ts` — Evaluators + metric derivation
- `src/app/api/calculation/run/route.ts` — Server-side orchestrator (300s timeout)
- `src/lib/calculation/decimal-precision.ts` — decimal.js with ROUND_HALF_EVEN (Decision 122)
- `src/lib/orchestration/metric-resolver.ts` — Semantic type inference
- `src/lib/supabase/calculation-service.ts` — Batch/results CRUD

### Entity Relationships
- `entity_relationships` table referenced in: database.types.ts, clear-tenant.ts, entity-service.ts, graph-service.ts, canvas API

### Import Pipeline
- `/api/import/commit` — Commit import data
- `/api/import/sci/execute` — SCI execute single import
- `/api/import/sci/execute-bulk` — SCI bulk execute
- `/api/interpret-plan` — AI plan interpretation
- `/api/plan/import` — Save + activate plan
- `src/lib/ingestion/upload-service.ts` — Client-side upload orchestrator

### Decimal.js Usage
- ONLY imported in `src/lib/calculation/decimal-precision.ts`
- Re-exported to consumers: run-calculation.ts, route.ts, intent-executor.ts
- Configuration: precision=20, rounding=ROUND_HALF_EVEN

## 0B: Known Issues Verification

### 1. `/api/platform/tenant-config` — WORKING (conditional)
- Route uses service role client for tenant read (bypasses RLS)
- Auth check: `profile.role !== 'platform'` → 403
- VL Admin profile must have role='platform' to pass
- If role='vl_admin' in profiles: will 403. Must be 'platform'.
- Evidence: Code at `src/app/api/platform/tenant-config/route.ts:33`

### 2. File Upload — WORKING
- Storage bucket: `ingestion-raw`
- VL Admin has full read+write+delete access via RLS policies
- Tenant users scoped to their folder via `storage.foldername(name)`
- Evidence: Agent report on migration 010 policies

### 3. Calculate Pages — TWO EXIST
- `/operate/calculate` — Main calculate interface with DS-007 results
  - Restricted to `['platform', 'admin', 'tenant_admin']`
  - Has period selector, calculate all, export CSV
- `/admin/launch/calculate` — Admin calculation launcher
  - Restricted to `['platform']`
  - Has diagnostics sub-route
- **Action needed:** Not critical to consolidate — both functional

### 4. Persona Switching — WORKING
- `usePersona()` hook exists and works
- `setPersonaOverride(persona)` for demo switching
- sessionStorage key: `vl_persona_override`
- Scope recalculation on persona change with 5-min cache TTL

### 5. Period Creation — NO UI
- API: POST `/api/periods` (manual creation)
- API: POST `/api/periods/create-from-data` (auto from committed_data)
- Auto-creation triggered during calculation flow
- **Action needed:** SQL or API call for BCL periods (mark as tech debt)

## 0C: Meridian Verification

Meridian tenant (Pipeline Test Co):
- Tenant ID: `f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd`
- Rule set: `352f7e6c-413e-4f3b-b70f-678e208e618a`
- Expected: MX$185,063 grand total
- Status: Cannot verify live DB from diagnostic phase. Will verify post-build.
- Last known state: HF-123 Phase 5 completion report confirmed exact match.

## Summary — Blockers for BCL

| Item | Status | Action |
|------|--------|--------|
| Briefing route | NOT FOUND | Create in Phase 5 |
| Persona context | WORKING | Use existing usePersona() |
| Calculate page | WORKING (2 exist) | Use /operate/calculate |
| Plan activation | WORKING | Use `activate: true` param on /api/plan/import |
| Period creation | API only | Use /api/periods POST |
| File upload | WORKING | Use ingestion-raw bucket |
| Tenant creation | WORKING | Use /api/admin/tenants/create |
| decimal.js | WORKING | Centralized in decimal-precision.ts |
| Entity relationships | SCHEMA EXISTS | Will need to populate for BCL team hierarchy |
