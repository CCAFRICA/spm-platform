# HF-344 — Completion Report

**Persona-Conditional Panel Rendering: Display-Layer Scoping**
*2026-06-26 · vialuce.ai · Intelligence. Acceleration. Performance.*
*Substrate: DS-013 · DS-014 §8.2 · Decision 123 · DD-7 · Drafting: INF_Structured_Compliant_Drafting_Reference_20260513.md*

---

## Summary

When the VL admin persona switcher selects **Rep** or **Manager**, ICM/Intelligence pages rendered tenant-wide aggregate panels (Period Total, System Health, Top Accelerator, Population Distribution, leaderboards, per-period payout totals) — numbers a rep or manager must never see. HF-344 is the **display-layer interim** that makes the persona-switcher walkthrough correct NOW: when persona is rep/manager, tenant-wide panels are hidden and only the persona-specific dashboard (`/perform`) or a reduced state (Intelligence pages) renders. **Admin view is byte-identical to pre-HF-344 (DD-7).**

This is **NOT** an authorization fix — it changes what RENDERS, not what data is ACCESSIBLE. The platform-wide authorization OB (close `ALL_INSIGHTS_SCOPE`, fail-closed scope reader, server-side scope re-derivation, capability-derived navigation), fed by DIAG-077, remains separate, larger scope.

- **Branch:** `hf-344-persona-conditional-panel-rendering` (fresh from `main` HEAD `cfb1ee97`).
- **Blast radius:** 8 page files only. Zero changes to `lib/`, `contexts/`, `hooks/`, `api/`, navigation, permissions, or dashboard components.
- **Approach:** Option A (display-layer conditional gating) — see `docs/diagnostics/HF-344_ADR_G0.md` (committed BEFORE code per Section B gate).

---

## HALT evaluation

| HALT | Condition | Result |
|---|---|---|
| HALT-A | `usePersona`/`effectivePersona` not available on affected pages | **Not triggered** — every affected page resolves persona (directly via `usePersona`, or indirectly via `usePersonaTheme` which reads `usePersona`). `PersonaProvider` is wrapped on all of them. |
| HALT-B | `RepDashboard`/`ManagerDashboard` deleted/renamed | **Not triggered** — both exist at `components/dashboards/` and render on `/perform`. |
| HALT-C | Structure forces a >3-file component extraction | **Not triggered** — Phase 0 verified every affected page is surgical (tenant-wide panels are contiguous, discrete JSX blocks gateable in-file). |
| HALT-D | `main` HEAD ≠ `9cda286b` | **Evaluated, does not fire.** HEAD is `cfb1ee97`, which differs from `9cda286b` by exactly ONE docs-only commit (DIAG-077 spatial map, +1061 lines, no code). HF-343 code artifacts (`resolveAuthenticatedScope`, `useAuthScope`, `scopeIsDeny`) are **absent** — the revert held. HALT-D's trigger ("HF-343 changes present") is false. The DIAG-077 doc is the architect's authoritative scope map and informs this HF. |

---

## PG-0 — Phase 0 page inventory (complete affected-page map)

Phase 0 analyzed 11 candidate pages (parallel codebase map). Confirmed scope:

### IN SCOPE — 8 ICM/Intelligence pages

| Page | File | Shared tenant-wide panels gated | Persona surface for rep/manager | Persona read |
|---|---|---|---|---|
| `/perform` | `app/perform/page.tsx` | Financial banner, PeriodCards, header count, HeroMetric "Period Total", Stats, "Period Finding", "Data Quality", "Compensation by Component", "Payout Distribution", "Period Lifecycle", "AI Findings" | **RepDashboard / ManagerDashboard** (unchanged, self-gated) | `usePersona().persona` (l.114) |
| `/stream` | `app/stream/page.tsx` | header count, PeriodCards, System Health hero, Lifecycle, Population Trajectory, Accelerators, Component Trajectories, Optimization, Population Distribution, Learning Confidence, DrillThroughPanel | persona-scoped **InsightNarrative** + reduced state | `usePersonaTheme().persona`→`isAdmin` (l.456) |
| `/insights` | `app/insights/page.tsx` | PeriodCards, header count, HeroMetric/Stats/Component/Top Performers/Distribution | reduced state | `usePersonaTheme().persona` (l.55) |
| `/insights/compensation` | `app/insights/compensation/page.tsx` | PeriodCards, money-lens body (HeroMetric/Stats/Component/Dimension/Distribution/EntityTable) | reduced state | `usePersonaTheme().persona` (l.106) |
| `/insights/performance` | `app/insights/performance/page.tsx` | PeriodCards, standings body (IntelligenceElement/Stats/HorizontalBar/Distribution/HotCold/Pacing) | reduced state | `usePersonaTheme().persona` (l.123) |
| `/insights/analytics` | `app/insights/analytics/page.tsx` | header+Export, PeriodCards, Stats, Dimension Breakdown, trend charts, EntityTable | reduced state | `usePersonaTheme().persona` (l.64) |
| `/insights/trends` | `app/insights/trends/page.tsx` | header latest-amount, Population Direction, Trend area, Trajectory, Movers, Component Trends, Entity Trajectory table | reduced state | `usePersonaTheme().persona` (l.79) |
| `/acceleration` | `app/acceleration/page.tsx` | header count, PeriodCards (→PeriodSelector), Stat grid, Top Performers, Top Movers, Component Coaching | rep "My Rank" (own-relative) + honest-empty config cards | `usePersona().persona` (l.63) |

### EXCLUDED (with reason)
- `/my-compensation` (+ re-export `/perform/compensation`) — own-entity scoped (`extractEmployeeId(user.email)`); no tenant aggregates.
- `/perform/statements` — entity-scoped at the read layer (`scope.entityIds`/`entityId`).
- `/insights/my-team` (+ re-export `/perform/team`) — renders the hospitality/restaurant branch (Financial, separate scope per DIAG-077 §5.F); does not import persona; non-hospitality branch already attempts `resolveEntityScope`.
- **Hospitality branches inside `/insights/compensation` and `/insights/performance`** — DIAG-077 tags these "Financial — separate scope"; left untouched.
- `/financial/*` (11 pages) — Financial separate scope (DIAG-077 §5.F).
- `/operate/*` — `RequireCapability`-gated admin/calculate-workspace surfaces (DIAG-077 §5.C "correctly admin-scoped"); a real member cannot reach them.

---

## PG-1 — Admin persona rendering UNCHANGED (DD-7 behavior preservation)

Every gated block wraps the original JSX so that when `persona === 'admin'` the exact prior content re-renders. A fragment adds no DOM. Example (`/perform` Branch 4):

```jsx
{persona === 'admin' && (
  <>
    {/* Dominant: authoritative Period Total + supporting tiles */}
    <div className="grid gap-4 lg:grid-cols-4"> … HeroMetric "Period Total" … </div>
    <IntelligenceElement label="Period Finding" … />
    {validity && <Panel title="Data Quality"><ValidityVerdict … /></Panel>}
    <Panel title="Compensation by Component"><StackedBar … /></Panel>
    <DensityGate min="high"><Panel title="Payout Distribution"><DistributionPosition … /></Panel></DensityGate>
    <Panel title="Period Lifecycle"><ConfigurablePipeline … /></Panel>
    <DensityGate min="high"><Panel title="AI Findings"><StubAction … /></Panel></DensityGate>
  </>
)}
```
When `persona === 'admin'` this renders identically to the pre-HF-344 page (financial banner, PeriodCards, full DS-003 composition, AdminDashboard). The persona-dashboard dispatch block (`{persona==='admin' && <AdminDashboard/>}` …) was left **unchanged**.

Verified by adversarial review (see §Adversarial Review) and by `git diff` showing only additive conditional wrappers around verbatim original JSX.

## PG-2 / PG-3 — Rep & Manager: shared tenant-wide panels hidden

`/perform` (rep AND manager): the financial banner, PeriodCards, header count, and the entire ICM tenant-wide block are wrapped in `persona === 'admin'`; rep/manager fall through to **only** their persona dashboard:
```jsx
{hasFinancial && financialData && persona === 'admin' && ( <FinancialPerformanceBanner … /> )}
{persona === 'admin' && hasICMResults && ( <PeriodCards … /> )}
{persona === 'admin' && ( <> …all ICM tenant-wide panels… </> )}
{insights.total > 0 && (
  <DensityGate min="low">
    {persona === 'admin' && <AdminDashboard />}
    {persona === 'manager' && <ManagerDashboard />}
    {persona === 'rep' && <RepDashboard />}
  </DensityGate>
)}
```
`/stream` (rep AND manager): the persona-scoped `InsightNarrative` stays; everything tenant-wide is gated on `isAdmin`, plus an explicit `{!isAdmin && <Panel>…reduced…</Panel>}`. Each Intelligence page (`/insights`, `/insights/compensation`, `/insights/performance`, `/insights/analytics`, `/insights/trends`) wraps its whole tenant-wide body in `theme.persona === 'admin' ? (…) : (<reduced Panel>)`. `/acceleration` gates the Stat grid, Top Performers, Top Movers, and Component Coaching on `persona === 'admin'` (the last was previously manager-visible at `DensityGate min="medium"` — now admin-only, closing the manager leak), and swaps PeriodCards for the amount-free `PeriodSelector`.

## PG-4 — RepDashboard / ManagerDashboard entity-data ($0 diagnosis)

**The fix for the $0 is OUT of HF-344's blast radius (PG-6 forbids persona-context; PG-7 forbids the dashboards and persona-queries). Diagnosed, not fixed — residual for the authorization OB.**

Call sites (read-only trace):
- `RepDashboard.tsx:103` `const { entityId } = usePersona();` → `:133` `getRepDashboardData(tenantId, entityId)`.
- `persona-context.tsx:214-228` — for a VL admin previewing **rep**, scope resolution picks a *sample* individual entity: `entities` where `entity_type='individual'` LIMIT 1 (no ordering), and `setEntityId(sampleIndividual.id)`.
- `persona-queries.ts:332-342` (`getRepDashboardData`) — falls back to the top-performing entity **only when `entityId` is null**. The non-null *sample* id is used directly: `entity_period_outcomes.eq('entity_id', resolvedEntityId)`. If that arbitrary sample individual has **no outcome row** for the current period, `myOutcome` is null → `totalPayout: 0`, empty components, `rank: 0` → **$0 across all components**. The non-null sample DEFEATS the function's own null-fallback.
- `ManagerDashboard.tsx:165` guards `if (scope.entityIds.length === 0 && !scope.canSeeAll) return` (no brand → empty). `:172` `getManagerDashboardData(tenantId, scope.entityIds, scope.canSeeAll)` with `scope.entityIds` = brand **location** ids (persona-context manager path). `persona-queries.ts:270-275` queries `entity_period_outcomes.in('entity_id', locationIds)` — outcomes are keyed by **individual** entities, not locations → empty → `teamTotal: 0` / 0 members ("$0 across 0 entities").

**Root cause:** persona-context's demo scope resolution (sample individual / brand-location ids) is mis-keyed against `entity_period_outcomes` (keyed by the calculated individual entities). This is a scope-producer/keying defect in `persona-context.tsx` + the cross-table linkage — exactly the "fail-open scope reader + unpopulated producer" gap DIAG-077 §6 AP4 assigns to the subsequent OB. No in-blast-radius code fix exists (the call site is inside the dashboard components, which PG-7 forbids touching). Reported as Residual #1.

## PG-5 — Period Ribbon treatment

`PeriodCards` renders `format(p.total_payout)` per period (`PeriodCards.tsx:61`) — a tenant payout amount. Treatment:
- `/perform`, `/stream`, `/insights`, `/insights/compensation`, `/insights/performance`, `/insights/analytics`: PeriodCards is inside the admin-only gate → **hidden** for rep/manager.
- `/insights/trends`: no PeriodCards on this surface (spans all periods).
- `/acceleration`: PeriodCards (amounts) for admin; rep/manager get the **amount-free `PeriodSelector`** (label + lifecycle badge only — `PeriodSelector.tsx`), preserving period context for "My Rank" without leaking totals.

## PG-6 — Zero changes to auth/persona/navigation context, permissions, workspace-config

## PG-7 — Zero changes to AdminDashboard / ManagerDashboard / RepDashboard / persona-queries

```
$ git diff --name-only
web/src/app/acceleration/page.tsx
web/src/app/insights/analytics/page.tsx
web/src/app/insights/compensation/page.tsx
web/src/app/insights/page.tsx
web/src/app/insights/performance/page.tsx
web/src/app/insights/trends/page.tsx
web/src/app/perform/page.tsx
web/src/app/stream/page.tsx
```
8 page files only. Grep for forbidden files (`persona-context`, `auth-context`, `navigation-context`, `workspace-config`, `permissions`, `persona-queries`, `*Dashboard.tsx`) in the changed set → **none**. (`docs/` ADR + this report are documentation, not code.)

## PG-8 — `npm run build` exits 0

```
kill dev → rm -rf .next → npm run build → BUILD_EXIT=0
```
Full route table rendered (e.g. `ƒ /stream 27.2 kB / 382 kB`; all 8 affected routes compiled). The `[…] Dynamic server usage` lines in the log are pre-existing Next.js informational notices for `/api/*` routes (cookies/`request.url`), unrelated to these page changes; the build still exits 0. `tsc --noEmit -p tsconfig.json` → **0 errors** (JSX balance + types valid on all 8 pages).

## PG-9 — `localhost:3000` responds

```
✓ Next.js 14.2.35 — Ready in 1264ms
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/         → 307 (auth redirect, expected unauthenticated)
  /perform → 307   /stream → 307   /acceleration → 307
```
Server responds; routes resolve through middleware with no 500. Runtime page compilation is additionally proven by the successful production build (PG-8). No dev-server compile errors for the affected routes.

## PG-10 — PR created

**https://github.com/CCAFRICA/spm-platform/pull/603** — `HF-344: Persona-conditional panel rendering — display-layer scoping` (base `main`, head `hf-344-persona-conditional-panel-rendering`).

---

## Adversarial review (independent per-page verification)

A second workflow ran one skeptical reviewer per edited page, each tasked to find an admin-panel accidentally hidden, a tenant-wide panel still visible to rep/manager, an unbalanced wrapper, or a blast-radius violation.

| Page | adminByteIdentical | repManagerNoTenantLeak | jsxBalanced | blastRadiusOk | Verdict |
|---|---|---|---|---|---|
| `/perform` | ✓ | ✓ | ✓ | ✓ | **PASS** |
| `/stream` | ✓ | ✓ | ✓ | ✓ | **PASS** |
| `/insights` | ✓ | ✓ | ✓ | ✓ | **PASS** |
| `/insights/compensation` | ✓ | ✓ | ✓ | ✓ | **PASS** |
| `/insights/performance` | ✓ | ✓ | ✓ | ✓ | **PASS** |
| `/insights/analytics` | ✓ | ✓ | ✓ | ✓ | **PASS** |
| `/insights/trends` | ✓ | ✓ | ✓ | ✓ | **PASS** |
| `/acceleration` | ✓ | ✓ | ✓ | ✓ | **PASS** |

All 8 reviewers returned **PASS** with zero leaks. Notable findings confirmed correct: `/perform` AdminDashboard still renders from the un-wrapped persona block; `/stream` drill region is only triggerable from movers inside the admin gate (rep/manager can never open it) and `streamNarrative` correctly remains for all personas (persona-scoped, not tenant-wide); `/acceleration` "My Rank" preserved for rep. One **non-blocking** observation: `/perform` Branch 3 ("Ready to calculate", no-results onboarding state) still shows a configured-entity count + the dual-module Financial banner to all personas — this is outside the documented Branch-4 tenant-wide-results problem (an onboarding message + a deferred-Financial element, both rule-excluded), left deliberately to keep the change confined to the validated plan.

---

## Residuals

1. **RepDashboard / ManagerDashboard $0 (data-state, out of blast radius).** persona-context resolves the rep demo scope to an arbitrary sample individual entity (which may have no outcome row, defeating `getRepDashboardData`'s null-fallback) and the manager demo scope to brand *location* ids (mis-keyed vs `entity_period_outcomes`, keyed by individuals). Fixable only in `persona-context.tsx` (PG-6) / the cross-table linkage / data state — belongs to the authorization OB (DIAG-077 §6 AP4). Diagnosed in PG-4.
2. **DIAG-077 platform-wide authorization OB** remains the prerequisite for the real fix (close `ALL_INSIGHTS_SCOPE`, fail-CLOSED reader, server-side scope, capability-derived navigation).
3. **Hospitality/Financial branches** inside `/insights/compensation`, `/insights/performance`, and `/insights/my-team` are deferred to the Financial persona directive (DIAG-077 §5.F).
4. **PDR-05** (persona-switcher integration) unchanged.
5. **Sidebar/navigation** unchanged (§6 out of scope) — the rail still shows all workspaces under the VL admin switcher; capability-derived navigation is OB scope.

---

*HF-344, Persona-Conditional Panel Rendering — display-layer scoping*
*Substrate: DS-013 · DS-014 §8.2 · Decision 123 · DD-7*
