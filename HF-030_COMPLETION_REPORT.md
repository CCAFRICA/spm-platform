# HF-030 Completion Report

## Summary

Fixed Chrome redirect loop on `/login` caused by stale session cookies and multiple redirect triggers.

## Root Cause

**Three-layer failure creating a redirect loop:**

1. **Stale cookies in Chrome** — `getSession()` returns non-null session data from old cookies, so the "no session" guard passes through. Firefox returns null (works). Chrome returns stale data (loops).

2. **Middleware redirects `/login` to `/`** — The middleware calls `getUser()` server-side, which also sees stale cookies and returns a user. It then redirects `/login` to `/` (thinking the user is authenticated).

3. **Multiple redirect triggers** — After `fetchCurrentProfile()` fails (500 from stale session), `AuthShellProtected` fires `window.location.href = '/login'`. But `router.push('/login')` was ALSO called by `logout()`, `user-menu.tsx`, and `select-tenant/page.tsx`, creating competing/overlapping redirect paths.

**The loop:**
```
/login → middleware sees stale cookie → 307 → /
/ → initAuth() → getSession() stale → fetchCurrentProfile() → profiles 500
→ user=null → AuthShellProtected → window.location.href = '/login'
→ middleware sees stale cookie → 307 → / → LOOP
```

## Fix

### 1. initAuth() Double-Check (auth-context.tsx)
- `getSession()` — local cookie check (no network). If null, bail immediately.
- `getAuthUser()` — server validation (network). If null (stale cookie detected), call `signOut()` to **clear stale cookies** then bail.
- Only if BOTH pass, call `fetchCurrentProfile()`.
- `signOut()` on stale detection breaks the loop: next request to `/login` has no cookies → middleware allows it through.

### 2. fetchCurrentProfile() Safety (auth-service.ts)
- Wrapped entire function in try/catch → always returns `null` on error, never throws.
- Added `getAuthUser()` helper for server-side token validation.

### 3. Single Redirect Trigger
- **Removed** `router.push('/login')` from `logout()` in auth-context.tsx
- **Removed** `router.push('/login')` from `handleLogout()` in user-menu.tsx
- **Removed** `router.push('/login')` from redirect guard in select-tenant/page.tsx
- **Only** `AuthShellProtected` (auth-shell.tsx:80) triggers `/login` redirect via `window.location.href`

### 4. AuthShell Gate (PR #10, preserved)
- On `/login` and `/api/auth`, renders children directly — no `useAuth()`, no `useTenant()`, no Supabase calls.

## Verification

| Test | Expected | Actual |
|------|----------|--------|
| `GET /` (unauth) | 307 → `/login?redirect=%2F` | 307 → `/login?redirect=%2F` |
| `GET /login` | 200 | 200 |
| `GET /login` HTML contains "Redirecting" | No | No |
| `GET /insights` (unauth) | 307 → `/login?redirect=...` | 307 → `/login?redirect=%2Finsights` |
| Static assets | Not 307 | 404 |
| `window.location.href` to `/login` count | 1 (AuthShellProtected) | 1 |
| Active `router.push('/login')` count | 0 | 0 |

## Files Modified

| File | Change |
|------|--------|
| `web/src/lib/supabase/auth-service.ts` | Added `getAuthUser()`, wrapped `fetchCurrentProfile()` in try/catch |
| `web/src/contexts/auth-context.tsx` | `initAuth()` double-check (getSession+getAuthUser), signOut on stale, removed router.push('/login') from logout |
| `web/src/components/layout/user-menu.tsx` | Removed `router.push('/login')` from handleLogout |
| `web/src/app/select-tenant/page.tsx` | Removed `router.push('/login')` from redirect guard |

## CLT

```
═══════════════════════════════════════
  TOTAL: 22 gates
  PASSED: 22
  FAILED: 0
  SCORE: 100%
═══════════════════════════════════════
```

## Defense-in-Depth Chain (Complete)

| Layer | What | HF |
|-------|------|-----|
| 1. Middleware (server) | 307 redirect to `/login` | HF-023 |
| 2. AuthShell gate | Skip auth hooks on `/login` | PR #10 |
| 3. initAuth() | getSession()+getAuthUser() double-check, signOut() on stale | HF-030 |
| 4. fetchCurrentProfile() | try/catch → never throws, returns null | HF-030 |
| 5. AuthShellProtected | ONLY redirect trigger via window.location.href | HF-030 |
| 6. AuthShellProtected (render) | "Redirecting..." spinner, not page content | HF-028 |
