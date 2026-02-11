# CLT-14: Employee-Level Calculation Reconciliation - Completion Report

## Summary

Implemented the Employee Reconciliation Trace module to enable detailed tracing of the calculation pipeline for any employee. This allows ops users to debug and verify compensation calculations by seeing each step from data loading through final payout.

## Phase 1: Calculation Pipeline Understanding

### Files Analyzed

| File | Purpose | Key Functions |
|------|---------|---------------|
| `calculation-orchestrator.ts` | Orchestrates full calculation runs | `executeRun()`, `calculateForEmployee()`, `extractMetricsWithAIMappings()` |
| `calculation-engine.ts` | Core calculation logic | `calculateIncentive()`, `findMatchingVariant()`, `calculateComponent()` |
| `metric-resolver.ts` | Maps plan metrics to semantic types | `inferSemanticType()`, `findSheetForComponent()`, `buildComponentMetrics()` |
| `plan-storage.ts` | Plan CRUD operations | `getPlans()`, `getActivePlan()`, `getPlan()` |
| `context-resolver.ts` | Builds employee context | `buildCalculationContext()`, `buildEmployeeMetrics()` |
| `data-component-mapper.ts` | Maps source fields to plan metrics | `autoMapFields()`, `resolveMetrics()` |
| `data-layer-service.ts` | Data aggregation engine | `loadAggregatedData()`, `storeAggregatedData()`, `resolvePeriodFromRecord()` |

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CALCULATION PIPELINE                             │
└─────────────────────────────────────────────────────────────────────────┘

1. PLAN LOADING (plan-storage.ts)
   └── getPlans(tenantId) → localStorage "compensation_plans"
   └── Plans have variants with eligibilityCriteria: { isCertified: bool }

2. DATA LOADING (data-layer-service.ts)
   └── loadAggregatedData(tenantId)
   └── localStorage "data_layer_committed_aggregated_{tenant}"
   └── Structure: [{ employeeId, componentMetrics: { sheetName: {attainment, amount, goal} } }]

3. ORCHESTRATION (calculation-orchestrator.ts:executeRun)
   └── For each employee:
       ├── isCertified: Derived from role string ("CERTIFICADO" but not "NO CERTIFICADO")
       ├── extractMetricsWithAIMappings(): Maps component → sheet → metrics
       └── calculateIncentive(): Dispatches to engine

4. METRIC EXTRACTION (metric-resolver.ts)
   └── findSheetForComponent(): Pattern-matches component name → sheet name
   └── buildComponentMetrics(): Maps semantic values to plan metric names
   └── inferSemanticType(): "optical_attainment" → 'attainment'

5. VARIANT SELECTION (calculation-engine.ts:findMatchingVariant)
   └── Matches eligibilityCriteria.isCertified against employee.isCertified
   └── Falls back to first variant if no match

6. COMPONENT CALCULATION (calculation-engine.ts)
   └── matrix_lookup: 2D lookup using rowMetric + columnMetric
   └── tier_lookup: 1D lookup using metric
   └── percentage: rate * appliedTo value
   └── conditional_percentage: conditional rate based on threshold
```

## Phase 2: Employee Reconciliation Trace Module

### New File Created

**`src/lib/reconciliation/employee-reconciliation-trace.ts`**

### Key Functions

| Function | Purpose |
|----------|---------|
| `generateEmployeeTrace(tenantId, employeeId, planIdOverride?)` | Main entry - generates full trace |
| `traceVariantSelection(plan, isCertified)` | Traces why a variant was selected |
| `traceComponentCalculation(component, metrics, sheets, warnings)` | Traces single component |
| `generateBatchTraces(tenantId, employeeIds)` | Trace multiple employees |
| `summarizeTraces(traces)` | Aggregate analysis of multiple traces |

### Trace Structure

```typescript
interface EmployeeReconciliationTrace {
  traceId: string;
  generatedAt: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  isCertified: boolean;
  period: { month: number | null; year: number | null; formatted: string };

  // Step 1: Data Loading
  dataLoading: {
    aggregatedDataFound: boolean;
    componentMetricsCount: number;
    rawAggregatedData: Record<string, unknown>;
    componentMetrics: Record<string, Record<string, unknown>>;
  };

  // Step 2: Plan Resolution
  planResolution: {
    planId: string;
    planName: string;
    planType: string;
    planStatus: string;
    totalPlansForTenant: number;
    selectionMethod: string;
  };

  // Step 3: Variant Selection
  variantSelection: {
    selectedVariantId: string;
    selectedVariantName: string;
    selectionReason: string;
    eligibilityCriteria: Record<string, unknown> | null;
    employeeCriteria: { isCertified: boolean };
    allVariants: Array<{ variantId, variantName, matched, reason }>;
  };

  // Step 4: Component Traces
  components: ComponentTrace[];

  // Step 5: Final Calculation
  finalCalculation: {
    componentTotals: Array<{ componentId, componentName, value }>;
    totalIncentive: number;
    currency: string;
  };

  // Validation
  validation: {
    allComponentsMatched: boolean;
    allMetricsExtracted: boolean;
    calculationComplete: boolean;
    warnings: string[];
    errors: string[];
  };
}
```

### ComponentTrace Structure

```typescript
interface ComponentTrace {
  componentId: string;
  componentName: string;
  componentType: string;
  matchedSheet: string | null;
  sheetMatchMethod: 'ai_context' | 'pattern_match' | 'none';
  rawSheetData: Record<string, unknown> | null;
  extractedMetrics: Record<string, number>;
  metricMappings: Array<{
    planMetric: string;
    semanticType: string;
    sourceValue: unknown;
    extractedValue: number;
  }>;
  calculationInputs: Record<string, number>;
  lookupDetails: Record<string, unknown> | null;
  calculationFormula: string;
  outputValue: number;
  warnings?: string[];
}
```

## Usage

### Console (Browser DevTools)

```javascript
// Import the trace function
import { generateEmployeeTrace } from '@/lib/reconciliation/employee-reconciliation-trace';

// Generate trace for specific employee
const trace = generateEmployeeTrace('retail_conglomerate', '96568046');
console.log(JSON.stringify(trace, null, 2));

// Or for batch analysis
import { generateBatchTraces, summarizeTraces } from '@/lib/reconciliation/employee-reconciliation-trace';

const traces = generateBatchTraces('retail_conglomerate', [
  '96568046', '96568047', '96568048', '96568049', '96568050'
]);
const summary = summarizeTraces(traces);
console.log(summary);
```

### Expected Output (Sample)

```json
{
  "traceId": "trace-1707555600000-abc123",
  "generatedAt": "2026-02-10T12:00:00.000Z",
  "tenantId": "retail_conglomerate",
  "employeeId": "96568046",
  "employeeName": "MARIA GUADALUPE MENDEZ GOMEZ",
  "employeeRole": "OPTICO NO CERTIFICADO",
  "isCertified": false,
  "period": { "month": 1, "year": 2024, "formatted": "1/2024" },
  "dataLoading": {
    "aggregatedDataFound": true,
    "componentMetricsCount": 5,
    "componentMetrics": {
      "Base_Venta_Individual": { "attainment": 105.2, "amount": 142500, "goal": 135000 }
    }
  },
  "planResolution": {
    "planId": "plan-retailcgmx-2024-01",
    "planName": "RetailCG MX Unified Plan 2024",
    "selectionMethod": "First active plan for tenant"
  },
  "variantSelection": {
    "selectedVariantId": "non-certified",
    "selectedVariantName": "Non-Certified Associate",
    "selectionReason": "isCertified match: false"
  },
  "components": [
    {
      "componentName": "Optical Sales",
      "componentType": "matrix_lookup",
      "matchedSheet": "Base_Venta_Individual",
      "extractedMetrics": { "optical_attainment": 105.2, "optical_volume": 142500 },
      "calculationFormula": "Matrix[105.2%, $142,500] → lookup",
      "outputValue": 1250
    }
  ],
  "finalCalculation": {
    "totalIncentive": 3450,
    "currency": "MXN"
  },
  "validation": {
    "allComponentsMatched": true,
    "allMetricsExtracted": true,
    "calculationComplete": true,
    "warnings": [],
    "errors": []
  }
}
```

## Proof Gate

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Phase 1 documents data flow from import to calculation | PASS | Data flow architecture documented above |
| 2 | generateEmployeeTrace returns full trace structure | PASS | `employee-reconciliation-trace.ts:138-315` |
| 3 | Trace includes plan resolution details | PASS | `planResolution` object with planId, name, status |
| 4 | Trace includes variant selection with reason | PASS | `traceVariantSelection()` function |
| 5 | Trace includes component-to-sheet matching | PASS | `matchedSheet`, `sheetMatchMethod` in ComponentTrace |
| 6 | Trace includes metric extraction details | PASS | `metricMappings` array with semantic types |
| 7 | No hardcoded column names | PASS | Uses AI semantic mappings via `inferSemanticType()` |
| 8 | `npm run build` exits 0 | PASS | Build completed successfully |
| 9 | `curl localhost:3000` returns HTTP 200 | PASS | HTTP 200 confirmed |

## Next Steps (Phase 3-5)

1. **Phase 3**: Build reconciliation UI in `/operate/calculate` page
   - Add "Trace" button next to each employee row
   - Modal showing full trace in collapsible sections
   - Export to JSON for external analysis

2. **Phase 4**: Run reconciliation for 5 specific employees
   - Verify trace outputs match expected calculations
   - Document any discrepancies found

3. **Phase 5**: Verify and build final integration

---
*Report generated: 2026-02-10*
*Status: PHASE 2 COMPLETE - READY FOR PHASE 3*
