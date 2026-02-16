# HF-030: Kill the Profile Fetch Loop on /login

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. If uncertain, make the safe choice and document it. Do NOT stop between phases.**

## REPO ROOT RULE (NEW)
**git commands must run from repo root (`/Users/AndrewAfrica/spm-platform`), NOT from `web/`. Always `cd /Users/AndrewAfrica/spm-platform` before `git add/commit/push/status`. `npm`/`npx` commands run from `web/`.**

## THE PROBLEM

Chrome shows a redirect loop on `vialuce.ai`. Firefox does not. The Network tab reveals the exact sequence:

```
1. login?redirect=%2F     → 307   (middleware redirects)
2. vialuce.ai             → 304   (follows redirect)
3. [JS/CSS/fonts load]    → 200   (page renders)
4. user                   → 200   (getUser() — returns "no user" but HTTP 200)
5. profiles?select=*&auth → 500   (fetchCurrentProfile() fires, no session, Supabase returns 500)
6. login?redirect=%2F     → 307   (window.location.href fires from error path — LOOP RESTARTS)
```

The `getSession()` guard added in PR #11 is NOT preventing the profile fetch. `getSession()` returns a non-null result (stale cookie data) so the guard passes through. Then `fetchCurrentProfile()` fires, hits 500, and something in the error/response path triggers `window.location.href = '/login'` again.

**Firefox works because it handles stale session cookies differently — it returns null from getSession(), so the guard works.**

## WHAT MUST HAPPEN

1. The `profiles` fetch (line 5 in the Network trace) must NEVER fire on `/login`
2. If it does fire and returns 500, the error handler must NOT trigger a redirect
3. The loop must be broken at the source, not with another layer of defense

## STANDING RULES
1. Commit + push after every change
2. **git commands from repo root: `cd /Users/AndrewAfrica/spm-platform`**
3. **npm/npx commands from web/: `cd /Users/AndrewAfrica/spm-platform/web`**
4. After every commit: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
5. Reports and proof gates at PROJECT ROOT only
6. Final step: `gh pr create --base main --head dev`

---

## PHASE 0: FORENSIC TRACE (NO CODE CHANGES)

### 0A: Map Every Supabase Call on /login

```bash
# Find EVERY place that calls Supabase in the auth flow
grep -rn "supabase\.\|getUser\|getSession\|fetchCurrentProfile\|from('profiles')" \
  web/src/contexts/auth-context.tsx \
  web/src/lib/supabase/auth-service.ts \
  web/src/components/layout/auth-shell.tsx
```

### 0B: Trace initAuth() Exactly

```bash
cat web/src/contexts/auth-context.tsx
```

Map the exact execution path:
1. What does `initAuth()` do step by step?
2. Where does `getSession()` get called?
3. What does `getSession()` return when there's a stale cookie? (It may return `{ data: { session: null } }` OR `{ data: { session: { ...stale } } }`)
4. What condition gates `fetchCurrentProfile()`?
5. Is there an `onAuthStateChange` handler that ALSO calls `fetchCurrentProfile()`?
6. If `fetchCurrentProfile()` returns an error/null, what happens next? Does it trigger navigation?

### 0C: Trace the 500 → Redirect Path

The 500 from the profiles fetch must be triggering `window.location.href` somewhere. Find it:

```bash
# Find every window.location.href in the codebase
grep -rn "window.location" web/src/ | grep -v node_modules | grep -v ".next"

# Find every redirect trigger
grep -rn "router.push\|router.replace\|window.location\|redirect" \
  web/src/contexts/auth-context.tsx \
  web/src/components/layout/auth-shell.tsx
```

### 0D: Check What getSession() Actually Returns

The `getSession()` check added in PR #11 may be checking the wrong thing. Common mistakes:
- Checking `if (!session)` but `getSession()` returns `{ data: { session: null } }` — so `session` is the return object, not `null`
- Checking `if (session)` where `session` is `{ data: { session: null } }` — truthy even when no real session
- Not destructuring correctly: `const { data: { session } } = await supabase.auth.getSession()` vs `const result = await supabase.auth.getSession()`

**Document ALL findings. Commit diagnostic notes.**

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-030 Phase 0: Auth loop diagnostic"`

---

## PHASE 1: FIX

Based on Phase 0 findings, apply fixes. There are THREE things that must be true simultaneously:

### Fix 1: initAuth() Must Not Call fetchCurrentProfile() Without a Valid Session

The `getSession()` guard must be correct:

```typescript
const initAuth = async () => {
  try {
    // Check for LOCAL session first — no network request
    const { data: { session } } = await supabase.auth.getSession();
    
    // If no local session, set unauthenticated state and STOP
    if (!session) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      return; // ← CRITICAL: do not call fetchCurrentProfile()
    }
    
    // Session exists — now validate with server
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    // If server says no user (session was stale), clear state and STOP
    if (!authUser) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      return; // ← CRITICAL: do not call fetchCurrentProfile()
    }
    
    // Both session AND user confirmed — NOW fetch profile
    const profile = await fetchCurrentProfile();
    // ... set state from profile
  } catch (error) {
    // On ANY error, set unauthenticated — do NOT redirect
    setUser(null);
    setIsAuthenticated(false);
    setIsLoading(false);
    // Do NOT call window.location.href here
  }
};
```

**Key principle:** `initAuth()` must NEVER trigger navigation. It only sets state. The AuthShell reads that state and handles navigation.

### Fix 2: onAuthStateChange Must Also Be Guarded

If there's an `onAuthStateChange` handler that calls `fetchCurrentProfile()` on `SIGNED_IN` events:

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // Only fetch profile if we have a real session
    fetchCurrentProfile().then(profile => {
      if (profile) {
        // set authenticated state
      }
    }).catch(() => {
      // Silently fail — do NOT redirect
    });
  } else if (event === 'SIGNED_OUT') {
    setUser(null);
    setIsAuthenticated(false);
    // Do NOT redirect here — AuthShell handles it
  }
});
```

**Key principle:** `onAuthStateChange` must NEVER trigger navigation. It only sets state.

### Fix 3: No Component May Redirect on Auth Failure

Search the entire codebase for `window.location.href` and `router.push('/login')`. The ONLY place that should redirect to `/login` is `AuthShellProtected`. Remove or disable any other redirect triggers:

```bash
grep -rn "window.location.href.*login\|router.push.*login\|router.replace.*login" web/src/ | grep -v node_modules
```

Every result except the one in `auth-shell.tsx` AuthShellProtected is a bug.

### Fix 4: fetchCurrentProfile() Must Not Throw on 500

The function must gracefully return `null` on any error, not throw:

```typescript
async function fetchCurrentProfile(): Promise<UserProfile | null> {
  try {
    // getSession check first
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();
    
    if (error || !profile) return null; // Don't throw, don't redirect
    
    return mapProfileToUser(profile);
  } catch {
    return null; // Swallow ALL errors — return null, never throw
  }
}
```

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-030 Phase 1: Kill profile fetch loop"`

---

## PHASE 2: VERIFY

### 2A: The Definitive Test

```bash
# From web/ directory
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 8

# Unauthenticated root → must redirect
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-redirs 0 http://localhost:3000/
# Expected: 307 → /login

# Login page → must render (200, no redirect)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
# Expected: 200

# Login page must NOT trigger any Supabase profile fetch
# Open http://localhost:3000/login in a browser, check Network tab:
# - ZERO requests to /rest/v1/profiles
# - ZERO 500 errors
# - Page renders login form, stays on login, no redirect
```

### 2B: Verify No Redirect Triggers Outside AuthShell

```bash
cd /Users/AndrewAfrica/spm-platform
grep -rn "window.location.href.*login" web/src/ | grep -v node_modules | grep -v ".next"
# Expected: ONLY one result, in auth-shell.tsx AuthShellProtected
```

### 2C: Build Must Pass

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next && npm run build 2>&1 | tail -5
# Expected: no errors
```

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-030 Phase 2: Auth loop verification"`

---

## PHASE 3: CLT + COMPLETION

### 3A: CLT Script

Create `web/scripts/clt-hf030-verify.ts`:

Gates:
1. initAuth() checks getSession() before fetchCurrentProfile()
2. initAuth() checks getUser() result before fetchCurrentProfile()
3. initAuth() sets isLoading=false on no-session path
4. initAuth() does NOT call window.location.href or router.push
5. onAuthStateChange does NOT call window.location.href or router.push
6. fetchCurrentProfile() returns null (not throws) on error
7. fetchCurrentProfile() checks getSession() before querying profiles table
8. Only one file contains window.location.href pointing to /login (auth-shell.tsx)
9. AuthShell gate returns children on /login without mounting AuthShellProtected
10. curl localhost:3000/ returns 307
11. curl localhost:3000/login returns 200
12. Build passes with zero errors

### 3B: Completion Report

Create `HF-030_COMPLETION_REPORT.md` at PROJECT ROOT.

### 3C: PR

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-030 Phase 3: CLT + completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-030: Kill profile fetch redirect loop on /login" \
  --body "Root cause: getSession() returns stale cookie data in Chrome, allowing fetchCurrentProfile() to fire on /login. Profile fetch hits 500, error path triggers window.location.href, creating redirect loop. Fix: double-guard with getSession()+getUser() before any profile fetch, ensure no component except AuthShellProtected triggers login redirect, fetchCurrentProfile() returns null instead of throwing. [gate count] CLT gates pass."
```

---

## ANTI-PATTERNS TO AVOID

- **Do NOT add more wrapper components.** The AuthShell gate and AuthShellProtected split from PR #10 is correct. Fix the provider, not the component tree.
- **Do NOT use getSession() as the sole guard.** Chrome returns stale session data. Use getSession() + getUser() double-check.
- **Do NOT trigger navigation from AuthProvider or auth-service.** These set STATE only. AuthShellProtected reads state and decides navigation.
- **Do NOT catch the 500 and redirect.** Catch the 500 and return null. Let the state flow handle it.
- **The loop happens because multiple things independently decide to redirect.** The fix is to have exactly ONE redirect trigger (AuthShellProtected) and zero others.
- **Test in Chrome, not Firefox.** Firefox passes. Chrome loops. The fix must work in Chrome.
- **git commands from spm-platform/ root. npm commands from web/.**
