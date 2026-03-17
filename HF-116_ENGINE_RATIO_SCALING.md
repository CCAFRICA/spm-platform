# HF-116: ENGINE RATIO SCALING FIX
## Percentage Component Multiplies Ratio by 100 Before Applying Rate

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `DS-009_Field_Identity_Architecture_20260308.md` — controlling specification

**Read all three before writing any code.**

---

## CONTEXT

The full DS-009 pipeline works in production:
- Import → HC → field identities → AI column mapping → correct convergence bindings (7/7) ✅
- Convergence validation: all 5 components plausible (no anomaly detected) ✅
- Engine uses convergence_bindings path (Decision 111) ✅
- 100% concordance ✅
- **Grand total: MX$3,726,358 instead of MX$185,063** ❌

The problem is isolated to the engine's computation of **Fleet Utilization** (component 4). All other components are correct:

| Component | Payout | Status |
|---|---|---|
| Revenue Performance | MX$1,600 | ✅ Correct (matrix lookup, correct bands) |
| On-Time Delivery | MX$200 | ✅ Correct (tier lookup, correct tier) |
| New Accounts | MX$0 | ✅ Correct (0 × $350) |
| Safety Record | MX$0 | ✅ Correct (0 incidents, gate passes) |
| Fleet Utilization | MX$66,340 | ❌ Should be ~MX$663 |

### The Exact Bug

Fleet Utilization is a ratio component: `Cargas_Flota_Hub / Capacidad_Flota_Hub`. For Claudia:
- Numerator (Cargas_Flota_Hub): 1083
- Denominator (Capacidad_Flota_Hub): 1306
- Correct ratio: 1083 / 1306 = 0.8293
- Plan rate: 800

**What the engine SHOULD compute:** `800 × 0.8293 = 663.4`
**What the engine ACTUALLY computes:** `800 × 82.93 = 66,340`

The engine's component details show:
```json
{
  "rate": 800,
  "baseAmount": 82.92496171516079,
  "calculatedPayout": 66339.96937212863
}
```

`82.925 = 0.8293 × 100`. The engine multiplies the ratio by 100 before applying the rate. This is a percentage conversion that should NOT happen for ratio-based scalar_multiply components where the rate is a fixed payout amount.

### Why Convergence Validation Didn't Catch It

HF-115's sample calculation correctly computed `800 × (1083/1306) = 720` because it used the raw ratio. The engine applies a 100x scaling that the validation doesn't replicate. The validation and engine disagree on how to compute the ratio component.

### What Needs to Be Found

The line of code in the engine that multiplies the ratio by 100. Likely in one of:
- `resolveMetricsFromConvergenceBindings()` at `route.ts:847-858` — where numerator/denominator are resolved
- `evaluatePercentage()` at `run-calculation.ts:234-254` — where rate × base is computed
- `executeScalarMultiply()` at `intent-executor.ts:212-223` — where inputValue × rateValue is computed
- A normalization/scaling step between ratio resolution and payout computation

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

---

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID

| Anti-Pattern | What CC Did Before | What To Do Instead |
|---|---|---|
| Prompt tweaking without code reading (FP-57) | HF-113 tried 3 prompt rewrites | Phase 0 reads engine code FIRST. Paste the ratio computation. |
| SQL debugging loop (FP-45) | Chase query after query | Read the code. The bug is in a specific line, not in the data. |
| Fix data not logic | Adjust scale_factors in bindings | Fix the engine's ratio computation. Bindings are correct. |
| Hardcoded fix for one component | Special-case Fleet Utilization | Fix the percentage conversion logic for ALL ratio components |

---

## PHASE 0: DIAGNOSTIC — FIND THE 100x MULTIPLICATION

**No code changes. Inspection only.**

The bug is precisely located: the engine computes `baseAmount = 82.925` when it should be `0.8293`. Find where the multiplication by 100 happens.

```bash
echo "============================================"
echo "HF-116 PHASE 0: ENGINE RATIO SCALING TRACE"
echo "============================================"

echo ""
echo "=== 1. RATIO RESOLUTION IN CONVERGENCE BINDING PATH ==="
# resolveMetricsFromConvergenceBindings — where numerator/denominator are resolved
grep -n "numerator\|denominator\|ratio\|numValue\|denValue\|scale_factor\|baseAmount\|\* 100\|\/100" \
  web/src/app/api/calculation/run/route.ts | head -30

echo ""
echo "=== 2. PRINT THE FULL RATIO RESOLUTION FUNCTION ==="
# Show the exact code that resolves ratio components
sed -n '830,890p' web/src/app/api/calculation/run/route.ts

echo ""
echo "=== 3. PERCENTAGE EVALUATION ==="
# evaluatePercentage — where rate × base is computed  
grep -n "percentage\|evaluatePercent\|base.*rate\|rate.*base\|\* 100\|percentage.*convert" \
  web/src/lib/calculation/run-calculation.ts | head -20

echo ""
echo "=== 4. PRINT THE PERCENTAGE EVALUATION FUNCTION ==="
sed -n '220,270p' web/src/lib/calculation/run-calculation.ts

echo ""
echo "=== 5. SCALAR MULTIPLY IN INTENT EXECUTOR ==="
grep -n "scalar\|multiply\|inputValue\|rateValue\|\* 100" \
  web/src/lib/calculation/intent-executor.ts | head -20

echo ""
echo "=== 6. PRINT THE SCALAR MULTIPLY FUNCTION ==="
sed -n '200,240p' web/src/lib/calculation/intent-executor.ts

echo ""
echo "=== 7. FIND ALL × 100 MULTIPLICATIONS IN ENGINE ==="
# The smoking gun — where does * 100 appear?
grep -rn "\* 100\|multiply.*100\|scale.*100\|percent.*convert\|toPercent\|asPercent" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 8. FIND HOW baseAmount IS COMPUTED ==="
grep -rn "baseAmount\|base_amount\|baseValue" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 9. TRACE THE FULL COMPONENT 4 CODE PATH ==="
# Fleet Utilization is componentType: "percentage" with appliedTo: "hub_utilization_rate"
# Trace what happens for a percentage component with ratio inputs
grep -rn "hub_util\|utilization\|appliedTo\|percentage.*type\|componentType.*percent" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ --include="*.ts" | head -20
```

### PHASE 0 DELIVERABLE

Write `HF-116_ARCHITECTURE_DECISION.md`:

```
ARCHITECTURE DECISION RECORD
============================
Problem: Engine multiplies ratio by 100 before applying rate in percentage components.

FINDINGS FROM CODE INSPECTION:
1. The × 100 happens at: [file:line — paste the exact code]
2. Why it exists: [what purpose does the × 100 serve? percentage normalization for boundary lookups?]
3. When it's correct: [for tier/matrix lookups where boundaries are 0-100 scale]
4. When it's wrong: [for scalar_multiply where rate × ratio should not be percentage-converted]

THE FIX:
- What: [describe the fix]
- Where: [file:line]
- Impact: [which component types are affected]
- Korean Test: [no field-name references]
- Scale: [works for any ratio component, any plan]

CHOSEN approach: ___
REJECTED approaches: ___
```

**Commit:** `git add -A && git commit -m "HF-116 Phase 0: Engine ratio scaling diagnostic + architecture decision" && git push origin dev`

---

## PHASE 1: FIX THE RATIO SCALING

Based on Phase 0 findings, fix the engine so that:
- Ratio components (numerator/denominator) for **percentage/scalar_multiply** component types use the raw ratio (0-1), NOT the percentage-converted ratio (0-100)
- Ratio components for **tier_lookup/bounded_lookup** component types MAY still need percentage conversion for boundary matching — verify this

### Key Constraint

The fix must be **structural** — it applies to any component type that uses a ratio input with a fixed rate. It must NOT special-case "Fleet Utilization" or any specific component name.

The fix should likely be one of:
- Remove the × 100 from the ratio computation when the component type is percentage/scalar_multiply
- Apply the × 100 only when the component type requires boundary matching (tier_lookup, bounded_lookup_1d, bounded_lookup_2d)
- Use the scale_factor from the convergence binding to control whether percentage conversion happens

### Proof Gates — Phase 1

- PG-1: The × 100 line identified (paste before code)
- PG-2: The fix applied (paste after code)
- PG-3: The fix is conditional on component type, NOT component name (paste the condition)
- PG-4: Boundary-matching components (tier, matrix) still work correctly with percentage scale (explain why)
- PG-5: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-116 Phase 1: Fix engine ratio scaling for percentage components" && git push origin dev`

---

## PHASE 2: VERIFY CALCULATION

### Step 2A: Verify on localhost (if possible)

If the calculation can be triggered locally, run it and check:
- Claudia's Fleet Utilization ≈ MX$663 (not MX$66,340)
- Claudia's total ≈ MX$2,463 (1600 + 200 + 0 + 0 + 663)
- Grand total in the range of MX$185,063

### Step 2B: Verify no regression on other components

After the fix:
- Revenue Performance should still show correct matrix band matching (boundaries use percentage scale)
- On-Time Delivery should still show correct tier matching (boundaries use percentage scale)
- New Accounts should still show correct scalar_multiply (no ratio involved)
- Safety Record should still show correct gate evaluation

### Proof Gates — Phase 2

- PG-6: No regression on boundary-matching components (explain)
- PG-7: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-116 Phase 2: Verify no regression on boundary components" && git push origin dev`

---

## PHASE 3: BUILD + PR + PRODUCTION STEPS

```bash
rm -rf .next
npm run build
npm run dev
# Confirm localhost:3000

gh pr create --base main --head dev \
  --title "HF-116: Fix engine ratio scaling — percentage components use raw ratio" \
  --body "## What
Fix engine to use raw ratio (0-1) instead of percentage-converted ratio (0-100) when computing payout for percentage/scalar_multiply components with ratio inputs.

## Why
Fleet Utilization: rate (800) × ratio (0.829) should = 663. Engine computed rate (800) × percentage (82.9) = 66,340. The × 100 conversion is correct for boundary matching (tier/matrix lookups) but wrong for scalar multiplication.

## Impact
- Fleet Utilization: MX\$66,340 → ~MX\$663 per entity
- Grand total: MX\$3,726,358 → ~MX\$185,063
- No regression on Revenue Performance (matrix) or On-Time Delivery (tier) — these use percentage scale for boundary matching, not for final payout multiplication."
```

### Post-Merge Production Steps (FOR ANDREW)

1. Merge PR
2. Wait for Vercel deployment
3. Navigate to Meridian → Calculate → Run Calculation
4. Verify grand total ≈ MX$185,063
5. Verify Claudia ≈ MX$2,463 (1600 + 200 + 0 + 0 + 663)
6. Verify Revenue Performance and On-Time Delivery unchanged

**No need to clear bindings or re-import.** The bindings are correct. Only the engine computation changes.

### Proof Gates — Phase 3

- PG-8: `npm run build` exits 0 (paste output)
- PG-9: localhost:3000 responds
- PG-10: PR created (paste URL)
- PG-11: Grand total ≈ MX$185,063 (FOR ANDREW — production verification)
- PG-12: Claudia Fleet Utilization ≈ MX$663 (FOR ANDREW)
- PG-13: Revenue Performance unchanged (FOR ANDREW)
- PG-14: On-Time Delivery unchanged (FOR ANDREW)

**Commit:** `git add -A && git commit -m "HF-116 Phase 3: Build + PR" && git push origin dev`

---

## COMPLETION REPORT

Create file `HF-116_COMPLETION_REPORT.md` in PROJECT ROOT:

```markdown
# HF-116 COMPLETION REPORT
## Engine Ratio Scaling Fix

### Commits
[list all phase commits with hashes]

### Files Changed
[list every file modified]

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: × 100 line identified | | [paste before code] |
| PG-2: Fix applied | | [paste after code] |
| PG-3: Conditional on component type | | [paste condition] |
| PG-4: Boundary components still work | | [explain] |
| PG-5: npm run build exits 0 | | [paste] |
| PG-6: No regression | | [explain] |
| PG-7: npm run build exits 0 | | [paste] |
| PG-8: Final build exits 0 | | [paste] |
| PG-9: localhost responds | | [paste] |
| PG-10: PR created | | [paste URL] |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | [no component name references] |
| Fix Logic Not Data | [engine computation fix, not data adjustment] |
| Scale by Design | [applies to all ratio components] |

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-11: Grand total ≈ MX$185,063 | | |
| PG-12: Claudia Fleet ≈ MX$663 | | |
| PG-13: Revenue Performance unchanged | | |
| PG-14: On-Time Delivery unchanged | | |
```

**Commit:** `git add -A && git commit -m "HF-116 Completion Report" && git push origin dev`

---

## WHAT SUCCESS LOOKS LIKE

1. Phase 0 identifies the exact line that multiplies ratio by 100
2. Phase 1 fixes it structurally — percentage/scalar_multiply use raw ratio, boundary lookups keep percentage scale
3. No regression on Revenue Performance or On-Time Delivery
4. Grand total ≈ MX$185,063 — the full DS-009 pipeline produces the correct benchmark
5. Zero hardcoded component names in the fix

**"The pipeline is proven. The bindings are correct. The validation is correct. One engine line turns a 0.83 ratio into an 82.9 percentage. Fix that line."**
