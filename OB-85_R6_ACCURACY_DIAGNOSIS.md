# OB-85 R6 Phase 0: Optical Matrix Column Metric Trace

## PHASE 0 FINDINGS — OB-85 R6

### MATRIX COLUMN METRIC RESOLUTION:

**Current code path:**
- `run-calculation.ts:buildMetricsForComponent()` (line 370)
- Metric name: `store_optical_sales` (from plan matrixConfig.columnMetric)
- `inferSemanticType("store_optical_sales")` → `amount` (matches `/sales/i`)
- `/store/i.test("store_optical_sales")` → TRUE → enters store resolution path (line 443)
- `storeMatchMetrics["amount"]` → UNDEFINED (findMatchingSheet returns null for "Optical Sales" vs store sheets)
- SHEET_COMPONENT_PATTERNS loop (line 450):
  - Optical mapping: `/optical.*sales/i` matches "store_optical_sales" → but optical sheetPatterns (`/venta.*individual/i`) don't match any store sheet → falls through
  - **Store sales mapping: `/store.*sales/i` matches "store_optical_sales" → sheetPatterns `/venta.*tienda/i` matches "Base_Venta_Tienda" → RESOLVES**
- **Result: `store_optical_sales` = Base_Venta_Tienda.amount = MX$44,765,378 (store 388 TOTAL sales)**
- This maps to ≥$180K column band for ALL stores (all have multi-million totals)

**Expected:**
- `store_optical_sales` should resolve to the store's OPTICAL sales total
- Optical data lives in Base_Venta_Individual (entity-level, not store-level)
- Store optical total = SUM(Venta_Individual) across all employees at the store
- After entity consolidation, all 719 roster entities have Base_Venta_Individual data

### BASE_VENTA_TIENDA DATA:
- Store 388 (entity 93515855): amount=44,765,378, goal=44,079,293 (TOTAL store sales)
- Store 298 (entity 92686541): amount=17,486,484, goal=14,620,992 (TOTAL store sales)
- Fields: Real_Venta_Tienda, Meta_Venta_Tienda, Tienda, amount, goal, storeId
- Contains TOTAL store sales — NOT optical-specific

### BASE_VENTA_INDIVIDUAL DATA:
- Entity-level data (876 rows, 876 unique entities before consolidation)
- After consolidation: all 719 roster entities have Venta Individual data
- Fields: Venta_Individual, Meta_Individual, Cumplimiento, amount, goal, attainment
- Also has: `suma nivel tienda` (store-level goal sum), `Rango de Tienda` (NULL), `num_tienda`
- Entity 93515855: amount=163,136, goal=140,000, attainment=1.165

### PER-STORE OPTICAL AGGREGATES (after consolidation):
- Store 388: MX$342,018 (2 entities) → ≥$180K band
- Store 298: MX$265,413 (2 entities) → ≥$180K band
- Store 1: MX$100,560 (1 entity) → $100-120K band
- 698 stores with data, distribution:

| Band | Stores |
|------|--------|
| <$60K | 148 |
| $60-100K | 233 |
| $100-120K | 106 |
| $120-180K | 136 |
| ≥$180K | 75 |

vs CURRENT (Base_Venta_Tienda): ALL 698 stores → ≥$180K

### PLAN RULE_SET FOR OPTICAL:
- rowMetric: `optical_attainment` → resolved correctly from entity data
- columnMetric: `store_optical_sales` → resolves incorrectly to Base_Venta_Tienda total
- rowBands: 5 bands (<80%, 80-90%, 90-100%, 100-150%, ≥150%)
- columnBands: 5 bands (<$60K, $60-100K, $100-120K, $120-180K, ≥$180K)

### ROOT CAUSE:
`store_optical_sales` falls through the OPTICAL SHEET_COMPONENT_PATTERNS mapping (optical sheetPatterns `/venta.*individual/i` don't match any store-level sheet) and gets caught by the STORE SALES mapping (`/store.*sales/i` → `/venta.*tienda/i`), which reads Base_Venta_Tienda's TOTAL store sales (MX$44.7M) instead of optical-specific store sales.

The fix: when a "store"-prefixed metric matches a component pattern (optical) but no STORE sheet matches that pattern's sheet patterns, check per-store ENTITY-level sheet aggregates. The store's optical sales total = SUM of Base_Venta_Individual amounts across all entities at the same store.

---

### FIX APPROACH:

1. **Pre-compute per-store entity sheet aggregates** (route.ts, before entity loop):
   - After consolidation, for each roster entity: group by store + entity-level sheet type
   - Aggregate numeric metrics per store per sheet
   - Result: `Map<storeId, Map<sheetName, Record<string, number>>>`

2. **Pass to buildMetricsForComponent** as new parameter:
   - `entitySheetStoreAggregates?: Map<string, Record<string, number>>`
   - Contains per-store aggregated entity data for the current entity's store

3. **In store metric resolution** (buildMetricsForComponent, line 450-461):
   - After checking perSheetStoreMetrics (store-level sheets), also check entitySheetStoreAggregates
   - Use same SHEET_COMPONENT_PATTERNS matching against entity sheet names from aggregates
   - This allows `store_optical_sales` to resolve from aggregated Base_Venta_Individual

4. **Korean Test**: Zero hardcoded sheet names. Uses SHEET_COMPONENT_PATTERNS (regex patterns) and inferSemanticType (pattern-based). Same AI-first mechanism as existing code.

---

*Phase 0 Diagnosis — February 24, 2026*
