# OB-227 COMPLETION REPORT

Insights Workspace Remediation + Platform Experience Defects

## Date / Branch
2026-06-21 · `ob-227-insights-remediation`

## SHA (commits in order)
| SHA | Phase |
|---|---|
| `1b7b0561` | Directive committed (Rule 14) |
| `e79c59f6` | Phase 1 — period root-cause fixes + investigation |
| `e3491342` | Phase 2 — intelligence data layer (`lib/insights/`) |
| `b4bcf857` | Phase 3 — shared visualization components (`components/insights/`) |
| `fa106111` | Phase 4 — onboarding checklist (D) + auto-detect periods (C) |
| `b2548c4e` | Phase 5 — Trends page real-data rebuild |
| `d237a34c` | Phase 5 — Compensation period selector + rich entity table |

## Files changed
**New:** `lib/insights/{types,periods,distribution,trajectory,entity-table,tenant-state,index}.ts` (7); `components/insights/{PeriodSelector,SummaryHero,TrendLine,DistributionChart,ComponentBars,EntityTable,OnboardingChecklist,InsightsLayout,index}.tsx` (9); `docs/diagnostics/OB-227_INVESTIGATION.md`; `docs/vp-prompts/OB-227_DIRECTIVE_20260620.md`.
**Modified (period fixes + wiring):** `lib/drill-through/types.ts`, `lib/drill-through/entity-results.ts`, `components/operate/LifecycleCockpit.tsx`, `app/operate/lifecycle/page.tsx`, `contexts/operate-context.tsx`, `app/configure/periods/page.tsx`, `app/insights/trends/page.tsx` (full rebuild), `app/insights/compensation/page.tsx`.

`tsc --noEmit` exit 0; `next build` exit 0 (198 static pages).

---

## PREMISE CORRECTIONS (directive assumptions falsified — §5, reported faithfully)
1. **"6 of 7 Insights pages broken/empty, rebuild everything" — FALSE.** Live inventory: **6 of 7 are FUNCTIONAL with real `calculation_results` data** (OB-224/OB-226 already wired them via `@/lib/drill-through`). Only **Trends** was mock-only (zero data fetch); **Sales & Finance** is mock + feature-gated. → Per SR-34/AP-17, the work is **surgical fixes + the missing analytics layer**, not a wholesale rebuild of working pages. Rebuilding functional pages would have been adjacent-arm drift.
2. **"Compensation frozen on Oct-2025" — precise truth: frozen on November 2025**, caused by a label string-sort (Fix B), not a wrong data source.
3. **"Results page empty despite 510 rows" — INVERTED.** Not a page query bug, not 510 rows. BCL has **425** results (85 × 5 periods Nov–Mar). Cause = `operate-context` defaulting to the earliest period (October, uncalculated). Results page is the most feature-rich results surface → **Option A (keep), not redirect.**
4. **"BCL March 2026 = $58,406 / 510 rows" — STALE.** Live: **March 2026 = $49,911 / 85 entities**; per-period Nov $38,351 / Dec $52,961 / Jan $39,091 / Feb $44,581 / Mar $49,911; Oct $0 (uncalculated).
5. **`attainment` is NOT NULL** — it is `{"overall":0}` (degenerate). Rendering attainment % from the column shows 0% for everyone; the Performance page therefore correctly buckets payout tiers, not the degenerate attainment column.
6. **No `(dashboard)` route group**; pages are flat under `src/app/insights/*`. **No prior `InsightsLayout`/`PeriodSelector`.** Charting = **recharts 2.15.4**. Vialuce palette = indigo `#4446B8` + gold `#E8A838` + green/red (**no teal/blue token**).

---

## Cluster B — period mismatch (root-caused + fixed; HALT-1 resolved)
Three distinct bugs, all "ordering/parse not driven by `periods.start_date`" (Decision 92/93):
- **Fix A — Cockpit pills one month early.** `LifecycleCockpit.tsx` + `operate/lifecycle/page.tsx` `formatLabel` parsed date-only strings as UTC midnight → rendered the prior month in negative-offset zones (CDMX "Oct"→"Sep"). Now prefer the DB `p.label`; TZ-safe fallback (`+'T00:00:00'`).
- **Fix B — Compensation/analytics/my-team frozen period.** `getPeriodsWithResults` sorted by `label.localeCompare` (string) → `periods[0]` = "November 2025" not "March 2026". Now selects `start_date` and sorts chronologically DESC. **Fixes all 8 callers** (compensation, my-team, analytics, performance, approvals, people, transactions, ManagerDashboard) — one AP-17 path. `PeriodOption.start_date` added (additive).
- **Fix C — Results table empty.** `operate-context` auto-selected `loaded[0]` = earliest (October, uncalculated). Now defaults to the **latest period that has results**.

**HALT-1:** NOT triggered — both Cockpit and `/configure/periods` read the same `periods` table; the mismatch was a client-side label bug, not a divergent architecture.

## Cluster C — auto-detect periods (Critical Blocker B1)
`/configure/periods` gains an **"Auto-detect from data"** button (both Vialuce + legacy headers) → `POST /api/periods/detect` (reads `committed_data.source_date` server-side) → a confirmation panel listing detected periods (label, range, type, record count; excludes existing) → `POST /api/periods/create-from-data` → table refresh. "No data uploaded yet" fallback (R-8). Manual "+ Create Period" preserved.

## Cluster D — onboarding checklist (blank tenant landing)
`LifecycleCockpit`'s blank "No periods configured" state now renders the **OnboardingChecklist**: a 6-step journey (plan → data → periods (+auto-detect) → calculate → results → approve) with ✓/●/○ status from `getTenantOnboardingState`, CTAs routing to the real pages, plus three value-prop cards. Additive + BCL-safe (BCL has periods → never hits the branch; onboarding fetch fails closed to the prior state).

---

## Data layer (`lib/insights/`) — built ABOVE OB-224 (AP-17, HALT-2-guarded, Decision 158 deterministic)
| Function | Interface |
|---|---|
| `getCalculatedPeriods(tenantId)` | `PeriodSummary[]` — periods-with-results, start_date DESC, + total/avg/min/max/entity_count/lifecycle |
| `getPayoutDistribution(tenantId, periodId, bins)` | `DistributionResult` — histogram + mean/median/std/zero-count |
| `getComponentTotals(tenantId, periodId)` | `ComponentTotal[]` — per-component cost allocation % |
| `getEntityTrajectory(tenantId, entityId?)` | `EntityTrajectory[]` — DS-015 delta@2 / velocity@3 / direction |
| `getPopulationTrend(tenantId)` | `PopulationTrendPoint[]` — total/avg per period |
| `getEntityTableData(tenantId, periodId, opts)` | `EntityTableResult` — search/sort/variant/component filter/server-pagination + top_component + delta_prior |
| `getTenantOnboardingState(tenantId)` | `TenantOnboardingState` — 6-step COUNTs |

All reuse `getEntityResults`/`getPeriodsWithResults` (HALT-2-safe Array|Object component shapes; EPO-first/CR-fallback; **no `lifecycle_state='COMMITTED'` gate** — all BCL batches are PREVIEW).

**HALT-2:** CONFIRMED REAL (not a halt — guarded): `calculation_results.components` is an **Array** for BCL, an **Object keyed by name** for Sabor; `breakdownToRecord` normalizes both.

## Visualization components (`components/insights/`) — one set, recharts + Vialuce
`PeriodSelector`, `SummaryHero`, `TrendLine`, `DistributionChart`, `ComponentBars`, `EntityTable` (inline OB-224 `ComponentCards` drill-through), `OnboardingChecklist`, `InsightsLayout`.

## Page builds
- **Trends** — REBUILT from 619 lines of mock to real cross-period trajectory (population trend + per-entity direction/velocity table + per-component trend lines); honest empty state.
- **Compensation** — period selector added (no longer single-period) + flat "Components: N" table replaced with the rich `EntityTable` (search/sort/Δ/top-component/pagination/drill-through). Donut + summary cards now refetch per selected period.
- **Overview / Analytics / Performance / My Team** — already FUNCTIONAL; Fix B corrects their (shared) period source so they now bind to the true latest period. Applying the new SummaryHero/Distribution/ComponentBars treatment to these is an enhancement, not a defect fix (see Remaining).
- **Sales & Finance** — mock + feature-gated off for BCL (out of scope: Financial Module).

## Cross-period verification (BCL, data-layer — live `getCalculatedPeriods`)
```
March 2026    total $49,911 | 85 entities | avg $587 | min $238 max $1,205   <- periods[0] (Fix B correct)
February 2026 total $44,581 | 85 entities | avg $524
January 2026  total $39,091 | 85 entities | avg $460
December 2025 total $52,961 | 85 entities | avg $623
November 2025 total $38,351 | 85 entities | avg $451
```
Distribution (March): mean $587, median $555, std $204, 8 bins, 0 zero-payout. Components (March): Colocación 50.6% / Captación 29.1% / Cumplimiento 17.1% / Productos Cruzados 3.2%. Trajectory: 85 entities, direction/velocity computed. (Browser-visual confirmation is the architect channel, SR-44 / SR-43; **March = $49,911, not the stale $58,406**.)

## Results Table disposition
**Option A (kept + unblocked).** The 1076-line results page carries unique anomaly/regime/5-layer-drill logic; its BCL empty state was the `operate-context` period-default bug (Fix C), now resolved — not a redirect candidate.

## HALT activations
None. HALT-1 resolved (shared `periods` source). HALT-2 confirmed real and guarded (`Array.isArray` normalization).

## Remaining (honest scope — the directive spans multiple PRs)
- Applying SummaryHero/DistributionChart/ComponentBars to the already-functional Overview/Analytics/Performance/My-Team pages (enhancement, not a defect; they render real data today and now bind the correct period). R-1 (attainment degenerate → Performance keeps payout-tier buckets). Sales & Finance remains gated (Financial Module out of scope). These are additive follow-ons that reuse the shipped `lib/insights` + `components/insights`.

*OB-227 — Insights Workspace Remediation + Platform Experience Defects.*
