# HF-062: COMPLETE AUTH FLOW AUDIT AND FIX

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — login is the #1 blocker

**If you have not read both files, STOP and read them now.**

---

## CONTEXT: WHY THIS HF EXISTS

Login has broken **four times** in the last 5 PRs:

| # | What Broke | Fix Applied | What It Actually Fixed |
|---|-----------|-------------|----------------------|
| 1 | Redirect loop (post-OB-97) | HF-059: removed duplicate auth checks | Stopped double-redirect |
| 2 | Redirect loop returned (post-PR#94) | HF-061: loadedForTenant, gated useFinancialOnly | Stopped stale session race |
| 3 | Infinite spinner (post-HF-061) | HF-061 Amendment: middleware getUser + timeout | Middleware now gates properly |
| 4 | "Account found but profile is missing" (post-Amendment) | **THIS HF** | **?** |

Each fix patched one symptom and introduced a new one. The auth flow has been modified by at least 5 different OBs and HFs, each touching different files with different assumptions.

**This stops now.** This HF does NOT patch another symptom. It audits the COMPLETE auth flow — every file, every redirect, every query, every state transition — and produces a single coherent implementation that handles all cases.

---

## THE CURRENT SYMPTOM

Browser screenshot shows:
- URL: `vialuce.ai/login` ✅ (middleware redirect is working)
- Login form renders ✅
- User enters `platform@vialuce.com` + password
- Error: **"Account found but profile is missing. Contact your administrator."** ❌

This means:
1. Supabase `signInWithPassword()` succeeded (the account IS found)
2. Something AFTER sign-in queries the `profiles` table and gets no result
3. The login page displays the error instead of proceeding

The `platform@vialuce.com` account has been working for months across dozens of sessions. The profile exists. Either:
- The profile query has a new filter condition that excludes the result (likely `tenant_id` — but at login time, no tenant is selected yet)
- HF-061 or the Amendment changed the login page's post-auth logic
- The AuthShell's 3-second timeout is racing with the profile query and triggering the error

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**

---

## PHASE 0: FULL AUTH FLOW AUDIT

**This is the most important phase.** Do not rush it. Trace EVERY file involved in auth. Paste ALL output.

```bash
echo "============================================"
echo "HF-062 PHASE 0: COMPLETE AUTH FLOW AUDIT"
echo "============================================"

echo ""
echo "================================================================"
echo "SECTION A: THE COMPLETE FILE INVENTORY"
echo "================================================================"

echo ""
echo "=== A1: Every file with 'auth' in the name ==="
find web/src -name "*auth*" -type f | sort

echo ""
echo "=== A2: Every file with 'login' in the name ==="
find web/src -name "*login*" -o -name "*Login*" | sort

echo ""
echo "=== A3: Every file with 'session' in the name ==="
find web/src -name "*session*" -type f | sort

echo ""
echo "=== A4: Every file with 'profile' in the name ==="
find web/src -name "*profile*" -type f | sort

echo ""
echo "=== A5: Every context provider ==="
find web/src/contexts -type f | sort

echo ""
echo "================================================================"
echo "SECTION B: THE COMPLETE AUTH CHAIN — FILE BY FILE"
echo "================================================================"

echo ""
echo "=== B1: MIDDLEWARE (entry point for every request) ==="
cat web/src/middleware.ts

echo ""
echo "=== B2: LOGIN PAGE (where unauthenticated users land) ==="
cat web/src/app/login/page.tsx

echo ""
echo "=== B3: AUTH CALLBACK (where Supabase redirects after OAuth) ==="
cat web/src/app/auth/callback/route.ts 2>/dev/null || echo "No auth/callback/route.ts"
cat web/src/app/api/auth/callback/route.ts 2>/dev/null || echo "No api/auth/callback/route.ts"

echo ""
echo "=== B4: ROOT LAYOUT (wraps entire app) ==="
cat web/src/app/layout.tsx

echo ""
echo "=== B5: AUTH SHELL / AUTH WRAPPER ==="
echo "--- Finding auth shell/wrapper ---"
grep -rn "AuthShell\|AuthWrapper\|AuthGuard\|AuthProvider\|ProtectedRoute" web/src/app/layout.tsx web/src/app/*/layout.tsx 2>/dev/null | head -10
echo ""
echo "--- Full auth shell file ---"
find web/src -name "*auth-shell*" -o -name "*AuthShell*" -o -name "*auth-guard*" -o -name "*AuthGuard*" | while read f; do echo "========== $f =========="; cat "$f"; done

echo ""
echo "=== B6: AUTH CONTEXT / AUTH PROVIDER ==="
find web/src -name "*auth*context*" -o -name "*auth*provider*" -o -name "*AuthContext*" -o -name "*AuthProvider*" | while read f; do echo "========== $f =========="; cat "$f"; done

echo ""
echo "=== B7: SESSION CONTEXT (HF-061 modified) ==="
cat web/src/contexts/session-context.tsx

echo ""
echo "=== B8: TENANT CONTEXT ==="
find web/src -name "*tenant*context*" -o -name "*TenantContext*" -o -name "*tenant*provider*" | while read f; do echo "========== $f =========="; cat "$f"; done

echo ""
echo "=== B9: useFinancialOnly HOOK ==="
find web/src -name "*financial*only*" -o -name "*useFinancialOnly*" | while read f; do echo "========== $f =========="; cat "$f"; done

echo ""
echo "================================================================"
echo "SECTION C: THE PROFILE QUERY — WHERE IS IT FAILING?"
echo "================================================================"

echo ""
echo "=== C1: Every file that queries the profiles table ==="
grep -rn "from('profiles')\|from(\"profiles\")\|\.profiles\." web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== C2: The exact error message source ==="
grep -rn "profile is missing\|profile not found\|Contact your administrator\|Account found but" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== C3: Full file containing the error message ==="
grep -rln "profile is missing\|Contact your administrator\|Account found but" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | while read f; do echo "========== $f =========="; cat "$f"; done

echo ""
echo "================================================================"
echo "SECTION D: WHAT CHANGED IN THE LAST 3 PRS?"
echo "================================================================"

echo ""
echo "=== D1: Recent git log ==="
git log --oneline -20

echo ""
echo "=== D2: Files modified in HF-061 commits ==="
git log --oneline --all | grep -i "HF-061\|HF061\|login\|auth\|redirect" | head -10
echo ""
echo "--- Diff of auth-related files from last 5 commits ---"
git diff HEAD~5..HEAD --name-only | grep -i "auth\|login\|session\|profile\|middleware" | sort

echo ""
echo "=== D3: What changed in the login page? ==="
git log --oneline -10 -- web/src/app/login/page.tsx
git diff HEAD~10..HEAD -- web/src/app/login/page.tsx 2>/dev/null | head -100

echo ""
echo "=== D4: What changed in auth shell? ==="
find web/src -name "*auth-shell*" -o -name "*AuthShell*" | while read f; do
  echo "=== Changes to $f ==="
  git log --oneline -10 -- "$f"
  git diff HEAD~10..HEAD -- "$f" 2>/dev/null | head -100
done

echo ""
echo "================================================================"
echo "SECTION E: SUPABASE PROFILE DATA CHECK"
echo "================================================================"

echo ""
echo "=== E1: Can we query profiles for platform user? ==="
echo "Looking for seed scripts that create platform user..."
grep -rn "platform@vialuce" web/src/ web/supabase/ web/scripts/ --include="*.ts" --include="*.tsx" --include="*.sql" | head -10

echo ""
echo "=== E2: Profile schema ==="
grep -rn "profiles" web/supabase/migrations/ --include="*.sql" | head -20

echo ""
echo "=== E3: Does the profile query filter by tenant_id at login? ==="
echo "This is the likely bug — at login time, no tenant is selected yet."
echo "If the profile query requires tenant_id, it will always fail for platform users."
grep -rln "profile is missing\|Contact your administrator" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | while read f; do
  echo "--- Profile query in $f ---"
  grep -B5 -A10 "profiles" "$f" | head -40
done
```

**PASTE ALL OUTPUT before proceeding to Phase 1.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-062 Phase 0: Complete auth flow audit" && git push origin dev`

---

## PHASE 1: MAP THE AUTH STATE MACHINE

Before writing any code, draw the complete auth state machine based on Phase 0 output. Write it as a markdown document in the project root.

Create `AUTH_FLOW_REFERENCE.md`:

```markdown
# ViaLuce Auth Flow Reference

## State Machine

```
UNAUTHENTICATED
  │
  ├─ [Visit any protected route]
  │    → Middleware: getUser() returns null
  │    → 307 redirect to /login?redirect={path}
  │
  ├─ [Visit /login]
  │    → Login page renders
  │    → User enters email + password
  │    → signInWithPassword()
  │    │
  │    ├─ [Auth fails] → Show "Invalid credentials" error
  │    │
  │    └─ [Auth succeeds] → Supabase session cookie set
  │         │
  │         └─ AUTHENTICATED_NO_TENANT
  │              │
  │              ├─ [Platform user (scope_level='platform')]
  │              │    → Redirect to /select-tenant (or tenant selector page)
  │              │    → User picks a tenant
  │              │    → AUTHENTICATED_WITH_TENANT
  │              │
  │              └─ [Tenant user (scope_level='tenant'|'division'|'team'|'individual')]
  │                   → Profile has tenant_id → auto-select tenant
  │                   → AUTHENTICATED_WITH_TENANT
  │
  AUTHENTICATED_WITH_TENANT
    │
    ├─ [Session context loads: tenant, profile, counts]
    │    → isLoading = true until ALL loaded for THIS tenant
    │
    ├─ [useFinancialOnly check]
    │    → Only runs AFTER isAuthenticated AND session loaded
    │    → If financial-only tenant → redirect /operate to /financial
    │
    └─ [Page renders]
         → Dashboard / workspace content
```

## Critical Rules

1. **Middleware** is the ONLY server-side auth gate
2. **Login page** handles sign-in + initial routing based on user type
3. **AuthShell** handles client-side loading state + timeout fallback
4. **SessionContext** loads tenant-specific data AFTER tenant is selected
5. **Profile query at login** must NOT filter by tenant_id for platform users
6. **Profile query in session** CAN filter by tenant_id (tenant is known)

## Files Involved (in execution order)

1. `middleware.ts` — Server-side gate
2. `app/login/page.tsx` — Sign-in form + post-auth routing
3. `app/auth/callback/route.ts` — OAuth callback (if used)
4. `app/layout.tsx` — Root layout, wraps AuthShell
5. `components/auth/auth-shell.tsx` — Client-side auth wrapper
6. `contexts/auth-context.tsx` — Auth state (user, isAuthenticated)
7. `contexts/session-context.tsx` — Tenant-scoped data
8. `hooks/use-financial-only.ts` — Financial redirect logic
```

**Update this document with the ACTUAL file paths and logic from Phase 0 output.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-062 Phase 1: Auth flow reference documented" && git push origin dev`

---

## PHASE 2: FIX THE PROFILE ERROR

Based on Phase 0 Section C output, fix the "Account found but profile is missing" error.

### Most Likely Root Cause

The login page's post-auth logic queries `profiles` with a `tenant_id` filter. The `platform@vialuce.com` user is a PLATFORM user — they don't belong to any single tenant. At login time, no tenant is selected. The query returns no rows. The login page interprets this as "profile missing."

**This query was probably fine before HF-061/Amendment because:**
- The old login flow didn't check profiles at all, OR
- The old login flow checked profiles WITHOUT a tenant_id filter, OR  
- HF-061's AuthShell changes added a new profile check that didn't exist before

### The Fix

The login page should follow this logic after successful `signInWithPassword()`:

```typescript
// 1. Auth succeeded — we have a Supabase user
const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password })

if (error || !user) {
  setError('Invalid credentials')
  return
}

// 2. Check if this is a platform user (check profiles WITHOUT tenant_id filter)
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, tenant_id, scope_level, display_name')
  .eq('auth_user_id', user.id)
  // NO tenant_id filter here — we don't know the tenant yet

if (!profiles || profiles.length === 0) {
  // Genuinely no profile — this is a real error
  setError('Account found but profile is missing. Contact your administrator.')
  return
}

// 3. Route based on user type
if (profiles.some(p => p.scope_level === 'platform')) {
  // Platform user — go to tenant selector
  router.push(redirectTo || '/select-tenant')
} else if (profiles.length === 1) {
  // Single-tenant user — auto-select tenant and go to dashboard
  // Set tenant in context/cookie
  router.push(redirectTo || '/operate')
} else {
  // Multi-tenant user — go to tenant selector
  router.push(redirectTo || '/select-tenant')
}
```

### What NOT To Do

- Do NOT remove the profile check entirely — it's a valid safety check
- Do NOT add a tenant_id filter — platform users have profiles across tenants
- Do NOT change the middleware — it's working correctly now
- Do NOT change the SessionContext loadedForTenant logic — it's correct
- Do NOT change useFinancialOnly gating — it's correct

**Fix ONLY the profile query in the login page (or wherever the error message originates, as found in Phase 0 Section C2).**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-062 Phase 2: Profile query fixed — no tenant_id filter at login" && git push origin dev`

---

## PHASE 3: VERIFY THE COMPLETE AUTH FLOW

### 3A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 3B: Middleware Gate (from HF-061 Amendment — must still work)

```bash
npm run dev &
sleep 8

echo "=== TEST 1: /operate without auth → 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/operate

echo "=== TEST 2: /perform without auth → 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/perform

echo "=== TEST 3: /financial without auth → 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/financial

echo "=== TEST 4: /configure without auth → 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/configure

echo "=== TEST 5: /login → 200 ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/login

kill %1 2>/dev/null
```

**Expected:** Tests 1-4 return 307. Test 5 returns 200.

### 3C: Login Flow Test

This test requires Supabase auth, so it can't be fully automated with curl. Verify manually OR check the login page code logic:

```bash
echo "=== Verify login page does NOT filter profiles by tenant_id ==="
grep -n "tenant_id\|tenantId\|tenant" web/src/app/login/page.tsx | head -10
# Should NOT show tenant_id in the profile query

echo "=== Verify error message is still present (for genuinely missing profiles) ==="
grep -n "profile is missing\|Contact your administrator" web/src/app/login/page.tsx | head -5
# Should still exist — just shouldn't trigger for platform@vialuce.com

echo "=== Verify post-auth routing logic ==="
grep -A20 "signInWithPassword\|handleSignIn\|handleLogin\|handleSubmit" web/src/app/login/page.tsx | head -40
```

### 3D: No Regressions

```bash
echo "=== HF-061 guard comments still present ==="
grep -rn "AUTH GATE.*HF-059\|AUTH GATE.*HF-061" web/src/ --include="*.ts" --include="*.tsx" | head -10

echo "=== loadedForTenant still in SessionContext ==="
grep -n "loadedForTenant" web/src/contexts/session-context.tsx | head -5

echo "=== useFinancialOnly still gated on auth ==="
grep -n "isAuthenticated\|authLoading\|isLoading" web/src/hooks/use-financial-only.ts 2>/dev/null | head -5

echo "=== AuthShell timeout still present ==="
grep -n "setTimeout\|3000\|timeout" web/src/components/auth/auth-shell.tsx 2>/dev/null | head -5
```

### PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Auth flow documented | AUTH_FLOW_REFERENCE.md created with actual file paths |
| PG-2 | Root cause identified | Specific line/file causing "profile is missing" documented |
| PG-3 | Profile query fixed | No tenant_id filter on login-time profile check |
| PG-4 | `npm run build` exits 0 | Clean build |
| PG-5 | /operate → 307 to /login | Middleware gate still works |
| PG-6 | /login → 200 | Login page renders |
| PG-7 | No HF-061 regressions | Guard comments, loadedForTenant, useFinancialOnly gating, timeout all intact |
| PG-8 | Error message preserved | "Profile is missing" error still exists for genuinely missing profiles |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-062 Phase 3: Complete auth flow verified" && git push origin dev`

---

## PHASE 4: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-062: Complete auth flow audit and profile query fix" \
  --body "## Problem
After HF-061 Amendment fixed the middleware auth gate, login shows
'Account found but profile is missing' for platform@vialuce.com.

## Root Cause
[FROM PHASE 0 — exact file and line where profile query fails]

## Auth Flow Audit
Complete auth state machine documented in AUTH_FLOW_REFERENCE.md.
Every file in the auth chain reviewed and verified.

## Fix
Profile query at login no longer filters by tenant_id.
Platform users (scope_level='platform') have profiles across multiple
tenants — filtering by tenant_id at login time (when no tenant is
selected) returns zero rows.

## Verification
- Middleware gates: /operate,/perform,/financial,/configure → 307 ✅
- Login page renders: 200 ✅
- Profile query: no tenant_id filter at login ✅
- HF-061 regression check: all guard comments, timeouts, gates intact ✅
- Build: PASS ✅

## Auth Failure Pattern History
| # | Symptom | PR | Root Cause |
|---|---------|-----|-----------|
| 1 | Redirect loop | HF-059 | Duplicate auth checks |
| 2 | Redirect loop | HF-061 | Stale session race |
| 3 | Infinite spinner | HF-061 Amend | Middleware not gating |
| 4 | Profile missing | HF-062 | tenant_id filter at login |

AUTH_FLOW_REFERENCE.md now documents the complete chain to prevent
future regressions."
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- Complete auth flow audit (every file)
- AUTH_FLOW_REFERENCE.md documentation
- Fix "profile is missing" error on login
- Verify all previous auth fixes still intact

### OUT OF SCOPE — DO NOT TOUCH
- Middleware logic (HF-061 Amendment fixed this — do not change)
- SessionContext loadedForTenant (HF-061 fixed this — do not change)
- useFinancialOnly gating (HF-061 fixed this — do not change)
- AuthShell timeout (HF-061 Amendment added this — do not change)
- Navigation, sidebar, page content
- Financial module pages
- Calculation engine

### CRITICAL CONSTRAINT

**Do NOT "fix" this by removing the profile check.** The profile check is valid — it catches genuinely missing profiles. The fix is to make the query work correctly for platform users who don't have a tenant selected yet.

**Do NOT refactor the auth system.** Fix the ONE query that's broken. Leave everything else untouched. Every previous refactor introduced a new bug.

---

*ViaLuce.ai — The Way of Light*
*HF-062: Stop patching symptoms. Trace the whole chain. Fix the one thing that's actually broken.*
*"Four auth failures in five PRs. This is the last one."*
