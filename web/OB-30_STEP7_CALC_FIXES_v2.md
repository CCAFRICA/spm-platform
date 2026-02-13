# OB-30 STEP 7v2: CALCULATION ACCURACY — STORE vs INDIVIDUAL METRIC FIX
## February 12, 2026
## PRIOR FIX ATTEMPT FAILED — Store-level override had zero effect on results

NEVER ask yes/no. NEVER say "shall I". JUST ACT. Execute all phases without stopping.

---

## STANDING RULES

Read /CLEARCOMP_STANDING_PRINCIPLES.md. All rules apply.
Read /CC_DIAGNOSTIC_PROTOCOL.md. All rules apply.

### CC OPERATIONAL RULES (non-negotiable)
1. After ANY code change: `pkill -f "next dev" || true && rm -rf .next && npm run build && npm run dev`
2. After EVERY build: grep compiled .next output to verify change is present
3. Git commit messages: ASCII only
4. Commit + push after EACH fix

### ANTI-PATTERNS FROM PRIOR ATTEMPTS (DO NOT REPEAT)
- DO NOT modify data aggregation at import time — it had zero effect
- DO NOT add store-level overrides that don't reach the execution path
- DO NOT fix code that is NOT in the active execution path
- Before ANY fix: add a diagnostic log, rebuild, verify the log appears in console output
- If a diagnostic log does NOT appear, your code change is not in the execution path. STOP and find the right path.

### STANDING PRINCIPLE 2: FIX LOGIC, NOT DATA
Ground truth values are provided for DIAGNOSTIC comparison only. Never reverse-engineer answers.

---

## THE ROOT CAUSE (from CLT14B analysis + METRICS-DUMP evidence)

### CRITICAL FINDING: The engine is using INDIVIDUAL employee metrics where it should use STORE-LEVEL metrics.

Evidence from METRICS-DUMP for employee 90198149:
```
store_optical_sales: 217265    ← This is the INDIVIDUAL employee's optical sales
store_sales_attainment: 97.11% ← This is INDIVIDUAL attainment (amount/goal = 217265/159960)
```

But per CLT14B analysis and the commission plan:
- **Optical matrix column axis** = total optical sales of the STORE (not individual)
- **Store Sales attainment** = STORE-level attainment (store actual / store goal)
- **New Customers attainment** = STORE-level attainment (store actual / store goal)

### Data Topology (from CLT14B):
| Sheet | Key Type | What It Contains |
|-------|----------|-----------------|
| Base_Venta_Individual | employeeId | Individual employee optical sales + goal |
| Base_Venta_Tienda | storeId | **STORE** total sales + goal (shared by all employees at store) |
| Base_Clientes_Nuevos | storeId | **STORE** new customer count + goal (shared by all employees at store) |
| Base_Cobranza | storeId | **STORE** collections amount + goal (shared by all employees at store) |

### The Three Gaps Explained:

**1. Optical (+$20,100):** Matrix column uses `store_optical_sales` = 217265 (INDIVIDUAL). 
   - 217265 > 180000 → lands in ≥$180K column → highest payout tier
   - Should use STORE total optical sales (sum of all employees at the store)
   - If store total is e.g. $100K-$120K, employee would land in a LOWER column → lower payout
   - This explains why VL OVER-calculates optical for many employees

**2. Store Sales (-$29,300):** Uses individual attainment (97.1%) instead of store attainment.
   - GT expected store_sales_attainment = 101.8% (store-level)
   - VL computed = 97.1% (individual-level from Base_Venta_Individual)
   - 97.1% < 100% → $0 payout. But store-level 101.8% ≥ 100% → $150
   - This explains why VL UNDER-calculates store sales for many employees

**3. New Customers (-$6,200):** Same pattern — using individual-level data instead of store-level.
   - Employee 90198149: new_customer_attainment = 83.7% (individual)
   - But New Customers is a STORE-LEVEL component — should use Base_Clientes_Nuevos store attainment
   - 83.7% < 100% → $0. If store attainment was ≥100% → $150+

---

## PHASE 1: DIAGNOSTIC — TRACE THE METRIC RESOLUTION PATH (15 minutes)

### DO NOT WRITE ANY FIXES IN THIS PHASE. READ-ONLY.

### 1A: Find where metrics are assembled for the calculation engine

```bash
echo "=== WHERE ARE aiMetrics BUILT? ==="
grep -n "aiMetrics\|optical_attainment\|store_sales_attainment\|store_optical_sales" \
  src/lib/orchestration/calculation-orchestrator.ts | head -30

echo ""
echo "=== WHERE DOES THE ENGINE READ THESE METRICS? ==="
grep -n "optical_attainment\|store_sales_attainment\|store_optical_sales\|new_customer" \
  src/lib/compensation/calculation-engine.ts | head -30
```

### 1B: Find how componentMetrics maps sheets to metric names

```bash
echo "=== HOW componentMetrics IS BUILT ==="
grep -n -B5 -A15 "componentMetrics\|buildMetrics\|metricsFrom\|sheetMetrics" \
  src/lib/orchestration/calculation-orchestrator.ts | head -60

echo ""
echo "=== WHAT FIELD NAMES ARE USED FOR STORE vs INDIVIDUAL ==="
grep -n "store_sales\|store_optical\|venta_tienda\|venta_individual\|tienda\|individual" \
  src/lib/orchestration/calculation-orchestrator.ts | head -20
```

### 1C: Find the metric resolution — how does the engine decide which sheet feeds which component?

```bash
echo "=== METRIC RESOLUTION / COMPONENT-TO-SHEET MAPPING ==="
grep -n -B3 -A10 "resolveMetric\|metricKey\|metricName\|componentMetric\|lookupMetric" \
  src/lib/orchestration/calculation-orchestrator.ts src/lib/compensation/calculation-engine.ts \
  | head -60
```

### 1D: Find the data topology classification

```bash
echo "=== TOPOLOGY / SHEET TYPE / STORE-LEVEL vs EMPLOYEE-LEVEL ==="
grep -n "topology\|store_component\|employee_component\|sheetType\|dataLevel\|storeLevel\|employeeLevel" \
  src/lib/orchestration/calculation-orchestrator.ts src/lib/data/ \
  --include="*.ts" | head -20
```

### 1E: Read the actual metric assembly code

Based on findings from 1A-1D, read the EXACT function that builds the aiMetrics object:

```bash
# Replace LINE_NUMBER with what you found in 1A
sed -n 'LINE_NUMBER,+80p' src/lib/orchestration/calculation-orchestrator.ts
```

### CHECKPOINT: Before proceeding, answer these questions in a comment block:

```
// DIAGNOSTIC FINDINGS:
// Q1: What function builds aiMetrics? File:line?
// Q2: For store_sales_attainment — which sheet does it come from?
//     Expected: Base_Venta_Tienda. Actual: ___?
// Q3: For store_optical_sales — which sheet does it come from?
//     Expected: STORE-LEVEL sum. Actual: ___?
// Q4: For new_customer_attainment — which sheet does it come from?
//     Expected: Base_Clientes_Nuevos. Actual: ___?
// Q5: Is there a topology/type classification on sheets? If so, what?
// Q6: When multiple sheets exist for an employee, how does the engine
//     decide which sheet's attainment feeds which component?
```

---

## PHASE 2: ADD TARGETED DIAGNOSTIC LOG (5 minutes)

Add ONE diagnostic log for employee 90198149 that shows EXACTLY what value each sheet contributes and which metric name it maps to:

```typescript
// Add at the point where aiMetrics is assembled
if (employeeId === '90198149' || employeeId?.includes('90198149')) {
  console.log('[METRIC-TRACE] Building aiMetrics for 90198149');
  console.log('[METRIC-TRACE] Sheets available:', Object.keys(componentMetrics));
  for (const [sheetName, sheetData] of Object.entries(componentMetrics)) {
    console.log(`[METRIC-TRACE] Sheet "${sheetName}":`, {
      attainment: sheetData.attainment,
      amount: sheetData.amount,
      goal: sheetData.goal,
      rawFields: sheetData.rawFields || sheetData.fields || 'none'
    });
  }
  console.log('[METRIC-TRACE] FINAL aiMetrics:', JSON.stringify(aiMetrics, null, 2));
}
```

### BUILD AND VERIFY:
```bash
pkill -f "next dev" || true && rm -rf .next && npm run build && npm run dev
```

Wait for build. Then:
```bash
# Verify the diagnostic is in the compiled output
grep -c "METRIC-TRACE" .next/server/chunks/*.js 2>/dev/null || grep -c "METRIC-TRACE" .next/server/*.js 2>/dev/null
```

If grep returns 0, the code is NOT in the execution path. Find the right file.

### DO NOT PROCEED TO PHASE 3 UNTIL THE DIAGNOSTIC IS CONFIRMED IN COMPILED OUTPUT.

Tell Andrew: "Diagnostic ready. Run calculation and look for [METRIC-TRACE] in console."

### Commit: `OB-30-7v2a: Add metric trace diagnostic`

---

## PHASE 3: FIX METRIC RESOLUTION (20 minutes)

### ONLY proceed after Andrew confirms the diagnostic output.

Based on diagnostic findings, the fix must ensure:

### 3A: Store Sales (store_sales_attainment) must come from Base_Venta_Tienda

The store sales component uses STORE-LEVEL attainment. The Base_Venta_Tienda sheet is keyed by storeId and contains:
- `Meta_Venta_Tienda` (store goal)
- `Venta_Tienda` or similar (store actual sales)
- Attainment = actual / goal (should be ~101.8% for employee 90198149's store)

Currently the engine uses 97.1% which comes from Base_Venta_Individual (individual attainment).

**Fix approach:**
When assembling `store_sales_attainment`, the engine must:
1. Look for a sheet classified as store-level sales (Base_Venta_Tienda)
2. Find the record matching the employee's storeId (from roster)
3. Use THAT sheet's attainment, not the individual sheet's

### 3B: Optical matrix column (store_optical_sales) must be store-level total

The optical matrix's COLUMN axis is the store's total optical sales volume. This is NOT the individual employee's sales.

**How to derive store_optical_sales correctly:**
- Option A: Sum all Base_Venta_Individual amounts for employees at the same store
- Option B: Use a dedicated store-level field if present in Base_Venta_Tienda
- Option C: Use the `suma nivel tienda` field if present in the data

From CLT14B analysis: "suma nivel tienda" = sum of Meta_Individual at the store level. 
BUT the column axis needs ACTUAL store optical sales, not the goal sum.

Check what fields exist in Base_Venta_Tienda that represent store total optical sales.

```bash
echo "=== CHECK BASE_VENTA_TIENDA FIELDS IN COMMITTED DATA ==="
grep -n "Venta_Tienda\|venta_tienda\|optical\|optica\|Meta_Venta" \
  src/lib/orchestration/calculation-orchestrator.ts | head -15
```

### 3C: New Customers (new_customer_attainment) must come from Base_Clientes_Nuevos

Same pattern as store sales. The new customer attainment should come from the store-level sheet (Base_Clientes_Nuevos), not any individual sheet.

### 3D: Implement the fix

The fix likely needs to happen in the metric resolution function that builds aiMetrics. The logic should be:

```
For each component in the plan:
  1. Identify which DATA SHEET feeds this component
  2. If the sheet is STORE-LEVEL (keyed by storeId):
     a. Find the employee's storeId from roster
     b. Look up the store's record in that sheet
     c. Use the STORE's attainment/amount/goal
  3. If the sheet is EMPLOYEE-LEVEL (keyed by employeeId):
     a. Use the employee's own record
```

The key question: How does the engine currently know which sheet is store-level vs employee-level?

From the METRICS-DUMP, there are 4 sheets: Base_Venta_Individual, Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza.

- Base_Venta_Individual → EMPLOYEE-LEVEL (keyed by num_empleado)
- Base_Venta_Tienda → STORE-LEVEL (keyed by clave_tienda)
- Base_Clientes_Nuevos → STORE-LEVEL (keyed by clave_tienda)
- Base_Cobranza → STORE-LEVEL (keyed by clave_tienda)

If the engine already classifies these correctly but still uses individual metrics, the bug is in HOW the attainment flows from the classified sheet to the metric name.

If the engine does NOT classify them, it's treating all sheets the same and just assigning the first match — which would be Base_Venta_Individual for optical/store metrics.

### FIX VALIDATION:

After implementing, add a validation log for employee 90198149:

```typescript
if (employeeId === '90198149' || employeeId?.includes('90198149')) {
  console.log('[FIX-VERIFY] store_sales_attainment:', aiMetrics.store_sales_attainment, 
    '(should be ~101.8, was 97.1)');
  console.log('[FIX-VERIFY] store_optical_sales:', aiMetrics.store_optical_sales,
    '(should be store total $60K-$180K range, was 217265)');
  console.log('[FIX-VERIFY] new_customer_attainment:', aiMetrics.new_customer_attainment,
    '(should come from Base_Clientes_Nuevos store record)');
}
```

### Build and verify:
```bash
pkill -f "next dev" || true && rm -rf .next && npm run build && npm run dev
grep -c "FIX-VERIFY" .next/server/chunks/*.js 2>/dev/null || echo "NOT IN COMPILED OUTPUT"
```

### Commit: `OB-30-7v2b: Fix store vs individual metric resolution`

Tell Andrew: "Fix applied. Run calculation and check [FIX-VERIFY] values, then run reconciliation script."

---

## PHASE 4: HANDLE DIVISION-BY-ZERO (5 minutes)

From CLT14B Finding 2: 4 stores have Clientes_Meta = 0 (no customer goal).

```bash
echo "=== CHECK FOR DIVISION-BY-ZERO GUARDS ==="
grep -n "goal.*===.*0\|goal.*==.*0\|denominator.*0\|divideByZero\|divBy\|Infinity\|isFinite\|NaN" \
  src/lib/compensation/calculation-engine.ts src/lib/orchestration/calculation-orchestrator.ts \
  | head -15
```

If no guard exists, add one everywhere attainment is calculated:

```typescript
// Before: const attainment = amount / goal;
// After:
const attainment = (goal === 0 || goal === undefined) ? 0 : (amount / goal);
```

Rule: If goal = 0, attainment = 0, component pays $0. This is "not measured" — not "infinite attainment".

### Commit: `OB-30-7v2c: Add division-by-zero guard on attainment`

---

## PHASE 5: CLEANUP (5 minutes)

1. Remove ALL diagnostic logs:
```bash
grep -rn "METRIC-TRACE\|FIX-VERIFY\|METRICS-DUMP" src/ --include="*.ts" --include="*.tsx"
```
Remove every hit. Verify:
```bash
grep -c "METRIC-TRACE\|FIX-VERIFY\|METRICS-DUMP" src/lib/orchestration/calculation-orchestrator.ts
# Must return 0
```

2. Rebuild:
```bash
pkill -f "next dev" || true && rm -rf .next && npm run build && npm run dev
```

3. Verify build succeeds (exit 0)

### Commit: `OB-30-7v2d: Remove all diagnostic logs`

Tell Andrew: "Clean build ready. Run final calculation + reconciliation."

---

## PHASE 6: COMPLETION REPORT

Save as `OB-30_STEP7_CALC_FIXES_v2_REPORT.md` in project root:

```markdown
# OB-30 Step 7v2: Store vs Individual Metric Resolution Fix

## Root Cause
The calculation engine was using INDIVIDUAL employee metrics for components that require 
STORE-LEVEL metrics. Three components affected:

1. **Optical Sales matrix column** — used individual optical sales ($217K) instead of 
   store total optical sales. This placed employees in the ≥$180K column (highest payouts)
   when they should have been in lower columns.

2. **Store Sales attainment** — used individual attainment (97.1%) from Base_Venta_Individual
   instead of store attainment (101.8%) from Base_Venta_Tienda. Employees below 100% 
   individual got $0 even though their store was above 100%.

3. **New Customers attainment** — same pattern, individual instead of store-level.

## Fix Applied
[Describe the actual code change — what function, what logic]

## Diagnostic Evidence
- Pre-fix: store_sales_attainment = 97.1% (individual)
- Post-fix: store_sales_attainment = [actual value] (store-level)
- Pre-fix: store_optical_sales = 217265 (individual)
- Post-fix: store_optical_sales = [actual value] (store total)

## Results
| Component | Before | After | GT | Status |
|-----------|--------|-------|----|--------|
| Optical | $768,700 | $??? | $748,600 | |
| Store | $86,950 | $??? | $116,250 | |
| New Cust | $32,900 | $??? | $39,100 | |
| Collections | $282,750 | — | $283,000 | PASS |
| Insurance | $30.55 | — | $10 | PASS |
| Total excl warranty | $1,171,331 | $??? | $1,186,960 | |

## Commits
- [hash]: Diagnostic trace
- [hash]: Store metric resolution fix
- [hash]: Division-by-zero guard
- [hash]: Cleanup
```

---

## EXPECTED POST-FIX RESULTS

If the fix works correctly:
- **Optical:** Should decrease from $768,700 toward $748,600 (employees will land in lower matrix columns)
- **Store Sales:** Should increase from $86,950 toward $116,250 (store attainment > 100% for many stores)
- **New Customers:** Should increase from $32,900 toward $39,100 (store attainment > 100% for some stores)
- **Total excl warranty:** Should be within ±$5,000 of $1,186,960

## TOTAL EXPECTED DURATION: 50 MINUTES

| Phase | Task | Minutes |
|-------|------|---------|
| 1 | Diagnostic — trace metric resolution path | 15 |
| 2 | Add targeted diagnostic log | 5 |
| 3 | Fix metric resolution (after Andrew confirms diagnostic) | 20 |
| 4 | Division-by-zero guard | 5 |
| 5 | Cleanup | 5 |
| 6 | Report | 5 |

**CRITICAL:** Phase 3 REQUIRES Andrew to run calculation between Phase 2 and Phase 3. 
Tell Andrew when diagnostic is ready. Wait for his confirmation before proceeding.
If you cannot wait (OB mode), proceed with Phase 3 based on Phase 1 diagnostic findings.
