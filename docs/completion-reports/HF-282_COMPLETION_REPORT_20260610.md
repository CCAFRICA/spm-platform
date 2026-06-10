# HF-282 Completion Report — Canonical Identity Resolution

**Date:** 2026-06-10 · **Branch:** `hf-282-identity-canon` (off `main` @ 8e887370… → current)
**Status:** Phases 1, 2, 3, 5 implemented + green; Phase 4 migration authored (architect-applied, HALT-2-guarded); Phase 6 compliance recorded. **Two HALTs fired (HALT-2, HALT-3) — dispositions below.** Production data mutations (orphan repair, migration apply) are SR-44 architect steps.

---

## 0. Phase 0 — evidence

### 0.1 DIAG-060 substrate (read end-to-end)
- `fetchCurrentProfile` (DIAG-060 §4): array query `.order(created_at asc).limit(10)`, prefer-platform — NOT single/maybeSingle.
- Addendum A row `middleware.ts:304-308`: `.maybeSingle()` → **grant** isPlatformAdmin; for platform@'s 2 rows returns `data=null` (PGRST116) → `isPlatformAdmin=false`. Addendum A row `auth-shell.tsx:128-131`: client `/select-tenant` push gated on `isVLAdmin && !currentTenant` (profile-count-insensitive).

### 0.2 FP-49 schema gate (`web/scripts/hf282-phase0-evidence.ts`)
> `information_schema`/`pg_catalog` are not reachable via the service-role PostgREST client (no DB URL / CLI / `exec_sql` RPC in env). Schema source = live row introspection + generated `database.types.ts` + live censuses.

```
profiles columns (live): id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at
unique constraint on auth_user_id: NONE (proven — duplicates present)

DUPLICATE CENSUS (auth_user_id with >1 row) — TWO groups:
  9c179b53… (platform@vialuce.com) count=2
     id=fd146488… role=vl_admin   tenant_id=NULL  created 2026-03-05   id===auth_user_id? false
     id=9c179b53… role=platform   tenant_id=NULL  created 2026-03-07   id===auth_user_id? TRUE
  11596f62… (tdelcarlo@vialuce.ai) count=2
     id=407ef5eb… role=tenant_admin tenant_id=07638678…  created 2026-05-15
     id=315ab173… role=tenant_admin tenant_id=03d28288…  created 2026-06-09   ← DIFFERENT tenant (multi-tenant)

ORPHAN CENSUS (auth.users without a profile) — 4 (NOT the assumed 3 Sabor):
  valentina@bancocumbre.ec, fernando@bancocumbre.ec, admin@bancocumbre.ec, admin@vialuce.ai

FK reference check (profile_scope / audit_logs / entities .profile_id) for every duplicate id: ALL 0.
```

### 0.3 HALT-3 — `auth-shell.tsx:81-82` (the DIAG-060 paste omitted this)
```tsx
useEffect(() => {
  if (isLoading || tenantLoading) return;   // ← tenant-loading guard ALREADY present
  if (onMfaRoute) return;
  ...
  if (isVLAdmin && !currentTenant && !isTenantExempt) { router.push('/select-tenant'); }  // line 129
```
A `tenantLoading` guard already wraps the gate. **HALT-3 fires:** Phase 2.1's premise (no guard → auth-before-tenant race) is false. Re-derivation of the repaint/eject cause from evidence: the account-keyed divergence is the multi-row profile read (`middleware.ts:304` `.maybeSingle()` erroring on platform@) — fixed by Phase 1, not by a tenant-race guard. Disposition: Phase 2.1 re-scoped to encode the existing guard as a testable predicate (`shouldGateToSelectTenant`), no speculative race fix added.

### 0.4 `permissions.ts:68-86` — `ROLE_ALIASES` / `resolveRole`
`vl_admin → platform`, `tenant_admin → admin`, `sales_rep/individual → member`, etc. `resolveRole` returns the canonical `Role` or null. (Path is `web/src/lib/auth/permissions.ts`, not the directive's `web/src/lib/permissions.ts`.)

---

## HALT dispositions (verbatim)

- **HALT-2 (FIRED → DISPOSITIONED 2026-06-10):** duplicate census returned a group beyond platform@ — `tdelcarlo@vialuce.ai` (11596f62…) has **two `tenant_admin` rows in different tenants**. **Architect disposition:** those rows are **sandbox artifacts → delete both**; the Platform-Created-Users model is unestablished, so the **`UNIQUE(auth_user_id)` constraint is deferred to that OB** (removed from this migration — incompatible with the current tenant-create creator-profile insert). The amended migration (`…_hf282_profile_dedup.sql`) STEP 2b deletes both tdelcarlo rows structurally (non-platform duplicate group), STEP 3 now passes (0 dups), STEP 4/5 (constraint) removed. **auth user 11596f62… becomes a zero-profile orphan post-delete → added to the orphan disposition list.**
- **HALT-3 (FIRED):** tenant-loading guard already present (0.3). Phase 2.1 re-scoped; no speculative fix.
- **HALT-1 (not fired):** FK refs to all duplicate ids = 0.
- **Orphan divergence (recorded):** live orphans are 3 Banco Cumbre + admin@vialuce.ai, not the assumed 3 Sabor. Only `admin@bancocumbre.ec` has an authoritative role/tenant (`seed-bcl-tenant.ts`: role `admin`, BCL tenant). The rest are **not provisioned** — guessing roles violates SR-39/AP-25. `provision-user.ts` carries the one known spec; the rest await disposition.

---

## 1. Phase 1 — canonical reader (`web/src/lib/auth/resolve-identity.ts`, new)
`resolveIdentity(client, authUserId)` — array-tolerant (no single/maybeSingle), deterministic winner, alias-normalized, loud `identity.resolve.{query_error,zero_rows,duplicate_rows}` anomalies via the non-blocking logAuthEvent channel. Winner rule (DD-7 + aligns with the Phase 4 keep-predicate): among alias-normalized-platform rows prefer raw `role='platform'` with `id=auth_user_id`, then raw platform, then platform-normalized-oldest, then `manage_tenants` (retained — existing consumers used it), then oldest. **Capability-fallback note:** retained because `fetchCurrentProfile`/`server-auth` depended on it (directive's "fold in only if consumers depend").

### 1.2 Retirement set — all delegate to resolveIdentity
| Read | file:line | change |
|---|---|---|
| `/`+`/login` `.maybeSingle()` (the DIAG-060 row-count fork) | middleware.ts:304-308 | → resolveIdentity; `isPlatformAdmin = canonicalRole==='platform' \|\| manage_tenants` |
| MFA role read | middleware.ts:283-285 | → resolveIdentity; `MFA_REQUIRED_ROLES.includes(canonicalRole)` (alias-safe) |
| DS-014 workspace read (`.maybeSingle()`) | middleware.ts:341-347 | → resolveIdentity (closes the last middleware profile-read sibling) |
| `fetchCurrentProfile` | auth-service.ts:173-226 | delegates; `AuthProfile` signature preserved (DD-7) |
| `getServerAuthState` | server-auth.ts:53-56 | delegates; `ServerAuthState` preserved (DD-7) |

### EPG-1 (pasted)
- **EPG-1b:** `grep "\.maybeSingle()\|\.single()"` over middleware/auth-service/server-auth → **0 real hits** (only HF-282 comment references). PASS.
- **EPG-1a:** `from('profiles')` outside resolve-identity — remaining hits are (i) **write paths** (signup, users/invite, admin/tenants/create, create-demo-users), (ii) **admin/platform-API authorization reads** (platform/settings, ai/calibration, ai/metrics, users/update-role, approvals, lifecycle/transition, observatory), (iii) **non-resolution reads** (page-loaders display-name joins, observatory/platform-queries tenant counts, locale/persona context). The auth-resolution REDIRECT chain (this HF's surface) is fully migrated. The API-authorization reads (category ii) still use single/maybeSingle but become **correct once Phase 4's `UNIQUE(auth_user_id)` makes >1 row unrepresentable** — that constraint is the SR-34 structural closure for them; converting each caller is follow-on backlog (noted, not in this PR's retirement set).

---

## 2. Phase 2 — race (HALT-3) + observability
- **2.1:** `shouldGateToSelectTenant` (`tenant-gate.ts`, new) encodes the existing hydration guard; auth-shell wired to it. No behavior change (DD-7).
- **2.3:** every DIAG-060 §6 branch (13) emits a named event before redirecting/clearing — 7 middleware `auth.redirect.*` (incl. `mfa_enroll`, `tenant_select`, `tenant_cookie_present`, `default_workspace`, `unauth_root`, `unauth_protected`, `mfa_verify`) + 4 auth-shell `auth.shell.*` (`loop_break` names the cleared cookies, `unauth_redirect`, `hydration_timeout`, `tenant_gate`) + `tenant.cleared`; `mw:359` already emitted `auth.permission.denied`. Client branches use `logAuthEventClient` (POST /api/auth/log-event), server use `logAuthEvent` — both fire-and-forget, non-blocking (mirrors the DIAG-060 §2 non-propagation property).

### EPG-2 (pasted)
```
middleware.ts:153 auth.redirect.unauth_root   :167 auth.redirect.unauth_protected
middleware.ts:272 auth.redirect.mfa_verify    :282 auth.redirect.mfa_enroll
middleware.ts:311 auth.redirect.tenant_cookie_present  :314 auth.redirect.tenant_select
middleware.ts:329 auth.redirect.default_workspace      (:355 auth.permission.denied pre-existing)
auth-shell.tsx:109 auth.shell.loop_break  :125 auth.shell.unauth_redirect
auth-shell.tsx:139 auth.shell.tenant_gate :159 auth.shell.hydration_timeout
tenant-context.tsx:213 tenant.cleared
resolve-identity.ts:76/80/85 identity.resolve.{query_error,zero_rows,duplicate_rows}
```

---

## 3. Phase 3 — canonical writer (`web/scripts/provision-user.ts`, new)
`provisionUser(admin, spec, apply)` — ensureAuthUser (FRMX) + exactly ONE profiles row keyed `auth_user_id` (role alias-normalized), check-then-write, **ABORT LOUD** on >1 existing rows or post-state ≠ 1 profile (HF-280 atomicity at the identity layer). **Dry-run by default**, `--apply` to write. `fix-sabor-users.ts` marked `SUPERSEDED` and committed (forensic artifact, SR-41).

### EPG-3 (dry-run output)
```
=== provision-user.ts (DRY RUN — no writes) ===
profiles=13 distinct auth_user_id=11 duplicate-groups=2
  DUP auth_user_id=9c179b53… count=2
  DUP auth_user_id=11596f62… count=2
  PLAN admin@bancocumbre.ec: auth=updated profile=inserted authId=b5a8374d… finalProfileCount=-1
```
**Live orphan repair NOT run** (orphan divergence + only one authoritative spec). Architect runs `--apply` after dispositioning the remaining orphans' roles/tenants.

---

## 4. Phase 4 — migration (amended per HALT-2 disposition; architect-applied, SR-44)
`web/supabase/migrations/20260610120000_hf282_profile_dedup.sql` (canonical post-HF-259 location; renamed from `…_single_profile_canon.sql` and relocated from the deprecated repo-root `supabase/migrations/`) — STEP 1 FK guard (re-asserts 0 refs for BOTH the platform-inheritance non-keepers and the non-platform duplicate-group rows), STEP 2a platform-inheritance dedup (deletes platform@'s `vl_admin` row, keeps the `platform` row `id=auth_user_id`; no privilege escalation), **STEP 2b sandbox-artifact removal — deletes BOTH tdelcarlo rows** (structural: any duplicate group with no platform-normalized row; ids/email in comments only, AP-25), STEP 3 assert 0 duplicate groups (now passes). **STEP 4/5 (`UNIQUE(auth_user_id)` + post-assert) REMOVED** — constraint deferred to the Platform-Created-Users OB (architect disposition). **EPG-4 (architect applies, then CC tsx-reads): dup census 0, platform@ 1 row, tdelcarlo 0 rows — OUTSTANDING.**

---

## 5. Phase 5 — verification
- `resolve-identity.test.ts` — **10/10**: zero/error→null; one row alias-normalized; platform@ two-row shape → raw-platform `id=auth_user_id` winner; neither-platform→oldest; manage_tenants tiebreaker; tenant-gate fires only post-hydration, not while loading, not with a tenant/exempt/non-admin.
- **Full regression 52/52** (HF-279 17 + HF-280 7 + HF-281 7 + adapter 11 + HF-282 10).
- Korean gate PASS; `rm -rf .next && npm run build` → `✓ Compiled successfully`; dev → `localhost:3000` HTTP 307.

---

## 6. Phase 6 — SR-39 compliance
| Axis | Standard | Finding |
|---|---|---|
| Unique identification → single authorization record | SOC 2 CC6.1 | **Reader-enforced now** (resolveIdentity); **data-enforced DEFERRED to the Platform-Created-Users OB** by architect HALT-2 disposition (2026-06-10) — the `UNIQUE(auth_user_id)` constraint was removed from the Phase 4 migration because it is incompatible with the current tenant-create creator-profile insert path. The dedup (platform@ + tdelcarlo sandbox rows) still ships and is applied; the constraint is the named OB's surface. |
| Session-termination/redirect events logged | SOC 2 CC6 / OWASP ASVS V7 | Phase 2.3 closes the 13-branch silent-ejection gap (DIAG-060 §6). |
| No privilege escalation via duplicate-role rows | NIST 800-63B / DS-014 | Migration removes platform@'s `vl_admin`-alias row (lower-priv alias of the same canonical platform identity) — no escalation; both rows normalized to platform, no access lost. |
| Cookie attributes unchanged-or-better | OWASP ASVS V3 | This HF does not alter any `HttpOnly`/`Secure`/`SameSite` posture; the tenant cookie's client-write nature is explicitly out of scope (§6) and not weakened. |
No non-compliant finding that warrants STOP — the one incomplete axis (constraint) is gated behind the architect's HALT-2 disposition by design, not a failure.

## Files changed
```
NEW web/src/lib/auth/resolve-identity.ts (+97)   NEW web/src/lib/auth/tenant-gate.ts (+32)
NEW web/src/lib/auth/__tests__/resolve-identity.test.ts (+103)
NEW web/scripts/provision-user.ts (+130)         NEW web/scripts/hf282-phase0-evidence.ts (+64)
NEW web/supabase/migrations/20260610120000_hf282_profile_dedup.sql (canonical post-HF-259 location)
MOD web/src/middleware.ts (4 reads → resolveIdentity, +7 redirect events)
MOD web/src/lib/supabase/auth-service.ts  MOD web/src/lib/auth/server-auth.ts
MOD web/src/lib/auth/auth-logger.ts (+15 event types)  MOD web/src/components/layout/auth-shell.tsx
MOD web/src/contexts/tenant-context.tsx   MOD(committed) web/scripts/fix-sabor-users.ts (SUPERSEDED header)
```

## Outstanding architect steps (SR-44)
1. **HALT-2 disposition** for tdelcarlo (multi-tenant) before the migration's STEP-3 assertion can pass / the constraint can apply.
2. **Apply** the migration (Dashboard SQL Editor); then CC tsx-reads EPG-4.
3. **Disposition orphan roles/tenants** (Banco Cumbre + admin@vialuce.ai + **`tdelcarlo@vialuce.ai`/11596f62… which becomes a zero-profile orphan after the migration's STEP 2b**), then `provision-user.ts --apply`.
4. **Production browser verification:** platform@ login + tenant entry unchanged; tdadmin login + BCL entry holds across repeated full-page loads; Sabor users (if intended as login users) past the profile screen.
5. **§6A Site URL** (Dashboard): set to `https://www.vialuce.ai`, add `http://localhost:3000/**` to redirect URLs.

---
*HF-282 · Canonical Identity Resolution · vialuce.ai*
