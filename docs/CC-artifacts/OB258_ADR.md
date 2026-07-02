# OB258 — Architecture Decision Records

*One section per phase. Committed BEFORE implementation per CC_STANDING_ARCHITECTURE_RULES Section B.*

---

## ADR O1 — Capability seam & Revenue-leader (Executive) persona

**Date:** 2026-07-02 · **Grounding:** `docs/diagnostics/OB258_P0_DISCOVERY_a813209d.md` (P0.4, P0.5, Δ5, Δ6)

### Problem

Add four structural capabilities (`target.author`, `target.propose`, `target.approve`, `target.simulate`) to the single PDP, wired through all four PEPs; derive an Executive (Revenue-leader) persona from capability possession; render the Allocation Canvas nav/route ONLY for holders of a target capability — module-independent (Decision 64: the canvas is a platform capability, not module-gated). The "Sales sets quota, Comp executes" separation must be a capability partition, tenant-overridable — NOT a hard-coded role.

### Options

**Option A — grant target.\* to the `admin` role in the matrix.**
- Scale test: works at 10x? YES (pure matrix).
- AI-first: any hardcoding? NO.
- Transport: data through HTTP bodies? N/A.
- Atomicity: N/A.
- REJECTED: the compensation-admin persona today IS the `admin` role (holds `icm.configure_plans` + `data.calculate`). Granting admin `target.author` by default collapses the separation the directive mandates (§4 O1.2: comp-admin "does not hold `target.author`" by default) and makes EPG O1(b) unpassable.

**Option B — a new `revenue_leader` Role.**
- Scale test: YES.
- AI-first: NO hardcoding, but…
- REJECTED: DS-014 §8.1 — persona is DERIVED from role + capabilities, never a new role per persona. A new canonical Role fans out through resolveRole aliases, provision-user, MFA/route guards, gateInboxPersona, and the dual capability substrate (P0.4 Δ6) — maximal blast radius for what is structurally a capability partition. Personas already exist precisely to avoid role explosion.

**Option C — additive PDP extension + tenant-policy grants through the existing (declared, unused) `TenantPermissionOverrides.grants` seam. (CHOSEN)**
- Scale test: works at 10x? YES — pure boolean derivation; one settings read already performed by existing gates.
- AI-first: any hardcoding? NO — structural capability names (Korean Test: a franchise operator allocating store targets exercises the identical `target.author`).
- Transport: N/A (no row data).
- Atomicity: matrix + overlay evaluated in one `hasCapability` call; fail-closed on unknown role/absent grant.
- CHOSEN because: the grants seam exists in the PDP contract since DS-014 (`permissions.ts:232-237`) with zero feeders — this OB is its intended first feeder; every check stays inside the ONE `hasCapability` PDP (DS-014 §2.2).

### Design (Option C, concrete)

1. **Union + matrix:** 4 new `Capability` members (`// Target` group). Matrix defaults: `platform` holds all four (consistent with "platform can do everything"); `admin`/`manager`/`member`/`viewer`/`cda` hold NONE — the separation is the default; tenants opt roles in via policy.
2. **Tenant-policy overlay (the grants feeder):** `tenants.settings.permission_overrides = { grants: { <role>: [<capability>...] } }` — read by a new validated parser `tenantPermissionGrantsFromSettings()`, composed with the existing `tenantEntitlementRevocations(features)` by `composeTenantOverrides(features, settings)`. Revocations keep precedence (existing `hasCapability` order: revoke → grant → matrix).
3. **Snapshot substrate (P0.4 Δ6):** `deriveCapabilities(role, overrides?)` gains an optional overrides param (byte-identical when omitted) so provisioning under a tenant with grants snapshots them into `profiles.capabilities` — the seam API-route/RLS PEPs and persona derivation already read. Migration backfills the 4 target caps into the 3 platform profiles' jsonb (HF-355 pattern; architect-applied SR-44).
4. **Persona:** `PERSONA_TOKENS.executive` added (closed universe extension — NAMED behavior expansion); `derivePersona` gains an executive branch AFTER the platform/admin check (platform/admin keep the `admin` persona byte-identically) keyed on `target.author`/`target.approve` presence in the profile capability snapshot; `personaToRole('executive') → 'manager'` (exhaustive switch extended).
5. **Nav:** new UNGATED workspace `allocate` (no `featureFlag` — Decision 64: canvas not module-gated; `tenantEntitlementRevocations` therefore never revokes target.\* — always-entitled owner, by construction). Route `/allocation` uses a new additive `requiredAnyCapability?: Capability[]` field (any-of semantics = "holds a target capability", O1.3). `getWorkspaceRoutesForRole`/`canAccessWorkspace`/`getAccessibleWorkspaces` gain an optional `overrides` param threaded from the sidebars (no-op for every live tenant: zero grants exist in any `tenants.settings` today — P0.5 probe).
6. **PEPs:** middleware — additive `/allocation` block (identity + effective tenant + features/settings read → any-of target.\* via the PDP + profile-jsonb fallback → else `/unauthorized`), modeled on the OB-250 feature-gate block; page — new additive `RequireAnyCapability` component (same gate contract as `RequireCapability`); API — `/api/allocation/overview` GET via `resolveActor()` (HF-357 lesson) + PDP check, serving REAL tenant counts (entities, edges, targets, periods — no placeholders, AP-11); RLS — no new tables in O1; the target-capability RLS policy lands with O2's tables (named residual).

### Governing Principles Evaluation

- **G1 (standard):** NIST RBAC (INCITS 359-2012) with constrained ABAC overlay; DS-014.
- **G2 (embodiment):** the capability partition IS the organizational separation (comp-admin structurally cannot author quota; no procedural policy needed) — Decision 123.
- **G3 (traceability):** capability names appear verbatim in PDP union, PEP call sites, audit records.
- **G4 (discipline):** access-control theory — least privilege (Saltzer & Schroeder 1975): default deny, explicit grant.
- **G5 (abstraction):** `target.author` is domain-free — passes the Korean Test for any allocation-over-a-graph domain.
- **G6 (innovation boundary):** no novel mechanism; activates a declared, dormant seam.

### Named behavior expansions (DD-7)

1. `executive` added to the closed `PersonaKey` universe (tokens + derivation + personaToRole).
2. `TenantPermissionOverrides.grants` gains its first production feeder (previously declared, unused).
3. `deriveCapabilities` gains optional overrides (snapshot of grants at provision time).
4. Nav filter gains `requiredAnyCapability` + overrides threading (no-op for all live tenants today).
5. New workspace `allocate` (ungated).

Everything else preserves pre-OB behavior exactly; HALT-2 tripwire = any edit that CHANGES an existing capability's enforcement (none planned; verified by tests + build).
