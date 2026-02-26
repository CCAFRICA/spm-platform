# ViaLuce Auth Flow Reference

*Created: HF-062 — February 25, 2026*
*Purpose: Single source of truth for the auth chain. Consult before ANY auth change.*

---

## State Machine

```
UNAUTHENTICATED
  |
  +-- [Visit any protected route]
  |     -> Middleware: getUser() returns null (5s timeout, fail-closed)
  |     -> 307 redirect to /login?redirect={path}
  |
  +-- [Visit /login]
  |     -> Login page renders (AuthShell gate skips auth on /login)
  |     -> User enters email + password
  |     -> auth-context login() -> signInWithEmail()
  |     |
  |     +-- [Auth fails] -> Show "Invalid credentials" error
  |     |
  |     +-- [Auth succeeds] -> Supabase session cookie set
  |          |
  |          +-- login() calls fetchCurrentProfile()
  |          |    -> Queries profiles WHERE auth_user_id = user.id
  |          |    -> If null -> "Account found but profile is missing"
  |          |    -> If found -> mapProfileToUser()
  |          |
  |          +-- AUTHENTICATED_NO_TENANT
  |               |
  |               +-- [Platform user (manage_tenants capability)]
  |               |    -> router.push('/select-tenant')
  |               |    -> User picks a tenant
  |               |    -> AUTHENTICATED_WITH_TENANT
  |               |
  |               +-- [Tenant user]
  |                    -> router.push('/')
  |                    -> Middleware redirects to role-appropriate workspace
  |                    -> AUTHENTICATED_WITH_TENANT
  |
  AUTHENTICATED_WITH_TENANT
    |
    +-- [TenantContext derives tenant from profile or cookie/sessionStorage]
    +-- [SessionContext loads counts for THIS tenant (loadedForTenant tracking)]
    |    -> isLoading = true until counts loaded for current tenant
    |
    +-- [useFinancialOnly check]
    |    -> Only runs AFTER isAuthenticated AND session loaded AND auth not loading
    |    -> If financial-only tenant -> redirect /operate|/perform to /financial
    |
    +-- [Page renders]
         -> Dashboard / workspace content
```

## Critical Rules

1. **Middleware** (`middleware.ts`) is the ONLY server-side auth gate
2. **Login page** handles sign-in form only — auth-context handles post-auth routing
3. **AuthShell** (`auth-shell.tsx`) handles client-side loading state + 3s timeout fallback
4. **SessionContext** loads tenant-specific data AFTER tenant is selected
5. **Profile query at login** must NOT filter by tenant_id (no tenant selected yet)
6. **Profile query at login** must handle multiple profiles per auth_user_id
7. **useFinancialOnly** gates on authLoading + isAuthenticated + sessionLoading

## Files Involved (in execution order)

| Order | File | Purpose |
|-------|------|---------|
| 1 | `web/src/middleware.ts` | Server-side auth gate (getUser + 5s timeout) |
| 2 | `web/src/app/login/page.tsx` | Sign-in form UI |
| 3 | `web/src/contexts/auth-context.tsx` | Auth state + login()/logout() + post-auth routing |
| 4 | `web/src/lib/supabase/auth-service.ts` | signInWithEmail, fetchCurrentProfile, signOut |
| 5 | `web/src/lib/supabase/client.ts` | Supabase browser client (singleton) |
| 6 | `web/src/app/auth/callback/route.ts` | OAuth callback (Google SSO only) |
| 7 | `web/src/app/layout.tsx` | Root layout: AuthProvider > TenantProvider > ... > AuthShell |
| 8 | `web/src/components/layout/auth-shell.tsx` | Client-side auth wrapper + 3s timeout |
| 9 | `web/src/contexts/tenant-context.tsx` | Tenant derivation from profile or cookie |
| 10 | `web/src/contexts/session-context.tsx` | Tenant-scoped counts (loadedForTenant) |
| 11 | `web/src/hooks/use-financial-only.ts` | Financial redirect gate |

## Defense-in-Depth Layers

| Layer | File | Mechanism |
|-------|------|-----------|
| 1 | `middleware.ts` | getUser() with 5s Promise.race timeout — fail-closed |
| 2 | `auth-shell.tsx` | 3s client-side timeout — clears cookies + redirects |
| 3 | `auth-context.tsx` | initAuth() skips on /login,/landing,/signup |
| 4 | `auth-shell.tsx` | Redirect loop breaker (sessionStorage timestamp) |
| 5 | `use-financial-only.ts` | Gates on authLoading + isAuthenticated + sessionLoading |
| 6 | `session-context.tsx` | loadedForTenant prevents stale-count race |

## Known Failure Patterns

| # | Symptom | Root Cause | Fix | PR |
|---|---------|-----------|-----|-----|
| 1 | Redirect loop | Duplicate auth checks in multiple files | HF-059: single auth gate | PR#88 |
| 2 | Redirect loop | Stale session counts (ruleSetCount=0 on tenant switch) | HF-061: loadedForTenant + gated useFinancialOnly | PR#96 |
| 3 | Infinite spinner | Middleware passing through when getUser() hangs | HF-061 Amendment: 5s timeout + 3s fallback | PR#97 |
| 4 | "Profile is missing" | fetchCurrentProfile uses .maybeSingle() — errors on >1 row | HF-062: use array query + pick best profile | THIS PR |

## Profile Query Rules

- `profiles` table has NO unique constraint on `auth_user_id`
- Platform users (vl_admin) may have profiles across multiple tenants
- `fetchCurrentProfile()` MUST handle 0, 1, or N profiles
- At login: query by `auth_user_id` only — NO tenant_id filter
- After tenant selection: tenant-specific queries can filter by tenant_id

## RLS Policies on profiles

- `profiles_select_own`: `auth_user_id = auth.uid()` (any user reads own profiles)
- `profiles_select_vl_admin`: `EXISTS(... role = 'vl_admin')` (vl_admin reads all)

---

*DO NOT modify auth files without reading this document first.*
*Every previous auth regression was caused by changing one file without understanding the full chain.*
