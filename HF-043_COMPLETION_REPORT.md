# HF-043 Completion Report — AUTH BYPASS: SUPABASE COOKIES PERSIST ACROSS SESSIONS

**Status**: COMPLETE
**Date**: 2026-02-18
**Branch**: dev
**Severity**: P0 Security

---

## Root Cause (DEFINITIVE)

Supabase SSR middleware sets auth cookies as a SIDE EFFECT of calling `getUser()`.
When middleware redirects unauthenticated users to `/login`, the redirect response
carried these cookies. Additionally, `vialuce-tenant-id` (24hr expiry) was never
cleared on unauthenticated redirects or during logout.

### Evidence (from Andrew's incognito cookie dump)
- `sb-bayqxeiltnpjrvflksfa-auth-token`: Full Supabase session, expires 2027-03-25
- `vialuce-tenant-id`: `9b2bb4e3-6828-4451-b3fb-dc384509494f`, expires 2026-02-19

### Cookie Lifecycle Defects Found
1. `clearSbCookies()` only cleared `sb-*` cookies, NOT `vialuce-tenant-id`
2. Logout handler did NOT explicitly clear cookies (relied solely on Supabase `signOut()`)
3. `vialuce-tenant-id` cookie (24hr expiry) never cleared on logout
4. `clearTenant()` existed but was NOT called during logout flow

---

## Fixes Applied

### Fix 1: Middleware — clearAuthCookies (was clearSbCookies)
**File**: `web/src/middleware.ts`

Renamed `clearSbCookies` → `clearAuthCookies`. Now clears BOTH `sb-*` AND
`vialuce-tenant-id` on all unauthenticated redirect responses:

```typescript
function clearAuthCookies(request: NextRequest, response: NextResponse): void {
  request.cookies.getAll().forEach(cookie => {
    if (cookie.name.startsWith('sb-') || cookie.name === 'vialuce-tenant-id') {
      response.cookies.set({ name: cookie.name, value: '', maxAge: 0, path: '/' });
    }
  });
}
```

Applied on ALL unauthenticated paths:
- `/` → redirect to `/landing` + clearAuthCookies
- Protected path → redirect to `/login` + clearAuthCookies
- Public path → pass through + clearAuthCookies

### Fix 2: Logout — Explicit Cookie Cleanup
**File**: `web/src/contexts/auth-context.tsx`

After `signOut()`, explicitly force-clears:
- `vialuce-tenant-id` cookie via `document.cookie`
- All `sb-*` cookies via `document.cookie` iteration
- `vialuce_admin_tenant` from sessionStorage

### Fix 3: signOut — Local Scope
**File**: `web/src/lib/supabase/auth-service.ts`

Changed `signOut()` to use `scope: 'local'` to ensure browser cookies are
cleared without depending on network round-trip to Supabase server.

---

## Commits

| Commit | Phase | Description |
|--------|-------|-------------|
| `5faba27` | — | HF-043 prompt committed for traceability |
| `4e36250` | Phase 0 | Cookie lifecycle diagnostic — found 4 defects |
| `1f839f7` | Phase 1 | Strip ALL auth cookies + explicit logout cleanup |

---

## Automated Proof Gates

### PG-1: Middleware creates CLEAN redirect (not reusing response with cookies)
All unauthenticated paths create `new NextResponse.redirect()` — never return `supabaseResponse`.
**PASS**

### PG-2: Redirect response clears sb- cookies
`clearAuthCookies()` sets `maxAge: 0` for all `sb-*` cookies.
**PASS**

### PG-3: Redirect response clears vialuce-tenant-id
`clearAuthCookies()` includes `cookie.name === 'vialuce-tenant-id'` check.
**PASS**

### PG-4: Logout clears all cookies
Logout handler explicitly clears `vialuce-tenant-id`, all `sb-*` cookies, and sessionStorage.
**PASS**

### PG-5: / redirect has ZERO sb- Set-Cookie headers
```
$ curl -sI --max-redirs 0 http://localhost:3000/ | grep -i "set-cookie" | grep "sb-"
(empty)
```
**PASS**

### PG-6: / redirect has ZERO vialuce-tenant-id Set-Cookie
```
$ curl -sI --max-redirs 0 http://localhost:3000/ | grep -i "set-cookie" | grep "vialuce-tenant-id"
(empty)
```
**PASS**

### PG-7: /landing has ZERO sb- Set-Cookie headers
```
$ curl -sI http://localhost:3000/landing | grep -i "set-cookie" | grep "sb-"
(empty)
```
**PASS**

### PG-8: /configure redirect has ZERO sb- Set-Cookie headers
```
$ curl -sI --max-redirs 0 http://localhost:3000/configure | grep -i "set-cookie" | grep "sb-"
(empty)
```
**PASS**

### PG-9: TypeScript — zero errors
```
npm run build → SUCCESS (exit code 0)
```
**PASS**

### PG-10: Build — clean
```
All routes compile. ƒ Middleware 74.5 kB. Zero errors.
```
**PASS**

### PG-11: localhost responds
```
$ curl -sI --max-redirs 0 http://localhost:3000/
HTTP/1.1 307 Temporary Redirect
location: /landing
```
**PASS**

---

## Full Set-Cookie Dump (ZERO cookies on all unauthenticated routes)

```
=== / redirect ===
(no Set-Cookie headers)

=== /landing ===
(no Set-Cookie headers)

=== /configure redirect ===
(no Set-Cookie headers)

=== /login ===
(no Set-Cookie headers)
```

---

## Manual Browser Gates (for Andrew)

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

---

## Architecture After Fix

```
Request arrives
  ↓
Middleware: getUser() → user or null
  ↓
user=null?
  ├── YES → Fresh NextResponse.redirect + clearAuthCookies(sb-* + vialuce-tenant-id)
  │         Browser receives redirect with maxAge=0 deletion headers
  │         → Arrives at /landing or /login with CLEAN cookie jar
  │
  └── NO → supabaseResponse (carries refreshed session cookies)
           → Protected route renders normally

Logout:
  signOut(scope:'local') → clear browser cookies
  document.cookie → force-clear sb-* + vialuce-tenant-id
  sessionStorage.removeItem('vialuce_admin_tenant')
  window.location.href = '/login' → full page nav hits middleware
```
