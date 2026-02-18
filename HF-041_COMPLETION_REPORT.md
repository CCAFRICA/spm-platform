# HF-041 Completion Report: AUTH BYPASS + PLAN IMPORT UUID FIX

## Status: COMPLETE

## Bugs Fixed

### Bug 1: Auth Bypass (P0 Security)
**Problem**: Unauthenticated users hitting vialuce.ai in incognito could see the full authenticated platform.

**Root Cause**: Middleware env var guard at `middleware.ts:50-58` returned `NextResponse.next()` when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` were missing. This **fail-open** behavior silently disabled ALL auth enforcement, passing every request through to the client-side app shell.

**Fix**: Changed to **fail-closed** behavior:
- Protected routes → redirect to `/landing`
- Public paths (`/login`, `/signup`, `/landing`, `/auth/callback`) → still render normally
- Added `console.error()` (not warn) so the condition is immediately visible in production logs

**File Changed**: `web/src/middleware.ts`

### Bug 2: Plan Import UUID (P0 Functional)
**Problem**: Plan import failed with `"invalid input syntax for type uuid: 'VL Platform Admin'"`.

**Root Cause**: `plan-import/page.tsx` sent `user?.name` (display name) as `createdBy`/`updatedBy`, but `rule_sets.created_by` is a UUID column. The API route also had a bad fallback to `user.email` (also not a UUID).

**Fix**:
- Client page: Changed `user?.name` → `user?.id` for both `createdBy` and `updatedBy` (4 occurrences)
- API route: Changed `user.email` fallback → `user.id` for `created_by` and `metadata.updated_by`

**Files Changed**:
- `web/src/app/admin/launch/plan-import/page.tsx` (lines 578-579, 597-599)
- `web/src/app/api/plan/import/route.ts` (lines 84, 87)

## Commits
1. `6859411` — HF-041 Phase 1: Fix auth bypass — middleware fails closed when env vars missing
2. `9394ca5` — HF-041 Phase 2: Fix plan import UUID — use user.id not user.name

## Build Verification
- `npm run build` passes with zero errors
- All 140+ routes compile successfully
- Middleware compiles at 74.4 kB

## Browser Verification Tests (for Andrew)

### Test 1: Auth Bypass — Incognito Access Blocked
1. Open Chrome/Safari incognito window
2. Navigate to `vialuce.ai` (or localhost:3000 if local)
3. **Expected**: Redirect to `/landing` page (marketing page with "Log In" / "Start Free" buttons)
4. **NOT expected**: Dashboard, GPV wizard, sidebar navigation, or any tenant data

### Test 2: Auth Bypass — Protected Routes Blocked
1. In incognito, navigate directly to `vialuce.ai/configure`
2. **Expected**: Redirect to `/login?redirect=%2Fconfigure`
3. Repeat for `/admin/launch`, `/insights`, `/operate/import`
4. All should redirect to `/login`

### Test 3: Auth Bypass — Public Routes Still Work
1. In incognito, navigate to `vialuce.ai/landing`
2. **Expected**: Landing page renders normally
3. Navigate to `vialuce.ai/login` — login page renders
4. Navigate to `vialuce.ai/signup` — signup page renders

### Test 4: Auth Flow Still Works
1. From incognito `/login`, sign in with valid credentials
2. **Expected**: Redirect to `/` (dashboard) for tenant users, or `/select-tenant` for VL Admin
3. Verify sidebar, navbar, dashboard content all render
4. Click logout → should redirect to `/login`

### Test 5: Plan Import UUID Fixed
1. Sign in as VL Admin, select a tenant
2. Navigate to Admin > Launch > Plan Import
3. Upload a plan file (CSV, XLSX, or PPTX)
4. Review AI interpretation, click "Confirm & Import Plan"
5. **Expected**: Plan imports successfully, shows green success card
6. **NOT expected**: Error "invalid input syntax for type uuid: 'VL Platform Admin'"

## Architecture Notes

The auth system has defense-in-depth with 3 layers:
1. **Middleware** (edge): Redirects unauthenticated users before the page even loads
2. **AuthShell** (client): Public route bypass at component level — `/login`, `/landing`, `/signup` skip auth checks entirely
3. **AuthShellProtected** (client): Shows loading spinner while checking auth, redirects to `/login` if not authenticated

The middleware env var guard was the weakest link — it failed open instead of closed. Now all 3 layers fail-closed.
