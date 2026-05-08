# DIAG-035 — c4 Fleet Utilization Magnitude Probe (Phase 0 Read-Only)

**Date:** 2026-05-08
**Branch:** `diag-019-c4-magnitude-probe`
**Commit at probe start:** `b074f82f49e5785d15789ece17979d5071efc3d8`
**Tenant:** Meridian Logistics Group (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`)
**Rule set:** `3d629051-f788-44f6-a546-45876dd187b1` (Meridian Logistics Group Incentive Plan 2025)
**Reference batch:** `dcba5168-f67b-49a2-8e48-b3f3f292677e` (January 2025, run 1)
**Reference entity:** `70010` — Antonio López Hernández — variant_0 (Senior)

---

## Section 1 — Surface 1: Rule set component definition

### 1.1 Full components JSONB

```json
{
  "variants": [
    {
      "variantId": "senior",
      "components": [
        {
          "id": "revenue_performance_senior",
          "name": "Revenue Performance - Senior",
          "order": 1,
          "enabled": true,
          "metadata": {
            "intent": {
              "inputs": {
                "row": { "source": "metric", "sourceSpec": { "field": "revenue_goal_attainment" } },
                "column": { "source": "metric", "sourceSpec": { "field": "hub_route_volume" } }
              },
              "operation": "bounded_lookup_2d",
              "outputGrid": [
                [0, 0, 200, 400],
                [150, 300, 500, 800],
                [300, 600, 900, 1400],
                [600, 1000, 1600, 2200],
                [900, 1400, 2100, 3000]
              ],
              "rowBoundaries": [
                { "max": 80, "min": 0, "maxInclusive": false, "minInclusive": true },
                { "max": 90, "min": 80, "maxInclusive": false, "minInclusive": true },
                { "max": 100, "min": 90, "maxInclusive": false, "minInclusive": true },
                { "max": 130, "min": 100, "maxInclusive": false, "minInclusive": true },
                { "max": null, "min": 130, "maxInclusive": true, "minInclusive": true }
              ],
              "noMatchBehavior": "zero",
              "columnBoundaries": [
                { "max": 500, "min": 0, "maxInclusive": false, "minInclusive": true },
                { "max": 1000, "min": 500, "maxInclusive": false, "minInclusive": true },
                { "max": 2000, "min": 1000, "maxInclusive": false, "minInclusive": true },
                { "max": null, "min": 2000, "maxInclusive": true, "minInclusive": true }
              ]
            }
          },
          "description": "Rendimiento de Ingreso - Senior",
          "componentType": "bounded_lookup_2d",
          "measurementLevel": "store",
          "calculationIntent": {
            "inputs": {
              "row": { "source": "metric", "sourceSpec": { "field": "revenue_goal_attainment" } },
              "column": { "source": "metric", "sourceSpec": { "field": "hub_route_volume" } }
            },
            "operation": "bounded_lookup_2d",
            "outputGrid": [[0,0,200,400],[150,300,500,800],[300,600,900,1400],[600,1000,1600,2200],[900,1400,2100,3000]],
            "rowBoundaries": [
              { "max": 80, "min": 0, "maxInclusive": false, "minInclusive": true },
              { "max": 90, "min": 80, "maxInclusive": false, "minInclusive": true },
              { "max": 100, "min": 90, "maxInclusive": false, "minInclusive": true },
              { "max": 130, "min": 100, "maxInclusive": false, "minInclusive": true },
              { "max": null, "min": 130, "maxInclusive": true, "minInclusive": true }
            ],
            "noMatchBehavior": "zero",
            "columnBoundaries": [
              { "max": 500, "min": 0, "maxInclusive": false, "minInclusive": true },
              { "max": 1000, "min": 500, "maxInclusive": false, "minInclusive": true },
              { "max": 2000, "min": 1000, "maxInclusive": false, "minInclusive": true },
              { "max": null, "min": 2000, "maxInclusive": true, "minInclusive": true }
            ]
          }
        },
        {
          "id": "on_time_delivery_senior",
          "name": "On-Time Delivery - Senior",
          "order": 2,
          "enabled": true,
          "metadata": {
            "intent": {
              "input": { "source": "metric", "sourceSpec": { "field": "on_time_delivery_percentage" } },
              "outputs": [0, 200, 400, 700, 1200],
              "operation": "bounded_lookup_1d",
              "boundaries": [
                { "max": 85, "min": 0, "maxInclusive": false, "minInclusive": true },
                { "max": 90, "min": 85, "maxInclusive": false, "minInclusive": true },
                { "max": 95, "min": 90, "maxInclusive": false, "minInclusive": true },
                { "max": 98, "min": 95, "maxInclusive": false, "minInclusive": true },
                { "max": 100, "min": 98, "maxInclusive": true, "minInclusive": true }
              ],
              "noMatchBehavior": "zero"
            }
          },
          "description": "Entrega a Tiempo - Senior",
          "componentType": "bounded_lookup_1d",
          "measurementLevel": "store",
          "calculationIntent": { /* identical to metadata.intent */ }
        },
        {
          "id": "new_accounts_senior",
          "name": "New Accounts - Senior",
          "order": 3,
          "enabled": true,
          "metadata": {
            "intent": {
              "rate": 350,
              "input": { "source": "metric", "sourceSpec": { "field": "new_accounts_count" } },
              "operation": "scalar_multiply"
            }
          },
          "description": "Cuentas Nuevas - Senior",
          "componentType": "scalar_multiply",
          "measurementLevel": "store",
          "calculationIntent": {
            "rate": 350,
            "input": { "source": "metric", "sourceSpec": { "field": "new_accounts_count" } },
            "operation": "scalar_multiply"
          }
        },
        {
          "id": "safety_record_senior",
          "name": "Safety Record - Senior",
          "order": 4,
          "enabled": true,
          "metadata": {
            "intent": {
              "onTrue": { "value": 500, "operation": "constant" },
              "onFalse": { "value": 0, "operation": "constant" },
              "condition": {
                "left": { "source": "metric", "sourceSpec": { "field": "safety_incidents_count" } },
                "right": { "value": 0, "source": "constant" },
                "operator": "="
              },
              "operation": "conditional_gate"
            }
          },
          "description": "Registro de Seguridad - Senior",
          "componentType": "conditional_gate",
          "measurementLevel": "store",
          "calculationIntent": { /* identical to metadata.intent */ }
        },
        {
          "id": "fleet_utilization_senior",
          "name": "Fleet Utilization - Senior",
          "order": 5,
          "enabled": true,
          "metadata": {
            "intent": {
              "rate": 800,
              "input": { "source": "metric", "sourceSpec": { "field": "hub_utilization_rate_capped" } },
              "operation": "scalar_multiply"
            }
          },
          "description": "Utilización de Flota - Senior",
          "componentType": "scalar_multiply",
          "measurementLevel": "store",
          "calculationIntent": {
            "rate": 800,
            "input": { "source": "metric", "sourceSpec": { "field": "hub_utilization_rate_capped" } },
            "operation": "scalar_multiply"
          }
        }
      ],
      "description": "Coordinador Senior",
      "variantName": "Senior Logistics Coordinator",
      "eligibilityCriteria": {}
    },
    {
      "variantId": "standard",
      "components": [
        /* component 1 (Revenue Performance - Standard) — bounded_lookup_2d, outputGrid scaled ~half of senior */
        /* component 2 (On-Time Delivery - Standard) — bounded_lookup_1d, outputs [0,100,200,350,600] (half of senior) */
        /* component 3 (New Accounts - Standard) — scalar_multiply, rate: 200 */
        /* component 4 (Safety Record - Standard) — conditional_gate, onTrue: 300 */
        {
          "id": "fleet_utilization_standard",
          "name": "Fleet Utilization - Standard",
          "order": 5,
          "enabled": true,
          "metadata": {
            "intent": {
              "rate": 450,
              "input": { "source": "metric", "sourceSpec": { "field": "hub_utilization_rate_capped" } },
              "operation": "scalar_multiply"
            }
          },
          "description": "Utilización de Flota - Coordinador",
          "componentType": "scalar_multiply",
          "measurementLevel": "store",
          "calculationIntent": {
            "rate": 450,
            "input": { "source": "metric", "sourceSpec": { "field": "hub_utilization_rate_capped" } },
            "operation": "scalar_multiply"
          }
        }
      ],
      "description": "Coordinador",
      "variantName": "Standard Logistics Coordinator",
      "eligibilityCriteria": {}
    }
  ]
}
```

(Full unabbreviated JSON at `/tmp/diag-035-surface1.json`, 1204 lines. C4 components both variants captured above verbatim; non-c4 components elided to keep this section readable. Variant 1 / Standard non-c4 components have identical structural shape to Variant 0 / Senior with rates/grids scaled to standard tier values per directive's "no interpretation" — values present in `/tmp/diag-035-surface1.json` lines 471-935.)

### 1.2 Full input_bindings JSONB

```json
{
  "metric_derivations": [
    { "metric": "revenue_goal_attainment", "filters": [{ "field": "Tipo_Coordinador", "value": "Coordinador Senior", "operator": "eq" }], "operation": "count", "source_pattern": "transaction" },
    { "metric": "hub_route_volume", "filters": [{ "field": "Tipo_Coordinador", "value": "Coordinador Senior", "operator": "eq" }], "operation": "count", "source_pattern": "transaction" },
    { "metric": "on_time_delivery_percentage", "filters": [{ "field": "Tipo_Coordinador", "value": "Coordinador Senior", "operator": "eq" }], "operation": "count", "source_pattern": "transaction" },
    { "metric": "new_accounts_count", "filters": [{ "field": "Tipo_Coordinador", "value": "Coordinador Senior", "operator": "eq" }], "operation": "count", "source_pattern": "transaction" },
    { "metric": "safety_incidents_count", "filters": [{ "field": "Tipo_Coordinador", "value": "Coordinador Senior", "operator": "eq" }], "operation": "count", "source_pattern": "transaction" },
    { "metric": "hub_utilization_rate_capped", "filters": [{ "field": "Tipo_Coordinador", "value": "Coordinador Senior", "operator": "eq" }], "operation": "count", "source_pattern": "transaction" }
  ],
  "convergence_bindings": {
    "component_0": {
      "row": { "column": "Cumplimiento_Ingreso", "confidence": 0.9, "match_pass": 1, "scale_factor": 100, "field_identity": { "confidence": 0.7, "structuralType": "measure", "contextualIdentity": "count" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "column": { "column": "Volumen_Rutas_Hub", "confidence": 0.9, "match_pass": 1, "field_identity": { "confidence": 0.7, "structuralType": "measure", "contextualIdentity": "count" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "period": { "column": "Mes", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "temporal", "contextualIdentity": "date" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "entity_identifier": { "column": "Hub", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "identifier", "contextualIdentity": "person_identifier" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" }
    },
    "component_1": {
      "actual": { "column": "Pct_Entregas_Tiempo", "confidence": 0.9, "match_pass": 1, "scale_factor": 100, "field_identity": { "confidence": 0.7, "structuralType": "measure", "contextualIdentity": "count" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "period": { "column": "Mes", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "temporal", "contextualIdentity": "date" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "entity_identifier": { "column": "Hub", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "identifier", "contextualIdentity": "person_identifier" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" }
    },
    "component_2": {
      "actual": { "column": "Cuentas_Nuevas", "confidence": 0.9, "match_pass": 1, "field_identity": { "confidence": 0.7, "structuralType": "measure", "contextualIdentity": "count" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "period": { "column": "Mes", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "temporal", "contextualIdentity": "date" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "entity_identifier": { "column": "Hub", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "identifier", "contextualIdentity": "person_identifier" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" }
    },
    "component_3": {
      "actual": { "column": "Incidentes_Seguridad", "confidence": 0.9, "match_pass": 1, "field_identity": { "confidence": 0.7, "structuralType": "measure", "contextualIdentity": "count" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "period": { "column": "Mes", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "temporal", "contextualIdentity": "date" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "entity_identifier": { "column": "Hub", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "identifier", "contextualIdentity": "person_identifier" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" }
    },
    "component_4": {
      "actual": { "column": "Tasa_Utilizacion_Hub", "confidence": 0.9, "match_pass": 1, "field_identity": { "confidence": 0.7, "structuralType": "measure", "contextualIdentity": "count" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "period": { "column": "Mes", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "temporal", "contextualIdentity": "date" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" },
      "entity_identifier": { "column": "Hub", "confidence": 0.775, "match_pass": 1, "field_identity": { "confidence": 0.9, "structuralType": "identifier", "contextualIdentity": "person_identifier" }, "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b" }
    }
  }
}
```

### 1.3 c4 component (variant 0 — Senior)

```json
{
  "id": "fleet_utilization_senior",
  "name": "Fleet Utilization - Senior",
  "order": 5,
  "enabled": true,
  "metadata": {
    "intent": {
      "rate": 800,
      "input": {
        "source": "metric",
        "sourceSpec": {
          "field": "hub_utilization_rate_capped"
        }
      },
      "operation": "scalar_multiply"
    }
  },
  "description": "Utilización de Flota - Senior",
  "componentType": "scalar_multiply",
  "measurementLevel": "store",
  "calculationIntent": {
    "rate": 800,
    "input": {
      "source": "metric",
      "sourceSpec": {
        "field": "hub_utilization_rate_capped"
      }
    },
    "operation": "scalar_multiply"
  }
}
```

### 1.4 c4 component (variant 1 — Standard)

```json
{
  "id": "fleet_utilization_standard",
  "name": "Fleet Utilization - Standard",
  "order": 5,
  "enabled": true,
  "metadata": {
    "intent": {
      "rate": 450,
      "input": {
        "source": "metric",
        "sourceSpec": {
          "field": "hub_utilization_rate_capped"
        }
      },
      "operation": "scalar_multiply"
    }
  },
  "description": "Utilización de Flota - Coordinador",
  "componentType": "scalar_multiply",
  "measurementLevel": "store",
  "calculationIntent": {
    "rate": 450,
    "input": {
      "source": "metric",
      "sourceSpec": {
        "field": "hub_utilization_rate_capped"
      }
    },
    "operation": "scalar_multiply"
  }
}
```

### 1.5 c4 convergence binding (input_bindings.convergence_bindings.component_4)

```json
{
  "actual": {
    "column": "Tasa_Utilizacion_Hub",
    "confidence": 0.9,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.7,
      "structuralType": "measure",
      "contextualIdentity": "count"
    },
    "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b"
  },
  "period": {
    "column": "Mes",
    "confidence": 0.775,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.9,
      "structuralType": "temporal",
      "contextualIdentity": "date"
    },
    "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b"
  },
  "entity_identifier": {
    "column": "Hub",
    "confidence": 0.775,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.9,
      "structuralType": "identifier",
      "contextualIdentity": "person_identifier"
    },
    "source_batch_id": "87fedf1b-f960-4e1a-95c1-df196edb979b"
  }
}
```

Note: `component_4.actual` does NOT contain a `scale_factor` field (compare with `component_0.row` which has `scale_factor: 100` and `component_1.actual` which has `scale_factor: 100`).

### 1.6 c4 metric derivations (entries from input_bindings.metric_derivations targeting hub_utilization_rate_capped)

Single matching entry:

```json
{
  "metric": "hub_utilization_rate_capped",
  "filters": [
    {
      "field": "Tipo_Coordinador",
      "value": "Coordinador Senior",
      "operator": "eq"
    }
  ],
  "operation": "count",
  "source_pattern": "transaction"
}
```

---

## Section 2 — Surface 2: Intent executor c4 / scalar_multiply path

### 2.1 File inventory

```
=== find intent-executor* ===
web/src/lib/calculation/intent-executor.ts

=== find scalar*multiply* / *scalar* ===
(no matches)

=== grep scalar_multiply in lib ===
web/src/lib/reconciliation/employee-reconciliation-trace.ts
web/src/lib/intelligence/trajectory-engine.ts
web/src/lib/intelligence/convergence-service.ts
web/src/lib/forensics/trace-builder.ts
web/src/lib/compensation/ai-plan-interpreter.ts
web/src/lib/calculation/intent-executor.ts
web/src/lib/calculation/run-calculation.ts
web/src/lib/calculation/pattern-signature.ts
web/src/lib/calculation/intent-validator.ts
web/src/lib/calculation/intent-transformer.ts
web/src/lib/calculation/intent-types.ts
web/src/lib/calculation/primitive-registry.ts
web/src/lib/calculation/decimal-precision.ts
web/src/lib/calculation/results-formatter.ts
web/src/lib/ai/providers/anthropic-adapter.ts
web/src/lib/orchestration/metric-resolver.ts
web/src/lib/domain/domains/franchise.ts
web/src/lib/domain/domains/icm.ts
web/src/lib/domain/domains/rebate.ts
web/src/lib/domain/domain-registry.ts
```

Targeted execution surface: `web/src/lib/calculation/intent-executor.ts` (sole `executeScalarMultiply` definition; per project convention HF-188, intent-executor is sole calculation authority).

### 2.2 scalar_multiply evaluation function — full source

**File:** `web/src/lib/calculation/intent-executor.ts`
**Lines:** 299-310

```typescript
function executeScalarMultiply(
  op: ScalarMultiply,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  const rateValue = typeof op.rate === 'number'
    ? toDecimal(op.rate)
    : resolveValue(op.rate, data, inputLog, trace);
  return inputValue.mul(rateValue);
}
```

### 2.3 Component input resolution function — `resolveValue`

**File:** `web/src/lib/calculation/intent-executor.ts`
**Lines:** 159-171

```typescript
function resolveValue(
  sourceOrOp: IntentSource | IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  if (isIntentOperation(sourceOrOp)) {
    // Recursive: execute the nested operation to get a value
    return executeOperation(sourceOrOp, data, inputLog, trace);
  }
  // Existing: resolve from entity data
  return resolveSource(sourceOrOp, data, inputLog);
}
```

### 2.3.1 Source resolution function — `resolveSource` (metric branch + ratio branch)

**File:** `web/src/lib/calculation/intent-executor.ts`
**Lines:** 68-153

```typescript
function resolveSource(
  src: IntentSource,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  switch (src.source) {
    case 'metric': {
      const field = src.sourceSpec.field;
      // Strip "metric:" prefix if present
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      const raw = data.metrics[key] ?? 0;
      inputLog[field] = { source: 'metric', rawValue: data.metrics[key], resolvedValue: raw };
      {
        const _line = `[CalcTrace] resolveSource:metric_lookup entity=${data.entityId} | field=${field} | key=${key} | rawValueInMetrics=${data.metrics[key]} | resolvedValue=${raw} | metricsKeys=[${Object.keys(data.metrics).join(',')}]`;
        if (process.env.CALC_TRACE_VERBOSE === 'true') {
          if (data.traceCollector) data.traceCollector(_line); else console.log(_line);
        }
      }
      return toDecimal(raw);
    }
    case 'ratio': {
      const numKey = src.sourceSpec.numerator.startsWith('metric:')
        ? src.sourceSpec.numerator.slice(7) : src.sourceSpec.numerator;
      const denKey = src.sourceSpec.denominator.startsWith('metric:')
        ? src.sourceSpec.denominator.slice(7) : src.sourceSpec.denominator;
      const num = toDecimal(data.metrics[numKey] ?? 0);
      const den = toDecimal(data.metrics[denKey] ?? 0);
      const val = den.isZero() ? ZERO : num.div(den);
      inputLog[`ratio(${numKey}/${denKey})`] = {
        source: 'ratio',
        rawValue: { numerator: toNumber(num), denominator: toNumber(den) },
        resolvedValue: toNumber(val),
      };
      return val;
    }
    case 'aggregate': {
      const field = src.sourceSpec.field;
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      if (src.sourceSpec.scope === 'group' && data.groupMetrics) {
        const raw = data.groupMetrics[key] ?? 0;
        inputLog[`aggregate:group:${key}`] = { source: 'aggregate:group', rawValue: raw, resolvedValue: raw };
        return toDecimal(raw);
      }
      const raw = data.metrics[key] ?? 0;
      inputLog[`aggregate:${src.sourceSpec.scope}:${key}`] = {
        source: `aggregate:${src.sourceSpec.scope}`,
        rawValue: raw,
        resolvedValue: raw,
      };
      return toDecimal(raw);
    }
    case 'constant': {
      inputLog[`constant:${src.value}`] = { source: 'constant', rawValue: src.value, resolvedValue: src.value };
      return toDecimal(src.value);
    }
    case 'entity_attribute': {
      const attr = src.sourceSpec.attribute;
      const raw = data.attributes[attr];
      const val = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseFloat(raw) || 0 : 0);
      inputLog[`attr:${attr}`] = { source: 'entity_attribute', rawValue: raw, resolvedValue: val };
      return toDecimal(val);
    }
    case 'prior_component': {
      const idx = src.sourceSpec.componentIndex;
      const val = data.priorResults?.[idx] ?? 0;
      inputLog[`prior:${idx}`] = { source: 'prior_component', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Cross-data count — reads pre-computed count/sum from crossDataCounts
    case 'cross_data': {
      const { dataType, field, aggregation } = src.sourceSpec;
      const key = field ? `${dataType}:${aggregation}:${field}` : `${dataType}:${aggregation}`;
      const val = data.crossDataCounts?.[key] ?? 0;
      inputLog[`cross_data:${key}`] = { source: 'cross_data', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Scope aggregate — reads pre-computed hierarchical aggregate from scopeAggregates
    case 'scope_aggregate': {
      const { field, scope, aggregation } = src.sourceSpec;
      const key = `${scope}:${field}:${aggregation}`;
      const val = data.scopeAggregates?.[key] ?? 0;
      inputLog[`scope_aggregate:${key}`] = { source: 'scope_aggregate', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
  }
}
```

### 2.4 Rate/multiplier extraction

The rate is extracted within `executeScalarMultiply` itself (Section 2.2 above): `op.rate` is either a `number` (literal) or another `IntentSource | IntentOperation` resolved via `resolveValue`. For the c4 senior component (Section 1.3), `rate: 800` is a numeric literal.

### 2.5 Unit-conversion or scaling logic in scalar_multiply path

No unit-conversion or scaling logic is present within `executeScalarMultiply` (lines 299-310, paste in Section 2.2). The function consists of: resolve input → resolve rate → return `inputValue.mul(rateValue)`. No percentage-to-ratio conversion. No cap. No clamp. No modifier applied at this site.

### 2.6 executeOperation dispatcher (where scalar_multiply is dispatched)

**File:** `web/src/lib/calculation/intent-executor.ts`
**Lines:** 486-503 (excerpt of switch)

```typescript
export function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  switch (op.operation) {
    case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
    case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
    case 'aggregate':         return executeAggregateOp(op, data, inputLog);
    case 'ratio':             return executeRatioOp(op, data, inputLog);
    case 'constant':          return executeConstantOp(op);
    case 'weighted_blend':    return executeWeightedBlend(op, data, inputLog, trace);
    case 'temporal_window':   return executeTemporalWindow(op, data, inputLog, trace);
    case 'linear_function':   return executeLinearFunction(op, data, inputLog, trace);
    case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
    /* ... default: throws IntentExecutorUnknownOperationError ... */
```

---

## Section 3 — Surface 3: Convergence binding construction

### 3.1 hub_utilization_rate_capped occurrences in source code

```
$ grep -rln "hub_utilization_rate_capped" web/src --include="*.ts"
(no matches)
```

The literal string `hub_utilization_rate_capped` does NOT appear in the source code. The metric key is constructed entirely from rule_set bindings persisted in the database (per Section 1.6 above).

### 3.2 convergence_bindings construction — entry point

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `convergeBindings`

```typescript
164: export async function convergeBindings(
165:   tenantId: string,
166:   ruleSetId: string,
167:   supabase: SupabaseClient,
168:   calculationRunId?: string,  // OB-197 G11: scope signals emitted by this convergence to a calculation run
169: ): Promise<ConvergenceResult> {
170:   const derivations: MetricDerivationRule[] = [];
171:   const matchReport: ConvergenceResult['matchReport'] = [];
172:   const signals: ConvergenceResult['signals'] = [];
173:   const gaps: ConvergenceGap[] = [];
```

Function body is ~1700 lines (lines 164-1780+). Function constructs `componentBindings` Map keyed by `compKey` (e.g., `component_4`) with role-keyed binding entries (`actual`, `row`, `column`, `period`, `entity_identifier`, etc.).

Key construction sites for binding role assignment within `convergeBindings`:

```typescript
484:      if (!componentBindings[compKey]) componentBindings[compKey] = {};
...
487:        componentBindings[compKey]['target'] = {
```

(Full body not embedded here per scope minimization. File inspection confirms the function returns `ConvergenceResult` containing `componentBindings` which is what gets persisted into `rule_sets.input_bindings.convergence_bindings`.)

### 3.3 metric_derivations consumption — `applyMetricDerivations`

**File:** `web/src/lib/calculation/run-calculation.ts`
**Lines:** 59-196

```typescript
/**
 * A single metric derivation rule from input_bindings.metric_derivations.
 * Domain-agnostic: field names, values, and operators come from config.
 */
export interface MetricDerivationRule {
  metric: string;          // Target metric name (from plan configuration)
  operation: 'count' | 'sum' | 'delta' | 'ratio';  // Derivation operation
  source_pattern: string;  // Regex pattern to match data_type/sheet name
  filters: Array<{
    field: string;         // Field name in row_data (discovered at runtime)
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
    value: string | number | boolean;
  }>;
  source_field?: string;   // OB-119: Field to sum (for operation='sum' or 'delta')
  // OB-128: Ratio operation — computes numerator/denominator from already-derived metrics
  numerator_metric?: string;   // metric name to use as numerator (must be derived earlier)
  denominator_metric?: string; // metric name to use as denominator (must be derived earlier)
  scale_factor?: number;       // multiply ratio result (e.g., 100 for percentage)
}

// HF-172 + OB-186: Filter check helper — exported for use in scope aggregate pre-computation
export function rowMatchesFilters(
  rd: Record<string, unknown>,
  filters: MetricDerivationRule['filters'],
): boolean {
  if (!filters || filters.length === 0) return true;
  return filters.every(filter => {
    const fieldValue = rd[filter.field];
    switch (filter.operator) {
      case 'eq':       return fieldValue === filter.value;
      case 'neq':      return fieldValue !== filter.value;
      case 'gt':       return typeof fieldValue === 'number' && fieldValue > (filter.value as number);
      case 'gte':      return typeof fieldValue === 'number' && fieldValue >= (filter.value as number);
      case 'lt':       return typeof fieldValue === 'number' && fieldValue < (filter.value as number);
      case 'lte':      return typeof fieldValue === 'number' && fieldValue <= (filter.value as number);
      case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(String(filter.value));
      default:         return false;
    }
  });
}

export function applyMetricDerivations(
  entitySheetData: Map<string, Array<{ row_data: Json }>>,
  derivations: MetricDerivationRule[],
  priorPeriodData?: Map<string, Array<{ row_data: Json }>>
): Record<string, number> {
  const derived: Record<string, number> = {};

  for (const rule of derivations) {
    // HF-172: source_pattern is provenance metadata, NOT a row filter.
    // All entity rows within the period's date range are candidates.
    // Content filtering is done by the filters array, not source_pattern.
    let matchingRows: Array<{ row_data: Json }> = [];
    for (const [, rows] of Array.from(entitySheetData.entries())) {
      matchingRows = matchingRows.concat(rows);
    }

    // OB-128: Ratio operation works on already-derived metrics, not raw rows
    if (rule.operation === 'ratio') {
      const num = derived[rule.numerator_metric || ''] ?? 0;
      const den = derived[rule.denominator_metric || ''] ?? 0;
      derived[rule.metric] = den !== 0 ? (num / den) * (rule.scale_factor ?? 1) : 0;
      continue;
    }

    if (matchingRows.length === 0) continue;

    // Apply derivation operation
    if (rule.operation === 'sum' && rule.source_field) {
      // HF-172: Apply filters to sum (was missing — caused cross-category aggregation)
      let total = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown>
          : {};
        if (!rowMatchesFilters(rd, rule.filters)) continue;
        const val = rd[rule.source_field];
        if (typeof val === 'number') total += val;
      }
      derived[rule.metric] = total;
    } else if (rule.operation === 'delta' && rule.source_field) {
      // OB-121: Period-over-period delta = current_sum - prior_sum
      // HF-172: Apply filters to both current and prior period loops
      let currentTotal = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown>
          : {};
        if (!rowMatchesFilters(rd, rule.filters)) continue;
        const val = rd[rule.source_field];
        if (typeof val === 'number') currentTotal += val;
      }

      let priorTotal = 0;
      if (priorPeriodData) {
        // HF-172: Include ALL prior period rows, not just source_pattern matches
        for (const [, rows] of Array.from(priorPeriodData.entries())) {
          for (const row of rows) {
            const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
              ? row.row_data as Record<string, unknown>
              : {};
            if (!rowMatchesFilters(rd, rule.filters)) continue;
            const val = rd[rule.source_field];
            if (typeof val === 'number') priorTotal += val;
          }
        }
      }

      derived[rule.metric] = currentTotal - priorTotal;
      if (!priorPeriodData) {
        console.log(`[Derivation] delta: no prior period data for "${rule.metric}" — using current value only`);
      }
    } else if (rule.operation === 'count') {
      // HF-172: Uses same rowMatchesFilters helper (was already correct, now DRY)
      let count = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown>
          : {};
        if (rowMatchesFilters(rd, rule.filters)) count++;
      }
      derived[rule.metric] = count;
    }
  }

  return derived;
}
```

### 3.3.1 metric_derivations parse site (where rules are read from rule_set into engine state)

**File:** `web/src/app/api/calculation/run/route.ts`
**Lines:** 860-861

```typescript
  const metricDerivations: MetricDerivationRule[] =
    (inputBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];
```

### 3.3.2 metric_derivations application site

**File:** `web/src/app/api/calculation/run/route.ts`
**Line:** 1371 (inside per-entity loop)

```typescript
1371:      ? applyMetricDerivations(derivationInput, metricDerivations, entityPriorData)
```

### 3.4 OB-118 / HF-206 merge guard — full source

**File:** `web/src/app/api/calculation/run/route.ts`
**Lines:** 1729-1743

```typescript
1729:      // OB-118 / HF-206: Convergence-resolved metrics are authoritative (Decision 111 /
1730:      // Decision 153 atomic cutover completion). Derivation fills gaps only — a metric
1731:      // resolved by convergence cannot be overwritten by Pass 4 derivation output.
1732:      // IRA HF-206 (2026-05-06, $1.671075; ira_request_hash cfcef09e02e70710dbd5e523b1eb4ef27aedf50ccb6776ed75784c8963d9bb43)
1733:      // recommended Shape A as minimum-viable coherence restoration.
1734:      for (const [key, value] of Object.entries(derivedMetrics)) {
1735:        if (!(key in metrics)) {
1736:          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
1737:        } else {
1738:          ob118MergeGuardFiredCount++;  // HF-208: track guard firings (convergence preserved over derivation)
1739:          // HF-212 TIER 3: emit exception detail inline (always visible) + push flag for Tier 2
1740:          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} type=ob118MergeGuardFired existingKey=${key} preserved=convergence`);
1741:          currentEntityFlags.push('ob118MergeGuardFired');
1742:        }
1743:      }
```

### 3.5 Merge-guard decision logic (which derivation wins)

**Decision logic site:** lines 1734-1743 above.

The decision branch (lines 1735-1742) is structured:
- IF the metric `key` is NOT yet in the convergence-resolved `metrics` object → write the derivation value (`metrics[key] = value;`) — derivation fills the gap.
- ELSE the convergence-resolved value is preserved; the derivation value is discarded; counter `ob118MergeGuardFiredCount` increments; Tier 3 EXCEPTION line emits with `existingKey=${key} preserved=convergence`.

This is the HF-206 (Shape A) coherence restoration: convergence-resolved metrics are authoritative; derivation cannot overwrite them.

### 3.6 ob118MergeGuardFiredCount declaration + Tier 1 footer surface

**File:** `web/src/app/api/calculation/run/route.ts`
**Lines:** 99 (declaration), 2399 (Tier 1 footer)

```typescript
99:  let ob118MergeGuardFiredCount = 0;
...
2399:  addLog(`[CalcRecon-T1] flags={diag003Fallback:${diag003FallbackCount}/${t1FooterTotalLookups} boundaryFallback:${boundaryFallbackCount} ob118MergeGuardFired:${ob118MergeGuardFiredCount}/${t1FooterTotalLookups}}`);
```

---

## Section 4 — Surface 4: Live data trace for entity 70010

### 4a Entity record

```json
{
  "id": "988f6053-bfe1-45cf-a8d8-6d25e4ceef0b",
  "external_id": "70010",
  "display_name": "Antonio López Hernández",
  "metadata": {
    "region": "Norte",
    "fecha_ingreso": "2018-04-08",
    "tipo_coordinador": "Coordinador Senior"
  }
}
```

### 4b committed_data rows for entity 70010 (4 rows)

```json
[
  {
    "id": "5a627cfd-08e3-4af0-a017-45906b6054b6",
    "data_type": "transaction",
    "row_data": {
      "Hub": "Monterrey Hub",
      "Mes": 1,
      "Año": 2025,
      "Nombre": "Antonio López Hernández",
      "Region": "Norte",
      "_rowIndex": 1,
      "_sheetName": "Datos_Rendimiento",
      "No_Empleado": "70010",
      "Ingreso_Meta": 361978,
      "Ingreso_Real": 440003,
      "Cuentas_Nuevas": 8,
      "Entregas_Tiempo": 97,
      "Cargas_Flota_Hub": 1083,
      "Entregas_Totales": 99,
      "Tipo_Coordinador": "Coordinador Senior",
      "Volumen_Rutas_Hub": 1083,
      "Capacidad_Flota_Hub": 1306,
      "Pct_Entregas_Tiempo": 0.9798,
      "Cumplimiento_Ingreso": 1.2156,
      "Incidentes_Seguridad": 0,
      "Tasa_Utilizacion_Hub": 0.8292
    },
    "period_id": null,
    "source_date": "2025-01-01",
    "metadata": {
      "source": "sci-bulk",
      "proposalId": "7c8a7c70-c513-4a21-a650-68edd9c0a475",
      "entity_id_field": "No_Empleado",
      "resolved_data_type": "transaction",
      "informational_label": "transaction"
      /* full semantic_roles + field_identities present in source — see /tmp/diag-035-surface4.json lines 42-242 */
    }
  },
  {
    "id": "edebec8b-e927-416a-a68b-fe106820d3e0",
    "data_type": "transaction",
    "row_data": {
      "Hub": "Monterrey Hub",
      "Mes": 3,
      "Año": 2025,
      "Nombre": "Antonio López Hernández",
      "Region": "Norte",
      "_rowIndex": 135,
      "_sheetName": "Datos_Rendimiento",
      "No_Empleado": "70010",
      "Ingreso_Meta": 343324,
      "Ingreso_Real": 448704,
      "Cuentas_Nuevas": 1,
      "Entregas_Tiempo": 45,
      "Cargas_Flota_Hub": 925,
      "Entregas_Totales": 49,
      "Tipo_Coordinador": "Coordinador Senior",
      "Volumen_Rutas_Hub": 925,
      "Capacidad_Flota_Hub": 956,
      "Pct_Entregas_Tiempo": 0.9184,
      "Cumplimiento_Ingreso": 1.3069,
      "Incidentes_Seguridad": 0,
      "Tasa_Utilizacion_Hub": 0.9676
    },
    "period_id": null,
    "source_date": "2025-03-01",
    "metadata": { "source": "sci-bulk", "entity_id_field": "No_Empleado", "resolved_data_type": "transaction", "informational_label": "transaction" /* full metadata in /tmp file */ }
  },
  {
    "id": "9474fc89-3907-48d5-ad54-fbc5c256c3e9",
    "data_type": "entity",
    "row_data": {
      "Region": "Norte",
      "_rowIndex": 1,
      "_sheetName": "Plantilla",
      "No_Empleado": "70010",
      "Hub_Asignado": "Monterrey Hub",
      "Fecha_Ingreso": "2018-04-08",
      "Nombre_Completo": "Antonio López Hernández",
      "Tipo_Coordinador": "Coordinador Senior"
    },
    "period_id": null,
    "source_date": null,
    "metadata": { "source": "sci-bulk", "entity_id_field": "No_Empleado", "resolved_data_type": "entity", "informational_label": "entity" /* full metadata in /tmp file */ }
  },
  {
    "id": "6d75c5a8-8508-44c5-a477-a16c8099d204",
    "data_type": "transaction",
    "row_data": {
      "Hub": "Monterrey Hub",
      "Mes": 2,
      "Año": 2025,
      "Nombre": "Antonio López Hernández",
      "Region": "Norte",
      "_rowIndex": 68,
      "_sheetName": "Datos_Rendimiento",
      "No_Empleado": "70010",
      "Ingreso_Meta": 446709,
      "Ingreso_Real": 526906,
      "Cuentas_Nuevas": 1,
      "Entregas_Tiempo": 51,
      "Cargas_Flota_Hub": 1157,
      "Entregas_Totales": 63,
      "Tipo_Coordinador": "Coordinador Senior",
      "Volumen_Rutas_Hub": 1157,
      "Capacidad_Flota_Hub": 1361,
      "Pct_Entregas_Tiempo": 0.8095,
      "Cumplimiento_Ingreso": 1.1795,
      "Incidentes_Seguridad": 0,
      "Tasa_Utilizacion_Hub": 0.8501
    },
    "period_id": null,
    "source_date": "2025-02-01",
    "metadata": { "source": "sci-bulk", "entity_id_field": "No_Empleado", "resolved_data_type": "transaction", "informational_label": "transaction" /* full metadata in /tmp file */ }
  }
]
```

(Full unabbreviated metadata.semantic_roles + metadata.field_identities for each row preserved in `/tmp/diag-035-surface4.json` lines 13-791. Truncation here is for readability of the markdown; no field values modified.)

### 4c Hub reference rows (entity_id IS NULL)

```json
[]
```

The query `committed_data WHERE tenant_id = '5035b1e8-...' AND entity_id IS NULL` returned an empty array. No hub-level reference rows exist with `entity_id IS NULL` for tenant Meridian post fresh-import.

### 4d calculation_result for entity 70010 in batch dcba5168

```json
{
  "id": "094476ab-4f72-4d5a-bea7-19f480d58966",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "batch_id": "dcba5168-f67b-49a2-8e48-b3f3f292677e",
  "entity_id": "988f6053-bfe1-45cf-a8d8-6d25e4ceef0b",
  "rule_set_id": "3d629051-f788-44f6-a546-45876dd187b1",
  "period_id": "92abe950-d50c-44fb-8436-a88e3697a612",
  "total_payout": 98548,
  "components": [
    {
      "payout": 600,
      "details": {
        "intentInputs": {
          "hub_route_volume": { "source": "metric", "rawValue": 99, "resolvedValue": 99 },
          "revenue_goal_attainment": { "source": "metric", "rawValue": 121.56, "resolvedValue": 121.56 }
        },
        "intentPayout": 600,
        "fallbackSource": "calculationIntent",
        "intentOperation": "bounded_lookup_2d"
      },
      "componentId": "revenue_performance_senior",
      "componentName": "Revenue Performance - Senior",
      "componentType": "bounded_lookup_2d"
    },
    {
      "payout": 0,
      "details": {},
      "componentId": "on_time_delivery_senior",
      "componentName": "On-Time Delivery - Senior",
      "componentType": "bounded_lookup_1d"
    },
    {
      "payout": 700,
      "details": {
        "intentInputs": {
          "new_accounts_count": { "source": "metric", "rawValue": 2, "resolvedValue": 2 }
        },
        "intentPayout": 700,
        "fallbackSource": "calculationIntent",
        "intentOperation": "scalar_multiply"
      },
      "componentId": "new_accounts_senior",
      "componentName": "New Accounts - Senior",
      "componentType": "scalar_multiply"
    },
    {
      "payout": 0,
      "details": {},
      "componentId": "safety_record_senior",
      "componentName": "Safety Record - Senior",
      "componentType": "conditional_gate"
    },
    {
      "payout": 97248,
      "details": {
        "intentInputs": {
          "hub_utilization_rate_capped": { "source": "metric", "rawValue": 121.56, "resolvedValue": 121.56 }
        },
        "intentPayout": 97248,
        "fallbackSource": "calculationIntent",
        "intentOperation": "scalar_multiply"
      },
      "componentId": "fleet_utilization_senior",
      "componentName": "Fleet Utilization - Senior",
      "componentType": "scalar_multiply"
    }
  ],
  "metrics": {
    "Mes": 1,
    "Año": 2025,
    "_rowIndex": 2,
    "Ingreso_Meta": 361978,
    "Ingreso_Real": 440003,
    "Cuentas_Nuevas": 8,
    "Entregas_Tiempo": 97,
    "Cargas_Flota_Hub": 1083,
    "Entregas_Totales": 99,
    "Volumen_Rutas_Hub": 1083,
    "Capacidad_Flota_Hub": 1306,
    "Pct_Entregas_Tiempo": 0.9798,
    "Cumplimiento_Ingreso": 1.2156,
    "Incidentes_Seguridad": 0,
    "Tasa_Utilizacion_Hub": 0.8292
  },
  "attainment": { "overall": 0 },
  "metadata": {
    "entityName": "Antonio López Hernández",
    "externalId": "70010",
    "intentMatch": true,
    "intentTotal": 98548,
    "legacyTotal": 98548,
    "intentTraces": [
      {
        "inputs": {
          "hub_route_volume": { "source": "metric", "rawValue": 99, "resolvedValue": 99 },
          "revenue_goal_attainment": { "source": "metric", "rawValue": 121.56, "resolvedValue": 121.56 }
        },
        "entityId": "988f6053-bfe1-45cf-a8d8-6d25e4ceef0b",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 600,
        "componentType": "bounded_lookup_2d",
        "componentIndex": 0,
        "lookupResolution": {
          "outputValue": 600,
          "rowBoundaryMatched": { "max": 130, "min": 100, "index": 3 },
          "columnBoundaryMatched": { "max": 500, "min": 0, "index": 0 }
        }
      },
      {
        "inputs": { "on_time_delivery_percentage": { "source": "metric", "rawValue": 121.56, "resolvedValue": 121.56 } },
        "entityId": "988f6053-bfe1-45cf-a8d8-6d25e4ceef0b",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 0,
        "componentType": "bounded_lookup_1d",
        "componentIndex": 1,
        "lookupResolution": { "outputValue": 0 }
      },
      {
        "inputs": { "new_accounts_count": { "source": "metric", "rawValue": 2, "resolvedValue": 2 } },
        "entityId": "988f6053-bfe1-45cf-a8d8-6d25e4ceef0b",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 700,
        "componentType": "scalar_multiply",
        "componentIndex": 2
      },
      {
        "inputs": {
          "constant:0": { "source": "constant", "rawValue": 0, "resolvedValue": 0 },
          "safety_incidents_count": { "source": "metric", "rawValue": 2, "resolvedValue": 2 }
        },
        "entityId": "988f6053-bfe1-45cf-a8d8-6d25e4ceef0b",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 0,
        "componentType": "conditional_gate",
        "componentIndex": 3
      },
      {
        "inputs": { "hub_utilization_rate_capped": { "source": "metric", "rawValue": 121.56, "resolvedValue": 121.56 } },
        "entityId": "988f6053-bfe1-45cf-a8d8-6d25e4ceef0b",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 97248,
        "componentType": "scalar_multiply",
        "componentIndex": 4
      }
    ],
    "roundingTrace": {
      "rawTotal": 98548,
      "components": [
        { "label": "Revenue Performance - Senior", "rawValue": 600, "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" }, "roundedValue": 600, "componentIndex": 0, "roundingAdjustment": 0 },
        { "label": "On-Time Delivery - Senior", "rawValue": 0, "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" }, "roundedValue": 0, "componentIndex": 1, "roundingAdjustment": 0 },
        { "label": "New Accounts - Senior", "rawValue": 700, "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" }, "roundedValue": 700, "componentIndex": 2, "roundingAdjustment": 0 },
        { "label": "Safety Record - Senior", "rawValue": 0, "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" }, "roundedValue": 0, "componentIndex": 3, "roundingAdjustment": 0 },
        { "label": "Fleet Utilization - Senior", "rawValue": 97248, "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" }, "roundedValue": 97248, "componentIndex": 4, "roundingAdjustment": 0 }
      ],
      "roundedTotal": 98548,
      "totalRoundingAdjustment": 0
    }
  },
  "created_at": "2026-05-08T04:03:14.359455+00:00"
}
```

### 4e calculation_traces for that result

```json
[]
```

The query `calculation_traces WHERE tenant_id = '5035b1e8-...' AND result_id = '094476ab-...'` returned an empty array. Either the `calculation_traces` table contains no rows for this result, or this surface is not populated by the current calc-write path; the in-result `metadata.intentTraces` block (Section 4d above) contains the per-component trace inline.

---

## Section 5 — Surface read-back inventory

| Surface | Read | Findings captured | Notes |
|---|---|---|---|
| 1: Rule set components + input_bindings | yes | yes | 1204 lines JSON captured to `/tmp/diag-035-surface1.json`; full c4 components for both variants embedded; full input_bindings (metric_derivations + convergence_bindings) embedded; c4 convergence binding component_4 isolated; metric_derivation rule for `hub_utilization_rate_capped` isolated |
| 2: Intent executor scalar_multiply path | yes | yes | `executeScalarMultiply` (lines 299-310), `resolveValue` (lines 159-171), `resolveSource` (lines 68-153), `executeOperation` switch (lines 486-503) all pasted verbatim. No unit-conversion or scaling logic present in scalar_multiply path. |
| 3: Convergence binding + metric_derivations + OB-118 merge guard | yes | yes | `hub_utilization_rate_capped` literal NOT FOUND in source code (Korean Test compliance: key constructed dynamically from rule_set bindings). `convergeBindings` entry point + applyMetricDerivations + MetricDerivationRule interface + OB-118/HF-206 merge guard all pasted verbatim. |
| 4: Live data trace entity 70010 | yes | yes | Entity record + 4 committed_data rows + hub-reference query (returned `[]`) + calculation_result + calculation_traces query (returned `[]`) all captured. In-result `metadata.intentTraces` provides per-component trace inline. |

---

## Section 6 — Read-only execution log

```
$ git checkout main && git pull origin main
Switched to branch 'main'
Already up to date.
From https://github.com/CCAFRICA/spm-platform
 * branch              main       -> FETCH_HEAD

$ git rev-parse HEAD
b074f82f49e5785d15789ece17979d5071efc3d8

$ git checkout -b diag-019-c4-magnitude-probe
Switched to a new branch 'diag-019-c4-magnitude-probe'

# === Surface 1 query ===
$ npx tsx -e '<rule_set query>' > /tmp/diag-035-surface1.json 2>&1; echo "EXIT=$?"; wc -l /tmp/diag-035-surface1.json
EXIT=0
1204 /tmp/diag-035-surface1.json

# === Surface 2 file inventory ===
$ find web/src -name "intent-executor*" -type f
web/src/lib/calculation/intent-executor.ts

$ find web/src -name "scalar*multiply*" -type f -o -name "*scalar*"
(no matches)

$ grep -rln "scalar_multiply" web/src/lib --include="*.ts"
(20 matches — see Section 2.1)

$ grep -n "executeScalarMultiply\|scalar_multiply" web/src/lib/calculation/intent-executor.ts
299:function executeScalarMultiply(
495:    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);

$ grep -n "function resolveValue\|function resolveSource\|function executeScalarMultiply" web/src/lib/calculation/intent-executor.ts
68:function resolveSource(
159:function resolveValue(
299:function executeScalarMultiply(

# === Surface 3 file inventory ===
$ grep -rln "hub_utilization_rate_capped" web/src --include="*.ts"
(no matches)

$ grep -rln "convergence_bindings" web/src/lib --include="*.ts"
web/src/lib/intelligence/convergence-service.ts

$ grep -rln "metric_derivations" web/src/lib --include="*.ts"
web/src/lib/calculation/run-calculation.ts

$ grep -rln "ob118" web/src --include="*.ts" -i
web/src/app/api/calculation/run/route.ts

$ grep -n "convergence_bindings" web/src/lib/intelligence/convergence-service.ts
(7 matches — see Section 3.2)

$ grep -n "metric_derivations\|MetricDerivation" web/src/lib/calculation/run-calculation.ts
59 (interface comment), 62 (interface), 86 (function param doc), 93 (filter type),
111 (function), 113 (param), 860-861 (parse site), 1371 (application site)

$ grep -n "OB-118\|ob118MergeGuardFiredCount\|HF-206" web/src/app/api/calculation/run/route.ts
99:  let ob118MergeGuardFiredCount = 0;
280:  // ── OB-118: Parse metric derivation rules from input_bindings ──
285:    addLog(`OB-118 Metric derivations: ${metricDerivations.length} rules from input_bindings`);
1650:    // ── OB-118: Derive metrics once per entity from loaded data ──
1729:      // OB-118 / HF-206: Convergence-resolved metrics are authoritative ...
1738:          ob118MergeGuardFiredCount++;
2399:  addLog(`[CalcRecon-T1] flags={diag003Fallback:... boundaryFallback:... ob118MergeGuardFired:${ob118MergeGuardFiredCount}/${t1FooterTotalLookups}}`);

# === Surface 4 query ===
$ npx tsx -e '<entity 70010 + committed_data + hub + result + traces>' > /tmp/diag-035-surface4.json 2>&1; echo "EXIT=$?"
EXIT=0
$ wc -l /tmp/diag-035-surface4.json
1078 /tmp/diag-035-surface4.json
$ grep -c "ERROR" /tmp/diag-035-surface4.json
0
```

---
