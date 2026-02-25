# HF-059 Phase 0: Login Redirect Loop Diagnostic

## Root Cause Analysis

### Pattern A: Middleware + AuthShell Double-Redirect (CONFIRMED)
Both middleware AND AuthShellProtected redirect unauthenticated users to /login.
- Middleware: server-side, redirects to `/login?redirect=X` via 307
- AuthShellProtected: client-side, does `window.location.replace('/login?redirect=X')`
- PerformPage: ALSO does `window.location.replace('/landing')` (TRIPLE gate)

### Pattern E: Client-Side Auth Race Condition (PRIMARY CAUSE)
AuthShellProtected checks `isAuthenticated` from `useAuth()`. The AuthProvider's `initAuth()`
is async (getSession → getAuthUser → fetchCurrentProfile). During this async chain:
1. `isLoading` starts as `true` → spinner shows → OK so far
2. `isLoading` becomes `false` in `finally` block
3. BUT `isAuthenticated` may still be `false` if profile fetch is slow
4. AuthShellProtected sees: `isLoading=false, isAuthenticated=false` → fires redirect
5. Middleware sees authenticated user on /login → 307 back to /operate
6. Page reloads → same race condition → loop

### Stale roleDefaults (SECONDARY — breaks manager/support roles)
Middleware `roleDefaults` reference eliminated OB-97 routes:
- `manager: '/insights'` → legacy page, NOT in 4-workspace model
- `support: '/investigate'` → eliminated by OB-97
- Default: `'/insights'` → also legacy
- Should be: manager → `/perform`, support → `/perform`, default → `/perform`

## OB-97 Impact
OB-97 made ZERO changes to middleware.ts, auth-shell.tsx, auth-context.tsx, or layout.tsx.
The redirect loop is a pre-existing fragility in the auth gating architecture exposed
by the new workspace routing.

## Fix Plan
1. Fix middleware roleDefaults to use OB-97 workspace routes
2. Remove redundant client-side auth redirect from PerformPage (middleware handles it)
3. Verify AuthShellProtected timing is correct (isLoading guards the redirect)
