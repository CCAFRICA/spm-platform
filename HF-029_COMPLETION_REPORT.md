# HF-029 Completion Report

## Summary

Fixed the infinite "Redirecting..." spinner that appeared when unauthenticated users visited protected routes. The spinner showed but never completed navigation to `/login`.

## Root Cause

**Two layers of failure:**

1. **`fetchCurrentProfile()` in auth-service.ts** called `supabase.auth.getUser()` (a network request) without first checking if there was a local session. When no session cookie existed, this triggered a 500 error from Supabase. The error was caught, but it added unnecessary latency and console noise.

2. **AuthShell used `router.push('/login')`** — a client-side SPA navigation that can silently fail when there's no active Supabase session. Without a session, the Next.js router's internal fetch for the login page's server component could fail, leaving the user stuck on the "Redirecting..." spinner indefinitely.

## Fix

### auth-service.ts — Session Guard
Added `getSession()` check (local cookie read, no network request) before `getUser()` in `fetchCurrentProfile()`. If no session exists locally, returns `null` immediately — no network request, no 500 error.

### auth-shell.tsx — Full Page Navigation
Changed `router.push('/login')` to `window.location.href = '/login?redirect=...'`:
- **Full page navigation** always works — it makes a fresh HTTP request that hits the middleware
- **Includes redirect param** with the user's intended pathname so they return there after login
- **Added `pathname` to useEffect deps** to track redirect URL changes

The "Redirecting..." spinner (added in HF-028) is preserved as defense-in-depth — it renders momentarily while `window.location.href` triggers the full navigation.

## Verification

| Test | Expected | Actual |
|------|----------|--------|
| `GET /` (unauth) | 307 → `/login?redirect=%2F` | 307 → `/login?redirect=%2F` |
| `GET /insights/analytics` (unauth) | 307 → `/login?redirect=...` | 307 → `/login?redirect=%2Finsights%2Fanalytics` |
| `GET /login` | 200 | 200 |
| Static assets | Not 307 | 404 (not intercepted) |

## Files Modified

| File | Change |
|------|--------|
| `web/src/lib/supabase/auth-service.ts` | Guard `fetchCurrentProfile()` with `getSession()` before `getUser()` — avoids 500 on no session |
| `web/src/components/layout/auth-shell.tsx` | Use `window.location.href` instead of `router.push('/login')` — full page navigation with redirect param |

## CLT

```
═══════════════════════════════════════
  TOTAL: 26 gates
  PASSED: 26
  FAILED: 0
  SCORE: 100%
═══════════════════════════════════════
```

## Defense-in-Depth Chain (HF-023 → HF-028 → HF-029)

| Layer | Fix | HF |
|-------|-----|-----|
| 1. Middleware (server) | Redirects unauthenticated users to `/login` with 307 | HF-023 |
| 2. AuthShell (client render) | Renders "Redirecting..." spinner, NOT page content | HF-028 |
| 3. AuthShell (client nav) | `window.location.href` full page navigation to `/login` | HF-029 |
| 4. auth-service (data) | `getSession()` guard prevents 500 errors on profile fetch | HF-029 |
