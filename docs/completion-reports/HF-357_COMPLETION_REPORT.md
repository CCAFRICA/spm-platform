# HF-357 — Data Operations: Tenant Context Resolution

**Branch:** `hf-357-data-ops-tenant-context` (off `main` @ `30365579`) · **Date:** 2026-06-29
**Defect source:** CLT-253 / SR-44 browser verification of OB-253. **CC stops at PR (SR-44).**

---

## Root cause
`/data` (the OB-253 Data Operations surface) showed `⚠ No tenant context` and rendered nothing. The page calls `GET /api/data/overview`, which in OB-253 resolved the tenant from `state.profile.tenant_id`:

```ts
// OB-253 (the bug) — web/src/app/api/data/overview/route.ts
const tenantId = (state.profile as { tenant_id?: string }).tenant_id;
if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 });
```

A **platform admin's `profiles.tenant_id` is NULL** (platform users carry no tenant — migration 005, established OB-247/OB-252). So for any platform admin the route returned 400 regardless of the tenant selected in the switcher. Every other tenant-scoped PRISM route avoids this by using the **canonical resolver** `resolveActor()` (`lib/prism/actor.ts`), whose own header documents this exact class (OB-245 HALT-C): *"resolveActor used to require a non-null profile.tenant_id, which platform users do not have"* — it resolves `profile.tenant_id` for operators and, **for platform admins, the `vialuce-tenant-id` cookie the tenant switcher sets** (`tenant-context.tsx:191`). The OB-253 route did not use it — the SR-34 adjacent-arm drift (same class as HF-352/353/354: code correct, scope context unresolved at the boundary).

## The fix (class-layer, SR-34)
Both `/data` API routes now resolve the tenant via `resolveActor()` — the same mechanism the 5+ live `/api/prism/*` routes use:

```ts
// HF-357 — web/src/app/api/data/overview/route.ts
const actor = await resolveActor();
if (!actor) {
  const state = await getServerAuthState();
  if (!state.isAuthenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ needsTenant: true }, { status: 200 }); // authed, no tenant selected → friendly empty state
}
const tenantId = actor.tenantId; // operator: profile tenant; platform admin: selected-tenant cookie
```

- `web/src/app/api/data/overview/route.ts` — `resolveActor`; null+authed → `{ needsTenant: true }` (200), not a 400 error.
- `web/src/app/api/data/acknowledge/route.ts` — `resolveActor`; `signal_value.by = actor.profileId` (retired the unused `getServerAuthState` import).
- `web/src/app/data/page.tsx` — handles `{ needsTenant: true }` → renders **"Select a tenant to view Data Operations"** (muted, Database icon), NOT the `⚠ No tenant context` warning. Selecting a tenant + Refresh loads it.

No endpoint contract change beyond the resolver; no new routes/surfaces/nav (§6 of OB-253 holds). The page passes no tenant_id — the API resolves it server-side from the cookie the switcher sets, exactly like `/api/prism/*` (the existing mechanism, §3 invariant).

## PG-357 evidence
**Browser verification is architect-only (SR-44).** CC-side proof the surface will render real data once the tenant resolves:

- **tsc clean** on all three files; **`npm run build` green (219/219 static pages)**.
- **Resolver is the proven class pattern:** `resolveActor` is used by `/api/prism/{files,commit,prepare,cleared,scan}` (all live since OB-245/250); the tenant switcher sets `document.cookie = vialuce-tenant-id=<id>` (`tenant-context.tsx:191`), which `resolveActor` reads for platform admins.
- **VLTEST2 (the directive's test tenant) is ready** — read-only live query of the metrics `/api/data/overview` returns:
```
VLTEST2: prism_enabled=true  committed=0  structural_fingerprints=9  classification_signals=21
```
So once a platform admin selects VLTEST2, `resolveActor` → VLTEST2, the PRISM gate passes, and the page renders **real metrics** (9 known structures, 21 signals) with empty jobs/trust-flag states (a fresh tenant with no committed rows) — deliverable #6 (zeros/empty, NOT "No tenant context"). Robles (prism=true, all 0) renders all-zeros likewise. Non-prism tenants get the honest "Data Operations not enabled for this tenant" (the workspace gate), a distinct correct message — not the bug.
- **Scale (SR-2):** the fix is tenant-agnostic — operators resolve their own `profile.tenant_id`; platform admins resolve any selected tenant. Works for every tenant in the fleet, not VLTEST2 only.

## HALT check
No HALT-PATTERN (Platform Core pages CAN read tenant context — `resolveActor`/cookie is the existing, working mechanism; no agent-model violation, no page-level selector needed). No HALT-SCOPE (the resolver is a single function call, not a shared-infra change).

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: HF-357 → fixed; closes the OB-253 SR-44 browser-verification gap (CLT-253).
REGISTRY: OB-253 Data Operations row → ev add "HF-357 tenant-context resolution (resolveActor); VLTEST2 renders live".
R1: PG-357 → tenant resolution fixed + build green + VLTEST2 data-ready; browser confirmation = architect (SR-44).
BOARD: now = /data resolves the selected tenant for platform admins (resolveActor) + friendly no-tenant state.
       gap = browser confirmation (architect). ev = tsc/build + live VLTEST2 query. ef = low. fl = green.
SUBSTRATE: reused resolveActor (the canonical PRISM tenant resolver) — the SR-34 class fix for the
       HF-352/353/354/357 "scope context unresolved at the boundary" pattern.
```

## PR
`gh pr create --base main --head hf-357-data-ops-tenant-context`. CC does not merge (SR-44).
