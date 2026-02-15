# ViaLuce OB-40: Lifecycle Completion and Period Close Cockpit
## Overnight Batch -- Maximum Autonomy, No Stops
## Date: February 14, 2026
## PREREQUISITES: OB-39 must have been run. All phases delivered.

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

CLT-39 browser testing (post OB-39) revealed that the lifecycle state machine is incomplete, the approval workflow is disconnected, and the entire downstream chain from APPROVED through PAID is non-functional. The lifecycle subway visualization works visually but the underlying transition rules reject forward movement past APPROVED. The Approval Center doesn't receive requests. Sales reps on Perform can't see posted data. The Run Calculations page buries actions below 719 unpaginated employee rows.

The tenant ID mismatch (orchestrator uses 'retail_conglomerate' but data stored under different key) continues to block new calculations and reconciliation. This has persisted across HF-022 and OB-39 and must be definitively resolved.

This batch has THREE missions:

1. **Lifecycle Completion** (CRITICAL) -- Fix the 9-state transition rules, wire approval flow, enable the full lifecycle from Draft through Publish
2. **Tenant ID Resolution** (CRITICAL) -- Definitively fix the tenant ID mismatch that blocks calculations and reconciliation
3. **Period Close Cockpit** (UX) -- Restructure the Run Calculations page into the Period Lifecycle cockpit with proper layout, pagination, and Thermostat guidance

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

### COMPLETION REPORT RULES (25-29)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits, Files Created, Files Modified, Hard Gates (verbatim plus evidence), Soft Gates, Compliance, Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.
29. Prompt file committed to git before work begins.

---

## MISSION A: LIFECYCLE COMPLETION

### PHASE 0: LIFECYCLE STATE MACHINE AUDIT (Read only)

```bash
echo "============================================"
echo "PHASE 0: LIFECYCLE STATE MACHINE AUDIT"
echo "============================================"

echo ""
echo "=== 0A: CURRENT TRANSITION RULES ==="
cat src/lib/calculation/calculation-lifecycle-service.ts | head -80
grep -n "TRANSITIONS\|transitions\|allowedTransitions\|validTransitions\|APPROVED\|PENDING_APPROVAL\|PAID" src/lib/calculation/calculation-lifecycle-service.ts

echo ""
echo "=== 0B: ALL LIFECYCLE STATES DEFINED ==="
grep -rn "DRAFT\|PREVIEW\|OFFICIAL\|PENDING_APPROVAL\|APPROVED\|REJECTED\|PAID\|POST\|CLOSE\|PUBLISH" src/lib/calculation/calculation-lifecycle-service.ts

echo ""
echo "=== 0C: WHERE DOES APPROVAL CENTER READ? ==="
cat src/app/govern/calculation-approvals/page.tsx 2>/dev/null | head -40
grep -rn "approval\|PENDING_APPROVAL" src/app/govern/ --include="*.tsx" | head -15

echo ""
echo "=== 0D: WHERE DOES PERFORM READ VISIBILITY? ==="
grep -rn "APPROVED\|PUBLISHED\|POST\|visibility\|published\|posted" src/app/perform/ --include="*.tsx" | head -20
grep -rn "lifecycle\|lifecycleState\|life_cycle" src/app/perform/ --include="*.tsx" | head -15

echo ""
echo "=== 0E: TENANT ID TRACE ==="
grep -rn "retail_conglomerate\|currentTenant\|tenantId\|tenant_id" src/lib/calculation/calculation-orchestrator.ts | head -20
grep -rn "retail_conglomerate\|currentTenant\|tenantId" src/lib/data-architecture/data-layer-service.ts | head -20

echo ""
echo "=== 0F: ACTION BAR CURRENT STATE ==="
grep -n "Export Payroll\|Results visible\|Submit for Approval\|Approve\|Reject\|Mark as Paid" src/app/operate/calculate/page.tsx | head -20

echo ""
echo "=== 0G: LOCALSTORAGE QUOTA MANAGEMENT ==="
grep -rn "QuotaExceeded\|quota\|storage.*size\|cleanup\|purge" src/lib/ --include="*.ts" | head -15
```

### PHASE 0 REQUIRED OUTPUT

Document in the completion report:

```
LIFECYCLE AUDIT
  Current transition map: [paste exact transitions object]
  States defined: [list all states]
  States missing: [which of the 9 states are not in the map]
  
APPROVAL CENTER
  Data source: [what does it read? localStorage key? IndexedDB?]
  Gap: [why does it show "No requests" when PENDING_APPROVAL exists?]
  
PERFORM VISIBILITY
  Gate condition: [what state/flag does Perform check?]
  Gap: [why doesn't it show data when APPROVED?]

TENANT ID
  Auth context provides: [exact tenant ID string]
  Orchestrator uses: [exact tenant ID string]
  Data layer stores under: [exact tenant ID string]
  Mismatch: [YES/NO and exact strings]
```

**Commit:** `OB-40-0: Lifecycle and tenant ID audit`

---

### PHASE 1: 9-STATE LIFECYCLE TRANSITION MAP

Update the lifecycle service with the complete 9-state transition map.

**The canonical lifecycle:**

```
DRAFT -> PREVIEW -> RECONCILE -> OFFICIAL -> PENDING_APPROVAL -> APPROVED -> POSTED -> CLOSED -> PAID -> PUBLISHED
```

**Transition rules:**

| From | Allowed To | Notes |
|------|-----------|-------|
| DRAFT | PREVIEW | Initial calculation |
| PREVIEW | DRAFT, RECONCILE, OFFICIAL | Can go back, can reconcile, can skip to official |
| RECONCILE | PREVIEW, OFFICIAL | Back to preview or forward to official |
| OFFICIAL | PREVIEW, PENDING_APPROVAL | Back to preview or submit for approval |
| PENDING_APPROVAL | OFFICIAL, APPROVED, REJECTED | Back to official, approve, or reject |
| REJECTED | OFFICIAL | Return to official for rework |
| APPROVED | OFFICIAL, POSTED | Back to official or post results |
| POSTED | APPROVED, CLOSED | Back to approved or close period |
| CLOSED | POSTED, PAID | Back to posted or mark as paid |
| PAID | CLOSED, PUBLISHED | Back to closed or publish |
| PUBLISHED | (terminal) | No transitions out. Period is complete. |

**Requirements:**

1. Replace the existing transition map with the above
2. Every transition must log an audit entry with: from_state, to_state, user, timestamp, reason (optional)
3. Failed transitions must return a clear error message including the current state and allowed transitions
4. The UI must show the error message to the user (toast/alert), not fail silently

**PROOF GATE 1:** Paste the complete transition map from the code. Verify it matches the table above. Verify that APPROVED -> POSTED is in the allowed transitions.

**Commit:** `OB-40-1: Complete 9-state lifecycle transition map`

---

### PHASE 2: TENANT ID RESOLUTION

Definitively fix the tenant ID mismatch that causes new calculations to produce 0 employees and reconciliation to find 0 results.

**Requirements:**

1. From Phase 0 audit, identify the EXACT mismatch (e.g., auth context provides 'retailcgmx' but orchestrator looks for 'retail_conglomerate')
2. Trace the tenant ID from: (a) tenant selection → (b) auth context → (c) calculation orchestrator → (d) data layer service → (e) IndexedDB storage
3. Fix the source of the mismatch -- do NOT add translation layers. One canonical ID per tenant, used everywhere.
4. After fix: run a preview calculation and verify it produces 719/719 employees with $1,232,280.55 total

**PROOF GATE 2:** After fix, run a new Preview calculation. Console shows `719 employees` and non-zero total compensation. Paste the console output.

**Commit:** `OB-40-2: Tenant ID resolution`

---

### PHASE 3: APPROVAL CENTER WIRING

Wire the Approval Center to show pending approval requests from the lifecycle.

**Requirements:**

1. When lifecycle transitions to PENDING_APPROVAL, write an approval request record
2. Record contains: batch_id, tenant_id, period, submitter_id, submitted_at, total_payout, employee_count, status ('pending')
3. Approval Center reads these records and displays them as actionable cards
4. Each card shows: Period, Total Payout, Employee Count, Submitter, Submitted At
5. Each card has: "View Results" (navigates to calculation page with context), "Approve", "Reject" buttons
6. "Approve" transitions lifecycle to APPROVED, updates approval record
7. "Reject" transitions lifecycle to REJECTED, prompts for reason, updates record
8. Separation of duties: Approve/Reject buttons hidden if current user is the submitter

**PROOF GATE 3:** After submitting for approval, Approval Center shows the request with Approve/Reject buttons. Clicking Approve transitions lifecycle to APPROVED.

**Commit:** `OB-40-3: Approval Center wiring`

---

### PHASE 4: CALCULATION PAGE INLINE APPROVAL

Add Approve/Reject buttons directly on the Run Calculations page (Intuitive Adjacency).

**Requirements:**

1. When lifecycle is PENDING_APPROVAL AND current user has approve_payouts capability AND is not the submitter:
   - Show "Approve" and "Reject" buttons in the lifecycle action bar
2. When lifecycle is PENDING_APPROVAL AND current user IS the submitter:
   - Show "Awaiting approval by [approver role]" -- no buttons
3. Approve button: transitions to APPROVED, records approver and timestamp
4. Reject button: prompts for reason, transitions to REJECTED

**PROOF GATE 4:** On the calculation page in PENDING_APPROVAL state, Approve/Reject buttons are visible for non-submitter admin. Clicking Approve advances to APPROVED state on the subway.

**Commit:** `OB-40-4: Inline approval on calculation page`

---

### PHASE 5: POST — RESULTS VISIBLE TO ALL ROLES

Wire the "Results visible to all roles" button to transition from APPROVED to POSTED, and make calculation results visible in Perform.

**Requirements:**

1. Button transitions lifecycle from APPROVED to POSTED
2. After POSTED: Perform workspace for sales rep demo users shows their compensation data
3. What Perform shows for a sales rep:
   - Period: "January 2024"
   - Total payout for the period
   - Per-component breakdown with plan component names
   - Attainment percentage per component (if available)
4. What Perform shows when lifecycle is NOT POSTED or later:
   - "Your compensation for [period] is being processed. Results will be available after posting."
5. Perform reads from the SAME calculation results displayed in Operate. One source of truth.
6. Currency in tenant locale (MXN for RetailCGMX)

**PROOF GATE 5:** After advancing to POSTED, switch to a Sales Rep demo user. Perform page shows non-zero total payout and at least one component name. When lifecycle is PREVIEW, Perform shows "being processed" message.

**Commit:** `OB-40-5: Post gates data visibility in Perform`

---

### PHASE 6: PAYROLL EXPORT AND PERIOD CLOSE

Wire the remaining lifecycle actions: Export Payroll, Close, Mark as Paid.

**Requirements:**

1. "Export Payroll" button (visible in APPROVED or POSTED state):
   - Downloads CSV with columns: Employee ID, Employee Name, Period, Total Payout, [one column per plan component]
   - Column names from plan components (Korean Test)
   - Currency formatted for tenant locale
   - File name: `{TenantName}_{Period}_Payroll.csv`
   - Uses Blob + URL.createObjectURL for browser download

2. "Close Period" button (visible in POSTED state):
   - Transitions to CLOSED
   - Records closure timestamp and user

3. "Mark as Paid" button (visible in CLOSED state):
   - Transitions to PAID
   - Records payment timestamp

4. "Publish" button (visible in PAID state):
   - Transitions to PUBLISHED (terminal state)
   - Records publication timestamp

**PROOF GATE 6:** "Export Payroll" downloads a CSV with correct data (719 rows, plan component columns). Lifecycle can advance from POSTED through PUBLISHED without errors.

**Commit:** `OB-40-6: Payroll export and period close lifecycle`

---

## MISSION B: TENANT ID RESOLUTION

(Handled in Phase 2 above — this mission is folded into Mission A for execution order)

---

## MISSION C: PERIOD CLOSE COCKPIT

### PHASE 7: PAGE LAYOUT RESTRUCTURE

Restructure the Run Calculations page into the Period Lifecycle cockpit.

**New layout (top to bottom):**

```
1. Header: "Period Close: January 2024" (not "Run Calculations")
   Subtitle: "Manage the compensation lifecycle for this period"

2. Active Plan banner (keep as-is)

3. Period selector + Run buttons (keep as-is)

4. Lifecycle subway (keep as-is, update with 9 states)

5. Action bar: lifecycle state + action buttons + audit trail count
   - This is WHERE approval, posting, export, close, paid happen
   - Buttons change based on current state (from Phase 1 transition map)

6. Stats cards: Employees Processed | Total Compensation | Average Payout | Errors
   - Must show data from the LIFECYCLE-STATE calculation run, not the latest run

7. Next Steps section (Thermostat recommendations)
   - "Reconcile results before running Official" 
   - "Submit for Approval"
   - "Export Payroll" 
   - Contextual based on current lifecycle state

8. Employee Breakdown (PAGINATED)
   - Default 25 rows per page
   - Search employee
   - Sort by payout
   - Expandable rows for component detail

9. Recent Runs (COLLAPSIBLE, default collapsed)
```

**Requirements:**

1. Page title: Dynamic based on period. "Period Close: January 2024"
2. Employee Breakdown: paginated with 25 rows per page, page controls at bottom
3. Stats cards show data from the calculation run at the CURRENT lifecycle state -- not the latest run
4. Recent Runs section is collapsible, default collapsed
5. Action buttons are in section 5 (action bar), NOT at the bottom of the page
6. Remove the `/launch/` breadcrumb path. Page should be under `/operate/`

**PROOF GATE 7:** Page title shows "Period Close: [period name]". Employee Breakdown shows pagination controls. Action buttons are visible without scrolling past employee list.

**Commit:** `OB-40-7: Period Close cockpit layout`

---

### PHASE 8: THERMOSTAT GUIDANCE

Add contextual guidance to the page based on current lifecycle state and data conditions.

**Requirements:**

1. When calculation results show 0 employees: "No calculation results found for this period. Ensure performance data is imported and run a Preview calculation."
2. When PREVIEW complete: "Preview shows $X across N employees. Reconcile against benchmark data before running Official."
3. When OFFICIAL complete: "Official results ready. Submit for Approval to proceed."
4. When PENDING_APPROVAL: "Awaiting approval. [Approver] will review and approve or return for revision."
5. When APPROVED: "Results approved. Post to make visible to all roles, or Export Payroll."
6. When Reconciliation returns 0 matches: "No matching employees found. Verify the calculation batch and field mappings."
7. Guidance appears in the "Next Steps" section with action buttons inline

**PROOF GATE 8:** In PREVIEW state, guidance text mentions reconciliation. In APPROVED state, guidance text mentions posting and payroll export. Guidance includes at least one action button.

**Commit:** `OB-40-8: Thermostat guidance on Period Close page`

---

### PHASE 9: SIGNAL-FIRST CLASSIFICATION

Fix the reconciliation classifier to attempt signal-based mapping BEFORE the AI call, not only after.

**Requirements:**

1. When a file is uploaded on the reconciliation page:
   a. FIRST: retrieve classification signals for the tenant from ClassificationSignalService
   b. If signals exist with confidence >= 0.85 for key fields (employee_id, amount): auto-map from signals
   c. THEN: if gaps remain (fields not covered by signals), attempt AI classification
   d. If AI fails (no API key, timeout, error): show signal-based mappings only, with "AI unavailable" note
2. Display shows: "X columns mapped from prior imports, Y columns mapped by AI, Z unmapped"
3. When API key is not configured: signal-based mappings still work. The page is functional without AI.

**PROOF GATE 9:** With no Anthropic API key configured, upload a file for a tenant that has prior import signals. At least one field is auto-mapped with confidence > 0.85 from signals. Console does NOT show the mapping failure preventing all classification.

**Commit:** `OB-40-9: Signal-first classification for reconciliation`

---

### PHASE 10: LOCALSTORAGE QUOTA MANAGEMENT

Prevent QuotaExceededError from breaking the platform.

**Requirements:**

1. Wrap ALL localStorage.setItem calls in a try/catch
2. On QuotaExceededError:
   a. Log a warning (not an error) with the key name and approximate size
   b. Attempt cleanup: remove forensics traces older than 24 hours
   c. Retry the write once
   d. If still fails: log and continue -- never crash the page
3. Add a storage pressure indicator: when localStorage usage exceeds 80% of quota, show a warning in the Pulse section: "Storage pressure: X MB / Y MB. Consider clearing old data."
4. Forensics traces should have a TTL -- auto-purge traces older than 48 hours on page load

**PROOF GATE 10:** Wrap a setItem call in try/catch with cleanup logic. grep shows zero bare `localStorage.setItem` calls without try/catch in modified files.

**Commit:** `OB-40-10: localStorage quota management`

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | Lifecycle audit | Phase 0 audit documented with transition map, approval center data source, perform visibility gate, and tenant ID mismatch details. |
| HG-2 | 9-state transitions | Transition map includes all 9 states. APPROVED -> POSTED is a valid transition. Paste the map. |
| HG-3 | Tenant ID fixed | New Preview calculation produces 719/719 employees with non-zero total. Console shows employee count. |
| HG-4 | Approval Center | After submitting for approval, Approval Center shows the request. |
| HG-5 | Inline approval | Approve button visible on calculation page for non-submitter. Click advances to APPROVED. |
| HG-6 | Post visibility | Sales Rep demo user sees compensation data on Perform after POSTED state. "Being processed" before. |
| HG-7 | Payroll CSV | Export downloads CSV with 719 rows, plan component columns, non-zero values. |
| HG-8 | Full lifecycle | Lifecycle can advance from DRAFT through PUBLISHED without errors. |
| HG-9 | Page title | Shows "Period Close: [period]" not "Run Calculations". |
| HG-10 | Pagination | Employee Breakdown has page controls. Default 25 per page. |
| HG-11 | Actions not buried | Action buttons (Approve, Post, Export, Close) visible without scrolling past employee list. |
| HG-12 | Thermostat guidance | Contextual guidance text present for at least PREVIEW and APPROVED states. |
| HG-13 | Signal-first | Without API key, reconciliation auto-maps at least one field from prior signals. |
| HG-14 | Quota safety | All localStorage.setItem calls in modified files wrapped in try/catch. |
| HG-15 | No silent failures | Lifecycle transition failures show visible error to user (toast/alert), not silent nothing. |
| HG-16 | Korean Test | Zero hardcoded tenant-specific field names in modified files. Evidence: grep output. |
| HG-17 | Build passes | `npm run build` exits 0. |
| HG-18 | Server responds | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns 200. |
| HG-19 | Completion report | `OB-40_COMPLETION_REPORT.md` exists in project root and is committed to git. |
| HG-20 | One commit per phase | At least 10 commits for 10 phases (Phase 0 included). |

## SOFT GATES

| # | Gate | Criterion |
|---|------|-----------|
| SG-1 | Recent Runs collapsible | Recent Runs section is collapsible, default collapsed. |
| SG-2 | Stats from lifecycle run | Stats cards show data from lifecycle-state run, not latest run. |
| SG-3 | Separation of duties | Approval requires different user than submitter. |
| SG-4 | Breadcrumb fixed | Page under Operate, not Launch. |
| SG-5 | Currency MXN | Payouts show MX$ for RetailCGMX tenant. |
| SG-6 | Escalation note | Approval request shows configurable deadline concept (even if just UI text). |
| SG-7 | Employee names | At least 3 employees show real names, not "Employee XXXXXXXX". |

---

## EXECUTION ORDER

```
Phase 0:  Lifecycle and tenant ID audit (read only)
Phase 1:  9-state lifecycle transition map
Phase 2:  Tenant ID resolution
Phase 3:  Approval Center wiring
Phase 4:  Inline approval on calculation page
Phase 5:  Post - results visible in Perform
Phase 6:  Payroll export and period close
Phase 7:  Period Close cockpit layout
Phase 8:  Thermostat guidance
Phase 9:  Signal-first classification
Phase 10: localStorage quota management
```

After Phase 10: Write completion report, commit, final build, confirm server, push.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-40_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- **MUST include the Phase 0 lifecycle and tenant ID audit**
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

*ViaLuce.ai -- The Way of Light*
*OB-40: Lifecycle Completion and Period Close Cockpit*
*February 14, 2026*
*"The lifecycle is the product. Everything else is scaffolding."*
