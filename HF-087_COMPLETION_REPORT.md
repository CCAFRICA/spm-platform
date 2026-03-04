# HF-087 COMPLETION REPORT
## Client-Side Fetch Timeout Fix

### Problem
SCI execute takes ~60 seconds for AI plan interpretation. Browser fetch drops connection
(no AbortController, no timeout). Server succeeds, user sees "Failed to fetch".
User retries, creating duplicate rule_sets.

### Root Cause
File: `web/src/components/sci/SCIExecution.tsx` lines 132, 158

Both `fetch('/api/import/sci/execute', ...)` calls had NO AbortController, NO timeout,
NO signal. Browser's default fetch behavior (or Vercel proxy) silently terminates
the connection after ~60 seconds of apparent inactivity during AI processing.

### Fix

1. **Fetch timeout (300s):** New `fetchWithTimeout()` helper wraps all SCI execute
   fetches with a 300-second AbortController. Matches server's `maxDuration=300`.
   Connection stays alive for the full server processing window.

2. **Recovery check:** On timeout/network error for plan units, waits 3 seconds then
   polls `/api/plan-readiness?tenantId=X` to detect if the server actually succeeded.
   If plan exists, marks the unit as complete instead of error.

3. **Elapsed timer:** Shows `Processing... Xs elapsed` after 5 seconds.
   Shows `Plan interpretation may take up to 2 minutes. Please do not close this page.`
   after 15 seconds. Resets per unit.

4. **Duplicate guard:** `useRef` prevents double execution on React strict mode mount.
   `isRetrying` state prevents rapid retry button clicks. Button shows spinner + disabled.

### Files Changed
- `web/src/components/sci/SCIExecution.tsx` — fetchWithTimeout, recovery, timer, guard
- `web/src/components/sci/ExecutionProgress.tsx` — elapsed display, retry button state

### Proof Gates
- **PG-01:** Both fetch calls wrapped with 300s timeout. Recovery check on failure. Timer display. Duplicate guard.
- **PG-02:** Build clean. PR #167 merged to main. Vercel deploying.

### Deployed
PR #167 merged to main. Vercel production deploy triggered.
