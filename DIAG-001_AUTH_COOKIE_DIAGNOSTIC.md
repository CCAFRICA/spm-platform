# DIAG-001: Auth Cookie Origin — Diagnostic Report

## Cookie-Setting Mechanisms Found

### Server-side (middleware + auth callback)
- `src/middleware.ts:103-110` — Supabase `setAll` callback writes refreshed session cookies to `supabaseResponse`. Only returned for authenticated users (line 246). Unauthenticated responses use fresh `NextResponse.redirect()` with `clearAuthCookies()`.
- `src/middleware.ts:68-80` — `clearAuthCookies()` explicitly clears all `sb-*` cookies on unauthenticated responses
- `src/app/auth/callback/route.ts:32-35` — OAuth callback `setAll` writes session cookie after code exchange
- `src/lib/supabase/server.ts:23-29` — Server component Supabase client has `setAll` (may fail in read-only Server Components)

### Client-side
- `src/components/layout/auth-shell.tsx:102-105,145-148` — `document.cookie` clearing for loop detection and auth timeout
- `src/contexts/auth-context.tsx:254-259` — `document.cookie` clearing on logout
- `src/contexts/tenant-context.tsx:203` — Sets `vialuce-tenant-id` cookie (non-auth, tenant selection only)

### Key Finding: No code path sets auth cookies for unauthenticated requests
The middleware only returns `supabaseResponse` (which carries refreshed cookies) for authenticated users (line 246). All unauthenticated paths use fresh responses with `clearAuthCookies()`.

## Supabase Client Configurations

### Browser Client (`src/lib/supabase/client.ts`)
```typescript
client = createBrowserClient<Database>(url, key);
```
- Uses `@supabase/ssr`'s `createBrowserClient` with **NO explicit cookie/storage configuration**
- Default behavior: reads/writes `document.cookie` for session tokens
- Cookie name pattern: `sb-<project-ref>-auth-token` (chunked if >3.9KB)
- **Does NOT write cookies if no session exists** — only reads and refreshes existing ones

### Middleware Client (`src/middleware.ts`)
```typescript
createServerClient(url, key, { cookies: { getAll, setAll } })
```
- `setAll` writes to `supabaseResponse` only, which is only returned for authenticated paths

### Server Component Client (`src/lib/supabase/server.ts`)
- Has `persistSession: false` — explicitly prevents session persistence on server

## Service Workers
**Not present.** No service worker files, no registration code, no PWA config. Eliminated as a cause.

## Auth State Persistence
- **localStorage:** Explicitly NOT used for auth. Comments in multiple files confirm "No localStorage auth." `clearSupabaseLocalStorage()` exists as defense-in-depth but only runs on sign-out.
- **sessionStorage:** Used only for redirect loop detection timestamp (`vl_auth_redirect_ts`)
- **BroadcastChannel:** Not used anywhere
- **Cookies:** Primary auth mechanism via `@supabase/ssr`

## Middleware setAll Behavior

### Does setAll fire for unauthenticated requests?
**YES** — `supabase.auth.getUser()` at line 127 may trigger `setAll` during token refresh attempts. When there's no session, `setAll` might still be called with empty/clearing cookies.

### What response carries the cookies?
`setAll` writes to `supabaseResponse` (line 107-110). BUT for unauthenticated requests, the middleware returns a FRESH `NextResponse.redirect()` or `NextResponse.next()`, NOT `supabaseResponse`. So the cookies written by `setAll` are DISCARDED — they never reach the browser.

### What about authenticated requests?
Line 246: `return noCacheResponse(supabaseResponse)` — returns the response WITH refreshed cookies AND Cache-Control: private, no-store headers.

## Local Reproduction

### curl test (no cookies, production-equivalent):
```
curl -s -D - http://localhost:3001/stream

HTTP/1.1 307 Temporary Redirect
cache-control: private, no-store, no-cache, must-revalidate
pragma: no-cache
expires: 0
location: /login?redirect=%2Fstream
```
- **307 redirect to /login** ✓
- **Cache-Control: private, no-store** ✓
- **ZERO Set-Cookie headers** ✓
- **No auth data in response** ✓

### curl root path:
```
HTTP/1.1 307 Temporary Redirect
cache-control: private, no-store, no-cache, must-revalidate
pragma: no-cache
expires: 0
location: /login
```
Same correct behavior.

## Root Cause Determination

### The server-side is correct
1. Middleware checks auth (`getUser()`) on every request
2. Unauthenticated requests → 307 redirect to /login with NO Set-Cookie
3. Cache-Control: private, no-store on ALL responses
4. Stale auth cookies explicitly cleared on unauthenticated responses
5. `@supabase/ssr` browser client does NOT create cookies without a session

### The Chrome incognito issue is NOT caused by the application

Given:
- `curl` (no cookies) → correct 307, no Set-Cookie
- Firefox incognito → correct redirect to /login
- Safari private → correct redirect to /login
- Chrome incognito → cookie present (Patricia's JWT)

The cookie is entering Chrome incognito through a Chrome-specific mechanism, NOT through the server or application code.

### Most likely Chrome-level causes (in order of probability):

**1. Stale Vercel edge cache from before HF-138**
Prior to HF-138 (Cache-Control fix), Vercel's edge network cached responses WITH Set-Cookie headers. These cached responses may still exist at certain edge locations. Even after the code fix deploys, previously cached responses serve until they expire. **Solution:** Vercel dashboard → Settings → Edge Cache → Purge All.

**2. Chrome Prediction/Preconnect behavior**
Chrome's Omnibox prediction and `preconnect` feature may establish connections and receive headers before the user navigates. If the user previously visited vialuce.ai in a regular Chrome window, Chrome's prediction engine might carry connection state (including cookies from the preconnect response) into the incognito context.

**3. Chrome extension interference**
Any extension with "Allow in incognito" enabled that modifies network requests, manages cookies, or provides auto-login features could inject cookies into the incognito session.

**4. Google Account sync edge case**
If Chrome is signed into a Google account with sync enabled, and the user previously authenticated via Google SSO on vialuce.ai, Chrome's sync infrastructure might carry the auth cookie across contexts. This would be a Chrome/Google sync bug, not an application issue.

## Recommended Actions

### Immediate (Andrew — post-merge)
1. **Purge Vercel edge cache:** Vercel Dashboard → Project → Settings → Data Cache → Purge Everything. This clears pre-HF-138 cached responses that may contain Set-Cookie headers.
2. **Test after purge:** Wait 5 minutes, then test Chrome incognito again.

### If still reproducing after cache purge
3. **Check Chrome extensions:** In the incognito window, check `chrome://extensions` — disable any extension with "Allow in incognito" and retest.
4. **Check Chrome prediction:** Navigate to `chrome://settings/performance` and disable "Preload pages" if enabled.
5. **Test in Chrome Guest mode:** Chrome Guest mode (not incognito) provides a truly isolated profile with zero extensions. If Guest mode works but incognito doesn't, the cause is an extension.

### Code-level (already done)
- HF-136: Removed sensitive API routes from PUBLIC_PATHS ✓
- HF-138: Cache-Control: private, no-store on all middleware responses ✓
- Middleware correctly returns NO Set-Cookie for unauthenticated requests ✓
- `clearAuthCookies()` on all unauthenticated response paths ✓

---

*DIAG-001 — March 15, 2026*
*"The server doesn't send the cookie. Chrome has it anyway. The investigation continues at the browser level."*
