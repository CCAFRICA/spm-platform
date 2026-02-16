# HF-027 Completion Report

## Summary

Restored the platform user profile after ghost tenant cleanup in HF-026 cascade-deleted it. Fixed all 7 demo user passwords and verified full authentication pipeline.

## Root Cause

HF-026 deleted the ghost tenant `a0000000-...` (RetailCo MX). The platform user's profile had `tenant_id` pointing to that tenant with `ON DELETE CASCADE`, which cascade-deleted the profile row. Result: "Account found but profile is missing" 406 error on login.

## Phases Completed

### Phase 0: Diagnostic
- Found platform auth user exists (`5fb5f934-...`) but has NO profile row
- Discovered actual table columns differ from TypeScript types (no `scope_level`, `scope_override`, `settings`, `status`)
- Confirmed 6 demo user profiles exist with correct `auth_user_id` values
- Confirmed login query uses `auth_user_id`, not `id`

### Phase 1: Restore Platform Profile
- **Schema constraint**: `profiles.tenant_id` is `NOT NULL` with FK to `tenants`
- **Cannot alter schema**: No Supabase Dashboard access or DB credentials available programmatically
- **Pragmatic approach**: Inserted profile with `tenant_id` anchored to Optica Luminar
- App code detects VL admin by `role='vl_admin'` + `capabilities.includes('manage_tenants')`, sets `tenantId: null` on User object regardless of DB value
- Created migration `005_platform_user_nullable_tenant.sql` for ideal fix (nullable tenant_id + VL admin RLS policies)

**Platform profile inserted:**
- `auth_user_id`: `5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3`
- `email`: `platform@vialuce.com`
- `role`: `vl_admin`
- `capabilities`: `manage_tenants, view_all, manage_users, run_calculations, manage_rule_sets, approve_results, export_data`
- `tenant_id`: `a1b2c3d4-...` (Optica Luminar, anchor only)

### Phase 2: Verify Login Code Path
Confirmed the full login pipeline:
1. `signInWithEmail()` → Supabase Auth → JWT
2. `fetchCurrentProfile()` → `profiles.select('*').eq('auth_user_id', user.id).single()`
3. RLS policy passes (profile.tenant_id matches subquery result)
4. `mapProfileToUser()` → detects `vl_admin` → returns `VLAdminUser` with `tenantId: null`
5. Routes to `/select-tenant`

### Phase 3: Verify All Demo Users
- All 6 demo users had `Identities: none` (created via admin API)
- Reset all passwords to `demo-password-VL1` via `auth.admin.updateUserById()`
- **7/7 users authenticate, fetch profiles, get correct role detection**

### Phase 4: Automated CLT
- Created `clt-hf027-verify.ts` — **31/31 gates pass (100%)**
- Tests: code path analysis, database state, live authentication, migration existence

## Files Created

| File | Purpose |
|------|---------|
| `web/supabase/migrations/005_platform_user_nullable_tenant.sql` | Ideal schema fix (run in Dashboard) |
| `web/scripts/hf027-diagnostic.ts` | Phase 0 diagnostic |
| `web/scripts/hf027-diagnostic2.ts` | Phase 0 auth_user_id check |
| `web/scripts/hf027-diagnostic3.ts` | Phase 0 actual columns check |
| `web/scripts/hf027-phase1-restore-profiles.ts` | Phase 1 profile insertion |
| `web/scripts/hf027-phase3-auth-verify.ts` | Phase 3 auth verification |
| `web/scripts/hf027-phase3c-reset-passwords.ts` | Phase 3 password reset |
| `web/scripts/clt-hf027-verify.ts` | Phase 4 CLT verification |

## Known Limitations

### Tenant Selector (select-tenant page)
The platform admin currently sees only Optica Luminar in the tenant selector due to RLS policy:
```sql
-- Current policy only shows tenants where user has a profile
tenants_select_own: id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
```

**Fix**: Apply migration `005_platform_user_nullable_tenant.sql` in the Supabase Dashboard SQL Editor. This adds:
1. `ALTER TABLE profiles ALTER COLUMN tenant_id DROP NOT NULL`
2. `profiles_select_own` policy (users can always read own profile)
3. `tenants_select_vl_admin` policy (VL admins see all tenants)
4. `profiles_select_vl_admin` policy (VL admins see all profiles)

After applying, update the platform profile: `UPDATE profiles SET tenant_id = NULL WHERE role = 'vl_admin';`

### TypeScript Types Out of Sync
`database.types.ts` Profile Row includes columns not in actual DB:
- `scope_level`, `scope_override`, `settings`, `status`, `entity_id`

These don't affect login (fetchCurrentProfile only uses existing columns) but should be synced when regenerating types.

## Verification

```
═══════════════════════════════════════
  TOTAL: 31 gates
  PASSED: 31
  FAILED: 0
  SCORE: 100%
═══════════════════════════════════════
```
