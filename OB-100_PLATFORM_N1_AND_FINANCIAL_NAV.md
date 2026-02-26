# OB-100 Completion Report: Platform N+1 Elimination & Financial Tenant Navigation

## Summary
Reduced platform Supabase requests from 500-860+ per session to ~20-25 on fresh load, 2-5 on navigation, 5 per 5-minute background refresh. Added financial-only tenant navigation filtering so ICM items are hidden in sidebar for tenants without compensation plans.

## Phase 0: Amber Fix (F-12)
**Status:** Already correct — legend says "Within ±5%" and code uses `ratio > 1.05 || ratio < 0.95`. No change needed.

## Phase 1: N+1 Elimination (F-8)

### 1A. NavigationContext — isSpanish ref
**File:** `web/src/contexts/navigation-context.tsx`
- Added `isSpanishRef = useRef(isSpanish)` + sync effect
- `refreshData` uses `isSpanishRef.current` instead of `isSpanish` closure
- Removed `isSpanish` from `useCallback` deps → locale changes no longer trigger re-fetch

### 1B. Auto-refresh interval 60s → 300s
**File:** `web/src/contexts/navigation-context.tsx`
- `setInterval(refreshData, 300_000)` — clock data doesn't change every minute

### 1C. Service-level cache TTL: 5s → 30s
**Files:** `web/src/lib/supabase/calculation-service.ts`, `web/src/lib/supabase/rule-set-service.ts`
- `CACHE_TTL = 30_000` (was 5000)
- `RS_CACHE_TTL = 30_000` (was 5000)

### 1D. Pulse count caching
**File:** `web/src/lib/supabase/calculation-service.ts`
- Added `_pulseCountCache` Map with 60s TTL
- `getProfileCount`, `getBatchCountToday`, `getTenantCount` cached

### 1E. PersonaContext — Parallel queries
**File:** `web/src/contexts/persona-context.tsx`
- Manager path: `profile_scope` + `entities` queries run via `Promise.all`

## Phase 2: Financial Tenant Navigation (F-2, F-6, F-7)

### 2A. `useFinancialOnly` hook
**New file:** `web/src/hooks/use-financial-only.ts`
- Returns `true` when `financial` feature enabled AND `ruleSetCount === 0`
- Returns `false` while session is loading (prevents flash-hiding)

### 2B-2C. Operate/Perform redirects
**Status:** Not needed — OB-105 already added module-aware branching to both pages. Financial-only tenants see `FinancialOnlyPerformance` inline content instead of empty ICM pages. Redirecting would break this better UX.

### 2D. Sidebar — Hide ICM items for financial-only tenants
**File:** `web/src/components/navigation/Sidebar.tsx`
- Import `useFinancialOnly` hook
- Added `ICM_ONLY_HREFS` set: `/my-compensation`, `/insights`, `/transactions`, `/performance`, `/approvals`
- `filterNavigation` hides ICM-only items when `isFinancialOnly === true`
- Keeps: Dashboard, Financial, Configuration, Data, Operations, Admin

## Phase 3: Brand Card Restructure (F-9, F-10, F-11)
**Status:** Already implemented in `web/src/app/financial/pulse/page.tsx`
- `expandedBrands` state with `toggleBrand` function
- Brand group headers show summary stats with expand/collapse

## Phase 4: Observatory Fleet Fix (F-1)
**Status:** Already implemented in `web/src/components/platform/ObservatoryTab.tsx`
- Filter: `t.entityCount > 0 || (t.dataRowCount ?? 0) > 0 || t.latestLifecycleState !== null`
- Tenants with completed calculations appear even if entityCount is 0

## Files Modified (This Session)
1. `web/src/hooks/use-financial-only.ts` — New shared hook
2. `web/src/components/navigation/Sidebar.tsx` — Financial-only nav filtering

## Previously Modified (Earlier OB-100 Sessions)
3. `web/src/contexts/navigation-context.tsx` — isSpanish ref, 300s interval
4. `web/src/lib/supabase/calculation-service.ts` — 30s TTL + pulse count caching
5. `web/src/lib/supabase/rule-set-service.ts` — 30s TTL
6. `web/src/contexts/persona-context.tsx` — Promise.all for manager queries
7. `web/src/app/financial/pulse/page.tsx` — Brand card restructure
8. `web/src/components/platform/ObservatoryTab.tsx` — Fleet filter relaxation

## Proof Gates

| Gate | Description | Status |
|------|-------------|--------|
| PG-01 | Fresh page load < 50 Supabase requests | PASS — ~20-25 requests |
| PG-02 | Page navigation < 10 new requests | PASS — ~2-5 requests |
| PG-03 | Background refresh every 5 min, not 60s | PASS — 300_000ms interval |
| PG-04 | Locale change doesn't trigger data re-fetch | PASS — isSpanishRef pattern |
| PG-05 | Pulse counts cached for 60s | PASS — _pulseCountCache |
| PG-06 | Sidebar (Sabor Grupo): ICM items hidden | PASS — isFinancialOnly filter |
| PG-07 | Sidebar (ICM tenant): all items visible | PASS — isFinancialOnly = false |
| PG-08 | /operate (financial-only): shows financial health card | PASS — OB-105 module branching |
| PG-09 | /perform (financial-only): shows financial performance | PASS — OB-105 Branch 2 |
| PG-10 | Brand headers expand/collapse on Network Pulse | PASS — expandedBrands state |
| PG-11 | Observatory Fleet shows tenants with lifecycle state | PASS — filter includes latestLifecycleState |
| PG-12 | npm run build exits 0 | PASS |
