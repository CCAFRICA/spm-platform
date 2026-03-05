# HF-089: Fix Tenant Provisioning Profile + SCI created_by Resolution
## Completion Report — 2026-03-04

### Root Cause (CLT-157)
Tenant provisioning wrote `scope_level` to the profiles table — column does not exist (AP-13).
Profile INSERT silently failed with a Supabase schema cache error. Without a profile,
SCI execute could not resolve `created_by` and returned 500 on every import.

**The chain:** scope_level not in DB -> profile INSERT fails -> no tenant profiles -> SCI execute cannot resolve created_by -> 500

### Affected Tenant
Meridian Logistics Group (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`) — created but admin profile missing.

---

### Phase 1: Remove scope_level (AP-13)
**Files fixed:**
- `api/admin/tenants/create/route.ts` — removed `scope_level`, `status`, `settings` from profile INSERT
- `api/auth/signup/route.ts` — same cleanup
- `api/platform/users/invite/route.ts` — same cleanup
- `scripts/create-demo-users.ts` — removed `scope_level` from data and INSERT
- `lib/supabase/database.types.ts` — removed phantom columns (`scope_level`, `scope_override`, `status`, `settings`) to match SCHEMA_REFERENCE.md

**Proof gates:**
- PG-1: `grep scope_level` returns zero hits
- PG-2: `npm run build` exits 0

### Phase 2: Fix created_by resolution (Decision 89)
**File fixed:** `lib/auth/resolve-profile.ts`

Resolution order (new):
1. Profile by auth_user_id + tenant_id (user has tenant-scoped profile)
2. **NEW: Platform profile (tenant_id IS NULL)** — VL Admin platform profile (Decision 89)
3. Tenant admin profile (borrow for created_by)
4. Any profile in tenant (last resort)
5. Throw error

**Applied to:** Both `execute/route.ts` and `execute-bulk/route.ts` via shared `resolveProfileId`.

**Proof gates:**
- PG-3: Platform profile fallback added (step 2)
- PG-4: Both execute routes use resolveProfileId (confirmed)
- PG-5: `npm run build` exits 0

### Phase 3: Meridian Re-provisioning
Requires browser action: delete Meridian tenant, re-create via provisioning wizard.
Code fix ensures profile will be created successfully on next provisioning.

**Proof gates (manual):**
- PG-6: Re-create Meridian with zero warnings
- PG-7: Admin profile exists (query profiles table)
- PG-8: Plan import succeeds without 500

---

### Summary
| Phase | Change | Impact |
|-------|--------|--------|
| 1 | Remove scope_level from all profile creation paths | Fixes profile creation for all new tenants |
| 2 | Add platform profile fallback to resolveProfileId | VL Admin can import into tenants even without tenant-scoped profiles |
| 3 | Re-provision Meridian | Fixes the specific broken tenant |

### Anti-patterns Avoided
- AP-13: Did NOT add scope_level to database (fixed code to match schema)
- Decision 90: Did NOT auto-create VL Admin tenant profiles
- CC Failure Pattern #32: Did NOT manually insert profiles via SQL
