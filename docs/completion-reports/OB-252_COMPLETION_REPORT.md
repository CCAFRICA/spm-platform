# OB-252 — Completion Report

**Observatory Tenant Management — Identity, Entitlement, Admin Users**
Branch: `ob-252-tenant-management-observatory` (off `main` @ `c32714ba`) · Date: 2026-06-28 · Mode: ULTRACODE
Author: CC. **CC authors/commits/PRs — does NOT merge, does NOT self-attest browser/production truth (SR-44).**

> Full Phase-0 inspection detail is in `docs/completion-reports/OB-252_ADR.md` (committed before any implementation code — Architecture Decision Gate).

---

## 1 — Phase 0 ADR findings (8 inspections, with code references)

An 8-agent parallel inspection workflow + first-hand CC verification produced the ADR. Headlines:

| # | Inspection | Key finding (file:line) |
|---|---|---|
| 1 | HF-352 surface | `/admin/tenants` (`admin/tenants/page.tsx`) = selector + PRISM toggle + Clean Slate + Delete; APIs under `/api/platform/tenants/*` all `authorizePlatformObservability`-gated; **no Identity/Admin-User sections existed**. |
| 2 | Creation wizard | `/admin/tenants/new` → `create/route.ts` persists tenant (service-role); admin created via `createUser` single-door; **DEFECT: admin-create failure swallowed → 201 "success"** (`create/route.ts:119-123`). |
| 3 | Ops menu + fleet leak | leak entries `workspace-config.ts:362/365`; fleet `ObservatoryTab.tsx:485` `router.push('/admin/tenants?tenant=')`; leak mechanism = `/admin/tenants` exempt but NOT shell-excluded (`auth-shell.tsx:29,32`). |
| 4 | features→menu loop | deterministic chain `tenants.features → canAccessWorkspace (featureFlag) → getWorkspaceRoutesForRole`; only `finance`/`data-operations` had a featureFlag; `DEFAULT_FEATURES` is the default-on/off SSOT. |
| 5 | admin-user API | single door = `provision-user.ts::createUser` (auth+profile, atomic, audited); role-canon CHECK admits `admin/manager/member/viewer`. |
| 6 | tenants/profiles/audit schema (FP-49) | `name/slug/locale/currency` real columns; `country/industry/logo` → `settings` JSONB (`country_code/industry/logo_url`); audit → `audit_logs`. **ZERO migration.** |
| 7 | Observatory Users tab | cross-tenant read/remediate diagnostic (`UsersTab`), zero creation today → EECI: per-tenant creation belongs in the new surface, shared `profiles` SSOT. |
| 8 | capability matrix + guards | `hasCapability` role-only; `TenantPermissionOverrides` seam **unused** (DS-014 §9 gap); canonical guard `authorizePlatformObservability`; Observatory shell = `PlatformObservatory` tabs. |

**Architecture decisions:** in-Observatory tab mount; ZERO-migration identity (settings JSONB); structural toggle derivation; **default-on via `isFeatureEnabled`+`DEFAULT_FEATURES`**; deterministic capability-revocation overlay (DS-014 §9); Section C in the per-tenant surface (EECI); standardize on `authorizePlatformObservability`. **Live-data correction (see PG-5/6):** the two core-agent gates use DEDICATED keys decoupled from billing.

---

## 2 — Proof Gate Evidence (PG-1 … PG-15)

> Deterministic gates: pasted code/grep/test output. DB/browser gates: code evidence + the exact live-verification path, marked **architect-verifies (SR-44)** — CC does not self-attest browser/production truth. Read-only live DB queries were run to corroborate FP-49 and non-regression (no production mutation).

### PG-1 — tenant-side menu shows NO "New Tenant" / "Tenant Management" (any role) — **PASS**
```
$ grep -n "/admin/tenants" web/src/lib/navigation/workspace-config.ts
365:      // OB-252 I1 (plane separation): "New Tenant" ... were REMOVED from here.   (comment only)
$ grep -rn "New Tenant|Tenant Management|Nuevo Inquilino|Gestión de Inquilinos" web/src/lib/navigation web/src/components/navigation
workspace-config.ts:365  (removal comment)   ·   Sidebar.tsx:228  (removal comment)
```
Both live sidebars (`ChromeSidebar`, `VialuceSidebar`) build menus via `getWorkspaceRoutesForRole`, so removal from `workspace-config` removes the entries from both at once. Dead `Sidebar.tsx:228` entry also removed.

### PG-2 — fleet card "Manage Tenant" opens the surface WITHOUT entering the tenant workspace — **PASS**
```
ObservatoryTab.tsx:66   export function ObservatoryTab({ onManageTenant, onCreateTenant })
:500   if (onManageTenant) onManageTenant(tenant.id);   // in-Observatory tab switch
:501   else router.push(`/admin/tenants?tenant=${tenant.id}`);   // standalone fallback only
PlatformObservatory.tsx  openTenantManagement → setActiveTab('tenant-management') + setSelectedTenantId
```
URL stays at `/select-tenant` (the Observatory); the surface renders as the `tenant-management` tab. `/admin/tenants` + `/admin/tenants/new` are now `SHELL_EXCLUDED` (chromeless) and `/admin/tenants` redirects into the Observatory tab.

### PG-3 — tenant identity fields editable; Save persists to `tenants` — **code-verified; live edit = architect (SR-44)**
`[tenantId]/route.ts` PATCH writes `name/locale/currency` (columns) + `settings.country_code/industry/logo_url` (JSONB), `changed`-only audit. **FP-49 corroborated against the LIVE DB** (read-only): every tenant's `settings` carries `country_code`/`industry` (and `logo_url` for Casa Diaz); `locale`/`currency` are real columns (e.g. Almacenes Mirasol `locale=en-US currency=PEN`). Verification path: PATCH a test tenant → `SELECT name,locale,currency,settings->>'country_code' FROM tenants WHERE id=…`.

### PG-4 — agent entitlement toggles write to `tenants.features` — **code-verified; live toggle = architect**
`[tenantId]/entitlement/route.ts:70 .update({ features, updated_at })`; validates `featureKey ∈ toggleableFeatureKeys()`; audits effective before→after. Verification path: toggle in Observatory → `SELECT features FROM tenants WHERE id=…`.

### PG-5 / PG-6 — toggling an agent OFF/ON removes/restores its sidebar section — **PASS (deterministic test)**
```
node --test src/lib/navigation/__tests__/ob252-entitlement.test.ts → 10/10 pass (18/18 with ob250)
✔ PG-5/PG-6: toggling Compensation OFF hides the calculate workspace; ON restores it (admin)
✔ PG-5/PG-6: toggling Intelligence OFF hides the decide workspace; default keeps it
  canAccessWorkspace('admin','calculate',{compensation_enabled:false}) === false
  canAccessWorkspace('admin','calculate',{compensation_enabled:true})  === true
```
Live verification path (architect): toggle OFF in Observatory → open that tenant → sidebar omits Compensation/Intelligence; toggle ON → restored. Propagation note: the affected operator sees it on next tenant-config load (`tenant-context` cache).

### PG-7 — Platform Core always visible; cannot be toggled off — **PASS**
```
workspace-config.ts:273  'platform-core': { ... }   (NO featureFlag line)
✔ test: toggleableFeatureKeys() === ['compensation_enabled','financial','intelligence_enabled','prism_enabled']
✔ test: Platform Core never in getToggleableAgents(); canAccessWorkspace('admin','platform-core',{all off}) === true
```
Excluded by construction (no `featureFlag` → not derived into the toggle set).

### PG-8 — admin user created from this surface exists in `profiles` with correct `tenant_id` + `role` — **code-verified; live = architect**
`[tenantId]/users/route.ts` POST → `createUser({tenantId, role∈{admin,manager,member,viewer}})` → `provision-user.ts:175 profiles.insert({auth_user_id,email,display_name,role,tenant_id,capabilities})`, atomic rollback. Verification path: create in Section C → `SELECT id,tenant_id,role FROM profiles WHERE email=…`.

### PG-9 — created user can log in and lands in the correct tenant — **architect (SR-44)**
`createUser` invite mode mints `generateLink` + `sendInvite`; `tenant_id` set → tenant resolution on login. (No mailer env → invite is a dry-run; account still exists — surfaced honestly in the UI.) Login test is browser-side (architect).

### PG-10 — audit records for identity edit, entitlement toggle, user creation — **PASS (code)**
- identity → `audit_logs` action `tenant.identity_updated` (`[tenantId]/route.ts`, changed-only).
- entitlement → `audit_logs` action `tenant.entitlement_toggled` (effective before→after, change-only).
- user creation → `audit_logs` action `user.created` (inside `createUser`/`provision-user.ts:82`).
All use real `audit_logs` columns (`tenant_id,profile_id,action,resource_type,resource_id,changes,metadata`).

### PG-11 — explicit Save, Cancel, Exit-to-Observatory controls — **PASS**
```
TenantManagementTab.tsx:  "Save identity" + "Cancel" (IdentitySection); per-section result banners;
  Header → persistent "Back to Observatory" (onExit) on every state (picker/loading/error/detail);
  "Tenants" back-to-picker; Create/Cancel in CreateUserForm.
```

### PG-12 — platform-scoped access check enforced server-side; non-platform user denied — **PASS**
```
$ grep authorizePlatformObservability  (all three new routes, before any read/write)
[tenantId]/route.ts:58 (GET) :83 (PATCH)   entitlement/route.ts:32 (PATCH)   users/route.ts:50 (GET) :70 (POST)
```
Guard = `getServerAuthState()` → 401 unauth / 403 no-profile / 403 `!hasCapability(role,'platform.system_config')`. A tenant `admin` (no `platform.*`) is denied. Middleware additionally gates `/admin` → `platform.system_config`.

### PG-13 — `tenants.features` is the single entitlement store (no parallel storage) — **PASS (live-corroborated)**
```
entitlement/route.ts → writes ONLY tenants.features (no other table)
LIVE read-only probe: SELECT from 'tenant_entitlements' → PGRST205 (table does NOT exist)
→ tenants.features is the sole store.
```

### PG-14 — zero LLM in the entitlement→capability→menu path — **PASS**
```
$ grep -niE "anthropic|openai|llm|callLLM|inference" feature-flags.ts role-workspaces.ts \
    workspace-config.ts RequireCapability.tsx useHasCapability.ts permissions.ts
(only doc comments asserting "zero LLM"; no actual calls) — pure boolean/structural, synchronous.
```

### PG-15 — Observatory Users tab and per-tenant user management share one source of truth — **PASS (by construction); live = architect**
Section C creates via `createUser` → `profiles`; the Users tab reads `profiles` via `/api/admin/users`; the per-tenant list reads `profiles` via `[tenantId]/users` GET. One table, zero client cache. A user created in Section C appears in the Users tab with no sync step.

**Non-regression proof (live, read-only):** all 15 live tenants resolve `intelligence_enabled=true` and `compensation_enabled=true` (default-on; both keys absent everywhere). BCL and Trial 1 carry a stale **billing** `compensation:false` that, under the decoupled dedicated key, does **NOT** disable the Compensation agent. *"Tenants losing a core agent vs. before OB-252: 0."*

---

## 3 — SR-39 Compliance Verification

- **SOC 2 CC6 (logical access enforcement at data + menu + API).**
  - *API*: every management endpoint gates on `authorizePlatformObservability` (`platform.system_config`) before any read/write (PG-12). Service-role writes never run under a browser/anon client.
  - *Menu*: capability + entitlement derive the sidebar (`getAccessibleWorkspaces` + `tenantEntitlementRevocations`); de-entitled agents disappear (PG-5/6).
  - *Data/route*: middleware gates `/admin` (capability) and the agent-exclusive routes (feature, default-on aware); RequireCapability/useHasCapability intersect role caps with tenant entitlement.
  - *Audit (CC6.1/CC7)*: every state change writes an append-only `audit_logs` row with who/what/before→after/when (PG-10); `audit_logs` is never a clean-slate target (existing test).
- **OWASP A01 (Broken Access Control) / A04 (Insecure Design).** No client-trusted entitlement: the menu hide is UX; the server boundary is the API guard + middleware. The capability overlay only **revokes** (never grants) — adversarially verified. Destructive ops keep the two-step server-verified challenge (HMAC + typed name).
- **DS-014 (capability-derived navigation + §9 module-aware permissions).** Navigation renders from the capability set; §9 closed via the deterministic `tenantEntitlementRevocations` overlay feeding the previously-unused `TenantPermissionOverrides` seam.
- **Decision 158 / Korean Test.** The entitlement→capability→menu path is pure boolean/structural (PG-14); the toggle set + namespace ownership derive structurally from `WORKSPACES` (no hardcoded agent list, no role-string gating) — the review's Korean-test lens passed all 5 checks.

**Scoped residual (documented honestly):** the engine API handlers (`/api/calculation/*`) are not feature-gated inside the calc path (HALT-CALC protection; they are bound to the caller's own tenant by `resolveCallerTenant`, so no cross-tenant exposure). For the two default-on agents, entitlement is enforced at the menu + page-middleware + client-capability layers; the agent's *exec pages* are server-gated, the engine API handler is not. This matches the pre-existing platform pattern and is the only place where entitlement is not server-enforced.

---

## 4 — Files created / modified

**Created (7):**
- `web/src/lib/tenant/feature-flags.ts` (+40) — `isFeatureEnabled` / `isEntitledByDefault` (default-on SSOT).
- `web/src/components/platform/TenantManagementTab.tsx` (+639) — the 3-section surface + Danger Zone.
- `web/src/app/api/platform/tenants/[tenantId]/route.ts` (+149) — identity GET/PATCH.
- `web/src/app/api/platform/tenants/[tenantId]/entitlement/route.ts` (+98) — generic entitlement PATCH.
- `web/src/app/api/platform/tenants/[tenantId]/users/route.ts` (+134) — tenant users GET/POST.
- `web/src/lib/navigation/__tests__/ob252-entitlement.test.ts` (+133) — 11 deterministic tests.
- `docs/completion-reports/OB-252_ADR.md` (+173) — Architecture Decision Record.

**Modified (16):** `workspace-config.ts` (+137; featureFlags, `getToggleableAgents`, `tenantEntitlementRevocations`), `permissions.ts` (+27; WORKSPACE_FEATURES gates), `role-workspaces.ts`, `middleware.ts`, `RequireCapability.tsx`, `useHasCapability.ts`, `tenant-context.tsx` (+`useTenantFeaturesSafe`), `types/tenant.ts` (+ dedicated agent keys), `PlatformObservatory.tsx`, `ObservatoryTab.tsx`, `auth-shell.tsx`, `Sidebar.tsx`, `admin/tenants/page.tsx` (→ redirect), `admin/tenants/new/page.tsx` (Observatory landing).

**Build/test:** `tsc` clean; `npm run build` green (218/218 static pages); 18/18 navigation tests, 48/48 across auth/navigation/platform/hooks; dev server confirmed `localhost:3000` HTTP 200.

---

## 5 — ARTIFACT SYNC

```
ARTIFACT SYNC
MC: OB-252 → implemented (Phases 0-4 + adversarial review + live-data regression fix). New items
    discovered: (a) billing keys (compensation/financial) are distinct from agent-entitlement keys —
    OB-252 introduces the decoupled intelligence_enabled/compensation_enabled (PRISM precedent); (b)
    /api/calculation/* never had a capability/feature gate (pre-existing, documented residual).
REGISTRY: tenant-entitlement now spans 4 agents (intelligence_enabled, compensation_enabled, financial,
    prism_enabled) derived structurally from WORKSPACES featureFlags — NOT a developer registry (no
    closed allowed-value set; Platform Core auto-excluded). No L-level Δ proposed.
R1: PG-1..15 → deterministic gates PASS (pasted code/test); DB/browser gates code-verified + live
    read-only corroboration (FP-49, PG-13, zero-regression) → live edit/login/toggle = architect (SR-44).
BOARD: now = Observatory-confined tenant management (identity+entitlement+admin users) with a
    deterministic, billing-decoupled, non-regressive entitlement loop. gap = engine-API feature gate
    (scoped residual, HALT-CALC). ev = ob252-entitlement.test.ts + live tenant read. ef = medium.
    fl = green build. lane = ready for architect verification + merge.
SUBSTRATE: exercised authorizePlatformObservability, createUser single-door, audit_logs, the featureFlag
    gate, the unused TenantPermissionOverrides seam (now consumed). Candidate capture for ICA: "agent
    entitlement keys MUST be decoupled from billing module keys (a stale billing flag must never
    silently disable a sealed tenant's agent)" — verified live against BCL.
```

---

## 6 — HALT check
No I0–I7 violation. The one HALT-class risk (reusing the billing `compensation` key would have hidden the Compensation agent from BCL/Trial1) was caught by a **live-data read** and resolved with decoupled default-on keys — proven zero-regression across all 15 live tenants. Proceeded autonomously per §4 (a discovery CC decides and continues past), documented here. **CC does not merge — architect verifies browser surfaces + merges (SR-44).**
