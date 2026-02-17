# HF-032: Middleware Cookie Leak — The Actual Root Cause

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. If uncertain, make the safe choice and document it. Do NOT stop between phases.**

## REPO ROOT RULE
**git commands must run from repo root (`/Users/AndrewAfrica/spm-platform`), NOT from `web/`. Always `cd /Users/AndrewAfrica/spm-platform` before `git add/commit/push/status`. `npm`/`npx` commands run from `web/`.**

---

## THE ROOT CAUSE — FINALLY FOUND

Network tab with Preserve Log + Disable Cache on production (vialuce.ai) reveals:

```
Row 1: GET vialuce.ai → 307 (redirect) → location: https://vialuce.ai/ ← WRONG! Should be /login
Row 2: GET vialuce.ai → 200 (dashboard renders)
```

**The 307 redirect points to `https://vialuce.ai/`, NOT to `/login`.** The middleware is redirecting to itself.

curl without cookies returns the correct redirect to `/login`. The browser gets a different redirect because:

1. The middleware creates a Supabase server client
2. The Supabase client's `getUser()` call refreshes/touches auth tokens
3. The Supabase middleware client is configured to SET COOKIES on the response
4. The 307 redirect response carries `Set-Cookie` headers that create or refresh a session
5. Browser stores those cookies, follows the redirect
6. On the next request, middleware sees the cookies → thinks user is authenticated
7. Middleware has "redirect authenticated users away from /login" logic → redirects to `/`
8. Dashboard renders

**On localhost, this doesn't happen** because there are no stale cookies and the Supabase client doesn't set cookies on a fresh session. On production, there are residual cookies from previous testing, OR the middleware is creating cookies even for unauthenticated users.

## WHAT MUST HAPPEN

1. When middleware determines the user is NOT authenticated, the redirect response to `/login` must NOT include any `Set-Cookie` headers from the Supabase client
2. When middleware determines the user IS authenticated and they're on `/login`, it should redirect to `/` (this is correct behavior — but ONLY if the session is genuinely valid)
3. The Supabase middleware client must be configured so that cookie handling doesn't leak onto redirect responses

---

## PHASE 0: DIAGNOSTIC (NO CODE CHANGES)

### 0A: Read the Middleware

```bash
cat web/src/middleware.ts
```

Answer these questions:
1. How is the Supabase client created? (`createServerClient` from `@supabase/ssr`?)
2. Does it use the `cookies()` helper with get/set/remove handlers?
3. Does the cookie set handler write to the RESPONSE object?
4. When `getUser()` returns no user, is the redirect response the SAME response object that has the cookie handlers attached?
5. Is there any logic that redirects authenticated users from `/login` to `/`?

### 0B: Read the Supabase Client Creation for Middleware

```bash
# Find how middleware Supabase client is created
grep -rn "createServerClient\|createMiddlewareClient\|createClient" web/src/middleware.ts web/src/lib/supabase/
```

The standard `@supabase/ssr` middleware pattern looks like this:

```typescript
const supabase = createServerClient(URL, ANON_KEY, {
  cookies: {
    get(name) { return request.cookies.get(name)?.value },
    set(name, value, options) { 
      response.cookies.set({ name, value, ...options }) // ← THIS IS THE PROBLEM
    },
    remove(name, options) { 
      response.cookies.set({ name, value: '', ...options })
    },
  }
});
```

If `set` writes to the response, then ANY Supabase auth operation (including `getUser()` which refreshes tokens) will put cookies on the response — INCLUDING the 307 redirect response.

### 0C: Check for Authenticated-User-on-Login Redirect

```bash
grep -n "login" web/src/middleware.ts
```

Is there logic like:
```typescript
if (user && pathname === '/login') {
  return NextResponse.redirect(new URL('/', request.url));
}
```

This would explain the redirect to `/` instead of `/login`.

### 0D: Trace All Set-Cookie Behavior

```bash
grep -rn "set.*cookie\|Set-Cookie\|cookies().set\|response.cookies" web/src/middleware.ts web/src/lib/supabase/
```

**Document ALL findings before making changes.**

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-032 Phase 0: Middleware cookie diagnostic"`

---

## PHASE 1: FIX

Based on Phase 0 findings, apply the correct fix. The likely pattern:

### Fix 1: Separate Response Objects for Redirect vs Pass-Through

The middleware must use TWO different response objects:
- For unauthenticated → redirect: Create a FRESH `NextResponse.redirect()` with NO cookie handlers
- For authenticated → pass-through: Use the response that has cookie handlers (so session refresh works)

```typescript
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip static files and API routes
  if (shouldSkip(pathname)) return NextResponse.next();
  
  // Create response for cookie handling
  let response = NextResponse.next({ request: { headers: request.headers } });
  
  // Create Supabase client with cookie handlers on THIS response
  const supabase = createServerClient(URL, ANON_KEY, {
    cookies: {
      get(name) { return request.cookies.get(name)?.value },
      set(name, value, options) { response.cookies.set({ name, value, ...options }) },
      remove(name, options) { response.cookies.set({ name, value: '', ...options }) },
    }
  });
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user && !isPublicRoute(pathname)) {
    // CRITICAL: Create a FRESH redirect response — do NOT use the `response` object
    // that has Set-Cookie handlers attached
    const redirectUrl = new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url);
    return NextResponse.redirect(redirectUrl);
    // ↑ This redirect has ZERO cookies. Browser follows it with NO new session.
  }
  
  if (user && pathname === '/login') {
    // User is authenticated and on login page → send to dashboard
    // Use fresh redirect (or carry cookies for session refresh — either is fine here)
    const redirectUrl = new URL('/', request.url);
    return NextResponse.redirect(redirectUrl);
  }
  
  // Authenticated user on protected route → pass through WITH cookie refresh
  return response;
}
```

**The key insight:** `NextResponse.redirect()` creates a NEW response. If you return THIS instead of the `response` object that has cookie handlers, no cookies are set. The browser gets a clean 307 with no session creation.

### Fix 2: Ensure Login Page Does NOT Redirect Authenticated Users on Mount

Check `web/src/app/login/page.tsx` or similar. If it has:
```typescript
useEffect(() => {
  if (isAuthenticated) router.push('/');
}, [isAuthenticated]);
```

This must be guarded:
```typescript
useEffect(() => {
  // Only redirect if user explicitly authenticated (not from stale state)
  if (isAuthenticated && user?.id) {
    window.location.href = '/';
  }
}, [isAuthenticated, user]);
```

### Fix 3: Clear Stale Cookies When No User

If `getUser()` returns null but there ARE cookies on the request, clear them:

```typescript
if (!user) {
  // Clear any stale auth cookies
  const redirectResponse = NextResponse.redirect(loginUrl);
  request.cookies.getAll().forEach(cookie => {
    if (cookie.name.startsWith('sb-')) {
      redirectResponse.cookies.set({
        name: cookie.name,
        value: '',
        maxAge: 0,
        path: '/',
      });
    }
  });
  return redirectResponse;
}
```

This ensures that even if stale cookies exist, they're cleared on the redirect — so the browser arrives at `/login` with a clean slate.

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-032 Phase 1: Fix middleware cookie leak on redirect"`

---

## PHASE 2: VERIFY

### 2A: curl Tests

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 8

# Test 1: Unauthenticated root → 307 to /login (NOT to /)
curl -s -D - -o /dev/null --max-redirs 0 http://localhost:3000/ 2>&1 | grep -i "location"
# Expected: location: /login?redirect=%2F
# MUST NOT be: location: http://localhost:3000/ or location: /

# Test 2: Login page → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
# Expected: 200

# Test 3: Redirect response has NO Set-Cookie headers with sb- prefix
curl -s -D - -o /dev/null --max-redirs 0 http://localhost:3000/ 2>&1 | grep -i "set-cookie"
# Expected: NO output (no cookies set on redirect)

# Test 4: Following the redirect leads to login, not back to /
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -L --max-redirs 1 http://localhost:3000/
# Expected: 200 (login page after following one redirect)
```

### 2B: Browser Test — THE DEFINITIVE TEST

1. Build and run dev server
2. Open Chrome incognito
3. DevTools → Network tab → check "Preserve log" AND "Disable cache"
4. Navigate to localhost:3000/
5. **MUST see login page. Not dashboard. Not spinner. Login form.**
6. Network tab first row: `localhost:3000/` → 307 → location: `/login?redirect=%2F`
7. Network tab second row: `localhost:3000/login` → 200
8. NO subsequent redirects away from /login
9. ZERO `Set-Cookie` headers with `sb-` prefix on the 307 response
10. ZERO requests to Supabase `/rest/v1/profiles` or `/auth/v1/user`

### 2C: Login Flow Test

1. On login page, enter: platform@vialuce.com / demo-password-VL1
2. Should redirect to dashboard or tenant selector
3. Dashboard should show user info and data
4. Click logout → should return to login page
5. After logout, navigate to / → should redirect to /login (NOT dashboard)

**Commit from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-032 Phase 2: Verification"`

---

## PHASE 3: CLT + COMPLETION

### CLT Script: `web/scripts/clt-hf032-verify.ts`

Gates (minimum 15):
1. Middleware creates Supabase client
2. Middleware redirect response (unauthenticated) does NOT carry Set-Cookie headers
3. Middleware redirect response (unauthenticated) location is /login, NOT /
4. Middleware clears stale sb- cookies on redirect (if implemented)
5. Middleware passes through authenticated requests with cookie refresh
6. curl / returns 307 with location /login
7. curl / response has zero sb- Set-Cookie headers
8. curl /login returns 200
9. curl following redirect lands on /login (200), not / (200)
10. Login page does not contain redirect-to-dashboard useEffect without proper guard
11. logout() calls window.location.href = '/login'
12. AuthShell gate skips hooks on /login
13. initAuth() guards fetchCurrentProfile() with getSession+getUser
14. Build passes with zero errors
15. No console.log debug statements in production code

### Completion Report: `HF-032_COMPLETION_REPORT.md` at PROJECT ROOT

### PR:
```bash
cd /Users/AndrewAfrica/spm-platform
git push origin dev
gh pr create --base main --head dev \
  --title "HF-032: Fix middleware cookie leak causing auth bypass" \
  --body "Root cause: Supabase middleware client sets cookies on the 307 redirect response. Browser stores these cookies, follows redirect to /login, middleware sees cookies on next request, thinks user is authenticated, redirects from /login back to /. Dashboard renders without real authentication. Fix: Separate response objects — redirect uses fresh NextResponse.redirect() with no cookie handlers. Stale sb- cookies cleared on redirect. CLT: [X]/[X] gates pass."
```

---

## ANTI-PATTERNS TO AVOID

- **Do NOT modify AuthShell, AuthProvider, or auth-service.** The client-side auth code is fine. This is a middleware-only fix.
- **Do NOT add more client-side auth checks.** Eight layers of client-side defense already exist. The problem is server-side cookie leakage.
- **The response object matters.** If you create a Supabase client with cookie handlers on response A, then return response B (a redirect), the cookies from response A are NOT on response B. This is the fix.
- **Test 3 (no Set-Cookie on redirect) is the critical gate.** If the 307 response has any sb- cookies, the fix is incomplete.
- **Test on localhost FIRST.** Then merge and test production. Do not merge until localhost browser test passes.
- **git commands from spm-platform/ root. npm commands from web/.**
