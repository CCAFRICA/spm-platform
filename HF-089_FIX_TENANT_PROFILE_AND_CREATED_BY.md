# HF-089: FIX TENANT PROVISIONING PROFILE + SCI CREATED_BY RESOLUTION
## CLT-157 Root Cause: scope_level Column Missing → Profile Not Created → Import 500

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST (MANDATORY)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns
2. `SCHEMA_REFERENCE.md` — actual database schema (profiles table has NO scope_level column)

---

## THE PROBLEM (from Vercel production logs)

Two errors in sequence, both from the same root cause:

### Error 1: Tenant provisioning (POST /api/admin/tenants/create — 201 with warning)
```
Profile creation failed: Could not find the 'scope_level' column of 'profiles' in the schema cache
```
Tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (Meridian Logistics Group) was created but its admin profile was NOT.

### Error 2: Plan import (POST /api/import/sci/execute — 500)
```
No profiles exist in tenant 5035b1e8-0754-4527-b7ec-9f93f85e4c79 — cannot resolve created_by
```
SCI execute needs a profile to set `created_by` on `rule_sets` and `import_batches`. No profile exists because Error 1 prevented creation.

### The Chain
`scope_level` not in database → profile INSERT fails → no tenant profiles → SCI execute cannot resolve `created_by` → 500 on every import for this tenant.

---

## PHASE 0: DIAGNOSTIC

### 0A: Find scope_level reference

```bash
grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | head -20
```

This will show every file that references `scope_level`. The tenant create route is the primary target but there may be others.

### 0B: Find created_by resolution

```bash
grep -rn "created_by\|resolve.*profile\|resolveProfile\|No profiles exist" web/src/app/api/import/sci/ --include="*.ts" | head -20
```

### 0C: Check profiles table schema

Confirm SCHEMA_REFERENCE.md — the profiles table columns are: id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at. NO scope_level.

**Commit:** `HF-089 Phase 0: Diagnostic — scope_level references + created_by resolution path`

---

## PHASE 1: REMOVE scope_level FROM PROFILE CREATION

### 1A: Fix Tenant Provisioning

In the tenant create API route, find the profile INSERT that includes `scope_level` and remove it. The profile should only contain columns that exist in the database.

### 1B: Check for Other scope_level References

If `scope_level` appears in other files (TypeScript types, other routes, UI components), remove those references too. The column does not exist — any code referencing it is wrong.

### 1C: Check database.types.ts

If `database.types.ts` declares `scope_level` on the profiles table, it's out of sync with the actual database. Fix the types file to match SCHEMA_REFERENCE.md.

### Proof Gate 1:
- PG-1: Zero references to `scope_level` in codebase (grep returns 0)
- PG-2: `npm run build` exits 0

**Commit:** `HF-089 Phase 1: Remove scope_level — column does not exist in database (AP-13)`

---

## PHASE 2: FIX CREATED_BY RESOLUTION FOR VL ADMIN

### The Problem

The SCI execute route fails when no profiles exist in the tenant. But VL Admin (platform@vialuce.com) operates inside tenants to import plans and data (Decision 89). VL Admin has a platform-level profile (tenant_id IS NULL), not a tenant-scoped profile (Decision 90).

### The Fix

The `created_by` resolution must fall back to the VL Admin platform profile when no tenant-scoped profiles exist:

1. First, look for a profile in the tenant matching the authenticated user
2. If not found, look for the platform-level VL Admin profile (tenant_id IS NULL, role = 'vl_admin')
3. If neither found, THEN fail with the error

This is not auto-creating a tenant profile (Decision 90 violation). It's using the existing platform profile as the `created_by` author.

```typescript
// Pseudocode for the fix
async function resolveCreatedBy(supabase, tenantId, authUserId) {
  // 1. Try tenant profile
  const { data: tenantProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('auth_user_id', authUserId)
    .single();

  if (tenantProfile) return tenantProfile.id;

  // 2. Fall back to platform profile (VL Admin)
  const { data: platformProfile } = await supabase
    .from('profiles')
    .select('id')
    .is('tenant_id', null)
    .eq('auth_user_id', authUserId)
    .single();

  if (platformProfile) return platformProfile.id;

  // 3. Last resort: any profile for this tenant (tenant admin created during provisioning)
  const { data: anyTenantProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .single();

  if (anyTenantProfile) return anyTenantProfile.id;

  throw new Error(`No profiles exist in tenant ${tenantId} — cannot resolve created_by`);
}
```

### Apply to Both Execute Routes

The fix must be applied to:
- `web/src/app/api/import/sci/execute/route.ts`
- `web/src/app/api/import/sci/execute-bulk/route.ts`

### Proof Gate 2:
- PG-3: SCI execute resolves created_by using VL Admin platform profile when no tenant profiles exist
- PG-4: Both execute routes updated
- PG-5: `npm run build` exits 0

**Commit:** `HF-089 Phase 2: Fix created_by resolution — fall back to VL Admin platform profile (Decision 89)`

---

## PHASE 3: FIX MERIDIAN TENANT — CREATE MISSING PROFILE

The Meridian tenant exists (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`) but has no admin profile. After Phase 1 fixes the profile creation code, we need to create the missing profile.

### Option A: Re-provision through the UI
Delete Meridian tenant and re-create through the provisioning wizard. This tests that Phase 1's fix works.

### Option B: Script
Create `scripts/hf089-fix-meridian.ts` that inserts the missing admin profile for Meridian using the corrected column set (no scope_level).

**Choose Option A** — it tests the fix end-to-end through the browser. Delete Meridian, re-create through the wizard, verify no warning appears.

### Proof Gate 3:
- PG-6: Meridian tenant re-created with zero warnings
- PG-7: Admin profile exists for Meridian tenant
- PG-8: SCI execute does not 500 (test with a small file upload or plan import)

**Commit:** `HF-089 Phase 3: Meridian re-provisioned — profile created successfully`

---

## PHASE 4: COMPLETION REPORT + PR

Write `HF-089_COMPLETION_REPORT.md` at project root.

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-089: Fix scope_level Column + VL Admin created_by Resolution" \
  --body "## Root Cause (CLT-157)

Tenant provisioning tried to write scope_level to profiles table — column doesn't exist (AP-13).
Profile creation silently failed → SCI execute couldn't resolve created_by → 500 on every import.

## Fixes

1. Removed scope_level from profile creation (column does not exist in database)
2. SCI execute created_by resolution falls back to VL Admin platform profile (Decision 89)
3. Applied to both execute and execute-bulk routes

## Verification
- Meridian re-provisioned with zero warnings
- Admin profile created successfully
- Plan import no longer 500s

## Proof Gates: see HF-089_COMPLETION_REPORT.md"
```

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Zero scope_level references | grep returns 0 |
| PG-2 | Build clean | `npm run build` exits 0 |
| PG-3 | created_by resolves for VL Admin | Platform profile fallback works |
| PG-4 | Both execute routes fixed | execute + execute-bulk |
| PG-5 | Build clean | After Phase 2 |
| PG-6 | Meridian re-created | Zero warnings |
| PG-7 | Admin profile exists | Query confirms |
| PG-8 | Import doesn't 500 | Plan upload succeeds |

---

## WHAT NOT TO DO

1. **Do NOT add scope_level to the database.** The column doesn't exist for a reason. Fix the code to match the schema, not the other way around. (AP-13)
2. **Do NOT auto-create VL Admin tenant profiles.** (Decision 90, CC Failure Pattern #30)
3. **Do NOT manually insert profiles via SQL.** (CC Failure Pattern #32). Script or UI only.
4. **Do NOT just fix the profile creation without fixing created_by resolution.** Both must be fixed — otherwise VL Admin still can't import into tenants where the only profile is the VL Admin platform profile.

---

*HF-089 — March 4, 2026*
*"The chain broke at the first link. Fix the link, the chain holds."*
