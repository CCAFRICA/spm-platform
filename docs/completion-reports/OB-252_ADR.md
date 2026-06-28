# OB-252 — Architecture Decision Record

**Observatory Tenant Management — Identity, Entitlement, Admin Users**
Branch: `ob-252-tenant-management-observatory` · Base: `main` @ `c32714ba`
Author: CC · Date: 2026-06-28 · Mode: ULTRACODE

> Committed BEFORE any implementation code (Standing Rules Section B — Architecture Decision Gate).
> Phase 0 inspection performed by an 8-agent parallel workflow over the live code + `SCHEMA_REFERENCE_LIVE.md` (FP-49 authority), cross-verified first-hand by CC on the design-critical files (`workspace-config.ts`, `permissions.ts`, `provision-user.ts`, `role-workspaces.ts`, schema).

---

## §0 — CRF + PCD checklist

- [x] **Collision gate:** `OB-252` unused in the live repo. `git log --all | grep OB-252` → 0; no branch, no source/SQL/doc reference (only the directive). **No collision.**
- [x] `CC_STANDING_ARCHITECTURE_RULES.md` (v3.0) read in full.
- [x] Architecture Decision Gate (this doc) committed before implementation code.
- [x] Anti-Pattern Registry checked — approach has zero violations (see §6).
- [x] FP-49 SQL Verification Gate — every identity/entitlement/user field verified against live schema (§3). **Conclusion: ZERO migration required.**

---

## §1 — Phase 0 Inspection Findings (7 inspections + capability/guard)

### Inspection 1 — HF-352 tenant-management surface
- Lives at **`/admin/tenants`** (`web/src/app/admin/tenants/page.tsx`, 189 lines), client component wrapped in `<RequireCapability capability="platform.system_config">`.
- Renders: tenant `<select>` → (when selected) **Agent/Feature toggle** (only `<PrismCapabilityToggle>` today), **Clean Slate** (per-category wipe), **Delete Tenant**. **No Tenant Identity editor, no Admin-User management** exist yet.
- APIs all under `/api/platform/tenants/*`, all gated by **`authorizePlatformObservability()`** (cap `platform.system_config`, alias-safe): `tenants` (list), `[id]/data-summary`, `[id]/clean-slate`, `[id]/delete`, `[id]/prism` (GET/PATCH), `[id]/confirm-challenge`.
- The only `tenants.features` key this surface writes is **`prism_enabled`** (read-modify-write merge, decoupled from billing), via `[id]/prism/route.ts`.
- A **separate** `[id]/modules/route.ts` writes `features.compensation`/`features.financial` **AND** `settings.billing` and uses an **inline `role==='platform'` guard** — NOT called by this page; it is the billing-coupled path.
- Reachable from **both** the Observatory (`ObservatoryTab` "Manage tenant" per-card + "Create New Tenant") **and** the tenant-side Platform Core menu — the duplication §1 targets.

### Inspection 2 — Tenant creation wizard
- **`/admin/tenants/new`** (7-step client wizard) → `POST /api/admin/tenants/create`.
- Persists a real `tenants` row (service-role) with `name, slug, settings, features, locale, currency, hierarchy_labels, entity_type_labels`. **Branding/identity extras (`industry`, `country_code`, `timezone`, `display_name`, `primary_color`, `logo_url`, `admin_email`, `admin_name`) are nested inside `settings` JSONB** — there are no dedicated columns.
- "Create First Admin User" step exists and **works**: it calls the single-door `createUser(...role:'admin', mode:'invite')` (`lib/auth/provision-user.ts`) which does `auth.admin.createUser` + `profiles` insert (`tenant_id`, `role`, derived `capabilities`) with **auth-rollback atomicity**.
- **DEFECT (I6-relevant):** admin-user creation is wrapped in a `try/catch` that swallows ANY failure into a non-blocking warning while the route still returns **HTTP 201 "success"** (`create/route.ts:119-123`). Operator can create a tenant with **no admin** yet see "Provisioned Successfully". → The Observatory surface must treat `adminUserId===null` / presence of admin warnings as **partial failure**.
- On success the wizard shows a manual "Go to Tenant" button (`setTenant` → `router.push('/')`).

### Inspection 3 — Tenant-side Operations menu + fleet-card "Manage Tenant"
- The two leaking entries are in **`workspace-config.ts:362` (`/admin/tenants/new` "New Tenant", cap `platform.provision_tenant`) and `:365` (`/admin/tenants` "Tenant Management", cap `platform.system_config`)** — in the `operations` section of the **tenant-plane `platform-core` workspace**. Both `roles:['platform']`. They render in BOTH live sidebars (`ChromeSidebar`, `VialuceSidebar`) via `getWorkspaceRoutesForRole`.
- `ObservatoryTab.tsx:485` — "Manage tenant" → `router.push('/admin/tenants?tenant=<id>')` (no `setTenant`). `:514` — "Create New Tenant" → `router.push('/admin/tenants/new')`.
- **The plane leak mechanism:** `/admin/tenants` is in `TENANT_EXEMPT_ROUTES` but **NOT** in `SHELL_EXCLUDED_ROUTES` (`auth-shell.tsx:29,32`), so navigating there from the chromeless Observatory (`/select-tenant`) renders the **tenant-plane operator chrome** (`ChromeSidebar` + `Navbar`). That is the leak.
- A legacy `components/navigation/Sidebar.tsx:228` has a `New Tenant` entry but the component is **unimported/dead**.

### Inspection 4 — `tenants.features` → workspace-config → sidebar (the entitlement loop)
- Fully **deterministic, synchronous, zero-LLM**. Path: `tenants.features` (DB JSONB) → `tenant-context.tsx` fetch + merge over `DEFAULT_FEATURES` → `currentTenant.features` → sidebars call `getAccessibleWorkspaces(role, features)` → `canAccessWorkspace` (workspace `featureFlag` tenant-gate, `role-workspaces.ts:67-71`) + `getWorkspaceRoutesForRole` (per-route `hasCapability`).
- **Only TWO** workspaces carry a `featureFlag`: `finance → 'financial'`, `data-operations → PRISM_FEATURE_KEY ('prism_enabled')`. **`decide` (Intelligence) and `calculate` (Compensation) have none** — they are always-on (the Phase 3 gap).
- Section-level `featureFlag` filter exists in `getWorkspaceRoutesForRole` but is **dead** (no section sets one).
- `DEFAULT_FEATURES`: `compensation:true, performance:true, financial:false, prism_enabled:false` — **this is the default-on/off SSOT that makes Phase 3 non-regressive.**

### Inspection 5 — Admin/tenant user creation API (covered via #2 + #7; agent #5 returned a stub, filled first-hand by CC)
- **The single door is `lib/auth/provision-user.ts::createUser`** — canonical role (`resolveRole`), `validateRoleTenant` (tenantId NULL **iff** platform), `deriveCapabilities(role)` (caller cannot supply), duplicate-identity guard, `auth.admin.createUser` + `profiles` insert + **auth-rollback on failure**, writes `audit_logs` (tenant-scoped) + `platform_events`. Service-role throughout (RLS-immune).
- A second path `POST /api/platform/users/invite` wraps `inviteUserByEmail`/`createUser` with `ROLE_TEMPLATES {platform_admin, tenant_admin→'admin', manager, individual→'member'}`, **but uses the weaker inline `role==='platform'` guard** and re-implements profile insert (no `provision-user` atomicity helpers).
- Role-canon DB CHECK (`profiles_role_canon`, migration `20260626_ob247_cda_role.sql`) admits `platform/vl_admin, admin/tenant_admin, manager, member/individual/sales_rep, viewer, cda`. → Section C may create `admin/manager/member/viewer`.

### Inspection 6 — `tenants` / `profiles` / audit schema (FP-49 authoritative)
| OB-252 field | Storage | FP-49 verdict |
|---|---|---|
| name | `tenants.name` (column) | real column |
| slug | `tenants.slug` (column, read-only ref) | real column |
| currency | `tenants.currency` (column, default 'USD') | real column |
| locale | `tenants.locale` (column, default 'en') | real column |
| **country** | `settings.country_code` (JSONB) | **NOT a column** |
| **industry** | `settings.industry` (JSONB) | **NOT a column** |
| **logo** | `settings.logo_url` (JSONB; write-only today) | **NOT a column** |
- `tenants` = 11 columns: `id, name, slug, settings(jsonb), hierarchy_labels(jsonb), entity_type_labels(jsonb), features(jsonb), locale, currency, created_at, updated_at`.
- `profiles` = `id, tenant_id(NULLABLE), auth_user_id, display_name (NOT 'name'), email, role(default 'viewer'), capabilities(jsonb), locale, avatar_url, ...`; `UNIQUE(tenant_id, auth_user_id)`.
- Audit: **`audit_logs`** (`action, resource_type, resource_id, changes(jsonb before→after), profile_id=who, tenant_id, metadata, ip_address, created_at`) is the I4 home; the prism toggle is the canonical write precedent. `platform_events` is an event stream without structured before/after.
- Migration `008_add_billing_columns.sql` is a **no-op precedent**: extension data goes in `settings` JSONB, not new DDL.

### Inspection 7 — Observatory Users tab (EECI input for Section C)
- `/select-tenant` → `PlatformObservatory.tsx` (9-tab VL-admin command center, `isVLAdmin`-only). **Users tab** = `UsersTab → UserListView/UserDetailView` — a **cross-tenant read+remediate diagnostic instrument** (columns: User/Role/Tenant/Last-sign-in/Device/Health; actions Logout/Ban/Unban + detail-view Reset-Password/Reset-MFA/Resend-Confirmation). **Zero user-creation capability today.**
- Feeds from `GET /api/admin/users` (service-role read of `profiles` + `auth.users` + `tenants` + `platform_events`), gated by `authorizePlatformObservability` (`platform.system_config`). API supports `?tenantId=` filter, but the **tab cannot be deep-linked/pre-filtered** (no `useSearchParams`; `activeTab` is local state defaulting to `command-center`).

### Inspection 8 — Capability matrix, Observatory shell, platform-scope guards
- **Capabilities are role-only** (`permissions.ts` `ROLE_CAPABILITIES` → `hasCapability`). `tenants.features` is **never** intersected into the capability set — the `TenantPermissionOverrides {grants,revocations}` seam exists but is **UNUSED**. **DS-014 §9 module-aware capability intersection is a genuine GAP.** `deriveCapabilities(role)` persists role-only caps to `profiles.capabilities` at provision time.
- Canonical server guard = **`authorizePlatformObservability()`** (cap `platform.system_config`). Namespace is inconsistent: `prism` uses it; `modules`/`observatory`/`invite` use inline `role==='platform'`; `tenant-config` uses `hasCapability('platform.view_all_tenants')`. → **Standardize all new/touched routes on `authorizePlatformObservability()`.**
- Middleware gates `/admin` → `platform.system_config` (a tenant `admin` lacks all `platform.*` → denied server-side). **`/select-tenant` has NO middleware capability gate** (client `isVLAdmin` only) → the protecting boundary for an Observatory-mounted surface MUST be the APIs.
- **Observatory shell mount point:** `PlatformObservatory.tsx` — a `TabId` union (`:47`) + `TABS` array (`:49-59`) + Suspense content switch (`:173-181`). Adding a surface = 1 TabId + 1 TABS entry + 1 lazy import + 1 switch arm; carry the selected tenant via a lifted `selectedTenantId` state.
- An entitlement toggle reaching a live operator's sidebar depends on **`tenant-context` cache invalidation** (`refreshTenant`); a platform admin toggling tenant X does not change their own session — the affected operator sees it on next tenant-config load.

---

## §2 — ARCHITECTURE DECISION RECORD (Standing Rules Section B)

**Problem:** Collapse three problems into one Observatory-confined surface: (1) remove platform-owner tenant-management from the tenant plane; (2) build a complete tenant-management surface (Identity + Entitlement + Admin Users); (3) close the entitlement→capability→menu loop deterministically.

### Decision 1 — Where does the management surface live / how is it mounted?

**Option A — Relocate `/admin/tenants` content into a new `PlatformObservatory` tab; fleet card opens the tab in-place (no route nav).**
- Scale 10x: ✅ pure client tab swap. AI-first: ✅ none. HTTP bodies: ✅ metadata only. Atomicity: ✅ N/A.

**Option B — Add `/admin/tenants*` to `SHELL_EXCLUDED_ROUTES` so the routed page renders chromeless.**
- Scale: ✅. But keeps a routed tenant-plane page as the surface; the URL still reads `/admin/...` (tenant plane), and middleware `/admin` gate is the only server boundary; visually de-chromed but architecturally still "a route you navigate to," not Observatory-confined. Weaker plane separation.

**Option C — Full modal/drawer over the fleet view.**
- The three sections (Identity form, Entitlement toggles, Admin-User list+create) are too large for an overlay; loses deep-linkability and the established per-tab pattern.

**CHOSEN: Option A.** Mount a new **`tenant-management`** tab in `PlatformObservatory`, rendered as an in-Observatory panel that receives a `selectedTenantId` lifted into the Observatory shell. The fleet-card "Manage tenant" switches the Observatory tab + sets the selected tenant (no `router.push` to a tenant-plane route). "Create New Tenant" routes to the creation wizard which, on success, **returns into this tab** for the new tenant (Phase 4). The existing `/admin/tenants` page is retained only as a thin platform-gated fallback (kept reachable for safety, but the menu entries that pointed at it are removed). **Rationale:** truest I0/I1 confinement, matches the `UsersTab` precedent, deep-linkable within the Observatory, no new "plane" concept needed. **REJECTED B/C** per above.

### Decision 2 — Identity storage (FP-49)

**CHOSEN: ZERO migration.** Write `name`/`locale`/`currency` to the real `tenants` columns; write `country`/`industry`/`logo` to `settings` JSONB under the **exact existing keys** `settings.country_code`, `settings.industry`, `settings.logo_url` (the keys the create wizard already writes and `tenant-config`/`observatory` already read). Consistent with the `008` no-op precedent. **No new DDL** → not architect-blocked, unlike a column-promotion migration. (A migration is warranted ONLY if the architect later demands first-class columns — out of scope, would HALT for SR-44.)

### Decision 3 — Entitlement toggle set derivation (Korean Test / no-registry)

**CHOSEN: structural derivation from `WORKSPACES`.** The toggleable set = `Object.values(WORKSPACES).filter(ws => ws.featureFlag)`. Each toggle: label = `ws.label`, key = `ws.featureFlag`, default = `DEFAULT_FEATURES[key]`. **Platform Core has no `featureFlag` → auto-excluded → PG-7 holds by construction.** Adding a future agent with a `featureFlag` makes it appear automatically. No hardcoded agent list anywhere.
- To complete the set per the directive, add `featureFlag` to two existing workspaces: **`decide → 'performance'`** (Intelligence; `DEFAULT_FEATURES.performance=true` → default-ON) and **`calculate → 'compensation'`** (Compensation/ICM; `DEFAULT_FEATURES.compensation=true` → default-ON). `finance→'financial'` and `data-operations→'prism_enabled'` already exist (default-OFF/licensable). Reusing the pre-existing `TenantFeatures` keys `performance`/`compensation` = minimal blast radius (SR-34); the displayed label is the agent name, internal key stays snake_case (PRISM precedent).

### Decision 4 — Default-on safety (the regression-critical decision)

Adding a strict `features[flag]===true` gate to `decide`/`calculate` would hide Intelligence + Compensation from **every existing tenant** (absent key → blocked) = a BCL/Meridian-class HALT regression. **CHOSEN:** a single canonical helper **`isFeatureEnabled(features, key) = ((features?.[key]) ?? DEFAULT_FEATURES[key] ?? false) === true`** (new leaf module `lib/tenant/feature-flags.ts`, imports only `DEFAULT_FEATURES`). Refactor `canAccessWorkspace`, the section gate in `getWorkspaceRoutesForRole`, `isPrismEnabled`, and the middleware feature gate to use it. This makes `DEFAULT_FEATURES` the single declaration of default entitlement — `compensation`/`performance` default-ON (no existing tenant regresses), `financial`/`prism_enabled` default-OFF (current behavior byte-identical). Works whether the caller pre-merged `DEFAULT_FEATURES` or passes raw DB features (middleware reads raw).

### Decision 5 — Capability intersection (DS-014 §9 closure, deterministic / Decision 158)

**CHOSEN:** a deterministic, structurally-derived overlay **`tenantEntitlementRevocations(features): TenantPermissionOverrides`** (in `workspace-config.ts`, which owns `WORKSPACES`). Algorithm: for each capability `C` required by any route, `C` is revoked **iff every workspace that owns a route requiring `C` is de-entitled** (`ws.featureFlag && !isFeatureEnabled(features, ws.featureFlag)`). A workspace with no `featureFlag` (Platform Core) is always entitled, so shared caps (`data.import`, `view.team_results`, `statement.view`) are **never** revoked; agent-exclusive caps (`icm.*`, `data.calculate`, `data.reconcile`, `data.advance_lifecycle` when Compensation is off) ARE revoked. Fed through the **existing unused `tenantOverrides` seam** in `getCapabilities`/`hasCapability`, applied at the OB-246 `effectiveCapabilities` resolution point in `auth-context`. **Pure boolean/structural — zero LLM, zero async** (Decision 158, I2). This is the literal "a user in a tenant without the Compensation agent cannot have `icm.*` capabilities."

### Decision 6 — Section C (Admin Users) placement — EECI evaluation

| Criterion | (A) In per-tenant surface | (B) In cross-tenant Users tab |
|---|---|---|
| **Efficiency** | tenant already in context; one surface for identity+entitlement+users | must filter to tenant first (whole tenant list loads first); two surfaces |
| **Efficacy** | operator completes create-in-tenant without context switch | context switch + filter dance; tab is a *fleet* instrument |
| **Comprehensive** | creation + read of this tenant's users in place | tab is read/remediate diagnostic, **zero creation affordance today** |
| **Innovate** | advances the per-tenant surface as the single tenant ops plane | dilutes the cross-tenant diagnostic's single purpose |

**CHOSEN: Option A** — per-tenant admin-user **creation + this-tenant list** live in the new surface's Section C. The cross-tenant **Users tab is unchanged** (stays the read/remediate diagnostic). **No divergent cache (PG-15 by construction):** Section C creates via the single-door `createUser` → `profiles`; the Users tab reads `profiles` via `/api/admin/users`; the new user appears in both with **one source of truth (`profiles`)**, no sync step. Creation reuses the **best** primitive (`createUser`, atomic + audited) under a **new** platform endpoint `POST /api/platform/tenants/[tenantId]/users` gated by `authorizePlatformObservability` (retiring the weaker `invite` role-string guard for this surface). Section C surfaces the I6 partial-failure honestly (no swallowed errors).

### Decision 7 — Auth guard standardization

All **new** routes (`[tenantId]` GET/PATCH identity, `[tenantId]/entitlement` PATCH, `[tenantId]/users` GET/POST) gate on **`authorizePlatformObservability()`** (`platform.system_config`). Server-side enforced on every endpoint (PG-12). The surface mounts under `/select-tenant` (no false reliance on a middleware route gate — the API is the boundary, per Inspection 8).

### Governing Principles Evaluation (Decisions 123 & 124)
- **G1 (standards):** SOC 2 CC6 (access enforcement at data + menu + API), OWASP A01 (broken access control — no client-trusted entitlement), DS-014 §9 (capability-derived navigation), Decision 158 (deterministic construction).
- **G2 (architectural embodiment):** entitlement IS `tenants.features` (single JSONB SSOT) → `isFeatureEnabled` → menu/capability/route, all deterministic code. The audit IS the `audit_logs` before→after row written in the same transaction path as the change. No policy layer; the architecture is the control.
- **G3 (traceability):** `tenants.features[flag]` (DB) → `isFeatureEnabled` (one helper) → `canAccessWorkspace` + `tenantEntitlementRevocations` + middleware gate. An auditor can follow the flag to the rendered menu and the capability set from this doc.
- **G4 (discipline):** access-control theory (capability-based security; deny-by-default), not "dashboards have a settings page."
- **G5 (abstraction):** the entitlement mechanism is domain-agnostic — any future agent with a `featureFlag` participates with no code change.
- **G6 (innovation boundary):** no speculative mechanism; reuses the proven PRISM `featureFlag` + `audit_logs` + `createUser` primitives.

---

## §3 — FP-49 SQL Verification Gate (every field, against live schema)

| Write target | Column/path | Verified against |
|---|---|---|
| name | `tenants.name` | SCHEMA_REFERENCE_LIVE.md:642; 001_core_tables.sql:24 |
| locale | `tenants.locale` | :648; 001:30 |
| currency | `tenants.currency` | :649; 001:31 |
| country | `tenants.settings.country_code` (JSONB) | tenant-config:73 / new/page:319 (existing keys) |
| industry | `tenants.settings.industry` (JSONB) | tenant-config:72 / new/page:318 |
| logo | `tenants.settings.logo_url` (JSONB) | new/page:323 |
| entitlement | `tenants.features.{performance,compensation,financial,prism_enabled}` (JSONB) | types/tenant.ts:28-44; prism/route.ts:63-71 |
| user create | `profiles.{auth_user_id,email,display_name,role,tenant_id,capabilities,locale}` | SCHEMA:466-481; provision-user.ts:175-178 |
| audit | `audit_logs.{tenant_id,profile_id,action,resource_type,resource_id,changes,metadata}` | SCHEMA:71-84; prism/route.ts:75-83 |

**No statement references a non-existent column. ZERO migration. FP-49 PASS.**

---

## §4 — Implementation plan per phase

- **Phase 1 (Plane separation):** delete `workspace-config.ts:362` (New Tenant) + `:365` (Tenant Management) from `platform-core › operations` (removes from both sidebars at once); delete dead `Sidebar.tsx:228`. Rewire `ObservatoryTab` "Manage tenant"/"Create New Tenant" to switch the Observatory tab (+ set `selectedTenantId`) instead of `router.push` to `/admin/tenants*`. New surface mounts under `/select-tenant` (Observatory), every API `authorizePlatformObservability`-gated.
- **Phase 2 (3 sections):** new `TenantManagementTab` (Identity form / Entitlement toggles / Admin Users) + `selectedTenantId` lifted into `PlatformObservatory`. New endpoints: `GET/PATCH /api/platform/tenants/[tenantId]` (identity, audited), `PATCH /api/platform/tenants/[tenantId]/entitlement` (generic flag writer incl. prism, structurally validated, audited), `GET/POST /api/platform/tenants/[tenantId]/users` (`createUser` single-door, audited). Toggle set derived structurally (Decision 3). Identity ↔ `settings` JSONB (Decision 2).
- **Phase 3 (closed loop):** `isFeatureEnabled` helper (Decision 4); `featureFlag` added to `decide`/`calculate`; refactor `canAccessWorkspace`/section-gate/`isPrismEnabled`/middleware to the helper; `tenantEntitlementRevocations` overlay wired into `auth-context` `effectiveCapabilities` (Decision 5); extend middleware `WORKSPACE_FEATURES` for the agent-exclusive deep-link paths (default-on aware). All deterministic, zero LLM.
- **Phase 4 (UX):** Save/Cancel per section + change confirmation; persistent "Back to Observatory" exit; honest error surfacing (incl. I6 partial-failure on user create); creation wizard lands back in this tab for the new tenant.

---

## §5 — HALT check
No invariant (I0–I7) violation surfaced in Phase 0. No structural conflict invalidates the approach (the surface is an extension, ZERO migration, all primitives exist). No branch collision. **Proceed to implementation. No HALT.**

The one watch-item (documented, not a HALT): gating **Intelligence** (`/stream`, the universal landing per Decision 128) is included per the directive's explicit toggle list, made safe by default-ON; a tenant explicitly toggled off Intelligence is a deliberate platform-owner action. Landing fallback verified in Phase 3/4.
