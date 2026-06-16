# OB-213 — Phase 0: Architecture Decision Gate + Schema Verification

**Branch:** `ob213-capability-nav-recovery` · **Date:** 2026-06-15 · **Author:** CC
**Method:** 0A sequence check + 0C schema check (tsx) + 6-agent parallel fan-out (0B nav infra, 0D page inventory, 0E×4 MIR-critical pipelines).

> **Headline:** No HALT-ADG (the nav type already models four agents). One hard schema HALT (`disputes` table is missing). The directive's MIR-critical premises were largely **stale** — the real states are corrected below. Three of the four MIR-critical pages need *less* than the directive assumed; one (Adjustments) needs a table re-created, not an in-memory rewrite.

---

## 1. Config shape + registration mechanism (0B)

- **Type (already four-agent capable):** `type WorkspaceId = 'decide' | 'calculate' | 'finance' | 'platform-core'` → `Workspace { id, sections: WorkspaceSection[], featureFlag? }` → `WorkspaceSection { routes: WorkspaceRoute[], featureFlag? }` → `WorkspaceRoute { path, requiredCapability?, roles[] }` (`types/navigation.ts:23-55`). The four agents map: `platform-core`=Platform Core, `calculate`=Calculation, `decide`=**Performance** (internal id is `decide`), `finance`=Finance.
- **Registration:** explicit declaration in the `WORKSPACES` object (`config/workspace-config.ts:27-180`). No auto-discovery — **orphaned pages are unreachable purely because they aren't listed in `WORKSPACES`.** Wiring N pages = adding their paths under sections.
- **Route guard / bounce:** `middleware.ts:348-369` redirects to `/unauthorized` when a restricted path's capability isn't held; `navigation-context.tsx:146-159` redirects when the current route belongs to an inaccessible workspace. Unregistered paths fall through to the default workspace — the orphan symptom.
- **`HALT-ADG`: NOT triggered.** No type change needed — only config data + capability/role assignments.

## 2. Feature gating (0B)

- Workspace-level: `Workspace.featureFlag` (finance = `'financial'`); `ChromeSidebar` hides a workspace unless `tenants.features[flag] === true` (`ChromeSidebar.tsx:170-172`). Section-level gate also available (`workspace-config.ts:228-232`). Finance gating is ready; Performance stays ungated per §6.

## 3. Per-MIR-critical pipeline status (0E + 0C) — corrected vs directive

| Page | Directive said | **Live reality** | Status |
|---|---|---|---|
| **Adjustments 🔴** | writes to in-memory Map; `disputes` exists (16 cols) | page is **already wired to Supabase `disputes`** (select 14 cols + tenant_id; insert/update) — but **`disputes` table is MISSING** (dropped AUD-004) | **HALT-SCHEMA** — re-create table (DDL authored); page code OK. Minor: approve/reject omits `resolved_by`. |
| **Approvals 🟠** | in-memory cache; no `approval_requests` table | **two systems**: page is wired to the **dead** in-memory `approval-routing/approval-service.ts` (empty cache); a **live** Supabase path exists (`approval_requests` table EXISTS + `calculation_batches.lifecycle_state` PENDING_APPROVAL/APPROVED/REJECTED) | **DECISION** — re-wire page to the live path; **recommend Option B** (lifecycle_state, no new table, single source of truth) + delete dead `approval-routing` service. No schema HALT. |
| **Statements 🟠** | 28 queries, verify they resolve | **9 queries across 5 tables (entities, periods, calculation_batches, calculation_results, committed_data) — all valid**; entity scoping correct (persona-context, SR-39 read-layer denial) | **GOOD** — nav-wire + render/data EPG only. |
| **Audit 🟠** | may need table creation; 0 rows | `audit_logs` **EXISTS** (5 rows, RLS) but **column-mismatched** (UI expects `entityType/entityId/userName`; table has `resource_type/resource_id/profile_id`) and **audit-service is in-memory only** (9 emit sites → memory, 0 DB inserts) | **No schema HALT.** Phase-3A work: add `POST /api/audit` insert + read page from DB + map columns (AUD-009 class fix). |

## 4. Corrected schema reality (0C)

`disputes` **MISSING** · `approval_requests` EXISTS (0 rows) · `audit_logs` EXISTS (5 rows, cols `action, changes, profile_id, resource_type, resource_id, ip_address, metadata, tenant_id, created_at, id`) · `calculation_results` 943 · `entity_period_outcomes` 883 · `calculation_batches` 20 · `reconciliation_sessions` 2 · `classification_signals` 2461 · `calculation_traces` 0.

## 5. Page inventory (0D)

All 26 KEEP pages exist **except "Data Console"** (no matching route/dir). The three `/data/*` pages (quality, reports, transactions) exist. **Disposition needed:** is "Data Console" an alias for an existing `/data` page, or a genuine gap (→ PLANNED/DISCARD)? Not MIR-critical; not a Phase-0 blocker.

## 6. Proposed file changes (no implementation yet)

- **Phase 1 (keystone):** `config/workspace-config.ts` — register all 26 KEEP pages + existing pages under the four agents; capability/role/featureFlag per route.
- **Phase 2A:** apply `20260616120000_ob213_disputes.sql` (architect) → verify → fix `resolved_by` capture in `/performance/adjustments/page.tsx`.
- **Phase 2B:** re-wire `/approvals/page.tsx` to the governance/lifecycle path (Option B); remove dead `lib/approval-routing/approval-service.ts`.
- **Phase 2C/2D:** Statements + Pay — nav + render/data EPG (queries already valid).
- **Phase 3A:** Audit — `POST /api/audit` route + audit-service → DB insert + page reads `audit_logs` + column mapping.
- **Phases 3B–6:** remaining Platform Core / Performance / Finance slices + ABSORB; **Phase 7** DISCARD + verify.

---

## 7. HALT list for architect disposition (Phase 1 gated on this)

1. **HALT-SCHEMA (disputes) — REQUIRES ARCHITECT.** Apply `web/supabase/migrations/20260616120000_ob213_disputes.sql` in the Supabase SQL Editor (16 cols matching the page + tenant-isolation RLS). CC then verifies via tsx and proceeds to 2A.
2. **DECISION (approvals).** Ratify **Option B** (consolidate on `calculation_batches.lifecycle_state`; `approval_requests` stays as-is or is deprecated) and the removal of the dead `approval-routing` service. (CC's recommendation per §2B "pick the structurally simpler"; flagging because it deletes code.)
3. **DISPOSITION (Data Console).** Confirm alias-to-existing-`/data`-page vs PLANNED/DISCARD.

**No HALT-ADG, no HALT-SCHEMA-APPROVAL (table exists), no HALT-SCHEMA-AUDIT (table exists).**
