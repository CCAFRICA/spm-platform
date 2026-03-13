# HF-128 Completion Report — Complete Tenant Admin Access

## Problem
Patricia Zambrano (admin@bancocumbre.ec, role: `admin`) cannot access Plan Import from the sidebar. Clicking "Plan Import" in the Configure workspace shows "Access Restricted".

## Root Cause
The Plan Import sidebar link in `workspace-config.ts` pointed to `/admin/launch/plan-import`. Middleware `RESTRICTED_WORKSPACES` restricts `/admin` to `['platform']` only. Patricia's `admin` role is not in that list.

The page at `/admin/launch/plan-import/page.tsx` is just a client-side redirect (`router.replace('/operate/import')`), but middleware blocks the request before the React component mounts.

## Route Audit (Phase 0)
All `/admin/launch/*` routes (5 pages) are blocked for admin role by middleware. All `/operate/*` routes (7+ pages) are accessible to admin role.

| Sidebar Link | Previous Path | Status |
|-------------|--------------|--------|
| Plan Import | `/admin/launch/plan-import` | **BLOCKED** |
| All other links | `/operate/*` or `/configure/*` | Accessible |

Only ONE sidebar link pointed to a blocked path.

## Fix Applied
**File:** `web/src/lib/navigation/workspace-config.ts` line 125

| Before | After |
|--------|-------|
| `/admin/launch/plan-import` | `/operate/import/enhanced` |

The unified SCI import page at `/operate/import/enhanced` handles both data and plan imports. It lives under `/operate/` which allows `['platform', 'admin', 'tenant_admin']`.

## Verification
- `npm run build` — exit 0, no TypeScript errors
- Route `/operate/import/enhanced` is already in the Import section of the Operate workspace (line 86), confirming the page exists and is accessible
- Middleware allows admin role for `/operate/*` paths
- No other sidebar links point to blocked `/admin/launch/*` paths

## CLT Registry
| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT166-F30 (Plan Import blocked) | OPEN | FIXED | Sidebar now routes to /operate/import/enhanced |

## Build
```
npm run build — exit 0
No TypeScript errors
1 file changed, 1 insertion(+), 1 deletion(-)
```
