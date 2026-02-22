# OB-76 Phase 0: Diagnostic

## Current Engine Structure

### Component JSONB Shape (rule_sets.components)
```json
{
  "variants": [
    {
      "variantId": "string",
      "variantName": "string",
      "components": [PlanComponent, ...]
    }
  ]
}
```

### PlanComponent Fields
- id, name, description, order, enabled
- componentType: 'matrix_lookup' | 'tier_lookup' | 'percentage' | 'conditional_percentage'
- measurementLevel: 'store' | 'individual' | 'team' | 'region'
- measurementPeriod?: 'current' | 'cumulative'
- matrixConfig?: { rowMetric, rowBands[], columnMetric, columnBands[], values[][] }
- tierConfig?: { metric, tiers[]{min, max, label, value} }
- percentageConfig?: { rate, appliedTo, minThreshold?, maxPayout? }
- conditionalConfig?: { conditions[]{metric, min, max, rate}, appliedTo }

### Handler Dispatch (run-calculation.ts:195-224)
```typescript
switch (component.componentType) {
  case 'tier_lookup': evaluateTierLookup(tierConfig, metrics)
  case 'percentage': evaluatePercentage(percentageConfig, metrics)
  case 'matrix_lookup': evaluateMatrixLookup(matrixConfig, metrics)
  case 'conditional_percentage': evaluateConditionalPercentage(conditionalConfig, metrics)
}
```
4 hardcoded handlers. Closed enum. New calculation type = new code.

### AI Import Context Shape (import_batches.metadata)
```json
{
  "ai_context": {
    "sheets": [
      {
        "sheetName": "Base_Venta_Individual",
        "classification": "individual_performance",
        "matchedComponent": "optical_sales_certified",
        "matchedComponentConfidence": 0.95,
        "fieldMappings": [
          { "sourceColumn": "goal", "semanticType": "target", "confidence": 0.9 },
          { "sourceColumn": "amount", "semanticType": "actual", "confidence": 0.9 }
        ]
      }
    ]
  }
}
```

### Pipeline Test Co Components (6 total)
1. Optical Sales Incentive - Certified (matrix_lookup) - 5×5 grid, row=attainment, col=store_volume
2. Store Sales Incentive (tier_lookup) - 4 tiers on store_sales_attainment
3. New Customers Incentive (tier_lookup) - 7 tiers on new_customers_attainment
4. Collections Incentive (tier_lookup) - 7 tiers on collections_attainment
5. Insurance Sales Incentive (conditional_percentage) - 2 conditions on store_goal_attainment
6. Service Sales Incentive (percentage) - flat 4% on garantia_extendida_sales

### OB-75 Attainment Heuristic (run-calculation.ts:376-384)
```typescript
if (rawMetrics['goal'] && rawMetrics['goal'] > 0) {
  const computedAttainment = actual / rawMetrics['goal'];
  if (rawMetrics['attainment'] === undefined || rawMetrics['attainment'] > 1000) {
    rawMetrics['attainment'] = computedAttainment;
  }
}
```
Intent model makes this unnecessary: source: "ratio" with explicit numerator/denominator.

---

## ARCHITECTURE DECISION RECORD — OB-76

### DECISION 1: Where does the Intent live?
**CHOSEN: Option A** — Alongside current components in rule_sets.components JSONB.
Each PlanComponent gains an optional `intent: ComponentIntent` field.
Engine checks: if intent exists, run Intent executor in parallel.
**Rationale:** No ALTER TABLE needed. Backward compatible. Single read per calculation.

### DECISION 2: Who produces the Intent?
**CHOSEN: Option B** — Post-processing transformer converts current components to Intent.
`intent-transformer.ts` reads PlanComponent JSONB and outputs ComponentIntent.
**Rationale:** No AI prompt changes (risk-free). Deterministic transformation. Existing plans
get Intents immediately. AI-native Intent production deferred to Phase 3.

### DECISION 3: How does the Intent executor resolve metrics?
**CHOSEN: Hybrid A+B** — Primarily from committed_data row_data semantic keys (already present).
AI Import Context used for sheet→component matching (already solved in OB-75).
**Rationale:** buildMetricsForComponent() already resolves sheet-specific metrics using AI context.
EntityData.metrics populated from those resolved metrics. No new lookup path needed.

### DECISION 4: Where are execution traces stored?
**CHOSEN:** In `calculation_results.metadata` JSONB alongside existing metadata.
Field: `metadata.intentTraces: ExecutionTrace[]`
**Rationale:** No new table. Schema already supports metadata JSONB. Traces are per-entity-per-batch.
