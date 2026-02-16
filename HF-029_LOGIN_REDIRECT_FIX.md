# HF-029: Fix AuthShell Redirect — Complete Navigation to /login

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. If uncertain, make the safe choice and document it. Do NOT stop between phases.**

## THE PROBLEM

The middleware IS working — `curl https://vialuce.ai/` returns `307 → /login?redirect=%2F`. But in the browser, users see a "Redirecting..." spinner that never completes. The page stays stuck on the spinner instead of navigating to `/login`.

Console shows a 500 error: a GET to Supabase `/rest/v1/profiles` failing because there's no authenticated session. The AuthShell is attempting a profile fetch before completing the redirect.

## ROOT CAUSE HYPOTHESIS

The AuthShell component:
1. Mounts on the client
2. Tries to fetch the user profile via Supabase (which fails with 500 — no session)
3. Detects `!isAuthenticated`
4. Renders the "Redirecting..." spinner
5. **But never actually calls `router.push('/login')`** — OR the redirect fires but is blocked/swallowed by the profile fetch error

The fix is to ensure that when there's no session, the AuthShell skips ALL data fetching and immediately redirects to `/login`.

## STANDING RULES
1. Commit + push after every change
2. After every commit: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
3. All work via OB/HF prompts. Prompt committed to git before work begins.
4. Reports and proof gates at PROJECT ROOT only
5. Final step: `gh pr create --base main --head dev`

---

## PHASE 0: DIAGNOSTIC (NO CODE CHANGES)

### 0A: Read the AuthShell

```bash
cat web/src/components/layout/auth-shell.tsx
```

Identify:
1. Where does it check for authentication?
2. Where does it attempt to fetch profile/user data?
3. Where does it render "Redirecting..."?
4. Is there a `router.push('/login')` or `router.replace('/login')` call?
5. If the redirect call exists, what conditions gate it?
6. Is there an async operation (profile fetch) that runs BEFORE the redirect check?

### 0B: Read the Auth Context

```bash
# Find and read the auth context/provider
find web/src -name "auth-context*" -o -name "auth-provider*" | head -5
# Read each file found
```

Identify:
1. How does the auth context determine `isAuthenticated`?
2. Does it make a Supabase call on mount? (This would be the 500-causing fetch)
3. What is the initial state before the auth check completes? (`isAuthenticated = false`? `null`? `undefined`?)
4. Is there a `loading` state that could be blocking the redirect?

### 0C: Read the Login Page

```bash
cat web/src/app/login/page.tsx
```

Confirm: Does the login page itself trigger any auth checks that could cause a redirect loop?

### 0D: Trace the Exact Execution Order

Map the client-side lifecycle:
1. Browser receives the HTML (middleware passed it through because... wait — middleware returned 307, so the browser should have followed the redirect to /login. WHY is the AuthShell rendering at all?)

**CRITICAL QUESTION:** If the middleware returns 307 to the browser, the browser should navigate to /login. The AuthShell on the dashboard page should never render. If it IS rendering, one of these is true:
- The middleware is NOT returning 307 for the initial page load (only for subsequent fetches)
- The middleware returns 307 but the page is client-side rendered (SPA navigation) and the redirect doesn't fire
- The initial HTML was cached/served before the middleware redirect

Document what you find. This diagnostic may reveal that the fix is different from what we expect.

**Commit:** `HF-029 Phase 0: AuthShell redirect diagnostic`

---

## PHASE 1: FIX THE REDIRECT

Based on Phase 0 findings, apply the correct fix. There are two likely scenarios:

### SCENARIO A: AuthShell renders "Redirecting..." but never navigates

The `router.push('/login')` call is missing, conditional on a state that never resolves, or swallowed by an error.

**Fix:** Ensure the redirect fires unconditionally when no session exists:

```typescript
// In AuthShell or equivalent
useEffect(() => {
  // If not on a public route and not authenticated, redirect immediately
  // Do NOT wait for profile fetch or any other async operation
  if (!isPublicRoute && !isLoading && !isAuthenticated) {
    router.replace('/login');
  }
}, [isAuthenticated, isLoading, isPublicRoute, router]);
```

Key points:
- Use `router.replace` not `router.push` (prevents back-button returning to protected page)
- Gate on `!isLoading` to avoid redirecting during initial auth check
- Do NOT gate on profile data, tenant data, or any other fetch result
- The redirect must fire BEFORE any data-fetching useEffect runs

### SCENARIO B: Profile fetch fires before auth check completes

The auth context initializes as `loading: true`, then a profile fetch fires simultaneously, hits 500, and the error handler interferes with the redirect.

**Fix:** Guard all data-fetching hooks:

```typescript
// In any component that fetches tenant/profile data
useEffect(() => {
  if (!isAuthenticated) return; // Don't fetch anything without a session
  // ... fetch logic
}, [isAuthenticated, /* other deps */]);
```

Find EVERY Supabase query that runs on page mount and add this guard. The 500 error in the console is the smoking gun — something is querying Supabase without a session.

### SCENARIO C: Middleware returns 307 but page is served via client-side routing

If the app uses a layout that wraps everything in a client-side shell, the initial HTML might be the shell (which renders), and the middleware 307 only applies to the document request (which the shell's router doesn't honor).

**Fix:** The AuthShell must handle this case explicitly:

```typescript
// Check for Supabase session directly, not just context state
useEffect(() => {
  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && !isPublicRoute) {
      // No session at all — hard redirect (not SPA navigation)
      window.location.href = '/login';
    }
  };
  checkSession();
}, []);
```

Note: `window.location.href` forces a full page navigation, which WILL hit the middleware. `router.push` does SPA navigation, which does NOT hit middleware.

### IMPORTANT: The profile fetch 500 must be eliminated

Regardless of which scenario applies, find and fix the Supabase profile query that fires without a session. It should either:
- Be guarded by an auth check (`if (!session) return;`)
- Be wrapped in try/catch that gracefully handles the no-session case
- Not run at all until authentication is confirmed

**Commit:** `HF-029 Phase 1: Fix AuthShell redirect and guard unauthenticated data fetches`

---

## PHASE 2: VERIFY

### 2A: Unauthenticated Browser Test

The definitive test. Open a fresh incognito window:

1. Navigate to `localhost:3000`
2. **MUST** see the login page within 2 seconds (not a spinner, not the dashboard)
3. Console **MUST** show zero 500 errors
4. No "Redirecting..." flash visible

### 2B: Authenticated Flow

1. On the login page, sign in as `platform@vialuce.com` / `demo-password-VL1`
2. Should route to `/select-tenant` (platform admin)
3. Select Optica Luminar
4. Dashboard should show "Welcome back, VL Platform Admin!" (not "User!")
5. Console should show zero errors

### 2C: Curl Verification

```bash
# Unauthenticated — still redirects
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
# Expected: 307 → /login

# Login page renders
curl -s http://localhost:3000/login | grep -ci "sign in\|login\|email\|password"
# Expected: non-zero (page has login form content)

# API health
curl -s http://localhost:3000/api/health/auth | head -5
# Expected: 200 with supabase_url_set: true
```

### 2D: No Regression

```bash
# Build must pass cleanly
rm -rf .next && npm run build 2>&1 | tail -5
# Expected: no errors
```

Document results for each test.

**Commit:** `HF-029 Phase 2: Auth flow verification`

---

## PHASE 3: AUTOMATED CLT + COMPLETION

### 3A: CLT Script

Create `web/scripts/clt-hf029-verify.ts`:

Gates:
1. AuthShell exists and handles unauthenticated state
2. AuthShell does NOT fetch profile data when unauthenticated
3. AuthShell triggers redirect when no session (router.replace or window.location)
4. No Supabase queries fire without an authenticated session
5. curl localhost:3000/ returns 307 (middleware still works)
6. curl localhost:3000/login returns 200
7. Login page contains form elements (email, password)
8. Build passes with zero errors
9. No "Welcome back, User!" in unauthenticated response
10. Auth context has a loading state that gates the redirect

### 3B: Completion Report

Create `HF-029_COMPLETION_REPORT.md` at PROJECT ROOT:
- Phase 0 findings (exact failure mechanism)
- Phase 1 fix (what changed, which scenario)
- Phase 2 test results (all 4 sections)
- Phase 3 CLT gate count

### 3C: PR

```bash
git add -A && git commit -m "HF-029 Phase 3: CLT + completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-029: Fix AuthShell redirect — unauthenticated users reach login page" \
  --body "Root cause: [from Phase 0]. Fix: [from Phase 1]. Result: Unauthenticated users see login page within 2 seconds, zero 500 errors. [gate count] CLT gates pass."
```

---

## ANTI-PATTERNS TO AVOID

- **Do NOT modify the middleware.** It works. `curl` proves it returns 307. The fix is client-side only.
- **Do NOT modify Supabase configuration, RLS policies, or profiles.** Database layer is stable.
- **Do NOT add new features, new pages, or new components.** Fix the redirect. That's it.
- **Do NOT restructure the auth context.** If it works for authenticated users (it does — HF-027 verified all 7 users), don't change it.
- **The test is visual:** open incognito, go to the site, see login page. If you see a spinner or dashboard, it's not fixed.
- **If `router.push('/login')` doesn't work, use `window.location.href = '/login'`.** A full page navigation always works because it hits the middleware. SPA navigation may not.
