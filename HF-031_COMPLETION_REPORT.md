# HF-031 Completion Report

## Summary

Restored logout navigation and hardened the authentication gate architecture. The primary gap was that `logout()` cleared Supabase cookies and reset state but did NOT navigate — the user would stay on the protected page until AuthShellProtected's async useEffect fired.

## Root Cause

**logout() did not navigate after sign-out.** HF-030 removed all `router.push('/login')` calls to enforce a "single redirect trigger" rule (AuthShellProtected only). This was correct for preventing redirect loops, but created a gap: clicking logout left the user on the current page with `isAuthenticated=false`, relying entirely on AuthShellProtected's `useEffect` to eventually fire `window.location.href = '/login'`.

The delay between state change and useEffect execution created a window where the user saw a "Redirecting..." spinner instead of immediate navigation.

## Fix

### 1. Restore logout navigation (auth-context.tsx)
- `logout()` now calls `window.location.href = '/login'` after `signOut()` + state cleanup
- Uses full page navigation (not router.push) — clears all client state, cached RSC payloads, and hits middleware fresh
- This is the PRIMARY redirect trigger for logout

### 2. AuthShellProtected backup (auth-shell.tsx, preserved)
- `window.location.href = '/login?redirect=...'` still fires as backup
- Catches edge cases: expired session, failed initAuth, direct navigation
- Defense-in-depth — two independent paths to /login

### 3. Middleware hardening (middleware.ts)
- Added `console.warn()` when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing
- Previously this guard silently returned `NextResponse.next()`, disabling ALL auth enforcement with zero logging

### 4. Comment cleanup
- Updated docstrings in auth-context.tsx, auth-service.ts, user-menu.tsx to reflect the dual-redirect architecture

## Defense-in-Depth Chain (Complete)

| Layer | What | HF |
|-------|------|-----|
| 1. Middleware (server) | 307 redirect to `/login` | HF-023 |
| 2. Middleware env guard | console.warn on missing env vars | HF-031 |
| 3. AuthShell gate | Skip auth hooks on `/login` | PR #10 |
| 4. initAuth() | getSession()+getAuthUser() double-check, signOut() on stale | HF-030 |
| 5. fetchCurrentProfile() | try/catch, never throws, returns null | HF-030 |
| 6. logout() | **window.location.href = '/login'** (primary) | HF-031 |
| 7. AuthShellProtected | window.location.href = '/login' (backup) | HF-029/030 |
| 8. AuthShellProtected (render) | "Redirecting..." spinner, not page content | HF-028 |

## Verification

| Test | Expected | Actual |
|------|----------|--------|
| `GET /` (unauth) | 307 → `/login?redirect=%2F` | 307 → `/login?redirect=%2F` |
| `GET /login` | 200 | 200 |
| `GET /login` HTML contains "Redirecting" | No | No |
| `GET /insights` (unauth) | 307 → `/login?redirect=...` | 307 → `/login?redirect=%2Finsights` |
| Active `window.location.href=/login` count | 2 (logout + AuthShellProtected) | 2 |
| Active `router.push('/login')` count | 0 | 0 |
| Middleware env var warning | console.warn present | console.warn present |

## Files Modified

| File | Change |
|------|--------|
| `web/src/contexts/auth-context.tsx` | logout() now navigates with window.location.href = '/login'; updated docstrings |
| `web/src/middleware.ts` | Added console.warn on missing env vars |
| `web/src/components/layout/user-menu.tsx` | Updated comment in handleLogout |
| `web/src/lib/supabase/auth-service.ts` | Updated docstring |

## CLT

```
═══════════════════════════════════════
  TOTAL: 27 gates
  PASSED: 27
  FAILED: 0
  SCORE: 100%
═══════════════════════════════════════
```
