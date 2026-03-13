# HF-125 Phase 0: Diagnostic

## 0A: /operate Current State
`/operate/page.tsx` renders the Pipeline Readiness Cockpit (OB-108) — 700 lines of functional content.
BUT lines 405-444 contain a `useEffect` that auto-redirects based on tenant state:
- ICM + latestBatch (calc exists) -> `router.replace('/stream')` (LINE 431)
- ICM + data but no calc -> `router.replace('/operate/calculate')`
- Empty tenant -> `router.replace('/operate/import')`

**Result**: For BCL (which has calculation results), /operate ALWAYS redirects to /stream.
The Pipeline Readiness Cockpit never renders. This is CLT166-F01 / CLT165-F02.

## 0B: /perform Current State
Module-Aware Persona Dashboard (OB-105). No auto-redirect. Functions correctly.

## 0C: Calculate Routes
Two routes exist:
1. `/admin/launch/calculate/page.tsx` — Legacy. Uses RequireRole(['vl_admin', 'admin']). But middleware blocks all non-`platform` roles at `/admin/*`.
2. `/operate/calculate/page.tsx` — OB-145. Uses RequireRole(['platform', 'admin']). Uses OperateProvider from /operate/layout.tsx. This is the correct route for tenant admins.

## 0D: RequireRole on Calculate
- `/operate/calculate/page.tsx` line 548: `RequireRole roles={['platform', 'admin']}` — ALLOWS admin
- Line 67: `hasAccess = user && (isVLAdmin(user) || user.role === 'admin')` — ALLOWS admin
- Both checks allow 'admin' role. The page-level access is correct.

## 0E: Middleware RESTRICTED_WORKSPACES
```
'/admin':     ['platform']           <- BLOCKS admin, tenant_admin
'/operate':   ['platform', 'admin', 'tenant_admin']  <- ALLOWS admin
```
Patricia (role='admin') can access `/operate/*` but CANNOT access `/admin/*`.

## 0F: Sidebar Calculate Link
workspace-config.ts line 95: `{ path: '/admin/launch/calculate', ... roles: ['platform', 'admin'] }`

The sidebar SHOWS the Calculate link to admin users, but the link points to `/admin/launch/calculate` which middleware blocks. This is CLT118-F1.

Fix: Change sidebar path from `/admin/launch/calculate` to `/operate/calculate`.

## 0G: Patricia's Role
profiles.role = 'admin' (provisioned in OB-163).
JWT user_metadata.role: needs Supabase query to verify.
Middleware checks user_metadata.role first, falls back to profiles.role.

## 0H: /stream Empty State
stream/page.tsx lines 140-154: When error or no data:
- Shows "No Intelligence Available" with text guidance
- NO action button — text-only dead end (CLT166-F02)

## 0I: OB-166 Phase 1 Did Restore /operate
The file was restored to its pre-OB-165 state (Pipeline Readiness Cockpit). But the auto-redirect useEffect (HF-076 Decision 57, lines 405-444) was part of that restore — it existed BEFORE OB-165.

The redirect is not an OB-165 regression — it's original HF-076 behavior. But it makes /operate unreachable for any tenant with calculation results.
