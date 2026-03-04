# OB-151: SCI PLAN IMPORT — END TO END ON PRODUCTION
## The User Must See "Plan Imported Successfully" on vialuce.ai

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — EVERY FILE, NO EXCEPTIONS

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/components/sci/SCIExecution.tsx` — HF-087 modified this. IT IS NOT WORKING.
3. `web/src/components/sci/ExecutionProgress.tsx` — HF-087 modified this. IT IS NOT WORKING.
4. `web/src/lib/auth/resolve-profile.ts` — HF-086 created this. IT BREAKS VL ADMIN.
5. `web/src/app/api/import/sci/execute/route.ts` — the server route (this WORKS)
6. `web/src/contexts/session-context.tsx` — how auth session flows
7. `web/src/app/(authenticated)/select-tenant/page.tsx` — or wherever tenant selection lives
8. `web/src/app/api/platform/observatory/route.ts` — Observatory API (returns 403 for VL Admin)
9. `SCHEMA_REFERENCE.md`

**Read ALL files completely before writing ANY code.**

---

## CONTEXT — WHAT IS BROKEN AND WHY

### The Server Works
Vercel production logs prove the SCI execute route saves plans successfully:
```
[SCI Execute] Plan saved: Optometrist Incentive Plan (03cab415-...), 7 components
```

The server-side plan interpretation — PPTX → AI → 7 components with matrices/tiers/rates → write to Supabase — works correctly on production. This is NOT the problem.

### Problem 1: The User Sees Failure (HF-087 did not fix this)
HF-087 was supposed to fix the client-side fetch timeout. It did not work. After HF-087:
- User still sees "Import partially complete — 0 of 1 succeeded"
- User still sees "Failed to fetch"
- The `fetchWithTimeout()` wrapper with 300s AbortController is NOT keeping the connection alive
- The recovery check (`plan-readiness` poll) fires but does NOT update the UI to show success
- The duplicate guard does NOT prevent double execution — two rule_sets are created every time

**Files:** `web/src/components/sci/SCIExecution.tsx` lines 132, 158 and `web/src/components/sci/ExecutionProgress.tsx`

### Problem 2: VL Admin Cannot See Tenants (HF-086 caused this)
HF-086 auto-creates a tenant-scoped profile for VL Admin (`role: admin`) when they first write data in a tenant. This second profile breaks the Platform Observatory and tenant selection:
- Tenant Fleet shows (0)
- select-tenant page shows no tenants
- VL Admin has TWO profiles: original (`tenant_id: null, role: vl_admin`) + auto-created (`tenant_id: optica, role: admin`)
- The same breakage occurred earlier when a manual SQL insert created a tenant-scoped profile — deleting it restored VL Admin

The auto-create approach is architecturally wrong. A platform admin must NOT get tenant-scoped profiles.

### Problem 3: Duplicate Rule Sets Created Every Import
Every plan import creates TWO rule_sets because the execute fires twice. HF-087's `useRef` guard is not preventing this.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**
5. **Do NOT modify the calculation engine, derivation rules, or component resolution.**
6. **PROOF IS BROWSER BEHAVIOR, NOT BUILD CLEAN.** Every phase that changes UI must include console.log evidence of the actual browser behavior.

---

# PHASE 0: DIAGNOSTIC — UNDERSTAND WHY HF-087 FAILED

### 0A: Trace the SCI execution flow

```bash
echo "============================================"
echo "OB-151 PHASE 0: WHY DOES THE USER SEE FAILURE?"
echo "============================================"

echo ""
echo "=== 0A: THE EXECUTION COMPONENT ==="
cat -n web/src/components/sci/SCIExecution.tsx

echo ""
echo "=== 0B: THE PROGRESS COMPONENT ==="
cat -n web/src/components/sci/ExecutionProgress.tsx

echo ""
echo "=== 0C: fetchWithTimeout IMPLEMENTATION ==="
grep -n "fetchWithTimeout\|AbortController\|signal\|timeout\|setTimeout" \
  web/src/components/sci/SCIExecution.tsx

echo ""
echo "=== 0D: RECOVERY CHECK IMPLEMENTATION ==="
grep -n "plan-readiness\|recovery\|checkImport\|planExists\|serverSucceeded" \
  web/src/components/sci/SCIExecution.tsx

echo ""
echo "=== 0E: DUPLICATE GUARD ==="
grep -n "useRef\|isRetrying\|isExecuting\|executionRef\|guardRef" \
  web/src/components/sci/SCIExecution.tsx

echo ""
echo "=== 0F: HOW IS EXECUTE TRIGGERED? ==="
grep -n "onClick\|onSubmit\|handleExecute\|handleImport\|startExecution\|confirmAll" \
  web/src/components/sci/SCIExecution.tsx

echo ""
echo "=== 0G: STATE MANAGEMENT AFTER EXECUTE ==="
grep -n "setStatus\|setResult\|setError\|setState\|setSuccess\|setFailed" \
  web/src/components/sci/SCIExecution.tsx
```

### 0B: Trace the VL Admin auth flow

```bash
echo ""
echo "============================================"
echo "WHY DOES VL ADMIN SEE 0 TENANTS?"
echo "============================================"

echo ""
echo "=== 0H: SELECT-TENANT PAGE ==="
find web/src -name "*.tsx" -path "*select-tenant*" -exec cat -n {} \;

echo ""
echo "=== 0I: OBSERVATORY API ==="
cat -n web/src/app/api/platform/observatory/route.ts 2>/dev/null || echo "NOT FOUND"

echo ""
echo "=== 0J: HOW DOES TENANT LIST GET POPULATED? ==="
grep -rn "tenants.*select\|from.*tenants\|tenant.*list\|allTenants\|fetchTenants" \
  web/src/app/ web/src/components/ web/src/contexts/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0K: resolveProfileId — THE AUTO-CREATE LOGIC ==="
cat -n web/src/lib/auth/resolve-profile.ts

echo ""
echo "=== 0L: RLS POLICIES ON TENANTS AND PROFILES ==="
grep -rn "tenants\|profiles" web/supabase/migrations/ --include="*.sql" | grep -i "policy\|rls\|enable" | head -20

echo ""
echo "=== 0M: VL ADMIN PROFILES IN DATABASE ==="
echo "Run this SQL to verify current state:"
echo "SELECT id, tenant_id, email, role FROM profiles WHERE email = 'platform@vialuce.com';"
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — OB-151
//
// === CLIENT-SIDE FAILURE ===
// fetchWithTimeout exists: YES/NO
// AbortController created: YES/NO
// Signal passed to fetch: YES/NO
// Timeout duration: [X] ms
// WHY CONNECTION STILL DROPS: [exact reason]
//
// Recovery check fires: YES/NO
// Recovery check detects plan: YES/NO
// Recovery check updates UI: YES/NO
// WHY UI STILL SHOWS FAILURE: [exact reason]
//
// Duplicate guard exists: YES/NO
// Guard prevents double execution: YES/NO
// WHY TWO EXECUTES FIRE: [exact reason — React strict mode? useEffect? button click?]
//
// === VL ADMIN TENANT VISIBILITY ===
// select-tenant queries tenants via: [describe the query]
// Query filters by: [profile.tenant_id / role / RLS / etc.]
// With two profiles, query returns: [what]
// WHY TENANT FLEET IS EMPTY: [exact reason]
//
// resolveProfileId auto-creates profile: YES
// This breaks tenant visibility because: [exact reason]
//
// === ROOT CAUSES ===
// 1. Client fetch fails because: [X]
// 2. Recovery doesn't update UI because: [X]
// 3. Duplicate execution because: [X]
// 4. Tenant fleet empty because: [X]
```

**Proof gate PG-00:** All four root causes identified with exact file:line evidence.

**Commit:** `OB-151 Phase 0: Diagnostic — four root causes identified`

---

# PHASE 1: FIX VL ADMIN TENANT VISIBILITY

### The Problem
HF-086's `resolveProfileId()` auto-creates a tenant-scoped profile for VL Admin. This second profile breaks the platform auth model.

### The Fix: Option B — Use Tenant Admin's Profile for created_by

When VL Admin operates in a tenant, attribute the write operation to the tenant's own admin. Do NOT create a new profile.

```typescript
// web/src/lib/auth/resolve-profile.ts — REWRITE

export async function resolveProfileId(
  supabase: SupabaseClient,
  authUser: { id: string; email: string },
  tenantId: string
): Promise<string> {
  // 1. Try to find caller's existing profile in this tenant
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing) return existing.id;

  // 2. Check if caller is platform admin
  const isPlatformAdmin = 
    authUser.email?.endsWith('@vialuce.com') || 
    authUser.email?.endsWith('@vialuce.ai');

  if (!isPlatformAdmin) {
    // Not platform admin and no profile — shouldn't happen
    throw new Error(`No profile found for user ${authUser.id} in tenant ${tenantId}`);
  }

  // 3. Platform admin: use the tenant's own admin profile
  // DO NOT create a new profile — it breaks platform auth
  const { data: tenantAdmin } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (tenantAdmin) return tenantAdmin.id;

  // 4. No tenant admin exists — use any profile in the tenant
  const { data: anyProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (anyProfile) return anyProfile.id;

  throw new Error(`No profiles exist in tenant ${tenantId} — cannot resolve created_by`);
}
```

### Delete the auto-created profile

The HF-086 auto-created profile must be removed from the database. Add a migration or one-time cleanup:

```bash
echo "=== CHECK FOR AUTO-CREATED VL ADMIN PROFILES ==="
echo "Run this SQL:"
echo "DELETE FROM profiles WHERE email = 'platform@vialuce.com' AND tenant_id IS NOT NULL;"
echo ""
echo "Then verify:"
echo "SELECT id, tenant_id, role FROM profiles WHERE email = 'platform@vialuce.com';"
echo "Should return exactly ONE row with tenant_id = NULL and role = vl_admin"
```

**IMPORTANT:** This SQL must be run by Andrew in Supabase SQL Editor. CC cannot run it. CC must PRINT the SQL and ask Andrew to execute it. Do NOT skip this step.

### Verify tenant visibility is restored

After the profile is deleted and the code is updated:
1. Load `localhost:3000/select-tenant` as VL Admin
2. Verify tenants are visible
3. If they are NOT visible, the problem is elsewhere — diagnose further before proceeding

**Proof gate PG-01:** 
- `resolveProfileId` rewritten to use tenant admin's profile (no auto-create)
- SQL printed for Andrew to delete auto-created profile
- Tenant visibility verified on localhost (console screenshot)

**Commit:** `OB-151 Phase 1: Fix VL Admin — use tenant admin profile, no auto-create`

---

# PHASE 2: FIX CLIENT-SIDE FETCH — MAKE IT ACTUALLY WORK

Based on Phase 0 findings, fix ALL of these:

### 2A: The fetch must stay alive for 300 seconds

Read the Phase 0 diagnostic to understand why HF-087's `fetchWithTimeout` isn't working. Common reasons:
- AbortController created but signal not passed to fetch
- Timeout set in wrong units (seconds vs milliseconds)
- A wrapper or interceptor overrides the signal
- The fetch is inside a Promise.race that has its own shorter timeout
- Vercel's edge proxy closes idle connections regardless of client timeout

Fix the actual root cause. Do not add another layer — fix the existing code.

### 2B: The recovery check must update the UI on success

If the fetch fails but the server succeeded (detected by `plan-readiness`):
- The UI MUST transition from error state to success state
- The success state must show: "Plan imported — [name] — [N] components"
- The error state must be removed

### 2C: Prevent duplicate execution

The execute fires twice, creating two rule_sets. Diagnose WHY:
- Is it React strict mode calling useEffect twice?
- Is it the button being clicked twice?
- Is it the component re-mounting?
- Is it the recovery check triggering a retry?

Fix the root cause. The `useRef` guard from HF-087 is not working — find out why and fix it properly.

### 2D: Add server-side idempotency as defense in depth

Even if the client fires twice, the server should not create two rule_sets. Add a check in the execute route:

```typescript
// In execute route, before creating rule_set:
// Check if a rule_set was already created for this import batch
const { data: existingPlan } = await supabase
  .from('rule_sets')
  .select('id, name')
  .eq('tenant_id', tenantId)
  .eq('status', 'draft')
  .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // last 5 min
  .maybeSingle();

if (existingPlan) {
  // Plan already created — return success without creating duplicate
  return NextResponse.json({ 
    success: true, 
    planId: existingPlan.id,
    message: 'Plan already exists (idempotent)' 
  });
}
```

### 2E: Test on localhost

```
1. Nuclear clear rule_sets for Óptica (Andrew runs SQL)
2. Start dev server on localhost:3000
3. Log in as VL Admin
4. Navigate to Óptica Luminar > Import
5. Upload RetailCorp Plan1.pptx
6. Confirm All > Import Data
7. WHAT DOES THE USER SEE?
   - Does the elapsed timer appear? (Y/N)
   - Does the "do not close" message appear? (Y/N)
   - Does the execute fire once or twice? (Check Network tab)
   - After 60 seconds, does the UI show success? (Y/N)
   - If not, what does it show? (Screenshot equivalent: paste error)
8. Check rule_sets table — how many were created? (Must be exactly 1)
```

**Proof gate PG-02:** 
- Plan import on localhost shows success to user
- Exactly 1 rule_set created (not 2)
- Elapsed timer visible during processing
- Console output proving the fix works

**Commit:** `OB-151 Phase 2: Client-side fetch — user sees success`

---

# PHASE 3: CLEANUP DATABASE + DEPLOY

### 3A: Print SQL for Andrew

```
echo "========================================"
echo "SQL FOR ANDREW TO RUN IN SUPABASE:"
echo "========================================"
echo ""
echo "-- Step 1: Delete auto-created VL Admin tenant profiles"
echo "DELETE FROM profiles WHERE email = 'platform@vialuce.com' AND tenant_id IS NOT NULL;"
echo ""
echo "-- Step 2: Delete duplicate rule_sets from failed imports"
echo "DELETE FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);"
echo ""
echo "-- Step 3: Verify clean state"
echo "SELECT"
echo "  (SELECT count(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,"
echo "  (SELECT count(*) FROM profiles WHERE email = 'platform@vialuce.com' AND tenant_id IS NOT NULL) as vl_admin_tenant_profiles,"
echo "  (SELECT count(*) FROM profiles WHERE email = 'platform@vialuce.com' AND tenant_id IS NULL) as vl_admin_platform_profiles"
echo "FROM tenants t WHERE slug LIKE '%optica%';"
echo ""
echo "Expected: rule_sets=0, vl_admin_tenant_profiles=0, vl_admin_platform_profiles=1"
echo "========================================"
```

### 3B: Build and deploy

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "OB-151: SCI plan import end-to-end — client sees success, no duplicates, VL Admin fixed"
git push origin dev
gh pr create --base main --head dev \
  --title "OB-151: Plan import works end-to-end — user sees success on production" \
  --body "## Three Problems Fixed

### 1. VL Admin Tenant Visibility (HF-086 regression)
- resolveProfileId no longer auto-creates tenant profiles for platform admins
- Uses tenant's own admin profile for created_by instead
- VL Admin can see and enter all tenants again

### 2. Client-Side Fetch Timeout (HF-087 regression)  
- [Root cause from Phase 0]
- [Fix description]
- User now sees success after plan import completes

### 3. Duplicate Execution Prevention
- [Client-side fix]
- Server-side idempotency check prevents duplicate rule_sets

### SQL Required
Andrew must run cleanup SQL in Supabase before testing:
- Delete auto-created VL Admin tenant profiles
- Delete duplicate rule_sets

### Testing
After merge + deploy + SQL cleanup:
1. Log in as VL Admin on vialuce.ai
2. Verify tenant fleet visible in Observatory
3. Enter Óptica Luminar > Import
4. Upload RetailCorp Plan1.pptx
5. User sees success with 7 components"

gh pr merge --squash
```

**Proof gate PG-03:** Build clean. PR merged. SQL printed for Andrew.

**Commit:** `OB-151 Phase 3: Deployed to production`

---

# PHASE 4: COMPLETION REPORT

```markdown
# OB-151 COMPLETION REPORT
## SCI Plan Import — End to End on Production

### Problems Fixed

| # | Problem | Root Cause | Fix |
|---|---------|-----------|-----|
| 1 | VL Admin sees 0 tenants | HF-086 auto-created tenant profile breaks auth | Use tenant admin's profile for created_by, no auto-create |
| 2 | User sees "Failed" on plan import | [Phase 0 root cause] | [Phase 2 fix] |
| 3 | Two rule_sets per import | [Phase 0 root cause] | Client guard + server idempotency |

### Architecture Decision
resolveProfileId for platform admins: **Option B — use tenant admin's profile.**
- Platform admin writes are attributed to tenant admin
- No second profile created
- Tenant visibility unaffected
- Trade-off: audit trail shows tenant admin, not platform admin (acceptable for onboarding)

### Files Changed
- `web/src/lib/auth/resolve-profile.ts` — rewritten (no auto-create)
- `web/src/components/sci/SCIExecution.tsx` — [fixes]
- `web/src/components/sci/ExecutionProgress.tsx` — [fixes]
- `web/src/app/api/import/sci/execute/route.ts` — idempotency check

### SQL for Andrew (run BEFORE testing)
[paste the SQL]

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | | Four root causes identified |
| PG-01 | | VL Admin tenant visibility restored on localhost |
| PG-02 | | Plan import shows success on localhost, 1 rule_set |
| PG-03 | | PR merged, SQL printed |
```

**Commit:** `OB-151 Phase 4: Completion report`

---

## ANTI-PATTERNS — CRITICAL FOR THIS OB

| Anti-Pattern | What CC Might Do | What To Do Instead |
|---|---|---|
| Add another layer on top of HF-087 | Write a new wrapper around fetchWithTimeout | Fix the EXISTING code. Read it. Find why it doesn't work. Fix THAT. |
| Claim "build clean" as proof | "The code compiles" | Proof is BROWSER BEHAVIOR. Did the user see success? Did 1 rule_set get created? |
| Skip the VL Admin fix | "That's a separate issue" | It's the SAME OB. VL Admin must see tenants AND plan import must show success. |
| Auto-create profiles again | "But we need a profile for created_by" | Use the TENANT ADMIN's profile. No new profiles for platform admins. |
| Test only on localhost | "Works on localhost" | This OB requires localhost proof. THEN Andrew tests on production after merge + SQL cleanup. |
| Leave duplicate execution unfixed | "Added idempotency on server" | Fix BOTH client and server. The client should not fire twice. |
| Skip the SQL instructions | Forget to print cleanup SQL | Andrew MUST run SQL before production testing. Print it clearly. |

---

## WHAT SUCCESS LOOKS LIKE

1. VL Admin logs into vialuce.ai → sees tenants in Observatory / select-tenant
2. VL Admin enters Óptica Luminar → navigates to Import
3. VL Admin uploads RetailCorp Plan1.pptx → SCI classifies as plan (95%)
4. VL Admin confirms → clicks Import Data
5. **User sees elapsed timer: "Processing... 30s elapsed"**
6. **User sees message: "Plan interpretation may take up to 2 minutes"**
7. **After ~60 seconds, user sees: "Plan imported — Optometrist Incentive Plan — 7 components"**
8. **Exactly 1 rule_set in database**
9. No "Failed to fetch". No "0 of 1 succeeded". No duplicates.

This is the ONLY acceptable outcome. Anything less means the OB is not complete.

---

*"If the user sees failure, it's a failure. Period."*
