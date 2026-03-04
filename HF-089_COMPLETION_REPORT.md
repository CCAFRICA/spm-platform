# HF-089 COMPLETION REPORT
## Fix Plan-Readiness Endpoint (Client Recovery Bridge)

### Root Cause
`plan-readiness/route.ts:24` filtered `.eq('status', 'active')` but
`execute/route.ts:868` saves plans with `status: 'draft'`. The recovery
polling endpoint always returned `{ plans: [] }` because draft plans were
excluded. The client checked `data.plans.length > 0` — always false.

Production evidence: server saved plan `05c30b36` successfully (Vercel logs
show 200 + "Plan saved: 7 components"). Client polled 8 times over 90 seconds.
All returned 200 with empty plans array. Recovery never triggered.

### Fix Applied
Changed plan-readiness query from `.eq('status', 'active')` to
`.in('status', ['active', 'draft'])`. Added `status` field to response.

### Files Changed
- `web/src/app/api/plan-readiness/route.ts` — include draft plans in query + response

### Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-01 | Phase 0 diagnostic identifies exact mismatch | PASS | plan-readiness:24 filters active, execute:868 saves draft |
| PG-02 | plan-readiness endpoint finds recently saved plan | PASS | FIXED query: 1 plan (05c30b36, draft). OLD query: 0 plans |
| PG-03 | Client polling code correctly processes readiness response | PASS | SCIExecution.tsx:102 checks `data.plans.length > 0` — now true |
| PG-04 | Build clean (npm run build exits 0) | PASS | Build completed with no errors |
| PG-05 | Verification script confirms fix | PASS | hf089-verify.ts: "Client recovery would trigger: true" |
