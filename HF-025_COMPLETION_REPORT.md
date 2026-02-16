# HF-025 Completion Report
## TENANT PICKER CLEANUP AND OPTICA LUMINAR SURFACE

**Date:** 2026-02-15
**Branch:** dev
**Commits:** `001b2b2` (Phase 1), `b351c26` (Phase 2), `09ac798` (Phase 3)

---

## Issues Addressed

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | Optica Luminar not visible on tenant picker | Page loaded from static JSON registry (which had techcorp, restaurantmx, retailco, frmx-demo — none in Supabase) | Rewrote select-tenant to load ONLY from Supabase `tenants` table |
| 2 | Legacy static tenants cause 400 floods | Static JSON tenants had slugs not matching any Supabase UUID | Removed all static JSON registry dependencies |
| 3 | Stale tenant branding in nav | Navbar/Sidebar already read from tenant context correctly | Tenant-switcher rewritten to "Switch Organization" redirect |
| 4 | Customer Launch banner is dead-end | Banner linked to non-existent admin wizard | Removed entirely — "Create New Tenant" card links to /admin/tenants/new |

---

## Phase Summary

### Phase 1: Tenant Picker — Supabase Only (`001b2b2`)

- **`select-tenant/page.tsx`**: Complete rewrite
  - Removed all imports from `tenant-registry-service`
  - Loads tenants from `supabase.from('tenants').select(...).order('name')`
  - For each tenant: fetches entity count + latest calculation batch lifecycle state
  - Shows industry icon, country flag, entity count, lifecycle badge, last activity
  - "Create New Tenant" card (dashed border) links to `/admin/tenants/new`
  - Removed Customer Launch banner

- **`tenant-context.tsx`**: Removed static JSON loading
  - VL Admin no longer loads from `@/data/tenants/index.json`
  - `availableTenants` changed from `useState` to constant empty array
  - Tenant config still loaded from static JSON or Supabase fallback (per-tenant, unchanged)

### Phase 2: Dynamic Tenant Branding in Nav (`b351c26`)

- **`tenant-switcher.tsx`**: Simplified
  - No longer lists tenants from (empty) context
  - Shows current tenant name + "Switch Organization" → `/select-tenant`
  - Sign Out button preserved
  - Only renders for VL Admin users

### Phase 3: Null Tenant Guards — Zero 400 Errors (`09ac798`)

- **`lib/supabase/client.ts`**: Added `requireTenantId()` guard
  - TypeScript assertion function (`asserts tenantId is string`)
  - Throws with descriptive error if null/undefined/empty string
  - Exported for use across all service files

- **14 service functions guarded** across 5 files:
  - `calculation-service.ts`: `createCalculationBatch`, `writeCalculationResults`, `writeCalculationTraces`, `materializeEntityPeriodOutcomes`
  - `entity-service.ts`: `createEntity`, `materializePeriodEntityState`, `createRelationship`, `materializeProfileScope`, `createReassignmentEvent`
  - `data-service.ts`: `createImportBatch`, `writeCommittedData`, `writeAuditLog`
  - `rule-set-service.ts`: `assignRuleSet`
  - `calculation-lifecycle-service.ts`: `writeLifecycleAuditLog`

- **`investigate/trace/[entityId]/page.tsx`**: Fixed critical bug
  - Was: `const tenantId = currentTenant?.id || ''` (empty string bypasses Supabase guards)
  - Now: `const tenantId = currentTenant?.id` (undefined correctly triggers `if (!tenantId) return`)

---

## Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | select-tenant loads from Supabase only | PASS | Zero `tenant-registry` imports in page |
| 2 | No static JSON in tenant context | PASS | Zero `index.json`/`getMergedTenants` references |
| 3 | Tenant switcher uses redirect pattern | PASS | "Switch Organization" → `/select-tenant` |
| 4 | requireTenantId guard exists | PASS | Exported assertion function in client.ts |
| 5 | 14 write operations guarded | PASS | 15 `requireTenantId(` calls across `src/lib/` |
| 6 | Trace page no empty-string fallback | PASS | Zero `tenantId.*\|\| ''` matches |
| 7 | Build passes with zero errors | PASS | Clean `npm run build` |
| 8 | Login page responds (200) | PASS | `curl localhost:3000/login → 200` |
| 9 | Health endpoint responds | PASS | `anon_key_valid_jwt: true` |
| 10 | Dev server runs | PASS | `localhost:3000 → 307` (correct auth redirect) |

---

## Files Modified

| File | Change |
|------|--------|
| `web/src/app/select-tenant/page.tsx` | Complete rewrite — Supabase only |
| `web/src/contexts/tenant-context.tsx` | Removed static JSON loading |
| `web/src/components/tenant/tenant-switcher.tsx` | Simplified to redirect pattern |
| `web/src/lib/supabase/client.ts` | Added `requireTenantId()` guard |
| `web/src/lib/supabase/calculation-service.ts` | Guard on 4 write functions |
| `web/src/lib/supabase/entity-service.ts` | Guard on 5 write functions |
| `web/src/lib/supabase/data-service.ts` | Guard on 3 write functions |
| `web/src/lib/supabase/rule-set-service.ts` | Guard on 1 write function |
| `web/src/lib/calculation/calculation-lifecycle-service.ts` | Guard on 1 write function |
| `web/src/app/investigate/trace/[entityId]/page.tsx` | Fixed `|| ''` null bypass |

---

## Architecture Notes

### Tenant Loading Flow (After HF-025)

```
VL Admin logs in
  → middleware redirects to /select-tenant
  → select-tenant page queries Supabase tenants table directly
  → user clicks tenant card
  → setTenant(id) loads config (static JSON or Supabase fallback)
  → sessionStorage + cookie store selection
  → router.push('/')

Tenant Admin logs in
  → auth-context derives tenantId from profile
  → tenant-context loads config automatically
  → no select-tenant page needed
```

### Null Tenant Guard Strategy

```
Layer 1: auth-shell.tsx       → Redirects VL Admin without tenant to /select-tenant
Layer 2: Page useEffect        → Early return if !currentTenant or !currentTenant?.id
Layer 3: requireTenantId()     → Throws if service called with null/empty tenantId
```
