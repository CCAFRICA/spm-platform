# E3.4 — Calculation results for selected (entity, period) (verbatim)

Selected: entity `007da35a-8e65-453b-ada9-b62337fd8683` × period `3c2557f4-d922-4b30-a073-ac4811f1f3cb` (January 2025).

## E3.4a — `calculation_results` (1 row)

```json
{
  "id": "a159f155-1eb1-4324-8504-a273c5035997",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "batch_id": "ef33e29f-d8f8-4b4f-8022-e183033b3800",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "rule_set_id": "939cf576-4096-4ceb-a142-539a486868b3",
  "period_id": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
  "total_payout": 1402,
  "components": [
    {
      "payout": 300,
      "details": {
        "intentInputs": {
          "hub_route_volume":           { "source": "metric", "rawValue": 116,  "resolvedValue": 116 },
          "revenue_goal_attainment":    { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "intentPayout": 300,
        "fallbackSource": "calculationIntent",
        "intentOperation": "bounded_lookup_2d"
      },
      "componentId": "revenue_performance_senior",
      "componentName": "Revenue Performance - Senior",
      "componentType": "bounded_lookup_2d"
    },
    {
      "payout": 400,
      "details": {
        "intentInputs": {
          "on_time_delivery_percentage": { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "intentPayout": 400,
        "fallbackSource": "calculationIntent",
        "intentOperation": "bounded_lookup_1d"
      },
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
      "payout": 2,
      "details": {
        "intentInputs": {
          "ratio(hub_total_loads/hub_total_capacity)": {
            "source": "ratio",
            "rawValue": { "numerator": 116, "denominator": 116 },
            "resolvedValue": 1
          }
        },
        "intentPayout": 800,
        "fallbackSource": "calculationIntent",
        "intentOperation": "scalar_multiply"
      },
      "componentId": "fleet_utilization_senior",
      "componentName": "Fleet Utilization - Senior",
      "componentType": "scalar_multiply"
    }
  ],
  "metrics": {
    "Mes": 1, "Año": 2025, "_rowIndex": 72,
    "Ingreso_Meta": 151402, "Ingreso_Real": 143414,
    "Cuentas_Nuevas": 0, "Entregas_Tiempo": 102,
    "Cargas_Flota_Hub": 1044, "Entregas_Totales": 116,
    "Volumen_Rutas_Hub": 1044, "Capacidad_Flota_Hub": 1370,
    "Pct_Entregas_Tiempo": 0.8793, "Cumplimiento_Ingreso": 0.9472,
    "Incidentes_Seguridad": 0, "Tasa_Utilizacion_Hub": 0.762
  },
  "attainment": { "overall": 0 },
  "metadata": {
    "entityName": "Norma Rodríguez Rivera",
    "externalId": "70209",
    "intentMatch": false,
    "intentTotal": 1402,
    "legacyTotal": 2200,
    "intentTraces": [
      {
        "inputs": {
          "hub_route_volume":           { "source": "metric", "rawValue": 116,  "resolvedValue": 116 },
          "revenue_goal_attainment":    { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 300,
        "componentType": "bounded_lookup_2d",
        "componentIndex": 0,
        "lookupResolution": {
          "outputValue": 300,
          "rowBoundaryMatched":    { "max": 100, "min": 90, "index": 2 },
          "columnBoundaryMatched": { "max": 500, "min": 0,  "index": 0 }
        }
      },
      {
        "inputs": {
          "on_time_delivery_percentage": { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 400,
        "componentType": "bounded_lookup_1d",
        "componentIndex": 1,
        "lookupResolution": {
          "outputValue": 400,
          "rowBoundaryMatched": { "max": 95, "min": 90, "index": 2 }
        }
      },
      {
        "inputs": {
          "new_accounts_count": { "source": "metric", "rawValue": 2, "resolvedValue": 2 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 700,
        "componentType": "scalar_multiply",
        "componentIndex": 2
      },
      {
        "inputs": {
          "constant:0":             { "source": "constant", "rawValue": 0, "resolvedValue": 0 },
          "safety_incidents_count": { "source": "metric",   "rawValue": 2, "resolvedValue": 2 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 0,
        "componentType": "conditional_gate",
        "componentIndex": 3
      },
      {
        "inputs": {
          "hub_total_loads":    { "source": "metric", "rawValue": 116, "resolvedValue": 116 },
          "hub_total_capacity": { "source": "metric", "rawValue": 116, "resolvedValue": 116 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [
          { "after": 1.5, "before": 800, "modifier": "cap" }
        ],
        "confidence": 0.5,
        "finalOutcome": 1.5,
        "componentType": "scalar_multiply",
        "componentIndex": 4
      }
    ],
    "roundingTrace": {
      "rawTotal": 1401.5,
      "components": [
        { "label": "Revenue Performance - Senior", "rawValue": 300, "roundedValue": 300, "componentIndex": 0, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "On-Time Delivery - Senior",     "rawValue": 400, "roundedValue": 400, "componentIndex": 1, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "New Accounts - Senior",         "rawValue": 700, "roundedValue": 700, "componentIndex": 2, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "Safety Record - Senior",        "rawValue": 0,   "roundedValue": 0,   "componentIndex": 3, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "Fleet Utilization - Senior",    "rawValue": 1.5, "roundedValue": 2,   "componentIndex": 4, "roundingAdjustment": 0.5, "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } }
      ],
      "roundedTotal": 1402,
      "totalRoundingAdjustment": 0.5
    }
  },
  "created_at": "2026-05-09T21:06:12.314139+00:00"
}
```

## E3.4b — `entity_period_outcomes` (1 row)

```json
{
  "id": "85a6224a-144e-46e6-96ee-38e240e83a8d",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
  "total_payout": 1402,
  "rule_set_breakdown": [
    { "rule_set_id": "939cf576-4096-4ceb-a142-539a486868b3", "total_payout": 1402 }
  ],
  "component_breakdown": [
    { "payout": 300, "componentId": "revenue_performance_senior", "componentName": "Revenue Performance - Senior" },
    { "payout": 400, "componentId": "on_time_delivery_senior",    "componentName": "On-Time Delivery - Senior" },
    { "payout": 700, "componentId": "new_accounts_senior",        "componentName": "New Accounts - Senior" },
    { "payout": 0,   "componentId": "safety_record_senior",       "componentName": "Safety Record - Senior" },
    { "payout": 2,   "componentId": "fleet_utilization_senior",   "componentName": "Fleet Utilization - Senior" }
  ],
  "lowest_lifecycle_state": "PREVIEW",
  "attainment_summary": { "overall": 0 },
  "metadata": {},
  "materialized_at": "2026-05-09T21:06:12.417023+00:00"
}
```

## E3.4c — `calculation_batches` for Meridian (3 rows, most recent first)

Three batches: one per period. Each has `lifecycle_state: PREVIEW`, `entity_count: 67`, `intentLayer.matchCount: 0`, `intentLayer.concordance: "0.0%"`, `intentLayer.mismatchCount: 67`, `intentLayer.intentsTransformed: 5`.

`patternSignatures` (identical across all 3 batches):
```
"bounded_lookup_2d:metric+metric:g5x4:group"
"bounded_lookup_1d:metric:b5:group"
"scalar_multiply:metric:rate_num:group"
"conditional_gate:metric+constant:group"
"scalar_multiply:op(ratio:metric+metric):rate_num:group:cap"
```

Batch totals (verbatim from `summary.total_payout`):
| batch.id | period_id | period (deduced) | total_payout |
|---|---|---|---|
| `ef33e29f-d8f8-4b4f-8022-e183033b3800` | `3c2557f4-d922-4b30-a073-ac4811f1f3cb` | January 2025 | **$55,909** |
| `8f00d244-4ef6-4336-81eb-399714d64eaf` | `95c303a0-0287-47ed-bbe5-f0a766a6843e` | February 2025 | **$53,559** |
| `2cb59727-dc0a-46e1-b16c-05a97b84d292` | `8bfc8730-458d-4abb-96cb-dc3f936bc2da` | March 2025 | **$57,534** |

These three batch totals match the directive's empirical anchor exactly ($55,909 / $53,559 / $57,534).

## E3.5 — Logs

No application-level log surface exists for this calculation run beyond what is persisted in `calculation_batches.config.insightAnalysis` and `calculation_results.metadata.intentTraces` (already surfaced above). The `addLog` helper in `route.ts` (line 79) writes to a local `log: string[]` array and `console.log` — neither is persisted to the database; both are ephemeral to the Vercel Lambda invocation that ran on 2026-05-09T21:06:12Z. No new instrumentation added per directive ("CC does not add new instrumentation; surfaces only what already exists"). Halt-noted.

## CC observations (verbatim, not classification)

- The c4 row's `intentInputs.ratio(hub_total_loads/hub_total_capacity).rawValue` is `{ numerator: 116, denominator: 116 }`. The committed_data row for Jan 2025 (E3.1 Row 4) carries `Cargas_Flota_Hub: 1044` and `Capacidad_Flota_Hub: 1370`.
- The c4 row's `metrics.Cargas_Flota_Hub` is `1044` and `metrics.Capacidad_Flota_Hub` is `1370` (matching committed_data), but `intentTraces[4].inputs.hub_total_loads.rawValue` is `116` and `.hub_total_capacity.rawValue` is `116` (matching `Entregas_Totales: 116` in committed_data, not the binding's column targets).
- The c4 modifier entry is `{ "after": 1.5, "before": 800, "modifier": "cap" }`. The `intentPayout` is `800`; the `finalOutcome` after the cap modifier is `1.5`; the `rawValue` then `roundedValue` is `2`.
- The batch summary `intentLayer.concordance` is `"0.0%"` for all 3 periods.
- The result row's `metadata.legacyTotal` is `2200`; `intentTotal` is `1402`; `intentMatch` is `false`.
