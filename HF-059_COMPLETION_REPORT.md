# HF-059 Completion Report: Login Redirect Loop Fix

## Summary
P0 production fix. After merging OB-97 (PR #91), vialuce.ai entered an infinite redirect loop — 313+ requests, "Loading..." spinner indefinitely, users unable to access the platform.

## Root Cause Analysis

### Primary: Stale Middleware roleDefaults
Middleware's `roleDefaults` map pointed to routes eliminated by OB-97:
- `manager → /insights` (eliminated)
- `viewer → /my-compensation` (eliminated)
- `sales_rep → /my-compensation` (eliminated)
- `support → /investigate` (eliminated)
- Default fallback: `/insights` (eliminated)

When these routes didn't resolve, the redirect chain broke.

### Secondary: Triple Auth Gating Race Condition
Three independent auth checks fired concurrently:
1. **Middleware** (server-side 307 to /login)
2. **AuthShellProtected** (client-side `window.location.replace('/login?redirect=...')`)
3. **Page-level checks** (page.tsx, perform/page.tsx — `window.location.replace('/landing')`)

During `initAuth()` async hydration, `isAuthenticated=false` momentarily while `isLoading` transitions to `false`. The page-level redirect fires first, middleware sees valid cookies and redirects back → infinite loop.

### Tertiary: Middleware Ignoring Redirect Param
When authenticated users arrived at `/login?redirect=%2Foperate`, middleware ignored the `redirect` query parameter and always used `roleDefaults`. This prevented the redirect chain from resolving after AuthShellProtected correctly sent users to login.

## Fixes Applied

### 1. middleware.ts — Stale roleDefaults (Lines 224-234)
```
BEFORE: manager→/insights, viewer→/my-compensation, support→/investigate, default→/insights
AFTER:  manager→/perform, viewer→/perform, support→/perform, default→/perform
```

### 2. middleware.ts — Honor redirect query param (Lines 196-202)
When authenticated user arrives at `/login?redirect=X`, redirect to X instead of roleDefaults (unless X points back to /login).

### 3. auth-shell.tsx — Redirect loop detection (Lines 86-110)
SessionStorage-based loop breaker: if a redirect to /login fires within 3 seconds of the last redirect, detect the loop, clear all auth cookies client-side, and navigate to /login without a redirect param.

### 4. page.tsx + perform/page.tsx — Remove redundant auth gates
Removed page-level `useEffect` auth checks that fired `window.location.replace('/landing')`. These were redundant with middleware (server) and AuthShellProtected (client), and their race conditions caused the loop.

## Files Modified
| File | Lines Changed |
|------|--------------|
| `web/src/middleware.ts` | +21 −6 |
| `web/src/components/layout/auth-shell.tsx` | +34 −2 |
| `web/src/app/page.tsx` | +6 −17 |
| `web/src/app/perform/page.tsx` | +4 −13 |

## Defense-in-Depth Architecture (Post-Fix)
| Layer | Location | Purpose |
|-------|----------|---------|
| Middleware | middleware.ts | Server-side auth gate (307 to /login, clears cookies) |
| AuthShell Gate | auth-shell.tsx:56-64 | Fast-path: skips hooks on public routes |
| AuthShellProtected | auth-shell.tsx:66-141 | Client-side backup redirect + loop detection |
| Page-level | REMOVED | Triple gating eliminated |

## Verification
- `npm run build` exits 0
- All redirect paths traced — no remaining loop vectors
- Comprehensive codebase search: all `window.location.replace('/login')` and `window.location.href = '/login'` calls accounted for
- OB-97 did NOT modify any auth files — the loop was a pre-existing fragility exposed by route changes

## Commits
- `308aeb7` HF-059 Phase 0: Login redirect loop diagnostic
- `8431eda` HF-059 Phase 1: Fix login redirect loop — 4 root causes addressed
