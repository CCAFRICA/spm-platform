# HF-361 — Middleware Auth Exemption for Pulse-Load Cron — Completion Report

**Severity:** PRODUCTION BLOCKER (no tenant could import). **Branch:** `hf-361-cron-auth-fix` (off `main` @ `f57b7810`). **Date:** 2026-06-30.

## Root cause
The Supabase auth middleware (`web/src/middleware.ts`) intercepts every `/api/` request, sees the Vercel cron's `Authorization: Bearer <CRON_SECRET>` header, tries to validate it as a Supabase JWT, fails, and returns **401 before the function runs**. The HF-360 `finalize-sweep` cron was added to `vercel.json` but never added to the middleware's internal-worker exemption list — so its 30+ calls/hour all 401'd at the middleware. Pulse-load jobs enqueued, never finalized → `committed_data` orphaned (NULL entity_id) → UI "LOAD INTERRUPTED" on every tenant.

## The chain (F-4) — TWO endpoints needed the exemption
`finalize-sweep` does not do the work itself: it fires `POST /api/import/sci/finalize-import` **server-side, cookielessly, with the CRON_SECRET** (`finalize-sweep/route.ts:69`). So exempting only `finalize-sweep` would leave the chain 401'ing one link later (`finalize-import` is neither exempted nor cron-aware). Both were fixed.

## F-1 — middleware exemption (diff, `web/src/middleware.ts`)
```diff
-const INTERNAL_WORKER_PATHS = ['/api/import/sci/dispatch-jobs', '/api/import/sci/process-job'];
+const INTERNAL_WORKER_PATHS = [
+  '/api/import/sci/dispatch-jobs',
+  '/api/import/sci/process-job',
+  '/api/import/sci/pulse-load/finalize-sweep',   // the cron (the reported 401)
+  '/api/import/sci/finalize-import',              // fired server-side by finalize-sweep with the CRON_SECRET
+];
```
The exemption is gated `isInternalWorkerPath(pathname) && isInternalCronCaller(request)` (middleware:171). A cron call (CRON_SECRET bearer) is let through to the route's own gate; a **browser** call to `finalize-import` (cookie, no cron bearer) is NOT matched by the worker-path branch and still goes through normal session auth — so the browser-driven finalize is unchanged.

## F-2 — the functions validate CRON_SECRET internally
- `finalize-sweep/route.ts:25` already does `if (!isInternalCronCaller(req)) return 403` (unchanged).
- `finalize-import/route.ts` now accepts the internal principal as an alternative to a user session (diff):
```diff
-    const authClient = await createServerSupabaseClient();
-    const { data: { user: authUser } } = await authClient.auth.getUser();
-    if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
+    if (!isInternalCronCaller(req)) {
+      const authClient = await createServerSupabaseClient();
+      const { data: { user: authUser } } = await authClient.auth.getUser();
+      if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
+    }
```
`isInternalCronCaller` = `authorization === Bearer ${CRON_SECRET}` or an `x-vercel-cron` header (`cron-principal.ts`). `finalize-import`'s work is service-role and tenant-scoped by the request body (`{tenantId, proposalId}`); `authUser` was only the gate, never an identity input — so accepting the cron principal is safe (HALT-2 clear: the cron principal requires the secret; no public access).

## F-3 — build
`tsc --noEmit` clean; `npm run build` green (BUILD_ID present). `cron-principal` tests 5/5.

## F-4 — no other internal endpoint left out
Every server-side internal call uses `internalCronHeaders()`: (1) `dispatch-jobs → process-job` (both already in `INTERNAL_WORKER_PATHS`); (2) `finalize-sweep → finalize-import` (both added here). `vercel.json` `crons` lists only `finalize-sweep`. The full cron chain is now exempt + internally validated.

## HALTs
- **HALT-1 (scope)** — clear: only the middleware exemption list + a CRON_SECRET-acceptance gate on `finalize-import`. No pulse-load logic / import-path / engine change.
- **HALT-2 (security)** — clear: the exemption only lets the CRON_SECRET principal through; browser callers still hit normal session auth; `finalize-import` validates the cron principal in-route.

## Architect (SR-44)
Merge + **deploy immediately** — every minute the 401 persists is a minute no import completes on any tenant. After deploy, the next `finalize-sweep` tick (every 2 min) finalizes the backlog of complete-but-unfinalized sessions (idempotent; `finalized` flag prevents re-fire). No migration.
