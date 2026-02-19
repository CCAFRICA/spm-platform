# HF-050 Architecture Decision Record

## Problem
Supabase auth tokens can persist in browser localStorage after logout or cookie clearing.
Fresh browser with zero cookies can render authenticated platform if localStorage contains
valid JWT tokens.

## Diagnostic Found
- AuthProvider wraps ALL routes — initAuth() fires on /login
- Logout clears cookies but NOT localStorage
- Login page does NOT clear stale auth state
- @supabase/ssr cookie storage does not guarantee localStorage is clean
- signOut(scope:'local') clears Supabase internal state but not all browser storage

## Option A: Disable persistSession on browser client
REJECTED — persistSession: true is hardcoded in @supabase/ssr's createBrowserClient.
Would require forking the package.

## Option B: Defense-in-depth cleanup at every auth boundary
Scale test: Works at 10x? YES (no performance impact)
AI-first: Any hardcoding? NONE (generic sb-* prefix matching)
Transport: N/A (client-side only)
Atomicity: Clean state on failure? YES (cleanup is idempotent)

Implementation:
1. Logout: Clear ALL localStorage sb-* keys + existing cookie cleanup
2. Login page: Clear stale auth state on mount (defensive)
3. signOut service: Clear localStorage at the service level
4. AuthProvider: Skip initAuth on public routes
5. Login page: Use singleton client instead of separate client

CHOSEN: Option B

## Option C: Server-side session management (replace client-side auth)
REJECTED — Massive architectural change. Current auth flow is correct
(getAuthUser validates server-side). The bug is stale CLIENT-side data
surviving cleanup, not a server validation gap.

REJECTED: A (can't modify package), C (overkill — auth validation is correct)
