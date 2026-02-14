# ViaLuce OB-39: Reconciliation Intelligence, Lifecycle Surfacing, and Platform Truth
## Overnight Batch -- Maximum Autonomy, No Stops
## Date: February 14, 2026
## PREREQUISITES: HF-021 and HF-022 must have been run. OB-38 complete.

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

CLT-38 browser testing (post OB-38 + HF-021 + HF-022) revealed that the reconciliation system is architecturally disconnected from the rest of the platform's intelligence. The AI already interprets the compensation plan, classifies data fields during import, and user confirmations strengthen those signals -- but the reconciliation engine ignores all of this and starts from scratch with manual field mapping. This violates three TMR principles simultaneously: Closed-Loop Intelligence (#14), Adaptive Depth Reconciliation (#29), and the standing principle of AI-First, Never Hardcoded.

Additionally, the calculation lifecycle state machine (Draft through Paid, built in OB-34) has zero UI surface in the primary workspaces. Users cannot advance calculations through approval, publish results for reps to see, export payroll, or close periods. The engine works; the product doesn't expose it.

Finally, multiple platform surfaces show incorrect branding, stale state, or non-functional elements that undermine trust during demonstrations.

This batch has THREE missions:

1. **Reconciliation Intelligence** (ARCHITECTURE) -- Rebuild reconciliation as a consumer of the existing intelligence pipeline. The AI already knows this customer's data. Use that knowledge.
2. **Lifecycle Surfacing** (PRODUCT) -- Give users the ability to advance calculations through approval, publish, payroll export, and period close.
3. **Platform Truth** (POLISH) -- Fix branding, Cycle indicator, Queue state, and persona switching so the platform tells the truth about itself.

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
Every AI call captures a training signal. Every user confirmation strengthens future classifications. The platform gets smarter with use.

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

### 10. Adaptive Depth Reconciliation (TMR #29)
Compare at every layer the data supports. Discover the common ground between two independent datasets. The most dangerous discrepancy is the one that hides behind a matching total.

### 11. Intuitive Adjacency (TMR #30)
The action the persona will take next should be reachable from where the insight occurs. Navigation is a tax on decision-making. Three mechanisms: Action Embedding, Context Carriage, Persona-Scoped Action Sets.

### 12. One Import Experience (TMR #15, OB-13A)
The AI classifies data once. That classification flows forward to every downstream consumer -- calculation, reconciliation, export, reporting. Subsequent encounters with the same customer's data domain leverage prior classification signals strengthened by user confirmation. The platform never re-discovers what it already knows.

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

## MISSION A: RECONCILIATION INTELLIGENCE

The reconciliation system must become a consumer of the platform's existing intelligence, not an isolated tool that re-discovers data semantics from scratch.

### The Architecture Problem (Read This First)

Currently, reconciliation:
- Asks the user to manually map Employee ID and Amount fields from a dropdown of raw column names
- Ignores the plan interpretation (which knows all 6 components, their metrics, and their tier structures)
- Ignores the import classification (which already mapped columns like `num_empleado` to semantic types)
- Ignores user confirmations from prior interactions (which strengthened those classifications)
- Compares only at one level (total payout per employee) instead of every available dimension
- Has two redundant field mapping sections (ADR dropdowns AND legacy column-by-column mapping)

The corrected architecture:

1. **When a file is uploaded for reconciliation**, the platform's existing classification pipeline runs -- the SAME classification that processes import files. Not a separate, parallel classifier.

2. **The classifier has CONTEXT**: it knows this is tenant RetailCGMX, it has prior classification signals for this tenant (num_empleado = employee_id, Venta_Individual = sales_amount, etc.), and those signals were strengthened by user confirmation during import. Classification confidence should be HIGHER for reconciliation than it was for the first import.

3. **The plan interpretation provides the comparison dimensions**: The plan has 6 components (Store Sales, New Customers, Collections, Warranty, Insurance, Certification). Each component has metrics and tiers. These are the LAYERS for multi-depth comparison.

4. **The Comparison Depth Assessment** (built in OB-38 Phase 4) determines HOW DEEP comparison can go based on what the file and plan have in common.

5. **The Adaptive Comparison Engine** (built in OB-38 Phase 5) executes multi-layer comparison with false green detection.

6. **The UI presents ONE coherent experience** -- not two separate field mapping sections.

---

### PHASE 0: RECONCILIATION INTELLIGENCE AUDIT (Read only -- no code changes)

Before writing any code, trace the complete current state.

```bash
echo "============================================"
echo "PHASE 0: RECONCILIATION INTELLIGENCE AUDIT"
echo "============================================"

echo ""
echo "=== 0A: CURRENT RECONCILIATION PAGE ==="
wc -l src/app/operate/reconcile/page.tsx
head -50 src/app/operate/reconcile/page.tsx

echo ""
echo "=== 0B: HOW DOES IMPORT CLASSIFY FILES? ==="
# Find the import classification pipeline
grep -rn "classifySheet\|classifyColumns\|classifyFile\|mapColumns\|AIService.*classify" src/lib/ --include="*.ts" | head -20

echo ""
echo "=== 0C: WHERE ARE CLASSIFICATION SIGNALS STORED? ==="
# Find where AI classification results are persisted
grep -rn "training_signal\|classification_result\|confidence_score\|field_mapping.*store\|field_mapping.*save" src/lib/ --include="*.ts" | head -20

echo ""
echo "=== 0D: WHAT DOES THE PLAN INTERPRETATION PRODUCE? ==="
# Find plan interpretation output shape
grep -rn "PlanComponent\|ComponentMetric\|TierBoundary\|planComponents" src/lib/compensation/ --include="*.ts" | head -15
grep -rn "interface.*Plan\|type.*Plan" src/types/ --include="*.ts" | head -10

echo ""
echo "=== 0E: WHAT DO OB-38 COMPARISON ENGINES EXPOSE? ==="
cat src/lib/reconciliation/comparison-depth-engine.ts | head -40
cat src/lib/reconciliation/adaptive-comparison-engine.ts | head -40

echo ""
echo "=== 0F: HOW DOES HF-022 RETRIEVE CALCULATION RESULTS? ==="
# The IndexedDB retrieval path that HF-022 fixed
grep -n "IndexedDB\|indexedDB\|loadResults\|getPeriodResults" src/app/operate/reconcile/page.tsx | head -15

echo ""
echo "=== 0G: WHAT CLASSIFICATION CONTEXT EXISTS PER TENANT? ==="
# Find if per-tenant classification history is stored
grep -rn "tenant.*classif\|classif.*tenant\|mapping.*history\|import.*signal" src/lib/ --include="*.ts" | head -15

echo ""
echo "=== 0H: CURRENT UI STRUCTURE ==="
# Count the two field mapping sections
grep -n "Field Mapping\|Column Mapping\|Upload Another\|Employee ID Field\|Amount Field" src/app/operate/reconcile/page.tsx | head -20
```

### PHASE 0 REQUIRED OUTPUT

Document in the completion report:

```
RECONCILIATION INTELLIGENCE AUDIT
  Classification pipeline entry point: [file:line]
  Classification signals storage: [file:line or NOT PERSISTED]
  Plan component access: [how to get components for current tenant]
  OB-38 engines: [what they accept, what they return]
  HF-022 IndexedDB path: [how results are currently retrieved]
  Per-tenant classification history: [EXISTS / DOES NOT EXIST]
  
ARCHITECTURE DECISIONS FOR THIS BATCH:
  1. Reuse import classifier for reconciliation: [HOW -- shared function, new wrapper, or new entry point]
  2. Plan component access for comparison layers: [HOW -- service call, context prop, or direct read]
  3. Classification signal flow: [HOW -- if signals not persisted, where to persist]
  4. UI consolidation: [WHAT to keep, WHAT to remove]
```

**Commit:** `OB-39-0: Reconciliation intelligence audit`

---

### PHASE 1: CLASSIFICATION SIGNAL INFRASTRUCTURE

Create or extend the infrastructure for persisting and retrieving classification signals per tenant.

**Requirements:**

1. Create `src/lib/intelligence/classification-signal-service.ts`
2. Signals are scoped by tenantId + data domain (e.g., "employee_data", "compensation_results", "benchmark")
3. Each signal contains: { fieldName, semanticType, confidence, source ('ai' | 'user_confirmed' | 'user_corrected'), timestamp }
4. When a user confirms or corrects a field mapping during import, a signal is recorded
5. When reconciliation needs to classify a new file, it retrieves existing signals for the tenant
6. Signal confidence escalation: ai_initial (0.6-0.8) -> user_confirmed (0.95) -> user_corrected (0.99)
7. Storage: localStorage for now (keyed by tenant), with clear interface for Supabase migration
8. Service must be consumable by BOTH import pipeline AND reconciliation pipeline

**Korean Test:** Signal service works with any field names in any language. No hardcoded column names. Semantic types are universal (employee_id, amount, attainment_percentage, etc.).

**PROOF GATE 1:** `ClassificationSignalService` exists with `recordSignal()`, `getSignals(tenantId, domain?)`, and `getConfidentMappings(tenantId, threshold)` methods. Methods are typed and tested with a simple inline test.

**Commit:** `OB-39-1: Classification signal infrastructure`

---

### PHASE 2: CONNECT IMPORT PIPELINE TO SIGNAL SERVICE

Wire the existing import classification pipeline to record signals when it classifies files and when users confirm/correct mappings.

**Requirements:**

1. Find where the import pipeline classifies columns (from Phase 0 audit)
2. After AI classification: record signals with source='ai' and the AI's confidence score
3. After user confirmation (three-tier auto-confirmation or manual): record signals with source='user_confirmed' and confidence=0.95
4. After user correction (user changes a mapping): record signals with source='user_corrected' and confidence=0.99
5. Do NOT change the import pipeline's behavior -- only ADD signal recording as a side effect
6. Signals accumulate -- multiple imports create multiple signals per field, with the highest-confidence signal winning during retrieval

**PROOF GATE 2:** After importing a file through the standard import pipeline, `getSignals(tenantId)` returns non-empty array with at least one signal per classified field. Evidence: paste the signal array.

**Commit:** `OB-39-2: Connect import pipeline to signal service`

---

### PHASE 3: INTELLIGENT RECONCILIATION CLASSIFIER

Replace the reconciliation page's manual field mapping with an intelligent classifier that consumes prior signals.

**Requirements:**

1. When a file is uploaded on the reconciliation page, FIRST retrieve classification signals for the tenant
2. Run the standard AI column classification (same function the import pipeline uses)
3. BOOST AI confidence with matching signals: if AI says column X might be employee_id (confidence 0.65) and a prior user_confirmed signal also says X pattern = employee_id (confidence 0.95), the effective confidence is the MAX of the two
4. Auto-map fields that exceed 0.85 effective confidence
5. Present the mapping to the user with confidence indicators (same Wayfinder L2 patterns used in import)
6. Allow manual override -- which records a new signal
7. Show WHY the AI made each mapping decision: "Mapped because: similar to `num_empleado` from your January 2024 import (confirmed)"

**UI Changes:**
- REMOVE the bottom "Confirm Column Mapping" section entirely (the 30-row all-skip table)
- REMOVE the "Upload Another" button
- KEEP the top Field Mapping section but redesign it:
  - Show Employee ID Field and Amount Field as auto-populated with confidence badges
  - Add expandable "Component Mappings" section (collapsed by default) that shows any additional plan component mappings the AI detected
  - Each mapping shows: Source Column -> Mapped To (confidence %) with override dropdown

**PROOF GATE 3:** After uploading a benchmark file for a tenant that has prior import signals, at least one field is auto-mapped with confidence > 0.85 WITHOUT user interaction. The "Confirm Column Mapping" (30-row) section is gone.

**Commit:** `OB-39-3: Intelligent reconciliation classifier with signal boosting`

---

### PHASE 4: PLAN-AWARE COMPARISON DEPTH

Connect the Comparison Depth Assessment engine (OB-38 Phase 4) to the plan interpretation results, so it knows what components and metrics are available for multi-layer comparison.

**Requirements:**

1. Read the active plan for the current tenant
2. Extract component names, metric names, and tier structures
3. Pass these to the ComparisonDepthAssessment along with the file's classified columns
4. The assessment determines comparison layers:
   - Level 0: Employee match only (always available if employee_id mapped)
   - Level 1: Total payout comparison (available if any amount column mapped)
   - Level 2: Component comparison (available if file columns map to individual plan components)
   - Level 3: Metric comparison (available if file columns map to component metrics like attainment %)
   - Level 4: Tier verification (available if file has enough detail to verify tier qualification)
5. Display the assessed comparison depth to the user BEFORE they click "Run Reconciliation" so they know what they'll get

**PROOF GATE 4:** ComparisonDepthAssessment for RetailCGMX identifies at least Level 1 (total payout) and attempts Level 2 (component-level) based on plan components. Assessment is visible in the UI before running comparison.

**Commit:** `OB-39-4: Plan-aware comparison depth assessment`

---

### PHASE 5: MULTI-LAYER COMPARISON EXECUTION

Wire the "Run Reconciliation" button to execute the full adaptive comparison using the plan-aware depth assessment, classification mappings, IndexedDB results (from HF-022), and the uploaded benchmark file.

**Requirements:**

1. Button click reads: classified file data, IndexedDB calculation results, comparison depth assessment, field mappings (AI-populated or user-overridden)
2. Execute comparison at every available layer identified by the depth assessment
3. For each matched employee, produce:
   - Total match/delta (Level 1)
   - Per-component match/delta if component mappings exist (Level 2)
   - Per-metric match/delta if metric mappings exist (Level 3)
4. False green detection: Flag employees where total matches but at least one component has >5% variance
5. Loading state with meaningful progress: "Matching employees... (458/719)" not just a spinner
6. Console breadcrumbs at each stage for debugging

**CRITICAL:** Read calculation results from IndexedDB using the path established in HF-022. The tenant ID used for IndexedDB lookup MUST match the actual tenant ID used when calculations were stored. Trace this path from Phase 0 audit.

**PROOF GATE 5:** Comparison produces non-zero matched employees (>0 matched out of 719). Console shows: employee count from IndexedDB, match count, delta summary. If 0 matched, this is a FAIL -- do not proceed until at least some employees match.

**Commit:** `OB-39-5: Multi-layer comparison execution`

---

### PHASE 6: RECONCILIATION RESULTS DISPLAY

Redesign the results panel to show multi-layer comparison results with Wayfinder L2 patterns.

**Requirements:**

1. **Summary panel** (top):
   - Comparison Depth achieved (e.g., "Level 2: Component Comparison")
   - Total matched / file-only / vl-only counts
   - Aggregate totals: Benchmark Total, Calculated Total, Difference
   - Currency in tenant locale (MXN for RetailCGMX) -- use `useCurrency()` hook

2. **Distribution cards** (same as HF-022 but with correct data):
   - Exact/Tolerance (within 1%)
   - Amber (1-5% variance)
   - Red Flags (>5% variance)
   - False Greens (total matches, components don't) -- ONLY shown if Level 2+ comparison was performed

3. **Employee comparison table**:
   - Default sort: Red Flags first, then False Greens, then Amber, then Exact
   - Expandable rows: click employee to see component breakdown (if Level 2+)
   - Each component shows: Plan Component Name | Benchmark Value | Calculated Value | Delta | Status
   - Status uses Wayfinder L2 attention patterns, NOT stoplight colors
   - Eye icon to view full employee trace (context-carrying nav to forensics)

4. **Export CSV** button: exports the full comparison at all available layers

5. **Page title**: Change from "Reconciliation Benchmark" to "Reconciliation"
   - Subtitle: "Compare calculation results against benchmark data"

**PROOF GATE 6:** Results display shows: summary with comparison depth label, employee table with at least one expandable row (if Level 2+), currency in MXN, and Export CSV button present.

**Commit:** `OB-39-6: Reconciliation results display with multi-layer depth`

---

## MISSION B: LIFECYCLE SURFACING

The calculation lifecycle state machine (OB-34) supports 7 states: DRAFT -> PREVIEW -> OFFICIAL -> PENDING_APPROVAL -> APPROVED -> REJECTED -> PAID. Currently, only "Run Preview" and "Run Official" buttons exist. Users cannot advance through the remaining states.

### PHASE 7: LIFECYCLE ACTION BAR IN OPERATE

Add a lifecycle action bar to the Operate workspace that shows the current calculation state and the available next action.

**Requirements:**

1. Read the current lifecycle state for the active period from `calculation-lifecycle-service.ts`
2. Display an action bar below the calculation results section:

   | Current State | Bar Shows | Action Button | Who Can Act |
   |---------------|-----------|---------------|-------------|
   | PREVIEW | "Preview calculation complete" | "Run Official Calculation" | Tenant Admin |
   | OFFICIAL | "Official results ready for review" | "Submit for Approval" | Tenant Admin |
   | PENDING_APPROVAL | "Awaiting approval by [approver]" | "Approve" / "Reject" | Finance, VL Admin |
   | APPROVED | "Approved. Ready for payroll." | "Export Payroll" / "Mark as Paid" | Finance, Tenant Admin |
   | PAID | "Period closed. Payroll processed." | "View Summary" | All |

3. "Submit for Approval" transitions to PENDING_APPROVAL
4. "Approve" transitions to APPROVED (requires different user than submitter -- separation of duties from OB-34)
5. "Export Payroll" generates a CSV with: Employee ID, Employee Name, Total Payout, Per-Component Breakdown
6. "Mark as Paid" transitions to PAID and advances the Cycle to the next period
7. Role gating: only roles listed in "Who Can Act" see the action button. Others see the status text only.
8. Rejected state: "Rejected. [reason]. Return to Official for re-review." with "Return to Official" button.

**Intuitive Adjacency:** The action bar appears WHERE the user sees the results. They don't navigate to a separate approval page -- the action is adjacent to the insight.

**PROOF GATE 7:** Lifecycle action bar renders with correct state and action button for at least PREVIEW and OFFICIAL states. Button click advances the lifecycle state (verify state change in console or localStorage/IndexedDB).

**Commit:** `OB-39-7: Lifecycle action bar in Operate`

---

### PHASE 8: PUBLISH MAKES DATA VISIBLE IN PERFORM

When calculations reach APPROVED state, the data becomes visible to sales reps in the Perform workspace.

**Requirements:**

1. My Compensation page (`/perform/my-comp` or equivalent) reads from published calculation results
2. Published = lifecycle state is APPROVED or PAID
3. If lifecycle state is PREVIEW or OFFICIAL: Sales Rep sees "Your compensation for [period] is being processed. Results will be available after approval."
4. If lifecycle state is APPROVED or PAID: Sales Rep sees their actual compensation data:
   - Total payout for the period
   - Per-component breakdown with plan component names
   - Attainment percentage per component
   - Trend vs prior period (if prior period data exists)
5. Manager sees team aggregate: total team payout, top/bottom performers, team attainment average
6. Currency in tenant locale

**Calculation Sovereignty:** Perform reads the SAME calculation results that Operate displays. One source of truth. Never a separate calculation or cached copy.

**PROOF GATE 8:** When lifecycle state is APPROVED, a Sales Rep demo user on Perform sees their compensation total (non-zero). When lifecycle state is PREVIEW, they see the "being processed" message.

**Commit:** `OB-39-8: Publish gates data visibility in Perform`

---

### PHASE 9: PAYROLL EXPORT

Create the payroll export function triggered from the lifecycle action bar.

**Requirements:**

1. Export generates a CSV or XLSX file
2. Columns: Employee ID, Employee Name, Period, Total Payout, [one column per plan component payout]
3. Column names come from plan components (Korean Test: no hardcoded column names)
4. Currency values formatted for the tenant locale
5. File name includes tenant name and period: `RetailCGMX_January2024_Payroll.csv`
6. Download triggers from the "Export Payroll" button in the lifecycle action bar
7. File is downloadable in the browser (use Blob + URL.createObjectURL)

**PROOF GATE 9:** Clicking "Export Payroll" from APPROVED state downloads a CSV with 719 rows (one per employee), correct column headers from plan components, and non-zero payout values. File opens cleanly in Excel.

**Commit:** `OB-39-9: Payroll export from lifecycle action bar`

---

## MISSION C: PLATFORM TRUTH

Fix the surfaces that lie about the platform's state.

### PHASE 10: ENTITY B -> VIALUCE BRANDING

**Requirements:**

1. Find and replace "Entity B Platform" with "ViaLuce" on the tenant selection page
2. Replace "Administration Console" with "Platform Console" (or appropriate subtitle)
3. Replace the blue "E" logo with the ViaLuce logo/icon
4. Search entire codebase for any remaining "Entity B" references and replace

```bash
grep -rn "Entity B\|entityb\|entity_b\|EntityB" src/ --include="*.ts" --include="*.tsx" | head -30
```

**PROOF GATE 10:** Zero results from `grep -rn "Entity B" src/ --include="*.ts" --include="*.tsx"`. Tenant selection page header shows "ViaLuce."

**Commit:** `OB-39-10: Entity B to ViaLuce branding`

---

### PHASE 11: CYCLE INDICATOR TRUTH

The Cycle indicator in the sidebar must show meaningful information, not raw IDs.

**Requirements:**

1. Period label: "January 2024" not "period-1770819809919-iblg90n"
   - Derive from committed data period detection or plan period metadata
   - Fallback: parse the period dates from the data if no label exists
2. Progress: Show lifecycle state as progress, not arbitrary percentage
   - PREVIEW = 40%, OFFICIAL = 60%, PENDING_APPROVAL = 70%, APPROVED = 85%, PAID = 100%
   - Label below progress: current state name (e.g., "Official -- Awaiting Approval")
3. Cycle status dots: Each dot represents a lifecycle stage. Filled = completed, hollow = pending, active = current
   - If dots can't be made meaningful, remove them rather than showing meaningless colors

**PROOF GATE 11:** Cycle shows "January 2024" (not raw ID) and progress label shows a lifecycle state name (not just a number).

**Commit:** `OB-39-11: Cycle indicator shows meaningful state`

---

### PHASE 12: QUEUE REFLECTS ACTUAL STATE

The Queue must show the correct next action based on the actual lifecycle state.

**Requirements:**

1. Read the current lifecycle state for the active tenant/period
2. Queue items derived from lifecycle state:

   | Lifecycle State | Queue Shows |
   |----------------|-------------|
   | No plan | "Import Commission Plan" (Priority: High) |
   | Plan imported, no data | "Import Performance Data" (Priority: High) |
   | Data imported, no calculation | "Run Preview Calculation" (Priority: Medium) |
   | PREVIEW complete | "Review Preview Results" (Priority: Medium) |
   | OFFICIAL complete | "Submit for Approval" (Priority: High) |
   | PENDING_APPROVAL | "Pending: Awaiting approval by [approver]" (Priority: Low -- waiting) |
   | APPROVED | "Export Payroll / Mark as Paid" (Priority: High) |
   | PAID | "All caught up -- period closed" (Priority: None) |

3. Queue items are clickable and navigate to the relevant page (Intuitive Adjacency)
4. Do NOT show stale items: "Import Performance Data" must NOT appear when data already exists

**PROOF GATE 12:** Queue shows contextually correct next action for the current lifecycle state. Does NOT show "Import Performance Data" when data and calculations already exist.

**Commit:** `OB-39-12: Queue reflects actual lifecycle state`

---

### PHASE 13: PERSONA SWITCH FIX

"Return to Admin" in the Demo User switcher must actually switch the persona back to Platform Admin.

**Requirements:**

1. Find the "Return to Admin" button handler
2. Ensure it resets: user context, role, permissions, and persona-specific rendering
3. After clicking "Return to Admin": bottom of sidebar shows "Platform Admin / Platform Administrator" -- NOT the demo user's name and role
4. Page re-renders with admin view (observatory mode, not personal mode)

**PROOF GATE 13:** After switching to Demo User (Sofia Chen) and clicking "Return to Admin," the sidebar shows "Platform Admin" and the page renders in admin/observatory mode.

**Commit:** `OB-39-13: Return to Admin actually switches persona`

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | Intelligence audit | Phase 0 audit is documented in completion report with classification pipeline entry point, signal storage location, plan component access pattern. |
| HG-2 | Signal service exists | `ClassificationSignalService` has `recordSignal()` and `getSignals()` methods. Typed. |
| HG-3 | Import records signals | After import pipeline runs, `getSignals(tenantId)` returns non-empty array. Paste evidence. |
| HG-4 | Intelligent classification | Reconciliation file upload auto-maps at least one field with >0.85 confidence from prior signals. |
| HG-5 | Redundant UI removed | "Confirm Column Mapping" (30-row table) and "Upload Another" button are gone from reconciliation page. |
| HG-6 | Plan-aware depth | ComparisonDepthAssessment identifies Level 1+ based on plan components. |
| HG-7 | Non-zero matches | Reconciliation comparison produces >0 matched employees. Console shows match count. |
| HG-8 | Results with depth | Results panel shows comparison depth label, summary totals, and employee table. Currency in MXN. |
| HG-9 | Lifecycle action bar | Operate shows lifecycle state and next action button for PREVIEW and OFFICIAL states. |
| HG-10 | State advancement | Clicking action button advances lifecycle state. Evidence: state before and after. |
| HG-11 | Publish gates Perform | Sales Rep on Perform sees compensation data when APPROVED, "being processed" when PREVIEW. |
| HG-12 | Payroll export | CSV downloads with 719 rows, plan component columns, non-zero values. |
| HG-13 | Entity B gone | `grep -rn "Entity B" src/` returns zero results. Tenant selection shows "ViaLuce." |
| HG-14 | Cycle meaningful | Shows "January 2024" and lifecycle state label, not raw period ID. |
| HG-15 | Queue accurate | Queue shows correct next action for current state. Does NOT show "Import Performance Data" when data exists. |
| HG-16 | Persona switch | "Return to Admin" restores Platform Admin identity and admin rendering. |
| HG-17 | Korean Test | Zero hardcoded tenant-specific field names in any modified file. Evidence: grep output. |
| HG-18 | Build passes | `npm run build` exits 0. |
| HG-19 | Server responds | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns 200. |
| HG-20 | Completion report | `OB-39_COMPLETION_REPORT.md` exists in project root and is committed to git. |
| HG-21 | One commit per phase | At least 13 commits for 13 phases (Phase 0 included). |

## SOFT GATES

| # | Gate | Criterion |
|---|------|-----------|
| SG-1 | False green visual | False green rows visually distinct from regular matches. |
| SG-2 | Export CSV reconciliation | Reconciliation export includes all comparison layers. |
| SG-3 | Component expansion | Clicking employee row in reconciliation expands to show component breakdown. |
| SG-4 | Classification reasoning | UI shows WHY each field was mapped (e.g., "Similar to num_empleado from January import"). |
| SG-5 | Payroll filename | Export file name includes tenant and period. |
| SG-6 | Lifecycle separation of duties | Approval requires different user than submitter. |
| SG-7 | Cycle dots meaningful | Each dot represents a lifecycle stage with filled/hollow distinction. |
| SG-8 | Queue items clickable | Queue items navigate to relevant page on click. |

---

## EXECUTION ORDER

```
Phase 0:  Reconciliation intelligence audit (read only, document findings)
Phase 1:  Classification signal infrastructure
Phase 2:  Connect import pipeline to signal service
Phase 3:  Intelligent reconciliation classifier
Phase 4:  Plan-aware comparison depth
Phase 5:  Multi-layer comparison execution
Phase 6:  Reconciliation results display
Phase 7:  Lifecycle action bar in Operate
Phase 8:  Publish gates data visibility in Perform
Phase 9:  Payroll export
Phase 10: Entity B -> ViaLuce branding
Phase 11: Cycle indicator truth
Phase 12: Queue reflects actual state
Phase 13: Persona switch fix
```

After Phase 13: Write completion report, commit, final build, confirm server, push.

---

## BACKLOG CROSS-REFERENCE

| CLT-38 Item # | Description | OB-39 Phase |
|---------------|-------------|-------------|
| 5 | AI field mapping inaccurate | Phase 3 |
| 6 | Dumb comparison, not ADR | Phases 4-6 |
| 7 | Disconnected from import intelligence | Phases 1-3 |
| 3 | Two Field Mapping sections | Phase 3 |
| 4 | "Upload Another" button | Phase 3 |
| 2 | Currency shows $ not MX$ | Phase 6 |
| 16 | Reconciliation page title | Phase 6 |
| 17/18 | 7-State Lifecycle UI | Phases 7-9 |
| 15 | Entity B branding | Phase 10 |
| 8/9/10 | Cycle indicator | Phase 11 |
| 11 | Queue stale state | Phase 12 |
| 14 | Return to Admin | Phase 13 |
| 19/20 | ML-informed classification | Phases 1-3 |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-39_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- **MUST include the Phase 0 reconciliation intelligence audit**
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

*ViaLuce.ai -- The Way of Light*
*OB-39: Reconciliation Intelligence, Lifecycle Surfacing, and Platform Truth*
*February 14, 2026*
*"The platform never re-discovers what it already knows."*
