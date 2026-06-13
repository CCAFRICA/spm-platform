# DIAG-061 — TENANT-ENTRY DIVERGENCE: evidence

**Type:** DIAG (read-only, evidence only — ships no code, Rule 23). **Date:** 2026-06-10.
**Repo/branch:** `main` @ `db07b9cd` (the three traced files are byte-identical to `6c968ad` — only #471/#472 SQL/docs landed since; see §3.7).
**Mode:** code trace + service-role/JWT reads (Level 1/3). No browser test (Rule 22; tester repro accepted). No fix, no theory, no ranked causes. HALT after §3.

---

## §3.1 — The click path (Rule 21 chain), current `main`

**Chain:** `ObservatoryTab.handleSelectTenant (web/src/components/platform/ObservatoryTab.tsx:92)` → `setTenant (web/src/contexts/tenant-context.tsx:182)` → `loadTenant (tenant-context.tsx:126)` → `loadTenantConfig (tenant-context.tsx:47)` → **failure point: `throw new Error('Failed to load tenant config') (tenant-context.tsx:114)`**.

**1. `ObservatoryTab.tsx:92-105`** (entry; unchanged by HF-282):
```tsx
const handleSelectTenant = async (tenantId: string, targetRoute?: string) => {
  setSelectingTenant(tenantId);
  try {
    await setTenant(tenantId);
    const destination = targetRoute || '/operate';
    router.push(destination);
    router.refresh();
  } catch {
    setSelectingTenant(null);
  }
};
```
Card onClick (`ObservatoryTab.tsx:340`): `onClick={() => handleSelectTenant(tenant.id)}` (HALT-A does NOT fire — entry point is `handleSelectTenant`/`setTenant`).

**2. `setTenant` — `tenant-context.tsx:182-204`:**
```tsx
const setTenant = useCallback(async (tenantId: string): Promise<void> => {
  setIsLoading(true); setError(null);
  try {
    await loadTenant(tenantId);                       // ← line 186: AWAITED FIRST
    if (isAdmin && typeof window !== 'undefined') {
      sessionStorage.setItem('vialuce_admin_tenant', tenantId);
      document.cookie = `vialuce-tenant-id=${tenantId}; path=/; SameSite=Lax`;  // ← 191: cookie write
    }
    router.push(isAdmin ? '/operate' : '/');          // ← 197: navigation
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to switch tenant');
    throw err;                                        // ← 200: re-throw
  } finally { setIsLoading(false); }
}, [router, loadTenant, isAdmin, user]);
```
**The cookie write (191) and navigation (197) are AFTER `await loadTenant` (186). A `loadTenant` rejection skips both and jumps to catch (198).**

**3. `loadTenant` — `tenant-context.tsx:126-137`** (every branch):
```tsx
const loadTenant = useCallback(async (tenantId: string): Promise<void> => {
  const normalizedId = normalizeTenantId(tenantId);
  try {
    const config = await loadTenantConfig(normalizedId);  // throws if no config resolvable
    setCurrentTenant(config); setIsLoading(false);
  } catch (err) {
    setError(...); setIsLoading(false);
    throw err;                                            // ← 135: re-throws to setTenant
  }
}, []);
```
**`loadTenantConfig` — `tenant-context.tsx:47-114`** (the data dependency; every branch):
```tsx
async function loadTenantConfig(tenantId: string): Promise<TenantConfig> {
  const normalizedId = normalizeTenantId(tenantId);
  if (tenantConfigCache[normalizedId]) return tenantConfigCache[normalizedId];      // (a) module cache
  try {
    const config = await import(`@/data/tenants/${normalizedId}/config.json`);      // (b) STATIC JSON
    ... return tenantConfig;
  } catch { /* fall through */ }
  try {
    const supabase = createClient();                                               // (c) SUPABASE (RLS)
    const { data: byId } = await supabase.from('tenants').select('*').eq('id', normalizedId).maybeSingle();
    ... const { data: bySlug } = ... .eq('slug', normalizedId).maybeSingle();
    if (row) { ... return tenantConfig; }
  } catch (err) { console.warn('[TenantContext] Supabase fallback failed:', err); }
  throw new Error(`Failed to load tenant config: ${normalizedId}`);                // ← 114: THROW
}
```
Reaches the throw (114) when: not cached, AND no static JSON at `@/data/tenants/<id>/config.json`, AND the Supabase `tenants` SELECT returns no row.

**4. `isAdmin` source — `tenant-context.tsx:119`:** `const { user, isVLAdmin: isAdmin, ... } = useAuth();` — `isAdmin` IS `useAuth().isVLAdmin` (the resolveIdentity-backed flag; see §3.4).

---

## §3.2 — `loadTenantConfig` data dependency + `tenants` authorization

**Static configs present** (`web/src/data/tenants/`): `frmx-demo`, `restaurantmx`, `techcorp` (+ `index.json`). **Live tenants (service-role, RLS bypassed) — none maps to a static config:**
```
Banco Cumbre del Litoral  id=b1c2d3e4-…  slug=banco-cumbre-litoral   static_config=no
Meridian Logistics Group  id=5035b1e8-…  slug=meridian-logistics-group static_config=no
Cascade Revenue Partners, MX Restaurant, Sabor Grupo, Tomi Test #1/#2, TomiCo, Trial 1 — all static_config=no
total tenants=9  (all 9 rows EXIST; the failure is not a missing row)
```
⇒ Every live-tenant click bypasses path (b) and falls to path (c), the RLS-gated Supabase `tenants` SELECT.

**`tenants` SELECT RLS policies (committed migrations — the only two):**
`web/supabase/migrations/005_platform_user_nullable_tenant.sql:19-27`
```sql
CREATE POLICY "tenants_select_vl_admin" ON tenants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE auth_user_id = auth.uid()
              AND role = 'vl_admin')    -- ← RAW literal 'vl_admin'
  );
```
`web/supabase/migrations/001_core_tables.sql:145-148`
```sql
CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );
```
(The whole RLS suite — 001/005/007/009/013 — keys on raw `role = 'vl_admin'`; no migration aliases it to `'platform'` or uses resolveRole. The HF-282 dedup migration touches `profiles`, not `tenants` RLS.)

**EMPIRICAL live-RLS read — `tenants` queried UNDER each account's own JWT** (read-only; no schema/data write):
```
tdadmin@vialuce.com :  tenants SELECT (RLS) -> 0 row(s) visible
                       .eq(id=Banco Cumbre) -> NULL      .eq(id=Meridian) -> NULL
eoadmin@vialuce.com :  tenants SELECT (RLS) -> 0 row(s) visible
                       .eq(id=Banco Cumbre) -> NULL      .eq(id=Meridian) -> NULL
```
**Explicit §3.2 answer:** For a `role='platform'`, `tenant_id=NULL`, zero-scope user the `tenants` SELECT returns **ZERO rows** — `tenants_select_vl_admin` requires `role='vl_admin'` (these users are `'platform'`), `tenants_select_own` requires `id ∈ {user's tenant_id}` (NULL). **There is NO per-user/per-session condition that returns rows for one such account and not another — both accounts return 0 rows, empirically, identically.** (RLS check is `auth.uid()`-on-`profiles.role`, AAL-independent — same at aal1 and the browser's aal2.)

---

## §3.3 — Silent-failure confirmation

`setTenant` catch (`tenant-context.tsx:198-200`): `setError(...)` + `throw`. `handleSelectTenant` catch (`ObservatoryTab.tsx:102-104`): `setSelectingTenant(null)`. **Confirmed:** a `loadTenant` rejection yields **no cookie write, no `router.push`, spinner-reset only** — `setError` writes React state (not a console error). **Silent to the user** (consistent with the captured console showing only font-preload warnings). No `auth.shell.loop_break` because `isAuthenticated` never goes false — the session is valid; only the tenant load fails.

---

## §3.4 — `isAdmin`/`isVLAdmin` source vs `resolveIdentity`

`resolveIdentity` (merged, `web/src/lib/auth/resolve-identity.ts`) — single-row path returns that row, `canonicalRole = resolveRole('platform') = 'platform'`. Client flag: `auth-context.tsx` → `mapProfileToUser(fetchCurrentProfile())`; `fetchCurrentProfile` delegates to `resolveIdentity`; `isVLAdmin(user) = (user.role === 'platform')` (`types/auth.ts:41`); `isAdmin = useAuth().isVLAdmin` (`tenant-context.tsx:119`). **Explicit answer:** the client admin flag reads the SAME resolved identity as `resolveIdentity`. Both accounts are single-row `role='platform'` ⇒ `isVLAdmin=true` for BOTH ⇒ `setTenant` writes the cookie + pushes `/operate` for both *iff* `loadTenant` resolves. `isAdmin` is identical for the two accounts and is NOT a divergence point.

---

## §3.5 — `auth.users` compare (HALT-B)

`admin.getUserById` for both (full fields). **Field diff — only these differ, all inherently per-account:** `email`, `created_at`/`confirmed_at`/`email_confirmed_at`, `last_sign_in_at`, `updated_at`. **All authorization-relevant fields IDENTICAL:** `role='authenticated'`, `aud='authenticated'`, `app_metadata={provider:email,providers:[email]}`, `user_metadata={email_verified:true}`, `identities.length=1` (email, `email_verified:false`), `factors`=1 verified totp, `banned_until` absent, `is_anonymous=false`, `is_sso_user` absent.
**HALT-B disposition:** no authorization-meaningful `auth.users` field differs between the two accounts → the auth-layer hypothesis is eliminated. (The literal "all listed fields byte-identical" is not met only because timestamps/email differ, which are per-account by nature.) **Architect: do not re-investigate the auth-users layer.**

---

## §3.6 — Auth-shell tenant gate (post-selection bounce check)

`web/src/lib/auth/tenant-gate.ts:26-32`:
```tsx
export function shouldGateToSelectTenant(s: TenantGateState): boolean {
  if (s.isLoading || s.tenantLoading) return false;
  if (s.onMfaRoute) return false;
  if (!s.isAuthenticated) return false;
  return s.isVLAdmin && !s.hasTenant && !s.isTenantExempt;
}
```
Call site `web/src/components/layout/auth-shell.tsx:139`:
```tsx
if (shouldGateToSelectTenant({ isLoading, tenantLoading, onMfaRoute, isAuthenticated, isVLAdmin, hasTenant: !!currentTenant, isTenantExempt })) { ... router.push('/select-tenant'); }
```
**Explicit answer:** after a SUCCESSFUL selection sets `currentTenant`, `hasTenant=true` ⇒ gate returns false (no re-push). The gate pushes only when `isVLAdmin && !hasTenant && !isTenantExempt` post-hydration. On `/select-tenant` itself `isTenantExempt=true` ⇒ no push. The observed tdadmin bounce (`platform_events: redirect.tenant_select`) is the MIDDLEWARE branch (`middleware.ts:314`, no tenant cookie), NOT this gate — and the cookie is absent precisely because `loadTenant` threw at §3.1 step 3 BEFORE the cookie write (`tenant-context.tsx:191`).

---

## §3.7 — git provenance

`git log --oneline -15 -- tenant-context.tsx ObservatoryTab.tsx auth-shell.tsx` (top entries):
```
713bb347 HF-282 Phase 5: tenant-gate predicate (HALT-3) + tests
a294f007 HF-282 Phase 1+2.3: canonical reader resolveIdentity + redirect observability
390eb9ba … aa84d7bb HF-182 Fix 11 (tenant cookie session-scoped) … 89b5a462 HF-061 Amendment (AuthShell timeout) …
```
Current blob SHAs @ HEAD `db07b9cd`: `tenant-context.tsx 726eab27`, `ObservatoryTab.tsx d5a13227`, `auth-shell.tsx 0c26cdc6`. **#469/#470 (HF-282) touched `tenant-context.tsx` (the `tenant.cleared` event) and `auth-shell.tsx` (the gate predicate); `ObservatoryTab.handleSelectTenant` was NOT modified by HF-282.**

---

## Cross-cutting evidence note (stated, not theorized)

The §1 premise ("eoadmin succeeds, tdadmin fails, opposite outcomes") is **not reproduced at the code/RLS layer**: under §3.2's empirical read **both** accounts get **0 tenants visible**; every live tenant lacks a static config; so `loadTenantConfig` reaches its throw (114) **identically for both accounts on any live-tenant click**, producing the silent failure of §3.3 for both. The `platform_events` asymmetry cited in §1 (eoadmin `redirect.tenant_select` ×1 then idle; tdadmin ×6 in 16 min) is consistent with differing **retry counts**, not a differing **code outcome**. The single structural fact the path turns on: the `tenants` SELECT RLS keys on `role = 'vl_admin'` while the accounts carry `role = 'platform'` — the same role-literal class HF-282 normalized in the *reader* (`resolveRole`) but which the *RLS policy literals* (`tenants`, and 001/005/007/009/013 broadly) still encode raw.

**HALT-C:** diagnostic round 1 of ≤3. **HALT-A** not fired (entry point confirmed). **HALT-B** disposed above (auth-layer eliminated). Evidence assembled — HALT.

*DIAG-061 · read-only · evidence only · HALT after §3.*
