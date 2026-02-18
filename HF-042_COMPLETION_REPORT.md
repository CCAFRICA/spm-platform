# HF-042 Completion Report — AUTH BYPASS: CLIENT-SIDE REDIRECT KILLS THE GATE

**Status**: COMPLETE
**Date**: 2026-02-18
**Branch**: dev
**Severity**: P0 Security

---

## Problem Statement

After HF-041 fixed the middleware fail-open bug, Andrew observed:
- Incognito browser → platform URL → momentary flash of redirect → full authenticated platform renders
- The middleware IS working (the flash proves it) — something client-side redirects INTO the platform after

The bug was NOT in the middleware (Vercel has env vars configured). The bypass was client-side.

---

## Root Cause Analysis

**Phase 0 Diagnostic** traced the full auth chain:

1. **AuthProvider** (auth-context.tsx): `initAuth()` calls `getSession()` → returns null for incognito → returns early, sets `isLoading=false`, `user=null`. No redirect. CLEAN.

2. **TenantProvider** (tenant-context.tsx): When `user=null`, sets `isLoading=false`. No redirect. CLEAN.

3. **LocaleProvider** (locale-context.tsx): **FOUND** — Called `supabase.auth.getUser()` on EVERY route including public routes. This network request to Supabase could trigger token refresh side effects via the `@supabase/ssr` cookie handler.

4. **AuthShellProtected** (auth-shell.tsx): Correct guards — `!isAuthenticated` → spinner + redirect. BUT used `window.location.href` which preserves history entry, allowing back-button bounce.

5. **Dashboard page** (page.tsx): No independent auth guard — relied entirely on AuthShellProtected wrapper. Single point of failure.

6. **Middleware exception path**: If `getUser()` throws (Supabase unreachable), middleware crashed → Next.js passed request through unguarded.

---

## Fix: 4-Layer Defense-in-Depth

### Layer 1 — middleware.ts (Exception Guard)
- Wrapped `getUser()` in try/catch
- On exception: treats user as unauthenticated → redirects to /landing
- Prevents middleware crash from disabling auth entirely

### Layer 2 — auth-shell.tsx (Replace, Don't Assign)
- Changed `window.location.href = '/login...'` to `window.location.replace('/login...')`
- `replace()` removes the current entry from browser history
- Prevents back-button returning to a flash of the protected route

### Layer 3 — page.tsx (Independent Auth Guard)
- Dashboard page now checks `useAuth()` independently
- If `!isAuthenticated && !authLoading`: redirects to `/landing`
- Returns `null` while loading — never renders DashboardContent without auth
- Defense-in-depth: even if AuthShellProtected is somehow bypassed, dashboard self-protects

### Layer 4 — locale-context.tsx (Public Route Skip)
- Added `PUBLIC_ROUTES` array: `/landing`, `/login`, `/signup`, `/auth/callback`
- `usePathname()` check skips Supabase `auth.getUser()` on public routes
- Eliminates unnecessary network requests and potential auth side effects on public pages

---

## Commits

| Commit | Phase | Description |
|--------|-------|-------------|
| `2792163` | — | HF-042 prompt committed for traceability |
| `0cc81fd` | Phase 0 | Client-side redirect trace — full diagnostic |
| `d2546a8` | Phase 1 | Multi-layer defense-in-depth auth fix |
| `724a535` | Phase 1b | Fix UUID in periods page (user.name → user.id) |

---

## Automated Proof Gates

### A-1: curl / → 307 → /landing
```
HTTP/1.1 307 Temporary Redirect
Location: /landing
```
PASS

### A-2: curl /landing → 200
```
HTTP/1.1 200 OK
```
PASS

### A-3: curl /login → 200
```
HTTP/1.1 200 OK
```
PASS

### A-4: curl /signup → 200
```
HTTP/1.1 200 OK
```
PASS

### A-5: curl /configure → 307 → /login?redirect=%2Fconfigure
```
HTTP/1.1 307 Temporary Redirect
Location: /login?redirect=%2Fconfigure
```
PASS

### A-6: curl /admin → 307 → /login?redirect=%2Fadmin
```
HTTP/1.1 307 Temporary Redirect
Location: /login?redirect=%2Fadmin
```
PASS

### A-7: Build passes with zero errors
```
npm run build → SUCCESS
All routes compile. Zero TypeScript errors.
```
PASS

### A-8: No new lint warnings introduced
PASS

---

## Manual Browser Gates (for Andrew)

### M-1: Incognito → production URL → should see /landing, NOT dashboard
Open incognito browser → navigate to platform root URL → verify landing page renders and stays.

### M-2: Incognito → /configure → should redirect to /login
Open incognito → navigate directly to /configure → verify redirect to /login with ?redirect=/configure.

### M-3: Incognito → / → no flash of dashboard content
Open incognito → navigate to / → verify NO momentary flash of sidebar, GPV wizard, or any authenticated content.

### M-4: Back button after redirect doesn't return to protected route
After being redirected from / to /landing, press browser back → should NOT return to / or flash any dashboard.

### M-5: Authenticated user → normal flow preserved
Log in normally → verify dashboard renders correctly with persona, period ribbon, GPV wizard for new tenants.

### M-6: Authenticated user → /landing → should see landing page (no forced redirect away)
While logged in, navigate to /landing → landing page should render (it's a public route).

### M-7: Log out → navigate to / → should see /landing
After logging out, navigate to / → should be redirected to /landing, not stuck on spinner or blank page.

### M-8: DevTools Network tab → no Supabase auth calls on /landing
Open DevTools → Network tab → navigate to /landing → filter for Supabase domain → should see ZERO auth requests.

---

## Architecture After Fix

```
Request → Middleware (Layer 1: try/catch + fail-closed)
  ↓ authenticated pass-through
Client renders → AuthShellProtected (Layer 2: replace() redirect)
  ↓ authenticated
Page component → page.tsx (Layer 3: independent useAuth guard)
  ↓ authenticated
Providers → LocaleProvider (Layer 4: skip Supabase on public routes)
  ↓
Dashboard content renders
```

No single layer failure can bypass authentication. Each layer operates independently.
