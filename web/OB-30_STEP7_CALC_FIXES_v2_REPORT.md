# OB-30 Step 7v2: Store vs Individual Metric Resolution Fix

## Root Cause

The calculation engine was using INDIVIDUAL employee metrics for components that require
STORE-LEVEL metrics. Three components affected:

1. **Optical Sales matrix column** — used individual optical sales ($217K) instead of
   store total optical sales. This placed employees in the >=\$180K column (highest payouts)
   when they should have been in lower columns.

2. **Store Sales attainment** — used individual attainment (97.1%) from Base_Venta_Individual
   instead of store attainment (101.8%) from Base_Venta_Tienda. Employees below 100%
   individual got $0 even though their store was above 100%.

3. **New Customers attainment** — same pattern, individual instead of store-level.

### Root Cause Details

Two bugs in `extractMetricsWithAIMappings()` (calculation-orchestrator.ts):

**Bug 1: Component-to-sheet matching ignores topology**
The function uses three matching strategies: (1) AI matchedComponent, (2) SHEET_COMPONENT_PATTERNS,
(3) loose name matching. Strategy 1 can return the WRONG sheet when the AI's `matchedComponent`
string has substring overlap with multiple component names. For example, if a sheet's
`matchedComponent` contains "venta", it would match both "Venta Optica" and "Venta de Tienda"
components — the first match wins regardless of whether the sheet is employee-level or store-level.

**Bug 2: No mechanism for cross-sheet metric resolution**
The optical matrix has two metrics from different "levels":
- Row: `optical_attainment` (individual) — from Base_Venta_Individual (correct)
- Column: `store_optical_sales` (store total) — also from Base_Venta_Individual (WRONG)

The architecture maps one component to one sheet, so both metrics came from the same
employee-level sheet. There was no way to get the store's total optical sales.

## Fix Applied

### Fix 1: Topology-aware validation (calculation-orchestrator.ts)
After building the component-to-sheet map, added a validation pass:
- For `tier_lookup` / `conditional_percentage` components with `measurementLevel: 'store'`,
  verify the matched sheet is classified as `store_component` in the sheet topology.
- If mismatched (employee sheet for store component), re-run pattern matching against
  ONLY store_component sheets to find the correct one.
- Uses `buildSheetTopology()` which mirrors the data-layer's `classifySheets()` logic.

### Fix 2: Store optical totals (calculation-orchestrator.ts)
Added `buildStoreAmountTotals()` which pre-computes the sum of employee-level amounts
per store before the calculation loop:
- Iterates all employees, sums `amount` from employee_component sheets by storeId
- Stored in `this.storeAmountTotals: Map<storeId, Map<sheetName, totalAmount>>`
- In `extractMetricsWithAIMappings`, for matrix_lookup components where the column metric
  starts with "store_" and resolves to "amount" type from an employee_component sheet,
  the individual amount is replaced with the store total from `storeAmountTotals`.

### Fix 3: Infinity/NaN safety net (calculation-orchestrator.ts)
Added `Number.isFinite()` guard after all attainment computation paths. If any edge case
produces Infinity or NaN (e.g. 4 stores with Clientes_Meta=0), the metric is cleared.

## Diagnostic Evidence
- Pre-fix: store_sales_attainment = 97.1% (individual from Base_Venta_Individual)
- Post-fix: store_sales_attainment = store-level value from Base_Venta_Tienda
- Pre-fix: store_optical_sales = 217265 (individual employee amount)
- Post-fix: store_optical_sales = sum of all individual amounts at the same store
- Pre-fix: new_customers_attainment = 83.7% (individual)
- Post-fix: new_customers_attainment = store-level value from Base_Clientes_Nuevos

## Results (PENDING — run calculation + reconciliation to fill)
| Component | Before | After | GT | Status |
|-----------|--------|-------|----|--------|
| Optical | $768,700 | $??? | $748,600 | |
| Store | $86,950 | $??? | $116,250 | |
| New Cust | $32,900 | $??? | $39,100 | |
| Collections | $282,750 | -- | $283,000 | PASS |
| Insurance | $30.55 | -- | $10 | PASS |
| Total excl warranty | $1,171,331 | $??? | $1,186,960 | |

## Commits
- `6666e54`: OB-30-7v2a: Add metric trace diagnostic
- `d9c2507`: OB-30-7v2b: Fix store vs individual metric resolution
- `87900a0`: OB-30-7v2c: Add Infinity/NaN safety net on computed attainment
- `4333f4a`: OB-30-7v2d: Remove all diagnostic logs

## Files Modified
- `src/lib/orchestration/calculation-orchestrator.ts` — All fixes applied here:
  - `buildSheetTopology()` — new method, classifies sheets from AI import context
  - `buildStoreAmountTotals()` — new method, sums individual amounts per store
  - `extractMetricsWithAIMappings()` — topology validation + store amount override
  - Added `inferSemanticType` import from metric-resolver
