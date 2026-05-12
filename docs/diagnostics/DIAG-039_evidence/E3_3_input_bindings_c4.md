# E3.3 — c4 input_bindings (verbatim)

The c4 binding entries within `rule_sets.input_bindings` for the Meridian rule_set (id `939cf576-4096-4ceb-a142-539a486868b3`).

## input_bindings.metric_derivations entries naming hub_total_loads / hub_total_capacity

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

## input_bindings.convergence_bindings.component_4 (c4 column-to-metric bindings, verbatim)

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

## CC observations (verbatim, not classification)

- `metric_derivations` declares `hub_total_loads` and `hub_total_capacity` with `operation: "count"`, source_pattern `"transaction"`, filtered to `Tipo_Coordinador = "Coordinador Senior"`.
- `convergence_bindings.component_4.numerator.column` = `"Cargas_Flota_Hub"`.
- `convergence_bindings.component_4.denominator.column` = `"Capacidad_Flota_Hub"`.
- `convergence_bindings.component_4.entity_identifier.column` = `"Hub"` (not `"No_Empleado"`). The `field_identity.contextualIdentity` for `Hub` is `"person_identifier"` in this binding.
