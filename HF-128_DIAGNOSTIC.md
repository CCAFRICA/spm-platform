# HF-128 Phase 0: Complete Tenant Admin Route Map

## Routes Under /admin/launch (ALL blocked for admin role by middleware)

| Route | Page Content | Actual Destination |
|-------|-------------|-------------------|
| /admin/launch/page.tsx | Landing page | Blocked by middleware |
| /admin/launch/plan-import/page.tsx | **Redirect to /operate/import** | Blocked before redirect fires |
| /admin/launch/reconciliation/page.tsx | Unknown (may be redirect) | Blocked, but /operate/reconciliation exists |
| /admin/launch/calculate/page.tsx | Calculate | Blocked, but /operate/calculate exists (HF-125) |
| /admin/launch/calculate/diagnostics/page.tsx | Calc diagnostics | Blocked |

## Middleware RESTRICTED_WORKSPACES

```
'/admin': ['platform']                               ← ONLY platform
'/operate': ['platform', 'admin', 'tenant_admin']    ← admin allowed
'/configure': ['platform', 'admin', 'tenant_admin']  ← admin allowed
```

## Routes Under /operate (ALL accessible to admin role)

| Route | RequireRole | Status |
|-------|------------|--------|
| /operate | ['platform', 'admin'] | ✅ Accessible |
| /operate/calculate | ['platform', 'admin'] | ✅ Accessible (HF-125) |
| /operate/reconciliation | Full page | ✅ Accessible |
| /operate/results | Full page | ✅ Accessible |
| /operate/import | ['platform', 'admin'] | ✅ Accessible (unified SCI import) |
| /operate/import/enhanced | Import enhanced | ✅ Accessible |
| /operate/lifecycle | Operations center | ✅ Accessible |

## Sidebar Config Issues

| Sidebar Link | Current Path | Problem |
|-------------|-------------|---------|
| **Plan Import** (Configure workspace) | `/admin/launch/plan-import` | **BLOCKED by middleware** |
| All other links | `/operate/*` or `/configure/*` | ✅ Accessible |

## Root Cause

Only ONE sidebar link still points to a blocked `/admin/launch/*` path:
- **Plan Import** → `/admin/launch/plan-import` → middleware blocks admin role → "Access Restricted"

The page at `/admin/launch/plan-import` is just a client-side redirect to `/operate/import`. The middleware blocks it before the redirect can execute.

## Fix Required

Change the Plan Import sidebar link from `/admin/launch/plan-import` to `/operate/import/enhanced` (the unified SCI import page which handles both data and plan imports).
