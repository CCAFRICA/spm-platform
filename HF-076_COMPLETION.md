# HF-076 Completion Report: Module-Aware Landing Routing

**Date:** 2026-02-27
**Target:** alpha.2.0
**Branch:** dev
**Commits:** 2 (30587b1 → d6138d2)
**Files modified:** 1 source file

---

## What Was Done

### Phase 1: Module-Aware Routing on /operate

`web/src/app/operate/page.tsx` — Added a `useEffect` that fires after `pipelineData` loads and routes the user to the best page for their tenant:

| Priority | Condition | Destination |
|----------|-----------|-------------|
| 1 | Financial-only (no ICM rule sets) | `/financial` |
| 2 | Dual-module, financial data but no ICM calcs | `/financial` |
| 3 | ICM + completed calculation batch | `/admin/launch/calculate` |
| 4 | ICM + committed data (no calcs yet) | `/data/import/enhanced` |
| 5 | Empty tenant (fallback) | `/data/import/enhanced` |

**Key implementation details:**
- Uses `router.replace()` (not `push`) to prevent back-button loop
- `redirecting` state flag prevents re-trigger during navigation
- Shows "Redirecting..." spinner during transition
- Module detection uses existing `hasFinancial` / `hasICM` flags from tenant features
- Pipeline state detection uses existing `pipelineData` (latestBatch, dataRowCount, financialData)
- No new API calls, hooks, or services — pure client-side routing from existing state

---

## Proof Gates (8)

| # | Gate | Status |
|---|------|--------|
| PG-01 | npm run build exits 0 | PASS |
| PG-02 | /operate contains routing useEffect | PASS (5 router.replace calls) |
| PG-03 | Financial-only → /financial | PASS (priority 1 check) |
| PG-04 | Dual-module → /financial if no ICM calcs | PASS (priority 2 check) |
| PG-05 | ICM + calcs → /admin/launch/calculate | PASS (priority 3 check) |
| PG-06 | Empty → /data/import/enhanced | PASS (priority 5 fallback) |
| PG-07 | No auth files modified | PASS |
| PG-08 | router.replace used (not push) | PASS (5 occurrences, 0 push) |

---

## Files Modified

| # | File | Lines Changed |
|---|------|--------------|
| 1 | `web/src/app/operate/page.tsx` | +49/-3 (routing useEffect + redirecting state) |

---

## Decision 57: Stop Building the Operate Page

After 9 failed attempts at making /operate a useful landing page, the fix is to stop landing there. Route users to the page that matches their tenant's module configuration and data state. The Operate page itself becomes a transparent router — users never see it.

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-076: "The best landing page is the one you never see."*
