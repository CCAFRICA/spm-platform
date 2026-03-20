# DIAG-011 COMPLETION REPORT
## Date: March 20, 2026

## ROOT CAUSE ANALYSIS — EVIDENCE-BASED

### Failure 1: auth.login.success never appears
- **File:** `web/src/lib/supabase/auth-service.ts`
- **Line:** 46
- **What happens:** `logAuthEventClient('auth.login.success', { email, userId: data.user?.id })` is called but NOT awaited. The function returns `data` immediately at line 47.
- **Why it fails:** The auth context's `login()` function receives the returned data and immediately calls `router.push('/select-tenant')` (line 265 of auth-context.tsx). The page navigation aborts the in-flight `fetch('/api/auth/log-event')`. The POST request is cancelled before the server processes it.
- **Certainty:** 95% — code proves the fetch is fire-and-forget. The Vercel log showing GET→307 (not POST→200) at the login.success moment confirms the POST was never completed.
- **Fix:** `await logAuthEventClient(...)` before `return data`.

### Failure 2: Patricia logout tenant_id = NULL
- **File:** `web/src/lib/supabase/auth-service.ts`
- **Lines:** 87-91
- **What happens:** `logAuthEventClient('auth.logout', { actor_id: loggedUserId, email: loggedEmail })` passes actor_id explicitly but does NOT pass tenant_id.
- **Why it fails:** The API route at `log-event/route.ts` line 43 checks `if (!actorId)` — since actorId IS provided (from getUser), it SKIPS the cookie-based resolution entirely (lines 44-71). But tenant_id was never set because the payload doesn't include it. So `tenantId` stays `null` (line 39 default).
- **Certainty:** 100% — code proves: explicit actor_id → cookie resolution skipped → tenant_id never resolved.
- **Fix:** Capture tenant_id from profile BEFORE signOut and pass it in the payload: `{ actor_id, email, tenant_id }`.

### Failure 3: login.failure reason = NULL
- **File:** `web/src/lib/supabase/auth-service.ts`
- **Line:** 41
- **What happens:** `logAuthEventClient('auth.login.failure', { email, error: error.message })` stores the error message under key `error`, not `reason`.
- **Why it fails:** The production query uses `payload->>'reason'` to extract the failure reason. The key in the payload is `error`, not `reason`. Both are valid — the query key doesn't match the stored key.
- **Certainty:** 100% — key mismatch between write (`error`) and read (`reason`).
- **Fix:** Either query `payload->>'error'` or change the key to `reason` in the logger call.

### Failure 4: 3 duplicate auth.mfa.verify.success per Patricia login
- **File:** `web/src/app/auth/mfa/verify/page.tsx`
- **Line:** 53
- **What happens:** `logAuthEventClient('auth.mfa.verify.success')` fires after successful MFA verify. But 3 events appear 10+ seconds apart.
- **Why it triggers 3 times:** The MFA verify page component may unmount and remount during the auth flow (React strict mode, or the MFA challenge being re-issued). Each mount cycle with a valid code triggers a new verify attempt. The 5-second dedup window in `logAuthEventClient` doesn't catch events 10+ seconds apart.
- **Certainty:** 70% — the code shows a single call site with a loading guard, but React lifecycle (strict mode double-render, or page transition triggers) could cause multiple mounts. Runtime debugging needed to confirm exact trigger.
- **Possible fix:** Track verification success in a ref that persists across re-renders, or redirect immediately after successful verify without waiting for log.

### Failure 5: POST /api/auth/log-event → 307 during login flow
- **File:** `web/src/middleware.ts`
- **Lines:** 31-51
- **What intercepts the POST:** `/api/auth` IS in PUBLIC_PATHS (line 37). `isPublicPath('/api/auth/log-event')` returns `true`. The middleware should NOT redirect this route.
- **Why 307 instead of 200:** The 307 is likely NOT from the middleware. It may be the browser following a redirect chain during the login transition. When `signInWithPassword` completes and `router.push('/select-tenant')` fires, the browser may redirect pending requests. Alternatively, the GET→307 in Vercel logs is from a prefetch or navigation request, not the actual log-event POST.
- **Certainty:** 60% — the middleware code proves `/api/auth/log-event` IS public. The 307 source is uncertain. May require runtime network trace.
- **Alternative explanation:** Vercel's Edge middleware may be converting the POST to a GET during a redirect chain. This is a known behavior when a 307 redirect preserves the method but the browser/edge doesn't.

## SUMMARY OF ROOT CAUSES

| Failure | Root Cause | Certainty | Fix Category |
|---------|-----------|-----------|-------------|
| F1: login.success missing | `logAuthEventClient` not awaited → fetch cancelled by navigation | 95% | Add `await` |
| F2: logout tenant_id NULL | Explicit actor_id bypasses cookie resolution → tenant_id never set | 100% | Pass tenant_id explicitly |
| F3: failure reason NULL | Key mismatch: stored as `error`, queried as `reason` | 100% | Change key to `reason` or query `error` |
| F4: 3 MFA verify events | React re-render/remount cycles firing verify 3 times | 70% | Add ref-based dedup |
| F5: POST→307 | Uncertain. Middleware allows route. May be navigation race. | 60% | Needs runtime trace |

## STANDING RULE COMPLIANCE
- Rule 29 (no code changes until diagnostic): PASS — zero source files modified
- All files examined in full (auth-logger.ts, log-event/route.ts, auth-service.ts, auth-context.tsx, middleware.ts, MFA pages)
