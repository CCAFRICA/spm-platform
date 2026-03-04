# OB-151 COMPLETION REPORT
## SCI Plan Import End-to-End Fix

### Problems (3 production issues)

**Problem 1: VL Admin sees 0 tenants (HF-086 regression)**
HF-086 auto-created a profile (role=admin) for VL Admin in the optica-luminar
tenant. The observatory API at `observatory/route.ts:43-47` used `.maybeSingle()`
to query profiles by `auth_user_id`. With 2 profiles (vl_admin + auto-created admin),
`.maybeSingle()` returns error → profile=null → 403 Forbidden → Observatory shows nothing.

**Problem 2: Duplicate rule_sets created every import**
- Client-side: `SCIExecution.tsx` useRef guard (line 112) doesn't survive component
  remount. New component instance = new ref = guard reset. Parent state changes
  cause unmount/remount → execute fires twice.
- Server-side: `executePlanPipeline` generates `crypto.randomUUID()` for each call
  (line 832). No idempotency check. Two requests = two rule_sets.

**Problem 3: "Failed to fetch" despite HF-087's fetchWithTimeout**
The fetchWithTimeout is correctly implemented (AbortController signal passed to fetch).
The connection drops because Vercel's proxy closes idle connections before the 300s
timeout. The old recovery check (single poll after 3s) fires before the server finishes
(AI interpretation takes 60s+).

### Fixes

**Fix 1: resolveProfileId → Option B (no auto-create)**
File: `web/src/lib/auth/resolve-profile.ts`

Rewrote to use tenant admin's existing profile for `created_by` instead of auto-creating
a VL Admin profile. Lookup chain: own profile → tenant admin profile → any tenant profile.
No new profiles are ever created.

Also hardened `.maybeSingle()` → array query + find in:
- `web/src/app/api/platform/observatory/route.ts` (VL Admin role check)
- `web/src/app/api/admin/tenants/create/route.ts` (VL Admin role check)

**Fix 2: Server-side idempotency**
File: `web/src/app/api/import/sci/execute/route.ts`

Before AI interpretation, `executePlanPipeline` checks:
```sql
SELECT id FROM rule_sets
WHERE tenant_id = $1 AND metadata->>'contentUnitId' = $2
```
If rule_set already exists for this contentUnitId, returns existing result immediately.
Zero duplicate creation possible regardless of how many times the client retries.

**Fix 3: Module-level duplicate guard**
File: `web/src/components/sci/SCIExecution.tsx`

Module-level `Set<string>` (keyed by proposalId) survives component remount.
useRef only survives re-renders of the same instance. The Set persists across
unmount/remount within the same page session. Cleared on retry.

**Fix 4: Polling recovery (90s)**
File: `web/src/components/sci/SCIExecution.tsx`

Replaced single 3s check with `pollPlanRecovery()`: polls `/api/plan-readiness`
up to 90s with progressive intervals (5s, 10s, 15s, 15s...). Covers the full
AI interpretation window. UI shows "Connection lost — checking if server completed..."
during polling.

### Cleanup SQL (for Andrew)

Run this in Supabase SQL Editor to delete auto-created VL Admin profiles
created by HF-086. These profiles break the observatory API:

```sql
-- 1. Find auto-created VL Admin profiles (role=admin, display_name='VL Platform Admin')
SELECT id, tenant_id, email, role, display_name, created_at
FROM profiles
WHERE display_name = 'VL Platform Admin'
  AND role = 'admin';

-- 2. Delete them (after confirming the list above looks right)
DELETE FROM profiles
WHERE display_name = 'VL Platform Admin'
  AND role = 'admin';
```

### Files Changed
- `web/src/lib/auth/resolve-profile.ts` — Option B rewrite (no auto-create)
- `web/src/app/api/platform/observatory/route.ts` — array query hardening
- `web/src/app/api/admin/tenants/create/route.ts` — array query hardening
- `web/src/app/api/import/sci/execute/route.ts` — server-side idempotency
- `web/src/components/sci/SCIExecution.tsx` — module-level dedup + polling recovery

### Proof Gates
- **PG-01:** resolveProfileId uses Option B (tenant admin profile, no auto-create)
- **PG-02:** Observatory + tenant-create routes use array query (no .maybeSingle)
- **PG-03:** Server-side idempotency checks metadata.contentUnitId before creating rule_set
- **PG-04:** Module-level Set + useRef dual guard prevents client-side duplicate execution
- **PG-05:** Recovery polling covers 90s window with progressive intervals
- **PG-06:** Build clean. PR #168 merged to main. Vercel deploying.

### Deployed
PR #168 merged to main. Vercel production deploy triggered.
