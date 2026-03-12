# OB-165: Architecture Decision Record

## Intelligence Stream Foundation — DS-013 Phase A

---

## DIAGNOSTIC INVENTORY (Phase 0)

### Existing Surfaces to Replace

| Surface | Route | Files |
|---------|-------|-------|
| Briefing | /operate/briefing | AdminBriefing.tsx, ManagerBriefing.tsx, IndividualBriefing.tsx |
| Perform Dashboard | /perform | RepDashboard.tsx, ManagerDashboard.tsx, AdminDashboard.tsx |
| Operate Landing | /operate | Pipeline Readiness Cockpit (OB-108) |

### Reusable Infrastructure

| Asset | Location | Reuse |
|-------|----------|-------|
| PersonaProvider | contexts/persona-context.tsx | Direct — usePersona() hook unchanged |
| Design Tokens | lib/design/tokens.ts | Direct — PERSONA_TOKENS, COMPONENT_PALETTE |
| Briefing Signal Pattern | lib/signals/briefing-signals.ts | Adapt — change signal_type to stream_interaction |
| DistributionChart | components/design-system/DistributionChart.tsx | Direct |
| Sparkline | components/design-system/Sparkline.tsx | Direct |
| BudgetGauge | components/design-system/BudgetGauge.tsx | Direct |
| briefing-loader.ts | lib/data/briefing-loader.ts | Pattern reference — query shapes reusable |

### Provider Architecture

```
AuthProvider > TenantProvider > LocaleProvider > SessionProvider > ConfigProvider
  > AuthShell > PersonaProvider > NavigationProvider > ChromeSidebar + main
```

PeriodProvider is NOT in shell — pages must self-wrap.

### Persona Scope Resolution

- Admin: canSeeAll = true
- Manager: entityIds from profile_scope.visible_entity_ids OR brand locations
- Rep: entityIds from linked entity's store_id OR sample entity (demo)

---

## ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — OB-165
======================================
Problem: Build DS-013 Phase A — a single adaptive surface that replaces
/operate/briefing, /perform dashboard, and /operate landing with an
Intelligence Stream governed by persona, data state, and IAP.

G1 (Governing Standard):
  -> DS-013 Platform Experience Architecture (entire document)
  -> GAAP presentation (Decision 122)
  -> Cognitive Fit (DS-003, TMR-8)

G2 (Research Derivation):
  -> Nielsen (2025): Intent-Based Outcome Specification — third UI paradigm
  -> Salesloft Rhythm: signal-to-action engine, 39% productivity lift
  -> Liu et al. (2024): Adaptive UI improves task completion
  -> Cleveland & McGill (1984): visualization type -> perceptual accuracy
  -> Vessey (1991): Cognitive Fit — form matches decision task
  -> Mehta & Zhu (2009): color -> cognitive mode (indigo=analytical, amber=optimism, emerald=growth)

G3 (Abstraction Principle):
  -> Intelligence elements are domain-agnostic (Five Elements test)
  -> Component names from rule_sets, entity names from entities, currency from tenant
  -> Same structural intelligence for ICM, Financial, Franchise, Channel

G4 (Korean Test):
  -> Zero hardcoded labels. All from database.
  -> Component names, entity names, tier labels, currency — all queried.

G5 (Both-Branch):
  -> Empty state: "No calculation results. Import data and run calculation."
  -> Full state: Intelligence stream with all elements.
  -> Single-period state: Value + Context + Comparison. No trajectory.
  -> Multi-period state (BCL): Value + Context + Comparison + trajectory-based Action + Impact.

G6 (Scale):
  -> Team-scoped queries via entity_relationships (max ~30 entities per manager)
  -> No full-population joins for individual persona
  -> Admin distribution computed server-side, not client-side

Option A: Single route /stream — replaces /operate/briefing and /perform
  - One IntelligenceStream component reads persona -> renders persona-specific elements
  - Reuses existing usePersona() hook
  - Does NOT remove OB-163 Briefing components (risk of regression)
  - Redirects /operate and /perform to /stream
  - Scale: YES. Korean Test: YES. Atomicity: YES.

Option B: Overlay existing /operate and /perform with intelligence elements
  - Preserves existing pages, adds intelligence layer
  - Risk: two competing surfaces. Maintenance burden. Contradicts DS-013 Section 9.
  - Scale: YES. Korean Test: YES. Atomicity: NO (partial upgrade).

CHOSEN: Option A — Single route replaces both surfaces
REASON: DS-013 Section 9 explicitly supersedes /operate/briefing and /perform
as separate surfaces. One adaptive surface. Clean break.

REJECTED: Option B — contradicts DS-013, creates maintenance burden.
```

---

## IMPLEMENTATION PLAN

### Files to Create
1. `web/src/lib/data/intelligence-stream-loader.ts` — Data layer
2. `web/src/app/stream/page.tsx` — Route + persona orchestrator
3. `web/src/components/stream/IntelligenceCard.tsx` — Base card (Five Elements)
4. `web/src/components/stream/SystemHealthCard.tsx` — Admin hero
5. `web/src/components/stream/LifecycleCard.tsx` — Admin lifecycle stepper
6. `web/src/components/stream/DistributionCard.tsx` — Admin histogram
7. `web/src/components/stream/OptimizationCard.tsx` — Admin optimization
8. `web/src/components/stream/TeamHealthCard.tsx` — Manager hero
9. `web/src/components/stream/CoachingPriorityCard.tsx` — Manager coaching
10. `web/src/components/stream/TeamHeatmapCard.tsx` — Manager heatmap
11. `web/src/components/stream/BloodworkCard.tsx` — Admin/Manager exceptions
12. `web/src/components/stream/PersonalEarningsCard.tsx` — Individual hero
13. `web/src/components/stream/AllocationCard.tsx` — Individual recommendation
14. `web/src/components/stream/ComponentBreakdownCard.tsx` — Individual breakdown
15. `web/src/components/stream/RelativePositionCard.tsx` — Individual leaderboard
16. `web/src/lib/signals/stream-signals.ts` — Signal capture

### Files to Modify
1. `web/src/components/navigation/Sidebar.tsx` — Add Intelligence link
2. `web/src/app/operate/page.tsx` — Redirect to /stream
3. `web/src/app/perform/page.tsx` — Redirect to /stream
4. `web/src/app/operate/briefing/page.tsx` — Redirect to /stream

### Files NOT Removed
- OB-163 briefing components preserved (risk of regression, per Phase 4C)
- Perform dashboard components preserved (may be referenced elsewhere)
