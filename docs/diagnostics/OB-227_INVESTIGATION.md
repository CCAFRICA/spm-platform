# OB-227 Phase 1 — Investigation + Period Fix

**Date:** 2026-06-20 · **Branch:** `ob-227-insights-remediation` · **Method:** 6-agent investigation workflow + direct code/DB verification (TZ-pinned probes).

## Premise corrections (directive assumptions falsified — reported per §5)

1. **"6 of 7 Insights pages broken/empty, rebuild everything" — FALSE.** 6 of 7 are **FUNCTIONAL with real data** (OB-224/OB-226 already wired them via `@/lib/drill-through`). Only **trends** is mock-only (zero data fetch); **sales-finance** is mock + feature-gated (`useFeature('salesFinance')`). All 7 are client components (`use client`/`useEffect`), gate styling via `useIsVialuce`. → Scope is **surgical fixes + enhancements**, not wholesale rebuild (SR-34, AP-17).
2. **"Compensation frozen on Oct-2025" — precise truth: frozen on November 2025**, caused by the `getPeriodsWithResults` label string-sort (Fix B), not a wrong data source. October is excluded (no results).
3. **"Results page shows empty despite 510 rows" — INVERTED.** Not a page query bug, not 510 rows. BCL has **425** calculation_results / 425 entity_period_outcomes (85 × 5 periods Nov–Mar). Cause = `operate-context` defaulting `selectedPeriodId` to the **earliest** period (October, zero batches) → `selectedBatchId=null` → empty render (Fix C). The results page is the most feature-rich results surface — **Option A (keep + wire), not redirect.**
4. **"BCL March 2026 = $58,406 / 510 rows" — STALE.** Live: **March 2026 = $49,911 / 85 entities**. Per-period: Oct $0/0 (uncalculated), Nov $38,351, Dec $52,961, Jan $39,091, Feb $44,581, Mar $49,911. (`$58,406` matches no BCL period.)
5. **`attainment` is NOT NULL** for BCL — it is `{"overall":0}` (degenerate). Rendering attainment % from the column shows 0% for every entity. Real per-component detail lives in `calculation_results.metadata.roundingTrace.components[]` + `components[].payout`.
6. **No `(dashboard)` route group** (directive example wrong) — pages are flat under `src/app/insights/*`; the grouping is the nav group `id:'insights'` under the "Performance (decide)" workspace. **No `InsightsLayout`/shared `PeriodSelector` exists.** Charting = **recharts 2.15.4** (only dep, 25 files). Vialuce palette = indigo `#4446B8` + gold `#E8A838` + green/red (**no teal/blue token**); charts use `oklch(var(--chart-1..5))` / `--vl-` discretes.
7. **HALT-2 CONFIRMED REAL** (no halt — guarded): `calculation_results.components` JSONB is an **Array** for BCL `[{payout,componentId,componentName,componentType}]` but an **Object keyed by name** for Sabor `{base_commission:{…}}`. Every reader MUST branch on `Array.isArray(components)`.
8. **HALT-1 RESOLVED (no halt):** the Cockpit reads the same `periods` table (Decision 92/93). The mismatch is a client-side TZ label bug, not a divergent source.

## Cluster B — period bugs (three distinct root causes, all fixed this phase)

| Fix | File:line | Root cause | Fix |
|---|---|---|---|
| **A — Cockpit pills wrong month** | `components/operate/LifecycleCockpit.tsx:87,332` + `app/operate/lifecycle/page.tsx:87,673` | `formatLabel` does `new Date("2025-10-01")` → UTC midnight → renders one month early in negative-offset zones (CDMX: "Oct"→"Sep"); discards the correct DB `p.label` | prefer `p.label`; TZ-safe fallback `new Date(startDate+'T00:00:00')` |
| **B — Compensation/analytics/my-team frozen period** | `lib/drill-through/entity-results.ts:165-168` | `getPeriodsWithResults` sorts by `label.localeCompare` (string) → "November 2025" ranks above "March 2026" → `periods[0]` is wrong | select `start_date`; sort `start_date` DESC (chronological). `PeriodOption.start_date` added (additive). Fixes all 8 callers (compensation, my-team, analytics, performance, approvals, people, transactions, ManagerDashboard) — single AP-17 path |
| **C — Results table empty** | `contexts/operate-context.tsx:214-219` | auto-selects `loaded[0]` = earliest period (October, uncalculated) → `selectedBatchId=null` | default to the **latest period that has results**, fallback latest overall |

**Why not** committed_data.source_date / date-window: that would re-introduce divergence from `/configure/periods` (Decision 92/93). The fix keeps the `periods` table as SSOT.

## Substrate truth (verified live, for the data layer)

- `periods` cols: `id, tenant_id, label, period_type, status, start_date, end_date, canonical_key, metadata`. **No lifecycle/state column** (only `status`, all BCL='open'); `canonical_key='YYYY-MM'`; `start_date` = first-of-month, date-only.
- Payout tables: **`entity_period_outcomes`** (canonical/materialized: `total_payout, component_breakdown, lowest_lifecycle_state, attainment_summary`) and **`calculation_results`** (`total_payout, components, metrics, attainment, metadata.roundingTrace`). For BCL both agree exactly. **Do NOT gate on `lifecycle_state='COMMITTED'`** — all BCL batches are PREVIEW; that filter empties everything.
- Reuse targets (AP-17): `getEntityResults(tenantId, scope, {periodId})` (entity-results.ts:92 — EPO-first, CR fallback, date-agnostic), `getCommissionStatement(supabase, tenantId, entityId, periodId)` (commission-statement.ts:131 — null-safe), `getPeriodsWithResults` (now corrected). Currency via `useCurrency().format`.
- OB-224: `DrillThroughPanel` (props `tenantId`+`scope` required; `periodId` optional) consumes `EntityResultsList`/`ComponentCards`/`TransactionRows`/`DisputeInline`. Mount pattern: `scope=resolveEntityScope(user?.id)`.

## Build sequencing
1. ✅ Period fixes (this phase) — unblocks compensation/analytics/my-team/results.
2. Intelligence data layer (`lib/insights/`) — reuse getEntityResults/getCommissionStatement; `Array.isArray(components)` guard; no lifecycle gate.
3. Shared viz components (`components/insights/`) — recharts + Vialuce branch (`oklch(var(--chart-N))`).
4. Platform fixes — auto-detect (`/api/periods/detect` reads committed_data server-side), OnboardingChecklist on /operate, Results table Option A.
5. Pages — trends real-data rebuild (heaviest); PeriodSelector across pages; enhancements where they add value (do NOT rebuild functional pages).

## Verified per-period substrate (BCL)
| period | total_payout | entities |
|---|---|---|
| October 2025 | $0 | 0 (uncalculated) |
| November 2025 | $38,351 | 85 |
| December 2025 | $52,961 | 85 |
| January 2026 | $39,091 | 85 |
| February 2026 | $44,581 | 85 |
| March 2026 | $49,911 | 85 |
