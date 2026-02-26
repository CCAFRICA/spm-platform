# HF-069 Phase 0: PDR Sweep Diagnostic — Current State

## PDR-01 CURRENT STATE: Currency Formatting

**Canonical formatter:** `formatTenantCurrency()` in `web/src/types/tenant.ts` (lines 134-149)
- Threshold: `Math.abs(amount) >= 10000 ? 0 : 2` fraction digits — CORRECT per PDR-01
- Wrapped by `useCurrency()` hook in `tenant-context.tsx` (lines 276-295)
- MXN handling: replaces bare `$` with `MX$`

**Raw currency formatting that BYPASSES canonical function:**

| # | File | Pattern | Instances | Type |
|---|------|---------|-----------|------|
| 1 | `components/dashboards/RepDashboard.tsx` | `{currencySymbol}{value.toLocaleString(undefined, {maximumFractionDigits: 0})}` | 6 | CURRENCY |
| 2 | `components/dashboards/ManagerDashboard.tsx` | Same pattern | 3 | CURRENCY |
| 3 | `components/dashboards/AdminDashboard.tsx` | Same pattern | 3 | CURRENCY |
| 4 | `components/intelligence/RepTrajectory.tsx` | `.toLocaleString(undefined, {maximumFractionDigits: 0})` | 5 | CURRENCY |
| 5 | `app/operate/page.tsx` | `formatCompactCurrency` local function (uses toFixed/toLocaleString) | 1 func | CURRENCY |
| 6 | Various insights pages | `.toFixed(0)` on currency amounts | ~5 | MIXED |
| 7 | `components/compensation/CalculationBreakdown.tsx` | Custom Intl.NumberFormat | 1 | CURRENCY |

**Already using canonical formatter (OK):**
- All 9 financial pages use `useCurrency().format()` (confirmed OB-99 + HF-070)
- `global-search.tsx` uses `formatCurrency()` (fixed HF-070)
- `financial/timeline/page.tsx` uses `format()` (fixed HF-070)

**.toFixed() — percentage usage (OK, not currency):**
- Financial pages: `.toFixed(1)%` for tip rates, leakage rates, change percentages — NOT currency
- Dashboard components: `.toFixed(0)%` for attainment percentages — NOT currency
- KPICard: `.toFixed(1)%` for percentages — NOT currency

---

## PDR-05 CURRENT STATE: Persona Filtering

**effectivePersona hook:** `web/src/contexts/persona-context.tsx`
- `derivePersona()` maps user.role → persona (admin/manager/rep)
- `setPersonaOverride()` allows DemoPersonaSwitcher to override
- `effectivePersona = override ?? derivePersona(user, capabilities)`
- Scope derivation: admin→canSeeAll, rep→single entity, manager→visible_entity_ids

**DemoPersonaSwitcher sets entity scope:** YES (HF-060 fix)
- Calls `setPersonaOverride(key)` → PersonaProvider re-fetches scope based on effective persona
- Scope recalculates — not just visual label

**Financial pages use effectivePersona:** YES — all 9 financial pages
- Pattern: `usePersona()` → `scope.entityIds` → `financialScope` → API call
- API route applies `scopeEntityIds` server-side

**user.role references — 59 across 39 files:**
- 20 AUTH GATES (RequireRole, useCapability, admin checks) — CORRECT use of user.role
- 11 API AUTH GATES (profile.role !== 'vl_admin') — CORRECT
- 3 PERSONA DERIVATION (persona-context.tsx, auth-context.tsx) — CORRECT
- 5 UI DISPLAY (user-menu, OnboardingTab) — CORRECT
- 4 TABLE COLUMN FILTERS (configuration, personnel pages — filtering by data role, not user.role) — CORRECT
- 1 my-compensation: `mapRole(persona || user.role)` — ALREADY FIXED (HF-070)

**Assessment:** PDR-05 is PASS. No remaining user.role references in scope/filtering business logic.

---

## PDR-06 CURRENT STATE: Brand Cards as Collapsible Section Headers

**File:** `web/src/app/financial/pulse/page.tsx`

**Brand grouping:** Brands render ABOVE their location groups as section headers
- `locationsByBrand = new Map<string, Location[]>` (line 177-184)
- Iteration: `Array.from(locationsByBrand.entries()).map()` renders brand header → location grid

**Collapsible:** YES
- `expandedBrands` state (Set<string>) — line 51
- `toggleBrand()` function — line 53-59
- Default expanded via useEffect when data loads — line 91-96
- ChevronDown (expanded) / ChevronRight (collapsed) icons — line 484-486

**Brand header stats shown:**
- Brand color dot
- Brand name
- Concept badge (service type)
- Location count (pluralized, bilingual)
- Total revenue (formatWhole)
- Avg check (format)
- Tip rate (percentage)

**Assessment:** PDR-06 is PASS. Brand headers above locations, collapsible, stats visible.

---

## PDR-07 CURRENT STATE: Amber Threshold ±5%

**API threshold:** `web/src/app/api/financial/data/route.ts` (line 264)
- `ratio > 1.05 ? 'above' : ratio < 0.95 ? 'below' : 'within'` — ±5%

**Client threshold:** `web/src/app/financial/pulse/page.tsx` (line 201)
- `ratio > 1.05 || ratio < 0.95` — ±5% (matches API)

**Color functions:** (lines 161-175)
- `above` → `bg-green-50` + `#22c55e` border
- `within` → `bg-amber-50` + `#f59e0b` border
- `below` → `bg-red-50` + `#ef4444` border

**Legend:** (lines 433-446)
- "Within ±5%" (EN) / "Dentro ±5%" (ES) — CORRECT

**Amber locations visible:** YES — applied via `getLocationBg(location.vsNetworkAvg)` on line 507

**Assessment:** PDR-07 is PASS. ±5% threshold, amber colors applied, legend correct.

---

## PDR-04 NOTE: N+1 Request Count

**OB-100 reduced requests to ~20-25 per fresh page load** (NavigationContext 300s interval, 30s service cache TTL, pulse count caching).
- Manual verification needed in browser Network tab
- Context providers with Supabase calls: reduced from ~60s refresh to 300s

---

## SUMMARY

| PDR | Current State | Action Needed |
|-----|--------------|---------------|
| PDR-01 | Canonical formatter exists and correct. ~17+ raw currency formatting instances in dashboards, components bypass it. | Phase 1: Platform-wide sweep |
| PDR-05 | All financial pages use effectivePersona. No user.role in scope filtering. DemoPersonaSwitcher sets scope. | ALREADY PASS — verify only |
| PDR-06 | Brand headers above locations, collapsible, stats visible. | ALREADY PASS — verify only |
| PDR-07 | ±5% threshold, amber colors applied, legend correct. | ALREADY PASS — verify only |
| PDR-04 | ~20-25 requests per load (OB-100). | NOTE only |
