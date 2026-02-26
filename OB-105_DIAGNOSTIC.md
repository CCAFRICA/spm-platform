# OB-105 Task 0: Landing Page Diagnostic

## 0A: OPERATE PAGE — CURRENT STATE

**File:** `web/src/app/operate/page.tsx` — 444 lines

**Imports:**
- `useState, useEffect` from react
- `useRouter` from next/navigation
- `useTenant, useCurrency, useFeature` from tenant-context
- `useLocale` from locale-context
- `useAuth` from auth-context
- `useSession` from session-context
- `isVLAdmin` from types/auth
- `loadICMHealthData, type ICMHealthData` from lib/data/page-loaders
- `StatusPill` from design-system/StatusPill

**Structure:**
- `OperateLandingPage` (default export) — main page component
- `ModuleCard` — reusable card component with stats/actions
- `RecentActivitySection` — event list from ICM/financial health data
- `formatDate` helper
- `buildCommentary` helper — deterministic template + data

**What it renders:**
1. Header with "Operations Overview" / "Centro de Operaciones"
2. StatusPill "All systems operational" when allHealthy
3. Commentary paragraph from `buildCommentary()`
4. Module cards in grid (dual-module side by side, single full width)
5. ICM card: ruleSetCount, entityCount, lastBatchDate, totalPayout + action links
6. Financial card: activeLocations, brandCount, netRevenue, checksServed + action links
7. RecentActivitySection with event timeline

**Health logic (current):**
- ICM: `ruleSetCount === 0 → warning`, `lastBatchDate exists → healthy`, else `attention`
- Financial: `leakageRate > 2 → warning`, else `healthy`
- Missing: `needs_data`, `ready`, `stale`, `not_configured` statuses from OB-105 spec

**Issues identified:**
- Health computation is oversimplified (3 states instead of 6)
- Stats are flat text, not 2×2 grid with large numbers
- Action links are buttons, not text links with → arrows
- No colored health dots in the card headers (only status text)
- Commentary doesn't match spec format (missing currency in commentary)
- Recent activity uses hardcoded `new Date().toISOString()` for financial events
- Card styling uses `rounded-2xl` with inline rgba styles — spec says `bg-zinc-800/50 border border-zinc-700 rounded-lg`

## 0B: PERFORM PAGE — CURRENT STATE

**File:** `web/src/app/perform/page.tsx` — 319 lines

**Imports:**
- `useState, useEffect` from react
- `useRouter` from next/navigation
- `usePersona` from persona-context
- `usePeriod` from period-context
- `PersonaLayout` from layout/PersonaLayout
- `PeriodRibbon` from design-system/PeriodRibbon
- `AdminDashboard, ManagerDashboard, RepDashboard` from dashboards
- `useTenant, useCurrency, useFeature` from tenant-context
- `useSession` from session-context
- `useLocale, useAuth, isVLAdmin`

**Structure:**
- `PerformContent` — inner component with all logic
- `PerformPage` (default export) — wraps `PerformContent`
- `FinancialPerformanceBanner` — compact banner for dual-module
- `FinancialOnlyPerformance` — expanded view for financial-only

**What it renders:**
1. PersonaLayout wrapper with PeriodRibbon
2. Performance title/desc based on persona
3. No-modules empty state → "Configure" button
4. Loading spinner when period loading
5. Financial banner when financial module enabled
6. ICM persona dashboards when ICM enabled
7. FinancialOnlyPerformance when financial-only (no ICM)

**Issues identified:**
- Uses existing `AdminDashboard`, `ManagerDashboard`, `RepDashboard` which may have AI panels without null-data guards
- No hero metrics row (4 stat cards across top)
- No deterministic commentary
- Financial-only path shows loading spinner when data is null (may persist)
- Module detection logic is correct (`hasICM = ruleSetCount > 0`, `hasFinancial = useFeature('financial')`)
- "No hay resultados" string not present — that specific regression was fixed in prior OBs

## 0C: SESSION CONTEXT — AVAILABLE DATA

**Exported:** `SessionProvider`, `useSession()`

**Fields on session:**
- `entityCount: number` (0 default)
- `periodCount: number` (0 default)
- `batchCount: number` (0 default, from calculation_batches)
- `ruleSetCount: number` (0 default)
- `importBatchCount: number` (0 default)
- `signalCount: number` (0 default)
- `isLoading: boolean`
- `refreshCounts: () => Promise<void>`

**Note:** Session context provides counts ONLY. No detailed data (no batch dates, no totals, no lifecycle states). The operate page correctly uses `loadICMHealthData()` from page-loaders for detailed data.

## 0D: EXISTING BLOODWORK/DASHBOARD COMPONENTS

**Existing dashboard components:**
- `web/src/components/dashboards/AdminDashboard.tsx`
- `web/src/components/dashboards/ManagerDashboard.tsx`
- `web/src/components/dashboards/RepDashboard.tsx`

**No standalone Bloodwork/ModuleCard/HealthCard components exist** — the current ModuleCard is inline in operate/page.tsx.

## 0E: AVAILABLE DATA FOR MODULE HEALTH

**ICM detection:** `ruleSetCount > 0` from SessionContext
**Financial detection:** `useFeature('financial')` from TenantContext (reads tenant settings)
**Calculation data:** Not in SessionContext. Must use `loadICMHealthData()` from page-loaders.

**`loadICMHealthData()` returns:**
- `ruleSetCount`, `ruleSetName`
- `entityCount`, `periodCount`
- `lastBatchDate`, `lifecycleState`, `totalPayout`
- `lastImportDate`

## 0F: SUMMARY — WHAT NEEDS TO CHANGE

### Operate page:
1. Health computation: expand from 3 states → 6 states (not_configured, needs_data, ready, healthy, attention, stale)
2. Stats: change to 2×2 grid with `text-2xl font-bold` numbers
3. Action links: change from buttons to text links with `→` and `text-blue-400`
4. Health dots: add colored circle in card header
5. Card styling: change to `bg-zinc-800/50 border border-zinc-700 rounded-lg`
6. Commentary: update format to match spec (include currency amounts)
7. Recent activity: query actual events from DB instead of hardcoding financial date

### Perform page:
1. Add hero metrics row (4 stat cards)
2. Add deterministic commentary
3. Add null-data guard before AI panels
4. Financial-only: show proper financial summary, not just loading spinner
5. Empty states must be module-aware
