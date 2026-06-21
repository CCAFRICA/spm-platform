# HF-326 COMPLETION REPORT

Calculate Flow State Awareness

## Date / Branch
2026-06-21 · `hf-326-calculate-flow-state-awareness`

## Commits
| SHA | Unit |
|---|---|
| `9da5a8fc` | directive committed |
| (impl) | Defects A/B/C |
| (report) | this |

## Files changed (3 — UI + loader only; no engine/route/auth)
- `web/src/lib/data/page-loaders.ts` — `getActivePlans(tenantId)` (new) + `loadOperatePageData(tenantId, periodKey?, ruleSetId?)` (plan param + per-plan batch scoping).
- `web/src/components/operate/LifecycleCockpit.tsx` — plan selector (Defect A).
- `web/src/app/configure/periods/page.tsx` — auto-detect key fix (Defect B) + tenant-state guidance section (Defect C).

---

## PREMISE CORRECTIONS (reported faithfully)
1. **Defect B root cause is NOT tenant_id resolution.** `/api/periods/detect` reads `tenantId` from the **request body** with a **service-role client** (no session, no RLS) and works: BCL returns `data_range.has_data=true` and `"6 periods suggested — 5 already exist, 1 new"`. The real bug is a **response-key mismatch**: the OB-227 button read camelCase `data.suggestedPeriods`, but the route returns snake_case `suggested_periods`, so the value was always `undefined` → empty array → the "No data uploaded yet" branch fired for every tenant. (HALT-3 N/A — the fix is the key, not the tenant_id.)
2. **MIR (Almacenes Mirasol `972c8eb0`) is currently EMPTY** — 0 committed_data, 0 rule_sets, 0 periods (the directive's "5 plans / 3 periods / 75K rows" reflects a wiped prior state, like the CLT227 screenshots). The multi-plan proof (PG-6) therefore uses **Sabor (2 active plans)**; MIR can't be exercised until re-seeded.

---

## PROOF GATES

### PG-1 — PLAN SELECTOR EXISTS
`getActivePlans(tenantId)` returns all active plans; LifecycleCockpit renders a selector when `plans.length > 1`. Verified: **Sabor → 2 plans** ("Índice de Desempeño - Sucursales", "Comisión por Ventas - Meseros"). Switching plans re-runs `loadOperatePageData(tenantId, undefined, selectedRuleSetId)` (plan + its scoped batches) → updates the sub-header, calc summary, and `runCalculation`'s `ruleSetId`. Rendered selector:
```tsx
{plans.length > 1 && (
  <select value={selectedRuleSetId ?? ''} onChange={e => setSelectedRuleSetId(e.target.value)}
    aria-label={isSpanish ? 'Seleccionar plan' : 'Select plan'} style={{ … }}>
    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
)}
```

### PG-2 — PLAN SELECTOR SINGLE-PLAN
**BCL → 1 active plan** → `plans.length > 1` is false → selector hidden; the plan auto-selects (`selectedRuleSetId ?? ps[0]?.id`) and shows in the sub-header (`ruleSetName · activePeriodLabel`). No degradation; per-plan batch scoping returns BCL's 6 batches (identical to before).

### PG-3 — AUTO-DETECT FIRES
Fixed `handleAutoDetect`: reads `data.suggested_periods` and keys the no-data message on `data.data_range?.has_data`:
```ts
const suggested = (data.suggested_periods ?? []) as DetectedPeriod[];
const hasData = !!data.data_range?.has_data;
const fresh = suggested.filter(p => !p.exists);
if (fresh.length === 0) {
  setDetectMsg(!hasData ? 'No data uploaded yet…' : 'All detected periods already exist.');
  return;
}
setDetected(fresh);
```
Endpoint `tenant_id` path (unchanged, already correct): `const { tenantId } = await req.json()` + service-role client + `.eq('tenant_id', tenantId)`. Direct-call evidence: BCL/Sabor return `data_range.has_data=true` with populated `suggested_periods`; empty MIR returns `has_data=false`.

### PG-4 — PERIODS PAGE STATE AWARENESS
New Vialuce-gated guidance section (reuses `getTenantOnboardingState`): three precondition chips (Data loaded / Plan imported / Periods created) + the next action. When all preconditions met → **"Go to Calculate →"** routes to `/operate`; otherwise points to the missing step (`/data/import`).
```tsx
{isVialuce && tenantState && (() => {
  const allMet = ts.has_data && ts.has_plan && ts.has_periods;
  return (<Card>… {chip(ts.has_data,…)} {chip(ts.has_plan, ts.plan_name)} {chip(ts.has_periods, `${ts.period_count}`)} …
    {allMet ? <Button onClick={() => router.push('/operate')}>Go to Calculate →</Button> : …} …</Card>);
})()}
```

### PG-5 — BCL JOURNEY
`getTenantOnboardingState(BCL)` = `{has_data:true, has_plan:true (Plan de Comisiones…), has_periods:true (6), has_calculations:true, …}` → all three chips green → "Calculated — review or recalculate" + "Go to Calculate →" → `/operate`. On `/operate`, BCL shows the single plan (auto-selected, no selector), 6 periods, and the gold "Run Calculation" CTA is actionable.

### PG-6 — MIR JOURNEY (via Sabor — MIR empty)
MIR is empty (premise correction). Multi-plan behavior proven on **Sabor (2 plans)**: the cockpit selector lists both; selecting a plan re-loads `loadOperatePageData` scoped to that `rule_set_id` (each plan's batches resolve independently — verified 0/0 for Sabor's two uncalculated plans, scoping confirmed; BCL's plan resolves 6).

### PG-7 — BUILD CLEAN
`tsc --noEmit` exit 0 · `next build` exit 0.

## ARTIFACT / IAP
- `/operate` (cockpit): **Intelligence** (knows all plans), **Acceleration** (switch plan → recompute), **Performance** (calculate any plan). Dead-end removed.
- `/configure/periods`: **Intelligence** (knows data/plan/period state), **Acceleration** ("Go to Calculate →"), **Performance** (routes to the next action).

## HALT activations
None. HALT-1 (no new API route — `getActivePlans` is a lib function reusing the rule_sets query), HALT-2 (no engine/convergence/calc changes), HALT-3 (the "No data" bug was a response-key mismatch, not tenant_id), HALT-4 (the new guidance section is Vialuce-gated; the Defect-B key fix is a shared logic bug fix, not a theme change).

## Residuals
- **Class-level finding (§6A):** the detect endpoint's snake_case response contract is a likely trap for other consumers — any client reading its keys must use `suggested_periods` / `data_range`. No other consumer found in this scope.
- `create-from-data` remains bootstrap-only (skips when periods exist); BCL's "1 new" boundary period can't be added through it — fine for the primary fresh-tenant flow, noted for a follow-up.
- i18n full-site remediation and MIR re-seed remain out of scope. Browser-visual confirmation of the rendered surfaces is the architect channel (SR-44); CC verified the data layer + code.
