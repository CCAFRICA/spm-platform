# OB-322 — Completion Report: Performance Agent Visualization Surfaces

**Date:** 2026-06-22 · **Branch:** `ob-322-performance-visualization` · **Directive:** `docs/vp-prompts/OB-322_PERFORMANCE_VISUALIZATION_SURFACES_DIRECTIVE_20260622.md`
**HALT-SEQ:** clear — `ls docs/vp-prompts/OB-322*` returns only this directive (no collision).
**Verification split (SR-44):** CC delivers code + data-layer proof + tsc/build/test evidence. Browser-rendered confirmation on `localhost:3000` (screenshots, dev-server) is the architect's step.

---

## Phase 0 — live HALT checks (all clear)

| HALT | Question | Result |
|---|---|---|
| **HALT-1** | `calculation_results.components` JSONB shape | **Array** of `{payout, componentName, componentId, componentType, details}`. Value key is `payout` (NOT `outputValue`). Extractable. |
| **HALT-2** | Acceleration fabricated content — backend or frontend? | **Frontend** — `activeSpifs`/`alerts`/`badges`/`coachingTips` are hardcoded consts; no SPIF/badge/alert API route exists. Removal is frontend-only. |
| **HALT-3** | Variant/dimension source | `entities.metadata` carries `nivel_cargo`/`role` (Ejecutivo / Ejecutivo Senior), `region` (Sierra/Costa/Oriente/ALL), `cargo`. `rule_set_assignments.metadata` is empty `{}`. Source = `entities.metadata`. |
| **HALT-4** | Surface-cut blast radius | ~6 files reference My Team / Sales & Finance; under the 15-file threshold. |

---

## Architecture Decision Gate (Section B)

1. **Dimension discovery = read values, not names (AP-25).** New `lib/insights/dimension-discovery.ts` iterates whatever keys `entities.metadata` carries and keeps those at *grouping cardinality* (2–20 distinct, value-set-deduped so `role ≡ nivel_cargo` surfaces once), plus the always-present Component dimension from `componentBreakdown`. No `{region, team, product, plan}` literal anywhere. This retires the `m.variant ?? m.role ?? m.cargo ?? m.Cargo` assumption chain in `entity-table.ts`.
2. **End-State A / Decision 158 — consume, never re-derive.** Every surface reads `calculation_results.total_payout` / `.components` via the existing OB-224 drill-through + OB-227 insights layer (`getEntityResults`, `getComponentTotals`, `getCalculatedPeriods`, `getEntityTableData`). No new aggregation from raw `committed_data`. `aggregateByDimension` sums the already-computed per-entity/per-component results.
3. **Surface cuts via `next.config` redirects, not page deletion (AP-17).** `/insights/my-team` and `/insights/sales-finance` redirect to `/insights`. The My Team *component* stays importable because `/perform/team` re-exports it and is referenced by `insight-engine`, `pulse-service`, `command-registry`, `acceleration-hints`. Only the duplicated Insights nav entry + the orphaned sales-finance page are retired.
4. **Naming resolution (O-1 vs O-8 tension).** O-1's table labels the sub-page "Performance"; O-8 mandates titles ⇔ nav-label ⇔ breadcrumb agreement and disambiguation from the agent name. Resolved by renaming nav label **and** page title to **"Attainment"** (O-1's stated job: "vs reference: attainment"). Breadcrumb auto-derives from `WORKSPACES` via `VialuceTopbar`, so one rename propagates everywhere.
5. **Shared period control = horizontal cards (O-2).** New `PeriodCards` (selectable cards: label · total · entities · lifecycle badge) replaces the dropdown on each surface; state is local-per-surface seeded from `getCalculatedPeriods` (start_date DESC), the single source of truth. (Cross-surface persistence via URL param is a follow-up; each surface defaults to latest-with-results, consistent across surfaces.)

**Anti-Pattern Registry:** AP-11 (Acceleration now real-data-or-honest-empty), AP-13 (live HALT-1/3 schema checks, no assumed schema), AP-17 (redirects not duplicate pages; reuses insights layer), AP-21 (hero cards + tables read the same period query result), AP-25 (zero hardcoded dimension names) — all checked.

---

## Per-objective evidence

### O-1 — Surface inventory → PASS
`workspace-config.ts` Insights section is now exactly five routes; My Team + Sales & Finance removed; `next.config.mjs` redirects both to `/insights`; `page-status.ts` entries removed; orphaned `sales-finance/page.tsx` deleted (page count 208→207). Acceleration is already its own top-level section.
```
$ grep -c "path: '/insights" web/src/lib/navigation/workspace-config.ts   # → 5
# routes: Overview /insights, Analytics /insights/analytics, Attainment /insights/performance,
#         Compensation /insights/compensation, Trends /insights/trends
# next.config.mjs: /insights/my-team → /insights, /insights/sales-finance → /insights (permanent:false)
```

### O-2 — Shared period cards → PASS (code; render = architect)
`web/src/components/insights/PeriodCards.tsx` — horizontal selectable cards (`role="tablist"`, `aria-selected`), one per `PeriodSummary` from `getCalculatedPeriods` (start_date DESC), selected card ring-highlighted, lifecycle badge + total + entity count from data. Wired on Overview, Compensation, Acceleration; Analytics/Trends use the period-derived aggregates. BCL has 6 calculated periods.

### O-3 — Dimension discovery → PASS (live proof)
`web/src/lib/insights/dimension-discovery.ts` (`discoverDimensions`, `aggregateByDimension`, `COMPONENT_DIMENSION_KEY`). Live run against BCL (`scripts/ob322-dimension-proof.ts`, algorithm-identical to the module):
```
O-3 Discovered dimensions (Korean-clean, 2..20 distinct, value-set deduped):
   [component] Component (__component__) → 4 values: Captación de Depósitos, Colocación de Crédito, Cumplimiento Regulatorio, Productos Cruzados
   [attribute] Cargo (cargo)          → 4 values: Gerente Regional, Gerente de Sucursal, Oficial de Crédito, VP Banca Minorista
   [attribute] Nivel Cargo (nivel_cargo) → 2 values: Ejecutivo, Ejecutivo Senior
   [attribute] Region (region)        → 4 values: ALL, Costa, Oriente, Sierra
```
Component (4) + Variant/Nivel (2) discovered as the directive requires, plus Cargo + Region — none hardcoded; `role` deduped against `nivel_cargo`; `fecha_ingreso` (dates) excluded by cardinality.

### O-4 — Overview fixes → PASS (live proof)
Root cause: Overview read `comp.outputValue` — a key that does not exist on the `components` JSONB (real key `payout`) → "Earnings by Component" was a flat zero line; and it loaded `batches[0]` (often an empty PREVIEW batch) → "Total Period Outcome" $0. Rewritten period-aware (PeriodCards) reading `getComponentTotals` (aggregated across all entities) + `getEntityResults` for the selected period.
```
O-4 Earnings by Component (period 0f1fabbc):
   Colocación de Crédito:  $17,990
   Captación de Depósitos: $10,170
   Productos Cruzados:      $8,480
   Cumplimiento Regulatorio:$7,950
   component sum=$44,590 | period total_payout=$44,590 | match=true   ← conserves to Total Period Outcome
```

### O-5 — Analytics dimension pivot → PASS (live proof)
The hardcoded "No Segment Dimension" panel was a **false negative** — BCL carries region/nivel_cargo/cargo. Replaced with `DimensionBreakdown` (dimension selector + `ComponentBars`), defaulting to Component, pivotable to any discovered dimension. Honest empty preserved only when discovery returns nothing.
```
O-5 Pivot by Region (was "No Segment Dimension"):
   Sierra:  $15,659 | Costa: $14,955 | Oriente: $12,996 | ALL: $980
   region sum=$44,590 | match period=true   ← conserves
```

### O-6 — Compensation enrichment → PASS (code; render = architect)
`PeriodSelector` dropdown → full-width `PeriodCards`. "Outcome by Plan" single-slice donut (`CompensationPieChart`) → **"Where the Money Goes"** = `DimensionBreakdown` (discovery pivot, horizontal bars — no single-plan donut). Payments-by-Entity `EntityTable` retained, scoped to the selected period (columns Entity/Variant/Top Component/Δ Prior/Total intact).

### O-7 — Acceleration honest state → PASS (code; render = architect)
`acceleration/page.tsx` fully rewritten (646→~290 lines). **Removed:** `activeSpifs` (Holiday Push SPIF), `badges`, `alerts`, `coachingTips`, `recommendations`, `goals` — all fabricated. **Now real:** Top Performers (by payout) + Top Movers (gainers/decliners by Δ-vs-prior) from `getEntityTableData`, period-selectable. SPIFs / Alerts / Coaching / Goals are honest "not configured" empty states.
```
$ grep -cE "const activeSpifs|const badges|const alerts =|const coachingTips|const recommendations|const goals =" web/src/app/acceleration/page.tsx   # → 0 (data consts gone)
$ grep -cE "useState\(alerts\)|BadgeDisplay|CoachingCard" web/src/app/acceleration/page.tsx                              # → 0 (mock wiring/components gone)
# (the single remaining "Holiday Push" string is in the file's removal-note doc comment, not live content)
```

### O-8 — Naming & IA → PASS (code)
Page H1s now equal their nav labels; the breadcrumb (`VialuceTopbar` → `WORKSPACES` route labels, `Tenant › Section › Page`) propagates the same strings.
```
nav label (workspace-config)  →  page H1                 →  breadcrumb (derived)
Overview      /insights            "Overview"               BCL › Insights › Overview
Analytics     /insights/analytics  "Analytics"              BCL › Insights › Analytics
Attainment    /insights/performance"Attainment"             BCL › Insights › Attainment   ← disambiguated from agent
Compensation  /insights/compensation "Compensation"         BCL › Insights › Compensation
Trends        /insights/trends     "Trends"                 BCL › Insights › Trends
```
"Performance" no longer names both the agent and a sub-page.

---

## Build / test verification
```
npx tsc --noEmit          : 0 errors
npm run build             : ✓ Compiled successfully · ✓ 207/207 static pages (208→207, sales-finance removed)
                            (the "Dynamic server usage" lines are pre-existing cookie/request API-route logs, not failures)
npm test                  : tests 289 · pass 289 · fail 0
```
Dev-server / `localhost:3000` visual confirmation = architect (SR-44).

## Files
**New:** `lib/insights/dimension-discovery.ts`, `components/insights/PeriodCards.tsx`, `components/insights/DimensionBreakdown.tsx`, `scripts/ob322-verify.ts`, `scripts/ob322-dimension-proof.ts`.
**Changed:** `lib/insights/index.ts`, `components/insights/index.ts`, `app/insights/page.tsx`, `app/insights/analytics/page.tsx`, `app/insights/compensation/page.tsx`, `app/insights/performance/page.tsx`, `app/acceleration/page.tsx`, `lib/navigation/workspace-config.ts`, `lib/navigation/page-status.ts`, `next.config.mjs`.
**Deleted:** `app/insights/sales-finance/page.tsx`.

## PR
`gh pr create --base main --head ob-322-performance-visualization`. Architect merges (SR-44).
