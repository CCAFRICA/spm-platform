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

---

# APPENDIX (A1.3.2) — EPG-1-PRE live-policy reconciliation & re-key spec

Architect supplied EPG-1-PRE (live `pg_policies` for `vl_admin`/`is_platform` in qual/with_check, 2026-06-10). **Live text is authoritative for byte-preservation (A1.3.2).** 72 live policies reference the legacy `'vl_admin'` literal. Categorized below = the Phase 3 authoring spec. The retirement set is the `'vl_admin'` STRING only; `'admin'` and `'platform'`-outside-predicate preserved byte-for-byte (A1.2.1).

## Live-vs-committed divergences (tabled, not HALT)
- **`profiles.profiles_select_vl_admin`** — present in committed `005`, **ABSENT from live** → NOT re-keyed (does not exist live). Note: platform `profiles` cross-tenant read is not live; out of scope (tenant entry needs `tenants`, not `profiles`, visibility).
- **Live-only policies (not in committed 001/005/006/007/009/010/013/021/022):** `agent_inbox/tenant_isolation_agent_inbox`, `alias_registry/tenant_iso_alias`, `alias_registry/tenant_isolation_alias_registry`, `platform_events/tenant_isolation_platform_events`, `reference_data/tenant_iso_ref_data`, `reference_items/tenant_iso_ref_items`, `reference_items/tenant_isolation_reference_items`, `user_journey/tenant_isolation_user_journey`, `platform_settings/platform_read_settings`, `platform_settings/platform_update_settings`. They JOIN the re-key set from live text (A1.3.2).
- **Storage-policy name divergence:** committed `010`/`021` use names like `ingestion_raw_insert`; LIVE names are Supabase-auto `"VL Admin full storage access"`, `"ingestion_raw_insert 13cn3lr_0"`, etc. Re-key BY LIVE NAME (quoted; `ON storage.objects`).
- **`profiles.id = auth.uid()` join (vs canonical `auth_user_id`):** in `tenant_iso_alias`, `tenant_iso_ref_data`, `tenant_iso_ref_items` the PRESERVED tenant clause uses the (latent-buggy) `profiles.id = auth.uid()` join — byte-preserved verbatim; only the `EXISTS(... role='vl_admin')` disjunct is replaced by `public.is_platform()` (which uses the canonical `auth_user_id` join). NOT ambiguous (Category C) — no new HALT-2.

## Re-key categories (transformation per category; preserve all non-role clauses)
- **A. Pure `EXISTS(… auth_user_id=auth.uid() AND role='vl_admin')` → `public.is_platform()`** (qual or with_check, bucket clause preserved where present). 57 policies: approval_requests/vl_admin_full_access_approval_requests; audit_logs ins/sel; calculation_batches ins/sel/upd; calculation_results ins/sel; calculation_traces ins/sel; classification_signals ins/sel; committed_data ins/sel; entities ins/sel/upd; entity_period_outcomes del/ins/sel/upd; entity_relationships ins/sel/upd; import_batches ins/sel; ingestion_configs ins/sel/upd; ingestion_events ins/sel; period_entity_state del/ins/sel/upd; periods ins/sel/upd; profile_scope del/ins/sel/upd; reassignment_events ins/sel; reconciliation_sessions ins/sel; rule_set_assignments del/ins/sel/upd; rule_sets del/ins/sel/upd; **tenants/tenants_select_vl_admin (THE tenant-entry fix)**; usage_metering ins/sel.
- **B. tenant-isolation OR-disjunct (`tenant_id IN (… auth_user_id=auth.uid()) OR EXISTS(… role=ANY['platform','vl_admin'])`) → `<tenant clause> OR public.is_platform()`.** 5: agent_inbox, alias_registry/tenant_isolation_alias_registry, platform_events, reference_items/tenant_isolation_reference_items, user_journey. (These already grant platform users; re-key preserves the set, removes the literal.)
- **C. id-join OR-disjunct (`profiles.id=auth.uid()`) → preserve tenant clause verbatim, role disjunct → public.is_platform().** 3: alias_registry/tenant_iso_alias (`tenant_id IS NULL OR tenant_id=(…) OR is_platform()`), reference_data/tenant_iso_ref_data, reference_items/tenant_iso_ref_items.
- **D. scalar subselect `(SELECT role … auth_user_id=auth.uid())='vl_admin'` → `public.is_platform()`.** 2: platform_settings/platform_read_settings (SELECT), platform_update_settings (UPDATE).
- **E. storage pure (`bucket_id='imports' AND EXISTS(role='vl_admin')`) → `bucket_id='imports' AND public.is_platform()`** (qual + with_check). 1: objects/"VL Admin full storage access".
- **F. storage role=ANY(platform,vl_admin) → `bucket AND public.is_platform()`.** 2: objects/"ingestion_raw_delete 13cn3lr_0" (DELETE), "ingestion_raw_delete 13cn3lr_1" (SELECT).
- **G. storage 021-entangled (A1.2): `role=ANY(platform,vl_admin,admin)` → `(public.is_platform() OR EXISTS(role='admin'))`; inner `role=ANY(platform,vl_admin)` → `public.is_platform()`; folder-scoped admin branch byte-preserved.** 2: objects/"ingestion_raw_insert 13cn3lr_0" (INSERT, with_check), "ingestion_raw_select 13cn3lr_0" (SELECT, qual).

Total = 57 (A) + 5 (B) + 3 (C) + 2 (D) + 1 (E) + 2 (F) + 2 (G) = **72 live policies re-keyed**. Global assertion (`pg_policies` 0 `vl_admin`) is the closure proof.

---

# APPENDIX 2 (Addendum-3 / A3.2) — EPG-1-PRE-R2 roles+permissive reconciliation

Architect supplied EPG-1-PRE-R2 (widened: `schemaname, permissive, roles` added; same WHERE/ORDER), 2026-06-10. R2 is the authoritative re-key source. `qual`/`with_check` text reconciles with EPG-1-PRE **row-for-row — no divergence** (no HALT-2 from R2).

- **permissive:** ALL 72 policies are `PERMISSIVE`. **Zero RESTRICTIVE** → no `AS RESTRICTIVE` clauses; recreates default to PERMISSIVE (correct).
- **roles:** `{public}` for all 68 `public`-schema policies + `storage.objects/"VL Admin full storage access"` → recreated with NO `TO` clause (PUBLIC default, exact). `{authenticated}` for exactly the 4 `storage.objects` `ingestion_raw` policies (`ingestion_raw_delete 13cn3lr_0`/`_1`, `ingestion_raw_insert 13cn3lr_0`, `ingestion_raw_select 13cn3lr_0`) → recreated with `TO authenticated`. **No multi-role lists; no roles other than {public}/{authenticated}.**
- **schemaname:** `public` (68) + `storage` (5 objects policies). All schema-qualified in DROP/CREATE.

Full policy identity (`roles`+`permissive`+`qual`/`with_check`) is now byte-preserved (DD-7 per A3.1). The behavioral-equivalence/default-PUBLIC path is withdrawn.
