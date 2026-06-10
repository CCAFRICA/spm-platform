# HF-283 Phase 1 — `vl_admin` class inventory & classification

**Date:** 2026-06-10 · branch `hf-283-rls-platform-predicate` · evidence for Commit 2.
Source = committed migrations only (live `pg_policies` not readable via service-role PostgREST; the Phase 3 global assertion is the live-drift net).

## 1.1 — Migration policy inventory (per-migration, classified)

All `vl_admin` policy hits are in **`web/supabase/migrations/`** (repo-root `supabase/migrations/` has none). 77 `CREATE POLICY` statements across 8 migrations reference the role layer.

| migration | #CREATE POLICY | role clause shape | classification |
|---|---|---|---|
| `005_platform_user_nullable_tenant.sql` | 3 (2 vl_admin) | `EXISTS(… role = 'vl_admin')` (tenants, profiles) | **policy-literal-to-rekey (pure)** |
| `006_vl_admin_cross_tenant_read.sql` | 21 | `EXISTS(… role = 'vl_admin')` SELECT on 21 tables | **policy-literal-to-rekey (pure)** |
| `007_ingestion_facility.sql:60` | 1 (`classification_signals_update`) | `tenant_id IN (…) OR EXISTS(… role = 'vl_admin')` | **policy-literal-to-rekey (OR-disjunct, byte-preservable → `OR public.is_platform()`)** |
| `009_vl_admin_write_access.sql` | 37 | `EXISTS(… role = 'vl_admin')` INSERT/UPDATE/DELETE on ~24 tables | **policy-literal-to-rekey (pure)** · plus a DML tail `UPDATE profiles SET capabilities… WHERE role='vl_admin'` (line 261) = **data-script (no-op now: 0 vl_admin rows), not re-keyed** |
| `010_import_storage_bucket.sql` | 3 (`VL Admin full storage access` on `storage.objects`) | `bucket_id='imports' AND EXISTS(… role='vl_admin')` | **policy-literal-to-rekey (byte-preservable; bucket clause preserved)** |
| `013_approval_requests.sql:68` | 4 (1 vl_admin) | `EXISTS(… role = 'vl_admin')` FOR ALL | **policy-literal-to-rekey (pure)** |
| `021_ingestion_raw_storage_policies.sql` | 4 (storage.objects) | `role IN ('platform','vl_admin','admin')` **+ nested** `role IN ('platform','vl_admin') OR (folder-scoped role='admin')` | **⚠ ENTANGLED — HALT-2** (see below) |
| `022_hf134_rls_audit_hardening.sql` | 5 | `tenant_id IN (…) OR EXISTS(… role IN ('platform','vl_admin'))` | **policy-literal-to-rekey (OR-disjunct, byte-preservable → `OR public.is_platform()`)** |

Comment/audit-string hits (no re-key): `005:4,18`, `006:4,7,9,14`, `009:6,18,25,193`, header comments — classification **comment/audit-string**.

## 1.2 — Code inventory (`web/src/`, `web/scripts/`) — HALT-1 check

| file:line | hit | classification |
|---|---|---|
| `web/src/lib/auth/permissions.ts:70` | `'vl_admin': 'platform'` | **resolveRole alias map (expected canon)** |
| `web/src/lib/auth/resolve-identity.ts` (17,34,95,96) | comments | display/comment |
| `web/src/middleware.ts:278,303` | comments | comment |
| `web/src/lib/auth/__tests__/resolve-identity.test.ts` | test fixtures | test |
| **`web/src/app/api/lifecycle/transition/route.ts:89`** | `const isVLAdmin = profile.role === 'platform' \|\| profile.role === 'vl_admin';` | **⚠ GATING LOGIC on raw literal outside resolveRole — HALT-1** |
| `web/src/app/api/lifecycle/transition/route.ts:127` | `.in('role', ['admin','platform','vl_admin'])` | gating-adjacent query filter, raw literals |
| `web/scripts/*` (fix-optica-luminar, hf027-*, seed-test-pipeline, verify-*, provision-user, fix-sabor-users) | data-roling / verification / display | scripts (not app gate path) |

## 1.3 — Re-key set (policy-literal-to-rekey)
**~73 policies** across 005/006/007/009/010/013/022 are clean or byte-preservable re-keys to `public.is_platform()`. **021 (4 policies) is NOT** — it is HALT-2.

---

## HALT FINDINGS (no self-disposition — surfaced for architect)

### HALT-1 (Phase 1.2) — code gates on raw `'vl_admin'` outside resolveRole
`web/src/app/api/lifecycle/transition/route.ts:88-91`:
```ts
// 3. Verify tenant isolation
const isVLAdmin = profile.role === 'platform' || profile.role === 'vl_admin';
if (!isVLAdmin && profile.tenant_id !== batch.tenant_id) {
  return NextResponse.json({ error: 'Access denied' }, { status: 403 });
}
```
`isVLAdmin` controls the tenant-isolation bypass (:90) and sole-admin logic (:120-127, which also queries `.in('role', ['admin','platform','vl_admin'])`). It gates on the raw `'vl_admin'` literal rather than `resolveRole`. It accepts `'platform'` too, so it is not *functionally* broken for platform users — but it is exactly the scattered-literal class this HF closes (Korean Test / AP-25). **Disposition needed:** include in HF-283's scope (re-key to `resolveRole(profile.role) === 'platform'`), or carry as a separate item.

### HALT-2 (Phase 3.1b, discovered in inventory) — `021` entangles role + tenant-folder scoping
`web/supabase/migrations/021_ingestion_raw_storage_policies.sql:21-41` (`ingestion_raw_insert`, and the 3 sibling 021 policies):
```sql
AND EXISTS (SELECT 1 FROM public.profiles
            WHERE auth_user_id = auth.uid()
              AND role IN ('platform', 'vl_admin', 'admin'))   -- includes 'admin'
AND (
  EXISTS (SELECT 1 FROM public.profiles
          WHERE auth_user_id = auth.uid() AND role IN ('platform', 'vl_admin'))   -- platform tier
  OR
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role = 'admin')        -- tenant-admin tier, folder-scoped
)
```
`public.is_platform()` covers `platform`+`vl_admin` only. Replacing the role clauses with it would **drop `'admin'`** (the outer gate and the tenant-admin folder-scoped branch) → **narrows access** → NOT byte-preserving (DD-7). The byte-preserving rewrite needs a *second* canonical predicate (e.g. `public.is_tenant_admin()` / `public.has_role('admin')`) — out of this HF's stated one-predicate design. **Disposition needed:** (a) add a second predicate and re-key 021 with both; (b) exclude 021 from the global assertion (leaving its `vl_admin` literal, contradicting class closure); or (c) split 021 to a follow-on.

### Scope note (not a HALT, but material)
The directive's example showed one policy (`tenants_select_vl_admin`); the actual class is **~77 policies + 1 code gate**. The migration's global assertion `pg_policies WHERE qual ILIKE '%vl_admin%' → 0` requires **every** member handled — including the HALT-2 021 set — so the migration cannot be authored to pass its own assertion until 021 is dispositioned. Additionally, byte-preservation is asserted against committed-migration text; live policies may have drifted (unreadable here) — the architect's Phase-6 EPG-1 reveals live state, but authoring precedes it.
