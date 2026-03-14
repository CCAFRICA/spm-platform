# OB-168 Architecture Decision Record

## Problem
Access control is fragmented across 3 systems (middleware RESTRICTED_WORKSPACES, RequireRole HOC, role-permissions.ts) using hardcoded role arrays. Adding a new role or changing permissions requires updating 3+ files. Storage RLS policies reference stale role names (`vl_admin`). The `ingestion-raw` bucket has zero policies, blocking plan import for tenant admins.

## Option A: Patch individual routes + add storage policies
Fix each blocked route individually. Add ingestion-raw policies. Keep RESTRICTED_WORKSPACES and RequireRole.
- Scale test: Works at 10x? Yes (no performance impact)
- AI-first: Any hardcoding? **YES — every route fix adds hardcoded role arrays**
- Transport: N/A
- Atomicity: Partial — fixing routes one at a time leaves gaps (FP-69)

## Option B: Unified capability matrix (permissions.ts as single source)
Create one `permissions.ts` that maps roles → capabilities. Replace middleware, RequireRole, and role-permissions.ts with capability checks against the same source. Fix storage policies to use role-agnostic patterns.
- Scale test: Works at 10x? Yes — O(1) lookup per request
- AI-first: Any hardcoding? **No — roles map to capabilities, code checks capabilities**
- Transport: N/A
- Atomicity: Yes — single source means all enforcement layers agree

## Option C: Move all access control to Supabase RLS
Use Postgres RLS for everything including page access. Client queries a `user_permissions` view.
- Scale test: Works at 10x? Yes
- AI-first: Any hardcoding? No
- Transport: N/A
- Atomicity: Clean — DB is source of truth
- **Problem:** Page routing decisions happen in middleware before DB queries. Would require preloading all permissions per request.

## CHOSEN: Option B because it eliminates the triple-redundancy (middleware/HOC/config), uses a single source of truth, and fixes the root cause (fragmented role arrays). Capability-based checking is role-name-agnostic — adding role aliases or new roles requires ONE file change.

## REJECTED: Option A because it repeats FP-69 (fix one, leave others). Option C because middleware routing decisions need synchronous checks that can't depend on DB queries.

## Governing Principles Evaluation
- G1: SOC2 / RBAC standard — single authorization matrix is auditable. Fragmented role arrays are not.
- G2: Architecture structurally guarantees that all four enforcement layers (middleware, component, API, navigation) read from the same capability set.
- G3: An auditor can verify: "role=admin has capability data.import, therefore middleware allows /operate/import."
- G4: RBAC literature (Sandhu et al., 1996) — role-permission mapping as a matrix, not distributed conditionals.
- G5: Capability-based access control applies to any domain. Not compensation-specific.
