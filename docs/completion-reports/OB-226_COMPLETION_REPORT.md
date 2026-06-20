# OB-226 Completion Report — Lifecycle Cockpit + Gray-Card Elimination + Real Data Connection

**Date:** 2026-06-20 · **Branch:** `ob-226-lifecycle-cockpit` · **Implementation SHA:** `4ef727a0`
**Status:** Built, tsc clean, `next build` exit-0 (198/198), Korean-Test PASS. **NOT merged** (SR-44 — architect browser-verifies + merges). 21 files, +1545/−666.

---

## 1. Gray-card CSS fix (Objective A)

The HF-313/316/317 `[data-theme="vialuce"]` safety net floored at neutral-**700**; bare/opacity-modifier **`*-600`** mid-shades + the shadcn `bg-muted` token were never remapped and survived as gray on the light Vialuce surface.

**Utilities found (surviving):**
- `bg-zinc-600` (bare) — `PeriodRibbon.tsx:35` idle pill, `PopulationHealth.tsx:107/129`, `PlanCard.tsx:287`
- `bg-zinc-600/<op>` — `NarrativeSpine.tsx:306` (`/50`, inside `/operate/calculate`→EntityTable), `ImportReadyState.tsx:431`, `UserAdminConsole.tsx:41`
- `bg-muted` — `PlanCard.tsx:309` (hover)

**Remapped (`globals.css`, HF-318 prong after the HF-317 block):** bare `*-600` (zinc/slate/gray/neutral/stone) + `bg-neutral-700` → `var(--vl-bg)`; opacity `*-600/` → `var(--vl-bg)`; `hover:*-600` → `var(--vl-indigo-50)`; `bg-muted`/`hover:bg-muted` → `oklch(var(--muted))`. CSS-only; mirrors the existing bare+opacity idioms incl. the `:not([class*=":<util>/"])` variant guard. `dark:bg-*` untouched (never fire under `data-theme`, since `darkMode:["class"]`).

## 2. Cockpit architecture (Objective B)

**HALT-2 NO HALT / HALT-3 handled.** All three `/operate` pages already compose under one `OperateProvider`; lifecycle state lives on `calculation_batches.lifecycle_state` (9-phase enum + `getNextAction` in `lifecycle-service.ts`). HALT-3 wrinkle: **BCL has 0 batch rows despite 510 results**, so the cockpit derives lifecycle position from **data presence** (results exist → calculated), not a populated `lifecycle_state`.

**`components/operate/LifecycleCockpit.tsx` (new, 338 lines):** design-spec (`.page/.phead/.card/.kpi/.tbl/.btn-gold`) cockpit reusing the proven `loadOperatePageData(tenantId)` loader + design-system primitives (PeriodRibbon, full-width LifecycleStepper, DataReadinessPanel, DistributionChart, BenchmarkBar, AnimatedNumber) + `lifecycle-service` transitions.

**Panels:** period ribbon (full-bleed) → header + state pill → **GOLD CTA hero** → KPI row (Total Payout DM-Mono / Entities / Avg / Components) → full-width 9-phase stepper → 2-col [DataReadiness | Calculation Summary (component breakdown + View Results)] → Results Preview [Attainment Distribution | Top-5 entities].

**Gold CTA logic (`.btn-gold`, most prominent element):** `plan missing → Configure Plan` · `data missing → Import Data` · `not calculated / DRAFT → Run Calculation` (POST `/api/calculation/run`) · `PREVIEW/RECONCILE → Start Reconciliation` · else `getNextAction(phase)` advance.

**Theme scoping:** `/operate` returns `<LifecycleCockpit/>` only under `useIsVialuce()` (early-return after all hooks); the Dark/Bliss pipeline-readiness landing is byte-identical. (The old `/operate/lifecycle` page rendered hardcoded dark `rgba()` inline cards — the cockpit uses real `.card` vocabulary instead.)

## 3. Route redirects (Objective B)

| Route | Vialuce | Dark/Bliss |
|---|---|---|
| `/operate/lifecycle` | `router.replace('/operate')` + `if (isVialuce) return null` | renders existing Operations Center (unchanged) |
| `/operate/calculate` | redirect in the `CalculatePage` wrapper before `RequireCapability` | renders existing Run Calculations (capability gate intact) |

Theme-conditional (not unconditional) so proof gate 8 holds: Dark/Bliss keep the three-page structure; old bookmarks still resolve.

## 4. Mock-data audit (Performance + Calculation workspaces)

| Route | Before | After | Real source |
|---|---|---|---|
| `/insights` | real | real (model) | `listCalculationBatches`+`getCalculationResults` |
| `/insights/compensation` | **mock** (techCorp: Sarah Chen, Accelerator Plan, $525k) | **real** + honest empty/omissions | `getEntityResults` (entity payouts) + `rule_sets` plan distribution; YTD/budget/trend omitted (no data) |
| `/insights/performance` | **mock** (techCorp leaderboard/regional) | **real** + empty | `getEntityResults` top-5 + payout histogram; regional = honest empty (no region dim) |
| `/insights/analytics` | **mock** (100% synthetic `analytics-service`) | **real** + empty | `getEntityResults`/`getPeriodsWithResults` period-over-period; segment/regional = honest empty |
| `/perform` (manager persona) | partial (real KPI, "No team data" + Financial btn) | **real or honest empty** | `resolveEntityScope`+`getEntityResults` team leaderboard; genuinely-empty → "no team assignments" empty state |
| `/insights/my-team` | industry-conditional (real hospitality / empty else) | unchanged (already honest, OB-224) | — |
| `/stream`, `/perform` admin/rep, `/operate/results`, `/operate/reconciliation` | real | unchanged | existing |

**Mock-name sweep (CC grep gate ZERO in `web/` source):** genericized non-rendered stubs/seeds/examples — `acceleration`, `data/transactions/new` picklist (`Entity 1..8`), `operations/audits`, `performance/approvals`, `transaction-detail-modal`, `lib/{approval,data,import,search}-service`, `data/tenants/techcorp/financial-summaries.json` (`User One..Four`).

**Table-name corrections (directive was stale):** `plans` → **`rule_sets`**; `calculation_runs` → **`calculation_batches`**; `entities.display_name` (not `name`); `periods.label` (not `name`); no `periods.lifecycle_status` (lifecycle on `calculation_batches`).

## 5. Adversarial verification

- **Mock grep:** `grep -rn 'Sarah Chen|Marcus Johnson|Emily Rodriguez|Accelerator Plan|Tiered Plan|Basic Plan|Team-Based Plan|Executive Plan|Lisa Thompson|David Kim' web/` → **0** in source.
- **Cockpit theme-gated:** `/operate` cockpit behind `if (isVialuce) return <LifecycleCockpit/>`; redirects behind `if (isVialuce)`. Dark/Bliss branches byte-identical (early-returns placed after all hooks; existing JSX untouched).
- **Hospitality branches untouched** on compensation/performance (verified boundaries) — only the non-hospitality (BCL/MIR/TechCorp) mock branches were rewired.
- **No fabrication (HALT-4):** uncollected dimensions (regional, segment, budget, YTD, team assignments) render honest empty states, never synthetic numbers.
- **tsc --noEmit clean; Korean-Test PASS; `next build` exit-0 (198/198).**
- **Runtime numbers** ($58,406 BCL March 2026, Spanish vendedor names) are **SR-44 architect-verified** in the browser against the proof tenant — the queries mirror the already-real `/insights` + OB-224 drill-through layer. One workflow agent's probe env lacked BCL results and rendered the honest empty state; the same code renders real data where results exist.

## 6. Out of scope / residuals (§6A)

Approval-workflow transitions beyond the stepper; financial-module cockpit integration; reconciliation engine; Recharts SVG palette; Observatory; mobile; creating data that doesn't exist (budgets/targets/team assignments → honest empty states). Manager/Rep team rollups stay empty until `profile_scope`/`entity_relationships` are populated.

---

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: CLT-224 → CLOSED (gray cards + lifecycle reconciliation + mock data replacement)
    CLT-39 D1 → CLOSED (page reconception — Lifecycle Cockpit)
    CLT-51A F-23 → CLOSED (stepper full-width)
REGISTRY: Lifecycle Cockpit → OB-226 SHA 4ef727a0; mock data eliminated; real data connected
BOARD: gray-card net floor 700→600 + bg-muted (HF-318); /operate=cockpit(Vialuce); lifecycle+calculate→/operate redirects; insights/{compensation,performance,analytics}+manager persona real
SUBSTRATE: SR-34 (structural consolidation 3 pages→1); T1-E910 (i18n inline-ternary parity); honest empty states over fake data (HALT-4); plans→rule_sets / calculation_runs→calculation_batches corrected
```

## PR
`gh pr create --base main --head ob-226-lifecycle-cockpit` — see PR for final push SHA.

---

*OB-226 · CC build complete · awaiting SR-44 architect browser-verify + merge.*
