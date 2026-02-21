# OB-70 DIAGNOSTIC

## 1. Run Preview Button

**Root cause:** The "Run Preview →" button exists in the LifecycleStepper component.
- `lifecycle-service.ts:127`: `getNextAction('DRAFT')` returns `{ label: 'Run Preview', nextState: 'PREVIEW' }`
- `LifecycleStepper.tsx:83`: Button fires `onAdvance('PREVIEW')`
- `operate/page.tsx:125-134`: `handleAdvance` calls `transitionLifecycle(tenantId, activePeriodId, nextState)`
- `lifecycle-service.ts:208-216`: `transitionLifecycle()` tries to UPDATE `calculation_batches.lifecycle_state` WHERE tenant + period

**The bug:** `transitionLifecycle()` queries for an existing batch to update. But RetailCDMX has ZERO calculation_batches. The `.maybeSingle()` returns null, the function returns `{ success: false, error: 'No active calculation batch found' }`. The error is silently swallowed — no toast, no console error, no user feedback.

**The fix:** When the action is "Run Preview" (DRAFT → PREVIEW), the button must first POST to `/api/calculation/run` to create a batch + results, THEN the lifecycle state will be DRAFT (as set by the API). The stepper can then advance it.

**API route:** `web/src/app/api/calculation/run/route.ts` expects `{ tenantId, periodId, ruleSetId }`.

## 2. Personnel Page Crash

**File:** `web/src/app/configure/people/page.tsx`
- Line 10: `import { ReactFlowProvider } from '@xyflow/react'`
- Line 11: `import { OrganizationalCanvas } from '@/components/canvas/OrganizationalCanvas'`
- Default view is 'canvas' mode (line 19)
- ReactFlowProvider wraps OrganizationalCanvas (lines 61-67)

**Crash cause:** OrganizationalCanvas uses `@xyflow/react` which requires specific React context. If the canvas component fails to load data or the xyflow package has SSR issues, it crashes. The table mode (line 69-79) just shows a redirect button to `/workforce/personnel`.

**Separate page:** `web/src/app/workforce/personnel/page.tsx` exists with mock data (not querying Supabase entities). It has hardcoded employee arrays.

**Fix approach:** Replace the canvas-first page with a Supabase-backed entity table. The canvas is not needed for a personnel roster.

## 3. Sidebar Navigation

**File:** `web/src/components/navigation/Sidebar.tsx`

**Users missing:** The Configuration section (lines 174-187) has: Overview, Personnel, Teams, Locations, Terminology. No `/configure/users` entry.

**Status badges:** StatusBadge component exists (lines 288-305). It renders correctly. Status data comes from `getPageStatus(href)` in `page-status.ts`. Badges render for 'preview' (blue dot), 'coming' (outlined dot), and 'restricted' (lock icon). 'active' pages show nothing (intentional).

**Fix:** Add `{ name: 'Users', href: '/configure/users', module: 'configuration' }` to the Configuration children array.

## 4. Dispute Pages

**3 dispute pages found:**
- `/transactions/disputes/page.tsx` — calls `getAllDisputes()` (sync, returns `[]`)
- `/transactions/disputes/[id]/page.tsx` — calls `getDispute()` (sync, returns null)
- `/insights/disputes/page.tsx` — calls `getAllDisputes()` (sync, returns `[]`)

**Async functions exist:** `dispute-service.ts` lines 368-469:
- `createDisputeAsync()` → POST /api/disputes
- `updateDisputeAsync()` → PATCH /api/disputes/[id]
- `getDisputesAsync()` → GET /api/disputes
- `getDisputeAsync()` → GET /api/disputes/[id]

**Fix:** Replace sync calls with async equivalents. The page structure already handles empty arrays — just wire to real data.

## 5. Hardcoding

**Spanish field names in lib/ (CRITICAL):**
- `lib/demo/frmx-data-generator.ts`: 'fecha', 'meseroId' — DEMO module only
- `lib/demo/frmx-demo-provisioner.ts`: 'fecha', 'meseroId' — DEMO module only

**ICM-specific in components (MEDIUM):**
- `insights/compensation/page.tsx`: 'commission_rate', 'Comisión' — DEMO/insights module
- `insights/my-team/page.tsx`: 'totalCommission' — DEMO module
- `insights/sales-finance/page.tsx`: 'compensation: 125000' — DEMO module

**Assessment:** Hardcoded Spanish fields are confined to DEMO data generators (not pipeline logic). ICM-specific terms are in demo-mode insight pages. The core pipeline (import, calculation, dashboard) is clean.

## 6. Entity Data State

RetailCDMX tenant (`9b2bb4e3-...`): 24,833 entities, all with entity_type='individual', all with external_id and display_name populated via import.
