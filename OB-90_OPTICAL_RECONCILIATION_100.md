# OB-90: OPTICAL SALES RECONCILIATION TO 100%
## The Last Delta. One Component. Surgical Fix. Prove It.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

OB-88 proved the engine end-to-end on a clean tenant. The results:

| Component | OB-88 Engine | Ground Truth | Delta |
|-----------|-------------|-------------|-------|
| Store Sales | MX$116,250 | MX$116,250 | **0.0% ✅ EXACT** |
| New Customers | MX$39,100 | MX$39,100 | **0.0% ✅ EXACT** |
| Collections | MX$283,000 | MX$283,000 | **0.0% ✅ EXACT** |
| Insurance | MX$10 | MX$10 | **0.0% ✅ EXACT** |
| Warranty | MX$66,872 | MX$66,872 | **0.0% ✅ EXACT** |
| Optical Sales | MX$783,700 | MX$748,600 | **+4.7% — THE ONLY DELTA** |
| **TOTAL** | **MX$1,288,932** | **MX$1,253,832** | **+2.8%** |

**Five of six components are perfect. The entire platform delta is one component: Optical Sales.**

### Ground Truth Source
- **File:** `CLT14B_Reconciliation_Detail.xlsx` (in project knowledge)
- **Structure:** 719 rows (one per employee), 37 columns
- **Columns of interest for Optical (C1):**
  - Col 1: Employee ID
  - Col 2: Store
  - Col 4: Certified (boolean)
  - Col 5: C1_Att_Exact (achievement % with decimals)
  - Col 7: C1_Rango (column band name — the CORRECT store sales band)
  - Col 8: C1_Row (correct row index 0-4)
  - Col 9: C1_Col (correct column index 0-4)
  - Col 10: C1_Calc (ground truth payout)
  - Col 11: C1_Expected (same as C1_Calc — verified 100% match for all 719)

### The Two Issues Found

**Issue 1: Non-certified matrix value wrong at position [4][3]**
- Engine has: $1,100
- Ground truth has: $2,200
- Affects: 9 non-certified employees at 150%+ achievement in $120K-$180K stores
- Impact: $9,900 underpayment (MASKING the column band overpayment)
- Confirmed by ClearComp's own presentation (page 5 of RetailCo_Results PDF — red box around $2,200 and $600 values)
- Root cause: AI plan interpretation extracted wrong value for this cell

**Issue 2: Store optical sales column metric pushes employees into higher column bands**
- ~100-130 employees land in a higher column band than ground truth
- Each shift adds $300-$700 per employee
- Total overpayment: ~$45,000
- Root cause: How the engine computes the store-level optical sales total differs from how the benchmark computes it
- History: Same bug from OB-85 R6. Reduced from +84% to +4.7% but not eliminated.

### Correct Matrices (from CLT-14B ground truth + ClearComp presentation)

**Certified (Óptica certificado):**
```
                    <$60K   $60-100K  $100-120K  $120-180K  $180K+
<=80.00%              $0       $0         $0       $500     $800
80.00%-89.99%       $200     $300       $500       $800   $1,100
90.00%-99.99%       $300     $500       $800     $1,100   $1,500
100.00%-149.99%     $800   $1,100     $1,500     $1,800   $2,500
>=150.00%         $1,000   $1,300     $1,800     $2,200   $3,000
```

**Non-Certified (Óptica No certificado):**
```
                    <$60K   $60-100K  $100-120K  $120-180K  $180K+
<=80.00%              $0       $0         $0       $250     $400
80.00%-89.99%       $100     $150       $250       $400     $550
90.00%-99.99%       $150     $250       $400       $550     $750
100.00%-149.99%     $400     $550       $750       $600   $1,250
>=150.00%           $500     $650       $900     $2,200   $1,500
```

**Note:** The $600 at non-cert [100-149.99%, $120-180K] is correct per the benchmark — it is NOT a typo. Confirmed by both the CLT-14B file (9 employees × $600 = $5,400) and ClearComp's presentation (highlighted in yellow/red).

### Pipeline Test Co Tenant
- Tenant ID: `dfc1041e-7c39-4657-81e5-40b1cea5680c`
- Created in OB-88 as a clean-room tenant
- Contains: 719 entities, 37,009 committed data rows, 6 components, 2 variants

### ClearComp Validation Employees
These 5 employees were used by ClearComp in their Coppel presentation as test cases. ALL must match exactly after this fix:

| Employee | Component Tested | GT Total |
|----------|-----------------|----------|
| 90118352 | Ventas individuales (=) | $850 |
| 90279605 | Venta tienda (-) | $850 |
| 90035469 | Clientes nuevos (-) | $1,650 |
| 90195508 | Club protección (+) | $27,615 |
| 90203306 | Garantía extendida (tope) | $6,984 |

---

## FIRST PRINCIPLES

1. **FIX LOGIC NOT DATA** — Do not hardcode expected output values. Fix the resolution path so the engine derives correct values from source material.
2. **KOREAN TEST** — Zero hardcoded column names from this dataset.
3. **DO NOT TOUCH 5 WORKING COMPONENTS** — Store Sales, New Customers, Collections, Insurance, and Warranty are EXACT. Do not modify their calculation path. Any change must be scoped exclusively to the Optical Sales component.
4. **THE BENCHMARK FILE IS THE ANSWER KEY** — `CLT14B_Reconciliation_Detail.xlsx` has per-employee correct row/column band assignments. Use this to verify, but fix the LOGIC, not the data.

---

## MISSION 1: DIAGNOSE COLUMN BAND ASSIGNMENT (45 min)

### 1A: Extract engine's current per-employee Optical assignments

Run the calculation on Pipeline Test Co tenant. For each of the 719 employees, extract:
- Employee ID
- Store ID
- Certified/Non-certified
- Achievement % (row metric)
- Store optical sales total (column metric — the VALUE the engine uses for column band assignment)
- Row band assigned (0-4)
- Column band assigned (0-4)
- Payout from matrix

### 1B: Compare against ground truth per-employee

Read `CLT14B_Reconciliation_Detail.xlsx` (copy from /mnt/project/ to /home/claude/ first).

For each of the 719 employees, compare:
- Engine row band vs GT row band (Col 8)
- Engine column band vs GT column band (Col 9)
- Engine payout vs GT payout (Col 10)

### 1C: Identify the mismatched employees

Produce a table of employees where engine column band ≠ GT column band:
- Employee ID, Store ID, Engine store optical sales $, Engine column band, GT column band (C1_Rango), GT column index, Delta in payout

**Expected finding:** ~100-130 employees shifted one column band to the right (higher store sales → higher band → higher payout).

### 1D: Identify the store-level discrepancy

For stores where employees are mismatched:
- What store optical sales total does the engine compute?
- What band does that total fall in?
- What band does the GT say it should be?
- What is the CORRECT store optical sales total that would produce the GT band?

This reveals whether the engine overcounts store sales (includes non-roster staff) or uses a different data source than the benchmark.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Employees with row mismatch counted | Number and list |
| PG-2 | Employees with column mismatch counted | Number and list |
| PG-3 | Stores causing column mismatches identified | Store IDs + engine total vs GT band |
| PG-4 | Root cause of column metric discrepancy stated | Specific: what data source produces correct bands |

**Commit:** `OB-90 Mission 1: Optical column band diagnostic`

---

## MISSION 2: FIX THE MATRIX VALUE (15 min)

### 2A: Locate the non-certified matrix in the plan configuration

Find where the Optical Sales non-certified variant matrix is stored for the Pipeline Test Co tenant. This is in the plan_components or plan_rules table (or equivalent).

### 2B: Fix position [4][3]

The value at row index 4 (>=150%), column index 3 ($120K-$180K) must be $2,200, not $1,100.

**Verify:** Also confirm ALL other matrix values match the correct matrices listed above. There should be exactly ONE mismatch (the [4][3] value).

### 2C: Verify the $600 is correct

Non-cert [3][3] (100-149.99%, $120K-$180K) = $600. This looks anomalous (lower than [3][2] = $750) but IS correct per the benchmark. Do NOT "fix" it.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-5 | Matrix [4][3] value corrected | Database query showing $2,200 |
| PG-6 | All other matrix values verified | 25 certified + 25 non-cert values match reference |
| PG-7 | $600 at [3][3] confirmed correct | Explicitly verified, not "fixed" |

**Commit:** `OB-90 Mission 2: Non-certified matrix value correction`

---

## MISSION 3: FIX THE COLUMN METRIC (60 min)

### 3A: Apply the fix based on Mission 1 findings

Based on Mission 1D, fix the column metric resolution for Optical Sales so that store optical sales totals produce the CORRECT column band for every store.

**Likely scenarios and fixes:**

**Scenario A:** Engine sums ALL Base_Venta_Individual records per store, including non-optometrist employees. Fix: sum only records where the employee is in the 719-entity roster.

**Scenario B:** Engine uses the wrong field — e.g., summing META (quota) instead of actual sales from a store-level sheet. Fix: use the correct field from Base_Venta_Tienda or correct aggregation of Base_Venta_Individual.

**Scenario C:** Engine includes correct employees but a rounding/boundary issue in band assignment (e.g., $60,000 falls in <$60K vs $60-100K). Fix: adjust boundary comparisons (>=60000 vs >60000).

### 3B: DO NOT change row metric

Row metric (individual achievement %) is confirmed working. OB-88 showed: rows 1,2,3 match GT exactly (47, 48, 386). Rows 0 and 4 have an 8-employee shift which may resolve once column metric is fixed (different store context changes achievement calculation). Do NOT touch row metric resolution.

### 3C: DO NOT change any other component

This fix MUST be scoped to the Optical Sales column metric resolution ONLY. If the fix is in a shared function (like buildMetricsForComponent), ensure the change only affects the Optical column metric path.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-8 | Column metric fix applied | Code diff showing change |
| PG-9 | Fix is Optical-scoped only | No changes to other component paths |
| PG-10 | Korean Test passes | No hardcoded column names in fix |

**Commit:** `OB-90 Mission 3: Optical column metric resolution fix`

---

## MISSION 4: FULL RECONCILIATION — PROVE 100% (30 min)

### 4A: Recalculate on Pipeline Test Co

Run the full calculation pipeline on the clean tenant with both fixes applied.

### 4B: Component-level comparison

| Component | Engine | Ground Truth | Delta | Status |
|-----------|--------|-------------|-------|--------|
| Optical Sales | MX$??? | MX$748,600 | ???% | Must be 0.0% |
| Store Sales | MX$??? | MX$116,250 | ???% | Must remain 0.0% |
| New Customers | MX$??? | MX$39,100 | ???% | Must remain 0.0% |
| Collections | MX$??? | MX$283,000 | ???% | Must remain 0.0% |
| Insurance | MX$??? | MX$10 | ???% | Must remain 0.0% |
| Warranty | MX$??? | MX$66,872 | ???% | Must remain 0.0% |
| **TOTAL** | **MX$???** | **MX$1,253,832** | ???% | Must be 0.0% |

### 4C: Per-employee spot check

Verify the 5 ClearComp test employees:

| Employee | GT Total | Engine Total | Match? |
|----------|----------|-------------|--------|
| 90118352 | $850 | ??? | |
| 90279605 | $850 | ??? | |
| 90035469 | $1,650 | ??? | |
| 90195508 | $27,615 | ??? | |
| 90203306 | $6,984 | ??? | |

### 4D: Per-employee full reconciliation on Optical

Compare engine Optical payout vs GT Optical payout (Col 10) for ALL 719 employees.
Report: number of exact matches, number with delta, total delta.

Target: 719/719 exact match, $0 total delta.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-11 | Optical Sales = MX$748,600 (±$0) | Exact match |
| PG-12 | Store Sales = MX$116,250 (unchanged) | Exact match |
| PG-13 | New Customers = MX$39,100 (unchanged) | Exact match |
| PG-14 | Collections = MX$283,000 (unchanged) | Exact match |
| PG-15 | Insurance = MX$10 (unchanged) | Exact match |
| PG-16 | Warranty = MX$66,872 (unchanged) | Exact match |
| PG-17 | **TOTAL = MX$1,253,832 (0.0% delta)** | **EXACT MATCH** |
| PG-18 | ClearComp employee 90118352 = $850 | Exact match |
| PG-19 | ClearComp employee 90279605 = $850 | Exact match |
| PG-20 | ClearComp employee 90035469 = $1,650 | Exact match |
| PG-21 | ClearComp employee 90195508 = $27,615 | Exact match |
| PG-22 | ClearComp employee 90203306 = $6,984 | Exact match |

**Commit:** `OB-90 Mission 4: Full reconciliation — 100% accuracy proven`

---

## MISSION 5: COMPLETION REPORT AND PR (15 min)

### 5A: Write OB-90_COMPLETION_REPORT.md

Include:
1. Before/after component table
2. Two fixes applied (matrix value + column metric)
3. Per-employee reconciliation summary (719/719 match)
4. ClearComp test employee verification
5. All 22 proof gates with PASS/FAIL

### 5B: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-90: Optical Sales Reconciliation — 100% Engine Accuracy" \
  --body "## The Final Delta

### Before (OB-88)
- 5/6 components: 0.0% delta
- Optical Sales: +4.7% (MX\$783,700 vs MX\$748,600)
- Total: +2.8%

### After (OB-90)
- 6/6 components: 0.0% delta
- Optical Sales: 0.0% (MX\$748,600 = MX\$748,600)
- Total: 0.0% (MX\$1,253,832 = MX\$1,253,832)

### Fixes
1. Non-cert matrix [4][3]: \$1,100 → \$2,200 (plan interpretation error)
2. Column metric resolution: [describe fix]

### Proof
- 719/719 employees match ground truth
- 6/6 components at 0.0% delta
- 5/5 ClearComp test employees exact match
- 22/22 proof gates PASS

## See OB-90_COMPLETION_REPORT.md"
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-22 | Completion report written | File exists with all sections |
| PG-23 | PR created | URL pasted |
| PG-24 | `npm run build` exits 0 | Clean build |
| PG-25 | localhost:3000 responds | HTTP 200 |

---

## WHAT SUCCESS LOOKS LIKE

```
VIALUCE ENGINE ACCURACY — OB-90 FINAL
======================================
Component        Engine        Ground Truth  Delta
─────────────────────────────────────────────────
Optical Sales    MX$748,600    MX$748,600    0.0% ✅
Store Sales      MX$116,250    MX$116,250    0.0% ✅
New Customers    MX$39,100     MX$39,100     0.0% ✅
Collections      MX$283,000    MX$283,000    0.0% ✅
Insurance        MX$10         MX$10         0.0% ✅
Warranty         MX$66,872     MX$66,872     0.0% ✅
─────────────────────────────────────────────────
TOTAL            MX$1,253,832  MX$1,253,832  0.0% ✅

Engine accuracy: 100.0%
Employees matched: 719/719
Components at 0.0%: 6/6
```

**This is the singular proof point around which confidence in the platform is built.**

---

*OB-90 — February 24, 2026*
*"Five were perfect. Now all six."*
