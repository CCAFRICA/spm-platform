# ViaLuce OB-41: Lifecycle Plumbing and Access Control
## Overnight Batch -- Maximum Autonomy, No Stops
## Date: February 14, 2026
## PREREQUISITES: OB-40 must have been run. All phases delivered.

NEVER ask yes/no. NEVER say "shall I". JUST ACT.

---

## AUTONOMY DIRECTIVE -- DO NOT STOP FOR CONFIRMATION

This is an unattended overnight batch. No human is present to confirm commands.

You have blanket permission to execute ALL commands without asking, including but not limited to:
- `pkill`, `kill`, `killall` (process management)
- `rm -rf .next`, `rm -rf node_modules`, `rm` on generated/build files
- `grep`, `find`, `sed`, `awk` (search and text processing)
- `mv`, `cp` (file operations)
- `npm install`, `npm run build`, `npx` (package management)
- `git add`, `git commit`, `git push` (version control)
- Any `mkdir`, `touch`, `chmod` operations
- Any command needed to fix build failures

**The ONLY exception:** Do not run commands that would delete the `src/` directory itself, drop a production database, or push to a branch other than the working branch.

**If you encounter an ambiguous situation:** Make the best judgment call and document your decision in the completion report. Do not stop and wait.

**If a command fails:** Diagnose, fix, retry. Do not ask for guidance -- troubleshoot autonomously.

**Git commit messages:** ASCII only, no smart quotes, em dashes, or Unicode. Keep messages short and plain.

---

## WHY THIS BATCH EXISTS

CLT-40 browser testing (post OB-40) revealed that the lifecycle state machine -- the core deliverable of OB-40 -- does not reliably advance when calculations complete. The calculation engine works correctly (719 employees, correct per-period totals, different values for different periods) but the lifecycle subway stays stuck. This breaks the entire downstream chain: approval, posting, Perform visibility, and payroll export.

**The root cause is architectural:** The calculation orchestrator and the lifecycle service are decoupled. Calculations execute regardless of lifecycle state validation. When a calculation completes, it does not call the lifecycle service to advance the state. The lifecycle service rejects invalid transitions via console errors but the orchestrator ignores the rejection and runs anyway.

Additionally, tenant admins (Sofia Chen, Administrator role) receive "Access Denied: You must be a VL Admin" on the calculation page, completely blocking the approval workflow for the intended approver persona. The Approval Center shows 0 pending requests while the Queue sidebar shows 1. Perform shows nothing for sales reps. Payroll shows $0.

**Seven P0 issues from CLT-40 drive this batch:**

1. Lifecycle transitions do not fire after calculations complete
2. Tenant admin blocked from calculation page
3. Approval Center shows no requests (data source mismatch with Queue)
4. Duplicate period objects with different lifecycle states
5. Perform shows nothing for sales rep (Carlos) on POSTED/PAID period
6. Payroll shows $0 despite completed calculations
7. Reconciliation returns 0 matches with no user feedback

**New CC failure pattern discovered in CLT-40:**

**H. Self-Verification Bypass** -- CC tests its own features by calling functions programmatically (advancing lifecycle via code) rather than verifying the UI path works. OB-40 claimed PASS on approval flow by advancing states during batch execution, but the actual browser workflow is broken. Going forward: features are not PASS until the UI path works, not just the code path.

---

## STANDING DESIGN PRINCIPLES

Read `/CLEARCOMP_STANDING_PRINCIPLES.md` (or `VIALUCE_STANDING_PRINCIPLES.md` if renamed) before starting. These are non-negotiable.

### 1. AI-First, Never Hardcoded
NEVER hardcode field names, sheet names, column patterns, or language-specific strings. Korean Test: would this work in Hangul?

### 2. Fix Logic, Not Data
Never provide answer values. Systems derive correct results from source material.

### 3. Be the Thermostat, Not the Thermometer
Act on data: recommend, alert, adjust. Every feature answers: What happened? Why? What should I do about it?

### 4. Closed-Loop Learning
Every AI call captures a training signal. Every user confirmation strengthens future classifications.

### 5. Prove, Don't Describe
Show evidence. Every number traces to source.

### 6. Calculation Sovereignty
Calculation reads committed data plus the active plan at runtime. Never depends on import-time logic.

### 7. Intuitive Adjacency (TMR #30)
The action the persona will take next should be reachable from where the insight occurs. Navigation is a tax on decision-making.

### 8. No Silent Fallbacks
Missing data equals visible error, not silent zero. Failed transitions show error messages, not nothing.

### 9. Domain Agnostic
ViaLuce is a Performance Optimization Engine, not a compensation tool. Labels, subtitles, guidance text, and page titles must not assume ICM terminology.

---

## CC OPERATIONAL RULES

1. Always commit + push after changes
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`
3. VL Admin language lock REMOVED -- all users select their preferred language.
4. Git commit messages: ASCII only
5. Completion reports and proof gates saved to PROJECT ROOT (same level as package.json). NOT in src/, NOT in docs/.
6. NEVER ask yes/no. NEVER say "shall I". Just act.
7. Never provide CC with answer values -- fix logic not data
8. OB closing: after final commit, kill dev server, rm -rf .next, npm run build, npm run dev, confirm localhost:3000 responds before writing completion report

## ANTI-PATTERN RULES

9. NO PLACEHOLDERS: Never substitute hardcoded values for data from upstream sources
10. CONTRACT-FIRST: Read consumer code before implementing producer
11. TRACE BEFORE FIX: Trace full data flow before writing any fix
12. READ CODE FIRST: Start by reading source, not adding logs
13. THINK IN DATA SHAPES: Document data before/after for any change
14. NO SILENT FALLBACKS: Missing data equals visible error, not silent zero
15. STATE-AWARE: Ask "what OLD data might interfere?"
16. LIFECYCLE-AWARE: Know status lifecycles
17. CRITERIA ARE IMMUTABLE: You may NOT modify, remove, replace, or reword any proof gate criterion. If a criterion cannot be met, report it as FAIL with explanation.
18. If a phase fails after 3 attempts, document the failure analysis and move to the next phase.
19. NO SELF-VERIFICATION BYPASS: Do not test features by calling functions programmatically. Verify that the UI path works -- the button click, the page navigation, the state change visible to the user.

### COMPLETION REPORT RULES (25-29)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits, Files Created, Files Modified, Hard Gates (verbatim plus evidence), Soft Gates, Compliance, Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.
29. Prompt file committed to git before work begins.

---

## PHASE 0: RECONNAISSANCE (Read Only -- Do Not Modify Any Files)

Before writing a single line of code, read and understand the current state of every system this batch will touch.

```bash
echo "============================================"
echo "PHASE 0: RECONNAISSANCE"
echo "============================================"

echo ""
echo "=== 0A: LIFECYCLE SERVICE -- TRANSITION MAP ==="
cat src/lib/calculation/calculation-lifecycle-service.ts

echo ""
echo "=== 0B: CALCULATION ORCHESTRATOR -- WHERE LIFECYCLE IS CALLED ==="
cat src/lib/calculation/calculation-orchestrator.ts
# Specifically find: where does the orchestrator call the lifecycle service?
# Does it check the return value? Does it gate calculation on transition success?
grep -n "lifecycle\|transitionTo\|advanceState\|LifecycleService\|lifecycleService" src/lib/calculation/calculation-orchestrator.ts

echo ""
echo "=== 0C: CALCULATE PAGE -- HOW BUTTONS TRIGGER CALCULATIONS ==="
cat src/app/admin/launch/calculate/page.tsx | head -200
# Find: what happens when "Run Preview" or "Run Official" is clicked?
grep -n "handleRunCalculation\|runCalculation\|Preview\|Official\|lifecycle\|transition" src/app/admin/launch/calculate/page.tsx

echo ""
echo "=== 0D: ACCESS CONTROL -- WHO CAN SEE THE CALCULATE PAGE ==="
grep -n "VL Admin\|vl_admin\|platform_admin\|isAdmin\|role.*check\|access.*denied\|Access Denied" src/app/admin/launch/calculate/page.tsx
grep -rn "Access Denied\|VL Admin\|role.*===\|isVLAdmin\|isPlatformAdmin" src/app/admin/ --include="*.tsx" | head -20

echo ""
echo "=== 0E: APPROVAL CENTER -- DATA SOURCE ==="
cat src/app/govern/calculation-approvals/page.tsx
# Compare: what data source does Queue use vs what Approval Center uses?
grep -rn "approval\|pending.*approval\|PENDING_APPROVAL" src/lib/navigation/ --include="*.ts" | head -15
grep -rn "approval\|pending.*approval\|PENDING_APPROVAL" src/app/govern/ --include="*.tsx" | head -15

echo ""
echo "=== 0F: PERIOD MANAGEMENT -- HOW PERIODS ARE CREATED ==="
grep -rn "createPeriod\|periodId\|period-\|selectedPeriod\|detectPeriod" src/lib/ --include="*.ts" | head -25
grep -rn "createPeriod\|periodId\|period-\|selectedPeriod\|detectPeriod" src/app/admin/launch/calculate/ --include="*.tsx" | head -15

echo ""
echo "=== 0G: PERFORM PAGE -- VISIBILITY GATE ==="
cat src/app/perform/page.tsx

echo ""
echo "=== 0H: PAYROLL PAGE -- DATA SOURCE ==="
cat src/app/operate/pay/page.tsx 2>/dev/null || cat src/app/admin/operate/pay/page.tsx 2>/dev/null
grep -rn "payroll\|Payroll" src/app/ --include="*.tsx" -l

echo ""
echo "=== 0I: RECONCILIATION -- MATCH ENGINE ==="
grep -n "runReconciliation\|matchEmployees\|compareResults\|0 VL results\|vlResults" src/app/operate/reconcile/ --include="*.tsx" -r | head -20
grep -n "runReconciliation\|matchEmployees\|compareResults" src/lib/ --include="*.ts" -r | head -20

echo ""
echo "=== 0J: ALL ROUTE PATHS -- LINK HEALTH AUDIT ==="
grep -rn "href=\|Link.*to=\|router.push\|navigate" src/app/ --include="*.tsx" | grep -oP '(?:href|to|push|navigate)\s*[=({]\s*["\x27/`][^"'\''`]*' | sort -u | head -60

echo ""
echo "=== 0K: DEAD LINKS -- CHECK WHICH ROUTES HAVE PAGES ==="
find src/app -name "page.tsx" | sed 's|src/app||;s|/page.tsx||;s|^|/|' | sort
```

### PHASE 0 REQUIRED OUTPUT

Document in the completion report:

```
PHASE 0 FINDINGS:
1. Lifecycle-Calculation coupling: [Does orchestrator call lifecycle service after calc? Does it check return value? Quote the relevant lines.]
2. Access control: [What check blocks tenant admins? Quote the condition.]
3. Approval data source: [What does Approval Center read vs Queue? Are they the same store?]
4. Period creation: [How many ways are periods created? Chip click vs dropdown vs calculation run?]
5. Perform visibility: [What lifecycle state check gates data visibility? Quote the condition.]
6. Payroll data source: [Where does payroll read calculation results from?]
7. Reconciliation match: [Where does reconciliation read VL results from? Why would it find 0?]
8. Dead links: [List all href/Link targets that do not have corresponding page.tsx files]
```

**Commit:** `OB-41-0: Reconnaissance findings`

---

## PHASE 1: LIFECYCLE-CALCULATION COUPLING

This is the most critical phase. The calculation orchestrator must be coupled to the lifecycle service so that:

**A. Calculations advance lifecycle state on completion.**
When a Preview calculation completes successfully, the lifecycle advances to PREVIEW.
When an Official calculation completes successfully, the lifecycle advances to OFFICIAL.
The lifecycle transition happens INSIDE the orchestrator, AFTER successful calculation, BEFORE returning results to the UI.

**B. Invalid lifecycle transitions block calculation execution.**
If the current lifecycle state does not allow a transition to the target state, the calculation does NOT execute. The user sees a visible error: "Cannot run [type] calculation: period is currently at [state]. [Guidance on what to do instead.]"

**C. The UI reflects the new state immediately.**
After calculation + transition completes, the page re-reads lifecycle state. The subway updates. The thermostat guidance updates. The action buttons update.

**Requirements:**

1. In `calculation-orchestrator.ts`: After successful calculation, call `lifecycleService.transitionTo(periodId, targetState)` where targetState maps from calculation type (preview -> PREVIEW, official -> OFFICIAL)
2. In `calculation-orchestrator.ts`: Before executing calculation, check `lifecycleService.canTransition(periodId, targetState)`. If false, throw a descriptive error. Do NOT execute the calculation.
3. In the calculate page: After calculation returns, re-fetch lifecycle state and update all state-dependent UI (subway, thermostat, action buttons)
4. Transition errors must produce a user-visible toast or alert, not just a console log

**PROOF GATE 1:** Run Preview on period 2024-03 (clean period). After calculation completes, subway shows PREVIEW highlighted (not stuck at DRAFT). Run Official on same period. Subway advances to OFFICIAL. Paste the lifecycle state before and after each calculation.

**Commit:** `OB-41-1: Lifecycle-calculation coupling`

---

## PHASE 2: TENANT ADMIN ACCESS TO CALCULATION PAGE

CLT-40 finding: Sofia Chen (role: Administrator, tenant: retail_conglomerate) gets "Access Denied: You must be a VL Admin to access this page."

**Requirements:**

1. Find the access check that blocks tenant admins (Phase 0 will have located it)
2. Change the access check: the calculation page should be accessible to any user with role `admin`, `tenant_admin`, `administrator`, OR `platform_admin` -- not just VL Admin / platform_admin
3. Tenant admins should see calculation results for THEIR tenant only (tenant isolation still enforced)
4. Tenant admins should see the Approve/Reject buttons when the period is at PENDING_APPROVAL and they are NOT the submitter (separation of duties)

**PROOF GATE 2:** Switch to Sofia Chen (Administrator). Navigate to Operate > Calculate. Page loads without "Access Denied." Period selection and calculation results are visible. Paste the access check code before and after the fix.

**Commit:** `OB-41-2: Tenant admin access to calculation page`

---

## PHASE 3: APPROVAL CENTER DATA WIRING

CLT-40 finding: Approval Center shows "No requests found" with 0 pending, while Queue shows "Calculation Awaiting Approval."

**Requirements:**

1. Trace where the Queue reads approval items from (Phase 0 will have this)
2. Trace where the Approval Center page reads from
3. Wire the Approval Center to the SAME data source as the Queue
4. When a period reaches PENDING_APPROVAL state, the Approval Center must show it with: period name, calculation type, total compensation, employee count, submitter name, submission timestamp
5. Approval Center cards must have Approve and Reject action buttons (for users who are not the submitter)
6. Clicking Approve transitions lifecycle to APPROVED. Clicking Reject transitions to REJECTED with required reason.

**PROOF GATE 3:** After submitting a calculation for approval (from Phase 1, the 2024-03 period should now be at OFFICIAL -- submit it), navigate to Approval Center. The request appears with Approve/Reject buttons. Pending count shows 1. Paste the Approval Center page showing the request.

**Commit:** `OB-41-3: Approval Center data wiring`

---

## PHASE 4: PERIOD OBJECT DEDUPLICATION

CLT-40 finding: Multiple period objects exist for the same month -- a raw ID (`period-1770819809919-iblg90n`), a chip-detected period (`2024-01`), and a dropdown-created period (`January 2024 (open)`). Each has different lifecycle states and data completeness.

**Requirements:**

1. Audit how periods are created: chip click, dropdown selection, calculation run, import
2. Implement a canonical period key: one period entity per tenant + period combination
3. When a period chip is clicked, it should find or create the canonical period -- not create a duplicate
4. When a calculation runs, it should associate with the canonical period for that tenant + period
5. The dropdown and chip selection must resolve to the SAME period object
6. Lifecycle state is tracked on the canonical period, not on calculation runs
7. Clean up: merge existing duplicate periods for RetailCGMX January 2024 into one canonical entity. Preserve the most advanced lifecycle state.

**PROOF GATE 4:** After cleanup, the sidebar PERIODS section shows ONE entry for January 2024, not two or three. Selecting January via chip or dropdown shows the SAME lifecycle state. Paste the period data structure showing deduplication.

**Commit:** `OB-41-4: Period object deduplication`

---

## PHASE 5: PAGE LAYOUT AND IDENTITY

CLT-40 findings: Page title still says "Run Calculations," breadcrumb shows Launch not Operate, subtitle uses ICM language, actions buried below employee table.

**Requirements:**

1. Page title: "Period Close: [period name]" when a period is selected. "Period Close" when no period selected. NOT "Run Calculations."
2. Subtitle: "Review, approve, and close calculation periods" -- domain-neutral, not "Run compensation calculations for a period"
3. Breadcrumb: Operate > Calculate > Period Close (NOT Home > Launch > Run Calculations)
4. Page layout order (top to bottom):
   a. Period selection + Active Plan banner
   b. Data Completeness + Lifecycle subway + Audit trail
   c. Stats cards (Employees, Total, Average, Errors) + Signals
   d. **Action bar: lifecycle buttons (Run Preview, Run Official, Submit for Approval, Approve, Reject, Post, Close, Paid, Publish) + Export Payroll. Only show buttons valid for current lifecycle state.**
   e. Thermostat guidance ("What Next?" section)
   f. Recent Runs (collapsible, default collapsed)
   g. Employee Breakdown table with pagination
5. Action buttons must be visible WITHOUT scrolling past the employee table
6. Thermostat guidance must reflect CURRENT lifecycle state, not stale state

**PROOF GATE 5:** Page title shows "Period Close: [period]". Breadcrumb shows Operate path. Action buttons are visible above the employee table. Thermostat guidance matches the current subway state. Paste a screenshot description or grep showing the new title and breadcrumb.

**Commit:** `OB-41-5: Page layout and identity`

---

## PHASE 6: PERFORM VISIBILITY FOR POSTED+ STATES

CLT-40 finding: Carlos Garcia Rodriguez (sales rep) sees nothing on Perform despite January being at PAID.

**Requirements:**

1. Trace the Perform page data source (Phase 0 will have this)
2. The Perform page must read calculation results for periods at POSTED, CLOSED, PAID, or PUBLISHED lifecycle states
3. For a sales rep, filter to only their own employee record
4. Display: period name, total payout, component breakdown, lifecycle state badge
5. If no periods are at POSTED+, show: "Your results for the current period are being processed. Check back after your administrator posts the results."
6. If periods exist at POSTED+, show the data with the most recent posted period first

**PROOF GATE 6:** Switch to Carlos Garcia Rodriguez (sales rep). Navigate to Perform. Data for January 2024 is visible with non-zero payout amount. Paste the Perform page content or the data retrieval logic showing it reads from POSTED+ periods.

**Commit:** `OB-41-6: Perform visibility for posted states`

---

## PHASE 7: PAYROLL DATA WIRING

CLT-40 finding: Payroll page shows 0 Employees, $0.00, defaulting to Preview period instead of most advanced.

**Requirements:**

1. Payroll page defaults to the most lifecycle-advanced period (APPROVED, POSTED, CLOSED, or PAID -- not PREVIEW or DRAFT)
2. Payroll reads calculation results from the same data source as the calculate page
3. Display: employee count, total payroll, component breakdown, Export CSV button
4. Export CSV: one row per employee, columns for employee ID, name, role, store, total payout, plus one column per plan component. Non-zero values.
5. Payroll Calendar and Payment History links: if these pages don't exist, show "Coming Soon" treatment instead of linking to 404

**PROOF GATE 7:** Navigate to Payroll. Page defaults to January 2024 (at PAID state, not February at PREVIEW). Shows 719 employees and non-zero total. Export CSV button present. Payroll Calendar and Payment History show "Coming Soon" instead of 404. Paste the payroll page content.

**Commit:** `OB-41-7: Payroll data wiring`

---

## PHASE 8: ROUTE HEALTH AUDIT AND DEAD LINK TREATMENT

From Phase 0, you will have a list of all navigation targets and all existing page routes.

**Requirements:**

1. Compare all `href`, `Link`, `router.push` targets against existing `page.tsx` files
2. For every link target that does NOT have a corresponding page:
   a. Add a visual "Coming Soon" badge or disabled state to the card/link
   b. Prevent navigation (no click-through to 404)
   c. Use subtle styling: reduced opacity, "Coming Soon" text overlay, or a small badge
3. Do NOT create placeholder pages. Just disable the dead links visually.
4. Update the Queue "Import Data Package" item: if import is already complete, the queue should not show stale import guidance. Queue items should reflect current period lifecycle state.

**PROOF GATE 8:** Payroll Calendar card shows "Coming Soon" treatment and does NOT navigate to a 404. List all dead links found and treatment applied. Paste grep showing the "Coming Soon" treatment.

**Commit:** `OB-41-8: Route health audit and dead link treatment`

---

## PHASE 9: RECONCILIATION USER FEEDBACK

CLT-40 finding: Reconciliation runs, finds 0 matches, and gives no user feedback. "False green risk: medium" is meaningless.

**Requirements:**

1. After Run Reconciliation completes:
   a. If matches found: Show success banner with count: "Reconciliation complete: X of Y employees matched. Z variances found."
   b. If 0 matches: Show warning banner: "No matching employees found. This may indicate a field mapping issue. Verify that Employee ID and Amount fields are correctly mapped."
   c. If error: Show error banner with actionable message
2. Replace "False green risk: medium" with plain language. Options: "X employees matched but with variance above threshold" or remove it entirely if no matches.
3. Comparison Depth labels: Add text labels to L0-L4 bar. L0 = "Aggregate", L1 = "Per Employee", L2 = "Per Component", L3 = "Per Transaction", L4 = "Full Trace"
4. The reconciliation result section should be visible and prominent -- not hidden in a depth bar.

**PROOF GATE 9:** Run reconciliation with the uploaded benchmark file. After completion, a visible success or failure banner appears with employee match count or explanation. No bare "False green risk" label. Paste the reconciliation result UI.

**Commit:** `OB-41-9: Reconciliation user feedback`

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | Recon documented | Phase 0 findings documented with code quotes for all 8 areas. |
| HG-2 | Preview advances subway | Run Preview on 2024-03, subway shows PREVIEW after completion. Console shows no transition error. |
| HG-3 | Official advances subway | Run Official on 2024-03, subway shows OFFICIAL after completion. |
| HG-4 | Invalid transition blocked | Attempt to run Preview on a period already at OFFICIAL. Calculation does NOT execute. User sees visible error message. |
| HG-5 | Tenant admin access | Sofia Chen (Administrator) can access the calculation page without "Access Denied." |
| HG-6 | Approval Center shows request | After submitting 2024-03 for approval, Approval Center shows the request with non-zero Pending count. |
| HG-7 | Approve from Approval Center | Clicking Approve on the request advances lifecycle to APPROVED. |
| HG-8 | Period deduplication | Sidebar PERIODS shows ONE entry per calendar month per tenant. No duplicate raw IDs. |
| HG-9 | Page title | Shows "Period Close: [period]" not "Run Calculations." |
| HG-10 | Breadcrumb | Shows Operate path, not Launch path. |
| HG-11 | Actions above table | Lifecycle action buttons and thermostat visible without scrolling past employee list. |
| HG-12 | Thermostat current state | Thermostat guidance text changes when lifecycle advances (e.g., from PREVIEW to OFFICIAL). |
| HG-13 | Perform shows data | Carlos Garcia Rodriguez sees non-zero payout on Perform for a POSTED+ period. |
| HG-14 | Payroll shows data | Payroll page shows 719 employees and non-zero total for APPROVED+ period. |
| HG-15 | Dead links treated | At least 2 dead links show "Coming Soon" treatment instead of navigating to 404. |
| HG-16 | Reconciliation feedback | After running reconciliation, user sees a visible result banner (success or failure with explanation). |
| HG-17 | No silent failures | Lifecycle transition errors produce user-visible toast/alert. grep for console-only error handling shows none in modified lifecycle code. |
| HG-18 | Korean Test | Zero hardcoded tenant-specific field names in modified files. Evidence: grep output. |
| HG-19 | Build passes | `npm run build` exits 0. |
| HG-20 | Server responds | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns 200. |
| HG-21 | Completion report | `OB-41_COMPLETION_REPORT.md` exists in project root and is committed to git. |
| HG-22 | One commit per phase | At least 9 commits for 9 phases (Phase 0 included). |

## SOFT GATES

| # | Gate | Criterion |
|---|------|-----------|
| SG-1 | Separation of duties | Submitter cannot approve their own submission. Different user required. |
| SG-2 | Rejection with reason | Reject requires a reason string before processing. |
| SG-3 | Currency MXN | Payouts show MX$ for RetailCGMX tenant. |
| SG-4 | Employee names | At least 3 employees show real names, not "Employee XXXXXXXX." |
| SG-5 | Queue reflects state | Queue does not show stale "Import Data Package" when import is complete. |
| SG-6 | Recent Runs collapsible | Recent Runs section default collapsed. |
| SG-7 | Payroll export CSV | Export produces CSV with 719 rows and non-zero values. |

---

## EXECUTION ORDER

```
Phase 0:  Reconnaissance (read only)
Phase 1:  Lifecycle-calculation coupling
Phase 2:  Tenant admin access fix
Phase 3:  Approval Center data wiring
Phase 4:  Period object deduplication
Phase 5:  Page layout and identity
Phase 6:  Perform visibility
Phase 7:  Payroll data wiring
Phase 8:  Route health audit and dead link treatment
Phase 9:  Reconciliation user feedback
```

After Phase 9: Write completion report, commit, final build, confirm server, push.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-41_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria (copy the EXACT wording from the HARD GATES table above) with PASS/FAIL and PASTED evidence
- **MUST include the Phase 0 reconnaissance findings**
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### COMPLETION REPORT TEMPLATE

```markdown
# OB-41 COMPLETION REPORT
## Lifecycle Plumbing and Access Control
## Date: [date]
## Execution Time: [duration]

## PHASE 0 RECONNAISSANCE FINDINGS
[Paste all 8 findings with code quotes]

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|

## FILES CREATED
| File | Purpose |
|------|---------|

## FILES MODIFIED
| File | Change |
|------|--------|

## PROOF GATES -- HARD (VERBATIM from prompt)
| # | Criterion (EXACT wording) | PASS/FAIL | Evidence (paste code/output) |
|---|---------------------------|-----------|------------------------------|
| HG-1 | Phase 0 findings documented with code quotes for all 8 areas. | | |
| HG-2 | Run Preview on 2024-03, subway shows PREVIEW after completion. Console shows no transition error. | | |
[... all 22 gates with EXACT wording ...]

## PROOF GATES -- SOFT (VERBATIM from prompt)
| # | Criterion (EXACT wording) | PASS/FAIL | Evidence |
|---|---------------------------|-----------|----------|

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): [PASS/FAIL]
- Rule 2 (cache clear after commit): [PASS/FAIL]
- Rule 5 (report in project root): [PASS/FAIL]
- Rule 17 (criteria verbatim): [PASS/FAIL]
- Rule 19 (no self-verification bypass): [PASS/FAIL]

## KNOWN ISSUES
[anything that did not work, partial implementations, deferred items]
```

---

*ViaLuce.ai -- The Way of Light*
*OB-41: Lifecycle Plumbing and Access Control*
*February 14, 2026*
*"The lifecycle is the product. The calculation is the engine. The plumbing connects them."*
