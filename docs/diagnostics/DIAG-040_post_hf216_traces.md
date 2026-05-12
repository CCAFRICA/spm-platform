# DIAG-040 — Full intentTraces extraction (post-HF-216)

**Source row:** `calculation_results.id = 5258e916-1837-4cc3-99c2-2d480712ade6`
**Batch:** `2cd5f730-142d-46f8-adf5-34456be7ea07`
**Entity:** `007da35a-8e65-453b-ada9-b62337fd8683`
**Rule set:** `939cf576-4096-4ceb-a142-539a486868b3`
**Period:** `3c2557f4-d922-4b30-a073-ac4811f1f3cb`
**Created:** `2026-05-12T01:56:42.25842+00:00`
**Total payout:** `8952`

---

## components[] (verbatim)

```json
[
  {
    "payout": 3000,
    "details": {
      "intentInputs": {
        "hub_route_volume": {
          "source": "metric",
          "rawValue": 5220,
          "resolvedValue": 5220
        },
        "revenue_goal_attainment": {
          "source": "metric",
          "rawValue": 491.82000000000005,
          "resolvedValue": 491.82000000000005
        }
      },
      "intentPayout": 3000,
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
    "payout": 5950,
    "details": {
      "intentInputs": {
        "new_accounts_count": {
          "source": "metric",
          "rawValue": 17,
          "resolvedValue": 17
        }
      },
      "intentPayout": 5950,
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
          "rawValue": {
            "numerator": 0.762043795620438,
            "denominator": 2
          },
          "resolvedValue": 0.381021897810219
        }
      },
      "intentPayout": 304.8175182481752,
      "fallbackSource": "calculationIntent",
      "intentOperation": "scalar_multiply"
    },
    "componentId": "fleet_utilization_senior",
    "componentName": "Fleet Utilization - Senior",
    "componentType": "scalar_multiply"
  }
]
```

## metrics (verbatim — full entity metrics map at result-write time)

```json
{
  "Mes": 1,
  "Año": 2025,
  "_rowIndex": 72,
  "Ingreso_Meta": 151402,
  "Ingreso_Real": 143414,
  "Cuentas_Nuevas": 0,
  "Entregas_Tiempo": 102,
  "Cargas_Flota_Hub": 1044,
  "Entregas_Totales": 116,
  "Volumen_Rutas_Hub": 1044,
  "Capacidad_Flota_Hub": 1370,
  "Pct_Entregas_Tiempo": 0.8793,
  "Cumplimiento_Ingreso": 0.9472,
  "Incidentes_Seguridad": 0,
  "Tasa_Utilizacion_Hub": 0.762
}
```

## metadata.intentTraces (verbatim, all 5 components)

### intentTraces[0]

```json
{
  "inputs": {
    "hub_route_volume": {
      "source": "metric",
      "rawValue": 5220,
      "resolvedValue": 5220
    },
    "revenue_goal_attainment": {
      "source": "metric",
      "rawValue": 491.82000000000005,
      "resolvedValue": 491.82000000000005
    }
  },
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "modifiers": [],
  "confidence": 0.5,
  "finalOutcome": 3000,
  "componentType": "bounded_lookup_2d",
  "componentIndex": 0,
  "lookupResolution": {
    "outputValue": 3000,
    "rowBoundaryMatched": {
      "max": null,
      "min": 130,
      "index": 4
    },
    "columnBoundaryMatched": {
      "max": null,
      "min": 2000,
      "index": 3
    }
  }
}
```

### intentTraces[1]

```json
{
  "inputs": {
    "on_time_delivery_percentage": {
      "source": "metric",
      "rawValue": 420.6099999999999,
      "resolvedValue": 420.6099999999999
    }
  },
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "modifiers": [],
  "confidence": 0.5,
  "finalOutcome": 0,
  "componentType": "bounded_lookup_1d",
  "componentIndex": 1,
  "lookupResolution": {
    "outputValue": 0
  }
}
```

### intentTraces[2]

```json
{
  "inputs": {
    "new_accounts_count": {
      "source": "metric",
      "rawValue": 17,
      "resolvedValue": 17
    }
  },
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "modifiers": [],
  "confidence": 0.5,
  "finalOutcome": 5950,
  "componentType": "scalar_multiply",
  "componentIndex": 2
}
```

### intentTraces[3]

```json
{
  "inputs": {
    "constant:0": {
      "source": "constant",
      "rawValue": 0,
      "resolvedValue": 0
    },
    "safety_incidents_count": {
      "source": "metric",
      "rawValue": 4,
      "resolvedValue": 4
    }
  },
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "modifiers": [],
  "confidence": 0.5,
  "finalOutcome": 0,
  "componentType": "conditional_gate",
  "componentIndex": 3
}
```

### intentTraces[4]

```json
{
  "inputs": {
    "hub_total_loads": {
      "source": "metric",
      "rawValue": 0.762043795620438,
      "resolvedValue": 0.762043795620438
    },
    "hub_total_capacity": {
      "source": "metric",
      "rawValue": 2,
      "resolvedValue": 2
    }
  },
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "modifiers": [
    {
      "after": 1.5,
      "before": 304.8175182481752,
      "modifier": "cap"
    }
  ],
  "confidence": 0.5,
  "finalOutcome": 1.5,
  "componentType": "scalar_multiply",
  "componentIndex": 4
}
```

## metadata.roundingTrace (verbatim)

```json
{
  "rawTotal": 8951.5,
  "components": [
    {
      "label": "Revenue Performance - Senior",
      "rawValue": 3000,
      "precision": {
        "source": "inferred_from_outputs",
        "decimalPlaces": 0,
        "roundingMethod": "half_even"
      },
      "roundedValue": 3000,
      "componentIndex": 0,
      "roundingAdjustment": 0
    },
    {
      "label": "On-Time Delivery - Senior",
      "rawValue": 0,
      "precision": {
        "source": "inferred_from_outputs",
        "decimalPlaces": 0,
        "roundingMethod": "half_even"
      },
      "roundedValue": 0,
      "componentIndex": 1,
      "roundingAdjustment": 0
    },
    {
      "label": "New Accounts - Senior",
      "rawValue": 5950,
      "precision": {
        "source": "inferred_from_outputs",
        "decimalPlaces": 0,
        "roundingMethod": "half_even"
      },
      "roundedValue": 5950,
      "componentIndex": 2,
      "roundingAdjustment": 0
    },
    {
      "label": "Safety Record - Senior",
      "rawValue": 0,
      "precision": {
        "source": "inferred_from_outputs",
        "decimalPlaces": 0,
        "roundingMethod": "half_even"
      },
      "roundedValue": 0,
      "componentIndex": 3,
      "roundingAdjustment": 0
    },
    {
      "label": "Fleet Utilization - Senior",
      "rawValue": 1.5,
      "precision": {
        "source": "inferred_from_outputs",
        "decimalPlaces": 0,
        "roundingMethod": "half_even"
      },
      "roundedValue": 2,
      "componentIndex": 4,
      "roundingAdjustment": 0.5
    }
  ],
  "roundedTotal": 8952,
  "totalRoundingAdjustment": 0.5
}
```

## metadata top-level fields (excluding intentTraces and roundingTrace, verbatim)

```json
{
  "entityName": "Norma Rodríguez Rivera",
  "externalId": "70209",
  "intentMatch": false,
  "intentTotal": 8952,
  "legacyTotal": 9255
}
```
