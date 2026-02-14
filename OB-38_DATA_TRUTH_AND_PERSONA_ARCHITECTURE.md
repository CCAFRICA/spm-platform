# ViaLuce OB-38: Data Truth and Persona Architecture
## Overnight Batch -- Maximum Autonomy, No Stops
## Date: February 13, 2026
## PREREQUISITES: OB-37 must have been run. All phases delivered.

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

CLT-37 browser testing (post OB-37) revealed that a single root cause -- the CompensationClockService not reading real data from localStorage -- drives failures across 8+ visible surfaces: Mission Control Cycle shows "Import Commission Plan / 0%" despite RetailCGMX having an imported plan, calculation data for 719 employees, and $1.2M+ in results. Queue shows static placeholder items. Pulse shows dashes. Perform page shows "not yet available." Operate landing shows "Urgent: Import Commission Plan." ALL of these trace to the same storage key mismatch.

Additionally, the reconciliation page needs a fundamental redesign based on the Adaptive Depth Reconciliation methodology (TMR Addendum 4), and multiple workspace pages need persona-aware rendering where VL Admin sees the tenant observatory while Demo User personas see role-appropriate personal views.

This batch has FOUR missions:
1. **Data Truth** (CRITICAL) -- trace and fix the localStorage key mismatch that makes the entire platform appear empty
2. **Adaptive Depth Reconciliation** -- rebuild the comparison engine per TMR ADR methodology
3. **Persona-Aware Views** -- Perform page and Operate landing render differently per persona
4. **Backlog Cleanup** -- address accumulated backlog items that intersect with the above fixes

---

## STANDING DESIGN PRINCIPLES

Read `/CLEARCOMP_STANDING_PRINCIPLES.md` before starting. These are non-negotiable.

**IMPORTANT:** If that file has been renamed to `VIALUCE_STANDING_PRINCIPLES.md`, read that instead. If NEITHER exists, read the principles embedded below.

### 1. AI-First, Never Hardcoded
NEVER hardcode field names, sheet names, column patterns, or language-specific strings. Korean Test: would this work in Hangul?

### 2. Fix Logic, Not Data
Never provide answer values. Systems derive correct results from source material.

### 3. Be the Thermostat, Not the Thermometer
Act on data: recommend, alert, adjust. Every feature answers: What happened? Why? What should I do about it?

### 4. Closed-Loop Learning
Every AI call captures a training signal. Every user interaction generates a learning event.

### 5. Maximum Configurability
Build configurable systems. Not one customer's requirements.

### 6. Prove, Don't Describe
Show evidence. Every number traces to source.

### 7. Carry Everything, Express Contextually
Preserve ALL data at import. Let context activate what is needed at calculation time.

### 8. Calculation Sovereignty
Calculation reads committed data plus the active plan at runtime. Never depends on import-time logic.

### 9. Wayfinder Compliance
Layer 1 (Wayfinding): Module identity in the environment. Layer 2 (State Communication): opacity, completeness, attention patterns -- NOT stoplight colors. Layer 3 (Interaction Patterns): Core shared, module extends, role adapts.

### 10. Adaptive Depth Reconciliation (NEW -- TMR Addendum 4)
Compare at every layer the data supports. Discover the common ground between two independent datasets. The most dangerous discrepancy is the one that hides behind a matching total.

---

## CC OPERATIONAL RULES

1. Always commit + push after changes
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`
3. VL Admin language lock REMOVED -- all users select their preferred language. Do NOT force English for any role.
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
15. NO FABRICATED EXAMPLES: All data in reports must come from actually running code
16. STATE-AWARE: Ask "what OLD data might interfere?"
17. LIFECYCLE-AWARE: Know status lifecycles (draft, active, archived)
18. CRITERIA ARE IMMUTABLE: You may NOT modify, remove, replace, or reword any proof gate criterion. If a criterion cannot be met, report it as FAIL with explanation.
19. NO EMPTY SHELLS: Pages with only empty state plus import button are not deliverable.
20. DEMO VALIDATES PIPELINE: Demo data flows through real import pipelines, not direct localStorage writes.
21. DYNAMIC COLUMNS: Column count derived from plan components at runtime.
22. AI SERVICE IS THE ONLY WAY TO CALL AI: All AI calls go through AIService. No direct API calls.
23. EVERY AI CALL CAPTURES A TRAINING SIGNAL.
24. If a phase fails after 3 attempts, document the failure analysis and move to the next phase.

### COMPLETION REPORT RULES (25-29)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits, Files Created, Files Modified, Hard Gates (verbatim plus evidence), Soft Gates, Compliance, Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.
29. Prompt file committed to git before work begins.

---

## PHASE 0: FULL STORAGE KEY DIAGNOSTIC (No code changes -- read only)

This is the most important phase. DO NOT SKIP THIS. The entire platform appears empty because services read from different localStorage keys than the import/calculation pipeline writes to. Phase 0 traces the COMPLETE storage key chain.

```bash
echo "============================================"
echo "PHASE 0: FULL LOCALSTORAGE KEY DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: WHERE DOES PLAN IMPORT WRITE? ==="
grep -rn "localStorage.setItem\|localStorage.set\|setItem" src/lib/ src/app/ --include="*.ts" --include="*.tsx" | grep -i "plan\|compensation_plan\|comp_plan" | head -20

echo ""
echo "=== 0B: WHERE DOES DATA IMPORT WRITE? ==="
grep -rn "localStorage.setItem\|setItem" src/lib/data-architecture/ --include="*.ts" | head -20
grep -rn "localStorage.setItem\|setItem" src/lib/orchestration/ --include="*.ts" | head -15

echo ""
echo "=== 0C: WHERE DO CALCULATION RESULTS WRITE? ==="
grep -rn "localStorage.setItem\|setItem" src/lib/calculation/ --include="*.ts" | head -20
grep -rn "calculation_run\|calc_result\|vialuce_calc" src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 0D: WHERE DOES LIFECYCLE STATE WRITE? ==="
grep -rn "lifecycle\|LIFECYCLE\|life_cycle" src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 0E: WHERE DOES COMPENSATIONCLOCKSERVICE READ? ==="
cat src/lib/navigation/compensation-clock-service.ts 2>/dev/null || echo "FILE NOT FOUND"

echo ""
echo "=== 0F: WHERE DOES CYCLE INDICATOR READ? ==="
grep -rn "localStorage\|getItem\|CompensationClock\|getCycleState" src/components/navigation/mission-control/CycleIndicator.tsx | head -15

echo ""
echo "=== 0G: WHERE DOES QUEUE READ? ==="
grep -rn "localStorage\|getItem\|getQueueItems\|CompensationClock" src/components/navigation/mission-control/QueuePanel.tsx | head -15
grep -rn "localStorage\|getItem" src/lib/navigation/queue-service.ts | head -15

echo ""
echo "=== 0H: WHERE DOES PULSE READ? ==="
grep -rn "localStorage\|getItem\|getPulseMetrics\|CompensationClock" src/components/navigation/mission-control/PulsePanel.tsx | head -15

echo ""
echo "=== 0I: WHERE DOES PERFORM PAGE READ? ==="
grep -rn "localStorage\|getItem\|calculation\|compensation" src/app/perform/ --include="*.tsx" | head -15

echo ""
echo "=== 0J: WHERE DOES OPERATE LANDING READ? ==="
grep -rn "localStorage\|getItem\|calculation\|compensation\|lifecycle" src/app/operate/page.tsx | head -15

echo ""
echo "=== 0K: WHAT KEYS ACTUALLY EXIST? ==="
echo "Run this in browser console to see actual localStorage keys:"
echo "Object.keys(localStorage).filter(k => k.includes('plan') || k.includes('calc') || k.includes('lifecycle') || k.includes('vialuce') || k.includes('compensation') || k.includes('committed') || k.includes('aggregated')).sort()"

echo ""
echo "=== 0L: ALL LOCALSTORAGE KEY CONSTANTS ==="
grep -rn "STORAGE_KEY\|KEY.*=.*'\|KEY.*=.*\"" src/lib/ --include="*.ts" | grep -iv "import\|export\|from\|test" | head -30

echo ""
echo "=== 0M: RECONCILIATION PAGE -- HOW IT READS CALC DATA ==="
grep -rn "localStorage\|getItem\|calculation\|batch\|getCalculation\|loadCalculation" src/app/operate/reconcile/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== 0N: HOW CALCULATION RUNS ARE STORED ==="
grep -rn "calculation_runs\|calculationRuns\|calc_runs" src/lib/ --include="*.ts" | head -15
```

### PHASE 0 REQUIRED OUTPUT

Before writing ANY code, document the following in the completion report:

```
STORAGE KEY MAP:
================

PLAN IMPORT WRITES TO:
  Key: [exact key]
  Written by: [file:line]
  Data shape: [what the stored object looks like]

DATA IMPORT WRITES COMMITTED DATA TO:
  Key: [exact key]
  Written by: [file:line]

CALCULATION ENGINE WRITES RESULTS TO:
  Key: [exact key]
  Written by: [file:line]

LIFECYCLE STATE WRITES TO:
  Key: [exact key]
  Written by: [file:line]

CompensationClockService READS FROM:
  Plans: [key it reads]
  Calculation results: [key it reads]
  Lifecycle: [key it reads]
  MATCH WITH WRITERS: YES/NO

CycleIndicator READS FROM: [key or service]
QueuePanel READS FROM: [key or service]
PulsePanel READS FROM: [key or service]
Perform page READS FROM: [key or service]
Operate landing READS FROM: [key or service]
Reconciliation READS CALC DATA FROM: [key or service]

MISMATCHES FOUND:
  1. [writer X writes to key A, reader Y reads from key B]
  2. [...]
```

**Commit:** `OB-38-0: Storage key diagnostic -- full read/write map` (commit the diagnostic document, no code changes)

---

## MISSION A: DATA TRUTH (Phases 1-3)

### PRDAB CASCADE -- LOCKED DECISIONS

**Principles:** Fix Logic Not Data, State Is Load-Bearing, Prove Don't Describe
**Reasoning:** The CompensationClockService, Perform page, Operate landing, and reconciliation comparison engine all fail to show data because they read from localStorage keys that don't match where the import/calculation pipeline writes. This is a Schema Disconnect anti-pattern. The fix must align readers to writers, not create new data paths.
**Decision:** Every consumer of plan/calculation/lifecycle data reads from the SAME keys the producers write to. ONE source of truth per data type. If the keys are scoped differently (tenant prefix, raw vs aggregated), create a thin adapter in the service layer -- do NOT duplicate data into a second key.

### Phase 1: Fix CompensationClockService Key Alignment

Based on Phase 0 findings, fix the CompensationClockService to read from the CORRECT localStorage keys.

The service needs to detect:
1. **Does a plan exist for this tenant?** Read from wherever Smart Import writes the active plan.
2. **Does committed data exist?** Read from wherever data import commits approved data.
3. **Do calculation results exist?** Read from wherever the calculation engine writes results.
4. **What is the lifecycle state?** Either read an explicit lifecycle key, or INFER state from what exists:
   - Plan exists + no data → AWAITING_DATA (progress 20%)
   - Plan + data + no calculations → DATA_IMPORTED (progress 30%)
   - Plan + data + preview results → PREVIEW (progress 50%)
   - Plan + data + official results → OFFICIAL (progress 70%)
   - Official + approved → APPROVED (progress 90%)

**CRITICAL:** If no explicit lifecycle state is stored (it may not be -- the lifecycle service was added in OB-34 but calculations run before that may not have written lifecycle state), then INFER the state from the presence of data artifacts. This is more resilient than depending on a specific key that may not have been written during older calculation runs.

**PROOF GATE 1:** CompensationClockService.getCycleState() returns a state beyond AWAITING_DATA for RetailCGMX (which has plan + data + calculation results). Paste the state object returned.

**Commit:** `OB-38-1: CompensationClockService reads correct storage keys`

### Phase 2: Cycle, Queue, Pulse Wiring Verification

With Phase 1 fixing the service, verify that the three Mission Control components consume it correctly.

**CycleIndicator:**
- Should show the current period (January 2024, not February 2026) derived from calculation results
- Should show the lifecycle state (Preview or Official, not "Import Commission Plan")
- Progress bar should reflect actual state (not 0%)

**QueuePanel:**
- Should NOT show "Import Commission Plan" (plan exists)
- Should NOT show "Import Performance Data" (data exists)
- Should show post-calculation actions: "Review Results", "Run Official", or "Submit for Approval"
- If all actions complete, show "All caught up"

**PulsePanel:**
- Active Tenants: count of configured tenants (should be at least 2 -- RetailCGMX + FRMX Demo)
- Total Users: count of employees in calculation results (719 for RetailCGMX)
- Calculations Today: actual count from calculation run metadata
- Outstanding Issues: 0 (no disputes system active)

**PROOF GATE 2:** For RetailCGMX tenant: Cycle shows "January 2024" with lifecycle state beyond "Import Commission Plan." Queue does NOT show "Import Commission Plan." Pulse shows at least two non-dash values.

**Commit:** `OB-38-2: Mission Control shows real data for RetailCGMX`

### Phase 3: Operate and Perform Landing Page Data

**Operate landing (`/operate` or root):**
- Hero section should show pipeline status: plan imported (check), data imported (check), calculations run (check), with actual values
- "Urgent Actions" should reflect current state, not always "Import Commission Plan"
- If all steps complete, show a summary: "January 2024 calculation complete -- 719 employees, MX$1,253,832 total payout"

**Perform landing (`/perform`):**
- Must read calculation results from the SAME key the calculation engine writes to (Phase 0 diagnostic)
- For Platform Admin persona: show aggregate tenant view (total payout, employee count, component breakdown)
- "Compensation results are not yet available" should ONLY appear if genuinely no calculation results exist

**Backlog items addressed:** 4.13 (progress bar context), 4.14 (queue reflects pipeline state), 4.18 (My Compensation real data), B.103 (Mission Control mock data), O.1/O.2 (Operate landing data)

**PROOF GATE 3:** Operate landing for RetailCGMX shows non-zero pipeline status (not "Import Commission Plan" urgent action). Perform page for RetailCGMX Platform Admin shows at least the total payout or employee count from calculation results (not "not yet available").

**Commit:** `OB-38-3: Operate and Perform read real calculation data`

---

## MISSION B: ADAPTIVE DEPTH RECONCILIATION (Phases 4-6)

### THE ARCHITECTURE

The reconciliation engine compares two STRUCTURALLY INDEPENDENT datasets:
- The VL calculation run (shape dictated by plan: components, tiers, variants)
- The uploaded benchmark file (shape dictated by its source: any format, any language, any columns)

These share ONE guaranteed semantic truth: Employee X should receive $Y total. Everything deeper is DISCOVERABLE, not ASSUMABLE.

The engine:
1. DISCOVERS what is comparable (AI reads both structures, assesses overlap)
2. REPORTS comparison depth to user ("your file supports N levels of comparison")
3. COMPARES at every confirmed level simultaneously (total, component, metric)
4. SURFACES FALSE GREENS as highest priority (matching totals with mismatched components)

FALSE GREENS are more dangerous than red flags. An employee with correct total but wrong component qualification passes total-only validation unchallenged.

CRITICAL CONSTRAINTS:
- Same DPI file can be associated with multiple plans
- Same plan can be associated with multiple DPI files
- Benchmark file may have completely different fields than calculation run
- NEVER assume structural correspondence -- discover semantic correspondence
- Korean Test: would this work if both files were in different languages?

### Phase 4: Comparison Depth Assessment Engine

Create `src/lib/reconciliation/comparison-depth-engine.ts`

This service takes:
- `parsedHeaders: string[]` -- column headers from uploaded file
- `parsedSampleRows: any[][]` -- first 3-5 rows of data
- `calculationComponents: string[]` -- component names from the active plan
- `tenantLocale: string`

And produces a ComparisonDepthAssessment:

```typescript
interface ComparisonDepthAssessment {
  employeeId: {
    column: string;      // which file column is the employee ID
    confidence: number;  // 0-1
  };
  totalPayout: {
    column: string;      // which file column is the total payout
    confidence: number;
  } | null;              // null if no total column found
  components: Array<{
    fileColumn: string;           // column in uploaded file
    planComponent: string;        // component in VL plan
    confidence: number;
  }>;
  metrics: Array<{
    fileColumn: string;
    semanticType: 'attainment' | 'goal' | 'actual' | 'rate';
    relatedComponent?: string;
    confidence: number;
  }>;
  comparisonDepth: 'total' | 'component' | 'metric';
  coverageWarning: string | null;  // e.g., "6 plan components, 4 mapped. Collections and Warranty not found."
}
```

**AI path:** If AIService is available, send the file headers, sample data, and plan component names to AI for classification. The AI returns the structured assessment.

**Manual fallback path:** If AI unavailable, show a simplified mapping UI with TWO mandatory fields:
1. Employee ID column (dropdown of file headers)
2. Total Payout column (dropdown of file headers)

And OPTIONAL component mapping (expandable section): for each plan component, a dropdown to select a matching file column or "Not in file."

**PROOF GATE 4:** ComparisonDepthAssessment is generated (via AI or manual selection). The assessment identifies at minimum employeeId and either totalPayout or at least one component mapping. Paste the assessment object.

**Commit:** `OB-38-4: Comparison Depth Assessment engine`

### Phase 5: Multi-Layer Comparison Engine

Create `src/lib/reconciliation/adaptive-comparison-engine.ts`

This takes:
- The confirmed ComparisonDepthAssessment
- The parsed file rows
- The calculation results (from localStorage -- using the CORRECT key from Phase 0/1)

And runs comparison at every confirmed level:

**Level 1 (Total):** Match employees by ID. Compare total payout from file vs total payout from calculation run. Track: exact match (<$0.01), tolerance (<5%), amber (5-15%), red (>15%), and THREE populations (matched, VL-only, file-only).

**Level 2 (Component):** For each mapped component, compare file value vs calculation component payout. Track per-component delta for each matched employee.

**Level 3 (Metric):** For each mapped metric, compare file value vs calculation metric value.

**FALSE GREEN DETECTION:** After Level 1 and Level 2, identify employees where:
- Level 1 total matches (within tolerance)
- BUT Level 2 component distribution differs (any component delta > tolerance)

Flag these as "False Green -- matching total, mismatched components." Report the component-level breakdown.

**Employee ID Matching:** Normalize IDs before comparison -- trim whitespace, strip leading zeros, coerce string/number, case-insensitive. The uploaded file may use a different format than the calculation results.

**PROOF GATE 5:** Upload RetailCo benchmark file. Select `num_empleado` as Employee ID and a payout column as Total Amount. Comparison runs and produces:
- Non-zero matched employee count (target: >500 of 719)
- Summary statistics (total VL vs total file, aggregate delta)
- Three populations (matched, VL-only, file-only)
- If component mappings were made, false green count

**Commit:** `OB-38-5: Adaptive multi-layer comparison engine`

### Phase 6: Reconciliation Results Display

Rewrite the reconciliation results UI to display ADR output:

**Summary Panel (Thermostat -- glanceable, no interaction needed):**
- Comparison Depth achieved: "Total + 4 Components"
- Match rate: "682 of 719 employees matched (94.9%)"
- Overall delta: "VL Total: MX$1,253,832 / Benchmark Total: MX$1,245,100 / Delta: +MX$8,732 (+0.7%)"
- False Greens: "23 employees have matching totals but mismatched components" (HIGHEST PRIORITY -- attention treatment)
- Populations: "682 matched | 37 VL-only | 12 file-only"

**Employee Table:**
- Sortable by: delta amount, delta %, flag severity, employee ID
- Each row: Employee ID, VL Total, Benchmark Total, Delta, Delta %, Flag
- Flag categories using Wayfinder Layer 2: exact (confident), tolerance (neutral), amber (warm attention), red (elevated attention), FALSE GREEN (distinct treatment -- pulsing or icon)
- Expandable rows: click to show per-component breakdown (if Level 2 data exists)
- False Green rows show component comparison inline when expanded

**Export:** One-click CSV export of full comparison data.

**Batch Selector:** Dropdown showing human-readable labels: "January 2024 -- Preview | 719 employees | MX$1,253,832" not raw UUIDs.

**All currency** uses `formatCurrency()` with tenant locale (MXN for RetailCGMX).

**PROOF GATE 6:** Reconciliation results display with: summary panel showing match statistics, employee table with sortable columns, at least one expandable row showing component detail. False greens flagged distinctly if component mappings exist. Currency in MXN. Batch selector human-readable.

**Commit:** `OB-38-6: Reconciliation ADR results display`

---

## MISSION C: PERSONA-AWARE VIEWS (Phases 7-8)

### Phase 7: Perform Page Persona Architecture

The Perform page currently shows "My Performance" for ALL personas including VL Admin. This is wrong.

Read the current Perform page and the demo user/persona system:

```bash
cat src/app/perform/page.tsx
grep -rn "persona\|currentRole\|userRole\|demo.*role" src/contexts/ src/lib/auth/ --include="*.ts" --include="*.tsx" | head -15
grep -rn "Platform Admin\|VL Admin\|Manager\|Sales Rep" src/app/perform/ --include="*.tsx" | head -10
```

Implement persona-aware rendering:

**VL Admin / Platform Admin view:**
- Title: "Performance Observatory" (not "My Performance")
- Subtitle: "Tenant-wide compensation outcomes for [period]"
- Summary cards: Total Payout, Employee Count, Average Payout, Component Distribution
- Data sourced from calculation results (same keys as Phase 1)
- Quick Actions: "Export Results", "Review Outliers", "Submit for Approval" (not "My Transactions")

**Manager view (Demo User as Manager):**
- Title: "Team Performance"
- Shows direct reports' compensation summaries
- Quick Actions: "Review Team", "Exception Alerts"

**Sales Rep view (Demo User as Sales Rep):**
- Title: "My Performance" (correct for this persona)
- Personal compensation summary, attainment, component breakdown
- Quick Actions: "My Transactions", "Submit Inquiry", "View Trends"

**Backlog items addressed:** P.2 (Perform persona-aware), P.3 (VL Admin view), 4.16 (Quick Actions per role), 4.18 (real data)

**PROOF GATE 7:** Platform Admin on Perform sees "Performance Observatory" with aggregate data (total payout, employee count). Switching to Demo User Sales Rep persona shows "My Performance" with individual view. The two views are visually and structurally different.

**Commit:** `OB-38-7: Perform page persona-aware rendering`

### Phase 8: Operate Landing Persona Context

The Operate landing currently shows "Import Commission Plan" as urgent action regardless of state.

Implement state-aware landing:

**When plan + data + calculations exist:**
- Pipeline status shows completed steps (imported, calculated) with checkmarks
- Summary: "January 2024 | 719 employees | MX$1,253,832 | Preview"
- Quick Actions: "Run Official", "View Results", "Export"
- No "Import Commission Plan" urgent action

**When only plan exists (no data yet):**
- "Import Performance Data" as next action
- Plan summary visible

**When nothing exists (fresh tenant):**
- "Import Commission Plan" as first action (this IS correct for a truly empty tenant)

**Backlog items addressed:** O.1 (landing data), O.2 (hero cards), B.103 (mock data), 4.14 (queue pipeline state)

**PROOF GATE 8:** Operate landing for RetailCGMX (with plan + data + calculations) does NOT show "Import Commission Plan" as urgent action. Shows pipeline completion status with actual values.

**Commit:** `OB-38-8: Operate landing state-aware with real pipeline data`

---

## MISSION D: BACKLOG CLEANUP (Phases 9-12)

### Phase 9: Standing Principles File Rename

```bash
# Rename the file
git mv CLEARCOMP_STANDING_PRINCIPLES.md VIALUCE_STANDING_PRINCIPLES.md 2>/dev/null || mv CLEARCOMP_STANDING_PRINCIPLES.md VIALUCE_STANDING_PRINCIPLES.md

# Update the title inside the file
sed -i 's/CLEARCOMP STANDING DESIGN PRINCIPLES/VIALUCE STANDING DESIGN PRINCIPLES/g' VIALUCE_STANDING_PRINCIPLES.md

# Update all references across the codebase
grep -rl "CLEARCOMP_STANDING_PRINCIPLES" . --include="*.md" --include="*.ts" --include="*.tsx" | xargs sed -i 's/CLEARCOMP_STANDING_PRINCIPLES/VIALUCE_STANDING_PRINCIPLES/g' 2>/dev/null

# Verify
grep -rn "CLEARCOMP_STANDING" . --include="*.md" --include="*.ts" --include="*.tsx" | head -5
```

Also update the old rule 3 inside the file: "CC Admin always sees English" should be replaced with "VL Admin language lock REMOVED -- all users select their preferred language."

**Backlog items addressed:** L.4 (global rename scope -- partial)

**PROOF GATE 9:** `grep -rn "CLEARCOMP_STANDING" . --include="*.md" --include="*.ts" --include="*.tsx"` returns ZERO results. File `VIALUCE_STANDING_PRINCIPLES.md` exists.

**Commit:** `OB-38-9: Rename CLEARCOMP to VIALUCE standing principles`

### Phase 10: Employee Names in Calculation Display

The Employee Breakdown table shows "Employee XXXXXXXX" instead of real names from the roster.

```bash
# Find where employee names come from
grep -rn "Employee.*XXXX\|employeeName\|employee_name\|nombre\|Nombre" src/ --include="*.ts" --include="*.tsx" | head -15

# Find the roster/employee data
grep -rn "roster\|Datos_Colaborador\|employee.*list\|personnel" src/lib/ --include="*.ts" | head -15
```

The roster data (from Datos_Colaborador sheet) contains employee names. Wire these into the calculation results display. Match by employee ID.

**Backlog items addressed:** 4.19 (Employee Breakdown enrichment)

**PROOF GATE 10:** At least 3 employees in the calculation results table show real names (not "Employee XXXXXXXX"). Names sourced from roster data.

**Commit:** `OB-38-10: Employee names from roster in calculation display`

### Phase 11: Currency Verification Sweep

OB-37 Phase 11 did a global currency sweep. Verify it actually worked:

```bash
# Find any remaining hardcoded currency in display components
grep -rn '\$[0-9]\|\${\|US\$' src/ --include="*.tsx" | grep -v node_modules | grep -v formatCurrency | grep -v "\\$\\.\\|\\$(" | head -20

# Find MXN/USD hardcoded
grep -rn "MXN\|USD\|US Dollar" src/ --include="*.tsx" | grep -v formatCurrency | grep -v tenant | head -10
```

Fix any remaining instances. Every monetary value in a display component MUST use `formatCurrency()`.

**Backlog items addressed:** 4.6 (currency formatting), B.101 (Employee Breakdown currency)

**PROOF GATE 11:** `grep` for hardcoded currency in display components returns zero results (utility definitions acceptable).

**Commit:** `OB-38-11: Currency verification and remaining fixes`

### Phase 12: Context-Carrying Navigation Links

"View History" from Design currently dumps to the global unfiltered audit log. Fix navigation links to carry source context as URL parameters:

- Design > "View Full History" should navigate to `/investigate/search/history?entity=plan&entity=config`
- The Change History page should read URL params and pre-apply filters

```bash
# Find the "View History" / "View Full History" links
grep -rn "View.*History\|Full.*History\|href.*history\|push.*history" src/ --include="*.tsx" | head -10

# Find the Change History page and its filter system
cat src/app/investigate/search/history/page.tsx 2>/dev/null || find src -path "*history*page*" -name "*.tsx" | head -5
```

Add `?context=design` or `?entity=plan` to the link. On the history page, read these params and pre-filter the results.

**Backlog items addressed:** I.4 (context-carrying navigation), D.7 (Design history context)

**PROOF GATE 12:** Clicking "View Full History" from Design page navigates to history with pre-filtered results showing only plan/config changes (not all events).

**Commit:** `OB-38-12: Context-carrying navigation links`

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | Storage key diagnostic | Phase 0 storage key map is documented in completion report with exact keys, file:line references, and identified mismatches. |
| HG-2 | CompensationClockService | getCycleState() returns a state beyond AWAITING_DATA for RetailCGMX. Paste the returned state object. |
| HG-3 | Cycle real state | Cycle shows "January 2024" with lifecycle state beyond "Import Commission Plan / 0%." |
| HG-4 | Queue event-driven | Queue does NOT show "Import Commission Plan" for RetailCGMX with existing plan. |
| HG-5 | Pulse non-empty | At least two Pulse metrics show real values (not dash) for RetailCGMX. |
| HG-6 | Operate landing real data | Operate landing for RetailCGMX does NOT show "Import Commission Plan" urgent action. Shows pipeline status. |
| HG-7 | Perform shows data | Platform Admin on Perform sees aggregate compensation data (total payout or employee count), not "not yet available." |
| HG-8 | Comparison Depth Assessment | ComparisonDepthAssessment generated for RetailCo benchmark file. Identifies employeeId column and at least totalPayout or one component. |
| HG-9 | Comparison produces matches | After confirming mappings, comparison returns non-zero matched employees (>0). |
| HG-10 | False green detection | If component mappings exist, engine identifies employees with matching totals but mismatched components (or reports zero false greens with evidence). |
| HG-11 | Reconciliation results display | Summary panel shows match count, delta, populations. Employee table sortable. Currency in MXN. |
| HG-12 | Perform persona-aware | Platform Admin sees "Performance Observatory" (or equivalent aggregate title). Demo User Sales Rep sees "My Performance." Two different views. |
| HG-13 | Standing principles renamed | `VIALUCE_STANDING_PRINCIPLES.md` exists. Zero "CLEARCOMP_STANDING" references in codebase. |
| HG-14 | Employee names | At least 3 employees show real names (not "Employee XXXXXXXX") in calculation display. |
| HG-15 | Korean Test | Zero hardcoded tenant-specific field names in any modified file. Evidence: grep output. |
| HG-16 | Build passes | `npm run build` exits 0. |
| HG-17 | Server responds | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns 200. |
| HG-18 | Completion report | `OB-38_COMPLETION_REPORT.md` exists in project root and is committed to git. |
| HG-19 | One commit per phase | At least 12 commits for 12 phases (Phase 0 included as diagnostic commit). |

## SOFT GATES

| # | Gate | Criterion |
|---|------|-----------|
| SG-1 | False green visual distinction | False green rows use a visually distinct treatment from regular matches (not just a different shade of green). |
| SG-2 | Export CSV | Reconciliation export generates downloadable CSV with comparison data. |
| SG-3 | Batch label readable | Batch dropdown shows "January 2024 -- Preview | 719 employees" not raw UUID. |
| SG-4 | Context-carrying history | "View History" from Design pre-filters to plan/config changes. |
| SG-5 | Manager Perform view | Demo User as Manager sees "Team Performance" distinct from VL Admin observatory. |
| SG-6 | Currency zero hardcoded | grep for hardcoded $ in display tsx files returns zero results. |
| SG-7 | Wayfinder variance flags | Reconciliation uses attention patterns, not stoplight colors. |

---

## EXECUTION ORDER

```
Phase 0:  Full storage key diagnostic (read only, document mismatches)
Phase 1:  Fix CompensationClockService key alignment
Phase 2:  Cycle/Queue/Pulse wiring verification
Phase 3:  Operate and Perform landing page data wiring
Phase 4:  Comparison Depth Assessment engine
Phase 5:  Adaptive multi-layer comparison engine
Phase 6:  Reconciliation ADR results display
Phase 7:  Perform page persona-aware rendering
Phase 8:  Operate landing state-aware
Phase 9:  Standing principles file rename
Phase 10: Employee names from roster
Phase 11: Currency verification sweep
Phase 12: Context-carrying navigation links
```

After Phase 12: Write completion report, commit, final build, confirm server, push.

---

## BACKLOG CROSS-REFERENCE

| Backlog # | Item | OB-38 Phase |
|-----------|------|-------------|
| 4.6 | Currency formatting tenant-aware | Phase 11 |
| 4.13 | Progress bar context (Cycle indicator) | Phase 2 |
| 4.14 | Queue reflects actual pipeline state | Phase 2 |
| 4.16 | Quick Actions scoping per role | Phase 7 |
| 4.18 | My Compensation wired to real data | Phase 3, 7 |
| 4.19 | Employee Breakdown names not "Employee XXXXXXXX" | Phase 10 |
| B.101 | formatCurrency on Employee Breakdown | Phase 11 |
| B.103 | Mission Control mock data | Phase 2 |
| L.4 | Global rename scope (partial) | Phase 9 |
| NEW | Adaptive Depth Reconciliation | Phases 4-6 |
| NEW | Perform persona architecture | Phase 7 |
| NEW | Context-carrying navigation | Phase 12 |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-38_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- **MUST include the Phase 0 storage key diagnostic map**
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

*ViaLuce.ai -- The Way of Light*
*OB-38: Data Truth and Persona Architecture*
*February 13, 2026*
*"If the service can't find the data, the platform is a shell."*
