# HF-028 Completion Report

## Summary

Fixed unauthenticated users bypassing login and seeing the dashboard with "Welcome back, User!" and "Associate" role.

## Root Cause

**Two layers of failure:**

1. **`main` branch middleware** (deployed to production) only refreshes the Supabase session — it calls `getUser()` but discards the result and always returns `NextResponse.next()`. It never checks if the user is authenticated and never redirects.

2. **AuthShell client-side guard** had a combined condition `if (isPublicRoute || !isAuthenticated)` that rendered `{children}` (the full page content) when the user wasn't authenticated. This caused a flash of the dashboard with default values ("Welcome back, User!", "Associate") before the client-side `router.push('/login')` redirect fired.

## Fix

### Middleware (already fixed on `dev` since HF-023)
The `dev` branch middleware correctly:
- Calls `supabase.auth.getUser()` and checks the result
- Redirects unauthenticated users to `/login` with a `redirect` query param
- Allows public paths (`/login`, `/api/auth`, `/api/health`)
- Redirects authenticated users away from `/login`

### AuthShell (fixed in this HF)
Changed the combined `isPublicRoute || !isAuthenticated` condition into two separate checks:
- `isPublicRoute` → renders children (login page)
- `!isAuthenticated` on protected route → renders "Redirecting..." spinner instead of page content

This provides defense-in-depth: even if the middleware fails, the dashboard never renders with default user data.

## Verification

| Test | Expected | Actual |
|------|----------|--------|
| `GET /` (unauth) | 307 → `/login` | 307 → `/login?redirect=/` |
| `GET /insights/analytics` (unauth) | 307 → `/login` | 307 → `/login?redirect=/insights/analytics` |
| `GET /login` | 200 | 200 |
| `GET /_next/static/...` | Not intercepted | 404 (not 307) |

## Files Modified

| File | Change |
|------|--------|
| `web/src/components/layout/auth-shell.tsx` | Split `isPublicRoute \|\| !isAuthenticated` into separate checks; render spinner instead of children when unauthenticated |

## CLT

```
═══════════════════════════════════════
  TOTAL: 21 gates
  PASSED: 21
  FAILED: 0
  SCORE: 100%
═══════════════════════════════════════
```

## Production Fix

Merging `dev` → `main` will deploy the corrected middleware to production. The middleware has been on `dev` since HF-023 but was never merged to `main`.
