# OB-30 Step 8: Failure Analysis — Why 5 Consecutive Fixes Had Zero Effect

## Executive Summary

Five consecutive fixes to `data-layer-service.ts` produced **identical calculation results** every run. The data flow trace reveals the write path is confirmed correct — `storeAggregatedData()` writes to localStorage, and the orchestrator reads from that same key. However, there is a critical finding that may explain the zero-effect observation, plus several alternative hypotheses.

---

## 1. Every Fix Attempted and Why Each Had Zero Effect

### Fix 1: OB-30-8a (commit `4961240`)
**What**: Added `[AGG-DIAG-90198149]` diagnostic at the store join point (STEP 4).
**Expected**: Diagnostic-only, no behavior change.
**Result**: Correctly showed `amount: 64402612` — confirmed the bug exists.

### Fix 2: OB-30-8b (commit `775771b`)
**What**: Added `[AGG-DIAG-TIENDA]` tracking for storeId grouping in STEP 3.
**Expected**: Diagnostic-only.
**Result**: Showed 1,779 unique storeIds, 3 records for store 1008 — storeId grouping is correct.

### Fix 3: OB-30-8c (commit `db10841`)
**What**: Added per-record merge trace for store 1008 Base_Venta_Tienda.
**Expected**: Diagnostic-only.
**Result**: Confirmed 3 records for 3 different periods (Jan/Feb/Mar), each ~22M, mergeMetrics summing to 64M.

### Fix 4: OB-30-8d (commit `73ea3f2`) — THE ACTUAL FIX
**What**: Removed HF-017 period-agnostic fallback in STEP 3. Added prefix-scan fallback in STEP 4.
**Expected**: Store 1008 should now get only January's data (22M) instead of all-months sum (64M).
**Result**: **ZERO EFFECT** — identical numbers.

### Possible reasons the fix had zero effect:
1. **The fix is correct but the code path isn't executing** — the `storeAggregatedData()` function runs during import commit, and it does overwrite localStorage. But something else may be providing the data.
2. **The aggregated data is stale from a previous build** — if the user is NOT doing a full re-import after the fix, the old aggregated data persists. However, the user reports doing Nuclear Clear → Import → Calculate.
3. **The client-side code is cached** — Next.js may serve a cached version of the data-layer-service, meaning the old HF-017 code still runs. `.next` was cleaned and rebuilt, so this is unlikely.
4. **There's a second write path** — another function may also write to the aggregated key.

---

## 2. The Critical Question: WHERE Does the Orchestrator Read Its Input?

### Complete Data Flow Trace

```
WRITE PATH (during import commit):
  commitSheetData()                          [data-layer-service.ts:2200]
    → storeAggregatedData()                  [data-layer-service.ts:680]
      → STEP 3: builds empComponentMetrics + storeComponentMetrics   [line 1174-1278]
      → STEP 4: joins employee + store metrics into enriched records [line 1350-1430]
      → Writes to localStorage:
        KEY: "data_layer_committed_aggregated_{tenantId}"            [line 1494-1495]
        localStorage.setItem(storageKey, dataToStore)

READ PATH (during calculation):
  calculateCompensation()                    [calculation-orchestrator.ts:185]
    → getEmployees()                         [line 1356]
      → PRIORITY 0: loadAggregatedEmployees() [line 1395]
        → KEY: "data_layer_committed_aggregated_{tenantId}"          [line 1396]
        → localStorage.getItem(storageKey)
        → Maps to EmployeeData with attributes.componentMetrics     [line 1432-1433]
      → PRIORITY 1: extractEmployeesFromCommittedData()             [line 1367]
      → PRIORITY 2: Stored employee data                            [line 1373]
    → buildSheetTopology()                   [line 215]
    → buildStoreAmountTotals(employees)      [line 216]
    → for each employee:
      → calculateForEmployee()               [line 228]
        → getEmployeeMetrics()               [line 585]
          → PRIORITY 0: extractMetricsWithAIMappings(employee)      [line 587]
            → reads employee.attributes.componentMetrics             [line 671]
            → builds componentSheetMap                               [line 684-727]
            → topology validation                                    [line 729-768]
            → resolves attainment/amount/goal per component          [line 770-863]
```

### Answer: YES, the orchestrator reads from what storeAggregatedData() writes

- **Write key**: `data_layer_committed_aggregated_{tenantId}` (line 1494)
- **Read key**: `data_layer_committed_aggregated_{tenantId}` (line 1396)
- **Same key, same format.** `localStorage.setItem` overwrites, so each import SHOULD produce fresh data.

### The data structure passed through:

```
storeAggregatedData() builds:
  enriched.componentMetrics = {
    "Base_Venta_Tienda": { attainment: 101.80, amount: 22000000, goal: 21600000 },
    "Base_Venta_Individual": { attainment: 97.11, amount: 5200000, goal: 5350000 },
    ...
  }

loadAggregatedEmployees() reads:
  employee.attributes.componentMetrics = record.componentMetrics  (line 1433)

extractMetricsWithAIMappings() uses:
  componentMetrics[matchedSheet].attainment  (line 790)
  componentMetrics[matchedSheet].amount      (line 791)
  componentMetrics[matchedSheet].goal        (line 792)
```

---

## 3. Critical Findings

### Finding A: Nuclear Cleanup PRESERVES Aggregated Data

In `commitSheetData()` (line 2343-2351):
```typescript
// NUCLEAR CLEANUP: Remove ALL data_layer keys except batches and current aggregated
if (key && key.startsWith('data_layer_') &&
    !key.startsWith('data_layer_batches') &&
    !key.includes('_aggregated_')) {  // ← SKIPS AGGREGATED!
  keysToRemove.push(key);
}
```

The nuclear cleanup explicitly PRESERVES `_aggregated_` keys. However, this shouldn't matter because `storeAggregatedData()` overwrites the key with `localStorage.setItem()` on every import.

### Finding B: The Re-Import DOES Run storeAggregatedData()

The call chain is:
```
commitSheetData() → line 2376: storeAggregatedData(tenantId, batchId, allCommittedRecords)
```

Every time the user commits imported data, `storeAggregatedData()` runs and overwrites localStorage. So the fix SHOULD take effect.

### Finding C: buildStoreAmountTotals — A SECOND Aggregation Path

The orchestrator has its OWN aggregation in `buildStoreAmountTotals()` (line 874):
```typescript
for (const emp of employees) {
  for (const [sheetName, sheetData] of Object.entries(componentMetrics)) {
    if (topology === 'store_component') continue;  // skip store sheets
    sheetMap.set(sheetName, (sheetMap.get(sheetName) || 0) + amount);
  }
}
```

This sums `amount` from ALL employee-level sheets by storeId. It's used ONLY for the Optical Sales matrix column (`store_optical_sales`). It iterates ALL employees (including ALL periods), so the total includes Jan+Feb+Mar amounts. **But this only affects the `store_optical_sales` metric, not `store_sales_attainment` or `new_customers_attainment`.**

### Finding D: Three Employees Per Person (Multi-Period)

Each real person appears 3 times in the aggregated data — once for January, once for February, once for March. The orchestrator processes ALL of them. It has NO period filter:
```typescript
for (const employee of employees) {  // ALL employees, ALL periods
  const result = await this.calculateForEmployee(employee, config.periodId, activePlan.id);
}
```

The `config.periodId` is passed to `getEmployeeMetrics()` but is NOT used to filter which employees are calculated — it calculates ALL 2,157 rows (719 employees x 3 months).

---

## 4. Hypotheses for Zero Effect

### Hypothesis 1: The Fix IS Working but the Numbers Are the Same by Coincidence
- UNLIKELY. 5 consecutive identical outputs with 6-decimal precision argues against coincidence.

### Hypothesis 2: The Client Code Is Stale (Next.js Caching)
- `.next` was deleted and rebuilt. Server components are recompiled. But verify: is the data-layer-service a server component or client component? If client, it's in a JS chunk. The chunk hash should change.
- **To verify**: Check if the removed `console.log('[AGG-DIAG-1008-MERGE]')` still appears in the browser console after the rebuild. If it does, the old code is still running.

### Hypothesis 3: The Employee Data Already Has the Wrong componentMetrics Baked In
- When storeAggregatedData() writes the aggregated data, it includes `componentMetrics` per employee.
- Our fix changed how store metrics are stored in STEP 3 (removed the sum-all-periods key).
- BUT: the STEP 4 lookup uses `storePeriodKey` first. If `storePeriodKey` matches (e.g., `1008_1_2025`), it gets the period-specific data — which should be CORRECT even before our fix, since the period-specific keys were ALWAYS built correctly.
- **WAIT. THIS IS THE KEY INSIGHT.**

### Hypothesis 4 (MOST LIKELY): The Period-Aware Key Already Existed and Was Already Being Used

Looking at the STEP 4 code:
```typescript
let storeMetrics = storeComponentMetrics.get(storePeriodKey);  // e.g., "1008_1_2025"
if (!storeMetrics && storePeriodKey !== storeId && storeId) {
  storeMetrics = storeComponentMetrics.get(storeId);  // fallback to "1008"
}
```

If the employee's `storePeriodKey` (`1008_1_2025`) DOES match a key in `storeComponentMetrics`, then the **fallback to the polluted `1008` key NEVER TRIGGERS**. The employee gets the correct per-period data.

This means:
1. **Our fix removed a key that was never being used.** The primary lookup (`storePeriodKey`) was succeeding, so the HF-017 fallback was dead code for this dataset.
2. **The componentMetrics in the aggregated data were ALREADY CORRECT per-period.** The 64M only existed in the unused `storeId`-only key.
3. **The bug is NOT in the data layer.** The data layer is producing correct per-period componentMetrics. The problem is UPSTREAM — in how the orchestrator processes those metrics.

### WHERE THE BUG ACTUALLY IS

If the aggregated data is correct (per-period componentMetrics with ~22M per month), then the bug must be in one of these:

1. **The orchestrator's `extractMetricsWithAIMappings()`** — Is it reading the correct sheet? Is it extracting the right value?
2. **The orchestrator's `buildStoreAmountTotals()`** — For Optical Sales, this sums across ALL employees (all periods). Is the per-employee amount correct?
3. **The calculation engine itself** — Are the lookup tables/tier thresholds correct?
4. **The period filtering** — The orchestrator calculates ALL 2,157 rows (3 months x 719 employees). When results are aggregated, are multiple periods being summed?

---

## 5. Recommended Next Diagnostic

**Do NOT fix the data layer.** The data layer appears to be producing correct per-period data.

Instead, add a targeted diagnostic in the ORCHESTRATOR at the point where it reads `componentMetrics` for employee 90198149:

```typescript
// In extractMetricsWithAIMappings(), after line 779:
const sheetMetrics = componentMetrics[matchedSheet];
if (employee.id.includes('90198149')) {
  console.log('[ORCH-DIAG] Employee 90198149, component=' + component.id +
    ', sheet=' + matchedSheet +
    ', att=' + sheetMetrics?.attainment +
    ', amt=' + sheetMetrics?.amount +
    ', goal=' + sheetMetrics?.goal +
    ', month=' + (employee.attributes as any)?.month +
    ', year=' + (employee.attributes as any)?.year);
}
```

This will show:
- Whether the orchestrator sees 1 or 3 employee records for person 90198149
- Whether the componentMetrics contain per-period (22M) or all-period (64M) data
- Which sheet is being matched for each component

If the data shows 22M (correct per-period), the bug is in the calculation engine or result aggregation. If it shows 64M, the data IS corrupted despite the data-layer fix working — meaning there's a second write path or a caching issue.

---

## Files Involved

| File | Role |
|------|------|
| `src/lib/data-architecture/data-layer-service.ts` | Writes aggregated employee data with componentMetrics |
| `src/lib/orchestration/calculation-orchestrator.ts` | Reads aggregated data, builds metrics, runs calculation |
| `src/lib/compensation/calculation-engine.ts` | Performs tier/matrix lookups using resolved metrics |
| `src/lib/compensation/retailcgmx-plan.ts` | Plan configuration with component definitions |
| `src/lib/orchestration/metric-resolver.ts` | Component-to-sheet matching logic |

## Commits (All Had Zero Effect on Output)
- `4961240` OB-30-8a: AGG-DIAG at store join
- `775771b` OB-30-8b: STEP 3 storeId grouping diagnostic
- `db10841` OB-30-8c: Per-record merge trace for store 1008
- `73ea3f2` OB-30-8d: Remove HF-017 period-agnostic fallback (THE FIX)
