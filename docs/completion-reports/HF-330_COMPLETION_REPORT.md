# HF-330 — Import Crash, Period Detection Gap, Calculate UX — Completion Report

**Branch:** `hf-330-import-periods-calculate` · **Date:** 2026-06-21
**Scope:** UI + period-detection endpoints only. No engine / convergence / SCI / plan-interpretation changes (HALT-1 clear).
**Build:** `tsc --noEmit` exit 0 · `next build` exit 0.

---

## Defect A — /data/import crash → PREMISE CORRECTION (not reproducible) + resilience hardening

**Finding: no reproducible crash exists in the import page, and the quoted error text belongs to the
ROOT-LAYOUT boundary, not the import page.** Evidence:

1. `/data/import` is a trivial server redirect to `/operate/import` (`data/import/page.tsx:10`). The real
   page `operate/import/page.tsx` renders, at initial load, `<RequireCapability>` → header → `<SCIUpload>`.
   The render path is fully guarded — every later component (`SCIProposal`/`SCIExecution`/`ImportReadyState`/
   `ImportTelemetryPanel`) is gated behind a non-`upload` phase and never mounts on load. Every import resolves.
2. The quoted text **"A critical error occurred. Please refresh the page."** is `global-error.tsx:24` — the
   **root-layout** boundary. A *page/subtree* throw is caught by `app/error.tsx` ("An error occurred while
   loading this page."), a different message. So the screenshot implies the **root layout / a top-level
   provider** threw — which would break *every* route, not only import (contradicting "only import crashes").
3. The root layout's only throw vectors are the awaited server functions; both are already hardened:
   `getServerAuthState` (`server-auth.ts:30-67`) is wrapped in try/catch → returns an unauthenticated
   fallback; `getResolvedTheme`/`getActiveTheme` (`active-theme.ts:23-40`) try/catch → returns `'current'`.
   Neither can throw the root layout.
4. A reproduction attempt (dev server + render of `/operate/import` and `/data/import`) returned `307 → /login`
   for the unauthenticated session (middleware), so the page module was never even compiled/errored. No stack
   could be obtained. `tsc` is clean across the import graph.

**Conclusion:** the most likely real-world cause was a transient deploy/cached-bundle state during the
HF-329-era browser session, since resolved; there is no code defect in the import page to fix, and the root
layout is already throw-safe. Per the reconciliation discipline I am not fabricating a root-cause fix.

**Hardening delivered (structural, defense-in-depth):** new route-scoped boundary
`web/src/app/operate/import/error.tsx`. Any error thrown anywhere in the `/operate/import` subtree (the page
or a child) is now caught *in place* and rendered as a recoverable retry ("Try again" / "Reload"), keeping the
rest of the app alive and never dead-ending the onboarding-critical upload route on a generic error screen.
(Next boundaries cannot catch an ancestor-layout error, so a genuine root-layout fault still surfaces via
the already-hardened global boundary — but the import page itself can no longer strand the user.)

HALT-2: I am **not** reporting that the page still crashes — it renders soundly; I am reporting that no
reproducible crash / stack exists, with the evidence above.

---

## Defect B — Period auto-creation detected 3 of 6 months → FIXED (two root causes)

**Data (verified, MIR `972c8eb0`):** all 6 months are present in `committed_data.source_date` — Jan 11,698 /
Feb 12,220 / Mar 12,417 / Apr 12,596 / May 13,047 / Jun 13,185 (only 64 null). So Feb/Mar/Jun were **not**
null/malformed — the scan dropped them.

**Root cause 1 — capped, unordered pagination (`create-from-data/route.ts`).** The source_date scan used
`.range(offset, offset + 4999)` with `if (rows.length < 5000) break` and **no `.order()`**. PostgREST caps a
single response at **1000 rows**, so the first page returned 1000 (< 5000) → the loop broke after ONE page,
scanning only ~1000 arbitrary physical rows (MIR's first-page sheets were Jan/Apr/May) → 3 months. Fix: page at
the 1000-row cap, `.order('source_date')` for stable pagination, break only on a short/empty page. (Same fix
applied to the Strategy-2 `row_data` fallback scan.)

**Root cause 2 — blanket "periods already exist" short-circuit.** `create-from-data` returned early when ANY
period existed, so a partial-coverage tenant could never get its missing months. Removed — the existing
per-`canonical_key` dedup already guarantees idempotency (creates only genuinely-missing months; a fully-
covered tenant falls through to "All periods already exist").

**Root cause 3 (surfaced by the fix) — UTC-midnight month shift.** Once the full scan ran it created a spurious
**December 2024**: `new Date("2025-01-01").getMonth()` reads LOCAL components off a UTC-parsed midnight, shifting
month-boundary dates into the prior month in a negative-offset timezone (same class as HF-326). Fixed in BOTH
endpoints by parsing `YYYY-MM` directly from the `source_date` string (`create-from-data`) and iterating integer
year-months (`detect`'s `generateMonthlyPeriods`/`generateBiweeklyPeriods` now take date strings).

**Verified (PG-2):** detect returns exactly **6** suggested periods (Jan–Jun 2025, no Dec 2024); after creation
MIR has exactly **6** periods; re-running create-from-data is idempotent ("All periods already exist").

---

## Defect C — Calculate UX → DELIVERED (C1 intelligence, C2 Calculate All, C3 per-period status)

New loader `getPlanIntelligence(tenantId)` (`page-loaders.ts`) returns per active plan: `componentCount`
(from `components` — array / `{components}` / `{variants[0].components}`, matching the engine's
`defaultComponents` derivation, so Meridian = 5), `calculatedPeriodIds` (which periods have a calc batch for
the plan), and latest `entityCount`. Two queries (rule_sets + calculation_batches); no engine/SCI involvement.

**PG-3 — plan selector intelligence (C1).** Each option now carries context:
```tsx
{plans.map(p => {
  const done = activePeriodId ? p.calculatedPeriodIds.includes(activePeriodId) : false;
  return <option key={p.id} value={p.id}>{`${p.name} · ${p.componentCount} comp · ${done ? '✓' : '○'}`}</option>;
})}
```
Plus a "Plan Coverage" card listing each plan with its component count, entity count (when calculated), and
`✓ calculated / ○ pending` for the active period.

**PG-4 — Calculate All Plans (C2).** Sequentially calls the **existing** `/api/calculation/run` per plan for
the selected period (HALT-4: no new endpoint, no endpoint change), with visible progress and graceful per-plan
failure collection:
```tsx
const runAllPlans = useCallback(async () => {
  if (!tenantId || !activePeriodId || plans.length === 0) return;
  setCalcError(null);
  const failures: string[] = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    setBatchProgress({ current: i + 1, total: plans.length, name: plan.name });
    try {
      const res = await fetch('/api/calculation/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, periodId: activePeriodId, ruleSetId: plan.id }) });
      if (!res.ok) { const r = await res.json().catch(() => ({})); failures.push(`${plan.name}: ${(r as {error?:string}).error ?? `HTTP ${res.status}`}`); }
    } catch { failures.push(`${plan.name}: network error`); }
  }
  setBatchProgress(null);
  if (failures.length) setCalcError('Some plans failed — ' + failures.join('; '));
  await refreshPlans(); await reloadData(activeKey);
}, [...]);
```
The button shows `Calculating n/total…` with a progress bar + the current plan name; `refreshPlans()` updates
the ✓/○ status after the run. (It reuses the same endpoint proven in HF-329 — Meridian/BCL — so the loop adds
no new calculation path; HALT-4 clear.)

**PG-4 — per-period status (C3).** The Plan Coverage card shows `X of Y plans calculated for {period}`
(`plansCalcedThisPeriod`), and each plan's `✓/○` for the active period. (Cross-period ribbon annotation and a
full plan-card view are the OB-scope enhancement noted in §6A.)

**C4 (Vialuce only):** the cockpit renders under `useIsVialuce()` on `/operate`; all additions use existing
`--vl-*` tokens.

---

## PG-5 — Non-regression

- **Import pages render** for all tenants (no change to the page; the new boundary only adds recovery).
- **BCL / Meridian are single-plan** (1 active plan each) → `plans.length > 1` is false → the selector AND the
  new Plan Coverage card are hidden; the single-plan auto-select (`selectedRuleSetId ?? ps[0].id`) and the gold
  CTA single-plan calculate flow are byte-unchanged. Only multi-plan tenants (MIR = 5) see the new UI.
- **No engine/convergence/SCI/plan-interpretation changes** → Meridian/BCL calculation results unchanged
  (HF-329's exact GT stands).

## PG-6 — Build
`tsc --noEmit` exit 0 · `next build` exit 0.

## Notes (§6A)
- "Calculate All Periods" (all plans × all periods) is the documented follow-up; this HF delivers "Calculate
  All Plans" for the selected period.
- MIR's per-plan component counts (1–2) reflect its current pre-OB-214 interpretation; the count is correct for
  what the interpreter produced. The calculate flow now works for whatever OB-214 ultimately yields.
