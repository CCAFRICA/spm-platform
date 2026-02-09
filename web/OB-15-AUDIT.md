# OB-15 Phase 1: Calculation Pipeline Audit

**Date:** 2026-02-09

---

## CONTEXT RESOLVER: EXISTS

**File:** `src/lib/calculation/context-resolver.ts` (18KB)

**Key Functions:**
- `buildCalculationContext(tenantId, periodId)` - Builds full context
- `buildEmployeeMetrics(context, employee)` - Creates EmployeeMetrics for one employee
- `buildAllEmployeeMetrics(context)` - Creates metrics for all employees

**Orchestrator Integration:** YES
- Orchestrator imports `buildCalculationContext` (line 13)
- Orchestrator uses `CalculationContext` type (line 15)
- Orchestrator calls `buildCalculationContext` during calculation (line 155)

**What it returns:**
```typescript
interface CalculationContext {
  tenantId: string;
  period: PeriodContext;
  employees: EmployeeContext[];
  committedData: Map<string, Record<string, unknown>[]>;
  mappings: Map<string, Map<string, number>>;
}
```

---

## DATA-COMPONENT MAPPER: EXISTS

**File:** `src/lib/calculation/data-component-mapper.ts` (23KB)

**Key Functions:**
- `autoMapPlan(planConfig, sourceFields)` - Auto-maps fields to components
- `getPlanMappings(tenantId, planId)` - Gets stored mappings
- `saveMappings(tenantId, planId, mappings)` - Persists mappings
- `resolveMetrics(employee, mappings, sourceData)` - Resolves metrics for employee
- `getAvailableSourceFields(tenantId)` - Gets fields from committed data

**Auto-Mapping Keywords:** YES - supports Spanish/English
- `optical_volume`: venta_individual, optical_sales, base_venta_individual
- `optical_attainment`: cumplimiento, attainment, logro
- `store_sales`: venta_tienda, store_sales
- etc.

**Storage:** `clearcomp_data_component_mappings` in localStorage

---

## CALCULATION ENGINE TYPES

**File:** `src/lib/compensation/calculation-engine.ts` (17KB)

| Type | Status | Implementation |
|------|--------|----------------|
| matrix_lookup | IMPLEMENTED | `calculateMatrixLookup()` - Uses rowBands/colBands to find cell value |
| tier_lookup | IMPLEMENTED | `calculateTierLookup()` - Walks tiers to find matching threshold |
| percentage | IMPLEMENTED | `calculatePercentage()` - base * rate with min/max thresholds |
| conditional_percentage | IMPLEMENTED | `calculateConditionalPercentage()` - Rate varies by condition |

**Variant Selection:** YES - `findMatchingVariant()` checks isCertified

**Main Entry Point:** `calculateIncentive(employeeMetrics, tenantId, planIdOverride?)`

---

## PLAN DATA STRUCTURE

**File:** `src/types/compensation-plan.ts`

**Components stored:** YES
```typescript
interface PlanComponent {
  id: string;
  name: string;
  componentType: 'matrix_lookup' | 'tier_lookup' | 'percentage' | 'conditional_percentage';
  matrixConfig?: MatrixConfig;
  tierConfig?: TierConfig;
  percentageConfig?: PercentageConfig;
  conditionalConfig?: ConditionalConfig;
}
```

**Tiers/rates per component:** YES
- `TierConfig.tiers: Tier[]` with min, max, value
- `MatrixConfig.values: number[][]` with rowBands/colBands
- `PercentageConfig.rate: number`

**Matrix data stored:** YES
- rowBands, columnBands, values array

---

## RESULTS FORMATTER

**File:** `src/lib/calculation/results-formatter.ts` (19KB)

**Columns:** 30 (legacy format)
- Columns 1-12: Employee/Period metadata (EMP_ID, EMP_NAME, EMP_ROLE, etc.)
- Columns 13-16: Optical Sales (actual, target, attainment, bonus)
- Columns 17-20: Store Performance
- Columns 21-23: Customer acquisition
- Columns 24-26: Other components (Collection, Insurance, Services)
- Columns 27-30: Totals and audit (TOTAL_BONUS, CALC_DATE, CALC_VERSION, CALC_ID)

**Per-component breakdown:** YES - `FormattedComponent` includes calculation string
**Audit trail:** PARTIAL - has calculation string, needs source sheet reference

---

## EXISTING TEST COVERAGE

**File:** `src/lib/compensation/retailcgmx-test.ts`

**Test Employees:**
1. Certified Optometrist - 96% optical attainment, expected total $2,335 MXN
2. Non-Certified Optometrist - same metrics, expected total $1,585 MXN

**Missing Test Cases (per OB-15 spec):**
- HIGH PERFORMER (all >100%)
- LOW PERFORMER (all <80%, should be $0)
- EDGE CASE (exactly at tier boundaries)
- PARTIAL DATA (missing 2 components)
- ZERO PERFORMER (all zeros)

---

## GAPS IDENTIFIED

### 1. Audit Trail Enhancement (PARTIAL)
- Current: calculation formula string exists
- Missing: source sheet reference, source columns used
- Action: Add `sourceSheet` and `sourceColumns` to CalculationAuditEntry

### 2. Test Cases (MISSING)
- Need 5 test employees per OB-15 spec
- Need hand-calculated expected values
- Action: Create in Phase 3

### 3. CSV Export (PARTIAL)
- Current: 30-column format defined
- Missing: Download button in UI
- Action: Add export capability in Phase 5

### 4. Context Resolver Mapping (EXISTS BUT VERIFY)
- Need to verify metrics resolve correctly for all components
- Action: Test with real data in Phase 3

---

## SUMMARY

| Component | Status |
|-----------|--------|
| Context Resolver | EXISTS - used by orchestrator |
| Data-Component Mapper | EXISTS - auto-mapping with keywords |
| matrix_lookup | IMPLEMENTED |
| tier_lookup | IMPLEMENTED |
| percentage | IMPLEMENTED |
| conditional_percentage | IMPLEMENTED |
| Plan Data Structure | COMPLETE - tiers/matrices stored |
| Results Formatter | EXISTS - 30 columns |
| Audit Trail | PARTIAL - needs source references |
| Test Cases | PARTIAL - need 5 per spec |

**Proceed to:** Phase 2 (enhance audit trail), Phase 3 (test cases)
