# ClearComp Codebase Audit
## Date: 2026-02-08

---

## Summary Counts
- **Total .ts/.tsx files in src/:** 380
- **Total lines of code:** 108,046
- **Total page.tsx route files:** 91

---

## Section 1: File Inventory

### Total File Counts
```
$ find src -type f -name "*.ts" -o -name "*.tsx" | wc -l
380

$ find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec cat {} + | wc -l
108046

$ find src/app -name "page.tsx" | wc -l
91
```

### Navigation System Files (19 files)
```
src/components/navigation/command-palette/CommandPalette.tsx
src/components/navigation/mission-control/CycleIndicator.tsx
src/components/navigation/mission-control/index.ts
src/components/navigation/mission-control/MissionControlRail.tsx
src/components/navigation/mission-control/PulseMetrics.tsx
src/components/navigation/mission-control/QueuePanel.tsx
src/components/navigation/mission-control/UserIdentity.tsx
src/components/navigation/mission-control/WorkspaceSwitcher.tsx
src/components/navigation/Navbar.tsx
src/components/navigation/Sidebar.tsx
src/contexts/navigation-context.tsx
src/lib/navigation/acceleration-hints.ts
src/lib/navigation/command-registry.ts
src/lib/navigation/cycle-service.ts
src/lib/navigation/navigation-signals.ts
src/lib/navigation/pulse-service.ts
src/lib/navigation/queue-service.ts
src/lib/navigation/role-workspaces.ts
src/lib/navigation/workspace-config.ts
src/types/navigation.ts
```

### Calculation System Files (14 files)
```
src/lib/calculation/context-resolver.ts
src/lib/calculation/data-component-mapper.ts
src/lib/calculation/engine.ts
src/lib/calculation/index.ts
src/lib/calculation/results-formatter.ts
src/lib/compensation/calculation-engine.ts
src/lib/orchestration/calculation-orchestrator.ts
src/lib/orchestration/index.ts
src/types/calculation-engine.ts
src/app/admin/launch/reconciliation/page.tsx
src/app/operate/reconcile/page.tsx
src/lib/reconciliation/engine.ts
src/lib/reconciliation/index.ts
src/lib/reconciliation/reconciliation-bridge.ts
src/types/reconciliation.ts
```

---

## Section 2: Route Existence

### Operate Workspace
| Route | Status | Lines | Notes |
|-------|--------|-------|-------|
| `/src/app/operate/page.tsx` | EXISTS | 233 | Full landing page |
| `/src/app/operate/import/page.tsx` | EXISTS | 123 | Full import page |
| `/src/app/operate/calculate/page.tsx` | EXISTS | 7 | Re-exports from `/admin/launch/calculate` |
| `/src/app/operate/reconcile/page.tsx` | EXISTS | 7 | Re-exports from `/admin/launch/reconciliation` |
| `/src/app/operate/approve/page.tsx` | EXISTS | 7 | Re-exports from `/approvals` |
| `/src/app/operate/pay/page.tsx` | EXISTS | 218 | Full pay page |
| `/src/app/operate/monitor/operations/page.tsx` | EXISTS | 120 | Full operations monitor |
| `/src/app/operate/monitor/readiness/page.tsx` | EXISTS | 165 | Full readiness monitor |
| `/src/app/operate/monitor/quality/page.tsx` | EXISTS | 170 | Full quality monitor |

### Perform Workspace
| Route | Status | Lines | Notes |
|-------|--------|-------|-------|
| `/src/app/perform/page.tsx` | EXISTS | 237 | Full landing with role-based content |
| `/src/app/perform/dashboard/page.tsx` | **MISSING** | - | No dedicated dashboard |
| `/src/app/perform/compensation/page.tsx` | EXISTS | 7 | Re-exports from `/my-compensation` |
| `/src/app/perform/transactions/page.tsx` | EXISTS | 7 | Re-exports |
| `/src/app/perform/team/page.tsx` | EXISTS | 7 | Re-exports |
| `/src/app/perform/trends/page.tsx` | EXISTS | 7 | Re-exports |
| `/src/app/perform/inquiries/page.tsx` | EXISTS | 7 | Re-exports |

### Investigate Workspace
| Route | Status | Lines | Notes |
|-------|--------|-------|-------|
| `/src/app/investigate/page.tsx` | EXISTS | 183 | Full landing page |
| `/src/app/investigate/transactions/page.tsx` | **MISSING** | - | - |
| `/src/app/investigate/employees/page.tsx` | **MISSING** | - | - |
| `/src/app/investigate/calculations/page.tsx` | **MISSING** | - | - |
| `/src/app/investigate/audit/page.tsx` | **MISSING** | - | - |
| `/src/app/investigate/disputes/page.tsx` | EXISTS | 7 | Re-exports |
| `/src/app/investigate/adjustments/page.tsx` | **MISSING** | - | - |

### Design Workspace
| Route | Status | Lines | Notes |
|-------|--------|-------|-------|
| `/src/app/design/page.tsx` | EXISTS | 210 | Full landing page |
| `/src/app/design/plans/page.tsx` | EXISTS | 7 | Re-exports |
| `/src/app/design/incentives/page.tsx` | **MISSING** | - | - |
| `/src/app/design/goals/page.tsx` | **MISSING** | - | - |
| `/src/app/design/modeling/page.tsx` | **MISSING** | - | - |
| `/src/app/design/budget/page.tsx` | **MISSING** | - | - |

### Configure Workspace
| Route | Status | Lines | Notes |
|-------|--------|-------|-------|
| `/src/app/configure/page.tsx` | EXISTS | 173 | Full landing page |
| `/src/app/configure/people/page.tsx` | **MISSING** | - | - |
| `/src/app/configure/teams/page.tsx` | **MISSING** | - | Alt path exists |
| `/src/app/configure/organization/teams/page.tsx` | EXISTS | 7 | Re-exports |
| `/src/app/configure/locations/page.tsx` | **MISSING** | - | Alt path exists |
| `/src/app/configure/organization/locations/page.tsx` | EXISTS | 7 | Re-exports |
| `/src/app/configure/periods/page.tsx` | EXISTS | 450 | Full periods page |
| `/src/app/configure/data-specs/page.tsx` | **MISSING** | - | - |
| `/src/app/configure/system/page.tsx` | **MISSING** | - | - |

### Govern Workspace
| Route | Status | Lines | Notes |
|-------|--------|-------|-------|
| `/src/app/govern/page.tsx` | EXISTS | 219 | Full landing page |
| `/src/app/govern/audit-reports/page.tsx` | **MISSING** | - | - |
| `/src/app/govern/data-lineage/page.tsx` | **MISSING** | - | - |
| `/src/app/govern/approvals/page.tsx` | **MISSING** | - | - |
| `/src/app/govern/reconciliation/page.tsx` | **MISSING** | - | - |
| `/src/app/govern/access/page.tsx` | **MISSING** | - | - |

### Missing Route Summary
- **Perform:** 1 missing (dashboard)
- **Investigate:** 5 missing (transactions, employees, calculations, audit, adjustments)
- **Design:** 4 missing (incentives, goals, modeling, budget)
- **Configure:** 4 missing (people, data-specs, system, direct teams/locations)
- **Govern:** 5 missing (audit-reports, data-lineage, approvals, reconciliation, access)
- **Total Missing:** 19 routes

---

## Section 3: Navigation Wiring

### 3.1 WorkspaceSwitcher
- **Imports `useRouter`:** NO (uses `navigateToWorkspace` from context)
- **Navigation handler:** YES - `onClick={() => navigateToWorkspace(wsId)}`
- **Context provides navigation:** YES - `navigation-context.tsx` line 213: `router.push(ws.defaultRoute)`
- **STATUS:** VERIFIED - clicking workspace items navigates via context

### 3.2 CycleIndicator
- **Imports `useRouter`:** YES (line 10)
- **Navigation handler:** YES - `handlePhaseClick(phase)` calls `router.push(getRouteForPhase(phase))`
- **Tooltips:** YES - using TooltipProvider/Tooltip components
- **Text labels:** YES - shows phase names via `CYCLE_PHASE_LABELS`
- **STATUS:** VERIFIED - clicking phases navigates to operate routes

### 3.3 QueuePanel
- **Imports `useRouter`:** YES (line 11)
- **Navigation handler:** YES - `handleItemClick(item)` calls `router.push(item.route)`
- **Mark as read:** YES - calls `markQueueItemRead(item.id)` before navigation
- **STATUS:** VERIFIED - clicking items navigates and marks read

### 3.4 CommandPalette
- **Imports `useRouter`:** YES (line 11)
- **Selection handler:** YES - `handleSelect(command)` calls `router.push(command.route)`
- **Recent tracking:** YES - calls `addRecentCommand(user.id, command.id)`
- **STATUS:** VERIFIED - selecting search results navigates

---

## Section 4: Calculation Pipeline

### 4.1 Plan Storage → Orchestrator Connection
| Check | Finding |
|-------|---------|
| Plan storage key | `compensation_plans` (line 15 in plan-storage.ts) |
| Orchestrator reads from | Imports `getPlans` from plan-storage.ts (line 11) |
| Are they connected? | **YES** - direct import at line 11 |
| Orchestrator filters | `plans.filter((p) => p.status === 'active')` (line 161) |
| Error handling | Throws `'No active compensation plans found'` if empty (line 164) |

**STATUS:** VERIFIED - orchestrator correctly imports from plan-storage

### 4.2 Data-Component Mapper
- **File exists:** YES
- **Lines:** 784
- **Exported functions (12):**
  - `getMappings`, `getPlanMappings`, `saveMapping`, `saveMappings`
  - `deleteMapping`, `extractRequiredMetrics`, `autoMapFields`
  - `autoMapPlan`, `buildComponentDataMap`, `resolveMetrics`
  - `addManualMapping`, `resetTenantMappings`, `getAvailableSourceFields`

**STATUS:** VERIFIED - complete implementation

### 4.3 Context Resolver
- **File exists:** YES
- **Lines:** 520
- **Exported functions (3):**
  - `buildCalculationContext`
  - `buildEmployeeMetrics`
  - `buildAllEmployeeMetrics`
- **Data layer integration:**
  - Reads from `data_layer_committed` (line 61)
  - Reads from `data_layer_batches` (line 62)
  - Reads from localStorage for periods and employees

**STATUS:** VERIFIED - reads committed data from data layer

### 4.4 Results Formatter
- **File exists:** YES
- **Lines:** 542
- **Exported functions (6):**
  - `formatResult`, `formatForReconciliation`, `formatForLegacyExport`
  - `exportToCSV`, `formatResults`, `getResultsSummary`
- **Legacy export:** YES - `LegacyExportFormat` interface with 15 columns

**STATUS:** VERIFIED - complete formatting implementation

### 4.5 Orchestrator Integration
| Integration | Status |
|-------------|--------|
| Imports context-resolver | YES (lines 13-16) |
| Uses buildCalculationContext | YES (line 152) |
| Uses buildEmployeeMetrics | YES (line 324) |
| Imports data-component-mapper | NO - indirect via context-resolver |

**STATUS:** VERIFIED - orchestrator integrates with context resolver

### 4.6 Reconciliation Bridge
- **reconcileCalculationsWithLegacy:** EXISTS (line 945)
- **getCalculationResultsForReconciliation:** EXISTS (line 998)
- **parseLegacyCSV:** EXISTS (line 1031)

**STATUS:** VERIFIED - reconciliation functions implemented

### 4.7 Calculate UI Page
- `/operate/calculate/page.tsx` re-exports from `/admin/launch/calculate/page.tsx`
- Calculate page uses:
  - `runPeriodCalculation` and `previewPeriodCalculation` from orchestrator
  - `getPeriodRuns` for history
  - `getPlansWithStatus` and `activatePlan` from plan-storage
- Has "Run Preview" and "Run Official Calculation" buttons

**STATUS:** VERIFIED - full calculation UI with orchestrator integration

---

## Section 5: Role Context

### 5.1 Landing Page Role Awareness
File: `src/app/perform/page.tsx`

| Check | Finding |
|-------|---------|
| Imports useAuth | YES (line 13) |
| Imports isCCAdmin | YES (line 14) |
| Checks role | YES - `const isManager = userRole === 'manager' || userRole === 'admin' || userRole === 'cc_admin'` |
| Role-based rendering | YES - lines 174, 189 show manager-only content |

**STATUS:** VERIFIED - landing page renders different content based on role

### 5.2 Pulse Role Filtering
File: `src/lib/navigation/pulse-service.ts`

- Role-aware metric selection via switch statement (lines 24-31)
- Separate metric sets for: `sales_rep`, `manager`, `admin`, `cc_admin`
- Each metric has `roles: ['role_name']` filter

**STATUS:** VERIFIED - Pulse provides role-specific metrics

### 5.3 CC Admin Locale Enforcement

**Files WITH isCCAdmin check (22 files):**
```
src/app/design/page.tsx
src/app/configure/periods/page.tsx
src/app/configure/page.tsx
src/app/select-tenant/page.tsx
src/app/investigate/page.tsx
src/app/admin/launch/reconciliation/page.tsx
src/app/admin/launch/calculate/page.tsx
src/app/admin/launch/plan-import/page.tsx
src/app/admin/launch/page.tsx
src/app/admin/tenants/new/page.tsx
src/app/operations/rollback/page.tsx
src/app/operate/monitor/quality/page.tsx
src/app/operate/monitor/operations/page.tsx
src/app/operate/monitor/readiness/page.tsx
src/app/operate/pay/page.tsx
src/app/operate/import/page.tsx
src/app/operate/page.tsx
src/app/transactions/inquiries/page.tsx
src/app/perform/page.tsx
src/app/govern/page.tsx
src/app/page.tsx
src/app/login/page.tsx
```

**Files MISSING isCCAdmin check but using isSpanish (26 files):**
```
src/app/insights/trends/page.tsx
src/app/insights/analytics/page.tsx
src/app/configuration/locations/page.tsx
src/app/configuration/teams/page.tsx
src/app/configuration/personnel/page.tsx
src/app/spm/alerts/page.tsx
src/app/workforce/roles/page.tsx
src/app/workforce/permissions/page.tsx
src/app/workforce/teams/page.tsx
src/app/workforce/personnel/page.tsx
src/app/admin/demo/page.tsx
src/app/admin/access-control/page.tsx
src/app/operations/audits/logins/page.tsx
src/app/operations/audits/page.tsx
src/app/operations/data-readiness/page.tsx
src/app/operations/messaging/page.tsx
src/app/integrations/catalog/page.tsx
src/app/transactions/page.tsx
src/app/performance/scenarios/page.tsx
src/app/performance/approvals/plans/page.tsx
src/app/approvals/page.tsx
src/app/data/quality/page.tsx
src/app/data/operations/page.tsx
src/app/data/readiness/page.tsx
src/app/data/import/enhanced/page.tsx
src/app/notifications/page.tsx
```

**STATUS:** INCOMPLETE - 26 files missing CC Admin locale override

---

## Section 6: Demo User Switcher

| Check | Finding |
|-------|---------|
| Component location | `src/components/demo/DemoUserSwitcher.tsx` |
| Rendered in | `src/components/layout/auth-shell.tsx` (line 42) |
| Inside Rail? | NO |
| Position | Floating separately (after CommandPalette, before closing tags) |

**STATUS:** VERIFIED - DemoUserSwitcher renders as floating component in auth-shell, not inside rail

---

## Section 7: UX Elements

### 7.1 Breadcrumbs
| Check | Finding |
|-------|---------|
| Breadcrumb files | 2 files reference "breadcrumb" |
| Location 1 | `src/app/insights/analytics/page.tsx` |
| Location 2 | `src/components/design-system/ModuleShell.tsx` |

**STATUS:** PARTIALLY IMPLEMENTED - breadcrumbs exist in limited locations

### 7.2 Duplicate Search Surfaces
| Location | Has Search? |
|----------|-------------|
| Navbar | YES - `GlobalSearch` component (line 177) |
| MissionControlRail | NO direct search input |
| Both trigger Cmd+K | YES - CommandPalette handles keyboard shortcut |

**STATUS:** NO DUPLICATE - Navbar has search bar, Rail triggers command palette via Cmd+K

### 7.3 Duplicate User Identity
| Location | Has User Menu? |
|----------|----------------|
| Navbar | YES - imports `UserMenu` (line 32), uses `user` from auth |
| MissionControlRail | Has `UserIdentity` component import |

**STATUS:** CANNOT VERIFY without checking if both render simultaneously

### 7.4 Auth Flash Protection
| Check | Finding |
|-------|---------|
| Has loading state | YES - `isLoading` from `useAuth()` (line 48) |
| Loading check | YES - `if (isLoading)` returns spinner (line 66) |
| Spinner component | YES - full-page centered spinner with "Loading..." text |
| Prevents flash | YES - auth check runs before rendering protected content |

**STATUS:** VERIFIED - loading spinner prevents dashboard flash before auth determined

---

## Section 8: Old Route Redirects

### next.config.mjs Redirects (3 defined)
```javascript
{ source: '/data/transactions', destination: '/transactions', permanent: true }
{ source: '/data/reports', destination: '/insights', permanent: true }
{ source: '/transactions/orders', destination: '/transactions', permanent: true }
```

### Old Route Files Still Exist
| Route | Status |
|-------|--------|
| `/insights/page.tsx` | EXISTS - working directly |
| `/data/import/page.tsx` | EXISTS - working directly |
| `/transactions/page.tsx` | EXISTS - working directly |
| `/performance/plans/page.tsx` | EXISTS - working directly |
| `/configuration/page.tsx` | EXISTS - working directly |
| `/operations/page.tsx` | MISSING |

**STATUS:** MIXED - Some old routes redirect, others work via original page.tsx files

---

## Section 9: Tenant Data Isolation

### Static vs Dynamic Tenants
| Check | Finding |
|-------|---------|
| Static tenant list | `STATIC_TENANT_IDS = ['retailco', 'restaurantmx', 'techcorp']` |
| Dynamic detection | `isDynamicTenant()` returns true if NOT in static list |
| Static detection | `isStaticTenant()` returns true if IN static list |

### Queue Service Tenant Filtering
| Check | Finding |
|-------|---------|
| Takes tenantId | YES - `getQueueItems(userId, tenantId, role)` (line 17) |
| Uses tenantId | YES - passes to all source aggregators |
| Filters by tenant | YES - localStorage keys prefixed with `${tenantId}_` |

**STATUS:** VERIFIED - Queue items filter by tenant ID

---

## Key Findings Summary

### Working Correctly
1. Navigation wiring (WorkspaceSwitcher, CycleIndicator, QueuePanel, CommandPalette)
2. Calculation pipeline (orchestrator → plan-storage → context-resolver → results-formatter)
3. Role-based content in Perform landing
4. Pulse metrics role filtering
5. Auth flash protection with loading spinner
6. Tenant data isolation in queue service
7. Demo user switcher placement

### Incomplete/Issues
1. **19 missing workspace routes** (Investigate: 5, Design: 4, Configure: 4, Govern: 5, Perform: 1)
2. **26 files missing CC Admin locale override**
3. Breadcrumbs only in 2 locations
4. Mixed old route handling (some redirect, some direct page.tsx)

### Cannot Verify
1. Whether UserIdentity renders in both Navbar and Rail simultaneously

---

## Audit Completed
**Auditor:** Claude (Opus 4.5)
**Method:** Read-only file inspection, grep, find, wc
**No files modified. No build run.**
