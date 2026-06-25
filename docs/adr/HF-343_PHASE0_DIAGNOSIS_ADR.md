# HF-343 — Phase 0 Diagnosis ADR (Architecture Decision Record)

**Date:** 2026-06-24
**Surface:** ICM `/perform` ("My Compensation") — `web/src/app/perform/page.tsx`
**Substrate:** DS-014 (Access Control) · Decision 39 (scope from authenticated identity) · Decision 123 (transparent compliance) · Decision 158 (deterministic construction) · Korean Test
**Closes/Supersedes candidate:** PDR-05 (persona filtering keyed to `effectivePersona` rather than authenticated `profiles.role`)

This ADR is committed BEFORE any code change (Rule 25 spirit; directive §3.0). It states the diagnosis with pasted evidence and the complete change-map for Phases 1–3.

---

## DIAGNOSIS: **(C) Both** — operative cause is (B); the (A) cosmetic-switcher anti-pattern survives but is VL-admin-gated and not the member-leak mechanism.

### (B) is the operative cause of a real member's data leak

A real member login (a non-VL-admin with `profiles.role` resolving to `member`) sees **tenant-wide** data on `/perform` because **every `/perform` read filters by `tenant_id` alone (via `ALL_INSIGHTS_SCOPE`) and never narrows by the authenticated profile's own entity or `profile_scope`.** The authenticated `view.own_results` capability and the `entities.profile_id` linkage are simply never consulted in the read path.

**Evidence — `/perform` consumes `persona` but NOT scope; reads pass `ALL_INSIGHTS_SCOPE`:**

`web/src/app/perform/page.tsx`
```ts
const { persona } = usePersona();          // L114 — destructures ONLY persona; scope/entityId/profileId IGNORED
...
Promise.all([
  getPeriodTotal(tenantId, selectedPeriodId),                       // L164 — tenant-wide rollup sentinel
  getComponentTotals(tenantId, selectedPeriodId),                  // L165 — tenant-wide rollup sentinel
  getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: selectedPeriodId }),  // L166 — ALL entities
  getBatchValidity(tenantId, selectedPeriodId),                    // L167 — tenant batch
])
```

**Evidence — `ALL_INSIGHTS_SCOPE` = "all entities" and the read layer honors it as admin/all:**

`web/src/lib/insights/periods.ts:15`
```ts
export const ALL_INSIGHTS_SCOPE: EntityScope = { visibleEntityIds: [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'all' };
```
`web/src/lib/drill-through/entity-results.ts:100`
```ts
const scoped = scope.visibleEntityIds.length > 0 ? scope.visibleEntityIds : null;   // empty ⇒ null ⇒ NO entity filter ⇒ all tenant rows
```

**Evidence — the org-wide leaks all derive from the unscoped `rows`:**

`web/src/app/perform/page.tsx:222` (`insights` useMemo)
```ts
const sorted = [...rows].sort((a, b) => (b.totalPayout || 0) - (a.totalPayout || 0));
return { total: periodTotal, entityCount: rows.length, top: sorted[0] ?? null, values: rows.map((r) => r.totalPayout || 0), ... };
```
- `insights.values` = **every** entity's payout → "Payout Distribution" / `DistributionPosition` (the "Ranked #1 of 95" population).
- `insights.top.displayName` = the **single highest-paid peer's name** → "Top Result" tile.
- `getComponentTotals` → tenant-wide "Compensation by Component" `StackedBar`.
- `getPeriodTotal` → tenant-wide HeroMetric "Period Total".

**Evidence — the read layer CAN scope; the page just doesn't ask it to.** `getEntityResults` already narrows by `scope.visibleEntityIds` (`entity-results.ts:109,134`), and a reader `resolveEntityScope(profileId)` exists (`entity-scope.ts:22`). Neither is wired into `/perform`. The capability matrix is correct and structural but never consulted on this surface:

`web/src/lib/auth/permissions.ts:194` — member holds only `view.own_results` (+ `view.intelligence_stream`, `dispute.submit`, `statement.view`) — NOT `view.all_results`/`view.all_entities`. The capability that *should* gate this surface exists but is not in the read path.

### (A) the cosmetic-switcher anti-pattern survives (PDR-05), but is VL-admin-gated and not the member mechanism

The persona override (`sessionStorage 'vl_persona_override'`) flows into scope/menu derivation, the exact PDR-05 anti-pattern:

`web/src/contexts/persona-context.tsx:147` — `const effectivePersona = override ?? derivePersona(user, capabilities);` then used to compute the PersonaScope.
`web/src/contexts/navigation-context.tsx:112` — `const effectiveRole = persona ? personaToRole(persona) : userRole;` (drives ALL sidebar filtering).

**But** the switcher UI is gated to VL admins only:
`web/src/components/navigation/mission-control/VialuceSidebar.tsx:233` — `{isVLAdmin && (<div className="persona">…setPersonaOverride…)}`.

So a real member never holds an override → `persona = derivedPersona` → `effectivePersona`/`effectiveRole` already follow authenticated role. The override can only NARROW a VL admin's view (VL admins are entitled to all). Therefore (A) cannot widen a real member's scope/menu — it is a latent anti-pattern, not the member-leak. And critically, `/perform` ignores `persona-context`'s scope entirely, so even (A)'s computed scope plays no role in the `/perform` leak. **The leak is the ABSENCE of scope narrowing (B), not the mis-keyed filter (A).**

**Net:** (C). Fix keys the `/perform` data scope + panel gating off the **authenticated role** (`useAuth().user.role` / `capabilities`, DB-backed via `fetchCurrentProfile` — `auth-context.tsx:195`), making the switcher subordinate to authenticated entitlement (it may only narrow for entitled VL admins).

---

## HALT CONDITIONS — evaluated

| HALT | Verdict | Evidence |
|---|---|---|
| **HALT-A** (needs new/modified RLS) | **NOT fired** | Fix is app-layer read-scope filtering only. No `calculation_results`/`entity_period_outcomes`/`entities`/`summary_artifacts` RLS authored. |
| **HALT-B** (member/viewer hold WRITE caps) | **NOT fired** | `permissions.ts:194-210` — member = {view.own_results, view.intelligence_stream, dispute.submit, statement.view}; viewer = {view.own_results, view.intelligence_stream, statement.view}. `dispute.submit` is the expected in-scope member capability, not a write breach. |
| **HALT-C** (entity→profile linkage unpopulated) | **DATA-STATE — flagged as residual, not fabricated** | Resolver reads `entities.profile_id` (the documented join; `persona-context.tsx:176-183`, `profile-scope.ts:30`). Whether test entities have `profile_id` populated is a DB/browser-verification question (SR-43). The resolver FAILS CLOSED (member with no linked entity → DENY scope → own-empty state, NOT tenant). If linkage is empty, member sees the "results not yet linked" state — surfaced for architect, no links fabricated. |
| **HALT-D** (`/perform` uses `fetchRawDataServer`/raw-aggregate) | **NOT fired** | `grep -rn fetchRawDataServer web/src` → 0 hits. Confirmed deleted platform-wide (OB-237). |

**Directive item (3) correction (conflation):** the OB-237 `summary_artifacts_fine` / `staff_rollup` / `patterns_rollup` tiers are **NOT reachable from `/perform`** — they are read only by `web/src/app/api/financial/data/route.ts` and surfaced on the separate `/financial/staff`, `/financial/patterns`, `/financial/server/[id]` pages (out of scope per §6, Financial surfaces). The `summary_artifacts` that DOES feed `/perform` is the **`period_outcomes` rollup sentinel** read by `getPeriodTotal`/`getComponentTotals` (`intelligence-data.ts:58`, `distribution.ts:77`) — tenant-wide by construction, with no scope parameter. This is the in-scope OB-237 materialized path that must be scope-gated (§3.1).

---

## CHANGE MAP (Phases 1–3)

### Phase 1 — One authenticated-scope resolver (keyed off `profiles.role`, NOT the override)
- **NEW** `entity-scope.ts`: `scopeIsDeny()` / `scopeIsNarrowed()` predicates; `resolveAuthenticatedScope(viewRole, authUserId, tenantId, opts?, client?)` →
  - `admin`/`platform` → `ALL_SCOPE` (tenant-wide; existing behavior).
  - `manager` → `profile_scope.visible_entity_ids` (via `resolveEntityScope`); fail-closed to own entity when unscoped (least privilege).
  - `member`/`viewer`/other → own linked entity only (`entities.profile_id`); DENY when unlinked (HALT-C, fail-closed).
- **NEW** `web/src/hooks/use-auth-scope.ts`: `useAuthScope()` keyed off `useAuth()` (authenticated role + capabilities). VL-admin override may only NARROW within entitlement (`viewRole = isVLAdmin ? personaToRole(persona) : authRole`). Returns `{ scope, canViewAll, canViewTeam, viewRole, ownEntityId, loading }`.

### Phase 1/2 — Read-layer scope threading (optional param, default `ALL_INSIGHTS_SCOPE` → 17 existing callers byte-identical)
- `entity-results.ts` `getEntityResults`: DENY-scope guard → return `[]` (never fall back to all).
- `periods.ts` `getCalculatedPeriods(tenantId, scope?, client?)`: thread scope to internal `getEntityResults`; DENY → `[]`.
- `intelligence-data.ts` `getPeriodTotal(tenantId, periodId, scope?, client?)`: narrowed → sum scoped `getEntityResults` (bypass tenant-wide sentinel); DENY → `0`; all → sentinel (unchanged).
- `distribution.ts` `getComponentTotals(tenantId, periodId, scope?, client?)`: narrowed → aggregate scoped `getEntityResults`; DENY → `[]`; all → sentinel (unchanged).

### Phase 2 — Member surface correctness (`perform/page.tsx` + `RepDashboard.tsx`)
- Consume `useAuthScope`; pass `scope` to the 4 loaders.
- Gate org panels by capability: org tiles (Entities Paid / Avg / Top Result) + `IntelligenceElement` + `DistributionPosition` + lifecycle pipeline + AI stub → `canViewTeam`; `ValidityVerdict` (tenant batch) → `canViewAll`. HeroMetric + scoped `StackedBar` (own/team components) render for all.
- Sub-dashboards by `viewRole` (not cosmetic persona): admin→`AdminDashboard` (canViewAll), manager→`ManagerDashboard` (team), member→`RepDashboard` (own).
- HALT-C: member with DENY scope → "results not yet linked to your profile" state (no tenant fetch).
- `RepDashboard.tsx` (used ONLY on `/perform`): replace `#rank de total` pill with anonymized quartile; hide `RelativeLeaderboard` (peer payout values cannot be cleanly anonymized in this HF → hide per §3.5).

### Phase 3 — Menu gating (`workspace-config.ts`)
- Add `requiredCapability` to the decide-workspace member-facing routes (removes the DS-014 §9 role-array fallback for them, capability-derives the menu):
  - `/perform` → `view.own_results` (home for every role).
  - `/insights`, `/insights/analytics`, `/insights/performance`, `/insights/compensation`, `/insights/trends` → `view.team_results` (manager+/admin/platform; member/viewer no longer see org analytics in the rail).
- `effectiveRole` (`navigation-context.tsx:112`) is LEFT as-is: the sidebar filter is already `hasCapability`-derived (`getWorkspaceRoutesForRole`), and the switcher that feeds `effectiveRole` is VL-admin-gated (cannot widen a real user's menu). Documented as compliant-by-gating (SR-34 minimal blast radius); broader role-array→capability migration noted as residual.

---

## PDR-05 disposition
Diagnosis is (C): the cosmetic-switcher anti-pattern (A) is present in `persona-context.tsx:147` and `navigation-context.tsx:112` but VL-admin-gated. HF-343 structurally resolves the `/perform` data path by keying scope off authenticated role (Phase 1/2) and makes the switcher subordinate to entitlement. PDR-05 → **close** with this evidence (the operative `/perform` leak was (B) absence-of-scope, now scoped; the residual (A) derivations are non-widening for real users).
