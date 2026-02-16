# HF-032 Completion Report

## Summary

Fixed middleware cookie leak that caused auth bypass on production. The Supabase middleware client's `setAll` handler writes refreshed tokens to the response. When `getUser()` returned no user (stale/expired session), the redirect to `/login` didn't clear the stale `sb-*` cookies from the browser. On the next request, the middleware saw those cookies, refreshed them successfully, and thought the user was authenticated — redirecting from `/login` back to `/`, rendering the dashboard.

## Root Cause

**Stale `sb-*` cookies survived the redirect to `/login`.**

The loop on production:
```
1. GET / with stale cookies → getUser() → no user → 307 to /login (cookies NOT cleared)
2. GET /login with SAME stale cookies → getUser() → refresh token still valid server-side → user found!
3. Middleware: user && pathname === '/login' → 307 to /
4. GET / → authenticated → dashboard renders
```

The `NextResponse.redirect()` on step 1 was a fresh response (no Supabase cookie handlers), BUT it didn't actively clear the stale cookies. The browser kept them and sent them on step 2.

## Fix

### 1. clearSbCookies() helper (middleware.ts)
- New function that iterates `request.cookies.getAll()` and sets each `sb-*` cookie to empty with `maxAge: 0`
- Applied to the response object so the browser deletes the cookies

### 2. Unauthenticated redirect clears cookies (middleware.ts)
- When `!user && !isPublicPath()`: fresh `NextResponse.redirect(loginUrl)` + `clearSbCookies()`
- Browser receives 307 to `/login` AND Set-Cookie headers that delete all `sb-*` cookies
- Next request to `/login` has NO auth cookies → `getUser()` returns null → pass through

### 3. Public path pass-through clears cookies (middleware.ts)
- When `!user && isPublicPath()`: fresh `NextResponse.next()` + `clearSbCookies()`
- Handles the case where user navigates directly to `/login` with stale cookies
- Prevents stale cookies from persisting and causing issues on subsequent requests

### 4. Authenticated pass-through preserves cookies (middleware.ts)
- When `user` is valid: returns `supabaseResponse` (the response with refreshed tokens from `setAll`)
- Session refresh works correctly for genuinely authenticated users

## The Loop is Broken

```
BEFORE (broken):
  GET / with stale cookies → 307 /login (cookies survive)
  GET /login with stale cookies → getUser() refreshes → 307 /
  Dashboard renders ← BUG

AFTER (fixed):
  GET / with stale cookies → 307 /login + Set-Cookie: sb-*=""; Max-Age=0
  GET /login with NO cookies → getUser() → null → pass through
  Login page renders ← CORRECT
```

## Files Modified

| File | Change |
|------|--------|
| `web/src/middleware.ts` | Added `clearSbCookies()`, applied to all unauthenticated responses (redirect + public pass-through). Restructured flow with `!user` / `user` blocks. |

## Defense-in-Depth Chain (Complete)

| Layer | What | HF |
|-------|------|-----|
| 1. Middleware (server) | 307 redirect to `/login` + clear `sb-*` cookies | HF-032 |
| 2. Middleware env guard | console.warn on missing env vars | HF-031 |
| 3. AuthShell gate | Skip auth hooks on `/login` | PR #10 |
| 4. initAuth() | getSession()+getAuthUser() double-check, signOut() on stale | HF-030 |
| 5. fetchCurrentProfile() | try/catch, never throws, returns null | HF-030 |
| 6. logout() | window.location.href = '/login' (primary) | HF-031 |
| 7. AuthShellProtected | window.location.href = '/login' (backup) | HF-029/030 |
| 8. AuthShellProtected (render) | "Redirecting..." spinner, not page content | HF-028 |

## Verification

| Test | Expected | Actual |
|------|----------|--------|
| `GET /` (unauth) | 307 → `/login?redirect=%2F` | 307 → `/login?redirect=%2F` |
| `GET /` redirect location | `/login` (NOT `/`) | `/login?redirect=%2F` |
| `GET /` redirect Set-Cookie | Zero `sb-*` session cookies | Zero |
| `GET /login` | 200 | 200 |
| Following redirect from `/` | Lands on `/login` (200) | 200 at `/login?redirect=%2F` |
| `/login` HTML | No "Redirecting" text | Clean |
| `/insights` (unauth) | 307 → `/login` | 307 → `/login?redirect=%2Finsights` |

## CLT

```
═══════════════════════════════════════
  TOTAL: 22 gates
  PASSED: 22
  FAILED: 0
  SCORE: 100%
═══════════════════════════════════════
```
