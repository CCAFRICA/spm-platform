# DIAG-009 FINDINGS: Auth Session Persistence
## Date: March 19, 2026

## EXECUTIVE SUMMARY

The Supabase auth cookie persists indefinitely because `@supabase/ssr` sets cookies with a **400-day max-age** and `httpOnly: false` by default, and the platform's `signOut()` uses `scope: 'local'` which clears the browser session but **never revokes the refresh token server-side**. The middleware correctly validates the JWT and auto-refreshes it on every request. The result: once a user authenticates, their session renews itself indefinitely with no server-side revocation, no session lifetime limit, and a cookie that survives 13+ months. The fix must enforce server-side session expiry and reduce cookie lifetime.

## EVIDENCE SUMMARY

### 1. Supabase Client Configuration

- **persistSession:** NOT explicitly set on browser client. Default: `true` (from `@supabase/ssr`)
- **autoRefreshToken:** NOT explicitly set on browser client. Default: `true` (from `@supabase/ssr`)
- **Storage adapter:** Cookie-based via `@supabase/ssr` `createBrowserClient`. Uses `document.cookie` for get/set.
- **Client creation pattern:** Singleton browser client (`client.ts:13` — `let client = null`). Server client via `createServerClient` with Next.js cookie handlers. Service role client disables `persistSession` and `autoRefreshToken`.

**Evidence:** `web/src/lib/supabase/client.ts` line 27: `client = createBrowserClient<Database>(url, key)` — no options passed. All `@supabase/ssr` defaults apply.

### 2. Middleware Auth Check

- **How session is read:** `supabase.auth.getUser()` (line 121) — validates JWT with Supabase server AND auto-refreshes if expired but refresh token is valid.
- **What happens when no session:** Redirects to `/login` (line 163-167), clears all `sb-*` and `vialuce-tenant-id` cookies (line 65-76).
- **PUBLIC_PATHS:** `/login`, `/signup`, `/landing`, `/auth/callback`, `/api/auth`, `/api/health`, `/api/platform/flags`, `/unauthorized`
- **Cache-Control headers:** `private, no-store, no-cache, must-revalidate` on ALL responses (HF-138, line 56).
- **Set-Cookie on middleware response:** `setAll` callback (line 103-111) sets cookies on `supabaseResponse`. When user IS authenticated, the response carries refreshed auth cookies. When NOT authenticated, cookies are cleared.

**Evidence:** `web/src/middleware.ts` — complete file audited. Server boundary is CORRECT. Curl confirms no Set-Cookie on unauthenticated requests.

### 3. Client-Side Session Management

- **Auth state listener:** Present (`auth-context.tsx` line 168). Listens for `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`.
- **Token refresh behavior:** `autoRefreshToken: true` (default). The Supabase client automatically refreshes the access token before expiry using the refresh token. This happens on every `getUser()` call and via the auth state change listener.
- **Logout implementation:** `signOut({ scope: 'local' })` — clears LOCAL browser session only. Does NOT revoke refresh token on Supabase server. Then manually clears `sb-*` cookies via `document.cookie`, `sb-*` keys from `localStorage`, and `sessionStorage` tenant selection.

**Evidence:** `web/src/lib/supabase/auth-service.ts` line 69: `await supabase.auth.signOut({ scope: 'local' })`. Comment explicitly states: "Uses 'local' scope to clear the browser session without revoking the refresh token server-side (avoids network errors blocking logout)."

### 4. Cookie Attributes

- **Cookie name:** `sb-bayqxeiltnpjrvflksfa-auth-token` (Supabase project ref pattern)
- **SameSite:** `lax` (from `@supabase/ssr` DEFAULT_COOKIE_OPTIONS)
- **HttpOnly:** `false` (from `@supabase/ssr` DEFAULT_COOKIE_OPTIONS) — **JavaScript CAN read the auth cookie**
- **Secure:** NOT explicitly set in defaults (browser default applies — sent on HTTPS only if set via HTTPS)
- **Max-Age:** `400 * 24 * 60 * 60` = **34,560,000 seconds = 400 DAYS** (from `@supabase/ssr` DEFAULT_COOKIE_OPTIONS)
- **Domain / Path:** Not set (defaults to current domain and `/`)

**Evidence:** `web/node_modules/@supabase/ssr/dist/module/utils/constants.js`:
```javascript
export const DEFAULT_COOKIE_OPTIONS = {
    sameSite: "lax",
    httpOnly: false,
    maxAge: 400 * 24 * 60 * 60,  // 400 days
};
```

**Curl test results:**
```
GET / → HTTP/2 307, Location: /login, Cache-Control: private, no-store (NO Set-Cookie)
GET /stream → HTTP/2 307, Location: /login?redirect=%2Fstream (NO Set-Cookie)
GET /login → HTTP/2 200, Cache-Control: private, no-store (NO Set-Cookie)
```
Server does NOT set cookies for unauthenticated requests. The issue is entirely client-side persistence.

### 5. Token Refresh

- **Refresh token rotation:** Unknown — depends on Supabase project settings (Dashboard > Authentication > Settings). Not configurable from client code.
- **Session lifetime:** No platform-enforced limit. The 400-day cookie max-age combined with auto-refresh means the session persists until the user explicitly logs out or the cookie is manually deleted.
- **Server-side session revocation:** NOT available via current `signOut({ scope: 'local' })`. Would require `scope: 'global'` to revoke ALL sessions including refresh tokens.

## ROOT CAUSE ANALYSIS

### Hypothesis A: Supabase persistSession stores in localStorage
**PARTIALLY CONFIRMED.** The `@supabase/ssr` browser client uses cookie storage (not localStorage). However, `clearSupabaseLocalStorage()` exists in the codebase specifically because "edge cases (token refresh, OAuth callbacks) may write to localStorage" (auth-service.ts line 63). If localStorage keys survive across Chrome contexts, they could resurrect a session.

### Hypothesis B: Supabase cookie lacks proper attributes
**CONFIRMED.** The cookie has:
- `httpOnly: false` — JavaScript can read/write the auth token
- `maxAge: 400 days` — cookie persists for over a year
- No `Secure` flag set explicitly
The 400-day max-age is the primary persistence mechanism. Even after "clearing" browser data, if cookies aren't included in the clear operation, the session persists.

### Hypothesis C: Supabase SSR middleware sets cookies on every response
**CONFIRMED for authenticated responses.** The middleware's `setAll` callback (line 103-111) refreshes auth cookies on every authenticated request. This means every page load extends the session. Combined with the 400-day max-age, the session effectively never expires.

### Hypothesis D: Root layout initializes client which triggers auto-refresh
**CONFIRMED.** Root layout mounts `AuthProvider` which calls `initAuth()` on every route change. `initAuth()` calls `getSession()` then `getAuthUser()`. The `getAuthUser()` call validates with the server and triggers auto-refresh if the access token is expired. This means navigating to ANY route auto-refreshes the session.

### Hypothesis E: Refresh token has no server-side expiry/rotation
**LIKELY CONFIRMED.** The `signOut({ scope: 'local' })` explicitly does NOT revoke the refresh token server-side. The comment says "avoids network errors blocking logout." But this means: if any client has a copy of the refresh token, it can create new sessions indefinitely. The Supabase project's refresh token rotation settings (if any) are unknown and not configurable from the client.

## CONFIRMED ROOT CAUSE

**The session persists because of a combination of THREE factors working together:**

1. **400-day cookie max-age** (`@supabase/ssr` default). The auth cookie persists for over a year. Users who think they "cleared their browser" may not have cleared cookies. Chrome's "Clear browsing data" dialog treats cookies and cached data as separate checkboxes.

2. **`signOut({ scope: 'local' })` never revokes the refresh token server-side.** Even after logout, the refresh token remains valid on the Supabase server. If any browser context retains the cookie (which persists 400 days), the middleware's `getUser()` call auto-refreshes it.

3. **Auto-refresh on every request.** The middleware calls `getUser()` on every navigation. If the access token is expired but the refresh token is valid, Supabase transparently creates a new session and sets fresh cookies. This creates an indefinite session renewal loop.

**For Chrome incognito specifically:** Chrome incognito does NOT inherit cookies from the main browser. The most likely explanation for auth in incognito "without login" is that the user previously logged in within that incognito session (incognito cookies persist until the window is closed), OR the session was established via a shared link/redirect that carried an auth code.

## RECOMMENDED FIX APPROACH

**Structural fix (three changes, all in the same PR):**

1. **Override `@supabase/ssr` cookie options** — pass `cookieOptions: { maxAge: 60 * 60 * 8 }` (8-hour session) to `createBrowserClient` and the middleware's `createServerClient`. This limits cookie lifetime to a single workday. Users re-authenticate daily.

2. **Change `signOut` to `scope: 'global'`** — revokes ALL refresh tokens server-side. After logout, no browser context can refresh the session. Guard with try/catch for network errors (the current reason `scope: 'local'` was chosen).

3. **Add idle session timeout** — if the user hasn't interacted for N minutes, call `signOut()` client-side. This prevents the "laptop left open" scenario where auto-refresh keeps the session alive indefinitely.

**These three changes address the root cause at every layer:**
- Cookie lifetime limits the persistence window
- Server-side revocation prevents refresh token reuse
- Idle timeout prevents indefinite auto-refresh

## SECURITY IMPACT ASSESSMENT

- **Can an unauthenticated user access tenant data?** NO — the middleware correctly validates the JWT. The issue is that JWTs persist and auto-refresh, not that validation is bypassed.
- **Can a different user on the same machine access another user's data?** YES — if the first user doesn't explicitly log out, their 400-day cookie persists. The next user opening the browser sees the first user's session.
- **Is this Chrome-specific or platform-wide?** Platform-wide (cookie persistence affects all browsers). Chrome's specific behavior with incognito cookie isolation is a separate concern.
- **Does this affect production?** YES — reproducible. CLT122-F2 has been open since February 28.
