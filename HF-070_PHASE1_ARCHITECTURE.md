# HF-070 Phase 1: Architecture Decision — Auth Bypass Fix

## ARCHITECTURE DECISION RECORD
============================
Problem: Unauthenticated users bypass login on production (Vercel) after HF-067 deploy.

Root Cause: R5 — Vercel Edge middleware caching. The middleware code is correct and unchanged
since HF-061 Amendment. Local testing confirms auth works. The production bypass is a deployment
artifact — Vercel may serve stale Edge middleware between deployments.

## Option A: Add guard comment to middleware (force cache invalidation)
- Scale test: N/A — auth is auth
- AI-first: N/A
- Transport: N/A
- Atomicity: Auth check is already atomic (pass or redirect). This just ensures the middleware is freshly deployed.
- Implementation: Add the HF-070 guard comment to middleware.ts. This creates a meaningful diff that forces Vercel to rebuild and redeploy the Edge middleware function on the next push.

## Option B: Add explicit cache-control headers to middleware responses
- Scale test: N/A
- AI-first: N/A
- Transport: N/A
- Atomicity: Same
- Problem: Middleware responses already use fresh `NextResponse.redirect()` objects. Adding cache-control to the redirect response doesn't affect Vercel's Edge middleware caching — that's a deployment-level cache, not a response-level cache.

## Option C: No code change — just redeploy
- Scale test: N/A
- AI-first: N/A
- Transport: N/A
- Atomicity: Same
- Problem: Doesn't prevent the same issue on future deployments. No audit trail of the fix.

## CHOSEN: Option A
Add the guard comment to middleware.ts. This:
1. Creates a meaningful diff that forces Vercel to rebuild the Edge middleware
2. Documents the auth gate's importance for future developers
3. Provides an audit trail
4. Updates AUTH_FLOW_REFERENCE.md to note the Vercel caching pattern

## REJECTED: Option B — Response headers don't control Edge middleware deployment caching.
## REJECTED: Option C — No prevention, no audit trail.

## Files to modify:
1. `web/src/middleware.ts` — Add guard comment (force redeployment)
2. `AUTH_FLOW_REFERENCE.md` — Document the Vercel caching failure pattern
