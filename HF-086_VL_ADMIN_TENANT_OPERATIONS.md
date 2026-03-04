# HF-086: VL ADMIN TENANT OPERATIONS
## Platform Admin Must Import, Calculate, and Operate Inside Any Tenant

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all phases. Commit after each. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/app/api/import/sci/execute/route.ts` — current profile resolution (HF-085)
3. `web/src/contexts/session-context.tsx` — how auth session flows
4. `web/src/contexts/tenant-context.tsx` — how tenant selection works
5. `SCHEMA_REFERENCE.md` — profiles table structure, FK constraints

---

## CONTEXT

The VL Platform Admin (`platform@vialuce.com`) is the account used to onboard customers: log into their tenant, import plan, import data, run calculations, verify results, hand over. This is the production onboarding workflow.

**Current problem:** When VL Admin operates inside a tenant (e.g., Óptica Luminar), write operations fail because:

1. HF-085 resolves `created_by` via `profiles.auth_user_id = authUser.id AND tenant_id = X`
2. VL Admin has NO profile row in tenant-specific profiles
3. Lookup returns null → fallback to raw `authUser.id` → FK violation (not in profiles table)

**The fix must be architectural, not a hack.** The VL Admin will onboard every future customer this way.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**

---

# PHASE 0: UNDERSTAND VL ADMIN AUTH FLOW

### 0A: How does VL Admin enter a tenant?

```bash
echo "=== TENANT SELECTION / SWITCHING ==="
grep -rn "select-tenant\|switchTenant\|setTenant\|activeTenant" \
  web/src/app/ web/src/contexts/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== HOW IS TENANT ID PASSED TO API ROUTES? ==="
grep -rn "tenant_id\|tenantId\|x-tenant-id\|tenant-id" \
  web/src/app/api/import/sci/execute/route.ts | head -10

echo ""
echo "=== VL ADMIN PROFILE ==="
echo "Check: does VL Admin have a platform-level profile (tenant_id IS NULL)?"
echo "Or a profile in a specific tenant?"
```

```sql
-- Run in Supabase:
SELECT id, tenant_id, email, display_name, role, auth_user_id
FROM profiles
WHERE auth_user_id = '5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3'
   OR email = 'platform@vialuce.com';
```

### 0B: How does HF-085's profile resolution work?

```bash
echo "=== CURRENT PROFILE RESOLUTION IN EXECUTE ==="
grep -B 3 -A 10 "callerProfile\|profileId\|resolveProfile\|auth_user_id" \
  web/src/app/api/import/sci/execute/route.ts | head -30

echo ""
echo "=== SAME IN OTHER FIXED ROUTES ==="
grep -B 3 -A 10 "callerProfile\|profileId\|resolvedProfileId\|resolvedUserId" \
  web/src/app/api/plan/import/route.ts \
  web/src/app/api/import/commit/route.ts \
  web/src/app/api/reconciliation/save/route.ts 2>/dev/null | head -40
```

### 0C: What are the FK constraints?

```bash
echo "=== FK CONSTRAINTS ON created_by ==="
grep -rn "created_by\|uploaded_by\|filed_by\|resolved_by\|assigned_by" \
  web/supabase/migrations/ --include="*.sql" | grep -i "references\|foreign" | head -10

echo ""
echo "=== IS created_by NULLABLE? ==="
grep -B 2 -A 2 "created_by" web/supabase/migrations/ --include="*.sql" | grep -i "not null\|nullable\|default" | head -10
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — HF-086
//
// VL ADMIN PROFILE:
// - Has profile in tenant: [which tenant / none]
// - Profile ID: [X]
// - auth_user_id: 5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3
//
// TENANT ID SOURCE IN API ROUTES:
// - How tenantId arrives: [header / body / session / query]
//
// HF-085 RESOLUTION:
// - Query: profiles WHERE auth_user_id = X AND tenant_id = Y
// - Fallback: authUser.id (BROKEN for VL Admin — not in profiles)
//
// FK CONSTRAINTS:
// - created_by → profiles.id: [nullable? which tables?]
//
// DECISION NEEDED:
// [See Phase 1 options]
```

**Commit:** `HF-086 Phase 0: VL Admin auth flow diagnostic`

---

# PHASE 1: ARCHITECTURE DECISION — HOW VL ADMIN OPERATES IN TENANTS

Three options. Pick the one that best fits what Phase 0 reveals:

### Option A: Auto-create VL Admin profile in tenant on first operation

When the SCI execute route (or any write route) detects that the caller has no profile in the target tenant, AND the caller is a platform admin, automatically create a profile row:

```typescript
// If no profile found and user is platform admin:
if (!callerProfile && isPlatformAdmin(authUser)) {
  const { data: newProfile } = await supabase
    .from('profiles')
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      email: authUser.email,
      display_name: 'VL Platform Admin',
      role: 'admin',
      auth_user_id: authUser.id,
    })
    .select('id')
    .single();
  profileId = newProfile.id;
}
```

**Pros:** Clean FK resolution. Profile persists for audit trail. Works for all routes automatically.
**Cons:** Creates profile records in every tenant VL Admin touches.

### Option B: Use the tenant's own admin profile as created_by

When VL Admin operates in a tenant, attribute the operation to the tenant's admin:

```typescript
if (!callerProfile && isPlatformAdmin(authUser)) {
  const { data: tenantAdmin } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .limit(1)
    .single();
  profileId = tenantAdmin.id;
}
```

**Pros:** No extra profile records. Tenant admin "owns" the data.
**Cons:** Misleading audit trail — shows tenant admin did something they didn't.

### Option C: Make created_by nullable for system operations

Allow `created_by = NULL` for platform-initiated operations:

```typescript
if (!callerProfile && isPlatformAdmin(authUser)) {
  profileId = null; // System operation
}
```

**Pros:** Honest — clearly marks platform operations.
**Cons:** Requires ALTER TABLE to drop NOT NULL constraints. May break UI queries that expect created_by.

### RECOMMENDED: Option A

Auto-create a VL Admin profile in the tenant. It's the cleanest solution:
- FK constraints satisfied
- Audit trail is accurate (VL Admin did the operation)
- Works for all routes without special cases
- The profile is created once per tenant, not per operation

### Implementation

```typescript
// Helper function — use in ALL routes that need created_by
async function resolveProfileId(
  supabase: SupabaseClient,
  authUser: { id: string; email: string },
  tenantId: string
): Promise<string> {
  // 1. Try to find existing profile
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing) return existing.id;

  // 2. Check if platform admin (has profile with no tenant or in platform tenant)
  const { data: platformProfile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', authUser.id)
    .is('tenant_id', null)
    .maybeSingle();

  // Also check if they have a vialuce.com email as fallback
  const isPlatformAdmin = platformProfile?.role === 'admin' 
    || authUser.email?.endsWith('@vialuce.com')
    || authUser.email?.endsWith('@vialuce.ai');

  if (!isPlatformAdmin) {
    // Not a platform admin and no profile in tenant — this shouldn't happen
    throw new Error(`No profile found for user ${authUser.id} in tenant ${tenantId}`);
  }

  // 3. Auto-create profile for platform admin in this tenant
  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      tenant_id: tenantId,
      email: authUser.email,
      display_name: 'VL Platform Admin',
      role: 'admin',
      auth_user_id: authUser.id,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create platform admin profile: ${error.message}`);

  return newProfile.id;
}
```

**Place this in:** `web/src/lib/auth/resolve-profile.ts` (new file)

**Proof gate PG-01:** Architecture decision documented. Helper function created.

**Commit:** `HF-086 Phase 1: resolveProfileId helper — auto-create VL Admin profile in tenant`

---

# PHASE 2: APPLY TO ALL WRITE ROUTES

Replace HF-085's inline profile resolution with the shared helper in ALL routes:

```bash
echo "=== ALL ROUTES WITH PROFILE RESOLUTION ==="
grep -rln "callerProfile\|resolvedProfileId\|resolvedUserId\|profileId.*fallback\|authUser.id" \
  web/src/app/api/ --include="*.ts" | sort
```

For each route:
1. Import `resolveProfileId` from the new helper
2. Replace the inline lookup + fallback with `const profileId = await resolveProfileId(supabase, authUser, tenantId)`
3. Use `profileId` for all FK-constrained columns

Routes to update (from HF-085 audit):
- `/api/import/sci/execute` — `created_by` on rule_sets
- `/api/plan/import` — `created_by` on rule_sets
- `/api/reconciliation/save` — `created_by` on reconciliation_sessions
- `/api/import/commit` — `uploaded_by` on import_batches

**Proof gate PG-02:** All routes use shared `resolveProfileId`. Zero inline profile lookups remain.

**Commit:** `HF-086 Phase 2: All write routes use resolveProfileId helper`

---

# PHASE 3: BUILD + DEPLOY TO PRODUCTION

### 3A: Build

```bash
cd web && rm -rf .next && npm run build
```

### 3B: Push + merge

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "HF-086: VL Admin tenant operations — auto-create profile, shared resolveProfileId helper"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-086: VL Admin can operate inside any tenant (plan import, calculate)" \
  --body "## Platform Admin Tenant Operations

VL Admin (platform@vialuce.com) could not import plans or write data inside tenant contexts
because no profile existed in the target tenant → FK violation on created_by.

### Fix
- New shared helper: resolveProfileId()
- Looks up existing profile by auth_user_id + tenant_id
- If platform admin with no tenant profile: auto-creates one
- Applied to all 4 write routes (SCI execute, plan import, commit, reconciliation)

### Architecture Decision
Option A: Auto-create VL Admin profile in tenant on first operation.
Clean FK resolution, accurate audit trail, works for all routes.

**Must deploy to production — blocks all plan imports.**"

gh pr merge --squash
```

### 3C: Wait for Vercel deploy

**Proof gate PG-03:** Build clean. PR merged to main. Vercel deploying.

**Commit:** `HF-086 Phase 3: Deployed to production`

---

# PHASE 4: COMPLETION REPORT

```markdown
# HF-086 COMPLETION REPORT
## VL Admin Tenant Operations

### Problem
VL Platform Admin cannot write data (plan import, calculation, etc.) inside tenant contexts
because no profile exists in the target tenant → FK violation on created_by.

### Architecture Decision
Option A: Auto-create VL Admin profile in tenant on first write operation.

### Implementation
- New file: `web/src/lib/auth/resolve-profile.ts`
- Shared `resolveProfileId(supabase, authUser, tenantId)` helper
- Logic: find existing profile → if platform admin with no profile → auto-create → return profile.id
- Platform admin detection: email @vialuce.com/@vialuce.ai OR platform-level profile role

### Routes Updated
| Route | Column | Before | After |
|---|---|---|---|
| /api/import/sci/execute | created_by | inline lookup + authUser.id fallback | resolveProfileId() |
| /api/plan/import | created_by | inline lookup + fallback | resolveProfileId() |
| /api/reconciliation/save | created_by | inline lookup + fallback | resolveProfileId() |
| /api/import/commit | uploaded_by | inline lookup + fallback | resolveProfileId() |

### Files Changed
- `web/src/lib/auth/resolve-profile.ts` — NEW: shared helper
- `web/src/app/api/import/sci/execute/route.ts` — use helper
- `web/src/app/api/plan/import/route.ts` — use helper
- `web/src/app/api/reconciliation/save/route.ts` — use helper
- `web/src/app/api/import/commit/route.ts` — use helper

### Deployed
PR #[X] merged to main.
```

**Commit:** `HF-086 Phase 4: Completion report`

---

## ANTI-PATTERNS

| Don't | Do |
|-------|-----|
| Hardcode VL Admin's UUID | Detect platform admin by email domain or platform-level profile |
| Create profile in every route independently | One shared helper, imported everywhere |
| Use tenant admin's profile as created_by | Misleading audit trail — VL Admin should own their operations |
| Make created_by nullable | Breaks too many downstream queries |
| Skip the auto-create and just fallback | The fallback IS the bug — raw authUser.id fails FK |
