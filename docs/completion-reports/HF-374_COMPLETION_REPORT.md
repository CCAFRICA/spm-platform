# HF-374 COMPLETION REPORT — Revenue client carries the effective tenant

**Date:** 2026-07-01 · **Branch:** `hf-374-revenue-tenant-resolution` (from main `f3136d2e`, contains #655+#656)
**Commits:** `b765dab0` (P0 diagnosis) · `ee2ca5cc` (fix)

## Defect and verdict

Production platform-admin sessions loading `/revenue` got the fail-closed 400 `"No tenant specified"`.
**CLIENT-ONLY defect** (full evidence: `docs/diagnostics/HF-374_P0_DIAGNOSIS.md`): the Revenue data
service never sent a tenant — its header comment recorded the wrong assumption verbatim ("no tenantId
crosses the wire") — while `resolveCallerTenant` (api-tenant.ts:50-54) gives platform roles exactly two
tenant sources: the client-sent `requested` or the profile tenant (NULL for platform admins; no cookie
fallback). Server routes and the data layer were verified CORRECT (routes already accept
`body.tenantId`/`?tenantId=` like Financial; BCL rollups live: 6/510/66/1; `revenue_enabled: true`).
Class lineage: HF-352/353/354/357/OB-246 — this is the CLIENT variant of the effective-tenant
resolution class.

## Fix (Financial-idiom-exact; 11 files; server untouched)

- `RevenueRequest` gains `tenantId?: string` (documented: switcher-effective tenant; platform admins
  REQUIRE it; regular users validated same-tenant server-side).
- ONE shared builder change: `fetchRevenueData(tenantId, mode, opts)` sends
  `{ tenantId, mode, ...opts }`; all 8 loaders take the required first param — the exact
  `financial-data-service` shape. The wrong header comment is corrected to state the actual contract.
- All 8 pages source `useTenant().currentTenant?.id`, guard the fetch effect on it, pass it first,
  and carry it in the effect deps (`financial/pulse/page.tsx` idiom; bridge/mix use the literal
  `setLoading(false)` guard — the six pages without a loading state use the same-semantics early
  return, noted as the one faithful adaptation).
- `InsightSlot` fetches `/api/revenue/insights?tenantId=…` and skips while the tenant context resolves.

**DD-7:** regular tenant users previously sent NO tenantId (session-pinned branch); they now send
their own tenant id, which `resolveCallerTenant`'s same-tenant branch treats identically — behavior
preserved. Platform admins go from 400 to served data. `git diff` over `web/src/app/api` and
`lib/auth/api-tenant.ts`: zero files — server provably untouched.

## Evidence

```
$ npx tsc --noEmit | tail        -> only the 2 known pre-existing TS2802s (sci test files)
$ rm -rf .next && npm run build  -> exit 0, BUILD_ID 5_0wTT-aUkauMKy9UiyF7
$ npm test                       -> tests 583 / pass 583 / fail 0
$ npm run dev; curl localhost:3000 -> HTTP 307 (server live)
grep useTenant over 8 pages + InsightSlot -> 9/9 files
revenue-data-service.ts:51: body: JSON.stringify({ tenantId, mode, ...(opts ?? {}) })
```

## Residuals

1. **Production browser verification is the closing gate (SR-44):** after deploy, a platform admin
   with BCL effective reloads `/revenue` — expect data, not the 400. This re-runs OB-257 PG-3 which
   is what caught the defect.
2. `resolveCallerTenant` still has no `vialuce-tenant-id` cookie fallback for platform roles — a
   server-side belt-and-suspenders for this class (middleware already reads that cookie for the
   feature gate). Architect call; not taken here to keep the fix within the working Financial
   pattern (SR-34: the class closes at the shared builder, not with a second resolution path).
3. Untracked `web/scripts/_hf373_*` files belong to the concurrent HF-373 session — untouched.
