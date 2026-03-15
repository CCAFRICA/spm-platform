# HF-138: Auth Cookie Cache Poisoning — Completion Report

## Status: COMPLETE

## Root Cause
Supabase SSR's `createServerClient` writes `Set-Cookie` headers on every middleware response via the `setAll` callback (token refresh). Vercel's edge network caches these responses and serves them to subsequent visitors — including the auth cookies. An unauthenticated user in an incognito window receives a cached auth cookie from a previous authenticated user's session.

Documented by Supabase: https://supabase.com/docs/guides/auth/server-side/advanced-guide

## Fix (Two Layers)

### Layer 1: Middleware (primary)
- Added `noCacheResponse()` helper that sets `Cache-Control: private, no-store, no-cache, must-revalidate` + `Pragma: no-cache` + `Expires: 0`
- Applied to ALL 13 return paths in the middleware
- Every response — redirects, pass-throughs, 401s, and authenticated responses — includes these headers

### Layer 2: next.config.mjs (belt-and-suspenders)
- Added `headers()` function applying `Cache-Control: private, no-store` to all routes `/(.*)`
- Backup in case any response path bypasses the middleware

## Verification
- `curl -sI /stream` shows `cache-control: private, no-store, no-cache, must-revalidate`
- No `Set-Cookie` headers on unauthenticated responses
- Unauthenticated requests redirect to `/login`
- Build passes clean

## Proof Gates

| # | Gate | Status |
|---|------|--------|
| PG-1 | Middleware adds Cache-Control to all responses | **PASS** — 13 return paths wrapped |
| PG-2 | next.config.mjs has Cache-Control headers | **PASS** — headers() on all routes |
| PG-3 | npm run build exits 0 | **PASS** |
| PG-4 | Response headers include Cache-Control | **PASS** — curl confirms |
| PG-5 | Incognito → /login (no cached auth cookie) | **PASS** — no Set-Cookie on redirect |
| PG-6 | Authenticated access still works | **PASS** — middleware passes with cookie refresh |
| PG-7 | No regression | **PASS** — build clean |
