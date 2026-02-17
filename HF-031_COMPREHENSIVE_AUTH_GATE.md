# HF-031: Authentication Gate — Comprehensive Fix

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. If uncertain, make the safe choice and document it. Do NOT stop between phases.**

## REPO ROOT RULE
**git commands must run from repo root (`/Users/AndrewAfrica/spm-platform`), NOT from `web/`. Always `cd /Users/AndrewAfrica/spm-platform` before `git add/commit/push/status`. `npm`/`npx` commands run from `web/`.**

---

## THE PROBLEM — STATE IT CLEARLY

Two browsers (Chrome and Firefox) bypass the login screen and render the full application dashboard. Firefox has NEVER successfully authenticated — there is no session, no cookie, no localStorage token to pull from. Yet the app renders as if the user is logged in.

**Server-side middleware works:** `curl -s -o /dev/null -w "%{http_code}" https://vialuce.ai/` returns 307 → /login. The server correctly rejects unauthenticated requests.

**Browsers bypass this:** The browser receives the initial HTML/JS bundle, the Next.js client-side router mounts, React components render, and the full app appears — WITHOUT ever completing the middleware redirect. The SPA shell renders before the redirect fires.

This is NOT a cookie issue, NOT a cache issue, NOT a stale session issue. This is an **architectural problem**: the client-side app renders protected content without verifying authentication.

---

## WHAT PREVIOUS HFs DID (AND WHY THEY DIDN'T FIX IT)

| HF | What It Did | Why It Didn't Fix It |
|----|-------------|----------------------|
| HF-023 | Middleware 307 redirect | Middleware works for curl/server requests. SPA client-side router ignores it. |
| HF-028 | AuthShell renders "Redirecting..." spinner | AuthShell depends on useAuth() hook. If the hook returns loading or stale state, content renders anyway. |
| HF-029 | window.location.href instead of router.push | Correct approach but fires too late — after React tree has already mounted and rendered. |
| HF-030 | getSession()+getUser() double-check, signOut() on stale | Fixes stale cookie scenario but doesn't prevent rendering when there's NO session at all. |
| PR #10 | AuthShell gate on /login | Prevents auth hooks on /login but doesn't prevent dashboard from rendering without auth. |
| PR #11 | initAuth() getSession guard | Guard returns early, sets isAuthenticated=false, but component tree still renders during the loading→false transition. |
| Migration 005 RLS fix | Dropped recursive profiles_select_vl_admin policy | Fixed 42P17 database error. Unrelated to auth gate. |

**The pattern:** Every fix targeted a specific symptom. The underlying issue is that the React component tree renders protected content while auth state is being determined.

---

## ROOT CAUSE ANALYSIS

### How Next.js App Router Works:

1. Browser requests `vialuce.ai/`
2. Server middleware intercepts → returns 307 to `/login?redirect=/`
3. Browser receives 307 header and HTML response
4. **BUT** — Next.js bundles the entire app shell in the initial JS payload
5. React hydration begins BEFORE the browser completes the redirect
6. The layout component (`layout.tsx`) mounts → AuthProvider mounts → AuthShell mounts
7. During the hydration frame, `isLoading` is `true`, so AuthShell renders the loading spinner
8. But if hydration completes and state resolves before the redirect fires, the dashboard renders

### OR (more likely):

1. Browser requests `vialuce.ai/`
2. Middleware returns 307 + redirect header
3. Browser follows redirect to `/login?redirect=/`
4. `/login` page loads (this IS the correct page)
5. Login page JS bundle loads
6. **The layout wrapping the login page includes AuthProvider**
7. AuthProvider's `initAuth()` runs
8. `getSession()` returns null → sets `isAuthenticated = false`, `isLoading = false`
9. AuthShell gate sees `/login` → renders children (login page)
10. **BUT** — something in the login page or a parallel process then navigates away

### OR (most likely given the evidence):

1. The middleware IS redirecting (curl proves 307)
2. The browser follows the redirect to `/login`
3. The login page loads momentarily
4. **Then something redirects AWAY from /login to the dashboard**
5. The dashboard renders without auth because the AuthShellProtected check has a gap

**To determine which scenario:** We need to see EXACTLY what the browser does frame by frame.

---

## PHASE 0: DEFINITIVE DIAGNOSTIC (NO CODE CHANGES)

### 0A: What Does the Middleware Actually Return?

```bash
cd /Users/AndrewAfrica/spm-platform/web

# Check middleware source — what does it do when there IS no session?
cat src/middleware.ts

# Specifically: does it check getUser()? getSession()? 
# What happens when auth check fails?
# Does it redirect ALL paths or only some?
# Does it have exceptions that could leak?
```

**Document:** The exact middleware logic, line by line.

### 0B: What Does the Browser Actually Receive?

```bash
# Get the FULL initial HTML response from / (following no redirects)
curl -s -D - --max-redirs 0 https://vialuce.ai/ 2>&1 | head -30

# Get the HTML of /login
curl -s https://vialuce.ai/login | head -100

# Does /login HTML contain any redirect meta tags or JS redirects?
curl -s https://vialuce.ai/login | grep -i "redirect\|location\|window.location\|router.push"
```

### 0C: Trace the FULL Client-Side Flow

Add temporary console.log statements to trace what happens:

**In AuthProvider (auth-context.tsx):**
```typescript
// At the START of initAuth():
console.log('[AUTH] initAuth() called');
console.log('[AUTH] pathname:', window.location.pathname);

// After getSession():
console.log('[AUTH] getSession result:', session ? 'HAS SESSION' : 'NO SESSION');

// After getUser() (if called):
console.log('[AUTH] getUser result:', user ? 'HAS USER' : 'NO USER');

// Before fetchCurrentProfile():
console.log('[AUTH] About to fetchCurrentProfile');

// After setting state:
console.log('[AUTH] Final state: isAuthenticated=', isAuthenticated, 'isLoading=', isLoading);
```

**In AuthShell gate (auth-shell.tsx):**
```typescript
// At the top of AuthShell:
console.log('[SHELL-GATE] pathname:', pathname, 'isPublicRoute:', pathname === '/login');

// At the top of AuthShellProtected:
console.log('[SHELL-PROTECTED] isAuthenticated:', isAuthenticated, 'isLoading:', isLoading);
console.log('[SHELL-PROTECTED] about to render, pathname:', pathname);
```

**In middleware.ts:**
```typescript
// At the top:
console.log('[MW] Request:', request.nextUrl.pathname);

// After auth check:
console.log('[MW] User:', user ? 'YES' : 'NO', '→ action:', redirecting ? 'REDIRECT' : 'PASS');
```

**Build, deploy to localhost, open browser, check console output.**

The console logs will reveal the EXACT sequence of events. 

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-031 Phase 0: Auth diagnostic logging"`

### 0D: Check for Competing Auth Mechanisms

```bash
# Are there any other auth checks, redirects, or session creators?
grep -rn "createClient\|createBrowserClient\|createServerClient" web/src/ | grep -v node_modules | grep -v .next
grep -rn "signIn\|signUp\|createUser" web/src/ | grep -v node_modules | grep -v .next
grep -rn "window.location" web/src/ | grep -v node_modules | grep -v .next
grep -rn "router.push\|router.replace" web/src/ | grep -v node_modules | grep -v .next | grep -v "node_modules"
```

**Document ALL findings. The diagnostic MUST answer these questions:**

1. When the browser hits vialuce.ai/, does it ACTUALLY navigate to /login? (Check Network tab: is there a request to /login?)
2. If yes, does /login render? For how long? What happens next?
3. If no, what prevents the redirect from completing?
4. What is the FIRST thing that renders in the browser? (Check Elements tab immediately on load)
5. Is there a Supabase session in localStorage? (Application tab → Local Storage)
6. Is there a Supabase cookie? (Application tab → Cookies)
7. What does initAuth() do when there is truly NO session and NO user?
8. Does the middleware correctly handle the Supabase server client? (It might be creating a session)

---

## PHASE 1: FIX

Based on Phase 0 findings, apply the correct fix. Here are the likely scenarios:

### Scenario A: Middleware Creates a Session

If the middleware's Supabase server client creates a session cookie even for unauthenticated users (Supabase can create anonymous sessions), then:

**Fix:** Middleware must check `getUser()` result, not just `getSession()`. After `getUser()`, if no user, do NOT set any cookies. Ensure the response doesn't include `Set-Cookie` headers for auth.

### Scenario B: Client-Side Renders Before Redirect Completes

If the initial HTML includes enough JS to render the app before the browser follows the 307:

**Fix:** The server must NOT return the app shell HTML with the 307. Verify the middleware returns a proper `NextResponse.redirect()` with no body content. OR: convert protected pages to server components that check auth before rendering any HTML.

### Scenario C: AuthProvider Sets Authenticated State Incorrectly

If `initAuth()` or `onAuthStateChange` sets `isAuthenticated = true` without a real session:

**Fix:** `isAuthenticated` must default to `false` and only become `true` after `fetchCurrentProfile()` returns a valid profile. The loading state must render a blank/spinner page that contains ZERO app content.

### Scenario D: The Login Page Redirects Back to Dashboard

If something on the login page (a `useEffect`, an auth listener, or middleware for authenticated users) redirects back to `/`:

**Fix:** The login page must NEVER redirect unless the user explicitly submits credentials and gets a success response. Remove any "already authenticated, redirect to dashboard" logic that fires on mount.

### Scenario E: The Middleware Server Client is the Wrong Type

Supabase has `createBrowserClient`, `createServerClient`, and `createRouteHandlerClient`. If the middleware uses `createBrowserClient`, it won't have access to cookies and won't detect the session — so it passes everyone through despite the auth check returning "no user" and the redirect code being present but the redirect not actually being applied.

**Fix:** Middleware must use `createServerClient` with proper cookie handling from `@supabase/ssr`.

### REGARDLESS OF SCENARIO — THE UNIVERSAL SAFETY NET:

The app layout MUST have a server-side auth check that prevents ANY HTML from being sent for protected routes without a valid session. This is the Next.js App Router pattern:

```typescript
// In web/src/app/(protected)/layout.tsx or similar
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function ProtectedLayout({ children }) {
  const cookieStore = cookies();
  const supabase = createServerClient(/* env vars */, {
    cookies: {
      get(name) { return cookieStore.get(name)?.value; },
    },
  });
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  return <>{children}</>;
}
```

This is a SERVER component — it runs on the server before ANY HTML is sent. If there's no user, the browser gets a redirect response, not an app shell.

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-031 Phase 1: Auth gate fix"`

---

## PHASE 2: LOGOUT FIX

HF-030 removed `router.push('/login')` from the logout handler. The user can click logout but nothing navigates.

**Fix:** After `signOut()` completes, call `window.location.href = '/login'`. This is the ONE exception to the "only AuthShellProtected redirects" rule — logout is an explicit user action, not an auth state check.

```typescript
const logout = async () => {
  await supabase.auth.signOut();
  setUser(null);
  setIsAuthenticated(false);
  window.location.href = '/login';
};
```

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-031 Phase 2: Restore logout navigation"`

---

## PHASE 3: REMOVE DIAGNOSTIC LOGGING

Remove ALL console.log statements added in Phase 0. Production must not have auth debug logging.

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-031 Phase 3: Remove diagnostic logging"`

---

## PHASE 4: VERIFY

### 4A: The Definitive Test — MUST PASS ALL

Open a browser that has NEVER visited vialuce.ai (or clear ALL data for vialuce.ai — cookies, localStorage, sessionStorage, everything).

| # | Test | Expected | Method |
|---|------|----------|--------|
| 1 | Navigate to localhost:3000/ | See login page within 2 seconds | Browser |
| 2 | Navigate to localhost:3000/insights | See login page within 2 seconds | Browser |
| 3 | Navigate to localhost:3000/login | See login form | Browser |
| 4 | Console shows ZERO 500 errors | No red errors | Browser DevTools |
| 5 | Console shows ZERO 400 errors | No red errors | Browser DevTools |
| 6 | Network tab shows ZERO requests to /rest/v1/profiles | No profile fetches | Browser DevTools |
| 7 | Network tab shows ZERO requests to /auth/v1/user | No auth calls | Browser DevTools |
| 8 | curl localhost:3000/ returns 307 | Middleware redirects | Terminal |
| 9 | curl localhost:3000/login returns 200 | Login page serves | Terminal |
| 10 | Login with platform@vialuce.com / demo-password-VL1 | Dashboard loads | Browser |
| 11 | After login, navigate to /select-tenant | Tenant selector shows | Browser |
| 12 | Click logout | Returns to login page | Browser |
| 13 | After logout, navigate to / | Redirected to login | Browser |
| 14 | After logout, Network tab shows no profile fetches | Clean logout | Browser DevTools |
| 15 | localStorage has NO supabase keys after logout | Session fully cleared | Browser DevTools |

### 4B: curl Verification

```bash
# Unauthenticated
curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 http://localhost:3000/
# Expected: 307

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 http://localhost:3000/insights/analytics
# Expected: 307

# Login page must NOT contain redirect triggers
curl -s http://localhost:3000/login | grep -c "window.location\|Redirecting"
# Expected: 0
```

### 4C: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next && npm run build 2>&1 | tail -5
# Expected: no errors
```

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-031 Phase 4: Verification"`

---

## PHASE 5: CLT + COMPLETION

### CLT Script: `web/scripts/clt-hf031-verify.ts`

Gates (minimum 15):
1. Middleware exists and exports config with matcher
2. Middleware calls getUser() (not just getSession())
3. Middleware redirects to /login when no user
4. Middleware does NOT set auth cookies when no user
5. AuthShell gate returns children on /login
6. AuthShellProtected is the ONLY component that calls window.location.href to /login
7. initAuth() does NOT call fetchCurrentProfile() when getSession() returns null
8. initAuth() does NOT call fetchCurrentProfile() when getUser() returns null
9. initAuth() does NOT trigger any navigation (no window.location, no router.push)
10. fetchCurrentProfile() returns null on error (never throws)
11. logout() calls signOut() then window.location.href = '/login'
12. No console.log statements in auth files (diagnostic logging removed)
13. curl / returns 307
14. curl /login returns 200
15. curl /login HTML does not contain "Redirecting" or "window.location"
16. Build passes
17. Login page does NOT redirect authenticated users to dashboard on mount (check for useEffect redirects)
18. Protected pages use server-side auth check (if implemented in Phase 1)

### Completion Report: `HF-031_COMPLETION_REPORT.md` at PROJECT ROOT

### PR:
```bash
cd /Users/AndrewAfrica/spm-platform
git push origin dev
gh pr create --base main --head dev \
  --title "HF-031: Comprehensive auth gate fix" \
  --body "Root cause: [from Phase 0 findings]. Fix: [from Phase 1]. CLT: [X]/[X] gates pass (100%)."
```

---

## ANTI-PATTERNS TO AVOID

- **Do NOT add another client-side auth check.** HF-023 through HF-030 added 6 layers of client-side checks. None prevented the browser from rendering the app. The fix must be SERVER-SIDE.
- **Do NOT assume the session is stale.** Firefox NEVER had a session. The app renders without any session at all.
- **Do NOT focus on cookies or cache.** Both browsers exhibit the same behavior with cleared data.
- **Do NOT add more wrapper components.** The component tree has enough wrappers. Fix the existing ones.
- **The test is visual and definitive:** Fresh browser → vialuce.ai → MUST see login page. Not a spinner. Not "Redirecting...". The actual login form. Within 2 seconds.
- **git commands from spm-platform/ root. npm commands from web/.**
- **If Phase 0 reveals something unexpected, adjust the fix accordingly. Do NOT skip Phase 0.**
