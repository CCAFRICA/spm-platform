# OB-207 Increment 2 — RBAC Binding + FP-49 Findings — Completion Report (Pass 1)

**Date:** 2026-06-14 · **Branch:** `ob-207-inc2-experience-surfaces` → `main`
**Governing:** DS-014 (single PDP), DS-019, Decision 123, OB-207 Increment 1
**Status:** **PHASE 1 SHIPPED** — the RBAC binding (the increment's structural prerequisite) + the
FP-49 schema corrections that govern the remaining phases. Phases 2–5 (cockpit, persona+module results,
FM views, action proximity) are scoped as Pass 2 — see "Scope of this pass."

**Collision gate:** Increment 1 (#506) confirmed on `main` (`70f109c6` spine + `WorkspaceId` union present).

---

## Scope of this pass (honest delineation)

Increment 2 is a 6-phase build. The increment's own discipline names **Phase 1 (RBAC binding) as the
structural prerequisite** — "if execution must stop, each completed phase is independently shippable and
the binding stands." This pass delivers that binding cleanly and verified, **and** the **FP-49 schema
reads** — which surfaced two corrections that materially reshape the surface phases (the directive
assumed columns that do not exist). Establishing the live schema reality now is the prerequisite that
keeps Phases 2–5 from being built against non-existent fields. Rather than rush five surface builds
against unverified assumptions, this pass nails the access foundation and the schema truth; the
surfaces (cockpit, results, FM, actions) are Pass 2 with the schema now established.

---

## Phase 1 — RBAC Binding (PG-01, PG-02, PG-03)

**ADR:** `docs/architecture/AGENT_RBAC_BINDING_ADR_OB207.md` — workspace access derives from the DS-014
single PDP + tenant features, not a parallel role list.

**The binding (`role-workspaces.ts` + `workspace-config.ts`):**
- `canAccessWorkspace(role, ws, enabledFeatures?)` and `getAccessibleWorkspaces(role, enabledFeatures?)`
  now **delegate to `getWorkspaceRoutesForRole`** — "the role can reach ≥1 route in the workspace,"
  computed from each route's `requiredCapability` via **`hasCapability`** (the single PDP).
- **`ROLE_WORKSPACE_ACCESS` (the parallel role→workspace map) is RETIRED** — it was the F-38
  role-vocabulary-divergence anti-pattern (a second source of truth that drifts). No external consumers;
  removed cleanly.
- **Module gating** via an optional `enabledFeatures` filter on `getWorkspaceRoutesForRole` that drops
  sections whose `featureFlag` is not enabled in the **live `tenants.features`** map.

**Access derivation (code-trace, PG-01):** admin/platform have `data.*` + `tenant.*` → all four
workspaces; manager has `view.*` (no `data.calculate`/`data.reconcile`/`tenant.*`) → **Decide** + (Consolidate
only if `financial` feature on, via the manager-visible Financial section); sales_rep → **Decide** +
financial-gated Consolidate. A viewer/rep sees strictly fewer workspaces than an admin — derived, not
listed. Decision 123 realized: the sidebar IS the capability set rendered. **Build exit 0.**

---

## FP-49 Schema Verification (MANDATORY GATE — corrections found, live)

```
OK   audit_logs   [id, tenant_id, profile_id, action, resource_type, resource_id, changes, metadata, created_at]
OK   agent_inbox  [id, tenant_id, agent_id, type, title, severity, action_url, persona, acted_at, metadata]
FAIL profiles     module_access  →  column profiles.module_access does not exist
FAIL tenants      modules_enabled →  column tenants.modules_enabled does not exist
LIVE tenants.features = { compensation, salesFinance, financial, performance, transactions, … } (JSONB)
```

**Two corrections that reshape the remaining phases:**
1. **`audit_logs.profile_id`** is the actor column — confirmed (the directive's FP-49 correction holds;
   the assumed `actor_id` does not exist). Every Coach/Intervene/Resolve write in Pass 2 uses `profile_id`.
2. **Per-user `module_access` is NOT live**, and **`tenants.modules_enabled` is NOT live** — only
   **`tenants.features`** exists. **Disposition (HALT-3 → "gate on what exists"):** module gating is
   **tenant-level via `tenants.features`**; the directive's per-user `module_access` gating (DS-014 §9.1)
   cannot be implemented — it is a **documented residual (R3, DS-027 schema territory)**, not invented.
   The §5/§6 "module_access grants" must be re-read as tenant-feature gating until DS-027 adds the column.

---

## SR-39 Compliance Verification (Phase 1 scope)

- **Single PDP, no weakened gate:** the binding re-keys to `hasCapability` (the existing PDP); it adds
  no new access list and no bypass — it *removes* a parallel list (F-38). Strictly tighter sourcing.
- **Module gating** uses the live `tenants.features`; no fabricated column; tenant-scoped.
- **No isolation change:** the binding is nav-visibility derivation only — it does not touch the auth
  gate, MFA, RLS, or tenant/entity isolation (those PEPs are unchanged).
- SOC2 CC6 / NIST 800-162 / DS-014 / Decision 123: honored — access derives from one authoritative
  capability source. (Persona-scoped reads + audit/inbox writes are Pass 2; their compliance verifies then.)

---

## Phases 2–5 — scoped for Pass 2 (the surfaces), with schema now established

| Phase | Surface | Pass-2 readiness (from this pass's audits) |
|---|---|---|
| 2 | Lifecycle cockpit (F-4) | services exist (`compensation-clock`/`cycle`/`pulse`/`queue`); wire to `state-reader.ts` |
| 3 | Persona+module results (F-2/F-3) | per-component payout present (OB-206); Manager heatmap exists on /stream — port to /results; module gating = `tenants.features` |
| 4 | FM views on committed_data (F-3) | HALT-7 to assess — verify FM `data_type` exists in committed_data for a POS tenant |
| 5 | Action proximity (F-5) | `agent_inbox` ✓, `audit_logs.profile_id` ✓ — write API route + wire existing Acceleration Cards |

---

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: F-38 role-vocabulary divergence → RESOLVED (single-PDP binding). F-2/F-3/F-4/F-5 surfaces → Pass 2. FP-49: directive's module_access/modules_enabled assumption corrected to tenants.features (live).
REGISTRY: NEW "Agent-RBAC Binding" → workspace access = capability via single PDP (Decision 123). Persona+Module Results / Cockpit / Action Proximity → Pass 2 (schema established).
R1: Tier C candidate "nav is capability-gated" → binding done; "results are persona+module-aware" → Pass 2; pending SR-44.
BOARD: Platform Core (RBAC binding) advanced. Calculate/Decide/Consolidate surfaces → Pass 2.
SUBSTRATE: DS-014 single PDP bound to nav (Decision 123 realized); F-38 eliminated; module gating on live tenants.features; FP-49 corrected two assumed columns (profiles.module_access / tenants.modules_enabled absent; audit_logs.profile_id confirmed).
```

---

## Residuals

R1 Executive persona · R2 Mobile server · **R3 per-user `module_access` not live (DS-027 schema — gating is
tenant-level `features` until then)** · R4 Clock service consolidation · R5 per-component attainment ·
R6 scale · R7 persona-scope hardening · R8 Warm/Hot · R9 R1 exit criteria. Plus the four surface phases
(2–5) as Pass 2.

---

*OB-207 Increment 2 Pass 1 (RBAC binding + FP-49) · 2026-06-14 · vialuce.ai*
