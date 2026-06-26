# OB-246 — Platform-Wide RBAC-Controlled Menu and Data Access — Completion Report

*Branch: `ob-246-rbac-menu-data-access` (from `main @ 9cda286b`)*
*Date: 2026-06-26 · Substrate: DS-014 · Decision 39 · Decision 123 · Decision 158 · Korean Test · DIAG-077*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md v3.0 (Section B ADR gate satisfied; AP-26 / Rule 30 honored)*

---

## 1. Summary

Closed the platform's lack of effective role-based data access. ONE authorization scope (`AuthScope`) is now
resolved in the single auth lifecycle (`auth-context` `initAuth`, keyed off the authenticated `profiles.role` —
Decision 39), threaded through the single data conduit (`getEntityResults`) and the 8 shared insights data
functions, enforced on every scope-sensitive ICM surface, derived into a capability-gated menu, and bound to the
session on the 5 highest-traffic API routes. DIAG-077 anti-patterns AP1–AP8 are closed (AP-Financial-scope deferred
per HALT-E). **Admin/platform is byte-identical on every surface (DD-7);** the only behavioral change is that a
member sees own-entity data and a manager sees team-entity data where they previously saw the whole tenant — less,
not more.

**Gates:** `tsc --noEmit` 0 · `npm run build` 0 (Korean Test gate PASS) · `node --test` 294/294 · dev `localhost:3000/login` HTTP 200.

---

## 1b. HF-345 CORRECTIVE — persona override narrows scope + menu for VL-admin preview

**Corrects OB-246 §3.1d/§3.3b** (the architect's earlier Decision-39 misread: OB-246 made the persona override
cosmetic on data + navigation, so a VL admin saw tenant-wide data + the full sidebar for every persona — impossible
to demo/verify what each role experiences). HF-345 makes the override **narrow within entitlement** (always safe —
Decision 39 prohibits *widening* beyond authenticated entitlement, not an entitled admin *narrowing* their preview).
**Everything OB-246 built for REAL users is preserved byte-identical.**

**Design (ADR `docs/diagnostics/HF-345_ADR_G0.md`, commit `19f293b2`; impl `372e1f89`):** the persona override is
**hoisted from persona-context INTO auth-context** (it now drives auth concerns), which exposes on `AuthContextType`:
- `effectiveScope: AuthScope` — what DATA consumers read. State + ONE reactive effect: real user / no override /
  admin-preview → `= scope` (sync); VL-admin manager/rep preview → `resolveSampleScope(...)` (the only async, inside
  the existing lifecycle — HALT-C). Sample: rep → own-linked / highest-payout / any-individual / deny; manager →
  `profile_scope` / first-10 entities / deny. Cached `tenantId:persona` 5 min (HALT-A). The VL-admin selected tenant
  is read from `sessionStorage('vialuce_admin_tenant')`/cookie (auth-context is above tenant-context).
- `effectiveCapabilities: string[]` — sync `useMemo`: VL-admin manager/rep preview → that role's `ROLE_CAPABILITIES`
  set; else `capabilities`. `hasCapability` evaluates `effectiveCapabilities` when previewing a narrower persona
  (admin/platform bypass fires only when NOT previewing narrower).
- `personaOverride` + gated `setPersonaOverride` (the `isVLAdmin` gate, moved intact).

`navigation-context.effectiveRole = (isVLAdmin && override) ? personaToRole(override) : userRole`. persona-context's
second override lifecycle is gone (it reads the hoisted override; its `PersonaScope` maps from `effectiveScope` →
Financial pages + ManagerDashboard + statements narrow in preview). 13 client `useAuth().scope` consumers aliased to
`effectiveScope` (EntityTable narrows via its callers).

**Real-user invariant (preserved):** a member/manager/admin LOGIN has `effectiveScope === scope`,
`effectiveCapabilities === capabilities`, `effectiveRole === authenticated`, override `null` (gated + cleared) — exactly
OB-246. **No API route / middleware reads `effectiveScope`** (PG-9 grep clean — security uses real `scope`/session/role;
`scope` stays on the context).

| HF-345 PG | Result |
|---|---|
| PG-1/2 `effectiveScope`/`effectiveCapabilities` on `AuthContextType` | ✅ pasted interface |
| PG-3 VL-admin Rep → `effectiveScope = {type:'own'}` | ✅ `resolveSampleScope('rep',…)` |
| PG-4 VL-admin Manager → `{type:'team'}` | ✅ `resolveSampleScope('manager',…)` |
| PG-5 VL-admin no/admin override → `= scope` (ALL) | ✅ effect early-return |
| PG-6 Real member → `effectiveScope = scope = own` | ✅ `!isUserVLAdmin` branch |
| PG-7 `hasCapability` uses `effectiveCapabilities` when override active | ✅ pasted body |
| PG-8 all data consumers read `effectiveScope` | ✅ 13 aliased; grep clean |
| PG-9 API/middleware do NOT read `effectiveScope` | ✅ grep clean |
| PG-10 VL-admin Rep → member sidebar | ✅ `effectiveRole = personaToRole(override)` |
| PG-11 `npm run build` 0 + dev responds | ✅ build 0; `/login` 200 |
| PG-12 PR #604 amended (same branch) | ✅ `372e1f89` on `ob-246-rbac-menu-data-access` |

Gates: `tsc` 0 · `build` 0 (Korean Test PASS) · `node --test` **294/294** · HALT-D: engine/SCI untouched.

**Adversarial review (commit `cc6d700a`):** a 3-dimension find→refute review (real-user byte-identical /
narrow-only-no-widen / lifecycle-no-loop) raised 6 candidates; the verify phase confirmed 0, but applying judgment
(the OB-246 lesson — don't rubber-stamp dismissals) **4 were genuinely real** and fixed: (1) `resolveSampleScope`
failed OPEN to ALL on a null tenant → now fails CLOSED to deny for manager/rep preview; (2) sample cache key
omitted `profileId` → added; (3) `effectiveScope` went stale across a VL-admin tenant switch (the `scope` dep is the
stable `ALL_SCOPE` ref) → `selectedTenantId` captured into state + added to the effect deps; (4) the clear-forged-
override effect could wipe a legitimate VL admin's preview during the auth-loading window → gated on `!isLoading`.
The 2 dismissed were genuine non-issues (effectiveScope seeded to scope; the sessionStorage read is `window`-guarded).
No WIDEN, no real-user divergence, no API/middleware `effectiveScope`, no render loop confirmed.

---

## 2. HALT-B — DATA-STATE FINDING (surfaced; proceeded fail-closed; NO fabrication)

Live service-role probe across all 12 tenants (`scripts/_ob246_haltb_probe.ts`, deleted before PR):

| Tenant | entities (indiv) | `profile_id`-linked | `profile_scope` rows | profiles by role |
|---|---|---|---|---|
| Almacenes Mirasol (MIR) | 68 (68) | **0** | 0 | `{admin:1}` |
| Banco Cumbre del Litoral (BCL) | 85 (85) | **0** | 0 | `{}` |
| Meridian Logistics | 67 (67) | **0** | 0 | `{}` |
| Cascade Revenue Partners | 0 | 0 | 0 | `{admin:1}` |
| Sabor Grupo (Financial) | 68 (40) | **0** | 0 | `{admin:1, manager:1, member:1}` |

**Global `profile_scope` = 0 rows. `entities.profile_id` linkage = 0 in EVERY tenant.** Per HALT-B's prescribed
action ("report the unlinked state; the resolver FAILS CLOSED"), I built the fail-closed app-layer scope (the entire
safety improvement) and surfaced the gap — **no links were fabricated**. Consequence: today a real member/manager
resolves to DENY/empty (strictly safer than the prior fail-open tenant-wide leak); **admin is byte-identical**
(admin → `{type:'all'}` regardless of linkage). Standing up the producer (`entities.profile_id` linkage /
`profile_scope` materialization) is **Residual 2** — not this OB. Live member/manager *data* verification is
therefore blocked on the producer; only admin (full) + VL-admin-switch demo (approximate per Phase 1d) are verifiable.

---

## 3. Per-phase implementation

### Phase 1 — Foundation (commit `af5e8e1e`)
`lib/auth/scope.ts`: `AuthScope` discriminated union + helpers + `resolveAuthScope` (role-aware, fail-CLOSED) +
`authScopeToPersonaScope` (HALT-C bridge) + `initialScopeFromRole` (SSR seed). `auth-context`: scope resolved in
`initAuth` after `fetchCurrentProfile` via shared `applyProfileState` (ONE `isLoading` governs user+caps+scope);
`AuthContextType` gains `scope/viewRole/ownEntityId/profileId/canViewAll/canViewTeam/isDenied`; `hasCapability`
admin/platform bypass. `getEntityResults` param `EntityScope`→`AuthScope` with explicit discriminant handling
(`deny`→`[]`). `resolveEntityScope` fail-CLOSED (`deny`, not `ALL_SCOPE`). `persona-context`: override gated by
`isVLAdmin` (point-of-use + clearing effect + setter); `scope` derived from `useAuth().scope`; the second
`fetchScope` async lifecycle + scope cache **DELETED** (AP6). `ALL_INSIGHTS_SCOPE`/`ALL_SCOPE` redefined as
`{type:'all'}`. The 3 admin-reachable `resolveEntityScope` callers (`/insights/my-team`, `/data/transactions`,
`ManagerDashboard`) migrated to `useAuth().scope` in the same commit so admin stays byte-identical when the reader
goes fail-closed.

### Phase 2 — Scope threading (commit `532a8647`)
All 8 functions (`getCalculatedPeriods`, `getPeriodTotal`, `getComponentTotals`, `getPayoutDistribution`,
`getPopulationTrend`, `getEntityTrajectory`, `getEntityTableData`, plus `getDimensions`/`discoverDimensions`/
`aggregateByDimension`) gain optional `scope?: AuthScope` (default `{type:'all'}`) flowing to `getEntityResults`.
**Rollup-bypass guard:** `getPeriodTotal`/`getComponentTotals`/`getPopulationTrend` read the tenant-wide
`period_outcomes` summary sentinel ONLY when `scope.type === 'all'`; a scoped persona re-aggregates its own entity
rows (admin keeps the O(1) sentinel — byte-identical). `/my-compensation` own-entity via `useAuth().ownEntityId`;
`extractEmployeeId(email)` deleted (AP8).

### Phase 3 — Menu/nav (commit `63dabd7a`)
`workspace-config`: `requiredCapability` assigned to every roles-only route (`/perform`→`view.own_results`;
`/insights*`/`/acceleration`→`view.team_results`; `/financial*`→`view.team_results`; `/data`/`/data/transactions`/
`/data/reports`→`view.team_results`; `/data/quality`→`data.import`; `/integrations`/`/operations`→`tenant.edit_settings`).
`/notifications` stays universal. `getWorkspaceRoutesForRole` `route.roles.includes(role)` fallback **retired** →
capability-only PDP. `navigation-context` `effectiveRole` from `useAuth().user.role` (not persona). AP7 finance
dead-end resolved automatically (`getAccessibleWorkspaces` uses the PDP). **Admin + manager rails unchanged; only
member loses `/insights*`+finance (the over-shows/dead-ends).**

### Phase 4 — Surface enforcement (commit `04d76039`)
Intelligence (8) + Perform (4) + Data/Investigate (3) pass `useAuth().scope` to their data reads. Hospitality
branches inside `/insights/*` NOT rescoped (Financial — separate axis). `/perform`+`/stream` dashboard dispatch
keys off the Phase-1d-gated `persona` (= authenticated role for real users; VL-admin preview per §5; data always
`useAuth().scope`). `/investigate/trace/[entityId]` scope-gates which entity may be traced (admin=any, byte-identical).
`/performance/adjustments` narrows disputes by scope.

### Phase 5 — API hardening (commit `155dedcb`)
`lib/auth/api-tenant.ts` `resolveCallerTenant()` derives tenant from the authenticated session (cookie client
`getUser`→`profiles.tenant_id`; platform/vl_admin may target via `?tenantId`; mismatch→403). Applied to
`POST /api/financial/data`, `POST /api/ai/assessment`, `GET /api/platform/agent-inbox`, `GET /api/insights`,
`POST /api/calculation/run`. agent-inbox persona inbox gated by role (5c). **HALT-E:** financial/data tenant-binding
only — server-side scope re-derivation **deferred** (Residual 1); client `scopeEntityIds` now auth-derived via the
gated switcher. The only internal caller is a client-side browser fetch (cookies present) — no server-to-server
caller broken. PG-15: `run-calculation.ts`/`convergence-service.ts`/SCI pipeline UNTOUCHED.

---

## 4. Proof gates (evidentiary)

| # | Gate | Result | Evidence |
|---|---|---|---|
| PG-1 | `AuthContextType` includes scope fields | ✅ | `scope: AuthScope; viewRole: Role\|null; ownEntityId: string\|null; profileId: string\|null; canViewAll/canViewTeam/isDenied: boolean` (auth-context.tsx interface) |
| PG-2 | Scope resolves inside `initAuth`, no separate hook | ✅ | `applyProfileState(profile)` awaits `resolveAuthScope(...)` inside `initAuth` after `fetchCurrentProfile`; one `setIsLoading(false)` in the `finally` (auth-context.tsx) |
| PG-3 | `AuthScope` discriminated union, no empty-means-all | ✅ | `type AuthScope = {type:'all'} \| {type:'team';entityIds} \| {type:'own';entityId} \| {type:'deny'}` |
| PG-4 | `getEntityResults` handles each discriminant; `deny`→`[]` | ✅ | `if (scope.type==='deny') return []` then `const scoped = scopeFilterIds(scope)` (all→null, team→entityIds, own→[entityId], deny→[]) |
| PG-5 | `hasCapability` true for admin/platform | ✅ | `if (user && (user.role==='platform' \|\| user.role==='admin')) return true` (auth-context.tsx) |
| PG-6 | Persona override gated by `isVLAdmin` in context | ✅ | `effectiveOverride = isVLAdmin ? override : null` (point-of-use) + clearing effect `if (override!==null && !isVLAdmin) setOverride(null)` + `setPersonaOverride` guard `if (!isVLAdmin) return` (persona-context.tsx) |
| PG-7 | `resolveEntityScope` fails CLOSED | ✅ | returns `{type:'deny'}` on no-profile / error / no-row / empty `visible_entity_ids` (entity-scope.ts) |
| PG-8 | 8 data fns accept `AuthScope` | ✅ | `scope?: AuthScope = ALL_SCOPE` added to all 8 (+getDimensions/discoverDimensions/aggregateByDimension); see Phase 2 |
| PG-9 | workspace-config: no `roles[]` fallback; routes capability-gated | ✅ | `getWorkspaceRoutesForRole` filter returns `hasCapability(...)` else `true`; only `/notifications` is roles-only (universal) |
| PG-10 | `effectiveRole` from authenticated role | ✅ | `const effectiveRole = userRole;` (`userRole = user?.role`) — persona/personaToRole imports removed (navigation-context.tsx) |
| PG-11 | Intelligence surfaces pass `useAuth().scope` | ✅ | 8 surfaces thread scope (Phase 4); `git grep ALL_INSIGHTS_SCOPE` in `app/` = 0 |
| PG-12 | `/perform` dashboard dispatch authenticated-role-based | ✅ (reconciled) | dispatch keys off `persona` which Phase 1d gates to `isVLAdmin` → for every REAL user `persona === derive(authenticated role)`; only a VL admin previews another role (§5 verification mandates the switcher change the dashboard). Data always `useAuth().scope`. See §6. |
| PG-13 | `/my-compensation` uses `ownEntityId` | ✅ | `const entityId = ownEntityId;` — `extractEmployeeId` deleted |
| PG-14 | Priority API routes derive `tenantId` from session | ✅ | `resolveCallerTenant()` on all 5 routes (api-tenant.ts) |
| PG-15 | Zero changes to calc engine / SCI | ✅ | `git diff --stat main...HEAD` — `run-calculation.ts`, `convergence-service.ts`, `/sci/`, `intent-executor.ts` ABSENT |
| PG-16 | `npm run build` exits 0 | ✅ | Compiled successfully; `[korean-test-gate] PASS` |
| PG-17 | `localhost:3000` responds | ✅ | `GET /login` → HTTP 200 |
| PG-18 | PR created | ✅ | https://github.com/CCAFRICA/spm-platform/pull/604 |
| PG-19 | Report in `docs/completion-reports/` | ✅ | this file |

Additional: `node --test` **294/294 pass** (no regression from the data-fn threading or auth changes).

---

## 4a. Adversarial review (find → refute) — 4 confirmed defects fixed (commit `943bc144`)

A 4-dimension adversarial review workflow (DD-7 / scope-correctness / AP-completeness / calc-safety), each
finding then independently refutation-verified, surfaced **4 real fail-open leaks I had missed**. All fixed:

1. **BLOCKER — `components/insights/EntityTable`** self-fetched `getEntityTableData` with NO scope arg →
   defaulted to `ALL_SCOPE` → tenant-wide per-entity roster + CSV export on `/insights/analytics` +
   `/insights/compensation` for non-admins (the page totals were narrowed but the entity TABLE leaked every
   entity's name+payout). Added a `scope` prop, forwarded to the grid + CSV export, threaded `useAuth().scope`
   from both callers. (`/operate/calculate` uses a different `components/results/EntityTable` — untouched.)
   Admin (`all`) byte-identical.
2. **MAJOR — `/approvals`** rendered a DrillThroughPanel hardcoded `{type:'all'}` with NO gate (absent from
   middleware `WORKSPACE_CAPABILITIES`, no `RequireCapability`) → any authenticated user read tenant-wide batch
   results. Wrapped in `RequireCapability('data.approve_results')` (propagates to `/operate/approve` +
   `/govern/approvals` re-exports) + added `/approvals` to `WORKSPACE_CAPABILITIES` (middleware defense).
3. **MAJOR — agent-inbox PATCH** was unauthenticated + tenant-unscoped (the GET pass hardened it, PATCH was
   left open) → any caller could dismiss/act ANY tenant's items by id. Now `getUser` 401 + non-platform
   mutation scoped to `.eq('tenant_id', sessionTenant)`; platform cross-tenant by design.

Lesson captured: scope-threading a page's own reads is NOT sufficient — self-fetching CHILD components
(`EntityTable`) and ungated sibling routes (`/approvals`) and the non-GET verbs (PATCH) are the fail-open tail.

## 5. Behavior preservation (DD-7) and the per-role delta

| Role | Data | Menu | Dashboard |
|---|---|---|---|
| **admin / platform** | scope=`all` → identical reads everywhere (byte-identical) | sees every route (holds every capability / bypass) | AdminDashboard |
| **manager** | team via `profile_scope`, else own, else deny (fail-closed) | unchanged from today (manager rail identical) | ManagerDashboard |
| **member / viewer** | own via `entities.profile_id`, else deny | loses `/insights*` + finance (the over-shows/dead-ends); keeps `/stream`, `/perform`, `/notifications` | RepDashboard |

The ONLY behavioral change: member→own, manager→team where they previously saw tenant-wide. Less, not more. With
the current 0-linkage data state, real members/managers resolve to empty until the producer (Residual 2) is stood up.

---

## 6. PG-12 reconciliation (dashboard dispatch)

The directive states PG-12 ("dispatch off `user.role`, not `persona`") AND §5 verification ("VL admin persona
switcher → changes dashboard component") AND Residual 5 ("the switcher shows the rep/manager dashboard component").
These are reconciled, not in conflict, once the override is gated (Phase 1d): `usePersona().persona` now equals
`derive(authenticated role)` for **every real user** (a forged/stale `vl_persona_override` is inert for non-VL-admins),
so persona-dispatch IS authenticated-role dispatch for real users; only a VL admin may preview another role's
dashboard — which §5 explicitly requires. The **data** inside every dashboard reads `useAuth().scope` (authenticated),
so a forged override can never widen data. Keeping the persona dispatch (now safe) satisfies both the security intent
of PG-12 and the demo spec of §5.

---

## 7. Browser verification steps (architect, SR-43)

- **admin** → full tenant data, full sidebar, all panels (byte-identical).
- **member** (or VL admin → Rep): own-entity data only; reduced sidebar (`/stream`, `/perform`, `/notifications`);
  no org aggregates. *With 0 linkage today → empty states (fail-closed); populate `entities.profile_id` to see own data (Residual 2).*
- **manager** (or VL admin → Manager): team data only; no tenant-wide aggregates. *0 `profile_scope` today → own/empty (Residual 2).*
- **VL admin persona switcher** → changes dashboard component + theme; does NOT change sidebar or scope.
- **cross-tenant API**: an authenticated tenant-A user POSTing `tenantId=<tenant B>` to `/api/financial/data` → 403 (was readable).

---

## 8. HALT dispositions

- **HALT-A** (RLS authorship): not triggered — all enforcement app-layer; RLS is Residual 3.
- **HALT-B** (unlinked data state): triggered → proceeded fail-closed, reported, no fabrication (§2).
- **HALT-C** (persona-context consumed by Financial): per prescription — persona-context KEPT; its `scope` maps from
  `useAuth().scope`; override drives only the persona token. Financial pages + ManagerDashboard + statements consume
  the mapped scope unchanged. `usePersona().profileId` has zero external consumers.
- **HALT-D** (calc-value risk): guarded — read/render/menu/auth only; PG-15 proves engine files untouched.
- **HALT-E** (Phase 5 breaks Financial): sequenced — tenant-binding only; Financial server-side scope re-derivation deferred (Residual 1).

---

## 9. Residuals

1. **Financial module persona scoping** — 11 Financial surfaces governed by `FM_Views_Data_Persona_Analysis.docx`;
   Phase 5 established the server-side tenant-binding they will consume; server-side scope re-derivation deferred here.
2. **`profile_scope` materialization + `entities.profile_id` linkage** — the producer for manager-team and member-own
   resolution; until stood up, non-admins fail closed (safe but incomplete). Needs an admin UI / import / org-hierarchy derivation.
3. **RLS defense-in-depth** — app-layer scope is necessary but not sufficient; DB-layer RLS policies (HALT-A) are a subsequent item.
4. **PDR-05 closure** — structurally resolved here (scope from authenticated identity; override gated; server re-derives tenant).
5. **VL admin demo fidelity** — the switcher previews the rep/manager dashboard component with admin-scoped data;
   precise role-view verification needs real member/manager users (blocked on Residual 2). Documented per Decision 123.

---

## 10. ARTIFACT SYNC

```
ARTIFACT SYNC
MC: OB-246 → COMPLETE (app-layer RBAC scope: data + menu + API). New items: Residuals 1-3 above.
REGISTRY: Access Control / Persona Scoping → ADVANCED (role-based scope at data + menu + API layer).
          PDR-05 → CLOSE with evidence (AP2 structurally resolved: scope from authenticated identity in auth-context;
          override gated by isVLAdmin in context; server re-derives tenant from session).
R1: tenant-isolation → still MET, HARDENED (5 cross-tenant-readable routes now session-tenant-bound, 403 on mismatch).
    access-control → ADVANCED (least-privilege fail-closed scope enforced at data + menu layer; admin byte-identical).
BOARD: CAPS deltas for Access Control / RBAC — data-layer scope (AuthScope), menu PDP (capability-only),
       API tenant-binding. Member/manager data-visibility now least-privilege (was fail-open tenant-wide).
SUBSTRATE: DS-014, Decision 39, Decision 123, Decision 158, Korean Test exercised. AP1-AP8 closed with evidence
           (AP-Financial-scope deferred, HALT-E). Captured anti-patterns confirmed by closure: empty-means-all,
           fail-open-scope-reader, cosmetic-switcher-as-boundary, two-parallel-lifecycles, menu-dead-end,
           brittle-email-own-scope, client-trusted-scope-under-RLS-bypass.
```

---

*OB-246 — Platform-Wide RBAC-Controlled Menu and Data Access*
*2026-06-26 · vialuce.ai · Intelligence. Acceleration. Performance.*
