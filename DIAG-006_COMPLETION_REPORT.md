# DIAG-006 COMPLETION REPORT
## Date: March 17, 2026

## PHASE 1: ERROR IDENTIFICATION

### Mission 1.1 — React error #185 meaning:

React Minified Error #185:
> **"Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops."**

This is an infinite re-render loop — a component triggers setState on every render, causing React to exceed its 50-render safety limit and crash.

### Mission 1.2 — Calculate page component:

**File:** `web/src/app/operate/calculate/page.tsx`

The infinite loop is caused by an unstable dependency in a useEffect.

**Line 71 — unstable reference created on every render:**
```tsx
const activePlans = plans.filter(p => p.status === 'active');
```
`Array.filter()` returns a NEW array reference on every render, even when the contents are identical. `Object.is(oldArray, newArray)` is always `false`.

**Lines 210-258 — useEffect with unstable dependency:**
```tsx
// Load prior period totals for period comparison
useEffect(() => {
  if (!tenantId || !selectedPeriodId || periods.length < 2) {
    setPriorPeriodTotals({});    // ← TRIGGER: new {} on every call
    return;
  }

  let cancelled = false;

  const load = async () => {
    // ... async load ...
    setPriorPeriodTotals(totals);  // ← also a new object each time
  };

  load();
  return () => { cancelled = true; };
}, [tenantId, selectedPeriodId, periods, activePlans]);
//                                       ^^^^^^^^^^^^
//                                       UNSTABLE — new ref every render
```

**The infinite loop cycle:**
1. Component renders → `activePlans = plans.filter(...)` creates new array reference
2. useEffect runs (activePlans dependency changed)
3. Early return fires: `setPriorPeriodTotals({})` creates new `{}` object
4. React compares old `{}` with new `{}` via `Object.is` → `false` (different references)
5. State "changed" → component re-renders
6. Go to step 1 → repeats 50 times → React crashes with error #185

**The early return condition fires when:**
- `!tenantId` — no tenant selected
- `!selectedPeriodId` — no period selected
- `periods.length < 2` — fewer than 2 periods exist

Even without the early return, the async path also creates new objects via `setPriorPeriodTotals(totals)`, but the cancellation mechanism (`cancelled = true` in cleanup) partially mitigates this for the async case. The synchronous early return path has NO mitigation.

### Mission 1.3 — PlanCard component:

**File:** `web/src/components/calculate/PlanCard.tsx`

PlanCard is clean — no infinite loop patterns. It uses `useState` and `useCallback` properly. The component breakdown and period comparison (OB-173B additions) are rendered conditionally and don't trigger state loops. The crash is in the parent page, not in PlanCard.

### Mission 1.4 — Data shape assumptions:

No data shape issues. The Calculate page queries:
1. `/api/plan-readiness` — returns `{ plans: PlanReadiness[] }` (line 86-89)
2. `loadResultsPageData()` — loads DS-007 results (line 114)
3. `calculation_batches` table — for prior period totals (line 232-239)

None of these are affected by OB-174 async pipeline changes. The crash occurs BEFORE any data is fetched — it's a rendering loop, not a data error.

### Mission 1.5 — Period/batch selector:

No issues with period count handling. The period selector (`Select` component, line 317-326) maps over `periods` array which handles any count including 0 and 6+. The crash is not in the selector — it's in the useEffect that loads prior period totals.

## PHASE 2: SERVER-SIDE VERIFICATION

### Mission 2.1 — API test:

Not applicable — the crash is purely client-side (React rendering loop). The server APIs are not involved. The page crashes before any API call is made because the infinite loop fires during initial render.

### Mission 2.2 — Vercel logs:

No server-side errors expected — this is a client-side React error. The page component itself crashes in the browser.

## PHASE 3: ISOLATION

### Mission 3.1 — Which PR introduced the crash:

**OB-173B (commit `bde7d644`, PR #256)** introduced the crashing code.

Specifically, OB-173B Phase B2 added the "prior period totals" useEffect (lines 210-258) to the Calculate page. This effect includes `activePlans` in its dependency array, where `activePlans` is computed inline via `plans.filter()` on every render (line 71).

```
git log --oneline -- web/src/app/operate/calculate/page.tsx

bde7d644 OB-173B Phase B2: Component breakdown and period comparison on Calculate  ← INTRODUCED
8fb4d313 OB-173 Phase A-D: Experience Architecture — User Journey Remediation
```

**Files modified in OB-173B touching Calculate:**
- `web/src/app/operate/calculate/page.tsx` — added prior period totals effect + `priorPeriodTotals` state
- `web/src/components/calculate/PlanCard.tsx` — added component breakdown + period comparison display

### Mission 3.2 — Why it worked before:

The page likely worked before because:
1. **selectedPeriodId was set** (from session storage) — the early return path didn't fire
2. **periods.length >= 2** — there were existing periods from prior calculations
3. The async load path has cancellation that partially mitigates the loop (the load gets cancelled before setState)

The crash likely manifests NOW because:
- After re-importing data, the session storage may have an invalid `selectedPeriodId` (old period UUID no longer exists)
- Or periods were deleted during cleanup, making `periods.length < 2`
- In either case, the synchronous early return path fires `setPriorPeriodTotals({})` on every render

But fundamentally, the bug was ALWAYS present — `activePlans` is ALWAYS an unstable reference. The infinite loop just needed the right conditions (early return path) to manifest at full speed.

## ROOT CAUSE

**File:** `web/src/app/operate/calculate/page.tsx`
**Line 71:** `const activePlans = plans.filter(p => p.status === 'active');` — creates new array reference every render
**Line 258:** `activePlans` used as useEffect dependency — effect runs every render
**Line 212:** `setPriorPeriodTotals({})` — synchronous setState with new object triggers re-render
**Introduced by:** OB-173B (commit `bde7d644`, PR #256)
**Trigger condition:** `!selectedPeriodId` or `periods.length < 2`

## RECOMMENDED FIX

Memoize `activePlans` so it maintains referential stability:

```tsx
// Line 71 — BEFORE (unstable):
const activePlans = plans.filter(p => p.status === 'active');

// AFTER (stable):
const activePlans = useMemo(() => plans.filter(p => p.status === 'active'), [plans]);
```

`useMemo` ensures `activePlans` only gets a new reference when `plans` changes (which only happens when the context updates plans from the database). This breaks the infinite loop.

## KNOWN ISSUES

1. **Same pattern exists for `handleCalculateAll`** (line 175): `activePlans` is in its `useCallback` dependency array. While this doesn't cause an infinite loop (not in a useEffect), it recreates the callback on every render unnecessarily. The `useMemo` fix addresses both.

2. **`setPriorPeriodTotals({})` anti-pattern:** Even with memoized `activePlans`, creating `{}` on each valid effect execution causes an unnecessary re-render. A cleaner pattern would be to compare before setting: `setPriorPeriodTotals(prev => Object.keys(prev).length === 0 ? prev : {})` or use a ref.
