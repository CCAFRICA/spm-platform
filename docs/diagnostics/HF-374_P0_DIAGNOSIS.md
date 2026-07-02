# HF-374 P0 DIAGNOSIS — Revenue serving fails for platform-admin sessions: "No tenant specified"

**Date:** 2026-07-01 · **Branch:** `hf-374-revenue-tenant-resolution` (cut from main `f3136d2e`; contains #655 `8992cec3` + #656 `f3136d2e` — ancestry-verified)
**Sequence sanity:** no HF-374 files existed in `docs/diagnostics/` or `docs/completion-reports/` before this one (grep exit 1).

## VERDICT (EPG-0.4): CLIENT-ONLY defect

The server derivation and the data layer are healthy. The Revenue CLIENT never transmits the
effective tenant — a platform-admin session (profile `tenant_id = NULL`) therefore hits
`resolveCallerTenant(undefined)` → 400 `"No tenant specified"`. Regular tenant users are unaffected
(session-pinned path). This is the named recurring class (HF-352/353/354/357/OB-246 lineage) in its
CLIENT variant: the request builder assumed "session-derived server-side" covers platform admins —
it does not; the platform's effective-tenant carrier on data routes is the CLIENT-SENT tenantId
sourced from the tenant switcher's context, validated server-side.

## EPG-0.1 — Client side

The shared builder (`web/src/lib/revenue/revenue-data-service.ts:41-45`) sends NO tenant — and its
header comment records the wrong design assumption verbatim:

```ts
 * ... Unlike the
 * financial service, the tenant is session-derived server-side (resolveCallerTenant, ADR
 * minor decisions), so no tenantId crosses the wire.
...
async function fetchRevenueData<T>(mode: RevenueMode, opts?: RevenueLoadOpts): Promise<T> {
  const res = await fetch('/api/revenue/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, ...(opts ?? {}) }),   // <-- no tenantId, ever
  });
```

The working Financial builder (`web/src/lib/financial/financial-data-service.ts:289-297`) sends it:

```ts
async function fetchFinancialData<T>(
  tenantId: string,
  mode: string,
  params?: Record<string, unknown> | FinancialScope
): Promise<T | null> {
  const res = await fetch('/api/financial/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, mode, ...(params || {}) }),
  });
```

Financial pages source it from the switcher-effective tenant (`financial/pulse/page.tsx`):

```
41:  const { currentTenant } = useTenant();
49:  const tenantId = currentTenant?.id;
80:    if (!tenantId) { setLoading(false); return; }
83:    loadNetworkPulseData(tenantId, financialScope)
```

Revenue pages never touch `useTenant()` (`app/revenue/page.tsx:153: loadPulse({ scopeEntityIds })`
— grep for `tenantId|currentTenant|useTenant` over the 8 revenue pages matches nothing but comments).
`InsightSlot.tsx:59` likewise: `fetch('/api/revenue/insights')` with no `?tenantId=`.

## EPG-0.2 — Server side

All three Revenue routes ALREADY accept a requested tenant — identical shape to Financial:

```
web/src/app/api/revenue/data/route.ts:232:     const auth = await resolveCallerTenant(body.tenantId);
web/src/app/api/revenue/insights/route.ts:34:  const auth = await resolveCallerTenant(request.nextUrl.searchParams.get('tenantId'));
web/src/app/api/financial/data/route.ts:1276:  const auth = await resolveCallerTenant((body as { tenantId?: string })?.tenantId);
```

The divergence that produces the error is in `web/src/lib/auth/api-tenant.ts:50-54` — for platform
roles the ONLY tenant sources are the client-sent `requested` or the profile tenant (NULL for
platform admins); the `vialuce-tenant-id` cookie is NOT read here:

```ts
  if (isPlatform) {
    const tenantId = requested || sessionTenant;
    if (!tenantId) {
      return { ok: false, response: NextResponse.json({ error: 'No tenant specified' }, { status: 400 }) };
    }
```

Financial works on production for the SAME session because its client sends `requested`; Revenue
fails because its client sends nothing. `/api/revenue/activate` takes tenantId in its body
explicitly (platform-gated) — unaffected.

## EPG-0.3 — Data layer (live counts, project `https://bayqxeil…` — the only project configured in the repo)

```
revenue_period: 6
revenue_entity_period: 510
revenue_dimension_period: 66
revenue_meta: 1
BCL revenue_enabled: true
```

Rollups present; entitlement on. NOT a data-layer failure. Environment identity note: production's
`NEXT_PUBLIC_SUPABASE_URL` lives in Vercel env (not in-repo), but production's entitlement gate
PASSED for BCL and `revenue_enabled=true` exists only in this project (set during OB-257 PG-2) —
production therefore serves from this same project. No activation run needed; none performed.

## EPG-0.4 — Layer verdict with evidence lines

- **Client: DEFECTIVE** — `revenue-data-service.ts:41-45` (no tenantId in body), `InsightSlot.tsx:59`
  (no `?tenantId=`), zero `useTenant()` usage in the 8 pages.
- **Server: CORRECT** — `revenue/data/route.ts:232` + `revenue/insights/route.ts:34` already accept
  `requested` exactly like `financial/data/route.ts:1276`; the 400 originates in the shared
  `api-tenant.ts:53` fail-closed branch, behaving as designed.
- **Data: CORRECT** — all four namespaces populated for BCL; entitlement on.

**Why OB-257's own gates missed it:** PG-2/PG-4/PG-5 ran as service-role scripts (no browser
session); the browser render gate (PG-3) was architect-side and is precisely the gate that caught
this — in production.

## Phase 1 authorization

Phase 0 confirms the resolution defect in the suspected class (client variant). Fix scope: the ONE
shared client builder carries `tenantId` sourced from the switcher-effective tenant context
(`useTenant().currentTenant?.id`), Financial-idiom-exact, across the 8 pages + InsightSlot; server
untouched (already correct). DD-7: regular tenant users' requests gain `requested === sessionTenant`,
which `resolveCallerTenant` treats identically (same-tenant pass) — behavior preserved.
