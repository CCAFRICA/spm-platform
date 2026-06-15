# OB-211 WS7 Stage 1 — Scope Fail-Closed (root SR-39): Completion Report

**Date:** 2026-06-15 · **Branch:** `ws7-stage1-scope-failclosed` · **Gate:** #518 (WS7-A) on main (`d97eb98c`). · **Principle:** the security foundation is Stage 1 of the comprehensive work — the root beneath WS7-A's surface closures, surfaced twice, now fixed.

---

## The root bug (verified, surfaced twice)

`persona-context.tsx:290` — a manager with no derivable scope (no `profile_scope` row, no brand data) fell back to `{ entityIds: [], canSeeAll: true }` → **fail-OPEN**. `canSeeAll:true` → `allowedEntityIds = null` → every scope guard SKIPPED:
- WS7-A's statement membership guard (`:186` — `if (allowedEntityIds && ...)` skipped when null);
- `buildManagerData` re-expands to all (`:425 if (teamEntityIds.length === 0 && canSeeAll) teamEntityIds = allResults.map(...)`);
- the same scope feeds Simulate (`teamResults`), the team heatmap, bloodwork, the financial pages, my-compensation, mission-control.

→ an unscoped manager could view/aggregate the **whole tenant**. Surfaced by the OB-211 Simulate sweep AND the WS7-A sweep; deferred twice.

## The fix (fail-closed at root — SR-34, least privilege)

`{ entityIds: [], canSeeAll: false }`. Absence of a derivable scope defaults to **least privilege**, not most. Propagation (verified in code):
- `buildManagerData:425` re-expand-to-all is now SKIPPED (`canSeeAll` false) → the unscoped manager is bounded to their `entity_relationships`-resolved team or empty, never the tenant.
- WS7-A's statement: `allowedEntityIds` is now NON-null for the unscoped manager → the `:186` guard now **RUNS** (was skipped) → WS7-A's closure becomes **effective for unscoped managers**.
- `setEntityId(linkedEntityId)` still runs → the manager keeps their own entity (the statement union in WS7-A lets them see their own statement).

**A properly-scoped manager is UNAFFECTED:** they return early at `:259` (`profile_scope` → `mgrScope`, `canSeeAll:false`) or `:281` (brand override → `brandScope`, `canSeeAll:false`) — they never reach the changed line. Only the genuinely-unscoped manager changes.

## HALT-SCOPE-DEMO (the architect's data-context resolution)

A demo manager who relied on the old fail-open to see their team — i.e. whose `profile_scope` isn't populated — now sees only their own entity. **The correct resolution is to seed their `profile_scope` (give them a real scope), NOT to restore fail-open.** CC cannot enumerate which demo managers lack a scope (the DB scan is sandbox-blocked — the architect's authenticated context). **Surfaced for seeding (R7).** The security fix is not reverted to make the demo work.

## Re-verify (blast radius)

- `persona-context.tsx:298` fallback = `{ entityIds: [], canSeeAll: false }` (fail-closed).
- `buildManagerData:425` re-expand gated on `canSeeAll` (now false for unscoped) → bounded.
- WS7-A statement guard now effective for the unscoped manager (allowedEntityIds non-null).
- `tsc --noEmit` 0.

---

## Adversarial regression sweep (blast radius; SR-39 ELEVATED) — 3 HIGH (one residual, FIXED) · over-deny CLEAN

- **Over-deny — NONE.** A properly-scoped manager is provably unaffected: they return early at `:259` (`profile_scope`→`mgrScope`) or `:281` (brand→`brandScope`), both already `canSeeAll:false`; only the genuinely-unscoped manager reaches the changed line. No scoped manager hits the fail-closed fallback.
- **Over-see — stream / Simulate / dashboard / statements — CLEAN.** `buildManagerData:403/:425` re-expand-to-all is `canSeeAll`-gated → skipped; `getManagerDashboardData:256` skipped; `ManagerDashboard:98` short-circuits; WS7-A's statement guard now **runs** for the unscoped manager (`allowedEntityIds` non-null). All fail closed.

**HIGH (FIXED at root) — the financial surface re-opened the hole.** All 9 `/financial/*` pages keyed scope off `entityIds.length > 0` (not `canSeeAll`) and sent `undefined` when empty → the server route (`api/financial/data/route.ts:1305`) treated absent/empty scope as the **whole tenant** → an unscoped manager (now `canSeeAll:false, entityIds:[]`) **still saw all tenant financials**. This is the same empty-scope-means-all class as the root bug, on a different surface — squarely in Stage 1's proof gate ("unscoped manager bounded on financial").
- **Fix (server-authoritative + the 9 pages):**
  - Route: `scopedRaw = scopeEntityIds !== undefined ? filter : raw` — an **explicit** `scopeEntityIds` (even `[]`) denies (zero cheques); only an **absent** scope (admin/`canSeeAll`) returns the tenant.
  - Pages: the `financialScope` memo now sends an **explicit** scope for non-admin (`if (canSeeAll) return undefined; return { scopeEntityIds: scope.entityIds }`) — an unscoped manager sends `{scopeEntityIds: []}`, which the service spreads into the POST body (verified: `fetchFinancialData` `...(params||{})` does not drop the empty array).
  - Net (verified): admin → `undefined` → all; scoped manager → `[team]` → team; **unscoped manager → `[]` → zero (deny)**. `tsc` 0, `build` exit 0.

**MEDIUM (documented) — stale scope cache.** The scope cache has a 5-min TTL and no invalidation on login/logout/tenant-switch → a browser session cached under the old fail-open keeps it until expiry. **Transient + bounded** (a deploy + the TTL clears it). A robust fix is cache invalidation on auth/tenant change — a separate hardening (R: scope-cache invalidation), not blocking.

---

## Gates

- `npx tsc --noEmit` → **exit 0**.
- `npm run build` → **exit 0, ✓ Compiled successfully**.
- HALT-GENERAL honored: a one-line derivation fix; no new mechanism.
- SR-34/SR-39: the root scope derivation now defaults to least privilege.
- SHA: *(on commit)* · PR: *(on open)*

---

*WS7 Stage 1 · 2026-06-15 · vialuce.ai · the root SR-39 scope-derivation gap (fail-open → fail-closed) closed; the foundation beneath WS7-A. Stages 2–4 (nav keystone, verified fixes, RLS plan) follow — nothing dropped.*
