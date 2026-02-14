# OB-41 COMPLETION REPORT
## Lifecycle Plumbing and Access Control
## Date: February 14, 2026
## Execution Time: In progress

## PHASE 0 RECONNAISSANCE FINDINGS

### 1. Lifecycle-Calculation coupling
The orchestrator (`src/lib/orchestration/calculation-orchestrator.ts`) has ZERO references to the lifecycle service. No imports, no calls to `transitionCycle`, `loadCycle`, or `createCycle`. Grep output:
```
grep -n "lifecycle\|transitionCycle\|loadCycle\|createCycle" src/lib/orchestration/calculation-orchestrator.ts
(no output)
```
Lifecycle transitions happen ONLY in the UI (`src/app/admin/launch/calculate/page.tsx` lines 335-391) inside `try/catch` blocks after the orchestrator returns. If the UI transition fails, the console logs a warning but the calculation still completes. The orchestrator does NOT gate on lifecycle state.

### 2. Access control
Line 234 of `src/app/admin/launch/calculate/page.tsx`:
```typescript
const hasAccess = user && isVLAdmin(user);
```
`isVLAdmin` (from `src/types/auth.ts` line 38) checks `user.role === 'vl_admin'`. This blocks ALL non-VL-Admin users including tenant admins (role: `admin`/`administrator`). Sofia Chen with role `Administrator` gets "Access Denied."

### 3. Approval data source
- **Queue** reads from lifecycle cycles: `listCycles(tenantId)` in `queue-service.ts` line 359. If `latest.state === 'PENDING_APPROVAL'`, it creates a queue item.
- **Approval Center** reads from separate storage: `vialuce_approvals_${tenantId}` via `listApprovalItems(tenantId)` in `approval-service.ts` line 186.
- **Mismatch**: Queue derives from lifecycle state. Approval Center requires explicit `createApprovalItem()` call. If the item was never created (or created under wrong tenantId), Approval Center shows 0 while Queue shows 1.

### 4. Period creation
Periods are created in multiple ways:
- `PeriodProcessor.createPeriod()` generates random IDs: `period-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
- `detectAvailablePeriods()` returns `YYYY-MM` strings from committed data
- Calculate page chip click sets `selectedPeriod` to `YYYY-MM` format
- Period dropdown shows `PeriodProcessor.getPeriods()` with generated IDs like `period-1770819809919-iblg90n`
- NO deduplication: same month can exist as both `2024-01` and `period-XXX-January 2024`

### 5. Perform visibility
Line 114-121 of `src/app/perform/page.tsx`:
```typescript
const cycle = loadCycle(currentTenant.id, period);
if (cycle && !canViewResults(cycle.state, role)) {
  setLifecycleGated(true);
  setAllResults([]);
  ...
  return;
}
```
Only checks `getCurrentPeriod()` (current month YYYY-MM). If the user's results are for a different period (e.g., `2024-01`), no lifecycle check occurs but also no results are found because it only searches current period first.

### 6. Payroll data source
`src/app/operate/pay/page.tsx` line 43:
```typescript
const latestCycle = currentTenant ? listCycles(currentTenant.id)[0] : null;
const snapshot = latestCycle?.officialSnapshot;
```
Reads from the latest lifecycle cycle's `officialSnapshot`. Shows `snapshot?.employeeCount || 0` and `snapshot?.totalPayout || 0`. If no snapshot exists (DRAFT/PREVIEW states), shows 0.
Does NOT filter by lifecycle state -- picks latest cycle regardless of whether it's DRAFT or APPROVED.

### 7. Reconciliation match
`src/app/admin/launch/reconciliation/page.tsx` line 595-607:
```typescript
const batch = selectedBatch ? batches.find(b => b.id === selectedBatch) : null;
const traces = getTraces(currentTenant.id, batch?.id);
const vlResults = traces as unknown as CalculationResult[];
```
Reads from forensics traces via `getTraces(tenantId, runId)`. If no batch is selected (`selectedBatch` is empty string), `batch?.id` is undefined, and `getTraces` returns empty array. Result: 0 VL results.

### 8. Dead links
Found 3 dead links:
- `/operations/payroll-calendar` - referenced in `operate/pay/page.tsx:205`
- `/operations/payment-history` - referenced in `operate/pay/page.tsx:221`
- `/performance/plans/new` - referenced in `performance/plans/page.tsx:134,143`

---

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | 0 | Reconnaissance findings |

## FILES CREATED
| File | Purpose |
|------|---------|
| OB-41_COMPLETION_REPORT.md | Completion report |

## FILES MODIFIED
| File | Change |
|------|--------|

## PROOF GATES -- HARD (VERBATIM from prompt)
| # | Criterion (EXACT wording) | PASS/FAIL | Evidence (paste code/output) |
|---|---------------------------|-----------|------------------------------|
| HG-1 | Phase 0 findings documented with code quotes for all 8 areas. | | |
| HG-2 | Run Preview on 2024-03, subway shows PREVIEW after completion. Console shows no transition error. | | |
| HG-3 | Run Official on 2024-03, subway shows OFFICIAL after completion. | | |
| HG-4 | Attempt to run Preview on a period already at OFFICIAL. Calculation does NOT execute. User sees visible error message. | | |
| HG-5 | Sofia Chen (Administrator) can access the calculation page without "Access Denied." | | |
| HG-6 | After submitting 2024-03 for approval, Approval Center shows the request with non-zero Pending count. | | |
| HG-7 | Clicking Approve on the request advances lifecycle to APPROVED. | | |
| HG-8 | Sidebar PERIODS shows ONE entry per calendar month per tenant. No duplicate raw IDs. | | |
| HG-9 | Page title shows "Period Close: [period]" not "Run Calculations." | | |
| HG-10 | Breadcrumb shows Operate path, not Launch path. | | |
| HG-11 | Actions above table. Lifecycle action buttons and thermostat visible without scrolling past employee list. | | |
| HG-12 | Thermostat guidance text changes when lifecycle advances (e.g., from PREVIEW to OFFICIAL). | | |
| HG-13 | Carlos Garcia Rodriguez sees non-zero payout on Perform for a POSTED+ period. | | |
| HG-14 | Payroll page shows 719 employees and non-zero total for APPROVED+ period. | | |
| HG-15 | At least 2 dead links show "Coming Soon" treatment instead of navigating to 404. | | |
| HG-16 | After running reconciliation, user sees a visible result banner (success or failure with explanation). | | |
| HG-17 | No silent failures. Lifecycle transition errors produce user-visible toast/alert. grep for console-only error handling shows none in modified lifecycle code. | | |
| HG-18 | Zero hardcoded tenant-specific field names in modified files. Evidence: grep output. | | |
| HG-19 | npm run build exits 0. | | |
| HG-20 | curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 returns 200. | | |
| HG-21 | OB-41_COMPLETION_REPORT.md exists in project root and is committed to git. | | |
| HG-22 | At least 9 commits for 9 phases (Phase 0 included). | | |

## PROOF GATES -- SOFT (VERBATIM from prompt)
| # | Criterion (EXACT wording) | PASS/FAIL | Evidence |
|---|---------------------------|-----------|----------|
| SG-1 | Submitter cannot approve their own submission. Different user required. | | |
| SG-2 | Reject requires a reason string before processing. | | |
| SG-3 | Payouts show MX$ for RetailCGMX tenant. | | |
| SG-4 | At least 3 employees show real names, not "Employee XXXXXXXX." | | |
| SG-5 | Queue does not show stale "Import Data Package" when import is complete. | | |
| SG-6 | Recent Runs section default collapsed. | | |
| SG-7 | Export produces CSV with 719 rows and non-zero values. | | |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): In progress
- Rule 2 (cache clear after commit): In progress
- Rule 5 (report in project root): PASS
- Rule 17 (criteria verbatim): PASS
- Rule 19 (no self-verification bypass): In progress

## KNOWN ISSUES
(populated at end)
