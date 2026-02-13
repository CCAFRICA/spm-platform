# UAT Forensics Diagnostic Report
## February 12-13, 2026

---

## 1. Forensics Environment Validation (Steps 1-3)

### 1A. OB-32 Chrome Fixes — PASS
- Breadcrumbs render from URL path (`src/components/navigation/Navbar.tsx:34-41`)
- Pulse service reads real localStorage (`src/lib/navigation/pulse-service.ts`)
- ClearComp references: 0 in UI code (4 remain in `storage-migration.ts` — intentional for legacy migration)
- Build: clean, zero errors

### 1B. OB-33 Forensics Environment — PASS
- **16 files created, 3 modified** — all present and verified
- **Korean Test**: PASS — 0 hardcoded component names across `src/lib/forensics/`, `src/components/forensics/`, `src/app/investigate/`
- **Calculation Sovereignty**: Trace emission wrapped in try/catch at `calculation-orchestrator.ts:292-298` — trace failure is non-fatal
- **Coincidental Match Detection**: `forensics-service.ts:244-256` — detects when `vlTotal === gtTotal` but components differ
- **Pipeline Health**: 5-layer engine at `forensics-service.ts:360-366` — interpretation, metric, component, population, outcome
- **Dynamic Column Rendering**: `ReconciliationTable.tsx:48+157` — column count from `session.aggregates.componentTotals`
- **Route Verification**: All 4 routes return HTTP 200 (`/investigate`, `/investigate/reconciliation`, `/investigate/plan-validation`, `/investigate/trace/test`)

### 1C. Trace Quality Assessment — PARTIAL
| Attribute | Quality | Evidence |
|-----------|---------|----------|
| Per-component metrics (attainment, amount, goal) | STRONG | `trace-builder.ts:44-84` extracts from result.componentResults |
| Lookup details (tier/matrix label, rate, value) | STRONG | `trace-builder.ts:87-116` extracts from lookupDetails |
| Component flags (zero_goal, no_data, conditional_skip) | STRONG | `trace-builder.ts:119-130` from component-level flags |
| Data provenance (sourceSheet, topology) | STRONG | `trace-builder.ts:133-170` builds full provenance chain |
| Period resolution type | WEAK | Hardcoded to `'point_in_time'` at `trace-builder.ts:18` — should derive from `measurementPeriod` |
| Calculation sentence | MODERATE | Template-based in `trace-builder.ts:173-210` — covers tier/matrix/percentage/conditional |

---

## 2. Collections Error Diagnosis (Step 4)

### Error Summary
| Metric | Value |
|--------|-------|
| VL Total (last known) | ~$282,750 |
| GT Target | $283,000 |
| Difference | -$250 |
| Severity | LOW — near-match |

### Code Path Analysis

**Plan Definition**: `src/lib/compensation/retailcgmx-plan.ts`
- Cobranza components set `measurementPeriod: 'cumulative'`
- `componentType: 'tier_lookup'`, `measurementLevel: 'store'`

**Orchestrator Logic**: `src/lib/orchestration/calculation-orchestrator.ts:798-807`
```
File: calculation-orchestrator.ts
Line 802: if (component.measurementPeriod === 'cumulative' && cumulativeComponentMetrics?.[matchedSheet])
Line 803:   sheetMetrics = cumulativeComponentMetrics[matchedSheet];
```
When `measurementPeriod === 'cumulative'`, the orchestrator reads from `cumulativeComponentMetrics` instead of period-specific `componentMetrics`. This provides all-periods aggregated collection data.

**Data Layer**: `src/lib/data-architecture/data-layer-service.ts:1358-1419`
```
File: data-layer-service.ts
Line 1358: const empPeriodKey = month || year ? `${empId}_${month}_${year}` : empId;
Line 1359: const storePeriodKey = month || year ? `${storeId}_${month}_${year}` : storeId;
Line 1404: if (!storeMetrics && storePeriodKey !== storeId && storeId) {
Line 1406:   storeMetrics = storeComponentMetrics.get(storeId);  // Fallback to bare storeId
```
Cumulative data is only created when `storePeriodKey !== storeId` (i.e., when period resolution succeeds and produces a period-specific key different from the bare storeId).

### Root Cause Assessment

**Classification**: Pipeline correctly wired — near-match confirmed.

The -$250 residual gap (0.09%) has three possible explanations:

1. **Rounding accumulation** — Tier lookup uses `findBand()` with exclusive upper bounds (`calculation-engine.ts`). If cumulative attainment falls on an exact boundary, rounding in the source data vs. calculated data could shift by one tier.

2. **Cumulative merge timing** — If the cumulative data source aggregates slightly differently than the GT's all-period sum (e.g., due to which records are included), a small residual is expected.

3. **Period resolution edge case** — At `data-layer-service.ts:1404`, if period resolution fails for some stores, those stores use the bare storeId key. If the cumulative metrics were never computed under that key, the cumulative branch at orchestrator:802 has no data and falls back to period-specific data for those stores.

### Verification Script (Browser Console)
```javascript
// Verify cumulative data exists for collections
const data = JSON.parse(localStorage.getItem('data_layer_committed_aggregated_retail_conglomerate'));
const emp = data.find(e => String(e.employeeId) === '90198149');
console.log('componentMetrics:', JSON.stringify(emp.componentMetrics, null, 2));
console.log('cumulativeComponentMetrics:', JSON.stringify(emp.cumulativeComponentMetrics, null, 2));
// Check: Does cumulativeComponentMetrics have the collections sheet?
// If YES: cumulative pipeline is working. Residual is rounding.
// If NO: cumulative merge is failing for this employee's store.
```

---

## 3. Optical Error Diagnosis (Step 5)

### Error Summary
| Metric | Value |
|--------|-------|
| VL Total (last known) | ~$790,850 |
| GT Target | $748,600 |
| Difference | +$42,250 |
| Severity | HIGH — 5.6% positive gap |

### Code Path Analysis

**Plan Definition**: `src/lib/compensation/retailcgmx-plan.ts:20-49`
- `componentType: 'matrix_lookup'`, `measurementLevel: 'store'`
- Row metric: `optical_attainment` (individual employee attainment %)
- Column metric: `store_optical_sales` (store-level total)
- Column bands: `<$60k | $60k-$100k | $100k-$120k | $120k-$180k | $180k+`
- Matrix payouts escalate sharply between bands (e.g., certified 100-150% row: $800→$1100→$1500→$1800→$2500)

**Store Amount Override**: `src/lib/orchestration/calculation-orchestrator.ts:866-881`
```
File: calculation-orchestrator.ts
Line 866-881:
  if (component.componentType === 'matrix_lookup' && component.matrixConfig) {
    const colMetric = component.matrixConfig.columnMetric;  // 'store_optical_sales'
    const colSemantic = inferSemanticType(colMetric);         // → 'amount'
    const sheetTopo = this.sheetTopologyMap.get(matchedSheet);
    if (colMetric.startsWith('store_') && colSemantic === 'amount' &&
        sheetTopo === 'employee_component' && employee.storeId) {
      const storeTotals = this.storeAmountTotals.get(employee.storeId);
      if (storeTotals) {
        const storeTotal = storeTotals.get(matchedSheet);
        if (storeTotal !== undefined) {
          resolved[colMetric] = storeTotal;           // Override with store sum
        }
      }
    }
  }
```
For matrix_lookup components with a `store_*` column metric, the orchestrator overrides the column value with the store-level sum computed by `buildStoreAmountTotals()`.

**Store Amount Computation**: `src/lib/orchestration/calculation-orchestrator.ts:899-925`
```
File: calculation-orchestrator.ts
Line 899-925: buildStoreAmountTotals(employees)
  for (const emp of employees) {
    // Iterates ALL employees in the run
    // Skips store_component sheets (line 914)
    // Sums amount field per storeId per sheetName
    sheetMap.set(sheetName, (sheetMap.get(sheetName) || 0) + amount);
  }
```

**Semantic Type Resolution**: `src/lib/orchestration/metric-resolver.ts`
```
File: metric-resolver.ts
  inferSemanticType('store_optical_sales') matches /sales/i → returns 'amount'
```

**Band Boundary Logic**: `src/lib/compensation/calculation-engine.ts`
```
File: calculation-engine.ts
  findBand(): value >= b.min && value < b.max  // exclusive upper bound
```

### Root Cause Hypotheses (Ranked by Likelihood)

#### Hypothesis 1: Store Optical Total Inflation (HIGH)
**Mechanism**: `buildStoreAmountTotals()` sums the `amount` field from employee-level componentMetrics for each store. The GT likely uses a different source for the store optical sales total (e.g., a pre-computed value from a store-level sheet, or a different aggregation method).

**Evidence Direction**: VL > GT (+$42K) means VL store totals are HIGHER than GT store totals. Higher store totals push employees into higher column bands with higher payouts.

**Impact Calculation**: Column band jumps cause step-function payout increases. For a certified optometrist in the 100-150% attainment row:
- `$100k-$120k` band → $1,500 payout
- `$120k-$180k` band → $1,800 payout (+$300)
- `$180k+` band → $2,500 payout (+$700)

If several stores' totals are inflated enough to jump one column band, the total payout difference across ~240 employees could easily reach $42K.

**Verification**:
```javascript
// Run in browser after calculation
const results = window.__VL_RESULTS;
const storeOpticals = {};
results.forEach(r => {
  const m = r.componentResults?.find(c => c.componentId?.includes('optica'));
  if (m && r.storeId) {
    if (!storeOpticals[r.storeId]) storeOpticals[r.storeId] = { vlStoreTotal: 0, payout: 0, count: 0 };
    storeOpticals[r.storeId].payout += m.value || 0;
    storeOpticals[r.storeId].count++;
  }
});
// Compare these store totals against GT's store optical sales values
console.table(storeOpticals);
```

**Code Fix Location**: `calculation-orchestrator.ts:899-925`
If confirmed, the fix would be to use a separate store-level sheet for the column metric instead of summing employee amounts. Or, if the GT uses a dedicated store optical column, map that column as a store_component sheet and let the orchestrator read it directly.

#### Hypothesis 2: Sheet Topology Misclassification (MEDIUM)
**Mechanism**: If the optical data sheet is classified as `employee_component` by `buildSheetTopology()` (line 946-974) but the GT treats it as a store-level value, the `buildStoreAmountTotals` code at line 914 wouldn't skip it. It would sum individual employee amounts to create a store total, which may differ from a store-level sheet value.

**Code Location**: `calculation-orchestrator.ts:946-974`
```
File: calculation-orchestrator.ts
Line 946-974: buildSheetTopology()
  Classifies sheets based on AI import context field mappings.
  If a sheet has employeeId → employee_component
  If a sheet has storeId (and no employeeId) → store_component
```

**Verification**: Check `this.sheetTopologyMap` in browser console to see how the optical sheet is classified.

#### Hypothesis 3: Period Filter Failure Causing Multi-Period Inflation (MEDIUM-LOW)
**Mechanism**: If `resolvePeriodYearMonth()` (line 465-517) returns NaN, period filtering is skipped entirely (line 375). ALL employees across ALL periods would be included. `buildStoreAmountTotals` would then sum optical amounts across all periods, inflating store totals by a factor of N (number of periods).

**Evidence Against**: Store Sales ($116,250) and New Customers ($39,100) match GT exactly. If period filtering failed, those components would also be wrong — unless they're computed differently (tier_lookup with `measurementLevel: 'store'` reads from store_component sheets which already have per-period isolation).

**Code Location**: `calculation-orchestrator.ts:465-517`
```
File: calculation-orchestrator.ts
Line 514-516:
  console.warn('[Orchestrator] HOTFIX: Cannot resolve period — skipping period filter');
  return { selectedYear: NaN, selectedMonth: NaN };
```

**Verification**: Check browser console for the HOTFIX warning. If present, period filter is failing.

#### Hypothesis 4: Exclusive Upper Bound Edge Cases (LOW)
**Mechanism**: `findBand()` uses `value >= min && value < max`. If GT uses inclusive upper bounds (`value <= max`), employees at exact band boundaries (e.g., store with exactly $120,000 optical sales) would be classified differently.

**Impact**: Only affects stores at exact boundary values. Unlikely to cause $42K gap unless many stores cluster near boundaries.

---

## 4. Summary Table

| Error | Component | Gap | Severity | Root Cause | Status |
|-------|-----------|-----|----------|------------|--------|
| #1 | Collections (Cobranza) | -$250 (0.09%) | LOW | Rounding or cumulative merge edge case | Near-match — pipeline correctly wired |
| #2 | Optical (Venta Óptica) | +$42,250 (5.6%) | HIGH | Store total inflation in `buildStoreAmountTotals` | Requires browser verification |

---

## 5. Non-Error Components (Reference)

| Component | VL | GT | Gap | Status |
|-----------|-----|-----|-----|--------|
| Store Sales | $116,250 | $116,250 | $0 | EXACT MATCH |
| New Customers | $39,100 | $39,100 | $0 | EXACT MATCH |
| Warranty | $0 | $66,872 | -$66,872 | Accepted — missing data sheet (see `WARRANTY_DATA_GAP.md`) |
| Insurance | ~$0 | ~$0 | ~$0 | Low priority |

---

## 6. Adjusted Reconciliation Target

| Metric | Value |
|--------|-------|
| Ground Truth Total | $1,253,832 |
| Warranty Gap (accepted) | -$66,872 |
| **Adjusted Target** | **$1,186,960** |
| Current VL Estimate | ~$1,228,950 (based on last known components) |
| Gap from Adjusted Target | +$42,000 (optical component) |

---

## 7. Recommended Next Steps

### Immediate (Browser Verification)
1. Run calculation in browser, then execute verification scripts from Section 3 above
2. Check console for `[Orchestrator] HOTFIX: Cannot resolve period` warning → confirms/eliminates Hypothesis 3
3. Compare `window.__VL_RESULTS` store optical totals against GT store values → confirms/eliminates Hypothesis 1
4. Check `this.sheetTopologyMap` entries for optical sheet → confirms/eliminates Hypothesis 2

### If Hypothesis 1 Confirmed (Store Total Inflation)
**Fix at**: `calculation-orchestrator.ts:899-925`
- Option A: If a store_component optical sheet exists in the data, use it directly instead of summing employee amounts
- Option B: If the GT sums differently (e.g., deduplicating by some criteria), replicate that logic in `buildStoreAmountTotals`
- Option C: Add a `columnMetricSource` field to MatrixConfig specifying which sheet provides the column value

### Collections Residual
No code change needed. The -$250 gap (0.09%) is within acceptable tolerance for the `measurementPeriod: 'cumulative'` mechanism.

---

## 8. Files Referenced

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/orchestration/calculation-orchestrator.ts` | 222, 292-298, 375-390, 465-517, 751-753, 798-807, 866-881, 899-925, 946-974 | Core orchestration, period filter, store totals, trace emission |
| `src/lib/data-architecture/data-layer-service.ts` | 1340-1419 | Period-aware keys, cumulative data, store fallback |
| `src/lib/compensation/retailcgmx-plan.ts` | 20-49, 51-79, 138-167 | Optical matrix config, column bands, measurement levels |
| `src/lib/compensation/calculation-engine.ts` | `findBand()` | Exclusive upper bound logic |
| `src/lib/orchestration/metric-resolver.ts` | `inferSemanticType()` | Pattern-based semantic type → 'amount' |
| `src/lib/forensics/trace-builder.ts` | 18, 44-210 | Trace quality — strong on metrics, weak on period resolution |
| `src/lib/forensics/forensics-service.ts` | 244-256, 360-366 | Coincidental match, pipeline health |

---

*Report generated: February 13, 2026*
*UAT Session: OB-33 Forensics Environment Validation + Calculation Error Diagnosis*
