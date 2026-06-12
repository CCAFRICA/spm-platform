# DIAG-060 — TENANT-ENTRY BOUNCE: EVIDENCE

**Date:** 2026-06-10 · **Mode:** read-only, zero code changes · evidence only (no fixes, no theories).
**Symptom:** platform-role user clicks a tenant card on Observatory. Majority: page repaints Observatory (selection does not stick). Occasionally: full redirect to bare `/login`. GoTrue logs confirm no server-side session termination. Accounts verified equivalent.

---

## 1. The tenant-card click handler

**`web/src/components/platform/ObservatoryTab.tsx:92-105`**
```tsx
const handleSelectTenant = async (tenantId: string, targetRoute?: string) => {
  setSelectingTenant(tenantId);
  try {
    await setTenant(tenantId);
    // HF-057: Explicit navigation after tenant selection.
    // setTenant calls router.push('/') but middleware may redirect VL Admin
    // back to /select-tenant. Navigate to a concrete route instead.
    const destination = targetRoute || '/operate';
    router.push(destination);
    router.refresh();
  } catch {
    setSelectingTenant(null);
  }
};
```
Card `onClick` (`ObservatoryTab.tsx:340`): `onClick={() => handleSelectTenant(tenant.id)}` → `targetRoute` undefined → `destination = '/operate'`.

**What it writes — `setTenant` in `web/src/contexts/tenant-context.tsx:181-203`:**
```tsx
const setTenant = useCallback(async (tenantId: string): Promise<void> => {
  setIsLoading(true);
  setError(null);
  try {
    await loadTenant(tenantId);
    // Store admin's tenant selection in sessionStorage + cookie
    if (isAdmin && typeof window !== 'undefined') {
      sessionStorage.setItem('vialuce_admin_tenant', tenantId);
      // HF-182 Fix 11: Session-scoped cookie (no max-age) — expires on browser close
      document.cookie = `vialuce-tenant-id=${tenantId}; path=/; SameSite=Lax`;
    }
    // HF-057: VL Admin navigates to /operate (admin landing).
    router.push(isAdmin ? '/operate' : '/');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to switch tenant');
    throw err;
  } finally {
    setIsLoading(false);
  }
}, [router, loadTenant, isAdmin, user]);
```

**Order of operations (per click):**
1. `setTenant(id)` → `await loadTenant(id)` (sets React `currentTenant`, client state).
2. `sessionStorage.setItem('vialuce_admin_tenant', id)` — **gated on `isAdmin`**.
3. `document.cookie = 'vialuce-tenant-id=<id>; path=/; SameSite=Lax'` — **gated on `isAdmin`** (client write; no `Secure`, no `max-age`, no `Domain`).
4. `router.push('/operate')` (push #1, inside setTenant).
5. back in handler: `router.push('/operate')` (push #2, redundant) → `router.refresh()`.

Navigation is **`router.push` (soft nav)** + `router.refresh()`. No `window.location`. The cookie is written **client-side via `document.cookie`** (not a server `Set-Cookie`).

---

## 2. Guards on the destination route that can redirect back

Destination is `/operate` (a restricted workspace, `'/operate':'data.import'`). The bounce surfaces as `/select-tenant` (Observatory repaint) or bare `/login`. Every redirect branch in the chain:

**`web/src/middleware.ts`** — the only `/select-tenant` producer and all `/login` producers:
```ts
148  if (!user) {
152      const redirectResponse = NextResponse.redirect(new URL('/login', request.url));   // unauth on '/'
...
165      const loginUrl = new URL('/login', request.url);
166      loginUrl.searchParams.set('redirect', pathname);
167      const redirectResponse = NextResponse.redirect(loginUrl);                          // unauth on protected
...
228  if ((now - sessionStartMs) > SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS) {
230      const expiredResponse = NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
238  if ((now - lastActivityMs) > SESSION_LIMITS.IDLE_TIMEOUT_MS) {
240      const idleResponse = NextResponse.redirect(new URL('/login?reason=idle_timeout', request.url));
...
268        if (currentLevel === 'aal1' && nextLevel === 'aal2') {
269          return ... NextResponse.redirect(new URL('/auth/mfa/verify', request.url));
272        if (currentLevel === 'aal1' && nextLevel === 'aal1') { ... 
287            return ... NextResponse.redirect(new URL('/auth/mfa/enroll', request.url));
...
296  if (pathname === '/login' || pathname === '/') {            // <-- ONLY runs for '/' or '/login', NOT '/operate'
304      const { data: profile } = await supabase
305        .from('profiles').select('role, capabilities')
307        .eq('auth_user_id', user.id).maybeSingle();
311      const resolvedLoginRole = resolveRole(profile?.role || '');
312      const isPlatformAdmin = resolvedLoginRole === 'platform' || capabilities.includes('manage_tenants');
314      if (isPlatformAdmin) {
315        const tenantCookie = request.cookies.get('vialuce-tenant-id')?.value;
316        if (tenantCookie) {
317          return ... NextResponse.redirect(new URL('/operate', request.url));            // cookie present
318        }
319        return ... NextResponse.redirect(new URL('/select-tenant', request.url));        // cookie ABSENT
320      }
...
333      return ... NextResponse.redirect(new URL(defaultPath, request.url));               // non-platform → /stream
...
337  if (isRestrictedWorkspace(pathname)) {                     // <-- runs for '/operate'
357        if (!canAccessWorkspace(roleToCheck, pathname)) {
359          return ... NextResponse.redirect(new URL('/unauthorized', request.url));
```
- Exact `/select-tenant` condition: `pathname ∈ {'/','/login'}` **AND** `isPlatformAdmin` (line 312) **AND** `!request.cookies.get('vialuce-tenant-id')` (line 315) → **line 319**.
- `/operate` itself (line 337-362) can only redirect to `/unauthorized`, never `/select-tenant` or `/login`.

**`web/src/components/layout/auth-shell.tsx:128-131`** — client guard, the `/select-tenant` push on the rendered route:
```tsx
// Platform admin without a tenant selected must pick one first
if (isVLAdmin && !currentTenant && !isTenantExempt) {
  router.push('/select-tenant');
}
```
Condition: `isVLAdmin` (client) **AND** `!currentTenant` (React state null) **AND** route not in `TENANT_EXEMPT_ROUTES = ['/login','/select-tenant','/admin/tenants/new']` (+ MFA routes).

**`web/src/contexts/tenant-context.tsx:205-214`** — `clearTenant` → `/select-tenant`:
```tsx
const clearTenant = useCallback((): void => {
  setCurrentTenant(null);
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('vialuce_admin_tenant');
    document.cookie = 'vialuce-tenant-id=; path=/; max-age=0';
  }
  if (isAdmin) {
    router.push('/select-tenant');
  }
}, [isAdmin, router]);
```

---

## 3. The read side of `vialuce-tenant-id` (write vs read)

**Write (client, synchronous)** — `tenant-context.tsx:190`:
```tsx
document.cookie = `vialuce-tenant-id=${tenantId}; path=/; SameSite=Lax`;
```
**Reads:**
- **Server (middleware)** — `middleware.ts:315`, **inside the `pathname === '/login' || pathname === '/'` block only** (line 296):
  ```ts
  const tenantCookie = request.cookies.get('vialuce-tenant-id')?.value;
  ```
- **Client (tenant-context hydration effect)** — `tenant-context.tsx:154-164`:
  ```tsx
  } else if (isAdmin) {
    let selectedTenant: string | null = null;
    if (typeof window !== 'undefined') {
      selectedTenant = sessionStorage.getItem('vialuce_admin_tenant');
      if (!selectedTenant) {
        const match = document.cookie.match(/vialuce-tenant-id=([^;]+)/);
        selectedTenant = match ? match[1] : null;
      }
    }
    if (selectedTenant) { await loadTenant(selectedTenant); }
    else { setIsLoading(false); }
  }
  ```

**Write/read ordering as coded:** the cookie is written by `document.cookie` (client) at `tenant-context.tsx:190` **before** `router.push('/operate')` (line 196). The server read at `middleware.ts:315` only executes when the request path is `/` or `/login` (line 296) — it is **not** read on the `/operate` request. Both the write (190) and the server read (315) are gated/path-scoped as pasted; the write is conditional on `isAdmin` (line 187) and the cookie carries no `Secure`/`Domain`/`max-age` attribute.

---

## 4. `fetchCurrentProfile` and `isAuthenticated`

**`web/src/lib/supabase/auth-service.ts:173-226`** (query + winner selection):
```ts
export async function fetchCurrentProfile(): Promise<AuthProfile | null> {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    // HF-062: Use array query instead of .maybeSingle().
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) { console.error('[Auth] Profile query failed:', ...); return null; }
    if (!profiles || profiles.length === 0) { console.error('[Auth] No profile rows ...'); return null; }

    // If multiple profiles, prefer platform-level (platform role or manage_tenants)
    const profile = (
      profiles.find(p => p.role === 'platform') ||
      profiles.find(p => ((p.capabilities as string[]) || []).includes('manage_tenants')) ||
      profiles[0]
    ) as Profile;
    return { id: profile.id, authUserId: profile.auth_user_id, tenantId: ...tenant_id, role: profile.role, ... };
  } catch (err) { console.error('[Auth] fetchCurrentProfile error:', err); return null; }
}
```
- Table: `profiles`. Filter: `.eq('auth_user_id', user.id)`. Shape: **array** — `.order('created_at', { ascending: true }).limit(10)` (NOT `.single()`/`.maybeSingle()`).
- Returns `null` when: `getUser()` errors/null (line 182-183), query error (198), zero rows (203).

**`isAuthenticated` derivation — `web/src/contexts/auth-context.tsx:337`:**
```ts
isAuthenticated: !!user,
```
`user` is set from `mapProfileToUser(fetchCurrentProfile())` (`auth-context.tsx:199-201`, `211-213`, `260`). `fetchCurrentProfile()→null` ⇒ `user` stays/`null` ⇒ `isAuthenticated=false`.

**Consumers that redirect on null/`!isAuthenticated`:**
- `auth-shell.tsx:97-123` — `if (!isAuthenticated)` → `/login` (see §5).
- `auth-shell.tsx:141-158` — timeout fallback: `if (isLoading||tenantLoading)` unresolved after 3s → `window.location.replace('/login')` (line 158).
- `middleware.ts:148` — server `if (!user)` → `/login` (lines 152 / 167).

---

## 5. The auth-shell loop detector

**`web/src/components/layout/auth-shell.tsx:97-123`:**
```tsx
if (!isAuthenticated) {
  const LOOP_KEY = 'vl_auth_redirect_ts';
  const now = Date.now();
  const lastRedirect = parseInt(sessionStorage.getItem(LOOP_KEY) || '0', 10);

  if (now - lastRedirect < 3000) {
    // Redirected within last 3 seconds — this is a loop.
    // Clear all auth state client-side to break the cycle.
    console.error('[AuthShell] Redirect loop detected — clearing auth state');
    sessionStorage.removeItem(LOOP_KEY);
    if (typeof document !== 'undefined') {
      document.cookie.split(';').forEach(c => {
        const name = c.trim().split('=')[0];
        if (name.startsWith('sb-') || name === 'vialuce-tenant-id') {
          document.cookie = `${name}=; path=/; max-age=0`;
        }
      });
    }
    // Navigate to /login WITHOUT redirect param to break the cycle
    window.location.replace('/login');
    return;
  }

  sessionStorage.setItem(LOOP_KEY, String(now));
  window.location.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  return;
}
```
- Trigger: `!isAuthenticated` **twice within 3000ms** (`now - lastRedirect < 3000`).
- Clears cookies whose name `startsWith('sb-')` **OR** `=== 'vialuce-tenant-id'` (lines 108-113) — **confirmed clears `sb-*`**.
- Lands **bare `/login`** via `window.location.replace('/login')` (line 116) — **confirmed bare** (no `?redirect`, hard navigation).

---

## 6. Inventory — redirect branches in §2–§5 that do NOT emit a `platform_event`

`logAuthEvent` is called at exactly three sites in `middleware.ts` (only emitters in the chain):
```
229  logAuthEvent('auth.session.expired.absolute', ...)
239  logAuthEvent('auth.session.expired.idle', ...)
358  logAuthEvent('auth.permission.denied', ...)
```
Every other redirect branch emits **no** `platform_event`:

| Branch | file:line | Redirect target | Emits event? |
|---|---|---|---|
| unauth on `/` | middleware.ts:152 | `/login` | **No** |
| unauth on protected | middleware.ts:167 | `/login?redirect=` | **No** |
| MFA aal1→aal2 | middleware.ts:269 | `/auth/mfa/verify` | **No** |
| MFA aal1→aal1 | middleware.ts:287 | `/auth/mfa/enroll` | **No** |
| platform-admin + cookie | middleware.ts:317 | `/operate` | **No** |
| platform-admin + no cookie | middleware.ts:319 | **`/select-tenant`** | **No** |
| non-platform default | middleware.ts:333 | `/stream` | **No** |
| auth-shell loop-break | auth-shell.tsx:116 | **bare `/login`** (clears `sb-*`) | **No** |
| auth-shell first redirect | auth-shell.tsx:121 | `/login?redirect=` | **No** |
| auth-shell 3s timeout | auth-shell.tsx:158 | bare `/login` | **No** |
| auth-shell tenant gate | auth-shell.tsx:130 | **`/select-tenant`** | **No** |
| clearTenant | tenant-context.tsx:212 | `/select-tenant` | **No** |
| workspace denied | middleware.ts:359 | `/unauthorized` | **No** |

(The only redirects that DO emit are the two session-timeout branches, 230/240, and permission-denied, 359→358.)

---

## 7. git history + the 5-user creation script

**`git log --oneline --since="2026-06-09 00:00" -- '*script*' '*user*' '*auth*'`:**
```
32a8f336 HF-281: completion report + Phase 0.5 evidence script
61f0610e HF-280: completion report + Phase 0.5 evidence scripts
b6989893 HF-277 Phase 3: verification (Meridian fix + DD-7 proven; BCL Test 2 gate BLOCKED — tenants wiped)
f38431f8 Revert HF-276: evaluator-side scale pre-multiply regressed BCL c1 (§6A double-scale)
4ab26aec HF-276 Phase 3: deterministic verification on real persisted c0 (both variants) + BCL-pattern guard
```
(No user-creation commit; the script is untracked — `git status`: `?? web/scripts/fix-sabor-users.ts`.)

**Full text — `web/scripts/fix-sabor-users.ts`** (the script that created tdadmin/eoadmin; "5 users" = its proof/login-test loop of 3 Sabor + 2 platform admins):
```ts
// Run via: cd web && set -a && source .env.local && set +a && npx tsx scripts/fix-sabor-users.ts
// Non-destructive: updateUserById (no deletes) for Sabor; additive create for platform admins.
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  // === SABOR: non-destructive identity attach (NO deletes) ===
  const SABOR = [
    { email: 'admin@saborgrupo.mx', password: 'sabor-demo-2024' },
    { email: 'gerente@saborgrupo.mx', password: 'sabor-demo-2024' },
    { email: 'mesero@saborgrupo.mx', password: 'sabor-demo-2024' },
  ];
  const { data: pre } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of SABOR) {
    const existing = pre.users.find(x => x.email?.toLowerCase() === u.email.toLowerCase());
    if (!existing) { console.log(`${u.email}: NOT FOUND — skipping (will need create)`); continue; }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: u.password, email_confirm: true,
    });
    if (error) console.log(`${u.email}: updateUserById error — ${error.message}`);
    else console.log(`${u.email}: updateUserById OK (id ${existing.id})`);
  }

  // === PLATFORM ADMINS: pure create (mirror canonical platform@vialuce.com) ===
  const { data: canonical } = await supabaseAdmin
    .from('profiles').select('role, capabilities')
    .eq('email', 'platform@vialuce.com')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!canonical) throw new Error('platform@vialuce.com not found — cannot mirror canonical role/capabilities');
  console.log('Canonical role:', canonical.role, '| capabilities:', JSON.stringify(canonical.capabilities));

  for (const admin of [
    { email: 'eoadmin@vialuce.com', password: 'Vialuce-2024!', displayName: 'EO Admin' },
    { email: 'tdadmin@vialuce.com', password: 'Vialuce-2024!', displayName: 'TD Admin' },
  ]) {
    const already = pre.users.find(x => x.email?.toLowerCase() === admin.email.toLowerCase());
    let authId: string;
    if (already) {
      await supabaseAdmin.auth.admin.updateUserById(already.id, { password: admin.password, email_confirm: true });
      authId = already.id;
      console.log(`• ${admin.email}: auth existed, password reset (id ${authId})`);
    } else {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: admin.email, password: admin.password, email_confirm: true,
      });
      if (cErr || !created?.user) { console.log(`${admin.email}: createUser error — ${cErr?.message}`); continue; }
      authId = created.user.id;
      console.log(`✓ Created auth user: ${admin.email} → ${authId} (identities: ${created.user.identities?.length ?? 0})`);
    }
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles').select('id').eq('email', admin.email).maybeSingle();
    if (existingProfile) {
      await supabaseAdmin.from('profiles').update({
        auth_user_id: authId, role: canonical.role, capabilities: canonical.capabilities,
        tenant_id: null, display_name: admin.displayName,
      }).eq('id', existingProfile.id);
    } else {
      await supabaseAdmin.from('profiles').insert({
        id: crypto.randomUUID(), auth_user_id: authId, display_name: admin.displayName,
        email: admin.email, role: canonical.role, capabilities: canonical.capabilities,
        tenant_id: null, locale: 'en',
      });
    }
    console.log(`✓ Platform admin ready: ${admin.email} → ${authId}`);
  }

  // === PROOF ===
  const { data: verify } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  console.log('\n=== IDENTITIES ===');
  for (const email of ['admin@saborgrupo.mx','gerente@saborgrupo.mx','mesero@saborgrupo.mx','eoadmin@vialuce.com','tdadmin@vialuce.com']) {
    const u = verify.users.find(x => x.email?.toLowerCase() === email.toLowerCase());
    console.log(`${email}: identities=${u?.identities?.length ?? 'NOT FOUND'}`);
  }
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  console.log('\n=== LOGIN TEST ===');
  for (const { email, password } of [
    { email:'admin@saborgrupo.mx', password:'sabor-demo-2024' },
    { email:'gerente@saborgrupo.mx', password:'sabor-demo-2024' },
    { email:'mesero@saborgrupo.mx', password:'sabor-demo-2024' },
    { email:'eoadmin@vialuce.com', password:'Vialuce-2024!' },
    { email:'tdadmin@vialuce.com', password:'Vialuce-2024!' },
  ]) {
    const { data: s, error } = await anon.auth.signInWithPassword({ email, password });
    console.log(`${email}: ${s?.session ? '✓ LOGIN OK' : `✗ FAILED — ${error?.message}`}`);
    if (s?.session) await anon.auth.signOut();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```
Observed facts from this script (no interpretation): platform admins are created with `email_confirm: true` only (no MFA enrollment in-script); profile `role`/`capabilities` are copied from `platform@vialuce.com`'s **earliest** row (`.order('created_at',{ascending:true}).limit(1).maybeSingle()`, line 33) — i.e. the canonical-row read prefers the oldest row by created_at.

---

## ADDENDUM A — Role-literal census

`grep -rn "vl_admin\|'platform'\|\"platform\"" web/src --include="*.ts" --include="*.tsx" | grep -i "role"` — every hit, with grant/deny and (for denials) the redirect target:

| file:line | literal | grant or deny | denial action |
|---|---|---|---|
| middleware.ts:43 | `MFA_REQUIRED_ROLES = ['platform','admin']` | gate (membership) | → `/auth/mfa/enroll` (line 287) when role ∈ set & aal1 |
| middleware.ts:283 | `mfaProfiles?.find(p => p.role === 'platform')` | selects MFA role (array find) | n/a (selector) |
| middleware.ts:312 | `resolvedLoginRole === 'platform'` | **grant** isPlatformAdmin | if false → `/stream` (line 333); if true+no cookie → `/select-tenant` (319) |
| types/auth.ts:41 | `return user.role === 'platform'` (`isVLAdmin`) | grant (VL-admin predicate) | consumers: select-tenant page renders Observatory; auth-shell:129 gate |
| types/auth.ts:45 | `user.role !== 'platform'` (`isTenantUser`) | classifier | n/a |
| persona-context.tsx:84 | `user.role === 'platform' \|\| 'admin'` → 'admin' persona | grant (persona map) | n/a |
| auth-context.tsx:63 | `profile.role === 'platform' \|\| caps.includes('manage_tenants')` | **grant** isPlatformAdmin (client map) | sets mapped user `role:'platform'` (line 70) |
| navigation-context.tsx:139/150/154/226/256/362/373 | `effectiveRole as 'platform'\|...` (passed to `canAccessWorkspace`) | gate | deny → `router.push(defaultWs.defaultRoute)` (line 154) / blocked nav |
| navigation-context.tsx:173 | `userRole === 'platform' ? 'platform'` | persona map | n/a |
| my-compensation/page.tsx:78 | `mapRole(...)` literal union | map | n/a |
| api/platform/tenants/[tenantId]/modules/route.ts:29 | `!profile \|\| profile.role !== 'platform'` | **deny** | API 403 (JSON), not a redirect |
| api/platform/tenants/create/route.ts:28 | `profile.role !== 'platform'` | **deny** | API 403 |
| api/platform/settings/route.ts:30,66 | `profile.role !== 'platform'` | **deny** | API 403 |
| api/platform/observatory/route.ts:52 | `profiles?.some(p => p.role === 'platform')` (**array `.some`**) | **grant** hasVLAdmin | deny → API 403 |
| api/platform/users/invite/route.ts:21,56 | `role:'platform'` (insert) / `role !== 'platform'` | deny | API 403 |
| api/lifecycle/transition/route.ts:89 | `profile.role === 'platform' \|\| profile.role === 'vl_admin'` | **grant** (accepts BOTH) | deny → API error |
| api/lifecycle/transition/route.ts:127 | `.in('role', ['admin','platform','vl_admin'])` | query filter (accepts both) | n/a |
| api/ai/calibration/route.ts:34 | `profile.role !== 'platform'` | **deny** | API 403 |
| api/admin/tenants/create/route.ts:29 | `profiles?.some(p => p.role === 'platform')` (**array `.some`**) | **grant** | deny → API 403 |
| api/ai/metrics/route.ts:34 | `profile.role !== 'platform'` | **deny** | API 403 |
| api/users/update-role/route.ts:40,57,74 | `['platform','admin'].includes(callerProfile.role)` / `=== 'platform'` | gate | deny → API 403 |
| api/approvals/[id]/route.ts:48 | `['platform','admin','tenant_admin'].includes(profile.role)` | gate | deny → API 403 |
| performance/approvals/plans/page.tsx:58 | `user?.role === 'platform' \|\| 'admin'` → 'admin' | grant (persona) | n/a |
| access-control.tsx:31/74/75/76/77/82-85 | `currentRole === 'platform'` (+ ROLE arrays) | **grant** (platform always allowed) | n/a (client capability) |
| command-palette/CommandPalette.tsx:350 | `effectiveRole === 'admin' \|\| 'platform'` | grant (renders item) | n/a |
| hooks/useCapability.ts:35/45/55 | `if (user.role === 'platform') return true` | **grant** (platform short-circuits) | n/a |
| server-auth.ts:54 | `profiles.find(p => p.role === 'platform')` (**array find**) | selects server profile | n/a (selector) |
| permissions.ts:18/62 | `Role` type / `CANONICAL_ROLES` (no `vl_admin`) | type defs | n/a |
| permissions.ts:221 | comment: `vl_admin → platform` (ROLE_ALIASES) | alias map | n/a |
| role-permissions.ts:16 | `'/admin': ['platform']` | gate | deny per consumer |
| role-permissions.ts:17 | `'/operate': ['platform','admin','tenant_admin']` | **grant** (platform allowed on /operate) | n/a |

Note on literal forms: `'platform'` is the raw role value; `'vl_admin'` appears as an **alias** mapped to `'platform'` by `ROLE_ALIASES` (`permissions.ts:68-78`, `resolveRole`) and is accepted explicitly only at `api/lifecycle/transition/route.ts:89,127`. Several **server-side single-profile reads** test `profile.role !== 'platform'` after a `.maybeSingle()`/single fetch (the platform/* API routes above); the Observatory and admin/tenant-create routes instead use **array `.some(p => p.role === 'platform')`**.

---

## ADDENDUM B — `fetchCurrentProfile` winner when one `auth_user_id` has TWO profile rows

From `auth-service.ts:191-213` (pasted in §4):
```ts
.order('created_at', { ascending: true }).limit(10)         // array; NOT .single()/.maybeSingle()
...
const profile = (
  profiles.find(p => p.role === 'platform') ||              // 1st: any row with role==='platform'
  profiles.find(p => caps.includes('manage_tenants')) ||    // 2nd: any row with manage_tenants
  profiles[0]                                                // 3rd: oldest row (created_at asc)
);
```
- Query shape: **array** (`.order('created_at',{ascending:true}).limit(10)`), **no** `.single()`, **no** `.maybeSingle()`.
- Winner rule: **first row whose `role === 'platform'`**; else first with `manage_tenants` capability; else `profiles[0]` (oldest by `created_at`).
- Determinism: deterministic **given the predicate** — `.find()` returns the first array element matching, and the array is ordered by `created_at ascending`. For an `auth_user_id` with two rows `{role:'vl_admin', created 03-05}` and `{role:'platform', created 03-07}`, `find(p=>p.role==='platform')` selects the **`platform` row (03-07)** regardless of its later `created_at`, because the role predicate runs before the positional fallback. If neither row is `platform` and neither has `manage_tenants`, `profiles[0]` selects the **oldest** row.

(Contrast — same-shaped reads elsewhere: `server-auth.ts:53-56` and `middleware.ts:283-285` use the identical array+prefer-`platform` pattern; `middleware.ts:304-308` uses `.maybeSingle()`; the canonical-row read in the creation script `fix-sabor-users.ts:30-33` uses `.order(created_at asc).limit(1).maybeSingle()`.)

---

*DIAG-060 · read-only · evidence only · HALT.*
