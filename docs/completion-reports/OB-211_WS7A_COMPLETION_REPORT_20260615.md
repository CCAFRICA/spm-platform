# OB-211 WS7-A — Two HALT-ACCESS Closures (security lead): Completion Report

**Date:** 2026-06-15 · **Branch:** `ws7-a-haltaccess-closures` · **Gate:** #517 (`68d8e7b`) on main. · **Principle:** close the live confidentiality/entitlement bugs first; the rest of WS-7-rev completes behind them.

Both bugs were VERIFIED at cited lines by Phase-0 (#517). This increment closes them **at the read/route** — not via a UI-only hide (HALT-ACCESS-READ).

---

## #2 — `perform/statements` param-leak (SR-39) — CLOSED ✅ (scope-lock in place)

**Verified bug:** `selectedEntityId` seeded from `searchParams.get('entityId')` unguarded (`:92`); `loadOptions` auto-selected `entities[0]`; an unrestricted picker listed all tenant entities → **anyone could view any entity's full payout/breakdown/trajectory/raw transactions** (SR-39 violation).

**Ruling (HALT-STMT): scope-lock in place, not retire** — a privileged-viewer use is real (admin/manager need a scoped entity viewer). The secure rep home remains `/stream`; this closes the leaky surface as a *scoped* viewer.

**Closure — enforced through the READ (`usePersona().scope`):**
- `allowedEntityIds = scope.canSeeAll ? null : scope.entityIds` — admin = whole tenant (null filter), manager = team, rep = own single entity. The scope is server-trust-resolved by `persona-context` (`auth_user_id → profile → entity` / `profile_scope`) — the same source `/stream` uses; not client-spoofable.
- `loadOptions`: the entity query is `.in('id', allowedEntityIds)` for non-admin → the list itself never contains an out-of-scope entity (empty set → `['__none__']` → fail-closed).
- `loadStatement`: **read-layer denial** — `if (allowedEntityIds && !allowedEntityIds.includes(selectedEntityId)) { deny }` runs before the `calculation_results` query → a tampered `?entityId` is **denied at the data layer**. The raw-transactions + trajectory reads are keyed by the same scope-validated `selectedEntityId`, so they inherit the guard.
- Picker: rendered only when `canPickEntity = scope.canSeeAll || scope.entityIds.length > 1` → a rep gets a static own-entity label, no picker, no way to request another. A manager's picker lists only the team.

**Re-verify:** read-layer denial at `:186`; scoped query at `:126`; picker gated at `:377/:389`. `tsc` 0.

---

## #1 — Finance route gate (entitlement) — CLOSED ✅

**Verified bug:** `/financial/*` gated only at the sidebar by role capability (`permissions.ts:324` `/financial→view.team_results`), never by `tenants.features`, never at the route (no `financial/layout.tsx`) → a non-Finance tenant's role-capable manager could navigate directly to `/financial` and see financial data.

**Closure (leverage the EXISTING gate — SR-34):** new `web/src/app/financial/layout.tsx` wraps every `/financial/*` route in `<FeatureGate feature="financial" redirectTo="/unauthorized">`. `FeatureGate` reads `tenants.features.financial` (`useFeature`) and redirects when absent, returning `null` (children never mount) → a non-Finance tenant is **denied at the route**, not just hidden in the menu. This coheres with WS-B's menu-gate fix (route = hard boundary, menu = visible reflection).

**Re-verify:** `financial/layout.tsx` wraps `/financial/*` in `FeatureGate feature="financial"`. `tsc` 0.

---

## Adversarial sweep (4 lenses; access + entitlement ELEVATED) — 0 HIGH · 1 MEDIUM fixed · 1 MEDIUM + LOWs documented

- **Statement scope through the READ (ELEVATED) — NO HIGH (no same-granularity leak).** Verified: every `selectedEntityId`-keyed read (`calculation_results:211`, `entities:226`, `committed_data:259`, `trajectory:289`) sits **behind** the single membership guard (`:186`), which runs before all of them; the entity list is independently scope-filtered (`:120-127`, fail-closed `['__none__']`); a tampered `?entityId` is dropped (`:162`); a single-entity rep cannot open the picker. **No residual path to another entity's statement.**
- **Finance route entitlement (ELEVATED) — PASS.** `financial/layout.tsx` wraps all `/financial/*`; `FeatureGate` returns null while the tenant loads (no flash) and when disabled (children never mount) and redirects to `/unauthorized` (exists) when loaded-and-unlicensed. The direct-navigation bypass is closed.

**MEDIUM (FIXED at root) — rep granularity.** A rep's `scope.entityIds` is the **store** id (persona-context), but the statement is keyed by the rep's **own** entity → a rep could be fail-closed denied their own individual statement.
- **Fix:** `allowedEntityIds = scope ∪ {personaEntityId}` (memoized) — the rep can always reach their own individual statement at whatever grain exists, while the set is never wider than scope ∪ own (SR-39 holds; another rep's entity is still denied). Re-verify: `tsc` 0.

**MEDIUM (DOCUMENTED — pre-existing, broad blast radius, NOT changed here).** A manager with no `profile_scope` row + no brand metadata gets `canSeeAll:true` (`persona-context.tsx:289-294`) → `allowedEntityIds=null` → the statement guard is skipped → an unscoped manager can view any tenant entity. **This is a scope-DERIVATION issue in persona-context, not the statement surface** — the statement guard correctly honors whatever scope it is given. The same fallback feeds *every* scope-gated surface (Simulate `teamResults`, team heatmap, bloodwork) and was already flagged by the OB-211 Simulate sweep with the same "don't change within this increment's blast radius" disposition. **Recommended focused follow-up:** tighten `persona-context.tsx:290` to fail-closed (`entityIds:[], canSeeAll:false`) so an unscoped manager is team-bounded everywhere — its own increment (affects the demo's unscoped-manager behavior across all surfaces).

**LOWs (documented):**
- *Manager location-vs-individual granularity* — `profile_scope.visible_entity_ids` may hold location ids while statements are individual-keyed → potential over-denial (not a leak). The architect's recommended per-tenant test (rep loads own; co-worker id denied; manager loads team; non-team id denied) confirms the grain.
- *Defense-in-depth (RLS):* WS7-A closes the exposure at the **application-read layer** (the page refuses out-of-scope queries; the picker/param are gated). A complete boundary also wants **RLS** on `calculation_results`/`committed_data`/`entities` (or a server route/RPC re-checking scope) so a direct data-API call is denied at the DB. RLS verification is a deeper layer — **residual** (R: confirm/strengthen RLS), beyond WS7-A's app-layer route/read scope.

---

## Gates

- `npx tsc --noEmit` → **exit 0**.
- `npm run build` → **exit 0, ✓ Compiled successfully**.
- HALT-GENERAL honored: reused `usePersona().scope` + the existing `FeatureGate`; no new gating mechanism, no new nav, no greenfield surface.
- SR-34: the statement is scope-locked in place (not a parallel surface); the Finance gate reuses `FeatureGate`.
- SHA: *(on commit)* · PR: *(on open)*

---

*WS7-A · 2026-06-15 · vialuce.ai · the two HALT-ACCESS bugs closed at the read/route, security-first; WS-B (nav keystone) + WS-C (verified fixes) follow — nothing dropped.*
