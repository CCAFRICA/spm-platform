# HF-097: VL ADMIN LOGIN — "Account found but profile is missing"

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply

**If you have not read the file, STOP and read it now.**

---

## WHY THIS HF EXISTS

VL Admin (platform@vialuce.com) cannot log in. The error displayed is: **"Account found but profile is missing. Contact your administrator."**

The auth user exists in `auth.users` (UUID: `9c179b53-c5ee-4af7-a36b-09f5db3e35f2`). The profile row has been manually recreated in the `profiles` table with:

```
id: 9c179b53-c5ee-4af7-a36b-09f5db3e35f2
auth_user_id: 9c179b53-c5ee-4af7-a36b-09f5db3e35f2
tenant_id: NULL
email: platform@vialuce.com
display_name: VL Admin
role: platform
```

Despite the profile row existing, the app still returns "Account found but profile is missing" after cache clear in a fresh incognito window.

### Root Cause Hypothesis

The RLS policy on the `profiles` table is:

```
profiles_select_own | SELECT | (auth_user_id = auth.uid())
```

This policy SHOULD work because `auth_user_id` matches the auth user's UUID. However, the app's profile fetch query may be adding additional filters (e.g., `tenant_id IS NOT NULL`, or `role != 'platform'`) that exclude the VL Admin row. Alternatively, the query may be using a Supabase client role that doesn't trigger the correct RLS policy.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **MINIMAL CHANGE. Fix only the profile fetch. Do not restructure auth.**

---

## CRITICAL CONTEXT

### VL Admin is a Special Case
- `tenant_id IS NULL` — platform-scoped, not tenant-scoped
- `role = 'platform'` — highest privilege level
- This profile must survive ALL destructive operations (tenant deletion, data cleanup, nuclear clear)
- The profile row EXISTS in the database — this is a code/query problem, not a data problem

### Schema Reality (VERIFIED — not from SCHEMA_REFERENCE.md which is stale)
The `profiles` table has these columns:
```
id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at
```

**There is NO `scope_level` column.** The column is `role`. Any code referencing `scope_level` on the profiles table is broken.

### RLS Policies on profiles:
```
profiles_insert_admin | INSERT | null
profiles_select_own   | SELECT | (auth_user_id = auth.uid())
profiles_update_own   | UPDATE | (auth_user_id = auth.uid())
```

---

## SQL VERIFICATION GATE (MANDATORY — FP-49)

Before writing ANY SQL or any code that references database column names, CC MUST run:

```bash
echo "=== PROFILES TABLE SCHEMA ==="
# Query via Supabase CLI or use the app's Supabase client to verify
grep -rn "from('profiles')" web/src/ --include="*.ts" --include="*.tsx" | head -30
```

Every column name referenced in code changes must exist in the actual schema. No exceptions.

---

## PHASE 0: DIAGNOSTIC — TRACE THE ERROR

Run every command. Paste ALL output. Do not skip any.

```bash
echo "============================================"
echo "HF-097 PHASE 0: VL ADMIN LOGIN DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: FIND THE ERROR MESSAGE ==="
grep -rn "Account found but profile is missing" web/src/ --include="*.ts" --include="*.tsx"
grep -rn "profile is missing" web/src/ --include="*.ts" --include="*.tsx"
grep -rn "Account found" web/src/ --include="*.ts" --include="*.tsx"

echo ""
echo "=== 0B: FIND ALL PROFILE FETCH QUERIES ==="
grep -rn "from('profiles')" web/src/ --include="*.ts" --include="*.tsx" | head -30

echo ""
echo "=== 0C: AUTH CALLBACK — FULL FILE ==="
cat web/src/app/auth/callback/route.ts 2>/dev/null || echo "No auth/callback/route.ts"
cat web/src/app/api/auth/callback/route.ts 2>/dev/null || echo "No api/auth/callback/route.ts"

echo ""
echo "=== 0D: LOGIN PAGE — FULL FILE ==="
cat web/src/app/login/page.tsx

echo ""
echo "=== 0E: AUTH CONTEXT / SESSION CONTEXT ==="
find web/src -name "*auth*" -o -name "*session*" | grep -E "\.(ts|tsx)$" | head -10
echo "--- Contents of each ---"
for f in $(find web/src -name "*auth*" -o -name "*session*" | grep -E "\.(ts|tsx)$" | head -10); do
  echo ""
  echo "=== $f ==="
  cat "$f"
done

echo ""
echo "=== 0F: MIDDLEWARE — FULL FILE ==="
cat web/src/middleware.ts

echo ""
echo "=== 0G: PROFILE FETCH IN DETAIL ==="
echo "--- Every .select() on profiles ---"
grep -rn "\.from('profiles').*\.select\|\.from('profiles')" web/src/ --include="*.ts" --include="*.tsx" -A 5 | head -60

echo ""
echo "=== 0H: ANY scope_level REFERENCES (STALE SCHEMA) ==="
grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== 0I: ANY tenant_id FILTER ON PROFILE FETCH ==="
grep -rn "from('profiles')" web/src/ --include="*.ts" --include="*.tsx" -A 10 | grep -i "tenant_id" | head -10

echo ""
echo "=== 0J: PROFILE TYPE DEFINITION ==="
grep -rn "interface Profile\|type Profile" web/src/ --include="*.ts" --include="*.tsx" | head -10
echo "--- Full type ---"
for f in $(grep -rln "interface Profile\|type Profile" web/src/ --include="*.ts" --include="*.tsx" | head -3); do
  echo "=== $f ==="
  grep -A 20 "interface Profile\|type Profile" "$f"
done
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-097 Phase 0: VL Admin login diagnostic" && git push origin dev`

---

## PHASE 1: IDENTIFY AND FIX ROOT CAUSE

Based on Phase 0 output, the failure is one of these patterns:

### Pattern A: Profile Query Adds tenant_id Filter
The profile fetch query includes `.eq('tenant_id', someValue)` which excludes VL Admin (tenant_id IS NULL). 

**Fix:** The profile fetch on login must query by `auth_user_id` ONLY — no tenant_id filter. Tenant selection happens AFTER profile is loaded.

### Pattern B: Code References scope_level Instead of role
The auth flow checks `profile.scope_level` which doesn't exist, causing the query or downstream logic to fail silently.

**Fix:** Replace all `scope_level` references with `role`. The column is `role` with values like `'platform'`, `'admin'`, `'manager'`, `'rep'`.

### Pattern C: RLS Policy Blocks the Query
The Supabase client used in the auth flow uses the `anon` key instead of the `authenticated` role, so `auth.uid()` returns NULL and the RLS policy `auth_user_id = auth.uid()` fails.

**Fix:** Ensure the profile fetch uses the authenticated Supabase client (after session is established), not the anon client.

### Pattern D: Profile Query Uses .single() and Gets Error
The query returns the profile but `.single()` throws because of an unexpected condition (e.g., multiple profiles, or the query structure causes a PostgREST error).

**Fix:** Check for errors from the `.single()` call. Log the actual error, not just "profile missing".

### Pattern E: Auth Callback Creates a NEW Profile on Every Login
The callback tries to upsert a profile and the upsert fails silently (e.g., tries to set scope_level), leaving no profile visible through the normal fetch path.

**Fix:** Auth callback should ONLY fetch the existing profile, never create/upsert. Profile creation is a separate administrative function.

**Determine which pattern matches the Phase 0 output. Fix it. If multiple patterns are active, fix all of them.**

### MANDATORY: VL Admin Survival Guard

After fixing, add this guard comment at the profile fetch point:

```typescript
// VL ADMIN GUARD — HF-097
// VL Admin has tenant_id = NULL and role = 'platform'.
// Profile fetch on login MUST work for tenant_id IS NULL.
// DO NOT add tenant_id filters to the login profile fetch.
// DO NOT reference scope_level — the column is 'role'.
// See: CC FP-49 (SQL Schema Fabrication), HF-097
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-097 Phase 1: VL Admin login fix" && git push origin dev`

---

## PHASE 2: VERIFY FIX

### 2A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 2B: Verify Profile Fetch Works for VL Admin

```bash
echo "=== Verify: profile fetch query works for NULL tenant_id ==="
# Trace the exact query the app makes and confirm it returns the VL Admin row
# The profile row has: auth_user_id = '9c179b53-c5ee-4af7-a36b-09f5db3e35f2', tenant_id = NULL, role = 'platform'
```

### 2C: Local Auth Flow Test

```bash
npm run dev &
sleep 5

# Unauthenticated request should redirect to login
curl -v http://localhost:3000/operate 2>&1 | grep -E "< HTTP|< location|< Location"
# Expected: 307 → /login (SINGLE redirect)

# Login page should render
curl -v http://localhost:3000/login 2>&1 | grep -E "< HTTP"
# Expected: 200
```

### 2D: Verify No scope_level References Remain

```bash
echo "=== Verify zero scope_level references ==="
grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
# Expected: ZERO results (or only in comments referencing the old name)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-097 Phase 2: Build and auth flow verified" && git push origin dev`

---

## PHASE 3: AUTOMATED CLT

```bash
echo "============================================"
echo "HF-097 CLT: VL ADMIN LOGIN VERIFICATION"
echo "============================================"

echo ""
echo "=== CLT-1: Profile row exists ==="
echo "Query: SELECT id, email, tenant_id, role FROM profiles WHERE id = '9c179b53-c5ee-4af7-a36b-09f5db3e35f2'"
echo "Expected: 1 row, tenant_id NULL, role 'platform'"

echo ""
echo "=== CLT-2: Zero scope_level references ==="
SCOPE_COUNT=$(grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// " | wc -l)
echo "Active scope_level references: $SCOPE_COUNT"
if [ "$SCOPE_COUNT" -gt 0 ]; then
  echo "FAIL: scope_level references still exist"
  grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// "
else
  echo "PASS: Zero scope_level references"
fi

echo ""
echo "=== CLT-3: Profile fetch has no tenant_id filter on login ==="
echo "Manual verification: check Phase 0G output confirms no .eq('tenant_id') on the login profile fetch"

echo ""
echo "=== CLT-4: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -5
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
  echo "PASS: Build clean"
else
  echo "FAIL: Build failed"
fi

echo ""
echo "=== CLT-5: Dev server responds ==="
npm run dev &
DEV_PID=$!
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login)
kill $DEV_PID 2>/dev/null
if [ "$HTTP_CODE" = "200" ]; then
  echo "PASS: Login page returns 200"
else
  echo "FAIL: Login page returns $HTTP_CODE"
fi
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-097 Phase 3: CLT verification complete" && git push origin dev`

---

## PHASE 4: COMPLETION

```bash
# Final build
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build

# Start dev server and verify
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
# Must be 200

# Create PR
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-097: Fix VL Admin login — profile fetch for platform role" \
  --body "## Problem
VL Admin (platform@vialuce.com) cannot log in. Error: 'Account found but profile is missing.'
Profile row exists but app code cannot find it.

## Root Cause
[CC fills this from Phase 1 diagnosis]

## Fix
[CC fills this from Phase 1 fix]

## Verification
- Profile fetch works for tenant_id IS NULL
- Zero scope_level references in codebase
- Build clean
- Login page renders (200)
- VL Admin guard comment added

## CC Failure Patterns Addressed
- FP-49: SQL Schema Fabrication (scope_level vs role)
- AP-13: Assume column names match database schema"
```

---

## WHAT NOT TO DO

1. **DO NOT restructure the auth flow.** This is a profile fetch fix, not an auth redesign.
2. **DO NOT reference scope_level anywhere.** The column is `role`. Period.
3. **DO NOT add tenant_id filters to login profile fetch.** VL Admin has tenant_id = NULL.
4. **DO NOT write SQL without verifying column names against live schema.** FP-49.
5. **DO NOT create a new profile on login.** The profile exists. Find it.
6. **DO NOT assume SCHEMA_REFERENCE.md is accurate.** It is stale. Verify against code or live DB.
