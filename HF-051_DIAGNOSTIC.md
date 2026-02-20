# HF-051 Diagnostic: Production Page Resolution + GPV + Sidebar

## 1. Pages Tested

| Page | Data Fetching | Loading State | Empty State | Verdict |
|------|--------------|--------------|-------------|---------|
| `/operate` | `loadOperatePageData()` Supabase | `isLoading && periods.length===0` → spinner | Falls through to content | **AT RISK**: If load hangs or tenant slow, spinner forever |
| `/configure` | None (static nav hub) | None | N/A | **OK** |
| `/govern` | None (static nav hub) | None | N/A | **OK** |
| `/investigate` | None (static nav hub) | None | N/A | **OK** |
| `/perform` | Redirect to `/` | N/A | N/A | **OK** |
| `/insights` | `listCalculationBatches` | `isLoading` spinner | Proper empty state (OB-29) | **OK** |
| `/` (root) | GPV hook + period context | `gpvLoading` spinner | GPV wizard renders on empty data | **BROKEN**: GPV blocks dashboard |

## 2. Operate Page Loading Pattern

```typescript
// operate/page.tsx line 150-158
if (isLoading && periods.length === 0) {
  return <spinner>"Loading periods..."</spinner>;
}
```

**Issue chain:**
1. Component mounts with `isLoading=true`, `periods=[]`
2. `tenantId = currentTenant?.id ?? ''` — starts as `''` while TenantContext loads
3. useEffect: `if (!tenantId) return;` — returns early, `isLoading` stays `true`
4. Line 142: `if (!tenantId)` catches this → shows "Select a tenant" message
5. TenantContext resolves → `tenantId` changes → useEffect fires → `loadOperatePageData`
6. If Supabase is slow or returns error, `isLoading` can stay true during transition

**Root cause:** The `isLoading && periods.length === 0` pattern doesn't account for the case where loading finished but data is empty. Fixed by: `isLoading ? spinner : periods.length === 0 ? emptyState : content`.

## 3. GPV Wizard Rendering Trigger

**File:** `web/src/app/page.tsx`, line 65:
```typescript
if (!gpvComplete && !hasCalculationData && !skippedGPV && currentStep < 4) {
  return <GPVWizard ... />;
}
```

**Conditions for GPV to show:**
1. `!gpvComplete` — `completed_at` is null (default for all tenants)
2. `!hasCalculationData` — `availablePeriods.length === 0` (no calculation data)
3. `!skippedGPV` — `sessionStorage.gpv_skipped !== 'true'`
4. `currentStep < 4` — step progression < complete

**Problem:** For ANY production tenant without prior calculations, the GPV wizard shows as the landing page. It shows "Upload Your Compensation Plan" with a file drop zone — ICM-specific language, not ready for public.

**GPV Hook:** `web/src/hooks/useGPV.ts` — fetches from `/api/gpv?tenantId=X`, catches errors and returns DEFAULT_GPV (all false, completed_at=null). So even if the API fails, GPV still shows.

## 4. Sidebar Font Sizes (ChromeSidebar.tsx)

| Element | Line | Current | Target |
|---------|------|---------|--------|
| Tenant name | 254 | 12px | 12px (OK) |
| Observatory link | 275 | 12px | 12px (OK) |
| "Workspaces" header | 286 | **11px** | 12px |
| Workspace buttons | 333 | **13px** | 14px |
| Active workspace label | 353 | **11px** | 12px |
| ⌘K hint | 397 | **11px** | 12px |
| Single-child route link | 528 | **13px** | 14px |
| Section accordion header | 553 | **11px** | 12px |
| Route count badge | 559 | **10px** | 12px |
| Route links in sections | 585 | **13px** | 14px |

**7 elements need size increase.** No element should be below 12px.
