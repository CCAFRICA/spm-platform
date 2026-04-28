# OB-196 — Completion Report (in-flight)

**Substrate:** `CCAFRICA/spm-platform` `origin/main` HEAD (post-Phase-1.6.5 = `f6bea1a8`; post-Phase-1.7 = TBD)
**Branch:** `dev`
**Status:** IN FLIGHT — Phase 1.7 committing (F-005 platform-wide closure); Phase 2 remaining (E2 legacy engine arms in run-calculation.ts).

---

## Phase progression

| Phase | Status | Commit | PR |
|---|---|---|---|
| Phase 0 — Substrate sync + ADR | ✅ COMPLETE | `15fb3827` | merged via #345 |
| Phase 1 — E1 primitive registry | ✅ COMPLETE | `ec0eceb9` + `7058ac40` | merged via #345 |
| Phase 1.5 — Legacy alias elimination at import boundary | ✅ COMPLETE | `9ebc340e` | #345 (merged `5ee967c1`) |
| Phase 1.6 — Trial/GPV/landing dead-code sweep + L7 capture | ✅ COMPLETE | `7fa598f6` | merged via #346 |
| Phase 1.6.5 — Calc-side legacy disposition + demo-era wholesale sweep + FP-66 cleanup + disputes drop | ✅ COMPLETE | `f6bea1a8` | merged via #347 |
| Phase 1.7 — Validation + forensics + UI consumers + plan-management era-artifact wholesale + F-005 platform-wide closure | 🟡 COMMITTING | TBD (post-merge) | TBD |
| Phase 2 — E2 dispatch errors (legacy engine arms in run-calculation.ts) | ⏳ PENDING | — | — |
| Phase 3 — E4 round-trip closure | ⏳ PENDING | — | — |
| Phase 4 — E5 plan-agent comprehension flow | ⏳ PENDING | — | — |
| Phase 5 — E3 signal-surface migration | ⏳ PENDING | — | — |
| Phase 6 — E6 Korean Test verdict + negative tests | ⏳ PENDING | — | — |
| Phase 7 — Compliance gates | ⏳ PENDING | — | — |
| Phase 8 — Completion report finalization + final PR | ⏳ PENDING | — | — |

---

## L7 WIDENING FINDING

### Context

AUD-004 catalogued F-005 ("six locations declaring six different counts of primitives") and F-007 ("`tier_lookup` ↔ `tiered_lookup` divergence") at the dispatch-surface level. The audit's Section 2 enumerated five files: `intent-types.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts`, `intent-executor.ts`, `run-calculation.ts`. Limiting Factor L7 (AUD-004 v3 §6) explicitly named the risk that the audit's twelve findings would prove dispatch-surface-only and that downstream consumer surfaces might also reference the legacy vocabulary.

### Finding

During Phase 1.5 verification grep, the legacy-vocabulary footprint surfaced across ~75 hits in ~20+ files beyond AUD-004's twelve enumerated findings. Categorical breakdown:

**A. Type-union declarations (3 sites):**
- `web/src/types/compensation-plan.ts:55` — `ComponentType` union
- `web/src/lib/compensation/plan-interpreter.ts:40-43` — separate union (file deleted in Phase 1.6)
- `web/src/lib/compensation/ai-plan-interpreter.ts:46,63,75,82` — legacy interfaces retained transitionally

**B. plan-interpreter.ts heuristic detector (separate from ai-plan-interpreter.ts):**
- 20+ legacy emission lines across the file (285, 357, 359, 363, 402, 442, 526, 605, 1233, 1236, 1345, 1357, 1381, 1394, 1438, 1441, 1476, 1479, 1490, 1494)
- File DELETED in Phase 1.6 per architect Option (b) — structurally indefensible heuristic fallback emitting hardcoded skeleton bands/tiers/values regardless of document content (FP-66 pattern)

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

### Disposition

The audit-finding closure scope expanded to include consumer surfaces. F-005 platform-wide closure required five phases instead of one:

- **Phase 1.5 (committed `9ebc340e`, merged via PR #345)** — import boundary closure.
- **Phase 1.6 (this commit)** — Trial/GPV/landing dead-code sweep + L7 finding capture.
- **Phase 1.6.5 (next)** — calc-side legacy consumers (calculation-engine, intent-transformer, trajectory-engine).
- **Phase 1.7 (after 1.6.5)** — validation + forensics + UI consumers.
- **Phase 2 (after 1.7)** — legacy engine arms in run-calculation.ts.

The structural invariant closing F-005 platform-wide: zero hits across all of `web/src/` (excluding `__tests__`, `.md` files, `primitive-registry.ts`, and audit-trail comments) for the legacy primitive identifier strings.

### Implication for AUD-004 closure scope

AUD-004 v3 §2's audit-finding closure map must be read as necessary but not sufficient. The map identifies the dispatch-surface boundaries that close each finding; it does not identify the consumer surfaces that must align with those boundaries. Future audits should explicitly enumerate consumer surfaces alongside dispatch surfaces.

### Implication for future audits

Recommendation: future audit specifications include a Phase L7 step that, after the dispatch-surface inventory completes, runs a substrate-wide grep for every primitive identifier in the audit's vocabulary and enumerates every consumer file where the identifier appears. This converts the consumer-surface enumeration from a derived discovery into a planned audit phase.

### Phase Closure Evidence

Detailed phase-by-phase evidence is captured in the discrete artifact `docs/audits/AUD_004_L7_FINDING.md` (created in Phase 1.6 commit; updated in subsequent phases).

| Phase | Closure note |
|---|---|
| Phase 1.5 | F-005 closed at import boundary. Plan-agent prompt teaches AI to emit foundational identifiers directly. Importer accepts foundational only. Commit `9ebc340e`, PR #345 merged. |
| Phase 1.6 | Trial/GPV/landing cluster deleted (~4,500+ lines, 6 directories). Cluster surfaces F-005-clean. Calc-side, validation, forensics, UI deferred to subsequent phases. Commit `7fa598f6`, PR #346 merged. |
| Phase 1.6.5 | Calc-side wholesale: calculation-engine.ts (801 lines) + intent-resolver.ts (119 lines) deleted; intent-transformer legacy arms stripped; trajectory-engine refactored to read-only metadata.intent projection (Decision 151). Demo-era cluster wholesale sweep: transactions/* pages, performance/scenarios, design/modeling re-export, insights/disputes, investigate/disputes, components/disputes/* (7 files), api/disputes/* (3 routes), lib/disputes/, lib/scenarios/, lib/demo/ (8 files, ~2,969 lines), components/demo/ (4 plumbing components post-PersonaSwitcher carve-out), app/admin/demo, app/operate/normalization, lib/normalization/flywheel-verification, data/tenants/retailco/ (4 fixtures), resolution-agent.ts, types/dispute.ts, RecentTransactionsCard, SavedScenariosList, lib/reconciliation/reconciliation-bridge.ts (1,034-line orphan). Q-S1 carve-out: components/demo/DemoPersonaSwitcher.tsx → components/persona/PersonaSwitcher.tsx (production component move + rename). Service-layer FP-66 cleanup: payout-service (DEMO_EMPLOYEES + DEMO_BATCHES stripped), rbac-service (getDefaultAssignments + getDefaultAuditLogs stripped), search-service (4-user array stripped), workforce/permissions (DEMO_USERS stripped), alerts-service / quarantine-service / plan-approval-service (retailco demo blocks stripped), data/tenants/index.json (retailco entry removed), lib/storage/tenant-registry-service (retailco removed from STATIC_TENANT_IDS), app/configuration / app/operations/audits/logins (demo user/login records stripped). Navigation surfaces refactored: Sidebar (transactions parent + scenario modeling child + ICM_ONLY_HREFS), CommandPalette, QuickActionsCard, PayoutEmployeeTable, global-search, enhanced import page, notification-service (3 dispute helper functions removed), payouts/[id] (dispute warning block stripped), help-service (deletion-set relatedRoutes), acceleration-hints, access-control (4 union members + ROUTE_TO_MODULE entries + MODULE_ACCESS roles), page-status (deletion-set entries), role-permissions. my-compensation refactored (dispute imports + state + handler + UI block + RecentTransactionsCard stripped). Disputes Supabase table drop migration written (`web/supabase/migrations/20260428_aud_004_drop_disputes_table.sql`); architect applies via Supabase SQL Editor (Standing Rule 7) post-merge. F-005 calc-read path closed. tsc clean. Lint clean. |
| Phase 1.7 | F-005 platform-wide closure. 8 mechanical vocabulary refactors + 3 architect-disposed shape-coupled refactors (metric-resolver, employee-reconciliation-trace, enhanced/page) + plan-management cluster wholesale (LIST/DETAIL/4 editors/PlanReferenceCard/Scenario* orphans/design shims) + plan-management cleanup cascade (10 surfaces) + type union narrowed to foundational identifiers + PlanComponent stripped of legacy optional fields + ai-plan-interpreter transitionally-retained interfaces deleted. Orphan deletes: plan-anomaly-registry.ts (987 lines, zero consumers), PlanValidation + plan-validation page (era-artifact downstream of plan-management). Final F-005 closure invariant grep returns zero hits outside exempt categories (only 2 audit-trail comments remain). LegacyShapedPlanComponent transitional type added for Phase 2 callers (run-calculation.ts legacy switch arms + api/calculation/run band-normalization). |
| Phase 2 | [populated when commits] |
