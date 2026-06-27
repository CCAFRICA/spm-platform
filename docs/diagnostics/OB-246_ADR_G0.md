# OB-246 — Architecture Decision Record + G0 Diagnostic (BEFORE code)

*Platform-Wide RBAC-Controlled Menu and Data Access*
*Branch: `ob-246-rbac-menu-data-access` (fresh from `main @ 9cda286b`)*
*Date: 2026-06-26 · Substrate: DS-014 · Decision 39 · Decision 123 · Decision 158 · Korean Test · DIAG-077*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md v3.0 Section B (this gate) · INF drafting reference (absent from repo — DD-1..DD-12 conventions applied from context)*

> **Section D Rule 22 / Section B:** This ADR is committed BEFORE any implementation code. Implementation does not begin until this file is in git.

---

## §0 — Pre-flight findings (G0 diagnostic)

| Check | Result |
|---|---|
| Main HEAD | `9cda286b` — identical to DIAG-077's paste base → **zero drift**; DIAG-077 verbatim excerpts are current. SEARCH-BEFORE-UNKNOWN: core files re-read on this branch, confirmed byte-identical to DIAG-077. |
| DIAG-077 artifact | Was committed only on `cfb1ee97` (base of the deleted hf-344 branch). **Recovered** via cherry-pick onto this branch (`3f71d2d5`, 1061 lines). It is the authoritative input. |
| OB sequence | Last completed OB = OB-237; 238–245 unused for OBs (intervening work was HF/DIAG/DS). Architect named this **OB-246** in the dated directive; 246 collides with no existing artifact → retained. |
| CC_STANDING_ARCHITECTURE_RULES.md | Present at repo root (v3.0). Section B ADR gate + AP-26 (no registries) + Rule 30 (theme tokens) + Rule 7 (prove don't describe) binding. |
| INF_Structured_Compliant_Drafting_Reference_20260513.md | **Absent from repo.** Applied DD-1..DD-12 conventions from directive/context (esp. DD-7 behavior preservation). |

### HALT-B — DATA-STATE FINDING (surfaced, dispositioned: PROCEED fail-closed)

Live service-role probe (`scripts/_ob246_haltb_probe.ts`, deleted before PR) across all 12 tenants:

| Tenant | entities (indiv) | `profile_id`-linked | `profile_scope` rows | profiles by role |
|---|---|---|---|---|
| Almacenes Mirasol (MIR) | 68 (68) | **0** | 0 | `{admin:1}` |
| Banco Cumbre del Litoral (BCL) | 85 (85) | **0** | 0 | `{}` (no users) |
| Meridian Logistics | 67 (67) | **0** | 0 | `{}` (no users) |
| Cascade Revenue Partners (CRP) | 0 | 0 | 0 | `{admin:1}` |
| Sabor Grupo (Financial/hospitality) | 68 (40) | **0** | 0 | `{admin:1, manager:1, member:1}` |
| (all other tenants) | 0 or admin-only | 0 | 0 | mostly `{admin:1}` |

**Global `profile_scope` = 0 rows. `entities.profile_id` linkage = 0 across EVERY tenant.**

**Disposition — PROCEED with fail-closed app-layer scope (NOT abandon):** HALT-B's prescribed action is *"report the unlinked state; the resolver FAILS CLOSED (DENY)"* — not stop-the-OB. The directive Phase 1a explicitly codes the `no match → DENY` path, and §6A residual 2 defers the linkage/materialization producer. Building fail-closed scope is the entire safety improvement and is **strictly safer** than today's fail-open (members currently see the whole tenant; after, a member with no linkage sees nothing until linked). **Admin is byte-identical** (admin/platform → `{type:'all'}` regardless of linkage), and BCL/Meridian have only admin (or no) users, so the platform's exercised surface is unaffected. **No links are fabricated** (directive forbids it).

**Consequence for verification (PG browser steps):** Live member/manager *data* verification is blocked on the producer residual. Only **admin** (full data) and **VL-admin persona-switch demo** (approximate per Phase 1d — admin-scoped data through the rep/manager lens) are verifiable. The one tenant with member/manager users (Sabor) is Financial (deferred) and also unlinked → its members resolve to DENY/empty. This is the §6A residual-5 limitation, documented transparently per Decision 123.

---

## §1 — ARCHITECTURE DECISION RECORD

```
Problem: The platform has no effective role-based data access control. 7+ Intelligence surfaces +
/perform hero pass ALL_INSIGHTS_SCOPE (empty visibleEntityIds = "all tenant rows") regardless of role,
so a member sees every entity's payout. Scope lives in a SECOND context (persona-context) with its own
async lifecycle, keyed off a cosmetic, sessionStorage-settable persona override — not authenticated
identity. The scope reader fails OPEN. Menu routes gate on a role-array fallback producing dead-ends.
Servers trust client-supplied scope under RLS-bypass.
```

### Option A — One AuthScope discriminated union, resolved in auth-context `initAuth`; persona-context derives its scope from `useAuth()` (CHOSEN)
- Define `AuthScope = {type:'all'} | {type:'team',entityIds} | {type:'own',entityId} | {type:'deny'}` in `lib/auth/scope.ts`. Resolve ONCE in `auth-context` `initAuth`, after `fetchCurrentProfile`, governed by the single existing `isLoading`. Expose `useAuth().scope`. Thread it through the `getEntityResults` seam. persona-context KEEPS its override (theme/vocab/dashboard token) but its `scope` now MAPS from `useAuth().scope` (HALT-C) instead of running a second `fetchScope`. Override gated by `isVLAdmin` at point-of-use + effect + setter (AP2).
  - Scale (10x): ✅ — scope = ≤1 indexed query per session (admin = 0 queries); reads narrow `.in('entity_id', …)`, fewer rows at scale, not more. No per-row calls.
  - AI-first: ✅ — zero hardcoded field/domain logic; structural discriminants only (Korean Test). `resolveRole` is the existing canonical resolver, not a new registry (AP-26 clean).
  - Transport: ✅ — no row data through HTTP bodies (reads only).
  - Atomicity: ✅ — fail-CLOSED (DENY) on every failure path; one lifecycle, no partial second-context race.

### Option B — Defer to database RLS policies (CREATE POLICY on entity_period_outcomes/entities/calculation_results)
  - Scale: ✅ but — RLS is correct defense-in-depth, but **HALT-A forbids RLS authorship in this OB** (scope escalation needing IRA advisory). Most data reads go through service-role API routes (RLS-bypass) anyway, so RLS alone wouldn't close the app-layer gap. REJECTED for this OB (residual 3).

### Option C — Keep persona-context as scope owner; add `isVLAdmin` gate only (minimal)
  - Atomicity: ❌ — leaves AP1 (empty-means-all), AP4 (fail-open reader), AP6 (two lifecycles/shapes) OPEN. The HF-343 lesson is that the two-lifecycle split is the root; a UI-only gate is the HF-344 display-layer mistake repeated. REJECTED.

```
CHOSEN: Option A — one AuthScope, resolved in the single auth lifecycle, threaded through the existing
        getEntityResults seam; persona-context's scope becomes a derived view of useAuth().scope.
REJECTED: B (HALT-A — RLS out of scope, residual 3) and C (leaves AP1/AP4/AP6 open — the HF-344 mistake).
```

### Why Option A honors the HF-343/HF-344 binding lessons
| Lesson | How A complies |
|---|---|
| Parallel auth path (`useAuthScope`) caused waterfall/flash | A adds NO new hook/context/lifecycle. Scope resolves INSIDE `initAuth` after `fetchCurrentProfile`; ONE `isLoading` (auth-context.tsx:224 finally) governs user+caps+scope. persona-context's second `fetchScope` lifecycle is DELETED, not supplemented. |
| Silently narrowed scope to one page | A addresses every scope-sensitive surface DIAG-077 names (Phase 4) or explicitly defers it (Financial §6, with reason). |
| `hasCapability` admin bypass defeated switcher | A's admin bypass keys off the REAL authenticated `user.role`, never the override. The override narrows the VIEW for a VL admin; it never widens scope (scope = `useAuth().scope`, override-independent). |
| Display-layer conditionals ≠ authorization | A enforces at the DATA layer (scope threading through `getEntityResults`) and MENU layer (capability derivation), not JSX rendering. |

---

## §2 — GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)

- **G1 — Standard:** SOC2 (access control / least privilege), Decision 39 (scope from authenticated identity), DS-014 §4 capability matrix (`permissions.ts ROLE_CAPABILITIES`).
- **G2 — Architectural embodiment:** Scope is a discriminated union resolved in the auth lifecycle and threaded through the SINGLE data conduit (`getEntityResults`). `deny` is structurally distinct from `all` (cannot collapse to all). Least privilege is a *type property*, not a runtime policy check — survives reimplementation (GP-1: compliance emerges from architecture).
- **G3 — Traceability:** Standard (Decision 39 / DS-014 §4) → Architecture (`AuthScope` in `useAuth()` + `getEntityResults` discriminant handling + capability-derived menu) → Implementation (Phases 1–5, PG-1..14). An auditor reads `AuthScope` + `resolveAuthScope` + `getEntityResults` and sees the enforcement without running it.
- **G4 — Discipline:** Access-control theory (least privilege, Saltzer & Schroeder 1975 "fail-safe defaults"). The fail-CLOSED default IS the fail-safe-defaults principle applied structurally.
- **G5 — Abstraction test:** Universal — `{all|team|own|deny}` over entity sets is domain-agnostic (works for compensation, franchise ops, any module). No "SPM" assumption.
- **G6 — Innovation boundary:** No speculation; the discriminated-union-as-authorization pattern is standard type-driven security (make illegal states unrepresentable — Minsky/algebraic-types).

---

## §3 — HALT dispositions

| HALT | Condition | Disposition |
|---|---|---|
| **A** | Phase 1 needs RLS `CREATE POLICY` authorship | **Not triggered.** All enforcement is app-layer (scope filter in `getEntityResults`, capability-derived menu, session-derived tenant in API routes). RLS is residual 3 (defense-in-depth, IRA advisory). |
| **B** | `entities.profile_id` unpopulated for ALL entities in ALL proof tenants | **TRIGGERED + dispositioned PROCEED fail-closed** (see §0). Reported; no links fabricated; resolver returns DENY for unlinked members. Producer = residual 2. |
| **C** | persona-context scope consumed OUTSIDE ICM (Financial reads `usePersona().scope.entityIds`) | **TRIGGERED + dispositioned per prescription.** persona-context is NOT removed; its `scope` MAPS from `useAuth().scope` (AuthScope→PersonaScope). Override still drives theme/vocab/dashboard token. Consumer map: 9 Financial pages + `/stream` + `/perform/statements` + `ManagerDashboard` read `.scope`; `.profileId` has ZERO external consumers; `.entityId` from `useAuth().ownEntityId`. Admin → `{canSeeAll:true}` (Financial byte-identical). Real rep/manager Financial scope changes from store/brand-location axis to auth-entity axis (strictly narrower; empty under current 0-linkage) — within the DEFERRED Financial module's purview, documented (residual 1). |
| **D** | Any change risks altering calculated values | **Guarded.** This OB touches READ paths + RENDERING + MENU + API auth only. Zero edits to `run-calculation.ts`, `convergence-service.ts`, SCI pipeline (PG-15 git-diff proof). |
| **E** | Phase 5 API hardening breaks Financial by rejecting working requests | **Sequenced.** Phase 5 does tenant-binding (session-derived `tenantId`) FIRST. If server-side scope re-derivation breaks Financial flows, that piece is deferred to the Financial directive and reported (residual 1). |

---

## §4 — Implementation plan (vertical slices)

1. **Phase 1 (Foundation):** `lib/auth/scope.ts` (`AuthScope` + helpers + `resolveAuthScope`). auth-context: resolve scope in `initAuth`; `AuthContextType` += `scope, viewRole, ownEntityId, canViewAll, canViewTeam, isDenied` (+ `profileId` for persona-context). `hasCapability` admin/platform bypass. `getEntityResults` handles each discriminant (deny→[]). `resolveEntityScope` fail-CLOSED. persona-context: override gated by `isVLAdmin`; `scope` derived from `useAuth().scope`; second `fetchScope` lifecycle deleted. **PG-1..7.**
2. **Phase 2 (Threading):** 8 data fns gain `scope?: AuthScope` (default `{type:'all'}`) flowing to `getEntityResults`. `/my-compensation` own-entity via `useAuth().ownEntityId` not `extractEmployeeId(email)`. **PG-8, PG-13.**
3. **Phase 3 (Menu):** capability-gate all roles-only routes; retire `route.roles.includes(role)` fallback; `effectiveRole` from `useAuth().user.role`; Finance dead-end aligned. **PG-9, PG-10.**
4. **Phase 4 (Surfaces):** every ICM scope-sensitive surface passes `useAuth().scope`; `/perform`+`/stream` dashboard dispatch keys off `useAuth().user.role`. Financial + hospitality branches NOT rescoped. **PG-11, PG-12.**
5. **Phase 5 (API):** priority routes derive `tenantId` from session (403 on mismatch); `financial/data` ignores client `scopeEntityIds`, re-derives server-side (HALT-E sequencing). **PG-14.**

Behavior preservation (DD-7): **admin/platform byte-identical on every surface** (scope=all everywhere; capabilities all-true). The only behavioral change: member→own, manager→team where they previously saw tenant-wide. Less, not more.

*OB-246 ADR · committed before implementation per Section B.*
