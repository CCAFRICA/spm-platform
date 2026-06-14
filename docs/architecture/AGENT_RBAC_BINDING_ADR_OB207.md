# Agent-RBAC Binding ADR — OB-207 Increment 2

**Date:** 2026-06-14 · **Governing:** DS-014 (single PDP), DS-019 (identity chain), Decision 123
**Builds on:** OB-207 Increment 1 (the agent-nav spine)

---

## DECISION

The agent-nav spine derives workspace access from the **DS-014 single PDP** (`permissions.ts` →
`hasCapability`) + tenant module features — **not a parallel role list**.

```
Platform Core (foundation) = platform.* + tenant.* capabilities + tenant module enablement (DS-019 chain).
Calculate                  = data.import / data.calculate / data.advance_lifecycle (engine ops; admin/platform).
Decide                     = view.intelligence_stream / view.*_results (every persona; module-scoped).
Consolidate                = data.reconcile / data.export (admin) + Financial views (tenant feature `financial`).

WORKSPACE ACCESS = "the role can access ≥1 route in the workspace" — computed from each route's
  requiredCapability via hasCapability (the single PDP) — AND, for module-bound sections, the tenant
  feature is enabled. ROLE_WORKSPACE_ACCESS (Increment 1's parallel role→workspace map) is RETIRED as a
  source; canAccessWorkspace / getAccessibleWorkspaces now delegate to the capability-derived route filter.
```

## FP-49 schema correction (live, this session)

| Assumed (directive) | Live reality |
|---|---|
| `profiles.module_access` (JSONB) | **does not exist** |
| `tenants.modules_enabled` | **does not exist** |
| — | **`tenants.features`** (JSONB: `compensation`, `salesFinance`, `financial`, …) is the live module field |
| `audit_logs.actor_id` | **`audit_logs.profile_id`** (confirmed) |

**Disposition (HALT-3 → "gate on what exists"):** module gating uses **`tenants.features`** (tenant-level).
**Per-user** `module_access` (DS-014 §9.1) is **not live** → access is role-capability + tenant-feature
gated; per-user module scoping is a documented residual (R3, DS-027 schema territory). No invented column.

## RATIONALE

- **DS-014 §3.2 one-source-of-truth:** eliminates the F-38 role-vocabulary-divergence class — the nav no
  longer keeps its own role→workspace list that can drift from the capability matrix.
- **Decision 123 (transparent compliance):** the sidebar a user sees IS their capability set rendered.
- The per-route `requiredCapability` already in `WORKSPACES` (Increment 1) + `hasCapability` is the
  binding seam — no third access list, no new PDP (HALT-1 not triggered; the PDP is live).

## REJECTED

- Keeping `ROLE_WORKSPACE_ACCESS` as an independent role→workspace map (a second source that drifts — F-38).
- Inventing a `module_access` column to match the directive's assumption (FP-49 forbids; gate on the live field).

---

*OB-207 Increment 2 Phase 1 ADR · 2026-06-14 · vialuce.ai*
