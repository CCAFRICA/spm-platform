# AUD-004 L7 Finding — Audit Consumer-Surface Widening

**Discovery date:** 2026-04-28 (during OB-196 Phase 1.5 verification grep)
**Originating audit:** AUD-004 (Phase 0 + Phase 0G)
**Limiting factor cited:** L7 (AUD-004 v3 §6)
**Closure work item:** OB-196 Phases 1.5, 1.6, 1.6.5, 1.7, 2
**Status:** OPEN (closes when Phase 1.7 verification grep returns zero hits platform-wide)

---

## Summary

AUD-004 catalogued F-005 ("six locations declaring six different counts of primitives") and F-007 ("`tier_lookup` ↔ `tiered_lookup` divergence") at the dispatch-surface level. The audit's §2 enumerated five files: `intent-types.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts`, `intent-executor.ts`, `run-calculation.ts`.

During OB-196 Phase 1.5 verification grep, the legacy-vocabulary footprint surfaced across ~75 hits in ~20+ files in consumer surfaces beyond the audit's twelve findings. F-005 platform-wide closure required four phases rather than one. This finding documents the discovery and the closure trajectory.

---

## Context

AUD-004 catalogued F-005 ("six locations declaring six different counts of primitives") and F-007 ("`tier_lookup` ↔ `tiered_lookup` divergence") at the dispatch-surface level. The audit's Section 2 enumerated five files: `intent-types.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts`, `intent-executor.ts`, `run-calculation.ts`. Limiting Factor L7 (AUD-004 v3 §6) explicitly named the risk that the audit's twelve findings would prove dispatch-surface-only and that downstream consumer surfaces might also reference the legacy vocabulary.

---

## Finding

During Phase 1.5 verification grep, the legacy-vocabulary footprint surfaced across ~75 hits in ~20+ files beyond AUD-004's twelve enumerated findings. Categorical breakdown:

**A. Type-union declarations (3 sites):**
- `web/src/types/compensation-plan.ts:55` — `ComponentType` union
- `web/src/lib/compensation/plan-interpreter.ts:40-43` — separate union (file deleted in Phase 1.6)
- `web/src/lib/compensation/ai-plan-interpreter.ts:46,63,75,82` — legacy interfaces retained transitionally

**B. plan-interpreter.ts heuristic detector (separate from ai-plan-interpreter.ts):**
- Lines 285, 357, 359, 363, 402, 442, 526, 605, 1233, 1236, 1345, 1357, 1381, 1394, 1438, 1441, 1476, 1479, 1490, 1494
- File DELETED in Phase 1.6 per architect Option (b) — structurally indefensible heuristic fallback emitting hardcoded skeleton bands/tiers/values regardless of document content (FP-66 pattern: seeding instead of importing)

**C. Calc-side consumers (Phase 1.6.5):**
- `web/src/lib/compensation/calculation-engine.ts` (lines 257-562)
- `web/src/lib/calculation/intent-transformer.ts` (lines 47-72)
- `web/src/lib/intelligence/trajectory-engine.ts` (lines 122-255)
- `web/src/lib/compensation/frmx-server-plan.ts` — DELETED in Phase 1.6 (zero consumers, FP-66 skeleton)

**D. Validation/forensics/orchestration (Phase 1.7):**
- `web/src/lib/validation/plan-anomaly-registry.ts` (~30 hits)
- `web/src/lib/forensics/trace-builder.ts` (4 hits)
- `web/src/lib/reconciliation/employee-reconciliation-trace.ts` (3 hits)
- `web/src/lib/calculation/results-formatter.ts:520`
- `web/src/lib/orchestration/metric-resolver.ts:164`

**E. UI consumers (Phase 1.7):**
- `perform/statements`, `performance/plans/[id]`, `data/import/enhanced`, `investigate/trace`
- `components/forensics/PlanValidation`, `components/compensation/CalculationBreakdown`, `LookupTableVisualization`, `ScenarioBuilder`
- `components/results/NarrativeSpine`

**F. Legacy engine (Phase 2):**
- `web/src/lib/calculation/run-calculation.ts:362-408`

---

## Disposition

The audit-finding closure scope expanded to include consumer surfaces. F-005 platform-wide closure required five phases instead of one:

- **Phase 1.5** — import boundary closure (committed `9ebc340e`, merged via PR #345).
- **Phase 1.6** — Trial/GPV/landing dead-code sweep (cluster surfaces).
- **Phase 1.6.5** — calc-side legacy consumers (calculation-engine, intent-transformer, trajectory-engine).
- **Phase 1.7** — validation + forensics + UI consumers.
- **Phase 2** — legacy engine arms in run-calculation.ts.

The structural invariant closing F-005 platform-wide: zero hits across all of `web/src/` (excluding `__tests__`, `.md` files, `primitive-registry.ts`, and audit-trail comments) for the legacy primitive identifier strings.

---

## Implication for AUD-004 closure scope

AUD-004 v3 §2's audit-finding closure map must be read as necessary but not sufficient. The map identifies the dispatch-surface boundaries that close each finding; it does not identify the consumer surfaces that must align with those boundaries. Future audits should explicitly enumerate consumer surfaces alongside dispatch surfaces.

---

## Implication for future audits

Recommendation: future audit specifications include a Phase L7 step that, after the dispatch-surface inventory completes, runs a substrate-wide grep for every primitive identifier in the audit's vocabulary and enumerates every consumer file where the identifier appears. This converts the consumer-surface enumeration from a derived discovery into a planned audit phase.

---

## Phase Closure Evidence

### Phase 1.5 (boundary closure)
- **Commit:** `9ebc340e`
- **PR:** https://github.com/CCAFRICA/spm-platform/pull/345 (merged)
- **Files:** `ai-plan-interpreter.ts` (importer refactor), `anthropic-adapter.ts` (MAPPING RULES deleted), `ob196-phase15-premigration-query.ts` (audit trail)
- **Closure:** F-005 closed at the import boundary. Plan-agent prompt teaches AI to emit foundational identifiers directly. Importer accepts foundational only.

### Phase 1.6 (Trial/GPV/landing dead-code sweep + L7 capture)
- **Commit:** [populated at commit time]
- **PR:** [populated at PR creation]
- **Deletions (~4,500+ lines, 6 directories):**
  - `GPVWizard.tsx` (792 lines)
  - `plan-interpreter.ts` (1521 lines, structurally indefensible heuristic per Option b)
  - `customer-launch-flow.ts` (919 lines, zero consumers)
  - `frmx-server-plan.ts` (267 lines, zero consumers, FP-66 skeleton)
  - `/api/interpret-plan/route.ts` (180 lines)
  - `/api/gpv/route.ts` (110 lines)
  - `useGPV.ts` (78 lines)
  - `useTrialStatus.ts` (42 lines)
  - `lib/trial.ts` (77 lines)
  - `TrialBadge.tsx` (31 lines, dead orphan)
  - `TrialGate.tsx` (69 lines)
  - `landing/page.tsx` + `layout.tsx` (414 lines)
  - Directories swept: `components/gpv`, `lib/launch`, `api/interpret-plan`, `api/gpv`, `components/trial`, `app/landing`
- **Refactors:** `page.tsx`, `middleware.ts`, `AdminDashboard.tsx`, `FeatureFlagsTab.tsx`, `milestones.ts`, `signup` route (cluster trial block only), `auth/callback` (gpv block only — `billing.*` PRESERVED), `signup` page (marketing copy), `/api/platform/flags` (SAFE_DEFAULTS), `compensation/index.ts` (barrel re-export removal)
- **Preserved (separate concern, Stripe billing infrastructure):**
  - `tenant.settings.billing.*` fields
  - `/api/billing/webhook` `trial_end` handling
  - `events/emitter` `billing.trial_*` event vocabulary
- **Closure:** Cluster surfaces F-005-clean. Calc-side, validation, forensics, UI deferred to subsequent phases.

### Phase 1.6.5 (calc-side legacy disposition + demo-era wholesale sweep + service-layer FP-66 cleanup + disputes infrastructure removal)
- **Commit:** [populated post-merge with merge SHA]
- **PR:** [populated at PR creation]
- **Per-engine dispositions applied:**
  - `web/src/lib/compensation/calculation-engine.ts` (801 lines, demo-era parallel-authority artifact): **DELETED** — disposition (a)
  - `web/src/lib/calculation/intent-resolver.ts` (119 lines, dead orphan): **DELETED**
  - `web/src/lib/calculation/intent-transformer.ts`: **REFACTORED** — legacy case arms (`tier_lookup`, `matrix_lookup`, `percentage`, `conditional_percentage`) deleted; transformTierLookup/transformMatrixLookup/transformPercentage/transformConditionalPercentage internal functions removed; foundational + default arms persist
  - `web/src/lib/intelligence/trajectory-engine.ts`: **REFACTORED** — read-only projection per Decision 151. Reads `metadata.intent` foundational shape (`bounded_lookup_1d`, `bounded_lookup_2d`); does NOT re-evaluate primitives, does NOT compute payouts, does NOT mirror primitive evaluation results. computeTierTrajectory/computeMatrixTrajectory replaced with projectBoundedLookup1D/projectBoundedLookup2D.
  - `web/src/lib/agents/resolution-agent.ts`: **DELETED** — dispute-specific (sole consumer was deleted disputes/investigate API). Shared synaptic infrastructure (synaptic-density, synaptic-surface, synaptic-types, agent-memory, signal-persistence) PRESERVED — multi-consumer non-dispute infrastructure.
- **Demo-era wholesale sweep:**
  - **Cluster pages deleted:** `app/transactions/` (8 pages including [id], [id]/dispute, disputes, disputes/[id], inquiries, find, orders), `app/performance/scenarios/page.tsx`, `app/design/modeling/page.tsx`, `app/insights/disputes/page.tsx`, `app/investigate/disputes/page.tsx`, `app/perform/transactions/page.tsx`, `app/perform/inquiries/page.tsx`, `app/investigate/transactions/page.tsx`
  - **Disputes implementation deleted:** `components/disputes/` (7 components + barrel), `app/api/disputes/` (3 routes), `lib/disputes/dispute-service.ts` + dir
  - **Scenarios deleted:** `lib/scenarios/scenario-service.ts` + dir, `components/compensation/SavedScenariosList.tsx`
  - **Demo plumbing deleted:** `lib/demo/` wholesale (8 files, ~2,969 lines), `components/demo/` (4 plumbing components post-PersonaSwitcher carve-out), `app/admin/demo/page.tsx`, `app/operate/normalization/page.tsx`, `lib/normalization/flywheel-verification.ts` (orphan verification test), `data/tenants/retailco/` (4 fixtures)
  - **Other deletions:** `components/compensation/RecentTransactionsCard.tsx`, `types/dispute.ts`, `lib/reconciliation/reconciliation-bridge.ts` (1,034-line orphan parallel-implementation, zero consumers)
- **Q-S1 carve-out (production component artifacted in demo dir):**
  - `components/demo/DemoPersonaSwitcher.tsx` → `components/persona/PersonaSwitcher.tsx` (move + rename); auth-shell + persona-context comment updated
- **Service-layer FP-66 cleanup (demo-id contamination stripped):**
  - `lib/payout-service.ts` — DEMO_EMPLOYEES + DEMO_BATCHES blocks removed; getAllBatches() returns empty array
  - `lib/rbac/rbac-service.ts` — getDefaultAssignments + getDefaultAuditLogs bodies stripped to empty arrays
  - `lib/search/search-service.ts` — 4-user demo array stripped from searchUsers()
  - `app/workforce/permissions/page.tsx` — DEMO_USERS const stripped; handleAssignRole stubbed
  - `lib/alerts/alert-service.ts` — getDefaultAlertRules() stripped (4 retailco demo alerts)
  - `lib/data-quality/quarantine-service.ts` — getDefaultQuarantineItems() stripped (5 retailco demo entries)
  - `lib/plan-approval/plan-approval-service.ts` — getDefaultApprovalRequests() stripped (3 retailco demo requests)
  - `data/tenants/index.json` — retailco tenant entry removed (3 tenants remain)
  - `lib/storage/tenant-registry-service.ts` — STATIC_TENANT_IDS removed retailco
  - `app/configuration/page.tsx` — personnel mock array stripped
  - `app/operations/audits/logins/page.tsx` — mockLoginAudits + techCorpLoginAudits stripped
- **Navigation/permission refactor:**
  - `Sidebar.tsx` — transactions parent block + 4 children deleted, scenario modeling child deleted, ICM_ONLY_HREFS retailco entry removed, Receipt + transactionTerm imports stripped
  - `CommandPalette.tsx` — transactions command entry removed, Receipt import stripped
  - `QuickActionsCard.tsx` — Report an Issue + My Disputes entries stripped, pendingDisputes prop removed
  - `PayoutEmployeeTable.tsx` — view-transactions action column stripped
  - `global-search.tsx` — transactions search results stripped
  - `enhanced/page.tsx` — View Transactions completion-screen card stripped
  - `notification-service.ts` — 3 dispute notification helpers removed (notifyDisputeResolved, notifyDisputeSubmitted, notifyManagerNewDispute)
  - `payouts/[id]/page.tsx` — pending-dispute warning block stripped
  - `help-service.ts` — deletion-set relatedRoutes emptied
  - `acceleration-hints.ts` — /perform/transactions + /design/modeling hints removed
  - `access-control.ts` — 4 AppModule union members stripped (transactions, disputes, dispute_queue, scenarios), ROUTE_TO_MODULE entries removed, MODULE_ACCESS role allowlists cleaned
  - `page-status.ts` — deletion-set entries removed
  - `role-permissions.ts` — `/transactions` permission removed
  - `compensation/index.ts` — calculation-engine barrel re-export removed
  - `reconciliation/index.ts` — reconciliation-bridge barrel re-export stripped
  - `approval-routing/approval-service.ts` — foundation-demo-data import + getSeededApprovalRequests usage removed
- **My-compensation refactor (Q-MyComp):** dispute imports (L47-48), pendingDisputes/showDisputeForm/disputeComponent/disputeReason/disputeSubmitted state, handleSubmitDispute function, dispute form JSX block, RecentTransactionsCard import + JSX all stripped. Earnings, components, AI narrative, waterfall, calculation results all preserved.
- **Disputes Supabase table drop:** Migration `web/supabase/migrations/20260428_aud_004_drop_disputes_table.sql` written. Pre-migration verification: `disputes_row_count = 0`, audit_log dispute references = null, FK fan-in = zero. Architect applies via Supabase SQL Editor (Standing Rule 7) post-merge.
- **Preserved (separate concern):** Stripe billing infrastructure (`auth/callback` `billing.trial_start`, `api/billing/webhook` `trial_end`, `events/emitter` `billing.trial_*`); shared synaptic + agent-memory + signal-persistence + reconciliation-agent + insight-agent + anomaly-detector infrastructure (multi-consumer, no demo coupling).
- **Closure:** F-005 calc-read path closed. Trajectory engine projection-only per Decision 151. Validation/forensics/UI consumers carrying legacy primitive vocabulary deferred to Phase 1.7 per the established phasing.
- **Compliance:** tsc clean (`npx tsc --noEmit` exit 0). Lint clean (`npx next lint` zero errors; pre-existing warnings on files Phase 1.6.5 didn't touch).

### Phase 1.7 (validation + forensics + UI consumers)
[To be populated when Phase 1.7 commits — must include final platform-wide-zero-hit grep]

### Phase 2 (legacy engine arms)
[To be populated when Phase 2 commits]

---

## Closure marker

[FINDING CLOSED YYYY-MM-DD — Phase 1.7 verification grep returned zero hits across `web/src/`. F-005 platform-wide closure invariant holds.]
