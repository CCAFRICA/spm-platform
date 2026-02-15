# HF-023 Completion Report
## DEMO TENANT SEED + VL ADMIN ROUTING FIX

**Date:** 2026-02-15
**Branch:** dev
**Commits:** `e82e01e` (Phase 1), `204638b` (Phase 2)

---

## Phase 1: Auth Enforcement + VL Admin Routing

### 1A: Middleware Auth Enforcement (`web/src/middleware.ts`)
- **Before:** Middleware only refreshed Supabase session; no auth enforcement
- **After:** Unauthenticated users redirected to `/login`; authenticated users on `/login` redirected away (platform admins to `/select-tenant`, others to `/`)
- **Proof:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns `307`

### 1B: VL Admin Detection (`web/src/contexts/auth-context.tsx`)
- **Before:** `mapProfileToUser()` only checked `role === 'vl_admin'`
- **After:** Also checks `capabilities.includes('manage_tenants')`
- **Why:** Seed data has `role: 'admin'` with `manage_tenants` capability (not `role: 'vl_admin'`)

### 1C: Tenant Context Supabase Fallback (`web/src/contexts/tenant-context.tsx`)
- **Before:** `loadTenantConfig()` only tried static JSON imports (slug-based); UUIDs from Supabase failed silently
- **After:** Falls back to Supabase `tenants` table (by ID, then by slug); cookie-based tenant selection alongside sessionStorage
- **Why:** Static JSON configs use slugs (`retailco`), Supabase uses UUIDs (`a0000000-...`)

### 1D: Select-Tenant Page (`web/src/app/select-tenant/page.tsx`)
- **Before:** Only loaded tenants from static JSON registry
- **After:** Also queries Supabase `tenants` table, merges and deduplicates

---

## Phase 2: Optica Luminar Demo Tenant Seed

### Seed Script: `web/scripts/seed-optica-luminar.ts`
**Idempotent** — safe to re-run via `npx tsx scripts/seed-optica-luminar.ts`

| Layer | Count | Detail |
|-------|-------|--------|
| Tenant | 1 | Optica Luminar (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`) |
| Auth Users | 3 | admin, gerente, vendedor `@opticaluminar.mx` |
| Profiles | 3 | Laura Mendez (admin), Roberto Castillo (manager), Sofia Navarro (viewer) |
| Entities | 22 | 1 org (Optica Luminar SA) + 3 zones (CDMX, MTY, South) + 6 stores + 12 individuals |
| Relationships | 21 | Full org → zone → store → individual hierarchy |
| Rule Set | 1 | Plan de Comisiones with 6 components, 2 variants (certificado/no_certificado) |
| Assignments | 12 | All 12 individuals assigned to rule set |
| Period | 1 | Enero 2024 (closed) |
| Committed Data | 36 | 18 sales records + 18 individual metrics |
| Calc Batch | 1 | APPROVED lifecycle state |
| Calc Results | 12 | Component breakdowns per individual |
| Outcomes | 12 | Entity period outcomes with total payouts |

### Auth Credentials
| Email | Password | Role |
|-------|----------|------|
| `admin@opticaluminar.mx` | `demo-password-OL1` | Tenant Admin |
| `gerente@opticaluminar.mx` | `demo-password-OL2` | Manager |
| `vendedor@opticaluminar.mx` | `demo-password-OL3` | Sales Rep |

### Platform Admin
| Email | Password | Capabilities |
|-------|----------|-------------|
| `admin@vialuce.com` | (existing) | `manage_tenants` — routes to /select-tenant |

---

## Phase 3: Verification Results

All 13 proof gates passed:

```
  PASS  G1 Tenant: Optica Luminar
  PASS  G2 Auth Users: 3 users
  PASS  G3 Profiles: 3 profiles: Laura Mendez, Roberto Castillo, Sofia Navarro
  PASS  G4 Entities: 22 entities (4 org, 6 location, 12 individual)
  PASS  G5 Relationships: 21 relationships
  PASS  G6 Rule Set: Plan de Comisiones Optica Luminar 2024 with 6 components
  PASS  G7 Assignments: 12 assignments
  PASS  G8 Period: Enero 2024 (closed)
  PASS  G9 Committed Data: 36 rows
  PASS  G10 Calc Batch: APPROVED
  PASS  G11 Calc Results: 12 results
  PASS  G12 Outcomes: 12 outcomes
  PASS  G13 Platform Admin: VL Platform Admin has manage_tenants
```

### Build Verification
- `npm run build` — clean pass, zero errors
- `localhost:3000` — returns HTTP 307 (redirect to /login), confirming auth enforcement
- Zero 400 errors from null tenant_id (the root cause of the original bug)

---

## Root Cause Analysis

**Original bug:** VL Platform Admin landing on home dashboard → 400 flood

**Chain of failure:**
1. Middleware didn't enforce authentication → allowed access to all routes
2. `mapProfileToUser()` checked only `role === 'vl_admin'` but seed has `role: 'admin'` with `manage_tenants` capability → platform admin classified as regular TenantUser
3. TenantUser with `tenantId: null` triggered Supabase queries with null tenant_id → 400 errors
4. `loadTenantConfig()` only tried static JSON (slug-based) → failed for UUID-based tenant IDs from Supabase

**Fix:** Four-layer defense:
1. Middleware enforces auth and routes platform admins to /select-tenant
2. Auth context detects platform admin by capability OR role
3. Tenant context loads config from Supabase as fallback
4. Auth shell guards against null tenant rendering

---

## Files Modified

| File | Change |
|------|--------|
| `web/src/middleware.ts` | Complete rewrite: auth enforcement + routing |
| `web/src/contexts/auth-context.tsx` | VL Admin detection by capability |
| `web/src/contexts/tenant-context.tsx` | Supabase fallback + cookie storage |
| `web/src/app/select-tenant/page.tsx` | Supabase tenant loading |
| `web/scripts/seed-optica-luminar.ts` | NEW: Optica Luminar seed script |
| `web/scripts/verify-seed.ts` | NEW: Verification script |
