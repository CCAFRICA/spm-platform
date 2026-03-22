# HF-161 COMPLETION REPORT

## Commits
| # | Hash | Message |
|---|------|---------|
| 1 | 47084a79 | HF-161: Commit prompt |
| 2 | b85cb06e | HF-161 Phase 1: Refactor signal-persistence.ts — argument-passing pattern |
| 3 | fa20c3ee | HF-161 Phase 2: Update all persistSignal/persistSignalBatch/getTrainingSignals callers |
| 4 | a69cf62f | HF-161 Phase 3: Remove hardcoded eligibleRoles — Korean Test cleanup |
| 5 | (pending) | HF-161 Phase 4: Verification + completion report |

## Files Modified
| File | Change |
|------|--------|
| `web/src/lib/ai/signal-persistence.ts` | Refactored: getClient() removed, static import, argument-passing |
| `web/src/lib/sci/signal-capture-service.ts` | 3 calls updated with credentials |
| `web/src/lib/ai/training-signal-service.ts` | 4 calls updated with credentials |
| `web/src/lib/intelligence/classification-signal-service.ts` | 3 calls updated with credentials |
| `web/src/lib/calculation/calculation-lifecycle-service.ts` | 1 call updated with credentials |
| `web/src/app/api/ai/assessment/route.ts` | 1 call updated with credentials |
| `web/src/app/api/calculation/run/route.ts` | 2 calls updated with credentials |
| `web/src/app/api/reconciliation/compare/route.ts` | 1 call updated with credentials |
| `web/src/app/api/reconciliation/run/route.ts` | 1 call updated with credentials |
| `web/src/app/api/disputes/investigate/route.ts` | 1 call updated with credentials |
| `web/src/app/api/approvals/[id]/route.ts` | 1 call updated with credentials |
| `web/src/lib/reconciliation/ai-column-mapper.ts` | 1 call updated with credentials |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | eligibleRoles ['sales_rep','optometrista'] → [] |
| `web/src/lib/compensation/plan-interpreter.ts` | eligibleRoles ['sales_rep'] → [] |
| `web/src/lib/compensation/frmx-server-plan.ts` | eligibleRoles ['server','bartender'] → [] |

## Hard Gates
- [x] signal-persistence.ts: getClient() removed: **PASS** — grep returns only comment reference
- [x] signal-persistence.ts: static import at top: **PASS** — `import { createClient } from '@supabase/supabase-js'` on line 13
- [x] All persistSignal callers pass credentials: **PASS** — 13 calls, 13 have `process.env` args
- [x] All persistSignalBatch callers pass credentials: **PASS** — 2 calls, 2 have `process.env` args
- [x] All getTrainingSignals callers pass credentials: **PASS** — 4 calls, 4 have `process.env` args
- [x] eligibleRoles: no hardcoded strings: **PASS** — 0 hardcoded role arrays
- [x] Build passes: **PASS** — `npm run build` completes with zero errors
- [x] No silent .catch(() => {}) on signal paths: **PASS** — 0 silent catches

## Soft Gates
- [x] Error logs include signal_type and tenant_id
- [x] Comments reference HF-161 and AUD-001 finding numbers

## Compliance
- [x] Korean Test: zero hardcoded language strings added or retained in eligibleRoles
- [x] Domain-agnostic: no ICM-specific vocabulary added
- [x] Standing Rule 39: no auth/session/access changes (signal writes use existing service role pattern)

## AUD-001 Findings Addressed
| Finding | Description | Resolution |
|---------|-------------|------------|
| F-AUD-001 | persistSignal fails on server-side | getClient() removed, argument-passing adopted |
| F-AUD-002 | Dual signal write architectures | persistSignal now uses same pattern as writeClassificationSignal |
| F-AUD-003 | Silent .catch(() => {}) | Replaced with error-logging catches on all 19 signal paths |
| F-AUD-004 | eligibleRoles ['sales_rep', 'optometrista'] | Replaced with [] in ai-plan-interpreter.ts |
| F-AUD-005 | eligibleRoles ['sales_rep'] | Replaced with [] in plan-interpreter.ts |

## Evidence
```
19 credentialed call closings found

persistSignal calls: 13
persistSignalBatch calls: 2
getTrainingSignals calls: 4

Build: npm run build — zero errors
getClient in signal-persistence.ts: NOT FOUND (removed)
eligibleRoles with hardcoded strings: ZERO
Silent .catch(() => {}) on signal paths: ZERO
```

## Issues
None. All phases completed without errors.
