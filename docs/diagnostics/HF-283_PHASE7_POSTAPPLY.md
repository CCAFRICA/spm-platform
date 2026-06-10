# HF-283 Phase 7 — post-apply verification (JWT set equality)

Architect applied the migration (Phase 6 HALT-APPLY) 2026-06-10.

## EPG-1 post-apply (R2 widened query) — class closure
72 policies; **zero `vl_admin`** in any qual/with_check — all now reference `is_platform()`.
roles/permissive match EPG-1-PRE-R2 row-for-row: 68 `{public}` + 4 `ingestion_raw`
storage `{authenticated}`; all PERMISSIVE. C-category `profiles.id=auth.uid()` tenant
clauses and G-category 021 admin/folder branches preserved verbatim. The migration's
DO-block assertion PASSED (transaction committed) → no HALT-5.

## verify-hf283-rls.ts — pre vs post (credential-free mint, Addendum-4)
```
PRE-APPLY (honest negative control):
  service-role tenants: 9 ids
  tdadmin:   0 -> G-A FAIL
  eoadmin:   0 -> G-A FAIL
  platform@: 0 -> G-A FAIL
  control admin@saborgrupo.mx: 1 -> G-B PASS (own=Sabor)

POST-APPLY:
  service-role tenants: 9 ids
  tdadmin:   9 -> G-A PASS
  eoadmin:   9 -> G-A PASS
  platform@: 9 -> G-A PASS
  control admin@saborgrupo.mx: 1 -> G-B PASS (own=Sabor)
```
G-A PASS = each platform JWT's visible tenant set EQUALS the service-role full set (9 ids,
including Banco Cumbre b1c2d3e4-aaaa-bbbb-cccc-111111111111 and Meridian
5035b1e8-0754-4527-b7ec-9f93f85e4c79). G-B PASS = control isolated to its own tenant.
The pre-FAIL/post-PASS flip is the structural proof (verify by structure, not totals).
