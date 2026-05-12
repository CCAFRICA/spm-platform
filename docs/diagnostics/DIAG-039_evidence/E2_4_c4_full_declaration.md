# E2.4 — Complete c4 declaration (verbatim, both variants)

The c4 component is declared inside the `rule_sets.components` JSONB column. Two variant declarations carry c4 — `senior` (Coordinador Senior, rate=800) and `standard` (Coordinador, rate=450). Both verbatim below from the E2.2 full-row evidence.

## c4 Senior variant

**Location in E2.2 row JSONB:** `components.variants[0].components[4]`

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
        "source": "ratio",
        "sourceSpec": {
          "numerator": "hub_total_loads",
          "denominator": "hub_total_capacity"
        }
      },
      "modifiers": [
        {
          "maxValue": 1.5,
          "modifier": "cap"
        }
      ],
      "operation": "scalar_multiply"
    }
  },
  "description": "Utilización de Flota - Senior",
  "componentType": "scalar_multiply",
  "measurementLevel": "store",
  "calculationIntent": {
    "rate": 800,
    "input": {
      "source": "ratio",
      "sourceSpec": {
        "numerator": "hub_total_loads",
        "denominator": "hub_total_capacity"
      }
    },
    "modifiers": [
      {
        "maxValue": 1.5,
        "modifier": "cap"
      }
    ],
    "operation": "scalar_multiply"
  }
}
```

## c4 Standard variant

**Location in E2.2 row JSONB:** `components.variants[1].components[4]`

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
        "source": "ratio",
        "sourceSpec": {
          "numerator": "hub_total_loads",
          "denominator": "hub_total_capacity"
        }
      },
      "modifiers": [
        {
          "maxValue": 1.5,
          "modifier": "cap"
        }
      ],
      "operation": "scalar_multiply"
    }
  },
  "description": "Utilización de Flota - Coordinador",
  "componentType": "scalar_multiply",
  "measurementLevel": "store",
  "calculationIntent": {
    "rate": 450,
    "input": {
      "source": "ratio",
      "sourceSpec": {
        "numerator": "hub_total_loads",
        "denominator": "hub_total_capacity"
      }
    },
    "modifiers": [
      {
        "maxValue": 1.5,
        "modifier": "cap"
      }
    ],
    "operation": "scalar_multiply"
  }
}
```

## c4-relevant fields elsewhere in the rule_sets row

### `input_bindings.metric_derivations` entries naming hub_total_loads / hub_total_capacity (verbatim)

```json
{
  "metric": "hub_total_loads",
  "filters": [
    {
      "field": "Tipo_Coordinador",
      "value": "Coordinador Senior",
      "operator": "eq"
    }
  ],
  "operation": "count",
  "source_pattern": "transaction"
},
{
  "metric": "hub_total_capacity",
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

### `input_bindings.convergence_bindings.component_4` (verbatim — c4 column-to-metric bindings)

```json
"component_4": {
  "period": {
    "column": "Mes",
    "confidence": 0.775,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.9,
      "structuralType": "temporal",
      "contextualIdentity": "date"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "numerator": {
    "column": "Cargas_Flota_Hub",
    "confidence": 0.9,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.7,
      "structuralType": "measure",
      "contextualIdentity": "count"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "denominator": {
    "column": "Capacidad_Flota_Hub",
    "confidence": 0.9,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.7,
      "structuralType": "measure",
      "contextualIdentity": "count"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
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
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  }
}
```

CC has surfaced the full c4 declaration as present in the rule_sets row. Architect reads.
