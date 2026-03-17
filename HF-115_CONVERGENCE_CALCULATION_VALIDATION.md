# HF-115: CONVERGENCE CALCULATION VALIDATION — PRIORITY 1
## Cross-Component Plausibility Check + Scale Anomaly Detection (Decision 121)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `DS-009_Field_Identity_Architecture_20260308.md` — controlling specification
4. `DS-009_Section6_Convergence_Calculation_Validation.md` — this HF implements Priority 1 from this specification

**Read all four before writing any code.**

---

## CONTEXT

The DS-009 pipeline works end-to-end. Import → HC → field identities → AI convergence mapping → correct column bindings → engine consuming via convergence path. HF-114 proved the AI column mapping produces perfect bindings. 100% concordance. 7/7 columns correct.

**But the grand total is MX$3,726,358 instead of MX$185,063.**

The problem: Fleet Utilization (component 4) pays MX$66,340 per entity instead of ~MX$663. The engine computes `rate (800) × utilization_percentage (82.9) = 66,340`. The rate should be multiplied by the ratio (0.829), not the percentage (82.9). This is a 100x scale error.

The four other components are reasonable:
- Revenue Performance: MX$1,600 (matrix lookup — correct bands)
- On-Time Delivery: MX$200 (tier lookup — correct tier)
- New Accounts: MX$0 (0 accounts × $350 — correct)
- Safety Record: MX$0 (0 incidents — gate passes correctly)

**This class of error** — correct bindings producing wrong results due to scale mismatch between plan parameters and data values — is what Decision 121 (Convergence Calculation Validation) addresses. This HF implements Priority 1: detection + correction + signal capture.

---

## WHAT THIS HF IMPLEMENTS

DS-009 Section 6 Priority 1:
- **Value distribution profiling** for bound columns
- **Sample calculation** using median values
- **Cross-component plausibility check** (any component > 10x median of peers = anomaly)
- **Scale correction** applied to convergence bindings when anomaly detected
- **Classification signal** captured for every detection and correction
- **Logging** so Vercel Runtime Logs show exactly what was detected and corrected

### What This HF Does NOT Implement

- Evaluate surface (Priority 3 — needs design)
- Warm/hot confidence progression (Priority 4 — needs signal accumulation)
- Domain-scoped plausibility ranges (Priority 5 — needs flywheel data)
- User confirmation UI (deferred to Evaluate surface)

For now, corrections are auto-applied with `decision_source: 'structural_anomaly'` and logged. When the Evaluate surface is built, it can retroactively surface these for user review.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt as first action.
5. DO NOT MODIFY ANY AUTH FILE.
6. Supabase .in() ≤ 200 items.

---

## COMPLETION REPORT RULES (25-28)

25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## MERIDIAN GROUND TRUTH

- **Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- **Ground truth grand total:** MX$185,063 (January 2025)
- **Current wrong total:** MX$3,726,358

### Component-Level Reference (Claudia Cruz Ramírez)

| Component | Current Payout | Issue |
|---|---|---|
| Revenue Performance | MX$1,600 | ✅ Correct |
| On-Time Delivery | MX$200 | ✅ Correct |
| New Accounts | MX$0 | ✅ Correct |
| Safety Record | MX$0 | ✅ Correct |
| Fleet Utilization | MX$66,340 | ❌ 100x too high — scale mismatch |

**DO NOT hardcode Meridian-specific values or column names.** The detection must be structural and domain-agnostic. Korean Test applies.

---

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID

| Anti-Pattern | What CC Did Before | What To Do Instead |
|---|---|---|
| Hardcoded fix for one tenant | Fix Fleet Utilization rate specifically | Structural detection: any component > 10x median peers = anomaly |
| Fix data not logic | Adjust Meridian's rate from 800 to something else | Detect scale mismatch structurally, propose scale_factor correction |
| Skip signal capture | Fix the number without recording why | Every detection and correction produces a classification_signal |
| No logging | Fix silently | Log detection, correction, before/after values to Vercel Runtime Logs |

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND CONVERGENCE CODE PATH

**No code changes. Inspection only.**

```bash
echo "============================================"
echo "HF-115 PHASE 0: CONVERGENCE CODE PATH"
echo "============================================"

echo ""
echo "=== 1. FIND CONVERGENCE SERVICE ==="
find web/src -name "convergence*" -name "*.ts" | sort

echo ""
echo "=== 2. WHERE ARE BINDINGS WRITTEN? ==="
# Find where convergence writes to input_bindings
grep -rn "input_bindings\|convergence_bindings" \
  web/src/lib/intelligence/convergence*.ts --include="*.ts" | head -20

echo ""
echo "=== 3. WHERE IS THE BINDING STRUCTURE BUILT? ==="
# Find where component bindings are assembled before writing
grep -rn "component_0\|component_1\|buildBinding\|assembleBinding\|componentBinding" \
  web/src/lib/intelligence/convergence*.ts --include="*.ts" | head -20

echo ""
echo "=== 4. WHAT DATA IS AVAILABLE AT BINDING TIME? ==="
# Find what committed_data is fetched during convergence
grep -rn "committed_data\|row_data\|fetchData\|queryData" \
  web/src/lib/intelligence/convergence*.ts --include="*.ts" | head -20

echo ""
echo "=== 5. FIND WHERE SCALE_FACTOR IS SET ==="
# Scale factor is already in some bindings — how is it determined?
grep -rn "scale_factor\|scaleFactor\|scaleDetect" \
  web/src/lib/intelligence/convergence*.ts web/src/lib/engine/ --include="*.ts" | head -20

echo ""
echo "=== 6. FIND ENGINE'S PERCENTAGE/SCALAR HANDLER ==="
# How does the engine use rate × baseAmount?
grep -rn "percentage\|scalar_multiply\|rate.*baseAmount\|baseAmount.*rate" \
  web/src/lib/engine/ web/src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 7. PRINT CONVERGENCE SERVICE — BINDING ASSEMBLY SECTION ==="
# Print the section where bindings are assembled
wc -l web/src/lib/intelligence/convergence-service.ts
# Print last 200 lines (likely where bindings are finalized)
tail -200 web/src/lib/intelligence/convergence-service.ts
```

### PHASE 0 DELIVERABLE: Architecture Decision

Write `HF-115_ARCHITECTURE_DECISION.md`:

```
ARCHITECTURE DECISION RECORD
============================
Problem: Correct convergence bindings produce wrong calculation results 
due to scale mismatch between plan parameters and data values.

FINDINGS FROM CODE INSPECTION:
1. Where bindings are assembled: [file:line]
2. Where bindings are written to DB: [file:line]  
3. Where scale_factor is currently set: [file:line or "not set for percentage components"]
4. How engine uses rate × baseAmount: [file:line]
5. What data is available at binding time: [describe]

Option A: Add validation step in convergence after binding assembly, before DB write
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option B: Add validation in the engine before calculation
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option C: Add scale_factor inference to convergence binding based on value distribution
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___
```

**Commit:** `git add -A && git commit -m "HF-115 Phase 0: Convergence calculation validation diagnostic + architecture decision" && git push origin dev`

---

## PHASE 1: VALUE DISTRIBUTION PROFILING

Add a function that profiles the value distribution of bound columns from committed_data. This function runs after column binding, before writing bindings to DB.

### Function Signature

```typescript
interface ColumnDistribution {
  column: string;
  min: number;
  max: number;
  median: number;
  p25: number;
  p75: number;
  distinctCount: number;
  nullCount: number;
  sampleSize: number;
  scaleInference: 'ratio_0_1' | 'percentage_0_100' | 'integer_count' | 'integer_hundreds' | 'currency_large' | 'unknown';
}

function profileColumnDistribution(
  committedData: any[],
  columnName: string
): ColumnDistribution
```

### Scale Inference Rules (Structural — Korean Test Compliant)

```
ratio_0_1:        all values >= 0 AND max <= 1.5
percentage_0_100: all values >= 0 AND max <= 150 AND min < 1.5 (distinguish from ratio)
integer_count:    all values are integers AND max <= 50
integer_hundreds: all values > 50 AND max <= 10000
currency_large:   max > 10000
unknown:          none of the above
```

These are heuristic starting points. The flywheel refines them.

### Proof Gates — Phase 1

- PG-1: `profileColumnDistribution` function exists with correct signature (paste code)
- PG-2: Scale inference produces `ratio_0_1` for values [0.5, 0.8, 1.0, 1.2] (paste test)
- PG-3: Scale inference produces `percentage_0_100` for values [50, 82, 95, 110] (paste test)
- PG-4: Scale inference produces `integer_hundreds` for values [847, 1083, 1200, 1306] (paste test)
- PG-5: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-115 Phase 1: Value distribution profiling with scale inference" && git push origin dev`

---

## PHASE 2: CROSS-COMPONENT PLAUSIBILITY CHECK

After all component bindings are assembled, run a sample calculation for each component using median values. Compare results across components to detect outliers.

### Function Signature

```typescript
interface PlausibilityResult {
  componentIndex: number;
  componentName: string;
  sampleResult: number;
  medianPeerResult: number;
  ratioToMedian: number;
  isAnomaly: boolean;         // ratio > 10
  anomalyType?: 'scale_mismatch' | 'rate_outlier' | 'unknown';
  proposedCorrection?: {
    type: 'scale_factor';
    currentScale: number;
    proposedScale: number;
    correctedResult: number;
  };
}

function checkCalculationPlausibility(
  componentBindings: Record<string, any>,
  components: any,  // from rule_set
  committedData: any[],
  distributions: Record<string, ColumnDistribution>
): PlausibilityResult[]
```

### Sample Calculation Logic (Per Component Type)

For each component, compute an approximate result using the bound column's median:

- **matrix_lookup / bounded_lookup_2d:** Find which row band contains the row median, which column band contains the column median, return the intersection value.
- **tier_lookup / bounded_lookup_1d:** Find which tier contains the actual median, return the tier payout.
- **percentage / scalar_multiply:** Compute `rate × median_value`. If the component is a ratio (numerator/denominator), compute `rate × (numerator_median / denominator_median)`.
- **conditional_gate:** Return 0 or the gate payout based on the median condition value.

### Anomaly Detection

```
nonZeroResults = results.filter(r => r.sampleResult > 0)
if (nonZeroResults.length < 2) → skip (can't compare)
medianResult = median(nonZeroResults.map(r => r.sampleResult))
for each result:
  ratio = result.sampleResult / medianResult
  if ratio > 10 → ANOMALY
```

### Scale Correction Proposal

When anomaly detected on a percentage/scalar_multiply component:
1. Check if the bound column's scale inference is `ratio_0_1` but the component expects percentage (rate × value where value should be small)
2. Check if applying `scale_factor: 0.01` brings the result within 10x of median
3. If yes → propose `{type: 'scale_factor', currentScale: 100, proposedScale: 1, correctedResult: ...}`

### Logging

```
[CONVERGENCE-VALIDATION] Component 0 (Revenue Performance): sample=1600, median_peer=200, ratio=8.0 — OK
[CONVERGENCE-VALIDATION] Component 1 (On-Time Delivery): sample=200, median_peer=200, ratio=1.0 — OK  
[CONVERGENCE-VALIDATION] Component 4 (Fleet Utilization): sample=66320, median_peer=200, ratio=331.6 — SCALE ANOMALY
[CONVERGENCE-VALIDATION]   Proposed correction: scale_factor 100→1, corrected=663, new_ratio=3.3
[CONVERGENCE-VALIDATION]   Applying correction (decision_source: structural_anomaly)
```

### Proof Gates — Phase 2

- PG-6: `checkCalculationPlausibility` function exists (paste code)
- PG-7: Detection correctly identifies component with > 10x median ratio (paste test or log)
- PG-8: Scale correction proposal computed correctly (paste test or log)
- PG-9: Logging format matches specification (paste log lines)
- PG-10: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-115 Phase 2: Cross-component plausibility check + scale anomaly detection" && git push origin dev`

---

## PHASE 3: APPLY CORRECTION + SIGNAL CAPTURE

### Step 3A: Apply Correction to Bindings

When a scale anomaly is detected and a correction is proposed, apply the correction to the convergence binding's `scale_factor` before writing to `input_bindings`.

The convergence binding for the anomalous component should be updated:

```typescript
// Before: no scale_factor on ratio components
binding.numerator.scale_factor = undefined;
binding.denominator.scale_factor = undefined;

// After: scale_factor applied based on plausibility correction
if (plausibilityResult.isAnomaly && plausibilityResult.proposedCorrection) {
  // Apply scale correction to the component's value bindings
  // This adjusts how the engine interprets the bound values
  // The specific mechanism depends on how scale_factor is consumed by the engine
}
```

**IMPORTANT:** Inspect how the engine consumes `scale_factor` from convergence bindings before implementing. The existing Revenue Performance binding already has `scale_factor: 100` — understand what that does in the engine before adding/changing scale factors elsewhere.

### Step 3B: Capture Classification Signal

After applying (or detecting without applying) a correction:

```typescript
// Write classification signal
await supabase.from('classification_signals').insert({
  tenant_id: tenantId,
  signal_type: 'convergence_calculation_validation',
  signal_value: {
    component_index: result.componentIndex,
    component_name: result.componentName,
    anomaly_type: result.anomalyType,
    detected_result: result.sampleResult,
    corrected_result: result.proposedCorrection?.correctedResult,
    peer_median: result.medianPeerResult,
    ratio_to_median: result.ratioToMedian,
    correction_applied: true,
    correction_type: result.proposedCorrection?.type,
  },
  confidence: 0.85,
  source: 'convergence_validation',
  decision_source: 'structural_anomaly',
  context: {
    plan_id: ruleSetId,
    component_type: componentType,
    bound_column: columnName,
    value_distribution: distribution,
  }
});
```

**Verify column names against SCHEMA_REFERENCE_LIVE.md before writing.** The classification_signals table has specific columns — do not invent new ones.

### Step 3C: Re-verify with Meridian

After the fix is deployed, the sequence is:
1. Clear input_bindings: `UPDATE rule_sets SET input_bindings = '{}'::jsonb WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';`
2. Trigger SCI execute (re-import or re-convergence)
3. Convergence runs → bindings assembled → validation detects Fleet Utilization anomaly → correction applied → bindings written
4. Calculate → verify grand total ≈ MX$185,063

### Proof Gates — Phase 3

- PG-11: Scale correction applied to binding (paste the corrected binding structure)
- PG-12: Classification signal written (paste INSERT or SELECT verification)
- PG-13: Signal uses correct column names from SCHEMA_REFERENCE_LIVE.md (paste schema check)
- PG-14: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-115 Phase 3: Apply scale correction + classification signal capture" && git push origin dev`

---

## PHASE 4: BUILD + PR + PRODUCTION VERIFICATION

### Step 4A: Build

```bash
rm -rf .next
npm run build
npm run dev
# Confirm localhost:3000 responds
```

### Step 4B: Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-115: Convergence Calculation Validation — Decision 121 Priority 1" \
  --body "## What
Cross-component plausibility check in convergence. Detects scale anomalies where correct bindings produce wrong results due to plan parameter × data value scale mismatches.

## Why  
Meridian Fleet Utilization: rate (800) × utilization (82.9%) = MX\$66,340 per entity instead of ~MX\$663. Correct column bindings, 100x wrong result. The plan interpreter extracted a percentage type with rate=800, but the data values are on ratio scale.

## How
After convergence binds columns to components, a validation pass:
1. Profiles each bound column's value distribution
2. Runs sample calculation per component using median values
3. Compares cross-component results — any > 10x median peers = anomaly
4. Proposes and applies scale correction
5. Captures classification signal for flywheel

## Architecture
Implements DS-009 Section 6 (Convergence Calculation Validation), Decision 121. Domain-agnostic, Korean Test compliant, structural detection."
```

### Step 4C: Post-Merge Production Steps (FOR ANDREW)

1. Merge PR
2. Wait for Vercel deployment
3. Clear bindings: `UPDATE rule_sets SET input_bindings = '{}'::jsonb WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';`
4. Re-trigger import/execute (SCI flow) to run convergence with validation
5. Check Vercel Runtime Logs for `[CONVERGENCE-VALIDATION]` entries
6. Calculate → verify MX$185,063

### Proof Gates — Phase 4

- PG-15: `npm run build` exits 0 (paste output)
- PG-16: localhost:3000 responds (paste confirmation)
- PG-17: PR created (paste URL)
- PG-18: Vercel logs show anomaly detection + correction (FOR ANDREW)
- PG-19: Grand total ≈ MX$185,063 (FOR ANDREW)

**Commit:** `git add -A && git commit -m "HF-115 Phase 4: Build verification + PR" && git push origin dev`

---

## COMPLETION REPORT

Create file `HF-115_COMPLETION_REPORT.md` in PROJECT ROOT with:

```markdown
# HF-115 COMPLETION REPORT
## Convergence Calculation Validation — Decision 121 Priority 1

### Commits
[list all phase commits with hashes]

### Files Changed
[list every file modified]

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1 through PG-19 | | [paste evidence for each] |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | [no hardcoded column names — paste grep] |
| Fix Logic Not Data | [structural detection, not Meridian-specific fix] |
| Scale by Design | [works for any number of components, any value ranges] |
| Signal Capture | [classification_signal written — paste evidence] |

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-18: Anomaly detected in logs | | |
| PG-19: Grand total ≈ MX$185,063 | | |
```

**Commit:** `git add -A && git commit -m "HF-115 Completion Report" && git push origin dev`

---

## WHAT SUCCESS LOOKS LIKE

1. Convergence detects Fleet Utilization as a 331x outlier — without knowing what "fleet utilization" is
2. Scale correction applied: rate × ratio instead of rate × percentage
3. Classification signal captured with full context
4. Grand total ≈ MX$185,063 — first time the full DS-009 pipeline produces the correct benchmark
5. The same detection would catch ANY component with a scale mismatch, in ANY plan, in ANY domain
6. Vercel Runtime Logs show the full detection → correction → result chain

**"Convergence doesn't just connect plan to data. It validates that the connection makes sense."**
