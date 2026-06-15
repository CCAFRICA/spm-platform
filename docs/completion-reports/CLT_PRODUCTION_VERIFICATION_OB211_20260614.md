# CLT — OB-211 Production Verification (Phase 0): Verified Failure Inventory + RCA Pointers

**Format:** CLT-45 · **Date:** 2026-06-14 · **Author:** CC (ultracode) · **Method:** 14-agent read-only audit fan-out against `main`/`ob-211-phase0-foundation` (source-identical). Each item TESTED with grep/trace, evidence pasted (file:line), root cause located in code. **This is the evidence base; the FAIL/PARTIAL list below = the resolution scope.**

**Collision gate:** `git log --all | grep -iE 'OB-211'` → no matches · #511 confirmed on main · 211 free. PASS.

**HALT-0 discipline:** items whose *production* pass/fail can only be settled by an authenticated browser render carry `architect-SR-44-required`. The code-level verdict is recorded; the production verdict is the architect's render confirm. No blind production pass/fail asserted.

**Reconciliation-channel separation honored:** no ground-truth/reconciled numeric values asserted (E1 confirms plumbing only).

---

## §1 — The verified inventory (all 34 findings)

| Item | Expected | Code verdict | RCA pointer (root cause in code) | SR-44? |
|---|---|---|---|---|
| **A1** | tenant-card entry lands /stream | **FAIL** | `ObservatoryTab.tsx:107` `targetRoute \|\| '/operate'` + no-targetRoute call at `:369` clobbers setTenant's `/stream` (`tenant-context.tsx:196`) | — |
| **B1** | /stream opens expanded (adaptive) | **FAIL** | `stream/page.tsx:456/598/680` — fixed `space-y-4` stack, no expand-state; `:161` `expand` token is telemetry only | yes |
| **B2** | narrative leads /stream | **FAIL** | `stream/page.tsx` never imports `buildInsightNarrative`/`InsightNarrative` (only `operate/results/page.tsx:488`) | — |
| **B3** | cards compose from design-system | **FAIL** | `0 of 20` intelligence cards import `@/components/design-system`; base `IntelligenceCard.tsx:12-13`; 5 reimplement primitives inline (RepTrajectory/CoachingPriority/Lifecycle/ComponentBreakdown/PersonalEarnings) | — |
| **B4** | DS-003 comp. rules | **PARTIAL** | Diversity PASS, Bloodwork-forward PASS; **AI-front fails on /stream** (no narrative); **Reference-Frame absent on /results** hero (`operate/results/page.tsx:490-510` is batch context, not vs-prior) | yes |
| **C1-onSimulate** | Simulate fires | **FAIL** | `OptimizationCard.tsx:36` declared; 0 callers; sole render `stream/page.tsx:552` omits it | — |
| **C1-onEntityClick** | entity drill | **PARTIAL** | `stream/page.tsx:636/647` pass `()=>onInteract(...)` → `onCardInteract:161` telemetry only, no drill | — |
| **C1-onAction** | action result | **PARTIAL** | WIRED for SystemHealth/Lifecycle (router.push); **Bloodwork signal-only** (`:529/:656`); **design-system `AccelerationCard.onAction`/`QueueItem.onAction` dead in prod** (`AdminDashboard.tsx:573` omits) | — |
| **C1-onViewDetails** | detail view | **PARTIAL** | ComponentBreakdownCard WIRED (`my-compensation:507`); **`HierarchyNode.onViewDetails:46` dead** — HierarchyViewer never mounted | — |
| **C1-onApprove** | approval mutation | **PASS** | wired `approvals/page.tsx:336`, `payouts:213` → processDecision | — |
| **C1-onEscalate** | escalation | **PASS** | wired `approvals/page.tsx:338` → escalateRequest | — |
| **C1-onDrillDown** | drill | **PASS** | wired `insights/analytics:367/381/487` → handleDrillDown (drillPath) | — |
| **C1-onStateClick** | per-state result | **FAIL** | `LifecycleSubway.tsx:29` declared; 0 callers; sole render `admin/launch/calculate/page.tsx:705` omits it | — |
| **C1-onCellClick** | per-cell drill | **FAIL** | `AnomalyMatrix.tsx:7` declared; component never mounted (only barrel-exported `index.ts:42`) | — |
| **C1-onRowClick** | per-row result | **FAIL** | `PayrollSummary.tsx:20` declared, self-forwarded `:122`; component never mounted (`index.ts:43`) | — |
| **C1-RoleCard ×4** | edit/dup/delete/viewUsers | **PASS** | all wired `admin/access-control/page.tsx:286-289` → real handlers | — |
| **C2** | no pure-visual buttons | **FAIL** | 5 dead: `insights/compensation:219,345` (Export ×2 no onClick); `ManagerDashboard.tsx:382`; `AdminDashboard.tsx:433,636` (transition CTAs, hover-only) | — |
| **C3** | drill via reusable prop | **FAIL** | working drill is inline `operate/results/page.tsx:662` (`setDrillAnomaly`); reusable `AnomalyMatrix.onCellClick:50` dead (never rendered) | — |
| **C2-extra-1** | AnomalyMatrix used | **FAIL** | `AnomalyMatrix.tsx:23` exported, rendered nowhere | — |
| **C2-extra-2** | PayrollSummary used | **FAIL** | `PayrollSummary.tsx:20` exported, rendered nowhere | — |
| **C2-extra-3** | onEntityClick drills | **PARTIAL** | telemetry-only stub `stream/page.tsx:161` (same root as C1-onEntityClick) | — |
| **D1** | Manager /results heatmap, regime-aware | **FAIL** | `/results` has no heatmap + no manager branch (persona hardcoded 'admin' `operate/results/page.tsx:128/434`); manager heatmap lives on /stream (`TeamHeatmapCard`); **NO heatmap is regime-aware** — `intelligence-stream-loader.ts:819 buildTeamHeatmap` encodes payout-vs-peer-max, never calls `classifyRuleSetRegimes`; `TeamHeatmapCard.tsx:28` has no regime prop | yes |
| **D2** | Individual /results, goal-gradient regime-aware, entity-from-identity | **FAIL** | `/results` hard-gated VL-admin (`operate/results/page.tsx:121/376`), no rep branch; the earnings-hero+`GoalGradientBar` exists in `RepDashboard.tsx:318` (entity-from-identity `:78`) wired to `/perform`, not /results; neither is regime-aware | — |
| **D3** | FM reads committed_data | **PASS** | `financial/data/route.ts:101-105` queries live `committed_data`; reconnection MOOT. Region/Check hierarchy absent (`route.ts:177/205` brand/location/individual only) = HALT-D data-model, architect-gated | — |
| **D4** | cockpit composed on /operate | **FAIL** | `CycleIndicator/PulseMetrics/QueuePanel` exported (`mission-control/index.ts`) but never imported; `operate/page.tsx` is the OB-108 pipeline-readiness layout, no cockpit | — |
| **E1** | #508/#509/#510 + Bloodwork hold | **PASS** | #508 `performance-regime.ts` consumed `operate/results/page.tsx:37/185`; #509 `field-identity.ts` consumed `:38/186/318` (raw-safe guard returns null vs wrong figure); #510 capture+read-back+react `:128/142-149`; BloodworkCard rendered `stream/page.tsx:526/653`. No regression. | yes |
| **F1** | /insights uses primitives | **FAIL** | all 6 subpages import dup `@/components/charts/*` + `@/components/analytics/*` (`compensation:25-29`, `my-team:9-11`, `performance:43`, `analytics:30-34`, root `insights/page.tsx:18-21`); 4 live pie violations; full repoint map in §3 | yes |
| **G1** | counts from server COUNT | **FAIL** | `operate/results/page.tsx:423 entityCount=results.length` off unbounded `calculation-service.ts:385-389 .select('*')` (no `.range()`/`count`) → silently caps ~1000 for 22K-entity tenants; same at `intelligence-stream-loader.ts:318/237`, `EntityTable.tsx:201`, `lifecycle/page.tsx:126` | — |
| **G2** | vs-prior on hero | **PARTIAL** | present on /stream heroes (`SystemHealthCard:87`, `TeamHealthCard:88`, `PersonalEarningsCard:94`); **absent on /results Total-Payout hero** (`operate/results/page.tsx:512-535`) | — |
| **G3** | trend compute-at-read OK | **PASS** | `trajectory-service.ts:124` pure compute-at-read; no snapshot table written; does not worsen | — |
| **CONSOLE** | no static loop/fetch red flags on /stream | **PASS** | loadData try/catch + stable `scope` ref (`persona-context.tsx:329`); view-signal effect sets a ref not state; authoritative live-console check = architect-SR-44 | yes |

---

## §2 — The resolution scope (FAIL + PARTIAL), mapped to workstreams

**WS-1 ROUTING:** A1.
**WS-2 DECIDE SURFACES:** B1, B2, B3, B4, C3 (generalize the inline drill), G2 (/results hero reference frame), C1-onSimulate (Simulate→WhatIfSlider).
**WS-3 DEAD CONTROLS:** C1-onEntityClick·onAction(Bloodwork/QueueItem)·onViewDetails(HierarchyNode)·onStateClick·onCellClick·onRowClick, C2 (5 buttons), C2-extra-1/-2/-3. (Disposition: WIRE / DISABLE+tooltip / REMOVE.)
**WS-4 PERSONA SURFACES:** D1 (Manager /results heatmap — **owns AccelerationCards action-wiring**, +regime-awareness fix in `buildTeamHeatmap`), D2 (Individual /results), G1 (server COUNT on the tables/heroes it renders).
**WS-5 FINANCIAL + COCKPIT:** D4 (cockpit composition). D3 PASS; Region/Check = HALT-D (architect-gated, not built here).
**WS-6 CONSOLIDATION:** F1 (/insights repoint per §3 map → remove dups).

**Cross-cutting RCA — regime-blindness:** D1's deeper finding is that *no* heatmap consumes #508. Whichever WS renders a heatmap (WS-4) must thread the regime classifier into `buildTeamHeatmap`/`TeamHeatmapCard`. This is composition (the classifier exists), not a new build.

**PASS — no action, verified-hold record:** C1-onApprove/onEscalate/onDrillDown, RoleCard ×4, D3, E1, G3, CONSOLE. E1 confirms #508/#509/#510 + Bloodwork did NOT regress.

---

## §3 — F1 repoint map (dup → design-system primitive)

| Duplicate (remove after repoint) | Design-system primitive |
|---|---|
| `charts/CompensationPieChart` (DS-003-forbidden pie) | `DistributionChart` / `ComponentStack` |
| `charts/goal-progress-bar` (GoalProgressBar) | `GoalGradientBar` |
| `charts/leaderboard` (Leaderboard) | `RelativeLeaderboard` |
| `charts/sales-history-chart` | `Sparkline` (+ `TrendArrow`) |
| `charts/CompensationTrendChart` | `Sparkline` / `PeriodComparison` |
| `analytics/KPICard` | `AnimatedNumber` + `BenchmarkBar` |
| `analytics/MetricTrendChart` | `Sparkline` / `TrendArrow` |
| `analytics/BreakdownChart` (drop pie branch) | `DistributionChart` / `ComponentStack` |
| `insights/page.tsx` inline `ui/chart` LineChart | `Sparkline` / `PeriodComparison` |

**Files to `git rm`** (zero non-insights importers, import-proven): `charts/{CompensationPieChart,CompensationTrendChart,goal-progress-bar,leaderboard,sales-history-chart,index}.tsx`, `analytics/{KPICard,MetricTrendChart,BreakdownChart}.tsx`. **Keep** `analytics/{ExportDialog,SavedReportsList}.tsx` (not chart dups). Closes the OB-209 R4/R5 removal.

---

## §4 — HALT-0 flags (architect-SR-44-required for the production verdict)

B1 (expand look-and-feel), B4 (visual composition judgement), D1 (heatmap render), E1 (live render of foundations), F1 (post-repoint render), CONSOLE (live authenticated console). Code-level verdicts are recorded above; the architect confirms the render at each WS's SR-44 gate.

---

*OB-211 Phase 0 CLT · 2026-06-14 · vialuce.ai · the loop CC owns: TEST→VERIFY→RCA→RESOLVE→RE-VERIFY→SR-44*
