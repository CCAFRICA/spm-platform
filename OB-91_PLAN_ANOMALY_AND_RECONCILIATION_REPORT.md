# OB-91: PLAN ANOMALY DETECTION + RECONCILIATION REPORT
## Make Intelligence Visible. Catch Errors Before They Calculate. Report With Depth.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. `Vialuce_Calculation_Intent_Specification.md` — intent structure for plan components
4. `ViaLuce_Plan_Anomaly_Type_Registry.md` — the 28 anomaly types, 6 categories, UI philosophy
5. `ViaLuce_Reconciliation_Report_Specification.md` — report structure, data model, phased delivery
6. `ViaLuce_Plan_Anomaly_Detection_Specification.md` — detection architecture, signal integration
7. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

### The OB-88 Lesson

The AI extracted a non-certified Optical Sales matrix with $1,100 at position [≥150%, $120K-$180K]. The correct value is $2,200. This error affected 9 employees and masked $9,900 in underpayments. Nobody caught it because the extraction was accepted without validation.

The same matrix had $600 at [100-149.99%, $120K-$180K] — lower than $750 at the position to its left. This IS correct (deliberate plan design), but the AI should have flagged it for human confirmation.

**Both issues share the same root cause: the plan review screen accepts AI extraction silently.** There is no structural validation, no pattern checking, no anomaly surfacing.

### The Reconciliation Gap

After OB-87, reconciliation has discoverable depth, false green detection, and period awareness. But the OUTPUT is still minimal — component totals with match/no-match. A compensation team needs entity-level drill-down, band distribution analysis, prioritized findings, and exportable detail.

### What This OB Builds

**Part A:** Plan import validation that catches mathematical anomalies in extracted structures and presents them for human confirmation before calculations run.

**Part B:** Reconciliation report that goes from "total matches" to comprehensive entity-level analysis with actionable findings.

---

## FIRST PRINCIPLES

1. **FIX LOGIC NOT DATA** — Anomaly detection validates structure, not specific values.
2. **KOREAN TEST** — Zero hardcoded field names, column names, or language-specific patterns.
3. **AI-FIRST, NEVER HARDCODED** — Detection rules are structural (monotonicity, magnitude, consistency), not value-specific.
4. **THE BLOODWORK METAPHOR** — Default view is clean summary ("2 items need review"). Full panel available on demand. Clean checks build confidence. Anomalies surface with context and options.
5. **THERMOSTAT NOT THERMOMETER** — Findings include recommended actions, not just observations.
6. **DO NOT TOUCH CALCULATION ENGINE** — This OB adds validation UI and report output. Zero changes to the calculation pipeline, intent executor, or component handlers.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. Kill dev server + `rm -rf .next` + `npm run build` + `npm run dev` before completion
3. All git commands from repository root (`spm-platform/`)
4. Supabase `.in()` batch ≤200 items
5. All Supabase writes include `tenant_id`
6. Zero hardcoded field names from any specific dataset

---

## PHASE 0: INVENTORY (15 min)

Before writing any code, document what exists:

### Plan Review
- Where is the current plan review/approval UI? (file path, route)
- What does the user see after AI extracts a plan?
- Is there any existing validation? (even basic)
- How is the plan stored after approval? (rule_sets table structure)

### Reconciliation
- Where is the current reconciliation UI? (file path, route)
- What does OB-87's reconciliation intelligence output look like?
- What comparison data is available after a reconciliation run?
- How are reconciliation results stored? (reconciliation_sessions table)

### Proof Gate

| # | Gate | Criterion |
|---|------|-----------|
| PG-0 | Phase 0 inventory committed | Current state of plan review + reconciliation documented |

**Commit:** `OB-91 Phase 0: plan review and reconciliation inventory`

---

## MISSION 1: ANOMALY DETECTION ENGINE (60 min)

### 1A: Anomaly Type Registry

Create `src/lib/validation/plan-anomaly-registry.ts`:

```typescript
interface PlanAnomaly {
  id: string;                    // "S-01", "V-02", etc.
  type: AnomalyCategory;
  severity: 'critical' | 'warning' | 'info';
  component: string;
  variant?: string;
  location: string;              // "Row 4, Column 3"
  extractedValue: number;
  expectedRange?: [number, number];
  explanation: string;
  neighborContext: Record<string, number>;
  suggestions: string[];
}

type AnomalyCategory = 
  | 'structural'        // S-01 through S-09
  | 'cross_variant'     // V-01 through V-04
  | 'completeness';     // X-01 through X-04

interface PlanValidationResult {
  anomalies: PlanAnomaly[];
  totalChecks: number;
  passedChecks: number;
  components: number;
  valuesParsed: number;
}
```

### 1B: Structural Checks (S-01 through S-09)

Implement detectors for Phase 1 structural anomalies:

**S-01: Monotonicity Violation (Row)**
For each matrix column, check that values increase top-to-bottom. Flag any cell where `matrix[r][c] < matrix[r-1][c]`.

**S-02: Monotonicity Violation (Column)**
For each matrix row, check that values increase left-to-right. Flag any cell where `matrix[r][c] < matrix[r][c-1]`.

**S-03: Magnitude Outlier**
For each cell, compute linear interpolation of neighbors. Flag if actual value deviates >2× from interpolation. Severity escalates to critical at >5×.

**S-04: Zero in Active Region**
Flag $0 values where both row index > 0 AND column index > 0.

**S-05: Non-Zero in Floor Region**
Flag non-zero values in the minimum tier (row 0 AND column 0). Severity: info.

**S-06: Threshold Gap**
For tier tables and matrix boundaries: check that tier[n].max connects to tier[n+1].min with no gap.

**S-07: Threshold Overlap**
Check that tier[n].max does not exceed tier[n+1].min.

**S-08: Boundary Ambiguity**
Detect boundaries where inclusivity is unclear. "80% - 90%" is ambiguous. "80.00% - 89.99%" is clear. "≥80%, <90%" is clear.

**S-09: Inconsistent Boundary Convention**
Compare boundary conventions across all components in the plan. Flag if different components use different conventions.

### 1C: Cross-Variant Checks (V-01 through V-04)

**V-01: Structural Mismatch**
Variants of the same component must have the same dimensions (rows × columns).

**V-02: Ratio Break**
If variant A values are consistently X× variant B, flag any cell where the ratio breaks by >50%.

**V-03: Variant Value Exceeds Primary**
If the plan has a clear "primary > secondary" variant pattern (e.g., certified > non-certified), flag any cell where secondary exceeds primary.

**V-04: Missing Variant**
Check that every variant routing value in the entity population matches a defined variant in the plan.

### 1D: Completeness Checks (X-01 through X-04)

**X-01: Component Without Data Binding**
Component defined but no data source field mapped.

**X-02: Variant Without Population**
Variant defined but zero entities route to it.

**X-03: Entity Without Variant Assignment**
Entity exists but doesn't match any variant routing rule.

**X-04: Partial Matrix Extraction**
Matrix has null/undefined cells that should have values.

### Implementation Notes

- Each detector is a pure function: `(planStructure: RuleSet) => PlanAnomaly[]`
- All detectors registered in a central array — the validation engine iterates them
- No detector depends on another — they run independently
- Every detector handles missing data gracefully (skip check if structure doesn't support it)
- Matrix components get S-01 through S-05, tier components get S-06 through S-09, all get X-01 through X-04

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Anomaly type registry defined | TypeScript types + registry array |
| PG-2 | S-01/S-02 monotonicity detectors work | Test with known matrix (OB-88 non-cert: should flag $600 and $2,200) |
| PG-3 | S-03 magnitude outlier works | $2,200 flagged as >2× neighbor |
| PG-4 | V-02 ratio break works | Non-cert [4][3] flagged (matches cert at same position) |
| PG-5 | X-04 partial matrix works | 5×5 matrix with null cell is flagged |
| PG-6 | Full validation on Óptica Luminar plan | Returns: components=7, checks=17, anomalies≥2 |

**Commit:** `OB-91 Mission 1: plan anomaly detection engine`

---

## MISSION 2: PLAN REVIEW UI (60 min)

### 2A: Summary Cards

At the top of the plan review screen, add 4 summary cards:

```
[Components Parsed: 7 ✅] [Values Parsed: 50 ✅] [Checks Passed: 15 ✅] [Needs Review: 2 ⚠️]
```

- Components Parsed: count of components the AI extracted
- Values Parsed: total matrix cells + tier values + rates
- Checks Passed: anomaly checks that passed cleanly
- Needs Review: Critical + Warning count

### 2B: Component Cards

Each component renders as a card:

**Clean component (collapsed):**
```
Optical Sales — Matrix Lookup                                    ✅ Clean
5×5 matrix · 2 variants · 50 values validated
[Expand]
```

**Component with anomalies (partially expanded):**
```
Optical Sales — Matrix Lookup                                    ⚠️ 2 Items
5×5 matrix · 2 variants

⚠️ S-02: $600 at [100-149.99%, $120-180K] lower than left neighbor ($750)
  [Confirm correct]  [Edit value: ____]

⚠️ S-03: $2,200 at [≥150%, $120-180K] is 2.4× left neighbor ($900)
  [Confirm correct]  [Edit value: ____]
```

### 2C: Matrix Display with Inline Indicators

When a matrix component is expanded, show the full grid. Cells with anomalies get a ⚠️ indicator. Clicking the cell shows the anomaly detail.

Use the existing plan review component structure — enhance it, don't replace it. If the current plan review shows components as a list, add the validation summary above and anomaly indicators inline.

### 2D: Full Validation Panel

"View Full Validation Report" opens a panel showing ALL checks:

```
✅ S-01  Monotonicity (Row)      All components pass
⚠️ S-02  Monotonicity (Column)   1 violation in Optical Non-Certified
⚠️ S-03  Magnitude Outlier       1 outlier in Optical Non-Certified
✅ S-04  Zero in Active Region   No unexpected zeros
...
```

Every check listed. Green for pass, amber for warning, red for critical. This is the comprehensive view — the bloodwork panel.

### 2E: Confirmation Flow

When user confirms an anomaly → mark it as reviewed, capture classification signal (Mission 3).
When user edits a value → update the plan rule_set, capture classification signal.

After all critical/warning anomalies are confirmed or corrected → "Approve Plan" button becomes active.

**Critical anomalies MUST be confirmed before calculation can run.** Add a check in the calculate flow: if plan has unresolved critical anomalies, block with message.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-7 | Summary cards render on plan review | 4 cards with correct counts |
| PG-8 | Clean component shows collapsed with ✅ | Store Sales (no anomalies) shows green |
| PG-9 | Anomalous component shows expanded with ⚠️ | Optical shows 2 items inline |
| PG-10 | Matrix displays with inline indicators | ⚠️ on specific cells in the grid |
| PG-11 | Confirm button captures acknowledgment | Clicking "Confirm correct" resolves the anomaly |
| PG-12 | Full validation panel shows all checks | 17 checks visible, passing and flagged |
| PG-13 | Calculation blocked on unresolved critical | If X-04 exists, calculate button shows warning |

**Commit:** `OB-91 Mission 2: plan review UI with anomaly indicators`

---

## MISSION 3: CLASSIFICATION SIGNAL INTEGRATION (20 min)

### 3A: Signal Capture on Confirm/Correct

Every anomaly resolution generates a classification signal:

```typescript
{
  signal_type: 'plan_anomaly_resolution',
  signal_value: {
    anomalyType: 'S-02',           // monotonicity violation
    component: 'optical_sales',
    variant: 'non_certified',
    location: '[3][3]',
    extractedValue: 600,
    userAction: 'confirmed',        // or 'corrected'
    correctedValue: null,           // or new value
  },
  confidence: 0.85,
  source: 'user_confirmed',
}
```

Use the existing classification signal infrastructure from OB-86. Call the same API route / service function.

### 3B: Wire to ai_prediction_log

Ensure signals write to the `ai_prediction_log` table (or `classification_signals` — whatever OB-86 created). Include `tenant_id`.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-14 | Confirm generates classification signal | Signal appears in database after confirm click |
| PG-15 | Correct generates classification signal | Signal includes correctedValue after edit |

**Commit:** `OB-91 Mission 3: anomaly resolution classification signals`

---

## MISSION 4: RECONCILIATION REPORT DATA ENGINE (60 min)

### 4A: Report Data Structure

Create `src/lib/reconciliation/report-engine.ts`:

```typescript
interface ReconciliationReport {
  summary: {
    overallMatchPercent: number;
    totalEngine: number;
    totalBenchmark: number;
    totalDelta: number;
    entityCount: number;
    exactMatchCount: number;
    deltaEntityCount: number;
    topFinding: string;
  };
  components: ComponentAnalysis[];
  findings: Finding[];
}

interface ComponentAnalysis {
  name: string;
  calculationType: string;
  engineTotal: number;
  benchmarkTotal: number;
  delta: number;
  deltaPercent: number;
  entityCount: number;
  exactMatchCount: number;
  entities: EntityDetail[];
}

interface EntityDetail {
  entityId: string;
  externalId: string;
  name?: string;
  store?: string;
  variant?: string;
  enginePayout: number;
  benchmarkPayout: number;
  delta: number;
}

interface Finding {
  severity: 'critical' | 'warning' | 'info' | 'exact';
  title: string;
  description: string;
  impact: string;
  impactAmount: number;
  entityCount: number;
  action: string;
  componentName?: string;
  entityIds?: string[];
}
```

### 4B: Report Generation

After a reconciliation comparison runs (OB-87 infrastructure), generate the report:

1. **Executive summary:** Compute overall match %, entity match count, identify the single most impactful finding.

2. **Component analysis:** For each component where the benchmark file supports component-level comparison (Level 4 depth from OB-87), compute per-entity engine vs benchmark values.

3. **Entity detail:** For every entity, show per-component payout from engine and benchmark. Compute delta.

4. **Finding generation:** Analyze patterns in the entity details:
   - Group entities by delta direction and magnitude
   - Identify if deltas cluster by variant, store, or band
   - Generate prioritized findings with severity, impact, and recommended action
   - Priority order: critical → warning → info → exact

### 4C: Finding Patterns to Detect

- **Matrix value error:** Multiple entities at the same band position all have the same delta → matrix value is wrong
- **Band assignment shift:** Multiple entities at adjacent bands with systematic over/under → column or row metric issue
- **Variant concentration:** All deltas in one variant → variant-specific issue
- **Store concentration:** All deltas at certain stores → store-level data issue
- **Boundary clustering:** Deltas concentrate near tier thresholds → boundary convention issue

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-16 | Report data structure defined | Types in report-engine.ts |
| PG-17 | Executive summary computes correctly | For Pipeline Test Co: 97.2% match, 21 delta entities, top finding = Optical |
| PG-18 | Component analysis per entity | Optical shows 719 entities with per-entity delta |
| PG-19 | Findings generated | At least 1 critical (matrix value) + 1 warning (band shift) |

**Commit:** `OB-91 Mission 4: reconciliation report data engine`

---

## MISSION 5: RECONCILIATION REPORT UI (60 min)

### 5A: Executive Summary Panel

At the top of the reconciliation results page, replace the current output with:

```
RECONCILIATION REPORT — [Period Name]
[Tenant Name] · [Entity Count] Entities · [Component Count] Components

[Overall Match: 97.2%]  [Exact Entities: 698/719]  [Components at 0%: 5/6]

Component Status:
✅ Store Sales      $116,250 = $116,250     0.0%
✅ New Customers     $39,100 =  $39,100     0.0%
✅ Collections      $283,000 = $283,000     0.0%
✅ Insurance             $10 =      $10     0.0%
✅ Warranty          $66,872 =  $66,872     0.0%
⚠️ Optical Sales    $783,700 vs $748,600   +4.7%

Top Finding: [description]
```

### 5B: Component Deep Dive

Click on any component to expand entity-level detail:

**Component header** with engine total, benchmark total, delta, entity match count.

**Entity table** (sortable, filterable):
- Columns: Entity ID, External ID, Name, Store, Variant, Engine Payout, Benchmark Payout, Delta
- Default sort: by absolute delta descending (biggest differences first)
- Filters: "Show only deltas", "Certified only", "Non-certified only"
- Pagination: 50 per page for large populations

### 5C: Findings Panel

Below the component section, prioritized findings:

```
🔴 CRITICAL — [Title]
   [Description]
   Impact: [amount], [entity count] entities
   Action: [recommendation]

⚠️ WARNING — [Title]
   ...

✅ EXACT — [n] Components Perfect
   [list of exact components]
```

### 5D: Integration with Existing Reconciliation UI

This builds ON TOP of OB-87's reconciliation UI. The current reconciliation flow is:
1. Upload benchmark file
2. AI analyzes + maps fields
3. User confirms mappings
4. Comparison runs

After step 4, the RESULTS screen is what this mission enhances. The upload/analyze/map flow stays unchanged.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-20 | Executive summary renders | Shows match %, entity count, component status |
| PG-21 | Component click expands entity table | Optical shows 719 rows with per-entity data |
| PG-22 | Entity table is sortable | Click delta column sorts by delta descending |
| PG-23 | Findings panel shows prioritized items | Critical before warning before info |
| PG-24 | Exact components show green | 5 components with ✅ and 0.0% |

**Commit:** `OB-91 Mission 5: reconciliation report UI`

---

## MISSION 6: EXPORT + COMPLETION (30 min)

### 6A: XLSX Export

Add an "Export Report" button to the reconciliation report. Generates an Excel file with:

**Sheet 1: Summary**
- Overall match %, entity counts, component-level totals

**Sheet 2: Entity Detail**
- One row per entity
- Columns: Entity ID, External ID, Name, Store, Role, Variant, [per-component engine payout], [per-component benchmark payout], [per-component delta], Total Engine, Total Benchmark, Total Delta

**Sheet 3: Findings**
- One row per finding
- Columns: Severity, Title, Description, Impact Amount, Entity Count, Action

Use the xlsx generation approach from existing code (check if `xlsx` or `exceljs` is already a dependency — if not, install).

### 6B: Completion Report

Write `OB-91_COMPLETION_REPORT.md`:

1. Phase 0 inventory findings
2. Anomaly detection: types implemented, tests run, signals captured
3. Plan review UI: summary cards, component cards, matrix display, validation panel
4. Reconciliation report: executive summary, component drill-down, entity table, findings
5. Export capability
6. All proof gates with PASS/FAIL
7. Screenshots or rendered output descriptions

### 6C: Build + PR

```bash
npx tsc --noEmit        # Must exit 0
npm run build            # Must exit 0
npm run dev
# Verify localhost:3000
```

```bash
gh pr create --base main --head dev \
  --title "OB-91: Plan Anomaly Detection + Reconciliation Report" \
  --body "## What This Builds

### Plan Import Anomaly Detection
- 17 structural validation checks (monotonicity, magnitude, thresholds, variants, completeness)
- Plan review UI with summary cards, inline matrix anomaly indicators, full validation panel
- Confirm/Edit flow with classification signal capture
- Critical anomalies block calculation until resolved

### Reconciliation Report
- Executive summary with overall match %, component status, top finding
- Component deep-dive with entity-level detail table (sortable, filterable)
- Prioritized findings: critical → warning → info → exact
- XLSX export with summary + entity detail + findings

### Classification Signals
- Every anomaly confirmation/correction generates a classification signal
- Feeds into OB-86 AI measurement infrastructure
- Platform learns which 'anomalies' are legitimate plan designs

## Proof Gates: see OB-91_COMPLETION_REPORT.md"
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-25 | XLSX export downloads | File contains 3 sheets with correct data |
| PG-26 | Completion report written | All sections, all gates |
| PG-27 | `npm run build` exits 0 | Clean build |
| PG-28 | localhost:3000 responds | HTTP 200 |
| PG-29 | PR created | URL pasted |

**Commit:** `OB-91 Mission 6: export, completion report, PR`

---

## WHAT SUCCESS LOOKS LIKE

### Plan Review
```
Plan Validation: 7 components · 50 values · 15 checks passed · 2 need review

⚠️ S-02 at Non-Cert Optical [100-149.99%, $120-180K]: $600 < $750
   [Confirmed by user → classification signal captured]

⚠️ S-03 at Non-Cert Optical [≥150%, $120-180K]: $2,200 is 2.4× neighbor
   [Confirmed by user → classification signal captured]

Plan approved with all anomalies resolved.
```

### Reconciliation Report
```
RECONCILIATION REPORT — January 2024
Óptica Luminar · 719 Entities · 6 Components

Overall Match: 100.0%    Exact Entities: 719/719    Components at 0%: 6/6

✅ Optical Sales    $748,600 = $748,600    0.0%
✅ Store Sales      $116,250 = $116,250    0.0%
✅ New Customers     $39,100 =  $39,100    0.0%
✅ Collections      $283,000 = $283,000    0.0%
✅ Insurance             $10 =      $10    0.0%
✅ Warranty          $66,872 =  $66,872    0.0%

TOTAL: MX$1,253,832 = MX$1,253,832    0.0% ✅

Findings: 0 critical · 0 warnings · 1 info (72 boundary-adjacent entities)

[Export XLSX]
```

---

## CRITICAL CONSTRAINTS

1. **Do not modify the calculation engine.** This OB adds validation + reporting only.
2. **Do not modify the reconciliation comparison engine** (OB-87). This OB adds report output on top of existing comparison results.
3. **Do not modify the plan import/extraction pipeline.** This OB adds post-extraction validation only.
4. **Phase 1 scope only.** Do not implement Phase 2 items (heatmaps, metric traces, variant analysis, statistical summary, PDF export, cross-component checks, plausibility checks, temporal checks). These are captured in specifications for future OBs.

---

*OB-91 — February 24, 2026*
*"The plan is the DNA of every calculation. Validate the DNA before it replicates."*
*"Twenty-two checks passed silently. Two asked a question. That's not noise — that's intelligence."*
