# HF-050 Forensic Diagnostic: LocalStorage Auth Bypass

## 1. Supabase Client Creation Points

| Location | Type | Storage |
|----------|------|---------|
| `web/src/lib/supabase/client.ts` | `createBrowserClient` from `@supabase/ssr` | Cookie-backed (hardcoded `persistSession: true`) |
| `web/src/lib/supabase/server.ts` | `createServiceRoleClient` | `persistSession: false` (server-only) |
| `web/src/middleware.ts` | `createServerClient` from `@supabase/ssr` | Reads request cookies |
| `web/src/app/login/page.tsx:47` | **SEPARATE** `createBrowserClient` | Cookie-backed (default) |

**Key finding**: The login page creates a SEPARATE Supabase client for Google OAuth. This client is NOT the singleton from `client.ts`.

## 2. Auth Initialization Sequence (auth-context.tsx)

```
AuthProvider mounts (layout.tsx wraps ALL routes)
  ↓
initAuth() fires (useEffect, no route check)
  ↓
Step 1: getSession()     → reads local cookies (NO network)
Step 2: getAuthUser()    → validates with Supabase server (network)
Step 3: fetchCurrentProfile() → queries profiles table
Step 4: onAuthStateChange listener → set up ONLY if Steps 1-3 pass
  ↓
isLoading = false
```

## 3. isAuthenticated Gating

**isAuthenticated is gated on `!!user`**, which is set ONLY after:
1. `getSession()` returns non-null (local check)
2. `getAuthUser()` returns non-null (server validation)
3. `fetchCurrentProfile()` returns a profile

**Verdict**: The server validation (Step 2) IS present. But Step 1 (`getSession()`) must return non-null for Step 2 to run. If stale session data exists in the browser, Step 1 succeeds, and Step 2 may also succeed if the JWT hasn't expired server-side.

## 4. AuthProvider Wrapping

**YES — AuthProvider wraps ALL routes including public ones.**

```tsx
// layout.tsx
<AuthProvider>          ← Wraps EVERYTHING
  <TenantProvider>
    <LocaleProvider>
      <ConfigProvider>
        <AuthShell>     ← Gates public routes from AuthShellProtected
          {children}
        </AuthShell>
      </ConfigProvider>
    </LocaleProvider>
  </TenantProvider>
</AuthProvider>
```

AuthShell gates public routes from using `AuthShellProtected` (which calls `useAuth()`), but `initAuth()` inside AuthProvider still fires on /login, /landing, /signup.

## 5. Logout localStorage Cleanup

**NO — logout does NOT clear localStorage.**

Current cleanup in `logout()` (auth-context.tsx:220-249):
- ✅ `signOut()` (scope: 'local') — clears Supabase local session
- ✅ Clears `sb-*` cookies via `document.cookie`
- ✅ Clears `vialuce-tenant-id` cookie
- ✅ Clears `sessionStorage` tenant selection
- ❌ **Does NOT clear `localStorage` sb-* keys**
- ❌ **Does NOT clear any other localStorage keys**

## 6. persistSession Configuration

| Client | persistSession |
|--------|---------------|
| `createBrowserClient` (client.ts) | `true` (hardcoded by @supabase/ssr) |
| `createBrowserClient` (login page) | `true` (hardcoded by @supabase/ssr) |
| `createServiceRoleClient` (server.ts) | `false` (explicitly set) |
| `createServerClient` (middleware.ts) | Default (irrelevant — server-side) |

## 7. @supabase/ssr Storage Analysis

The `createBrowserClient` from `@supabase/ssr` creates a **cookie-backed storage adapter** using `document.cookie`. This adapter is passed to GoTrueClient as the `storage` option.

GoTrueClient fallback chain:
1. **Custom storage** (cookie adapter from @supabase/ssr) ← Used
2. **localStorage** (if no custom storage provided) ← NOT used normally
3. **In-memory** (if localStorage unavailable) ← NOT used

**However**: The GoTrueClient may write session data to localStorage in edge cases:
- Token refresh race conditions
- `signInWithOAuth` callback processing
- The separate client on the login page

## 8. Root Cause Analysis

The observed behavior (fresh Firefox, zero cookies, authenticated platform) can occur through this chain:

1. User authenticates → Supabase writes session tokens to cookies
2. GoTrueClient may also have session data in memory (singleton pattern in client.ts)
3. On logout: `signOut(scope: 'local')` clears Supabase internal state, cookies cleared via HF-043
4. **But**: If any `sb-*` keys exist in localStorage (written by token refresh, OAuth callback, or edge case), they persist
5. On next visit: GoTrueClient may find stale tokens in localStorage during initialization
6. `getSession()` returns stale session → `getAuthUser()` validates (JWT not yet expired) → user appears authenticated

## 9. Fix Specifications

| # | Fix | File | Purpose |
|---|-----|------|---------|
| F1 | Clear localStorage sb-* on logout | auth-context.tsx | Prevent stale token persistence |
| F2 | Clear stale auth on login mount | login/page.tsx | Chrome/Firefox recovery |
| F3 | Skip initAuth on public routes | auth-context.tsx | Don't initialize auth on /login |
| F4 | Clear localStorage on signOut | auth-service.ts | Defense-in-depth at service level |
| F5 | Remove separate client on login | login/page.tsx | Single client, single cleanup path |
