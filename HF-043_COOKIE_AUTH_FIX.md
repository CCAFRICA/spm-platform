# HF-043: AUTH BYPASS — SUPABASE COOKIES PERSIST ACROSS SESSIONS

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## THE PROBLEM — NOW WITH DEFINITIVE ROOT CAUSE

**P0 — Security. Auth bypass STILL PRESENT after HF-041 and HF-042.**

HF-041 fixed middleware fail-open. HF-042 added 4-layer defense-in-depth. Neither worked because **the root cause is cookie-level, not code-level.**

### THE PROOF — COOKIE DUMP FROM INCOGNITO

Andrew opened a brand new incognito window, cleared ALL site data via Application → Storage → Clear Site Data, navigated to vialuce.ai, and the platform loaded with full authentication. He then checked Application → Cookies and found:

**Cookie 1:** `sb-bayqxeiltnpjrvflksfa-auth-token`
- Contains a FULL Supabase session: access_token, refresh_token, user object
- User: `platform@vialuce.com` (id: `5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3`)
- Expires: `2027-03-25` (over a year from now)
- SameSite: Lax
- The access_token contains `"role":"authenticated"` — this is a VALID session

**Cookie 2:** `vialuce-tenant-id`  
- Value: `9b2bb4e3-6828-4451-b3fb-dc384509494f`
- Expires: `2026-02-19`
- SameSite: Lax

### WHY THIS HAPPENS

The middleware creates a Supabase server client with cookie handlers:

```typescript
const supabase = createServerClient(url, key, {
  cookies: {
    getAll() { return request.cookies.getAll(); },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);  // ← THIS IS THE BUG
      });
    },
  },
});
```

When `supabase.auth.getUser()` is called in the middleware, the Supabase SSR library **automatically refreshes the session and sets new cookies on the response** as a side effect. Even when the middleware decides "this user should be redirected to /login", the REDIRECT RESPONSE already has fresh auth cookies attached.

**The chain:**
1. Incognito browser → `GET vialuce.ai/` → no cookies sent
2. Middleware runs → creates Supabase client → calls `getUser()` 
3. `getUser()` finds no session → returns null → middleware decides to redirect to /login
4. BUT — the Supabase cookie handler may still set cookies on the redirect response if there's ANY token refresh attempt
5. OR — more likely — a PREVIOUS non-incognito session's cookies are being sent because the user was logged in before in the same browser profile, and Chrome's "incognito" may share some cookie state with extensions or pre-loaded pages
6. The redirect response to `/login` carries these cookies
7. `/login` page loads → AuthProvider calls `getSession()` → finds valid session from cookies → redirects to `/select-tenant`
8. Platform loads fully authenticated

### THE ACTUAL ROOT CAUSE (MOST LIKELY)

The Supabase auth cookies are set as **`httpOnly: false`** and **`SameSite: Lax`** with a very long expiry (1+ year). The middleware's `setAll` callback unconditionally sets whatever cookies the Supabase library asks it to set, including on redirect responses.

**When the middleware redirects an unauthenticated user to /login, it must NOT set any auth cookies on the redirect response.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT.
4. Final step: `gh pr create --base main --head dev`
5. Commit this prompt to git as first action.

---

## PHASE 0: DIAGNOSTIC — TRACE THE COOKIE LIFECYCLE

```bash
echo "============================================"
echo "HF-043 Phase 0: COOKIE LIFECYCLE TRACE"
echo "============================================"

echo ""
echo "=== 0A: MIDDLEWARE — FULL FILE ==="
cat web/src/middleware.ts

echo ""
echo "=== 0B: HOW COOKIES ARE SET IN MIDDLEWARE ==="
grep -n "cookie\|Cookie\|setAll\|getAll\|set(" web/src/middleware.ts

echo ""
echo "=== 0C: SUPABASE SERVER CLIENT CREATION ==="
find web/src/lib/supabase -name "*.ts" | sort
for f in $(find web/src/lib/supabase -name "*.ts" | grep -v node_modules); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 0D: WHERE IS vialuce-tenant-id COOKIE SET? ==="
grep -rn "vialuce-tenant-id\|tenant-id.*cookie\|cookie.*tenant" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 0E: COOKIE OPTIONS — WHAT EXPIRY AND FLAGS? ==="
grep -rn "maxAge\|max-age\|expires\|httpOnly\|secure\|sameSite\|SameSite" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0F: AUTH CALLBACK — DOES IT SET COOKIES? ==="
cat web/src/app/auth/callback/route.ts 2>/dev/null

echo ""
echo "=== 0G: LOGIN PAGE — DOES IT SET COOKIES? ==="
grep -n "cookie\|Cookie\|setCookie\|document\.cookie" web/src/app/login/page.tsx

echo ""
echo "=== 0H: SELECT-TENANT — DOES IT SET tenant-id COOKIE? ==="
grep -n "cookie\|Cookie\|tenant-id\|tenantId.*cookie" web/src/app/select-tenant/page.tsx 2>/dev/null || \
grep -rn "cookie.*tenant\|tenant.*cookie\|vialuce-tenant" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== 0I: LOGOUT — DOES IT CLEAR COOKIES? ==="
grep -rn "signOut\|logout\|sign.out\|clearCookie\|removeCookie\|delete.*cookie" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15
```

**Document ALL findings. Commit diagnostic.**

**Commit:** `HF-043 Phase 0: Cookie lifecycle diagnostic`

---

## PHASE 1: FIX THE COOKIE BYPASS

There are THREE things that must be fixed:

### FIX 1: Middleware must NOT set auth cookies on redirect responses

When the middleware decides to redirect an unauthenticated user, the redirect response must have clean cookies — no auth tokens.

```typescript
// In middleware.ts — AFTER the auth check, BEFORE returning redirect

if (!user && !isPublic) {
  // Create a CLEAN redirect response — no Supabase cookies
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  const redirectResponse = NextResponse.redirect(loginUrl);
  
  // EXPLICITLY DELETE any Supabase auth cookies from the redirect
  // This prevents the cookie handler's side effects from leaking auth tokens
  const cookieNames = request.cookies.getAll().map(c => c.name);
  cookieNames.forEach(name => {
    if (name.startsWith('sb-') || name === 'vialuce-tenant-id') {
      redirectResponse.cookies.delete(name);
    }
  });
  
  return redirectResponse;
}
```

**CRITICAL:** Do NOT return the `response` variable that was created with the Supabase cookie handler. Create a NEW `NextResponse.redirect()` that does not carry the cookie side effects.

### FIX 2: Middleware must strip auth cookies from response when user is null

Even the `setAll` callback should be conditional:

```typescript
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Only set cookies if we're NOT about to redirect to login
        // We'll track this with a flag
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set(name, value, options);
        });
      },
    },
  }
);

// After getUser():
const { data: { user } } = await supabase.auth.getUser();

if (!user && !isPublic) {
  // IMPORTANT: Return a FRESH redirect, NOT the `response` that has cookies
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  const cleanRedirect = NextResponse.redirect(loginUrl);
  
  // Clear ALL Supabase cookies
  request.cookies.getAll().forEach(cookie => {
    if (cookie.name.startsWith('sb-')) {
      cleanRedirect.cookies.set(cookie.name, '', { maxAge: 0, path: '/' });
    }
  });
  // Also clear tenant cookie
  cleanRedirect.cookies.set('vialuce-tenant-id', '', { maxAge: 0, path: '/' });
  
  return cleanRedirect;
}
```

### FIX 3: Logout must explicitly clear ALL cookies

Find the logout handler and ensure it clears all auth and tenant cookies:

```bash
echo "=== FIND LOGOUT HANDLER ==="
grep -rn "signOut\|handleLogout\|handleSignOut\|onLogout" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15
```

In the logout handler, add:

```typescript
// After supabase.auth.signOut()
document.cookie = 'vialuce-tenant-id=; path=/; max-age=0';
// Supabase cookies should be cleared by signOut(), but force it:
document.cookie.split(';').forEach(c => {
  const name = c.trim().split('=')[0];
  if (name.startsWith('sb-')) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
});
```

### FIX 4: Verify cookie security attributes

All auth cookies should be:
- `httpOnly: true` (prevents JavaScript access)
- `secure: true` (HTTPS only in production)
- `sameSite: 'lax'` (minimum)
- `maxAge` should match the session lifetime, NOT 1+ year
- `path: '/'`

Check if the Supabase client is configured with appropriate cookie options:

```bash
grep -rn "cookieOptions\|cookie.*options\|maxAge\|max.age" web/src/lib/supabase/ --include="*.ts"
```

If no explicit cookie options are set, the Supabase SSR library uses defaults that may include very long expiry. Add explicit options:

```typescript
// In the Supabase server client creation
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24, // 24 hours, not 1 year
  path: '/',
};
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Middleware creates CLEAN redirect (not reusing response with cookies) | Code review | New NextResponse.redirect() for unauthenticated |
| PG-2 | Redirect response clears sb- cookies | grep for cookies.delete or maxAge: 0 | Present |
| PG-3 | Redirect response clears vialuce-tenant-id | grep for tenant-id deletion | Present |
| PG-4 | Logout clears all cookies | Code review | Explicit cookie cleanup in logout handler |

**Commit:** `HF-043 Phase 1: Strip auth cookies from redirect responses + explicit logout cleanup`

---

## PHASE 2: VERIFY — COOKIE BEHAVIOR

```bash
echo "=== 2A: UNAUTHENTICATED — CHECK RESPONSE HEADERS ==="
echo "--- Request to / with NO cookies — check Set-Cookie headers ---"
curl -sI --max-redirs 0 http://localhost:3000/ 2>&1 | grep -i "set-cookie\|location\|HTTP"

echo ""
echo "--- The redirect response must NOT have sb- cookies ---"
curl -sI --max-redirs 0 http://localhost:3000/ 2>&1 | grep -i "set-cookie" | grep "sb-"
echo "(empty = PASS — no auth cookies on redirect)"

echo ""
echo "--- The redirect response must NOT have vialuce-tenant-id ---"
curl -sI --max-redirs 0 http://localhost:3000/ 2>&1 | grep -i "set-cookie" | grep "vialuce-tenant-id"
echo "(empty = PASS — no tenant cookie on redirect)"

echo ""
echo "=== 2B: UNAUTHENTICATED — FOLLOW REDIRECT ==="
echo "--- Follow redirect to /login — check THAT response too ---"
curl -sI -L http://localhost:3000/ 2>&1 | grep -i "set-cookie\|location\|HTTP"

echo ""
echo "=== 2C: /landing PAGE — NO AUTH COOKIES ==="
curl -sI http://localhost:3000/landing 2>&1 | grep -i "set-cookie"
echo "(should be empty or minimal — no sb- auth tokens)"

echo ""
echo "=== 2D: PROTECTED ROUTE — CLEAN REDIRECT ==="
curl -sI --max-redirs 0 http://localhost:3000/configure 2>&1 | grep -i "set-cookie\|location\|HTTP"
echo "(should redirect to /login with NO sb- cookies)"
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5 | / redirect has ZERO sb- Set-Cookie headers | curl -sI | No sb- cookies |
| PG-6 | / redirect has ZERO vialuce-tenant-id Set-Cookie | curl -sI | No tenant cookie |
| PG-7 | /landing has ZERO sb- Set-Cookie headers | curl -sI | No sb- cookies |
| PG-8 | /configure redirect has ZERO sb- Set-Cookie headers | curl -sI | No sb- cookies |

**Commit:** `HF-043 Phase 2: Cookie header verification`

---

## PHASE 3: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-9 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-10 | Build: clean | `npm run build` exit code | 0 |
| PG-11 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |

### Completion report

Create `HF-043_COMPLETION_REPORT.md` at PROJECT ROOT with all 11 proof gates and terminal evidence.

### Manual browser gates (for Andrew)

**CRITICAL TEST PROTOCOL:**
1. Close ALL browser windows (regular and incognito)
2. Open a brand new incognito window
3. Open DevTools → Application → Cookies BEFORE navigating
4. Navigate to vialuce.ai
5. Check cookies — there must be ZERO sb- cookies and ZERO vialuce-tenant-id cookies
6. The page must show the landing page, NOT the platform

| # | Test | Expected |
|---|------|----------|
| M-1 | Incognito → vialuce.ai → check cookies FIRST | ZERO sb- cookies, ZERO vialuce-tenant-id |
| M-2 | Page renders as landing page | Marketing content, NOT dashboard/GPV |
| M-3 | No sidebar, no tenant data | Clean public page |
| M-4 | Console: zero 400/500 errors | No Supabase data queries |
| M-5 | After test: log in normally | Login works, dashboard loads |
| M-6 | Logout → check cookies | sb- cookies CLEARED, tenant-id CLEARED |
| M-7 | After logout → refresh | Landing page or login page, NOT platform |

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-043: Fix auth cookie persistence — strip cookies from redirect responses" \
  --body "## Root Cause (DEFINITIVE)
Supabase SSR middleware sets auth cookies as a SIDE EFFECT of calling getUser().
When middleware redirects unauthenticated users to /login, the redirect response
CARRIES these cookies. The login page then finds a valid session and redirects
to /select-tenant, bypassing authentication entirely.

Additionally, the vialuce-tenant-id cookie persists with long expiry, causing
the platform to auto-select a tenant for unauthenticated users.

## Evidence
Andrew dumped cookies from incognito window after clearing all site data:
- sb-*-auth-token: full session for platform@vialuce.com, expires 2027
- vialuce-tenant-id: 9b2bb4e3..., expires 2026-02-19

## Fix
1. Middleware: create CLEAN redirect responses without cookie handler side effects
2. Middleware: explicitly delete all sb- and tenant cookies on redirect responses
3. Logout: explicitly clear all auth and tenant cookies
4. Cookie options: set appropriate maxAge and security flags

## Verification
- curl: / redirect has ZERO Set-Cookie headers with sb- prefix
- curl: /landing has ZERO auth cookies
- Browser: incognito shows landing page, ZERO cookies set before auth
- Build: clean, zero TypeScript errors

## Proof Gates: 11 — see HF-043_COMPLETION_REPORT.md"
```

**Commit:** `HF-043 Phase 3: Build verification, completion report, PR`

---

## PROOF GATE SUMMARY (11 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-4 | Cookie stripping fix | 1 | 4 |
| PG 5-8 | Cookie header verification | 2 | 4 |
| PG 9-11 | Build + verification | 3 | 3 |

---

## ANTI-PATTERNS TO AVOID

- **Do NOT reuse the `response` variable for redirects.** The `response` from the Supabase cookie handler has cookies attached. Create a NEW `NextResponse.redirect()` for unauthenticated redirects.
- **Do NOT just add more client-side guards.** The bug is server-side — cookies are set on the HTTP response before any client-side code runs.
- **Do NOT modify AuthProvider, AuthShell, page.tsx, or locale-context.** Those fixes from HF-042 are fine. The remaining bug is purely in the middleware cookie handling.
- **The test is cookie-based:** After the fix, `curl -sI vialuce.ai` must show ZERO `Set-Cookie` headers with `sb-` prefix on the redirect response.
- **curl IS sufficient for this test** because the bug is in HTTP response headers, not client-side JavaScript.

---

*HF-043 — February 18, 2026*
*"The bouncer was redirecting people to the exit while handing them a VIP wristband on the way out."*
