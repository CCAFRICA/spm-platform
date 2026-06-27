# DIAG-077 — Platform-Wide Data Visibility and Menu Function: Spatial Map

## Date
2026-06-26

## Main HEAD SHA
**`9cda286b`** (`Merge pull request #599 from CCAFRICA/hf-342-vialuce-logo-lockup-font-parity`) — confirmed `git rev-parse main` = `9cda286b`, and `git merge-base --is-ancestor` proves **none** of the abandoned HF-343 commits (`50c2e20b`/`58317967`/`59054360`/`b4c53a09`/`59e58449`/`c4add0d5`) are ancestors of main. The revert held; main is the clean pre-HF-343 state. (HALT-B note: the working session was parked on branch `hf-341-mir-reconciliation` @ `9757ab42`; this DIAG was performed against `main` @ `9cda286b` per the directive, and `hf-341` is NOT on main.)

> **Discipline note (SEARCH-BEFORE-UNKNOWN):** there is NO standalone `DS-014` specification file in `docs/` (verified — `DS-014` appears only as a *reference* inside directives/ADRs; the `§4.4`/`§8.2` matches in `docs/design-specifications/` belong to unrelated specs DS-027/DS-022). The **operative DS-014 §4 capability matrix is encoded in `web/src/lib/auth/permissions.ts` `ROLE_CAPABILITIES`** (Decision 123 — access control emerges from architecture). The gap analysis (§5) therefore measures each surface against the *code-encoded* matrix, and states that provenance rather than citing a doc that does not exist.

> **PG-2 evidence:** `find web/src/app -name "page.tsx" | wc -l` → **129**. All 129 are classified in §1 (grouped by workspace). Every `page.tsx` appears in exactly one §1 sub-table.

---

## 1. ROUTE AND PAGE INVENTORY

129 `page.tsx` files, grouped by workspace. **Stub** = a render-time `redirect()`/`router.replace()` to another route, or a placeholder/mock shell (data functions = "—"). **Re-export** (`export { default } from …`) is NOT a stub — the URL stays put and the imported component renders inline (real data). Heavy eliminated-workspace stub ratio: the entire `/investigate/*`, most of `/govern/*` and `/design/*`, and many legacy `/configure*`/`/data*` routes hard-redirect (OB-97/OB-213 workspace consolidation). **Scope-sensitive** = renders per-entity payout/performance/intelligence data that *should* differ by role.


### §3.1 Route/Page Inventory — Group: Intelligence (/stream, /insights/*, /acceleration)

Verified on `main @ 9cda286b`. `ALL_INSIGHTS_SCOPE` is defined at `web/src/lib/insights/periods.ts:15-20` as `{ visibleEntityIds: [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'all' }` — comment line 14: *"getEntityResults treats empty visibleEntityIds as admin/all"* → every page passing it renders the **full tenant population, NOT role-scoped**. No page in this group is a stub (none `redirect()`/`router.replace()` to another route; all render real data or honest empty states — `router.push` calls are button click-handlers, not render-time redirects).

| Route | Page file | Data type rendered | Stub? | Data functions called (file) | Scope-sensitive? |
|---|---|---|---|---|---|
| `/stream` | `web/src/app/stream/page.tsx` | intelligence elements / compensation $ / entity results (+ financial branch) | NO | Branch router: `loadIntelligenceStream` (`@/lib/data/intelligence-stream-loader`, passes persona+`scope.entityIds`+`scope.canSeeAll` — l.178-181), `getStateReader` (`@/lib/intelligence/state-reader`), `loadNetworkPulseData` (`@/lib/financial/financial-data-service`). ICM numbers (clean read): `getCalculatedPeriods`/`getPeriodTotal`/`getBatchValidity`/`getComponentTotals`/`getPopulationTrend` (`@/lib/insights`), **`getEntityResults`** (`@/lib/drill-through`) — **`ALL_INSIGHTS_SCOPE`** (l.546, l.548), `recallDensity` (`@/lib/learning/density-recall`); `DrillThroughPanel` scope=`ALL_SCOPE` (`scopeType:'all'`, l.88) | **YES** — ICM payout totals/standings via `ALL_INSIGHTS_SCOPE` (full tenant). Financial branch `FinancialStream` = YES (Financial — separate scope). Note: legacy loader IS persona/scope-aware but only drives narrative+branch routing, not the rendered numbers |
| `/insights` | `web/src/app/insights/page.tsx` | compensation $ / entity results (Overview) | NO | `getCalculatedPeriods`, `getComponentTotals` (`@/lib/insights`); **`getEntityResults`** (`@/lib/drill-through`) — **`ALL_INSIGHTS_SCOPE`** (l.86) | **YES** — period total, top performers, distribution via `ALL_INSIGHTS_SCOPE` (full tenant, not role-scoped) |
| `/insights/my-team` | `web/src/app/insights/my-team/page.tsx` | team sales / entity results | NO | Hospitality branch: `getCheques`/`getMeseros`/`getFranquicias`/`getSalesByMesero`/`getSalesByFranquicia` (`@/lib/restaurant-service`). Non-hosp branch: **`resolveEntityScope(user?.id)`** + `getPeriodsWithResults` (`@/lib/drill-through`) → `DrillThroughPanel` with `teamScope` | **YES** — and **the ONLY page in this group that passes a REAL user/role scope** (`resolveEntityScope(user?.id)`→`teamScope`, l.76,190-197), not `ALL_INSIGHTS_SCOPE`. Hospitality branch = YES (Financial — separate scope) |
| `/insights/compensation` | `web/src/app/insights/compensation/page.tsx` | compensation $ / entity results / dimension pivot | NO | Hospitality: `getCheques`/`getMeseros`/`getFranquicias` (`@/lib/restaurant-service`). ICM: `getCalculatedPeriods`/`getPeriodTotal`/`getComponentTotals`/`getDimensions`/`aggregateByDimension`/`getPopulationTrend` (`@/lib/insights`); **`getEntityResults`** (`@/lib/drill-through`) — **`ALL_INSIGHTS_SCOPE`** (l.181); `EntityTable` (`@/components/insights`) | **YES** — money lens (total/avg/dist/per-entity) via `ALL_INSIGHTS_SCOPE` (full tenant). Hospitality branch = YES (Financial — separate scope) |
| `/insights/trends` | `web/src/app/insights/trends/page.tsx` | entity results / trajectory (temporal) | NO | `getCalculatedPeriods`, `getPopulationTrend`, `getEntityTrajectory`, `getComponentTotals` (`@/lib/insights`) — **no `getEntityResults`, no scope param** (these fns are tenant-wide, no scope arg accepted) | **YES** — population trend + per-entity velocity/trajectory = full tenant (not role-scoped) |
| `/insights/performance` | `web/src/app/insights/performance/page.tsx` | entity results / standings (Attainment) | NO | Hospitality: `getCheques`/`getFranquicias`/`getFinancialSummary`/`getSalesByFranquicia` (`@/lib/restaurant-service`). ICM: `getCalculatedPeriods`/`getEntityTrajectory` (`@/lib/insights`); **`getEntityResults`** (`@/lib/drill-through`) — **`ALL_INSIGHTS_SCOPE`** (l.174) | **YES** — entity standings/distribution/hot-cold via `ALL_INSIGHTS_SCOPE` (full tenant). Hospitality branch = YES (Financial — separate scope) |
| `/insights/analytics` | `web/src/app/insights/analytics/page.tsx` | entity results / dimension pivot (Explore) | NO | `getCalculatedPeriods`/`getPopulationTrend`/`getDimensions`/`aggregateByDimension` (`@/lib/insights`); **`getEntityResults`** (`@/lib/drill-through`) — **`ALL_INSIGHTS_SCOPE`** (l.99); `EntityTable` (`@/components/insights`) | **YES** — pivot/trend/entity-detail via `ALL_INSIGHTS_SCOPE` (full tenant) |
| `/acceleration` | `web/src/app/acceleration/page.tsx` | entity results / recognition + movement | NO | `getCalculatedPeriods`/`getComponentTotals` (`@/lib/insights`); **`getEntityResults`** (`@/lib/drill-through`) — **`ALL_INSIGHTS_SCOPE`** (current+prior, l.98-99); `NeighborhoodLeaderboard` keyed on `entityId` from `usePersona()` | **YES** — top performers/movers/leaderboard via `ALL_INSIGHTS_SCOPE` (full tenant); rep "My Rank" sub-section gates on `persona==='rep' && entityId` (l.184) but still derives from the full-population leaderboard |

**Cross-cutting finding (highest-value):** 7 of 8 Intelligence surfaces (`/stream` ICM render, `/insights`, `/insights/compensation`, `/insights/performance`, `/insights/analytics`, `/acceleration`, plus `/insights/trends` via scope-less tenant-wide fns) render per-entity payout/standings from the **full tenant population** by passing `ALL_INSIGHTS_SCOPE` (`scopeType:'all'`) — none narrow by the viewer's role/entity. The sole exception is `/insights/my-team` (non-hospitality branch), which passes `resolveEntityScope(user?.id)` to `DrillThroughPanel` for a genuine manager-scoped result.

### §3.1 Route/Page Inventory — Compensation/Perform workspace group

Persona dispatch on `/perform` (`web/src/app/perform/page.tsx:542-544`): `{persona === 'admin' && <AdminDashboard/>}` / `manager && <ManagerDashboard/>` / `rep && <RepDashboard/>`. Those read `getAdminDashboardData(tenantId)` (AdminDashboard.tsx:145), `getManagerDashboardData(tenantId, scope.entityIds, scope.canSeeAll)` (ManagerDashboard.tsx:172), `getRepDashboardData(tenantId, entityId)` (RepDashboard.tsx:133) — all from `lib/data/persona-queries.ts` (header: "Manager: sees only scoped entities (from profile_scope.visible_entity_ids)"). Re-export pages (`export { default } from …`) are NOT redirects — the URL stays put and the imported page's component renders inline, so they serve real data.

| Route | Page file | Data type rendered | Stub? | Data functions called | Scope-sensitive? |
|---|---|---|---|---|---|
| `/perform` | `/Users/AndrewAfrica/spm-platform/web/src/app/perform/page.tsx` | compensation $ (period total / component totals / entity results) + persona dashboards + financial banner | NO | `getCalculatedPeriods`,`getPeriodTotal`,`getComponentTotals`,`getBatchValidity` (`lib/insights`, pg:147,163-167); `getEntityResults` (`lib/drill-through`, pg:166); `fetch POST /api/financial/data` (pg:188); persona dashboards → `getAdminDashboardData`/`getManagerDashboardData`/`getRepDashboardData` (`lib/data/persona-queries`) | YES — hero `getPeriodTotal` is whole-period (same across roles) but persona dashboards differ: admin=tenant, manager=`scope.entityIds`, rep=own `entityId` |
| `/perform/[...slug]` | `/Users/AndrewAfrica/spm-platform/web/src/app/perform/[...slug]/page.tsx` | — | YES → `<WorkspaceStub workspace="decide"/>` → `router.replace('/stream')` (WorkspaceStub.tsx:21,34) | — | — |
| `/perform/compensation` | `/Users/AndrewAfrica/spm-platform/web/src/app/perform/compensation/page.tsx` | compensation $ (personal outcome) — re-export of `@/app/my-compensation/page` (line 7) | NO (re-export) | (via my-compensation) `listCalculationBatches`,`getCalculationResults` (`lib/supabase/calculation-service`); `canViewResults` (`lib/calculation/lifecycle-utils`); `getAIService` (`lib/ai/ai-service`) | YES — `extractEmployeeId(user.email)` matches own `entity_id`; `canViewResults(lifecycle, role)` visibility gate |
| `/perform/statements` | `/Users/AndrewAfrica/spm-platform/web/src/app/perform/statements/page.tsx` | compensation $ (commission statement + component breakdown + trajectory) | NO | direct `createClient` reads of `entities`/`periods`/`calculation_batches`/`calculation_results` (`lib/supabase/client`, pg:128-148,202-237,270-287); `computeVelocity`,`classifyTrend` (`lib/intelligence/trajectory-service`); `<ComponentCards/>` (`components/drill-through`) → `getEntityStatement` | YES — SR-39 read-layer scope: `allowedEntityIds` = admin→null(tenant), manager→team, rep→own; out-of-scope `?entityId` denied at data layer (pg:194) |
| `/perform/team` | `/Users/AndrewAfrica/spm-platform/web/src/app/perform/team/page.tsx` | entity results / team performance (sales, tips, commission, leaderboard) — re-export of `@/app/insights/my-team/page` (line 7) | NO (re-export) | (via my-team) `getCheques`,`getMeseros`,`getFranquicias`,`getSalesByMesero`,`getSalesByFranquicia` (`lib/restaurant-service`); `resolveEntityScope`,`getPeriodsWithResults` (`lib/drill-through`); `<DrillThroughPanel/>` | YES — manager-scoped drill-through (`resolveEntityScope`) for non-hospitality branch |
| `/perform/trends` | `/Users/AndrewAfrica/spm-platform/web/src/app/perform/trends/page.tsx` | intelligence elements / temporal trends (population trend, entity trajectories) — re-export of `@/app/insights/trends/page` (line 7) | NO (re-export) | (via trends) `getCalculatedPeriods`,`getPopulationTrend`,`getEntityTrajectory`,`getComponentTotals` (`lib/insights`) | YES — population/entity performance trends |
| `/my-compensation` | `/Users/AndrewAfrica/spm-platform/web/src/app/my-compensation/page.tsx` | compensation $ (personal outcome) | NO | `listCalculationBatches`,`getCalculationResults` (`lib/supabase/calculation-service`, pg:118,139); `canViewResults` (`lib/calculation/lifecycle-utils`, pg:121); `getAIService` (`lib/ai/ai-service`, pg:203) | YES — `extractEmployeeId(user.email)` → own `entity_id` match (pg:112,144); `canViewResults` lifecycle/role gate (pg:121) |
| `/performance` | `/Users/AndrewAfrica/spm-platform/web/src/app/performance/page.tsx` | — | YES → `router.replace('/perform')` (line 15) | — | — |
| `/performance/goals` | `/Users/AndrewAfrica/spm-platform/web/src/app/performance/goals/page.tsx` | — (static "No Goals Configured" empty-state card) | YES (placeholder/empty shell, no data fetch) | — | NO |
| `/performance/adjustments` | `/Users/AndrewAfrica/spm-platform/web/src/app/performance/adjustments/page.tsx` | adjustments / disputes ($ credits & corrections) | NO | `loadAdjustmentsPageData(tenantId)` (`lib/data/page-loaders`, pg:78); direct `createClient` mutations on `disputes`/`periods`/`entities` (pg:94,119,147,169) | NO — tenant-wide (`loadAdjustmentsPageData(tenantId)` only, no role/entity scope filter) |
| `/performance/approvals` | `/Users/AndrewAfrica/spm-platform/web/src/app/performance/approvals/page.tsx` | approvals (mock/in-memory) + hardcoded "1/2 pending" badges + "New Request (Demo)" | NO (functional UI off in-memory service) | `approvalService.getPendingForApprover`/`getMyRequests`/`getCounts`/`createRequest` (`lib/approval-service`, pg:34-50) | NO — in-memory demo service, not tenant/DB-backed |
| `/performance/approvals/plans` | `/Users/AndrewAfrica/spm-platform/web/src/app/performance/approvals/plans/page.tsx` | plan-approval workflow (in-memory) | NO (functional UI off in-memory service) | `initializePlanApprovals`,`getApprovalRequests(tenantId)`,`getApprovalStats(tenantId)` (`lib/plan-approval/plan-approval-service`, pg:66-68); reviewer role via `getReviewerRole()` off `user.role` (pg:57) | NO — in-memory service seeded per tenantId, role only chooses reviewer panel |
| `/performance/approvals/payouts` | `/Users/AndrewAfrica/spm-platform/web/src/app/performance/approvals/payouts/page.tsx` | compensation $ / payout batches (mock/in-memory) | NO (functional UI off in-memory service) | `payoutService.initialize`/`getPendingBatches`/`getCompletedBatches`/`getStats`/`approveBatch`/`rejectBatch` (`lib/payout-service`, pg:43-86); approver hardcoded 'Mike Chen' | NO — in-memory demo data, not tenant/role scoped |
| `/performance/approvals/payouts/[id]` | `/Users/AndrewAfrica/spm-platform/web/src/app/performance/approvals/payouts/[id]/page.tsx` | compensation $ / payout batch detail + entity table (mock/in-memory) | NO | `payoutService.getBatchById(id)`/`approveBatch`/`rejectBatch` (`lib/payout-service`, pg:56-116); `<PayoutEmployeeTable/>` | NO — in-memory demo data, not tenant/role scoped |
| `/approvals` | `/Users/AndrewAfrica/spm-platform/web/src/app/approvals/page.tsx` | compensation $ (real pending calc-batch payout totals) + approvals routing | NO | `listCalculationBatches(tenantId,{lifecycleState})` (`lib/supabase/calculation-service`, pg:113); `getPeriodsWithResults` (`lib/drill-through`, pg:111); `getMyApprovals(userId,tenantId,userRole)`,`getApprovals`,`getApprovalStats`,`processDecision`,`escalateRequest` (`lib/approval-routing/approval-service`, pg:161-228); `<DrillThroughPanel/>` | YES — real batch `totalPayout`/entity counts shown; `getMyApprovals` keyed by `userId`/`userRole` (pg:167). NOTE: `<DrillThroughPanel>` uses `allScope` (`scopeType:'all'`, pg:146-151,338) → batch drill-down is tenant-wide regardless of role |

### §3.1 Route/Page Inventory — Operate (Calculation)

| Route | Page file | Data type rendered | Stub? | Data functions called | Scope-sensitive? |
|---|---|---|---|---|---|
| `/operate` | `web/src/app/operate/page.tsx` | Pipeline readiness + module cards (plan/entity/data counts, latest-batch total payout, financial revenue) | NO (Vialuce renders `<LifecycleCockpit/>` at :490; no redirect) | Dark/Bliss: inline `createClient()` (@/lib/supabase/client) → `rule_sets`/`entities`/`committed_data`/`periods`/`calculation_batches` (:419-442) + `fetch('/api/financial/data')` (:447). Vialuce child `LifecycleCockpit` → `loadOperatePageData`, `getPlanIntelligence` (@/lib/data/page-loaders :42), `getTenantOnboardingState` (@/lib/insights), `extractAttainment` (@/lib/data/persona-queries) | YES (renders latest-batch `total_payout` + financial revenue) |
| `/operate/reconciliation` | `web/src/app/operate/reconciliation/page.tsx` | Calc-batch vs benchmark deltas; per-entity VL/file payout comparison | NO | `loadReconciliationPageData` (@/lib/data/page-loaders :25), `listEntities` (@/lib/supabase/entity-service :28), `generateReconciliationReport` (@/lib/reconciliation/report-engine :32), `performLifecycleTransition` (@/lib/calculation/calculation-lifecycle-service :42); `fetch` /api/reconciliation/{analyze,compare,save,session} + /api/ai/agent/reconcile-diagnose; child `ComponentCards` (@/components/drill-through :27) | YES (per-entity payout amounts) |
| `/operate/calculate` | `web/src/app/operate/calculate/page.tsx` | Plan cards + DS-007 results (per-entity payouts, component totals, attainment heatmap) | NO (Vialuce-only `router.replace('/operate')` at :975; full page for Dark/Bliss) | `loadResultsPageData` (@/lib/data/results-loader :18); `useOperate` (plans/periods/batches @/contexts/operate-context); inline `createClient()` → `committed_data`/`calculation_batches`; `fetch` /api/plan-readiness, /api/calculation/run, /api/periods/detect, /api/periods, /api/rule-sets/update-cadence; children `ResultsHero`/`StoreHeatmap`/`EntityTable`/`DrillThroughPanel`. Guard: `RequireCapability capability="data.calculate"` (:979) + inner `isVLAdmin\|\|role==='admin'` (:90) | YES (per-entity payouts/components) |
| `/operate/pay` | `web/src/app/operate/pay/page.tsx` | Payroll/outcome status (entity count, total payout, component count, lifecycle state) | NO | `listCalculationBatches`, `getCalculationResults` (@/lib/supabase/calculation-service :17-20); `useCycleState` (@/contexts/navigation-context). Guard: `RequireCapability capability="data.export"` (:361) | YES (tenant-wide entity results / total payout) |
| `/operate/lifecycle` | `web/src/app/operate/lifecycle/page.tsx` | Lifecycle cockpit (total payout, top/bottom entities, attainment dist, component breakdown, AI assessment) | NO (Vialuce-only `router.replace('/operate')` at :172; full page for Dark/Bliss) | `loadOperatePageData` (@/lib/data/page-loaders :41), `extractAttainment` (@/lib/data/persona-queries :40), `transitionLifecycle`/`toDashboardState` (@/lib/lifecycle/lifecycle-service :35), `fetch('/api/calculation/run')` (:204); child `AssessmentPanel` | YES (per-entity payouts + attainment) |
| `/operate/results` | `web/src/app/operate/results/page.tsx` | Five-Layers-of-Proof: per-entity payouts, components, raw metrics, anomalies | NO | `getCalculationResults`, `getResultCountForBatch` (@/lib/supabase/calculation-service :33), `detectAnomalies` (@/lib/intelligence/anomaly-detection :36), `classifyRuleSetRegimes` (@/lib/results/performance-regime :38), `buildFieldBindingMap`/`resolveAttainmentPct` (@/lib/results/field-identity :39); inline `createClient()` → `rule_sets`/`classification_signals`; `useOperate` selectedBatch. Guard: `RequireCapability capability="view.all_results"` (:1071) | YES (tenant-wide per-entity payouts) |
| `/operate/approve` | `web/src/app/operate/approve/page.tsx` | Calculation-approval queue (re-export of `@/app/approvals/page`) | NO (re-export, not redirect) | Via re-exported approvals page: `listCalculationBatches` (@/lib/supabase/calculation-service), `getPeriodsWithResults` (@/lib/drill-through), child `DrillThroughPanel` | YES (batch payouts / approval amounts) |
| `/operate/briefing` | `web/src/app/operate/briefing/page.tsx` | — (spinner only) | YES → `router.replace('/stream')` (:15) | — | — |
| `/operate/import` | `web/src/app/operate/import/page.tsx` | SCI import workflow (file upload → proposal → execution; no compensation data) | NO | `fetch` /api/import/sci/{analyze,analyze-document,process-job,session-state,proposal,finalize-import} + /api/plan-readiness; inline `createClient()` storage upload + `processing_jobs` insert; children `SCIUpload`/`SCIProposalView`/`SCIExecution`/`ImportReadyState`. Guard: `RequireCapability capability="data.import"` (:568) | NO (import operational surface) |
| `/operate/monitor/quality` | `web/src/app/operate/monitor/quality/page.tsx` | Data-quality findings + metrics — **hardcoded mock** | NO (full UI, but no data layer) | — (hardcoded `qualityIssues`/`qualityMetrics` arrays :32-70; no fetch/loader/supabase) | NO (static mock) |
| `/operate/monitor/readiness` | `web/src/app/operate/monitor/readiness/page.tsx` | — | YES → `redirect('/data/quality')` (:5) | — | — |
| `/operate/import/quarantine` | `web/src/app/operate/import/quarantine/page.tsx` | Quarantined ingestion events + validation results | NO | `fetch('/api/ingest/event?...')` (:77), `progressEventStatus` (@/lib/ingestion/upload-service :29), `formatFileSize` (@/lib/ingestion/file-validator) | NO (ingestion audit) |
| `/operate/import/history` | `web/src/app/operate/import/history/page.tsx` | Immutable ingestion audit trail (status chain, file hashes) | NO | `fetch('/api/ingest/event?...')` (:73), `formatFileSize` (@/lib/ingestion/file-validator) | NO (ingestion audit) |
| `/operate/import/enhanced` | `web/src/app/operate/import/enhanced/page.tsx` | — | YES → `redirect('/operate/import')` (:9) | — | — |
| `/operate/statement/[entityId]/[periodId]` | `web/src/app/operate/statement/[entityId]/[periodId]/page.tsx` | Per-entity commission statement (per-transaction detail) | NO | `fetch('/api/compensation/statement?tenantId&entityId&periodId')` (:38); child `CommissionStatementView` (@/components/compensation/CommissionStatementView :16) | YES (per-entity compensation $) |
| `/operate/[...slug]` | `web/src/app/operate/[...slug]/page.tsx` | — | YES → `<WorkspaceStub workspace="calculate"/>` → `router.replace('/operate')` (WorkspaceStub.tsx:35) | — | — |

### §3.1 Route/Page Inventory — Financial workspace group

| Route | Page file | Data type rendered | Stub? | Data functions called | Scope-sensitive? |
|---|---|---|---|---|---|
| /financial | web/src/app/financial/page.tsx | Financial health summary — brand health cards, network metrics ($ revenue/avg check/tip rate/leakage) | NO (conditional `router.replace('/financial/server/${entityId}')` only when `persona==='rep'`, page.tsx:57-61) | `loadNetworkPulseData` (financial-data-service.ts:322 → POST `/api/financial/data` mode `network_pulse`), import+call at page.tsx:40,76 | YES (Financial — separate scope) |
| /financial/leakage | web/src/app/financial/leakage/page.tsx | Leakage analytics $ — discounts/comps/cancellations by category & location | NO | `loadLeakageData` (financial-data-service.ts:326 → mode `leakage`) at page.tsx:53,85; child `<ChequeList>` (page.tsx:54,363,476) drills via `loadChequesData` (financial-data-service.ts:346 → mode `cheques`) | YES (Financial — separate scope) |
| /financial/products | web/src/app/financial/products/page.tsx | Product mix — food vs beverage revenue $ by location/brand | NO | `loadProductMixData` (financial-data-service.ts:379 → mode `products`) at page.tsx:45,75 | YES (Financial — separate scope) |
| /financial/patterns | web/src/app/financial/patterns/page.tsx | Operational patterns — hourly × day-of-week revenue heatmap, avg check/tips/service time | NO | `loadPatternsData` (financial-data-service.ts:371 → mode `patterns`) at page.tsx:40,69; `useUiSignal('financial.patterns')` + `captureSignal` (page.tsx:83,88, OB-232 EP-1) | YES (Financial — separate scope) |
| /financial/pulse | web/src/app/financial/pulse/page.tsx | Network pulse — hero metrics ($ net revenue/checks/avg check/tip/leakage) + per-location performance grid | NO (conditional `router.replace('/financial/server/${entityId}')` only when `persona==='rep'`, page.tsx:64-68) | `loadNetworkPulseData` (financial-data-service.ts:322 → mode `network_pulse`) at page.tsx:38,83 | YES (Financial — separate scope) |
| /financial/staff | web/src/app/financial/staff/page.tsx | Staff performance — per-server revenue/checks/tips/tip rate/performance index rankings | NO | `loadStaffData` (financial-data-service.ts:359 → mode `staff`) at page.tsx:51,81 | YES (Financial — separate scope) |
| /financial/performance | web/src/app/financial/performance/page.tsx | Location benchmarks — revenue/avg check/WoW/tip rate/leakage rankings per location | NO | `loadPerformanceData` (financial-data-service.ts:355 → mode `performance`) at page.tsx:47,78 | YES (Financial — separate scope) |
| /financial/timeline | web/src/app/financial/timeline/page.tsx | Revenue time-series — revenue/checks/avg check/tips over day/week/month, by brand | NO | `loadTimelineData` (financial-data-service.ts:363 → mode `timeline`) at page.tsx:48,81 | YES (Financial — separate scope) |
| /financial/summary | web/src/app/financial/summary/page.tsx | P&L-style operating summary $ — gross/food/bev/tips/discounts/net revenue per location | NO | `loadSummaryData` (financial-data-service.ts:375 → mode `summary`) at page.tsx:34,62 | YES (Financial — separate scope) |
| /financial/location/[id] | web/src/app/financial/location/[id]/page.tsx | Location detail — KPI summary, revenue trend, staff ranking, leakage detail, product mix ($) | NO | `loadLocationDetailData` (financial-data-service.ts:383 → mode `location_detail`) at page.tsx:55,90 | YES (Financial — separate scope) |
| /financial/server/[id] | web/src/app/financial/server/[id]/page.tsx | Server detail — KPIs, cheques, trends, product mix, neighborhood leaderboard ($) | NO | `loadServerDetailData` (financial-data-service.ts:387 → mode `server_detail`) + `loadStaffData` (financial-data-service.ts:359 → mode `staff`, for peer ranking), both at page.tsx:47,84-87 | YES (Financial — separate scope) |

Notes: All 11 pages are client components that load via `@/lib/financial/financial-data-service` loaders, each a single `POST /api/financial/data` with a distinct `mode` (financial-data-service.ts:294). Non-admin personas send an explicit `FinancialScope { scopeEntityIds: scope.entityIds }` (SR-39 fail-closed) built from `usePersona().scope` (e.g. page.tsx:64-69) — Financial scope is a separate axis from ICM/role scope. The two landing dashboards (`/financial`, `/financial/pulse`) additionally redirect the `rep` persona to their own `/financial/server/[entityId]` rather than rendering network-wide data.

### §3.1 Route/Page Inventory — Workspace Group: Platform / Config / Govern

Covers every `page.tsx` under `/configure`, `/configuration`, `/admin`, `/govern`, `/design`, `/integrations`, `/operations`, `/workforce`. Verified against files on disk at `web/src/app/**`. "Scope-sensitive?" = renders data that differs per role (payout/entity list/perf/intelligence).

| Route | Page file | Data type rendered | Stub? | Data functions called | Scope-sensitive? |
|---|---|---|---|---|---|
| `/configure` | `configure/page.tsx` | — | YES → `redirect('/configure/periods')` (line 5) | — | NO |
| `/configure/periods` | `configure/periods/page.tsx` | config (periods/lifecycle) | NO | `fetch('/api/periods')` (185), `/api/periods/detect` (199), `/api/periods/create-from-data` (228); `getTenantOnboardingState` from `@/lib/insights` (253) | NO |
| `/configure/data-specs` | `configure/data-specs/page.tsx` | — | YES → re-exports `@/app/data/readiness/page` which is `redirect('/data/quality')` | — | NO |
| `/configure/plans` | `configure/plans/page.tsx` | config (Living Plan Surface) | NO | `<PlanSurfaceShell selectedId={null}/>` from `@/components/plan-surface/PlanSurfaceShell` | NO |
| `/configure/[...slug]` | `configure/[...slug]/page.tsx` | — | YES → `<WorkspaceStub workspace="platform-core"/>` → `router.replace('/configure/periods')` (WorkspaceStub.tsx:24,34) | — | NO |
| `/configure/system` | `configure/system/page.tsx` | config (terminology) | NO (re-export of `configuration/terminology`) | `useConfig` from `@/contexts/config-context` | NO |
| `/configure/locations` | `configure/locations/page.tsx` | — | YES → `redirect('/configuration/locations')` (line 5) | — | NO |
| `/configure/users` | `configure/users/page.tsx` | users / RBAC (own tenant) | NO | `<UserAdminConsole scope="tenant"/>` from `@/components/users/UserAdminConsole`; gated `RequireCapability tenant.manage_users` | NO |
| `/configure/people` | `configure/people/page.tsx` | **entity list + calc detail (payout drill)** | NO | `createClient().from('entities')` (89), `getPeriodsWithResults` from `@/lib/drill-through` (128), `<DrillThroughPanel>` (363); gated `RequireCapability view.all_entities` | **YES — entity roster + DrillThroughPanel renders calculation/payout per entity** |
| `/configure/teams` | `configure/teams/page.tsx` | — | YES → `redirect('/configure/users')` (line 5) | — | NO |
| `/configure/users/invite` | `configure/users/invite/page.tsx` | users / unlinked entities | NO | `createClient().from('entities').is('profile_id',null)` (67), `fetch('/api/platform/users/invite')` (92); gated `RequireCapability tenant.manage_users` | NO |
| `/configure/organization/locations` | `configure/organization/locations/page.tsx` | config (locations, **mock**) | NO (re-export of `configuration/locations`) | — (mockLocations in-component) | NO |
| `/configure/organization/teams` | `configure/organization/teams/page.tsx` | — | YES → re-exports `configuration/teams` which `router.replace('/workforce/teams')` | — | NO |
| `/configure/plans/[ruleSetId]` | `configure/plans/[ruleSetId]/page.tsx` | config (Plan Canvas) | NO | `<PlanSurfaceShell selectedId={ruleSetId}/>` (useParams) | NO |
| `/configuration` | `configuration/page.tsx` | — | YES → `redirect('/configuration/terminology')` (line 5) | — | NO |
| `/configuration/terminology` | `configuration/terminology/page.tsx` | config (terminology) | NO | `useConfig` (`terminology`, `updateTerm`, `resetToDefaults`, `t`) from `@/contexts/config-context` (29); `usePermissions().canEditConfig` | NO |
| `/configuration/locations` | `configuration/locations/page.tsx` | config (locations, **mock**) | NO | — (`mockLocations` array line 60; useState CRUD) | NO |
| `/configuration/teams` | `configuration/teams/page.tsx` | — | YES → `router.replace('/workforce/teams')` (line 13) | — | NO |
| `/configuration/personnel` | `configuration/personnel/page.tsx` | — | YES → `router.replace('/workforce/personnel')` (line 13) | — | NO |
| `/admin/launch` | `admin/launch/page.tsx` | — | YES → `redirect('/stream')` (line 11) | — | NO |
| `/admin/audit` | `admin/audit/page.tsx` | **audit** (system changes) | NO | `createClient().from('audit_logs').eq('tenant_id',…).limit(500)` (74); `audit.exportAsCSV` from `@/lib/audit-service` (120); gated `AccessControl ADMIN_ROLES` | NO (audit log; admin-gated, not per-role data) |
| `/admin/users` | `admin/users/page.tsx` | users / RBAC (platform, cross-tenant) | NO | `<UserAdminConsole scope="platform"/>`; gated `RequireCapability tenant.manage_users` | NO |
| `/admin/access-control` | `admin/access-control/page.tsx` | RBAC config (roles/perms/audit) | NO | `getRoles`,`createRole`,`updateRole`,`deleteRole`,`getAuditLog`,`getAssignmentsForRole`,`assignRole`,`revokeRole`,`getAllPermissions` from `@/lib/rbac/rbac-service` (42-52) | NO |
| `/admin/launch/reconciliation` | `admin/launch/reconciliation/page.tsx` | — | YES → `router.replace('/operate/reconciliation')` (line 13) | — | NO |
| `/admin/launch/calculate` | `admin/launch/calculate/page.tsx` | — | YES → `redirect('/operate/calculate')` (line 5) | — | NO |
| `/admin/launch/plan-import` | `admin/launch/plan-import/page.tsx` | — | YES → `router.replace('/operate/import')` (line 8) | — | NO |
| `/admin/tenants/new` | `admin/tenants/new/page.tsx` | config (tenant provisioning wizard) | NO | `getIndustryTemplates` from `@/lib/tenant/provisioning-engine` (248); `fetch('/api/admin/tenants/create')` (306); VL-Admin gate `isVLAdmin(user)` (251) | NO |
| `/admin/launch/calculate/diagnostics` | `admin/launch/calculate/diagnostics/page.tsx` | config status / readiness checks | NO | `getRuleSets` (`@/lib/supabase/rule-set-service`,119), `listImportBatches` (`@/lib/supabase/data-service`,138), `listEntities` (`@/lib/supabase/entity-service`,206) | NO (prerequisite counts) |
| `/govern` | `govern/page.tsx` | — | YES → `redirect('/configure')` (line 5) | — | NO |
| `/govern/calculation-approvals` | `govern/calculation-approvals/page.tsx` | **compensation $ (approval payouts)** | NO | `listApprovalItemsAsync` from `@/lib/governance/approval-service` (44); `fetch('/api/approvals/{id}')` PATCH (58); gated `RequireCapability data.approve_results` | **YES — renders `summary.totalPayout`, `componentTotals`, entity counts** |
| `/govern/access` | `govern/access/page.tsx` | RBAC config | NO (re-export of `admin/access-control`) | (see `/admin/access-control`) | NO |
| `/govern/[...slug]` | `govern/[...slug]/page.tsx` | — | YES → `redirect('/configure')` (line 5) | — | NO |
| `/govern/data-lineage` | `govern/data-lineage/page.tsx` | data quality (quarantine/score) | NO (re-export of `data/quality`) | `getPendingItems`,`getResolvedItems`,`getQuarantineStats`,`resolveItem` (`@/lib/data-quality/quarantine-service`); `calculateQualityScore`,`getDataSourceHealth` (`@/lib/data-quality/quality-score-service`) | NO |
| `/govern/approvals` | `govern/approvals/page.tsx` | **compensation $ / approvals** | NO (re-export of `app/approvals`) | `listCalculationBatches` (`@/lib/supabase/calculation-service`,15), `getPeriodsWithResults` (`@/lib/drill-through`,16), `<DrillThroughPanel>` (336); `getMyApprovals`/`getApprovals`/`getApprovalStats` (`@/lib/approval-routing/approval-service`,41-47) | **YES — renders `totalPayout` per batch + DrillThroughPanel results** |
| `/govern/audit-reports` | `govern/audit-reports/page.tsx` | audit (change history, **mock fallback**) | NO (re-export of `operations/audits`) | `audit.getAuditLogs({limit:100})` from `@/lib/audit-service` (256); mock fallback `mockChangeAudits`/`techCorpChangeAudits` | NO |
| `/design` | `design/page.tsx` | — | YES → `redirect('/configure')` (line 5) | — | NO |
| `/design/goals` | `design/goals/page.tsx` | — (placeholder) | YES → re-exports `performance/goals` = static "No Goals Configured" empty-state shell (no data, no redirect) | — | NO |
| `/design/[...slug]` | `design/[...slug]/page.tsx` | — | YES → `redirect('/configure')` (line 5) | — | NO |
| `/design/budget` | `design/budget/page.tsx` | **compensation $ (money lens)** | NO (re-export of `insights/compensation`) | `getPeriodTotal`,`getComponentTotals`,`getDimensions`,`aggregateByDimension`,`getPopulationTrend`,`getCalculatedPeriods` (`@/lib/insights`,39-52); `getEntityResults` (`@/lib/drill-through`,53) | **YES — period payout totals, component composition, entity results** |
| `/design/plans/new` | `design/plans/new/page.tsx` | — | YES → `router.replace('/operate/import')` (line 22) | — | NO |
| `/integrations/catalog` | `integrations/catalog/page.tsx` | config (product catalog, **mock**) | NO | — (`mockProducts` line 67; useState CRUD; `useCurrency`) | NO |
| `/operations` | `operations/page.tsx` | operations (rollback) | NO (re-export of `./rollback/page`) | (see `/operations/rollback`) | NO |
| `/data/operations` | `data/operations/page.tsx` | — | YES → `redirect('/data')` (line 5) | — | NO |
| `/operations/audits` | `operations/audits/page.tsx` | audit (change history, **mock fallback**) | NO | `audit.getAuditLogs` from `@/lib/audit-service` (256); gated `AccessControl MANAGER_ROLES` | NO |
| `/operations/data-readiness` | `operations/data-readiness/page.tsx` | config (expected-file schemas/alerts) | NO | — (`initialFiles=[]`,`initialAlertConfigs=[]` lines 80-81; pure useState, empty-state) | NO |
| `/operations/rollback` | `operations/rollback/page.tsx` | operations (calc runs / checkpoints) | NO | `simulateRollback`,`executeRollback`,`createCheckpoint`,`getTenantCheckpoints`,`getRollbackEligibleBatches`,`getRollbackHistory`,`resetTenant` from `@/lib/rollback` (46-55) | NO (record counts/impact; VL-Admin reset gate) |
| `/operations/messaging` | `operations/messaging/page.tsx` | messaging (compose, **mock**) | NO | — (`handleSend` simulated; `mockIndividuals`/`mockTeams`/… arrays) | NO |
| `/operations/audits/logins` | `operations/audits/logins/page.tsx` | audit (logins, **empty mock**) | NO | — (`mockLoginAudits=[]`,`techCorpLoginAudits=[]` lines 49,52); gated `AccessControl MANAGER_ROLES` | NO |
| `/workforce/roles` | `workforce/roles/page.tsx` | RBAC config (roles) | NO | `getRoles`/`createRole`/`updateRole`/`deleteRole` are **in-file no-op stubs returning `[]`** (lines 41-44, "not yet migrated to Supabase"); `<RoleEditor>` | NO |
| `/workforce/permissions` | `workforce/permissions/page.tsx` | RBAC config (assignments) | NO | `getRoles`/`getAssignments`/`assignRole`/… **in-file no-op stubs returning `[]`** (38-42); assign path disabled (`handleAssignRole` toasts "unavailable", 90); `<PermissionMatrix>` | NO |
| `/workforce/teams` | `workforce/teams/page.tsx` | config (teams, **mock**) | NO | — (`mockTeams`/`availableMembers` lines 80,141; pure useState CRUD) | NO |
| `/workforce/personnel` | `workforce/personnel/page.tsx` | personnel (**mock**, access-filtered) | NO | `accessControl.filterByAccess`,`canAccessModule`,`getDataAccessLevel`,`isManagerOrAbove` from `@/lib/access-control` (57,110-112); data = `mockPersonnel`/`retailPersonnel` arrays (72,84) | NO (rows differ per role via `filterByAccess`, but on **mock/demo** personnel — not real entities/payout) |

### Notes / flags
- **Real entity/payout surfaces in this group (genuinely scope-sensitive):** `/configure/people`, `/govern/calculation-approvals`, `/govern/approvals` (re-export of `app/approvals`), `/design/budget` (re-export of `insights/compensation`). These render real payout totals and/or entity calculation results via `DrillThroughPanel` / `@/lib/insights` / `@/lib/drill-through`. All others are config/RBAC/audit/operations or mock-data CRUD.
- **Audit surfaces (admin-gated, not per-role-differentiated data):** `/admin/audit` (real `audit_logs` table read), `/operations/audits` + `/govern/audit-reports` (`audit.getAuditLogs` with mock fallback), `/operations/audits/logins` (empty mock).
- **Heavy stub/eliminated-workspace ratio:** 18 of 52 routes are pure redirect/placeholder stubs. Entire `/govern` (4 of 7) and `/design` (3 of 5) roots `redirect('/configure')` (OB-97 workspace elimination); `/admin/launch/*` and several `/configure*`/`/configuration*` legacy routes redirect into `/operate*` and the canonical `/workforce`+`/configure/periods` pages (OB-213 Phase 7 / OB-102 Phase 6).
- **Re-export (not stub) duplicates** that render the same component as a canonical page: `/configure/system`→`configuration/terminology`, `/configure/organization/locations`→`configuration/locations`, `/govern/access`→`admin/access-control`, `/govern/data-lineage`→`data/quality`, `/govern/approvals`→`app/approvals`, `/govern/audit-reports`→`operations/audits`, `/design/budget`→`insights/compensation`, `/operations`→`operations/rollback`.
- **`/workforce/roles` and `/workforce/permissions` are functionally inert:** their data-service functions are in-file no-op stubs (`return []` / `return false`) with comment "Permission service not yet migrated to Supabase" — the RBAC surfaces always render empty and role-assignment is explicitly disabled.

I have all evidence. Confirmed `/data/reports` reads a static fixture (`financialSummariesData`), not tenant/role-scoped. Producing the table.

### §3.1 Route/Page Inventory — Group: Data + Auth + Misc

| Route | Page file | Data type rendered | Stub? | Data functions called | Scope-sensitive? |
|---|---|---|---|---|---|
| `/` | `web/src/app/page.tsx` | — (loading spinner) | YES → `router.replace('/stream')` (page.tsx:21, fires when `currentTenant` set) | — | NO |
| `/data` | `web/src/app/data/page.tsx` | Data-ops health (records/error rate/loads/quality issues) | NO — but renders **hardcoded mock** consts `dataMetrics`/`recentLoads`/`dataErrors` (page.tsx:34-129) | — (none; no tenant/data-layer call) | NO (static mock, no tenant scope) |
| `/data/quality` | `web/src/app/data/quality/page.tsx` | Data-quality score + quarantine queue | NO | `calculateQualityScore`,`getDataSourceHealth` (`@/lib/data-quality/quality-score-service`), `getPendingItems`,`getResolvedItems`,`getQuarantineStats`,`resolveItem`,`bulkResolve` (`@/lib/data-quality/quarantine-service`); child `QuarantineTable` (page.tsx:25-39, 59-67) | NO (tenant-keyed quality, not role-differentiated) |
| `/data/imports` | `web/src/app/data/imports/page.tsx` | — | YES → `redirect('/operate/import')` (page.tsx:10) | — | NO |
| `/data/operations` | `web/src/app/data/operations/page.tsx` | — | YES → `redirect('/data')` (page.tsx:5) | — | NO |
| `/data/transactions` | `web/src/app/data/transactions/page.tsx` | Entity→component→trace→source transactions, per-persona | NO | `resolveEntityScope(user?.id)`,`getPeriodsWithResults(tenantId)` (`@/lib/drill-through`); child `DrillThroughPanel` (`@/components/drill-through`) (page.tsx:14-19, 41-44, 136) | **YES** (persona-scoped entity/transaction data; page.tsx:29-31 comment "rep-vs-admin reads") |
| `/data/readiness` | `web/src/app/data/readiness/page.tsx` | — | YES → `redirect('/data/quality')` (page.tsx:5) | — | NO |
| `/data/import` | `web/src/app/data/import/page.tsx` | — | YES → `redirect('/operate/import')` (page.tsx:10) | — | NO |
| `/data/reports` | `web/src/app/data/reports/page.tsx` | Revenue/outcome/deals charts | NO | `getRevenueByPeriod`,`getRevenueBySalesRep`,`getRevenueByProduct`,`getRevenueByRegion`,`getCommissionExpense`,`getCommissionSummary`,`formatCurrency` (`@/lib/financial-service`) (page.tsx:25-33) | **NO in code** — financial-service reads STATIC fixture `financialSummariesData` (financial-service.ts:155 `summaries.revenueByPeriod.monthly`), takes no tenantId/role → identical for all. (Directive expected scope-sensitive; evidence refutes.) |
| `/data/transactions/new` | `web/src/app/data/transactions/new/page.tsx` | Manual transaction-entry form | NO — functional form, but submit is **simulated** (`setTimeout` 1500ms, page.tsx:22) and picklist is `placeholderEntities` (page.tsx:12-15) | child `ManualEntryForm` (`@/components/financial/manual-entry-form`) | NO |
| `/data/import/enhanced` | `web/src/app/data/import/enhanced/page.tsx` | — | YES → `redirect('/operate/import')` (page.tsx:5) | — | NO |
| `/investigate` | `web/src/app/investigate/page.tsx` | — | YES → `redirect('/operate')` (page.tsx:5, "Investigate workspace eliminated") | — | NO |
| `/investigate/reconciliation` | `web/src/app/investigate/reconciliation/page.tsx` | — | YES → `router.replace('/operate/reconciliation')` (page.tsx:12) | — | NO |
| `/investigate/[...slug]` | `web/src/app/investigate/[...slug]/page.tsx` | — | YES → `redirect('/operate')` (page.tsx:5, catch-all) | — | NO |
| `/investigate/adjustments` | `web/src/app/investigate/adjustments/page.tsx` | Outcome adjustments/disputes ($) | NO — **re-export** `export { default } from '@/app/performance/adjustments/page'` (page.tsx:2); target renders real data | `loadAdjustmentsPageData` (`@/lib/data/page-loaders`), `createClient` (Supabase disputes table) — adjustments/page.tsx:35-36 | **YES** (per-entity adjustment $ from Supabase disputes) |
| `/investigate/audit` | `web/src/app/investigate/audit/page.tsx` | Change-audit trail | NO — **re-export** `from '@/app/operations/audits/page'` (page.tsx:2) | `audit.getAuditLogs({limit:100})` (`@/lib/audit-service`) with `mockChangeAudits`/`techCorpChangeAudits` fallback when empty (audits/page.tsx:257, 264-265); gated by `AccessControl`/`MANAGER_ROLES` | NO (system audit log; admin/manager-gated, same records) |
| `/investigate/entities` | `web/src/app/investigate/entities/page.tsx` | Personnel/entity roster | NO — **re-export** `from '@/app/workforce/personnel/page'` (page.tsx:2) | `accessControl.getDataAccessLevel(user)` (`@/components/access-control`); roster from `mockPersonnel`/`retailPersonnel` consts (personnel/page.tsx:72, 111-115) | **YES** (entity roster + `getDataAccessLevel(user)` role gate) — but roster is mock data |
| `/investigate/trace/[entityId]` | `web/src/app/investigate/trace/[entityId]/page.tsx` | Per-entity calculation forensic trace (payout, components, steps) | NO | `getEntityResults(tenantId, entityId)`,`getCalculationTraces(tenantId, resultId)` (`@/lib/supabase/calculation-service`); children `EmployeeTrace`,`ExecutionTraceView` (page.tsx:18, 49-52) | **YES** (entity payout/components forensics) |
| `/login` | `web/src/app/login/page.tsx` | Login form | NO (real auth form) | `login` (`@/contexts/auth-context`), `createClient`+`signInWithOAuth` (`@/lib/supabase/client`), `clearSupabaseLocalStorage` (`@/lib/supabase/auth-service`), POST `/api/audit` (page.tsx:7-10, 36, 43, 67) | NO (auth) |
| `/unauthorized` | `web/src/app/unauthorized/page.tsx` | Static "Access Restricted" message + link to `/` | YES — placeholder shell, no data, only `<Link href="/">` (page.tsx:21) | — | NO |
| `/auth/mfa/enroll` | `web/src/app/auth/mfa/enroll/page.tsx` | MFA TOTP enrollment (QR + secret) | NO | `supabase.auth.mfa.enroll/challenge/verify` (`@/lib/supabase/client`), `logAuthEventClient` (`@/lib/auth/auth-logger`) (page.tsx:11, 29-60) | NO (auth) |
| `/auth/mfa/verify` | `web/src/app/auth/mfa/verify/page.tsx` | MFA TOTP challenge (6-digit) | NO | `supabase.auth.mfa.listFactors/challenge/verify`, `logAuthEventClient` (page.tsx:12-13, 36-68) | NO (auth) |
| `/select-tenant` | `web/src/app/select-tenant/page.tsx` | Platform Observatory (VL-admin command center); non-admin → `router.push('/')` (page.tsx:26) | NO for VL admin (renders `PlatformObservatory`); redirect branch for non-admins | `useAuth().isVLAdmin` (`@/contexts/auth-context`); child `PlatformObservatory` (`@/components/platform/PlatformObservatory`) (page.tsx:6-8, 19, 41) | NO (platform-admin observability, not compensation/entity data; gated by `isVLAdmin`) |
| `/signup` | `web/src/app/signup/page.tsx` | Self-service signup form (4-field) / "Coming Soon" if flag off | NO (real form; conditional coming-soon at page.tsx:153 when `public_signup_enabled` false) | GET `/api/platform/flags`, POST `/api/auth/signup`, `createBrowserClient().auth.signInWithPassword`/`signInWithOAuth` (page.tsx:15, 31-33, 45, 93, 118) | NO (auth) |
| `/upgrade` | `web/src/app/upgrade/page.tsx` | Pricing tiers + module add-ons + Stripe checkout | NO | `PLATFORM_TIERS`,`MODULE_PRICES`,`calculateMonthlyTotal`,`getBundleDiscount` (`@/lib/stripe/config` — static), POST `/api/billing/checkout` (page.tsx:14-19, 63) | NO (static pricing config) |
| `/spm/alerts` | `web/src/app/spm/alerts/page.tsx` | Alert-rule config list | NO — functional, but rules are **hardcoded `useState`** seed (page.tsx:65-71), edits local-only | `useCurrency().format` (`@/contexts/tenant-context`) for threshold display; no persistence layer | NO (local-state mock config) |
| `/test-ds` | `web/src/app/test-ds/page.tsx` | Design-system component showcase (11 viz comps + persona tokens) — dev harness with `sample*` data | NO (renders), but is a **test/sample harness** (no real data) | `PERSONA_TOKENS`,`LIFECYCLE_DISPLAY` + 11 `@/components/design-system/*` comps fed `sampleDistribution`/`sampleComponents`/`sampleNeighbors` consts (page.tsx:4-21) | NO (static sample data) |
| `/notifications` | `web/src/app/notifications/page.tsx` | Notification list + alert preferences | NO | `getNotifications`,`markAsRead`,`markAllAsRead`,`deleteNotification`,`clearNotifications`,`initializeNotifications` (`@/lib/notifications/notification-service`); `getUserPreferences`,`updateUserPreferences`,`updateTriggerPreference`,`initializeAlerts` (`@/lib/alerts/alert-service`) (page.tsx:31-44, 77-81) | NO (per-user notifications/prefs, client-side service; not compensation/entity data) |

Notes for the report author:
- The entire `/investigate/*` tree is eliminated-workspace shims: 3 hard redirects to `/operate` (`investigate`, `[...slug]`, `reconciliation`) plus 3 re-exports of pages living in `/performance`, `/operations`, `/workforce`, plus the one live page `/investigate/trace/[entityId]`.
- `/data` ⇒ all 4 of its sub-redirects funnel away (`imports`/`import`/`import/enhanced` → `/operate/import`; `operations` → `/data`; `readiness` → `/data/quality`). Only `/data/quality`, `/data/transactions`, `/data/reports`, `/data/transactions/new` render content.
- Scope-sensitivity caveat: `/data/reports` reads a **static fixture** (`financial-service.ts:155`, no tenantId/role param) — contrary to the directive's stated expectation, it is NOT scope-sensitive in the code on disk. The genuinely scope-sensitive pages in this lane are `/data/transactions`, `/investigate/trace/[entityId]`, and `/investigate/adjustments` (real Supabase reads), plus `/investigate/entities` which role-gates via `getDataAccessLevel(user)` over mock roster data.

## 2. SHARED DATA FUNCTION DEPENDENCY MAP

Two independent scope families coexist: the **insights/drill-through** family (`EntityScope.visibleEntityIds`, where empty ⇒ "all" — the HF-343 root mechanism) and the **persona-queries dashboards** family (`entityIds[] + canSeeAll`). Below: client-side `lib` read functions, then the API routes that serve data.


I have all the evidence needed. Here is my section.

---

### §3.2 Shared Data Function Dependency Map — Client-side `lib` read functions

All functions below run client-side (`'use client'` callers) and create a browser Supabase client via `createClient()` from `@/lib/supabase/client` (accepts an injected `client?` for the server/test path). Scope semantics split into TWO families: the **insights/drill-through** family (`EntityScope.visibleEntityIds`, empty ⇒ all) and the **persona-queries dashboards** family (`entityIds[] + canSeeAll`, with admin reading the whole tenant unscoped).

| Function | File | Tables queried | Accepts scope param? | Default when no scope | Consumers (page/component) |
|---|---|---|---|---|---|
| `getEntityResults` | `lib/drill-through/entity-results.ts:92` | `entity_period_outcomes` (preferred, `:105`), `calculation_results` (fallback, `:128`), `entities`+`periods` (decorate) | YES — `scope: EntityScope` (`:94`) | **Empty `visibleEntityIds` ⇒ ALL tenant rows** — `:100` `const scoped = scope.visibleEntityIds.length > 0 ? scope.visibleEntityIds : null;` then `if (scoped) q = q.in('entity_id', scoped)` (`:109`,`:134`). `null` ⇒ no `.in()` filter ⇒ every entity for the period. | All 8 Insights surfaces + every lib/insights fn below (always called with `ALL_INSIGHTS_SCOPE`) |
| `getPeriodsWithResults` | `lib/drill-through/entity-results.ts:156` | `calculation_results` (`:162`), `periods` (`:165`) | NO | Tenant-wide; returns all periods with any results, sorted `start_date` DESC (`:176`) | `insights/my-team`, `configure/people`, `approvals`, `data/transactions`, `ManagerDashboard`; also `periods.ts`/`trajectory.ts`/`entity-table.ts` |
| `resolveEntityScope` | `lib/drill-through/entity-scope.ts:22` | `profile_scope` (`:29`) | Reads `profileId` (not a scope arg) | **Returns `ALL_SCOPE` (`visibleEntityIds: []`, `scopeType:'all'`)** on: no profileId (`:26`), no row/error (`:34`), or explicit-but-empty `visible_entity_ids` (`:38` `if (visibleEntityIds.length === 0) return ALL_SCOPE;`). Substrate note `:8`: "profile_scope has 0 rows" ⇒ in practice ALWAYS resolves to ALL. | `insights/my-team`, `data/transactions`, `ManagerDashboard:151` |
| `getCalculatedPeriods` | `lib/insights/periods.ts:22` | `periods` (`:34`) + calls `getPeriodsWithResults` + `getEntityResults` per period | NO (hardcodes `ALL_INSIGHTS_SCOPE` `:39`) | Per-period stats over ALL entities (`getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, …)` `:39`) | `insights`, `insights/compensation`, `insights/trends`, `insights/performance`, `insights/analytics`, `acceleration`, `stream`, `perform`, `PeriodSelector`, `PeriodCards` |
| `getPeriodTotal` | `lib/insights/intelligence-data.ts:87` | `summary_artifacts` (`period_outcomes` sentinel, `:65`); fallback `getEntityResults` (`:97`) | NO (hardcodes `ALL_INSIGHTS_SCOPE` `:97`) | Rollup sentinel `total_payout` if present (`:95`); else SUM of ALL entity rows for the period (`:98`) | `insights/compensation`, `stream`, `perform` |
| `getComponentTotals` | `lib/insights/distribution.ts:66` | `summary_artifacts` rollup (`getPeriodRollup` `:77`); fallback `getEntityResults` (`:93`) | NO (hardcodes `ALL_INSIGHTS_SCOPE` `:93`) | Per-component sums from sentinel; else aggregate over ALL entity rows | `insights`, `insights/compensation`, `insights/trends`, `acceleration`, `stream`, `perform` |
| `getPayoutDistribution` | `lib/insights/distribution.ts:29` | `getEntityResults` only (`:36`) | NO (hardcodes `ALL_INSIGHTS_SCOPE` `:36`) | Histogram over ALL entity payouts for the period | (re-exported via `intelligence-data.ts:24`; no direct page importer found in app/components) |
| `getPopulationTrend` | `lib/insights/trajectory.ts:26` | `getPeriodsWithResults` + `summary_artifacts` rollup (`:40`); fallback `getEntityResults` (`:54`) | NO (hardcodes `ALL_INSIGHTS_SCOPE` `:54`) | Per-period total/avg/count over ALL entities | `insights/compensation`, `insights/analytics`, `insights/trends`, `stream` |
| `getEntityTrajectory` | `lib/insights/trajectory.ts:69` | `getPeriodsWithResults` + `getEntityResults` per period (`:21`) | Takes optional `entityId?` filter, NOT a scope arg (`:71`); hardcodes `ALL_INSIGHTS_SCOPE` `:21` | Loads ALL entities across all periods, then JS-filters to `entityId` if provided (`:82`) | `insights/performance`, `insights/trends` |
| `getEntityTableData` | `lib/insights/entity-table.ts:23` | `getEntityResults` (`:34`,`:43`) + `entities` (`:51`) | NO (hardcodes `ALL_INSIGHTS_SCOPE` `:34`,`:43`) | Table over ALL entities for the period (+prior period for delta) | `components/insights/EntityTable.tsx` |
| `getAdminDashboardData` | `lib/data/persona-queries.ts:134` | `entity_period_outcomes` (`:143`), fallback `calculation_batches`+`calculation_results`+`entities` (`:157-181`) | NO scope arg — `(tenantId)` only (`:134`) | **Unconditionally tenant-wide**: `.eq('tenant_id', tenantId).eq('period_id', periodId)` with NO entity filter (`:146-147`). Admin = whole tenant by design. | `components/dashboards/AdminDashboard.tsx:145` |
| `getManagerDashboardData` | `lib/data/persona-queries.ts:241` | `entity_period_outcomes` (`:257`,`:270`,`:286`), `entities` (`:280`) | YES — `entityIds: string[], canSeeAll = false` (`:242-244`) | **Empty `entityIds` + `canSeeAll` ⇒ ALL tenant entities**: `:256` `if (resolvedEntityIds.length === 0 && canSeeAll)` re-queries all `entity_period_outcomes.entity_id` for the period (`:257-262`). Empty + `!canSeeAll` ⇒ `emptyManagerData()` (`:265`). | `components/dashboards/ManagerDashboard.tsx:172` (scope from `usePersona().scope` `:119`; falls back to `resolveEntityScope` `:151`) |
| `getRepDashboardData` | `lib/data/persona-queries.ts:319` | `entity_period_outcomes` (`:351`,`:367`), `calculation_results` (`:359`), `periods` (`:382`) | YES — `entityId: string \| null` (`:320-321`) | **Null entityId ⇒ TOP entity**: `:333` `if (!resolvedEntityId)` selects the single highest-`total_payout` entity (`:334-342`); still null ⇒ `emptyRepData()` (`:345`). Ranking query `allOutcomes` (`:367`) is always tenant-wide. | `components/dashboards/RepDashboard.tsx:133` (entityId from `usePersona().entityId` `:103`) |
| `getCurrentPeriodId` | `lib/data/persona-queries.ts:103` | `periods` (`:107`,`:119`) | NO | Most-recent open period, else most-recent any-status (`:119-127`) | internal to all 3 persona-queries dashboards |
| `getPeerRankings` / `getComponentDetail` | `lib/data/persona-queries.ts:781` / `:817` | `entity_period_outcomes`+`entities` / `calculation_results` | NO / takes explicit `entityId` | tenant+period-wide top-N / single entity+batch | (extended OB-46B queries) |
| `getSourceTransactions` | `lib/drill-through/source-transactions.ts:31` | `committed_data` (`:44`) + `calculation_results` | Takes explicit `entityId, periodId` (`:32-34`), NOT a multi-entity scope | Single-entity drill; returns `[]` if any arg missing (`:39`) | drill-through panels |

### ALL_INSIGHTS_SCOPE mechanism (the empty-scope ⇒ all-tenant collapse)

The constant is defined ONCE and re-exported via the insights barrel; every lib/insights aggregate hardcodes it:

```
lib/insights/periods.ts:14  /** "All entities" scope — getEntityResults treats empty visibleEntityIds as admin/all. */
lib/insights/periods.ts:15  export const ALL_INSIGHTS_SCOPE: EntityScope = {
lib/insights/periods.ts:16    visibleEntityIds: [],
lib/insights/periods.ts:17    visibleRuleSetIds: [],
lib/insights/periods.ts:18    visiblePeriodIds: [],
lib/insights/periods.ts:19    scopeType: 'all',
lib/insights/periods.ts:20  };
```

The collapse happens inside `getEntityResults` — an empty `visibleEntityIds` is mapped to `null`, and `null` skips the `.in('entity_id', …)` filter entirely, so the query returns every entity for the period:

```
lib/drill-through/entity-results.ts:100   const scoped = scope.visibleEntityIds.length > 0 ? scope.visibleEntityIds : null;
lib/drill-through/entity-results.ts:109     if (scoped) q = q.in('entity_id', scoped);   // entity_period_outcomes path
lib/drill-through/entity-results.ts:134   if (scoped) q = q.in('entity_id', scoped);     // calculation_results fallback path
```

Confirmed by the file header (`entity-results.ts:7`): *"Scope-aware: an empty scope.visibleEntityIds means 'all' (admin)."* `resolveEntityScope` is the only producer of a non-empty `EntityScope`, and it returns `ALL_SCOPE` (empty) in every path today because `profile_scope` has 0 rows (`entity-scope.ts:8,38`). Net: **every Insights surface, plus `getManagerDashboardData` when `canSeeAll` and `getRepDashboardData`'s `allOutcomes` ranking query, read the full tenant population** — there is no row-level scoping in effect on the live target.

The persona-queries dashboards use a parallel, independent scope shape (`scope.entityIds` / `scope.canSeeAll` from `usePersona()`, `ManagerDashboard.tsx:119`), NOT `EntityScope`; the bridge between them is `resolveEntityScope(user?.id)` called separately for the drill-through panel (`ManagerDashboard.tsx:151`).
### API routes serving data

§3.2 (cont.) — API ROUTES serving compensation / performance / intelligence / entity data

*Global gate context:* `src/middleware.ts:161-167` returns `401` for any unauthenticated `/api/*` request except the public allowlist `['/api/auth','/api/health','/api/platform/flags']` (`middleware.ts:39-41`), matcher covers all non-static paths (`:385-387`). So **"session(mw)"** below = a valid session is required by middleware but the handler does **not** re-check it or bind the requested `tenantId` to the caller's tenant/role. Service-role client = `createServiceRoleClient()` / `createClient(...SERVICE_ROLE_KEY)` = **RLS bypass**.

| API route | File | Tables / data served | Auth gate | Scope filter | Consumers |
|---|---|---|---|---|---|
| `POST /api/financial/data` | `app/api/financial/data/route.ts` | `summary_artifacts`, `summary_artifacts_fine`, `staff_rollup`/`patterns_rollup`/`patterns_meta` (data_type markers), `entities`, `committed_data` (cheque drill), `periods` | **service-role, NO handler auth.** `:14 import createServiceRoleClient`; `:1408 const sbSum = await createServiceRoleClient()`; no `getUser`/role anywhere in file | `tenantId` from **BODY** (`:1386,1399`), `.eq('tenant_id', tenantId)`. `scopeEntityIds?: string[]` is **caller-supplied** (`:1393`) — filter applied in-JS (`:350 arts.filter(a => scopeEntityIds.includes(a.entity_id))`), not enforced | financial dashboards: network_pulse / leakage / performance / staff / timeline / patterns / summary / products / location_detail / server_detail |
| `GET /api/platform/agent-inbox` | `app/api/platform/agent-inbox/route.ts` | `agent_inbox` (intelligence cards) | **service-role, NO role check** (HF-343). `:22 const supabase = await createServiceRoleClient()` | `tenantId` + `persona` from **query** (`:15-16`); `.eq('tenant_id',tenantId).or(\`persona.eq.${persona},persona.eq.all\`)` (`:28-29`) | Vialuce/Chrome agent inbox UI |
| `GET /api/insights` | `app/api/insights/route.ts` | `calculation_batches.config.insightAnalysis` (insight data) | **service-role, NO handler auth.** `:24 createServiceRoleClient()` | `batchId`+`tenantId` from **query** (`:13-15`); `.eq('id',batchId).eq('tenant_id',tenantId)` (`:30-31`); `persona` filters in-JS via `routeToPersona` | Insights pages |
| `POST /api/ai/assessment` | `app/api/ai/assessment/route.ts` | `calculation_results` (count + rows feed LLM assessment) | **service-role, NO handler auth.** `:57 createServiceRoleClient()` | `tenantId` from **BODY** (`:43`); `.eq('tenant_id', tenantId)` (`:61`) | Dashboard AI assessment narration |
| `GET /api/compensation/statement` | `app/api/compensation/statement/route.ts` | `calculation_results` via `getCommissionStatement` (payout statement) | **session(mw)+handler getUser**: `:25-26 getUser(); if(!user) 401` — but **identity only, not tenant-bound** | `tenantId`,`entityId`,`periodId` all from **query** (`:16-18`), passed straight to service-role read (`:29-30`). Any authed user can request any tenant/entity | Commission statement view |
| `GET /api/carrier-intelligence` | `app/api/carrier-intelligence/route.ts` | `committed_data`, `entities`, `calculation_batches`, `periods`, `classification_signals`, `import_batches` | **session + profile-scoped (correct).** `:37-38 getUser 401`; tenant from session profile, `:45-46` platform/vl_admin role may override `?tenantId` | tenant from **session** `profile.tenant_id`; `?tenantId` honored **only if** `role∈{platform,vl_admin}` (`:45-46`) | Carrier intelligence diagnostic |
| `POST /api/calculation/run` | `app/api/calculation/run/route.ts` | reads `committed_data`/`entities`/`periods`/`rule_sets`/`rule_set_assignments`; reads-back `calculation_results` (`:1434`), writes `calculation_batches` | **service-role, NO handler auth.** `:96 createServiceRoleClient()` | `tenantId`,`periodId`,`ruleSetId` from **BODY** (`:87`) | Calculate flow trigger |
| `GET /api/calculation/density` | `app/api/calculation/density/route.ts` | execution-density patterns via `loadDensity(tenantId)` | **NO handler auth** (no getUser, no client in handler) | `tenantId` from **query** (`:15`) | Density / trace-mode panel |
| `GET /api/plan-readiness` | `app/api/plan-readiness/route.ts` | `rule_sets`, `rule_set_assignments`, `committed_data`, `calculation_batches` | **service-role at MODULE scope, NO handler auth.** `:8-11 createClient(URL, SERVICE_ROLE_KEY)` | `tenantId` from **query** (`:14`); `.eq('tenant_id',tenantId)` | Plan readiness card + OB-151 recovery poll |
| `GET /api/periods` | `app/api/periods/route.ts` | `periods`, `calculation_batches` | **session(mw)+handler getUser**: `:20-22 401` (identity only); then service-role (`:34`) | `tenant_id` from **query** (`:26`), not session-bound | Period selectors across surfaces |
| `GET /api/canvas` | `app/api/canvas/route.ts` | `entities`, `entity_relationships` | **session(mw)+handler getUser**: `:15-17 401` (identity only); service-role (`:27`) | `tenant_id` from **query** (`:21`), not session-bound | Canvas / entity graph |
| `GET /api/platform/observatory` | `app/api/platform/observatory/route.ts` | `entity_period_outcomes`, `entities`, `periods`, `calculation_batches`, `profiles` (cross-tenant) | **session + platform-role gate (correct).** `:52 hasVLAdmin = profiles?.some(p=>p.role==='platform')`; `:53-54 if(!hasVLAdmin) 403`; then service-role | cross-tenant (`.in('tenant_id', …)`); `tab` from query | Platform Observatory tabs |
| `GET /api/observatory/recognition-curve` | `app/api/observatory/recognition-curve/route.ts` | recognition/classification curve data | **session + platform-role gate (correct).** `:25 if(!profiles?.some(p=>p.role==='platform')) 403`; service-role (`:27`) | `tenantId` from query (`:32`), platform-only | Observatory recognition curve |
| `GET /api/approvals` | `app/api/approvals/route.ts` | `approval_requests` (calc-batch approvals) | **session + profile-scoped (correct), RLS client.** `:107-109 getUser 401`; `:118-120 if(!profile) 403`; query uses `authClient` (RLS) | scope = **session** `profile.tenant_id` (`:132`), not from caller | Approvals queue |
| `PATCH /api/approvals/[id]` | `app/api/approvals/[id]/route.ts` | `calculation_batches` (approval-state mutation, reads batch back `:93,:121`) | **session + profile gate** `:32-38`; then service-role `:64` | scope from profile; `id` from path | Approve/reject action |
| `POST /api/reconciliation/{run,compare,analyze}` | `app/api/reconciliation/{run,compare,analyze}/route.ts` | `calculation_results`, `calculation_batches`, `entities`, `periods` | **service-role, NO handler auth.** e.g. run `:39`, compare `:60`, analyze `:43 createServiceRoleClient()` | `tenantId`/`batchId` from **BODY** (run `:26-27`) | Reconciliation surfaces |
| `GET /api/entities/inferred-edges` | `app/api/entities/inferred-edges/route.ts` | inferred `entity_relationships` (confidence-ranked) | **capability gate (correct).** `:10 authorizeUserRead()`; `:11 if(!authz.ok) {status}`; service-role read `:13` | tenant from **session** `authz.caller.tenantId` (`:12,14`) | Relationship review panel |
| `POST /api/intelligence/converge`, `POST /api/intelligence/wire` | `app/api/intelligence/{converge,wire}/route.ts` | reads `rule_sets`/`committed_data`/`entities`; writes `rule_set_assignments` (convergence wiring) | **service-role, NO handler auth.** converge `:31`, wire `:58 createServiceRoleClient()` | `tenantId` from **BODY** (converge `:25`, wire `:51`) | Convergence/binding wiring |
| `POST /api/intelligence/narrate` | `app/api/intelligence/narrate/route.ts` | **none** — LLM transform of caller-supplied `InsightCard[]` (no DB read) | **NO handler auth** (session(mw) only); no DB client | `tenantName`/`insights` from **BODY** (`:36-37`); no tenant query | Insight narration |
| `POST /api/results/anomaly-resolve` | `app/api/results/anomaly-resolve/route.ts` | `calculation_results` (metadata mutation) + `audit_logs` insert | **session + profile gate** `:16,:25`; service-role `:37` | scope from `profile.tenant_id` | Anomaly resolution action |

**Crux for §3.2:** the highest-traffic data-serving routes — `financial/data`, `calculation/run`, `ai/assessment`, `insights`, `reconciliation/*`, `intelligence/converge|wire`, `plan-readiness`, `calculation/density` — are **service-role (RLS-bypass) with `tenantId` taken from the request body/query and no handler-level session-or-role check** beyond middleware's bare 401. `agent-inbox` (service-role + `tenantId`/`persona` query, no role check) is the same pattern HF-343 flagged, and it is **not unique** — it is the dominant shape. Even the routes that call `getUser()` (`compensation/statement`, `periods`, `canvas`) authenticate *identity only* and still read the **caller-supplied `tenantId`/`entityId` from query**, so an authenticated user of tenant A can read tenant B's payout/financial/intelligence data. The correctly-scoped routes (tenant derived from session `profile.tenant_id` or `authz.caller.tenantId`, with platform-role override) are `carrier-intelligence`, `approvals`(+`/[id]`), `platform/observatory`, `observatory/recognition-curve`, and `entities/inferred-edges`.

## 3. AUTH / SCOPE / NAVIGATION ARCHITECTURE SNAPSHOT

Pasted verbatim from `main @ 9cda286b` with file:line. The five governing files are presented in directive order: 3.1 `auth-context.tsx`, 3.2 `persona-context.tsx`, 3.3 `navigation-context.tsx` (below), then 3.4 `workspace-config.ts`, 3.5 `permissions.ts`.


### 3.1 auth-context.tsx

`web/src/contexts/auth-context.tsx`

**(a) `AuthContextType` interface — auth-context.tsx:40-51**

```ts
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isVLAdmin: boolean;
  capabilities: string[];
  profileLocale: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasCapability: (capability: string) => boolean;
}
```

Note: `capabilities: string[]` is the authoritative capability source; it is set into its own `useState` (line 159-161), seeded from `initialAuthState?.profile?.capabilities || []`.

**(b) `initAuth` body — auth-context.tsx:171-226** (resolves user + capabilities). The user is resolved by server-verified `getAuthUser()` then `fetchCurrentProfile()`; capabilities come straight off the profile (`profile.capabilities`), NOT computed:

```ts
async function initAuth() {
  try {
    if (AUTH_SKIP_ROUTES.includes(pathname)) {
      return; // isLoading set false in finally
    }
    const authUser = await getAuthUser();          // :188 — server round-trip is SOLE session source
    if (!authUser) {
      await signOut().catch(() => {});
      return;                                        // :192
    }
    const profile = await fetchCurrentProfile();     // :195
    if (profile && profile !== SESSION_ABSENT) {
      setUser(mapProfileToUser(profile));            // :197
      setCapabilities(profile.capabilities || []);   // :198 — capabilities = profile.capabilities verbatim
      setProfileLocale(profile.locale);              // :199
    }
    unsubscribe = onAuthStateChange(async (event) => {        // :205
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const p = await fetchCurrentProfile();
        if (p && p !== SESSION_ABSENT) {
          setUser(mapProfileToUser(p));
          setCapabilities(p.capabilities || []);     // :210
          setProfileLocale(p.locale);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setCapabilities([]);                          // :215
        setProfileLocale(null);
      }
    });
  } catch (e) {
    console.error('Auth init failed:', e);            // :222
  } finally {
    setIsLoading(false);                              // :224
  }
}
```

`mapProfileToUser` (:59-108) takes `capabilities = profile.capabilities || []` (:60) and maps caps → legacy `permissions` (:80-94) for the `TenantUser.permissions` array, but `role` is copied straight from `profile.role` (:100). It does NOT derive role from capabilities.

**`hasCapability` body — auth-context.tsx:328-330** (pure set-membership on the `capabilities` state array):

```ts
const hasCapability = useCallback((capability: string): boolean => {
  return capabilities.includes(capability);
}, [capabilities]);
```

**`hasPermission` body — auth-context.tsx:321-325** (legacy check against `TenantUser.permissions`; VL admins always true):

```ts
const hasPermission = useCallback((permission: string): boolean => {
  if (!user) return false;
  if (isVLAdmin(user)) return true;
  return 'permissions' in user && (user as TenantUser).permissions.includes(permission);
}, [user]);
```

**How `isLoading` is set:**
- Initialized: `const [isLoading, setIsLoading] = useState(!initialAuthState);` — auth-context.tsx:165 (false when server provided initial state, true otherwise).
- Cleared: only in the `finally` of `initAuth`: `setIsLoading(false);` — auth-context.tsx:224. There is no other `setIsLoading` call in the file. `isAuthenticated` is computed inline in the provider value as `isAuthenticated: !!user` (:338).

---

### 3.2 persona-context.tsx

`web/src/contexts/persona-context.tsx`

**(a) `PersonaContextValue` interface + `PersonaScope` — persona-context.tsx:26-38**

```ts
interface PersonaScope {
  entityIds: string[];
  canSeeAll: boolean;
}

interface PersonaContextValue {
  persona: PersonaKey;
  tokens: typeof PERSONA_TOKENS[PersonaKey];
  scope: PersonaScope;
  profileId: string | null;
  entityId: string | null;
  setPersonaOverride: (persona: PersonaKey | null) => void;
}
```

**(b) `derivePersona` body — persona-context.tsx:80-99** (derives persona from `user.role` + capabilities; this is the function `navigation-context` indirectly consumes via `persona`):

```ts
function derivePersona(user: User | null, capabilities: string[]): PersonaKey {
  if (!user) return 'rep';

  // VL Platform Admin or tenant admin
  if (user.role === 'platform' || user.role === 'admin') return 'admin';

  // Manager capability or manages relationships
  if (
    capabilities.includes('manage_team') ||
    capabilities.includes('approve_outcomes')
  ) {
    return 'manager';
  }

  // Also check role-based detection for managers
  if (user.role === 'manager') return 'manager';

  // Default: individual contributor
  return 'rep';
}
```

**effective persona = override ?? derived — persona-context.tsx:130-133:**

```ts
const derivedPersona = useMemo(() => derivePersona(user, capabilities), [user, capabilities]);
const persona = override ?? derivedPersona;     // :132
const tokens = PERSONA_TOKENS[persona];
```

(The scope effect recomputes its own copy: `const effectivePersona = override ?? derivePersona(user, capabilities);` — :147.)

**sessionStorage `vl_persona_override` read/write:**
- READ (render-phase, in `useState` initializer) — persona-context.tsx:110-116:

```ts
const [override, setOverride] = useState<PersonaKey | null>(() => {
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('vl_persona_override');
    if (stored === 'admin' || stored === 'manager' || stored === 'rep') return stored;
  }
  return null;
});
```

- WRITE (effect syncing override back) — persona-context.tsx:122-128:

```ts
useEffect(() => {
  if (override) {
    sessionStorage.setItem('vl_persona_override', override);
  } else {
    sessionStorage.removeItem('vl_persona_override');
  }
}, [override]);
```

**`fetchScope` — the branches that set `PersonaScope {entityIds, canSeeAll}`** (effect at persona-context.tsx:139-335; `fetchScope` defined :149-332, invoked :334). Cache short-circuit and profile/entity linkage first:

```ts
// :151 cache check
const cached = getCachedScope(user!.id, currentTenant!.id, effectivePersona);
if (cached) { setScope(cached.scope); setProfileId(cached.profileId); setEntityId(cached.entityId); return; }
// ...
// :163 profile row → :176 entities.profile_id linkage → linkedEntityId  (:183)
```

ADMIN branch — persona-context.tsx:186-193 (`canSeeAll: true`, the only true-branch):

```ts
if (effectivePersona === 'admin') {
  const adminScope = { entityIds: [] as string[], canSeeAll: true };
  setEntityId(linkedEntityId);
  setScope(adminScope);
  setCachedScope(user!.id, currentTenant!.id, effectivePersona, adminScope, profile?.id ?? null, linkedEntityId);
  return;
}
```

REP branch — persona-context.tsx:196-236 (rep scoped to its store via `meta.store_id || meta.location_id`):

```ts
if (effectivePersona === 'rep') {
  if (linkedEntityId) {
    const { data: linkedEnt } = await supabase.from('entities').select('id, metadata').eq('id', linkedEntityId).maybeSingle();
    const meta = (linkedEnt?.metadata || {}) as Record<string, unknown>;
    const storeId = String(meta.store_id || meta.location_id || '');           // :205
    const repScope = { entityIds: storeId ? [storeId] : [linkedEntityId!], canSeeAll: false };  // :206
    setEntityId(linkedEntityId);
    setScope(repScope);
    setCachedScope(...);
    return;
  }
  // VL Admin demo override: pick a sample individual entity (:214-228)
  const { data: sampleIndividual } = await supabase.from('entities')
    .select('id, metadata').eq('tenant_id', currentTenant!.id).eq('entity_type', 'individual').limit(1).maybeSingle();
  if (sampleIndividual) {
    const meta = (sampleIndividual.metadata || {}) as Record<string, unknown>;
    const storeId = String(meta.store_id || meta.location_id || '');           // :224
    const sampleScope = { entityIds: storeId ? [storeId] : [] as string[], canSeeAll: false };
    setEntityId(sampleIndividual.id); setScope(sampleScope); setCachedScope(...);
  } else {
    const emptyScope = { entityIds: [] as string[], canSeeAll: false };        // :230
    setEntityId(null); setScope(emptyScope); setCachedScope(...);
  }
  return;
}
```

MANAGER branch — persona-context.tsx:239-303 (profile_scope first, else first-brand locations, else OB-211 fail-CLOSED):

```ts
if (effectivePersona === 'manager') {
  const [scopeResult, orgsResult] = await Promise.all([      // :241
    profile?.id ? supabase.from('profile_scope').select('visible_entity_ids')
        .eq('profile_id', profile.id).eq('tenant_id', currentTenant!.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('entities').select('id, entity_type, metadata')
      .eq('tenant_id', currentTenant!.id).in('entity_type', ['organization', 'location']),
  ]);
  const scopeData = scopeResult.data as { visible_entity_ids?: string[] } | null;
  if (scopeData?.visible_entity_ids?.length) {               // :259
    const mgrScope = { entityIds: scopeData.visible_entity_ids, canSeeAll: false };
    setEntityId(linkedEntityId); setScope(mgrScope); setCachedScope(...); return;
  }
  // VL Admin demo override: scope to first brand's locations (:268-287)
  const allOrgs = orgsResult.data as Array<{ id: string; entity_type: string; metadata: unknown }> | null;
  if (allOrgs) {
    const brandEntities = allOrgs.filter(e => (e.metadata as Record<string, unknown>)?.role === 'brand');
    const firstBrand = brandEntities[0];
    if (firstBrand) {
      const brandLocations = allOrgs.filter(e =>
        e.entity_type === 'location' &&
        String((e.metadata as Record<string, unknown>)?.brand_id || '') === firstBrand.id);
      const brandScope = { entityIds: brandLocations.map(l => l.id), canSeeAll: false };
      setEntityId(linkedEntityId); setScope(brandScope); setCachedScope(...); return;
    }
  }
  // OB-211 WS7 Stage 1: manager with NO derivable scope FAILS CLOSED (was canSeeAll:true fail-open)
  const mgrFallbackScope = { entityIds: [] as string[], canSeeAll: false };   // :298
  setEntityId(linkedEntityId); setScope(mgrFallbackScope); setCachedScope(...); return;
}
```

Other-persona fallback (`profile_scope`) — persona-context.tsx:306-323; and the `catch` (:324-331) sets `canSeeAll: true` only for admin, else `canSeeAll: false`. When `!user || !currentTenant` the effect resets to `{ entityIds: [], canSeeAll: false }` (:140-145).

---

### 3.3 navigation-context.tsx

`web/src/contexts/navigation-context.tsx`

**(a) `NavigationContextType` interface — navigation-context.tsx:65-88** (extends `NavigationState`):

```ts
interface NavigationContextType extends NavigationState {
  // State setters
  setActiveWorkspace: (workspace: WorkspaceId) => void;
  toggleRailCollapsed: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  // Mobile sidebar
  isMobileOpen: boolean;
  toggleMobileOpen: () => void;

  // Actions
  navigateToWorkspace: (workspace: WorkspaceId) => void;
  refreshData: () => void;

  // Clock service data
  periodStates: PeriodState[];
  nextAction: string;

  // Helpers
  isSpanish: boolean;
  userRole: string | null;
  /** OB-94: Effective role derived from persona (override or derived), used for workspace filtering */
  effectiveRole: string | null;
}
```

**(b) `effectiveRole` resolution — navigation-context.tsx:103-116** (consumes `persona` from `usePersona()`, maps to role via `personaToRole`; NOT `hasCapability`):

```ts
const { user } = useAuth();
const { currentTenant } = useTenant();
const { persona } = usePersona();              // :105

const { locale } = useLocale();
const isSpanish = isSpanishLocale(locale);
const userRole = user?.role || null;            // :110
// OB-94: Effective role from persona (override or derived) — drives all workspace access
const effectiveRole = persona ? personaToRole(persona) : userRole;   // :112
```

`personaToRole` is imported from `@/lib/navigation/role-workspaces` (:47). `persona` is always truthy (`PersonaKey` from persona-context, defaults `'rep'`), so the `: userRole` fallback is effectively dead — `effectiveRole` is the `personaToRole(persona)` mapping of the (possibly overridden) persona.

**Active workspace + sidebar derivation.** `activeWorkspace` is state, default `'decide'` (:118). Two effects drive it:

1. Default from effectiveRole — navigation-context.tsx:135-141:

```ts
useEffect(() => {
  if (!effectiveRole) return;
  const defaultWs = getDefaultWorkspace(effectiveRole as 'platform' | 'admin' | 'manager' | 'sales_rep');
  setActiveWorkspaceState(defaultWs);
}, [effectiveRole]);
```

2. From current route — navigation-context.tsx:145-170 (also the redirect-on-no-access logic):

```ts
useEffect(() => {
  if (!pathname) return;
  const wsForRoute = getWorkspaceForRoute(pathname);
  if (wsForRoute) {
    if (effectiveRole && canAccessWorkspace(effectiveRole as 'platform' | 'admin' | 'manager' | 'sales_rep', wsForRoute)) {
      setActiveWorkspaceState(prev => prev === wsForRoute ? prev : wsForRoute);
    } else if (effectiveRole) {
      // OB-94: Route belongs to a workspace this persona can't access — redirect to default
      const defaultWs = getDefaultWorkspace(effectiveRole as 'platform' | 'admin' | 'manager' | 'sales_rep');
      const ws = WORKSPACES[defaultWs];
      router.push(ws.defaultRoute);            // :156 — redirect-on-no-access
      return;
    }
  }
  // ... recent pages tracking (:162-168)
}, [pathname, effectiveRole]);
```

Workspace access gate `setActiveWorkspace` — navigation-context.tsx:225-237, and `navigateToWorkspace` (:255-264) both gate on `canAccessWorkspace(effectiveRole, workspace)` and `console.warn`+`return` on denial. There is no `hasCapability` call anywhere in this file — gating is entirely role-derived via `canAccessWorkspace`/`getDefaultWorkspace`/`getWorkspaceForRoute`.

Note: this context does NOT itself render the sidebar; it exposes `activeWorkspace`/`effectiveRole`/`navigateToWorkspace`. The sidebar component (per memory: `VialuceSidebar.tsx` / `ChromeSidebar.tsx`) consumes these. No JSX sidebar markup exists in navigation-context.tsx — the provider returns only `<NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>` (:288-292).

Separately, `clockPersona` (:173-176) is derived from raw `userRole` (NOT the persona override) for the compensation-clock service: `userRole === 'platform' ? 'platform' : userRole === 'admin' ? 'platform_admin' : userRole === 'manager' ? 'manager' : 'sales_rep'`.

### 3.4 workspace-config.ts

**Complete `WORKSPACES` definition (workspace-config.ts:27–311).** All 4 workspaces, every section, every route with its `path` + `roles[]` + `requiredCapability`. Workspace-level: `id`, `label`, `roles[]`, and (finance only) `featureFlag: 'financial'`.

Workspace headers:
- `decide` — label `'Intelligence'`, `defaultRoute '/stream'`, `roles: ['platform','admin','manager','sales_rep']` (L31–40)
- `calculate` — label `'Compensation'`, `defaultRoute '/operate'`, `roles: ['platform','admin']` (L81–90)
- `finance` — label `'Finance'`, `defaultRoute '/financial'`, **`featureFlag: 'financial'`** (L180), `roles: ['platform','admin','manager','sales_rep']` (L168–181)
- `platform-core` — label `'Platform Core'`, `defaultRoute '/configure/periods'`, `roles: ['platform','admin']` (L211–220)

Every route (workspace → section → path → roles[] → requiredCapability):

| Line | WS | Section | path | roles[] | requiredCapability |
|---|---|---|---|---|---|
| 47 | decide | dashboards | `/stream` | platform,admin,manager,sales_rep | `view.intelligence_stream` |
| 48 | decide | dashboards | `/perform` | platform,admin,manager,sales_rep | — (roles only) |
| 59 | decide | insights | `/insights` | platform,admin,manager,sales_rep | — |
| 60 | decide | insights | `/insights/analytics` | platform,admin,manager,sales_rep | — |
| 61 | decide | insights | `/insights/performance` | platform,admin,manager,sales_rep | — |
| 62 | decide | insights | `/insights/compensation` | platform,admin,manager,sales_rep | — |
| 63 | decide | insights | `/insights/trends` | platform,admin,manager,sales_rep | — |
| 72 | decide | acceleration | `/acceleration` | platform,admin,manager | — |
| 101 | calculate | plans | `/configure/plans` | platform,admin | `icm.configure_plans` |
| 109 | calculate | cockpit | `/operate` | platform,admin | `data.import` |
| 110 | calculate | cockpit | `/operate/lifecycle` | platform,admin | `data.advance_lifecycle` |
| 119 | calculate | calculate-results | `/operate/calculate` | platform,admin | `data.calculate` |
| 120 | calculate | calculate-results | `/operate/results` | platform,admin,manager | `view.all_results` |
| 128 | calculate | reconciliation | `/operate/reconciliation` | platform,admin | `data.reconcile` |
| 137 | calculate | statements | `/perform/statements` | platform,admin,manager,sales_rep | `statement.view` |
| 145 | calculate | disputes | `/performance/adjustments` | platform,admin,manager | `dispute.resolve` |
| 153 | calculate | approvals | `/approvals` | platform,admin | `data.approve_results` |
| 161 | calculate | payroll | `/operate/pay` | platform,admin | `view.all_results` |
| 188 | finance | financial-network | `/financial` | platform,admin,manager,sales_rep | — |
| 189 | finance | financial-network | `/financial/pulse` | platform,admin,manager,sales_rep | — |
| 190 | finance | financial-network | `/financial/timeline` | platform,admin,manager,sales_rep | — |
| 191 | finance | financial-network | `/financial/performance` | platform,admin,manager,sales_rep | — |
| 192 | finance | financial-network | `/financial/staff` | platform,admin,manager,sales_rep | — |
| 193 | finance | financial-network | `/financial/leakage` | platform,admin,manager | — |
| 202 | finance | financial-analytics | `/financial/patterns` | platform,admin,manager,sales_rep | — |
| 203 | finance | financial-analytics | `/financial/products` | platform,admin,manager,sales_rep | — |
| 204 | finance | financial-analytics | `/financial/summary` | platform,admin,manager,sales_rep | — |
| 228 | platform-core | data-integration | `/operate/import` | platform,admin | `data.import` |
| 229 | platform-core | data-integration | `/operate/import/history` | platform,admin | `data.import` |
| 230 | platform-core | data-integration | `/operate/import/quarantine` | platform,admin | `data.import` |
| 241 | platform-core | configure | `/configure/people` | platform,admin | `view.all_entities` |
| 242 | platform-core | configure | `/configure/periods` | platform,admin | `tenant.configure_periods` |
| 243 | platform-core | configure | `/configuration/terminology` | platform,admin | `tenant.edit_settings` |
| 244 | platform-core | configure | `/configuration/locations` | platform,admin | `tenant.edit_settings` |
| 253 | platform-core | people-access | `/configure/users` | platform,admin | `tenant.manage_users` |
| 254 | platform-core | people-access | `/admin/access-control` | platform,admin | `tenant.manage_users` |
| 263 | platform-core | audit | `/admin/audit` | platform,admin | `view.audit_trail` |
| 272 | platform-core | data-visibility | `/data` | platform,admin,manager | — |
| 273 | platform-core | data-visibility | `/data/quality` | platform,admin | — |
| 274 | platform-core | data-visibility | `/data/transactions` | platform,admin,manager | — |
| 275 | platform-core | data-visibility | `/data/reports` | platform,admin,manager | — |
| 284 | platform-core | notifications | `/notifications` | platform,admin,manager,sales_rep | — |
| 295 | platform-core | integrations | `/integrations/catalog` | platform,admin | — |
| 304 | platform-core | operations | `/operations/messaging` | platform,admin | — |
| 305 | platform-core | operations | `/operations/rollback` | platform,admin | — |
| 306 | platform-core | operations | `/admin/tenants/new` | platform | `platform.provision_tenant` |

**Routes with NO `requiredCapability` (gate on `roles[]` ONLY):** `/perform`; all 5 `/insights*`; `/acceleration`; ALL 9 finance routes (`/financial`, `/financial/pulse`, `/financial/timeline`, `/financial/performance`, `/financial/staff`, `/financial/leakage`, `/financial/patterns`, `/financial/products`, `/financial/summary`); `/data`, `/data/quality`, `/data/transactions`, `/data/reports`; `/notifications`; `/integrations/catalog`; `/operations/messaging`, `/operations/rollback`. ALL `calculate`-workspace routes carry a `requiredCapability`.

**`getWorkspaceRoutesForRole` body — the filter (workspace-config.ts:351–374), verbatim:**
```ts
351	export function getWorkspaceRoutesForRole(
352	  workspaceId: WorkspaceId,
353	  role: UserRole,
354	  enabledFeatures?: Record<string, boolean>,
355	): WorkspaceSection[] {
356	  const workspace = WORKSPACES[workspaceId];
357	  if (!workspace) return [];
358	
359	  return workspace.sections
360	    .filter(section => {
361	      if (!section.featureFlag) return true;        // not module-gated
362	      if (!enabledFeatures) return true;            // caller didn't supply features → capability-only
363	      return !!enabledFeatures[section.featureFlag]; // module gated on the live tenant feature
364	    })
365	    .map(section => ({
366	      ...section,
367	      routes: section.routes.filter(route => {
368	        if (route.requiredCapability) {
369	          return hasCapability(role, route.requiredCapability);
370	        }
371	        return route.roles.includes(role);
372	      }),
373	    })).filter(section => section.routes.length > 0);
374	}
```

**§9 role-array-fallback:** workspace-config.ts:368–371 — `if (route.requiredCapability) return hasCapability(role, route.requiredCapability); return route.roles.includes(role);`. When a route has a `requiredCapability` it is gated through the PDP (`hasCapability`, which alias-resolves the role); otherwise it falls back to a **raw string-membership** check `route.roles.includes(role)`. NOTE the asymmetry: the `roles[]` arrays contain `'sales_rep'` (e.g. L47–48), which is NOT a canonical `Role` (`permissions.ts:22` Role = `platform|admin|manager|member|viewer`). `hasCapability('sales_rep', …)` resolves `sales_rep → member` (permissions.ts:83), but the fallback `route.roles.includes(role)` does an un-resolved literal compare against the `UserRole` string. The workspace-level filter (L322–330 `getWorkspacesForRole`) uses the SAME pattern: it picks the FIRST route with a `requiredCapability` (`firstCapability`, L324) and gates the whole workspace on `hasCapability`, else falls back to `ws.roles.includes(role)` (L329).

---

### 3.5 permissions.ts

**`Role` type (permissions.ts:22):**
```ts
22	export type Role = 'platform' | 'admin' | 'manager' | 'member' | 'viewer';
```
`CANONICAL_ROLES` (L66): `['platform', 'admin', 'manager', 'member', 'viewer']`. Note `sales_rep` is NOT a `Role` — it is an alias (below).

**Alias map `NON_PLATFORM_ALIASES` + `resolveRole` (permissions.ts:77–95), verbatim:**
```ts
77	const NON_PLATFORM_ALIASES: Record<string, Role> = {
78	  'admin': 'admin',
79	  'tenant_admin': 'admin',
80	  'manager': 'manager',
81	  'member': 'member',
82	  'individual': 'member',
83	  'sales_rep': 'member',
84	  'viewer': 'viewer',
85	};
...
92	export function resolveRole(role: string): Role | null {
93	  if ((PLATFORM_ROLE_VALUES as readonly string[]).includes(role)) return 'platform';
94	  return NON_PLATFORM_ALIASES[role] ?? null;
95	}
```
So: `sales_rep`/`individual` → `member`; `tenant_admin` → `admin`; `vl_admin`/`platform` → `platform` (via `PLATFORM_ROLE_VALUES` imported from `@/lib/auth/resolve-identity`, L16; the literal set is NOT in this file). Unknown role → `null`.

**Complete `ROLE_CAPABILITIES` matrix (permissions.ts:101–211), verbatim by role:**

`platform` (L102–139) — full set, all 28 capabilities:
```
platform.provision_tenant, platform.view_all_tenants, platform.access_observatory, platform.system_config,
tenant.manage_users, tenant.configure_periods, tenant.configure_entities, tenant.view_settings, tenant.edit_settings,
data.import, data.upload_storage, data.calculate, data.advance_lifecycle, data.reconcile, data.approve_results, data.export,
view.all_results, view.team_results, view.own_results, view.intelligence_stream, view.all_entities, view.team_entities, view.audit_trail,
dispute.submit, dispute.resolve,
statement.view,
icm.configure_plans, icm.view_plan_details, icm.simulate
```

`admin` (L141–173) — same as platform MINUS the 4 `platform.*` caps:
```
tenant.manage_users, tenant.configure_periods, tenant.configure_entities, tenant.view_settings, tenant.edit_settings,
data.import, data.upload_storage, data.calculate, data.advance_lifecycle, data.reconcile, data.approve_results, data.export,
view.all_results, view.team_results, view.own_results, view.intelligence_stream, view.all_entities, view.team_entities, view.audit_trail,
dispute.submit, dispute.resolve,
statement.view,
icm.configure_plans, icm.view_plan_details, icm.simulate
```

`manager` (L175–192):
```
tenant.view_settings,
data.approve_results,
view.team_results, view.own_results, view.intelligence_stream, view.team_entities,
dispute.submit, dispute.resolve,
statement.view,
icm.view_plan_details
```

`member` (L194–202):
```
view.own_results, view.intelligence_stream,
dispute.submit,
statement.view
```

`viewer` (L204–210):
```
view.own_results, view.intelligence_stream,
statement.view
```

**`hasCapability` body (permissions.ts:233–255), verbatim:**
```ts
233	export function hasCapability(
234	  role: string,
235	  capability: Capability,
236	  tenantOverrides?: TenantPermissionOverrides
237	): boolean {
238	  const resolved = resolveRole(role);
239	  if (!resolved) return false;
240	
241	  const base = ROLE_CAPABILITIES[resolved];
242	
243	  if (tenantOverrides) {
244	    // Check revocations first
245	    if (tenantOverrides.revocations?.[resolved]?.includes(capability)) {
246	      return false;
247	    }
248	    // Then grants
249	    if (tenantOverrides.grants?.[resolved]?.includes(capability)) {
250	      return true;
251	    }
252	  }
253	
254	  return base.has(capability);
255	}
```
Unknown role → `false` (L239), never throws.

**`WORKSPACE_CAPABILITIES` map + `canAccessWorkspace` (permissions.ts:317–338), verbatim:**
```ts
317	export const WORKSPACE_CAPABILITIES: Record<string, Capability> = {
318	  '/admin': 'platform.system_config',
319	  '/operate': 'data.import',
320	  '/configure': 'tenant.edit_settings',
321	  '/configuration': 'tenant.edit_settings',
322	  '/govern': 'data.approve_results',
323	  '/data': 'data.import',
324	  '/financial': 'view.team_results',
325	};
...
331	export function canAccessWorkspace(role: string, pathname: string): boolean {
332	  const matchedWorkspace = Object.keys(WORKSPACE_CAPABILITIES)
333	    .filter(prefix => pathname.startsWith(prefix))
334	    .sort((a, b) => b.length - a.length)[0];
335	
336	  if (!matchedWorkspace) return true; // Unrestricted path
337	  return hasCapability(role, WORKSPACE_CAPABILITIES[matchedWorkspace]);
338	}
```
`canAccessWorkspace` matches by LONGEST path-prefix (L334 `sort((a,b)=>b.length-a.length)[0]`); a path matching no prefix is treated as **unrestricted** (returns `true`, L336). Note this prefix map is independent of the nav-route `requiredCapability` values above (e.g. `/admin` → `platform.system_config` here, but `/admin/audit` nav route requires `view.audit_trail` at L263; `/financial` workspace-gate here = `view.team_results`, but the finance nav routes carry NO `requiredCapability`). `getCapabilities`/`deriveCapabilities` (L261–307) read the same matrix; `deriveCapabilities` returns `Array.from(getCapabilities(role)).sort()`.

## 4. PERSONA SWITCHER INTEGRATION MAP



### 4.1 Where the switcher UI renders + its gate

Two switcher surfaces exist, **both gated to `isVLAdmin`** (theme-split: Vialuce rail vs Dark/Bliss floating bar). Mount split is in `components/layout/auth-shell.tsx:61` — `{!isVialuce && <PersonaSwitcher />}` (floating bar only off-Vialuce; the rail footer carries it under Vialuce).

**(a) Vialuce rail** — `components/navigation/mission-control/VialuceSidebar.tsx`. Gate is `isVLAdmin` (from `useAuth()`, line 59), footer block lines 233-239:
```
233   {isVLAdmin && (
234     <div className="persona">
235       {PERSONAS.map(p => (
236         <button key={p.key} className={cn(persona === p.key && 'on')} onClick={() => setPersonaOverride(p.key)}>{p.label}</button>
237       ))}
238     </div>
239   )}
```
PERSONAS list (lines 117-121) = admin / manager / rep. So **yes, isVLAdmin-only.**

**(b) Dark/Bliss floating bar** — `components/persona/PersonaSwitcher.tsx`. Gate at lines 89-91:
```
89   if (!isAuthenticated || !isVLAdmin || !currentTenant) {
90     return null;
91   }
```
`isVLAdmin` here comes from `useTenant()` (line 49). Render = `PERSONA_CHIPS.map` (line 100) calling `handleSwitch(chip.key)` → `setPersonaOverride` (lines 56/58). Note this one ALSO navigates: `personaToRole(key)` then `router.push(ws.defaultRoute)` if the current workspace isn't accessible to the new persona (lines 62-85).

### 4.2 What state it sets

`setPersonaOverride` is the context's `setOverride` — `persona-context.tsx:343`: `setPersonaOverride: setOverride,`. It writes a `useState<PersonaKey | null>` (line 110) that is mirrored to sessionStorage:
```
122   useEffect(() => {
123     if (override) {
124       sessionStorage.setItem('vl_persona_override', override);
125     } else {
126       sessionStorage.removeItem('vl_persona_override');
127     }
128   }, [override]);
```
Read back on init from `sessionStorage.getItem('vl_persona_override')` (line 112, validated against `'admin'|'manager'|'rep'`). The effective persona is `persona = override ?? derivedPersona` (line 132), and the scope-fetch effect keys on `override` in its deps (line 335) and recomputes `scope`/`entityId`/`profileId` using `effectivePersona = override ?? derivePersona(...)` (line 147). So the override drives BOTH the persona token AND the data scope.

### 4.3 Every consumer that reads persona

| Consumer (file:line) | reads | Effect class |
|---|---|---|
| `contexts/navigation-context.tsx:105` | persona | **(b) nav** — `effectiveRole = persona ? personaToRole(persona) : userRole` (:112) drives `getDefaultWorkspace`/`canAccessWorkspace` |
| `components/navigation/ChromeSidebar.tsx:142` | persona | **(b) nav** — `isAdminPersona` + persona-derived `effectiveRole` filters `getAccessibleWorkspaces` (:148,:180) |
| `components/navigation/mission-control/MissionControlRail.tsx:44` | persona | **(b) nav** — `showCycle = persona === 'admin'` (:49) |
| `components/navigation/mission-control/UserIdentity.tsx:40` | persona | **(d) cosmetic** — `displayRole = ... PERSONA_ROLE_LABELS[persona] (demo)` (:82-83) |
| `components/navigation/mission-control/VialuceSidebar.tsx:60` | persona,setOverride | the switcher itself (active-state highlight) |
| `components/persona/PersonaSwitcher.tsx:51` | persona,setOverride | the switcher itself |
| `components/insights/ds003/persona-theme.tsx:97` | persona | **(d) cosmetic** — projects DS-003 theme/vocab from persona |
| `app/perform/page.tsx:114` | persona | **(c) dashboard** — selects `AdminDashboard`/`ManagerDashboard`/`RepDashboard` (:542-544) + title (:246) |
| `app/stream/page.tsx:145` | persona,scope,entityId | **(c) dashboard + (a) data** — composes admin/manager/rep dashboard (:103-127); rep guard (:261) |
| `app/acceleration/page.tsx:63` | persona,entityId | **(c) element** — `showMyRank = persona === 'rep' && !!entityId` (:184) |
| `app/my-compensation/page.tsx:90` | persona | **(a) data** — `mapRole(persona || user.role)` (:117) |
| `app/financial/page.tsx:47` | persona,entityId,scope | **(a) data + (c)** — rep redirect to `/financial/server/[id]` (:58); `scopeEntityIds` filter (:68) |
| `app/financial/pulse/page.tsx:45` | persona,entityId,scope | **(a) data** |
| `app/financial/leakage:67`, `patterns:51`, `products:54`, `performance:59`, `staff:59`, `timeline:62`, `summary:43` | scope | **(a) data** — all build `{ scopeEntityIds: scope.entityIds }` server filter |
| `app/perform/statements/page.tsx:94` | scope,entityId | **(a) data** — scoped entity list (:101-104) |
| `components/dashboards/ManagerDashboard.tsx:119` | scope | **(a) data** — `getManagerDashboardData(tenantId, scope.entityIds, scope.canSeeAll)` (:172) |
| `components/dashboards/RepDashboard.tsx:103` | entityId | **(a) data** — `getRepDashboardData(tenantId, entityId)` (:133) |

### 4.4 Key question — FUNCTIONAL, not cosmetic

The switcher is **FUNCTIONAL: it drives data scope, dashboard selection, AND navigation.** Evidence on each of the three asked sub-points:

- **`perform/page.tsx` selects dashboard by persona — YES.** Lines 542-544: `{persona === 'admin' && <AdminDashboard />}` / `manager && <ManagerDashboard />}` / `rep && <RepDashboard />}`. `stream/page.tsx` does the same (`data.persona === 'admin'…manager…rep`, :103-127).
- **`navigation-context` effectiveRole derives from persona — YES.** `navigation-context.tsx:112`: `const effectiveRole = persona ? personaToRole(persona) : userRole;` — and `personaToRole` (`lib/navigation/role-workspaces.ts:21-27`) maps admin→admin / manager→manager / rep→sales_rep. That `effectiveRole` is what `getAccessibleWorkspaces`/`canAccessWorkspace` (the rail) consume.
- **A DATA read filters by persona, not authenticated role — YES.** The override changes `scope` in `persona-context.tsx` (effect at :139-335, keyed on `override`), and every financial page sends `{ scopeEntityIds: scope.entityIds }` to the server. Critically, the server **trusts that client value** — `app/api/financial/data/route.ts:1386` destructures `scopeEntityIds` from the request body and filters on it directly (e.g. `:350 arts = arts.filter(a => scopeEntityIds.includes(a.entity_id))`), using a `createServiceRoleClient()` (`:1408`, RLS-bypassing) with **no server-side re-derivation of scope from the authenticated identity** and no auth/role check in the POST handler (`:1384-1402`).

### 4.5 What must change so a VL admin can verify each role WITHOUT a real member widening scope

**The switcher gate is the entire security boundary today.** Because the server trusts the client-computed `scopeEntityIds` (§4) and `override === 'admin'` makes `persona-context` set `scope = { entityIds: [], canSeeAll: true }` (`persona-context.tsx:187-192`) → financial pages send `financialScope = undefined` (`financial/page.tsx:65`) → server returns the whole tenant. The only thing stopping a non-admin from doing that is that they can never set the override: the switcher renders nothing for them.

The two gates (the keys):
```
VialuceSidebar.tsx:233   {isVLAdmin && ( ... persona buttons ... )}
PersonaSwitcher.tsx:89   if (!isAuthenticated || !isVLAdmin || !currentTenant) { return null; }
```
And the un-gated init read that a non-admin could otherwise exploit if a stale key were present:
```
persona-context.tsx:112  const stored = sessionStorage.getItem('vl_persona_override');
persona-context.tsx:113  if (stored === 'admin' || stored === 'manager' || stored === 'rep') return stored;
```

What would need to change to make role-view verification safe:
1. **Re-gate the override at the context, not just the UI.** `persona-context.tsx` applies `override` (and reads the `vl_persona_override` key at :112) with **no `isVLAdmin` check** — only the two button surfaces are gated. The context should ignore/clear `override` unless `useAuth().isVLAdmin` (or capability) is true, so a manufactured sessionStorage key can't widen a real member's `effectivePersona`/`scope`.
2. **Enforce scope server-side from the authenticated session.** `app/api/financial/data/route.ts` (POST, :1384) must authenticate the caller and intersect/re-derive the allowed entity set from their identity rather than trusting body `scopeEntityIds` with a service-role client. Then even a forged override cannot return data outside the caller's real authorization — the switcher becomes a pure VIEW selector, and "verify each role view" stops depending on the client UI gate for safety.

In short: the switcher is functional and correct for a VL admin, but its safety rests entirely on the two `isVLAdmin` render gates because (a) the context applies the override without an admin check and (b) the financial server filter trusts client scope under a service-role client. Closing either #1 or #2 (ideally both) lets a VL admin verify role views while structurally preventing a real member from widening scope.

## 5. DS-014 GAP ANALYSIS

**Target = the code-encoded DS-014 §4 matrix** (`permissions.ts:101-211`): `platform`/`admin` hold `view.all_results`+`view.all_entities` (whole tenant); `manager` holds `view.team_results`+`view.team_entities` (team only, **NOT** `all`); `member`/`viewer` hold only `view.own_results` (own entity). DS-014 §8.2 (intelligence-element adaptation) = the same matrix applied to intelligence/standings elements (a member's "rank/distribution" must be own-anchored, not the full population).

**Scope-sensitive surface count reconciliation (PG-4):** 24 **distinct** ICM/Intelligence rendering surfaces are scope-sensitive (re-export aliases collapse to their canonical and are listed inline), **+ 11 Financial** (separate scope per §6) = **35 gap rows below** for **35 distinct scope-sensitive surfaces**. (The §1 tables also flag mock/demo surfaces — `/performance/approvals/*`, `/workforce/personnel`, `/investigate/entities` — as rendering role-varying data, but over hardcoded fixtures, not live tenant reads; they are excluded from the gap set and noted in §1 as mock.)

### A. Intelligence surfaces — render the FULL TENANT population via `ALL_INSIGHTS_SCOPE` (no role narrowing today)

| Surface (aliases) | Current behavior (from code) | DS-014 §4/§8.2 target | Gap |
|---|---|---|---|
| `/stream` (ICM render path) | `getEntityResults(tenantId, ALL_INSIGHTS_SCOPE,…)` (stream:546-548) + `DrillThroughPanel scope=ALL_SCOPE`; standings/total over all entities. Persona-aware legacy loader drives narrative+branch only, NOT the rendered numbers. | member→own; manager→team; admin→all intelligence elements (§8.2) | member & manager see **tenant-wide** standings/distribution; should be own / team |
| `/insights` | `getCalculatedPeriods`+`getComponentTotals`+`getEntityResults(ALL_INSIGHTS_SCOPE)` (insights:86) | as above | member/manager see tenant-wide period total, top performers, distribution |
| `/insights/compensation` (alias `/design/budget`) | `getPeriodTotal`/`getComponentTotals`/`getEntityResults(ALL_INSIGHTS_SCOPE)` (l.181) + `EntityTable` | member→own pay; manager→team | money lens is whole-tenant for every role |
| `/insights/performance` | `getEntityResults(ALL_INSIGHTS_SCOPE)` (l.174) — entity standings/hot-cold | member→own; manager→team | full-tenant standings to all roles |
| `/insights/analytics` | `getEntityResults(ALL_INSIGHTS_SCOPE)` (l.99) — pivot/entity detail | manager→team; member→own | full-tenant pivot to all roles |
| `/insights/trends` (alias `/perform/trends`) | `getPopulationTrend`/`getEntityTrajectory`/`getComponentTotals` — scope-less tenant-wide fns (no scope arg accepted) | manager→team; member→own trajectory | full-tenant trend/trajectory to all roles |
| `/acceleration` | `getEntityResults(ALL_INSIGHTS_SCOPE)` current+prior (l.98-99); rep "My Rank" gates on `persona==='rep'&&entityId` but derives from full-population leaderboard | §8.2 anonymized/own rank for member; team for manager | leaderboard/movers full-tenant; rep rank derived from full population (peer payouts in client) |
| `/insights/my-team` (alias `/perform/team`) | **Attempts** scope: `resolveEntityScope(user?.id)`→`teamScope`→`DrillThroughPanel` (the ONLY Intelligence surface that passes a real scope) | manager→team | **fails open in practice**: `resolveEntityScope` returns `ALL_SCOPE` whenever `profile_scope` is empty (it is — 0 rows), so renders tenant-wide |

### B. Perform / Compensation surfaces

| Surface (aliases) | Current behavior | DS-014 §4 target | Gap |
|---|---|---|---|
| `/perform` | Hero `getPeriodTotal` = whole-period (same for all roles). Persona dashboards dispatch on **cosmetic `persona`** (`:542-544`): admin→`getAdminDashboardData` (tenant), manager→`getManagerDashboardData(scope.entityIds,canSeeAll)`, rep→`getRepDashboardData(entityId)` | member→own; manager→team; admin→all | hero total is tenant-wide for member/manager; dashboard selection keyed to switcher-overridable `persona`, not authenticated role |
| `/my-compensation` (alias `/perform/compensation`) | `extractEmployeeId(user.email)`→own `entity_id` + `canViewResults(lifecycle,role)` gate | member→own | **own-scoped (OK)** — but via brittle email→entity string-match, not `profile_scope`/`entities.profile_id` |
| `/perform/statements` | SR-39 read-layer `allowedEntityIds`: admin→null(tenant)/manager→team/rep→own; out-of-scope `?entityId` denied at data layer (:194) | member→own; manager→team | **closest to correct** — but manager/team branch depends on the same `profile_scope` that is empty |
| `/approvals` (aliases `/operate/approve`, `/govern/approvals`) | Real batch `totalPayout`/entity counts; `getMyApprovals` keyed by `userId`/`userRole`; **but `DrillThroughPanel` uses `allScope`** (`scopeType:'all'`, :146-151) | admin/approver scope | batch drill-down tenant-wide regardless of role (approver appropriate, but no team narrowing) |

### C. Operate (Calculation) — admin/calculate-workspace surfaces (RequireCapability-gated)

| Surface | Current behavior | DS-014 §4 target | Gap |
|---|---|---|---|
| `/operate/results` | tenant-wide per-entity payouts; `RequireCapability view.all_results` | admin/platform only | gate is consistent (manager lacks `view.all_results` → filtered from rail + page-blocked). **Low gap** — correctly admin-scoped |
| `/operate/calculate` | per-entity payouts/components; `RequireCapability data.calculate` | admin/platform | consistent; admin-only |
| `/operate/pay` | tenant total payout/entity results; `RequireCapability data.export` | admin/platform | consistent; admin-only |
| `/operate` / `/operate/lifecycle` / `/operate/reconciliation` | latest-batch total payout, per-entity comparison, attainment | admin/platform (calculate ws) | rendered tenant-wide; calculate workspace is admin-only by `roles:['platform','admin']` + per-route caps — **low gap**, but no defense-in-depth scope on the reads themselves |
| `/operate/statement/[entityId]/[periodId]` | per-entity statement via `/api/compensation/statement?tenantId&entityId&periodId` | admin viewing any entity | API authenticates **identity only**, trusts caller `tenantId`/`entityId` → cross-tenant readable (see §2 API row) |

### D. Platform / Govern / Config

| Surface | Current behavior | DS-014 §4 target | Gap |
|---|---|---|---|
| `/configure/people` | entity roster + `DrillThroughPanel` payout drill; `RequireCapability view.all_entities` | admin/platform (`view.all_entities`) | consistent (manager/member lack `view.all_entities`) — **low gap** |
| `/govern/calculation-approvals` | `summary.totalPayout`/`componentTotals`/entity counts; `RequireCapability data.approve_results` | admin/platform/manager-approver | consistent; approver-gated |

### E. Data / Investigate

| Surface | Current behavior | DS-014 §4 target | Gap |
|---|---|---|---|
| `/data/transactions` | `resolveEntityScope(user?.id)`→`DrillThroughPanel` (comment: "rep-vs-admin reads") | member→own; manager→team; admin→all | **fails open**: `resolveEntityScope`→`ALL_SCOPE` (empty `profile_scope`) → tenant-wide for all |
| `/investigate/trace/[entityId]` | `getEntityResults(tenantId, entityId)` + `getCalculationTraces` — per-entity forensic trace | admin/manager forensic; member own only | no role gate on which `entityId` may be traced (any authed user, any entity) |
| `/performance/adjustments` (alias `/investigate/adjustments`) | `loadAdjustmentsPageData(tenantId)` — per-entity dispute/adjustment $ | admin/manager; member own disputes | tenant-wide, no role/entity scope filter |

### F. Financial — **separate scope (deferred to `FM_Views_Data_Persona_Analysis.docx`)**

| Surface | Current behavior | Target | Gap |
|---|---|---|---|
| `/financial`, `/financial/pulse`, `/financial/timeline`, `/financial/performance`, `/financial/staff`, `/financial/leakage`, `/financial/patterns`, `/financial/products`, `/financial/summary`, `/financial/location/[id]`, `/financial/server/[id]` (11) | Each = `POST /api/financial/data` (one per `mode`). Non-admin sends `FinancialScope {scopeEntityIds: scope.entityIds}` (SR-39 fail-closed) from `usePersona().scope`. `/financial` & `/financial/pulse` redirect the `rep` persona to `/financial/server/[entityId]`. | Financial-module persona scoping (separate axis) | **Separate scope per §6** — but note the structural risk shared with ICM: the server (`/api/financial/data`) **trusts the client `scopeEntityIds`** under a service-role client (see §4 and §7-AP3). Listed for completeness; gap disposition belongs to the Financial directive. |

## 6. SUMMARY FINDINGS

- **Total scope-sensitive surfaces: 35** — 24 distinct ICM/Intelligence rendering surfaces (Intelligence 8, Perform 4, Operate 7, Platform/Govern 2, Data/Investigate 3) + 11 Financial (separate scope). (~15 additional routes are re-export *aliases* of these; ~18 are pure redirect/placeholder stubs; the rest are config/RBAC/audit/mock surfaces that are not scope-sensitive.)

- **Total shared data functions requiring scope threading: 8.** The insights aggregates **hardcode `ALL_INSIGHTS_SCOPE`** and accept **no scope parameter**: `getCalculatedPeriods` (periods.ts:22), `getPeriodTotal` (intelligence-data.ts:87), `getComponentTotals` (distribution.ts:66), `getPayoutDistribution` (distribution.ts:29), `getPopulationTrend` (trajectory.ts:26), `getEntityTrajectory` (trajectory.ts:69), `getEntityTableData` (entity-table.ts:23). The single conduit `getEntityResults` (entity-results.ts:92) **already accepts `EntityScope`** — it is the seam — but every caller passes the empty all-scope. The scope *reader* `resolveEntityScope` (entity-scope.ts:22) needs its fail-open closed AND a real *producer* (today `profile_scope` has 0 rows, so it never returns a narrow set). The persona-queries dashboards (`getManagerDashboardData`, `getRepDashboardData`) already accept scope; `getAdminDashboardData` is intentionally tenant-wide.

- **Auth architecture: single path for identity, SEPARATE path for scope.** `auth-context.tsx` is the one authoritative source of `user` + `capabilities` (server-verified `getAuthUser`→`fetchCurrentProfile`; one `isLoading`). **But `AuthContextType` carries NO scope** — scope lives in a *second* context, `persona-context.tsx`, with its **own async `fetchScope` lifecycle** keyed off `effectivePersona = override ?? derivePersona(...)` (the cosmetic override), producing a `PersonaScope {entityIds, canSeeAll}` that is a *different shape* from the drill-through `EntityScope`. So the platform already runs **two scope notions across two lifecycles** — the exact split HF-343's abandoned fix tried (correctly) to collapse into auth-context. The OB's auth-context extension point is `initAuth` (auth-context.tsx:195-199), right after `fetchCurrentProfile`.

- **Persona switcher: FUNCTIONAL, not cosmetic — and its safety is render-gate-only.** It drives (a) **data scope** (`persona-context` `fetchScope` re-runs on `override`; every Financial page sends `scope.entityIds` to the server), (b) **dashboard selection** (`/perform:542-544`, `/stream:103-127` dispatch on `persona`), and (c) **navigation** (`navigation-context:112` `effectiveRole = personaToRole(persona)` drives `getAccessibleWorkspaces`/`canAccessWorkspace`). Its *only* safety boundary is the two `isVLAdmin` render gates (`VialuceSidebar:233`, `PersonaSwitcher:89`); the **context applies the override with NO `isVLAdmin`/capability check** (`persona-context:112,132,147`), and the **Financial server trusts the client `scopeEntityIds`** under a service-role client (`/api/financial/data`). A VL admin *can* verify each role's view today, but only because non-admins never get the buttons — not because the boundary is structural.

- **Critical gaps (rank-ordered for OB scoping):**
  1. **`ALL_INSIGHTS_SCOPE` empty-means-all renders the full tenant to every role on 7+ Intelligence surfaces** + `/perform` hero. Highest blast radius; the HF-343 Phase-0 finding, platform-wide. (AP1)
  2. **The scope *reader* fails open** (`resolveEntityScope`→`ALL_SCOPE`) AND **`profile_scope` is unpopulated (0 rows)** — so even the 3 surfaces that *attempt* scoping (`/insights/my-team`, `/data/transactions`, `/perform/statements` team branch) render tenant-wide. Scope cannot work until there is a real producer + a fail-CLOSED reader. (AP4)
  3. **Server-side scope is client-trusted under RLS-bypass.** The dominant API shape (`/api/financial/data`, `/api/calculation/run`, `/api/ai/assessment`, `/api/insights`, `/api/reconciliation/*`, `/api/platform/agent-inbox`, …) is `createServiceRoleClient()` + `tenantId` from body/query + **no handler auth/role check**; several (`/api/compensation/statement`, `/api/periods`, `/api/canvas`) authenticate *identity only* and read a caller-supplied `tenantId` → **cross-tenant readable**. App-layer narrowing is necessary but not sufficient while this holds. (AP3)
  4. **Scope is keyed to the cosmetic persona, not authenticated identity** (Decision 39 violation): `/perform` dashboard dispatch + `persona-context` scope + `navigation-context` `effectiveRole` all read `persona` (override-inclusive). (AP2)
  5. **Menu: §9 role-array fallback + a dead-end.** Routes without `requiredCapability` (`/perform`, all `/insights*`, all finance, `/data*`, `/notifications`) gate on raw `roles:[]` containing the non-canonical `'sales_rep'` alias; and Finance is a **dead-end for member** (rail shows it via `roles[]`, but middleware `canAccessWorkspace('/financial')` requires `view.team_results` → `/unauthorized`). (AP5/AP7)
  6. **Two parallel scope shapes** (`EntityScope` vs `PersonaScope`) with no single resolver; own-scope on `/my-compensation` is a brittle `user.email`→`entity_id` string match. (AP6/AP8)

## 7. ANTI-PATTERNS OBSERVED

The subsequent OB must close or avoid each of these. Every one is grounded in pasted code above.

- **AP1 — `ALL_INSIGHTS_SCOPE` "empty means all" trap.** `EntityScope.visibleEntityIds: []` is overloaded to mean *both* "admin/all" and (potentially) "scoped to nothing." `getEntityResults` maps empty→`null`→no `.in()` filter→every entity (`entity-results.ts:100`,`:7` header). Every insights aggregate hardcodes the empty all-scope. **Risk:** a narrowed role whose set resolves empty silently widens to the whole tenant. The OB must make "scoped to nothing" structurally distinct from "all" (a DENY that reads nothing, never falls back to all).

- **AP2 — Cosmetic-switcher-as-security-boundary (Decision 39 violation, PDR-05 OPEN).** Data scope, dashboard selection, and nav `effectiveRole` are all derived from `persona = override ?? derivePersona(...)` — a value a sessionStorage key can set — instead of the authenticated `profiles.role`. The override is honored in `persona-context` with **no `isVLAdmin` check** (`:112` reads `vl_persona_override`; `:132`/`:147` apply it); only the two UI render gates stop a non-admin. **The OB must key scope/dashboard/nav off authenticated identity and re-gate the override at the context (ignore/clear unless `isVLAdmin`), so the switcher is a pure VIEW selector that can only narrow within entitlement.**

- **AP3 — Client-trusted scope under a service-role (RLS-bypass) server.** `POST /api/financial/data` destructures `scopeEntityIds` from the request body and filters on it with a `createServiceRoleClient()`, with no handler-level session/role check and `tenantId` from the body (`route.ts:1386,1393,1408`). This is the **dominant** API shape (§2): service-role + caller-supplied `tenantId` + no re-derivation of scope from the authenticated session; some routes are cross-tenant readable by any authenticated user. **The OB (or a paired API-hardening item) must re-derive tenant+entity scope server-side from the authenticated session, never trust client scope under RLS-bypass.**

- **AP4 — Fail-OPEN scope reader + unpopulated producer.** `resolveEntityScope` returns `ALL_SCOPE` on no-profile / no-row / empty `visible_entity_ids` (`entity-scope.ts:26,34,38`), and `profile_scope` has **0 rows** in practice (`:8`). Net: the one scope reader on the platform *always* resolves to all. **The OB must make the reader fail CLOSED (least privilege) and stand up a real producer (materialize `profile_scope`, or resolve own-entity via `entities.profile_id`).**

- **AP5 — DS-014 §9 role-array fallback (whack-a-mole).** `getWorkspaceRoutesForRole` gates on `hasCapability` when a route has `requiredCapability`, else falls back to `route.roles.includes(role)` (`workspace-config.ts:368-371`) — a raw string compare against `roles:[]` arrays that contain the non-canonical `'sales_rep'` (which `permissions.resolveRole` maps to `member`). Routes still on the fallback: `/perform`, all 5 `/insights*`, `/acceleration`, all 9 finance, `/data*`, `/notifications`, `/integrations/catalog`, `/operations/*`. **The OB must capability-gate these and retire the role-array fallback (one PDP).**

- **AP6 — Two parallel scope notions across two lifecycles.** `EntityScope {visibleEntityIds, scopeType}` (drill-through/insights) vs `PersonaScope {entityIds, canSeeAll}` (persona-context), bridged ad hoc (`ManagerDashboard` reads `usePersona().scope` for its data but calls `resolveEntityScope` separately for its drill-through). Scope is resolved in `persona-context` — a *second* async lifecycle independent of `auth-context`. **The OB must resolve ONE scope in the single auth lifecycle (auth-context `initAuth`) and have every consumer read it from `useAuth()`** — and must NOT introduce a *third* parallel hook (the HF-343 regression lesson: `useAuthScope` was a third lifecycle that raced auth-context → flash/bounce; the eradication direction — fold into auth-context — was correct).

- **AP7 — Menu dead-end (DS-014 §5.3 violation).** The Finance workspace + its routes list `'sales_rep'` in `roles:[]` (so the rail shows Finance to a member via the AP5 fallback), but middleware `canAccessWorkspace('/financial')` requires `view.team_results` (`permissions.ts:324`), which a member lacks → `/unauthorized`. "If you can see it you can use it" is violated. **The OB must align rail visibility with the middleware/page capability gate.**

- **AP8 — Brittle own-scope by string match.** `/my-compensation` (and `/perform/compensation`) resolve "own" by `extractEmployeeId(user.email)` matched against `entity_id` rather than the structural `entities.profile_id` linkage. **The OB should resolve own-entity structurally (Decision 39 / Korean Test), not by parsing an email.**

---

*DIAG-077 — Platform-Wide Data Visibility and Menu Function: Spatial Map*
*2026-06-26 · vialuce.ai · Intelligence. Acceleration. Performance.*
*Read-only diagnostic. Zero application-code changes. Substrate: DS-014 · DS-013 · DS-015 · Decision 123 · Decision 39 · Korean Test.*
