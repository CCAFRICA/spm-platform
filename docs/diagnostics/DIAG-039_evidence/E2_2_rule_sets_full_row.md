# E2.2 — `rule_sets` row for Meridian (verbatim)

**Query:** `SELECT * FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' ORDER BY created_at DESC`

**Result:** 1 row. Full row verbatim below:

```json
---ROW---
{
  "id": "939cf576-4096-4ceb-a142-539a486868b3",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "name": "Meridian Logistics Group Incentive Plan 2025",
  "description": "Monthly incentive plan for Logistics Coordinators with 5 components: Revenue Performance (2D matrix), On-Time Delivery (tiered), New Accounts (per unit), Safety Record (conditional), and Fleet Utilization (ratio-based)",
  "status": "active",
  "version": 1,
  "effective_from": null,
  "effective_to": null,
  "population_config": {
    "eligible_roles": []
  },
  "input_bindings": {
    "metric_derivations": [
      {
        "metric": "revenue_goal_attainment",
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
        "metric": "hub_route_volume",
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
        "metric": "on_time_delivery_percentage",
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
        "metric": "new_accounts_count",
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
        "metric": "safety_incidents_count",
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
    ],
    "convergence_bindings": {
      "component_0": {
        "row": {
          "column": "Cumplimiento_Ingreso",
          "confidence": 0.9,
          "match_pass": 1,
          "scale_factor": 100,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "column": {
          "column": "Volumen_Rutas_Hub",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
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
      },
      "component_1": {
        "actual": {
          "column": "Pct_Entregas_Tiempo",
          "confidence": 0.9,
          "match_pass": 1,
          "scale_factor": 100,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
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
      },
      "component_2": {
        "actual": {
          "column": "Cuentas_Nuevas",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
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
      },
      "component_3": {
        "actual": {
          "column": "Incidentes_Seguridad",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
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
      },
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
    }
  },
  "components": {
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
                  "row": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "revenue_goal_attainment"
                    }
                  },
                  "column": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "hub_route_volume"
                    }
                  }
                },
                "operation": "bounded_lookup_2d",
                "outputGrid": [
                  [
                    0,
                    0,
                    200,
                    400
                  ],
                  [
                    150,
                    300,
                    500,
                    800
                  ],
                  [
                    300,
                    600,
                    900,
                    1400
                  ],
                  [
                    600,
                    1000,
                    1600,
                    2200
                  ],
                  [
                    900,
                    1400,
                    2100,
                    3000
                  ]
                ],
                "rowBoundaries": [
                  {
                    "max": 80,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 80,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 130,
                    "min": 100,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 130,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero",
                "columnBoundaries": [
                  {
                    "max": 500,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 1000,
                    "min": 500,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 2000,
                    "min": 1000,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 2000,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ]
              }
            },
            "description": "Rendimiento de Ingreso - Senior",
            "componentType": "bounded_lookup_2d",
            "measurementLevel": "store",
            "calculationIntent": {
              "inputs": {
                "row": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "revenue_goal_attainment"
                  }
                },
                "column": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "hub_route_volume"
                  }
                }
              },
              "operation": "bounded_lookup_2d",
              "outputGrid": [
                [
                  0,
                  0,
                  200,
                  400
                ],
                [
                  150,
                  300,
                  500,
                  800
                ],
                [
                  300,
                  600,
                  900,
                  1400
                ],
                [
                  600,
                  1000,
                  1600,
                  2200
                ],
                [
                  900,
                  1400,
                  2100,
                  3000
                ]
              ],
              "rowBoundaries": [
                {
                  "max": 80,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 80,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 130,
                  "min": 100,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 130,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero",
              "columnBoundaries": [
                {
                  "max": 500,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 1000,
                  "min": 500,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 2000,
                  "min": 1000,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 2000,
                  "maxInclusive": true,
                  "minInclusive": true
                }
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
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "on_time_delivery_percentage"
                  }
                },
                "outputs": [
                  0,
                  200,
                  400,
                  700,
                  1200
                ],
                "operation": "bounded_lookup_1d",
                "boundaries": [
                  {
                    "max": 85,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 85,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 95,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 98,
                    "min": 95,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 98,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero"
              }
            },
            "description": "Entrega a Tiempo - Senior",
            "componentType": "bounded_lookup_1d",
            "measurementLevel": "store",
            "calculationIntent": {
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "on_time_delivery_percentage"
                }
              },
              "outputs": [
                0,
                200,
                400,
                700,
                1200
              ],
              "operation": "bounded_lookup_1d",
              "boundaries": [
                {
                  "max": 85,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 85,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 95,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 98,
                  "min": 95,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 98,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero"
            }
          },
          {
            "id": "new_accounts_senior",
            "name": "New Accounts - Senior",
            "order": 3,
            "enabled": true,
            "metadata": {
              "intent": {
                "rate": 350,
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "new_accounts_count"
                  }
                },
                "operation": "scalar_multiply"
              }
            },
            "description": "Cuentas Nuevas - Senior",
            "componentType": "scalar_multiply",
            "measurementLevel": "store",
            "calculationIntent": {
              "rate": 350,
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "new_accounts_count"
                }
              },
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
                "onTrue": {
                  "value": 500,
                  "operation": "constant"
                },
                "onFalse": {
                  "value": 0,
                  "operation": "constant"
                },
                "condition": {
                  "left": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "safety_incidents_count"
                    }
                  },
                  "right": {
                    "value": 0,
                    "source": "constant"
                  },
                  "operator": "="
                },
                "operation": "conditional_gate"
              }
            },
            "description": "Registro de Seguridad - Senior",
            "componentType": "conditional_gate",
            "measurementLevel": "store",
            "calculationIntent": {
              "onTrue": {
                "value": 500,
                "operation": "constant"
              },
              "onFalse": {
                "value": 0,
                "operation": "constant"
              },
              "condition": {
                "left": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "safety_incidents_count"
                  }
                },
                "right": {
                  "value": 0,
                  "source": "constant"
                },
                "operator": "="
              },
              "operation": "conditional_gate"
            }
          },
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
        ],
        "description": "Coordinador Senior",
        "variantName": "Senior Logistics Coordinator",
        "eligibilityCriteria": {}
      },
      {
        "variantId": "standard",
        "components": [
          {
            "id": "revenue_performance_standard",
            "name": "Revenue Performance - Standard",
            "order": 1,
            "enabled": true,
            "metadata": {
              "intent": {
                "inputs": {
                  "row": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "revenue_goal_attainment"
                    }
                  },
                  "column": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "hub_route_volume"
                    }
                  }
                },
                "operation": "bounded_lookup_2d",
                "outputGrid": [
                  [
                    0,
                    0,
                    100,
                    200
                  ],
                  [
                    75,
                    150,
                    250,
                    400
                  ],
                  [
                    150,
                    300,
                    450,
                    700
                  ],
                  [
                    300,
                    500,
                    800,
                    1100
                  ],
                  [
                    450,
                    700,
                    1050,
                    1500
                  ]
                ],
                "rowBoundaries": [
                  {
                    "max": 80,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 80,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 130,
                    "min": 100,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 130,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero",
                "columnBoundaries": [
                  {
                    "max": 500,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 1000,
                    "min": 500,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 2000,
                    "min": 1000,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 2000,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ]
              }
            },
            "description": "Rendimiento de Ingreso - Coordinador",
            "componentType": "bounded_lookup_2d",
            "measurementLevel": "store",
            "calculationIntent": {
              "inputs": {
                "row": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "revenue_goal_attainment"
                  }
                },
                "column": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "hub_route_volume"
                  }
                }
              },
              "operation": "bounded_lookup_2d",
              "outputGrid": [
                [
                  0,
                  0,
                  100,
                  200
                ],
                [
                  75,
                  150,
                  250,
                  400
                ],
                [
                  150,
                  300,
                  450,
                  700
                ],
                [
                  300,
                  500,
                  800,
                  1100
                ],
                [
                  450,
                  700,
                  1050,
                  1500
                ]
              ],
              "rowBoundaries": [
                {
                  "max": 80,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 80,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 130,
                  "min": 100,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 130,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero",
              "columnBoundaries": [
                {
                  "max": 500,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 1000,
                  "min": 500,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 2000,
                  "min": 1000,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 2000,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ]
            }
          },
          {
            "id": "on_time_delivery_standard",
            "name": "On-Time Delivery - Standard",
            "order": 2,
            "enabled": true,
            "metadata": {
              "intent": {
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "on_time_delivery_percentage"
                  }
                },
                "outputs": [
                  0,
                  100,
                  200,
                  350,
                  600
                ],
                "operation": "bounded_lookup_1d",
                "boundaries": [
                  {
                    "max": 85,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 85,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 95,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 98,
                    "min": 95,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 98,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero"
              }
            },
            "description": "Entrega a Tiempo - Coordinador",
            "componentType": "bounded_lookup_1d",
            "measurementLevel": "store",
            "calculationIntent": {
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "on_time_delivery_percentage"
                }
              },
              "outputs": [
                0,
                100,
                200,
                350,
                600
              ],
              "operation": "bounded_lookup_1d",
              "boundaries": [
                {
                  "max": 85,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 85,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 95,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 98,
                  "min": 95,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 98,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero"
            }
          },
          {
            "id": "new_accounts_standard",
            "name": "New Accounts - Standard",
            "order": 3,
            "enabled": true,
            "metadata": {
              "intent": {
                "rate": 200,
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "new_accounts_count"
                  }
                },
                "operation": "scalar_multiply"
              }
            },
            "description": "Cuentas Nuevas - Coordinador",
            "componentType": "scalar_multiply",
            "measurementLevel": "store",
            "calculationIntent": {
              "rate": 200,
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "new_accounts_count"
                }
              },
              "operation": "scalar_multiply"
            }
          },
          {
            "id": "safety_record_standard",
            "name": "Safety Record - Standard",
            "order": 4,
            "enabled": true,
            "metadata": {
              "intent": {
                "onTrue": {
                  "value": 300,
                  "operation": "constant"
                },
                "onFalse": {
                  "value": 0,
                  "operation": "constant"
                },
                "condition": {
                  "left": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "safety_incidents_count"
                    }
                  },
                  "right": {
                    "value": 0,
                    "source": "constant"
                  },
                  "operator": "="
                },
                "operation": "conditional_gate"
              }
            },
            "description": "Registro de Seguridad - Coordinador",
            "componentType": "conditional_gate",
            "measurementLevel": "store",
            "calculationIntent": {
              "onTrue": {
                "value": 300,
                "operation": "constant"
              },
              "onFalse": {
                "value": 0,
                "operation": "constant"
              },
              "condition": {
                "left": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "safety_incidents_count"
                  }
                },
                "right": {
                  "value": 0,
                  "source": "constant"
                },
                "operator": "="
              },
              "operation": "conditional_gate"
            }
          },
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
        ],
        "description": "Coordinador",
        "variantName": "Standard Logistics Coordinator",
        "eligibilityCriteria": {}
      }
    ]
  },
  "cadence_config": {
    "period_type": "monthly"
  },
  "outcome_config": {},
  "metadata": {
    "source": "sci",
    "plan_type": "additive_lookup",
    "aiConfidence": 0.95,
    "contentUnitId": "bee373fc-2028-438f-8ec7-20f720637abd"
  },
  "created_by": "9c179b53-c5ee-4af7-a36b-09f5db3e35f2",
  "approved_by": null,
  "created_at": "2026-05-09T21:04:58.604051+00:00",
  "updated_at": "2026-05-09T21:06:11.52743+00:00"
}
```
