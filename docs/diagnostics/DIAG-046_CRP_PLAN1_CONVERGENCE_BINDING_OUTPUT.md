# DIAG-046 -- CRP Plan 1 Convergence Binding and Intent Shape Diagnostic Output

**Date:** 2026-05-15
**Branch:** diag-046-crp-plan1-binding
**HEAD commit:** 08d3291e88e09803fcebf4041c2aed1523d8e9d6 (pre-Phase-0 commit; updated below at each phase)
**Scope:** Why does CRP Plan 1 produce $84,933.50 instead of GT $73,142.72 for Jan 1-15?

CC pastes verbatim data at every section. No interpretation. No PASS/FAIL. No design proposals.

## Phase 1 -- Plan 1 calculationIntent

Command: `cd web && set -a && source .env.local && set +a && npx tsx scripts/diag046-plan1-intent.ts`

```
=== PLAN 1: Capital Equipment ===
rule_set_id: 7ae0fba1-83fe-4674-8664-e6516bb370c9
name: Capital Equipment Commission Plan
created_at: 2026-05-15T11:35:43.089993+00:00

=== COMPONENTS SHAPE ===
typeof: object
isArray: false
top-level keys: [ 'variants' ]

=== Variant 0: Senior Rep ===

  Component 0: Senior Rep Equipment Commission
  calculationIntent: {
  "input": {
    "source": "metric",
    "sourceSpec": {
      "field": "period_equipment_revenue"
    }
  },
  "slope": 0.06,
  "intercept": 200,
  "operation": "linear_function"
}
  metadata.calcMethod: undefined

=== Variant 1: Rep ===

  Component 0: Rep Equipment Commission
  calculationIntent: {
  "input": {
    "source": "metric",
    "sourceSpec": {
      "field": "period_equipment_revenue"
    }
  },
  "slope": 0.04,
  "intercept": 150,
  "operation": "linear_function"
}
  metadata.calcMethod: undefined

=== INPUT BINDINGS ===
{
  "metric_derivations": [
    {
      "metric": "period_equipment_revenue",
      "filters": [],
      "operation": "sum",
      "source_field": "total_amount",
      "source_pattern": "transaction"
    }
  ],
  "convergence_bindings": {
    "component_0": {
      "actual": {
        "column": "total_amount",
        "confidence": 0.9,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.7,
          "structuralType": "measure",
          "contextualIdentity": "count"
        },
        "learning_provenance": {
          "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
          "learned_at": "2026-05-15T11:42:00.447Z"
        }
      },
      "period": {
        "column": "date",
        "confidence": 0.775,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.9,
          "structuralType": "temporal",
          "contextualIdentity": "date"
        },
        "learning_provenance": {
          "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
          "learned_at": "2026-05-15T11:42:00.540Z"
        }
      },
      "entity_identifier": {
        "column": "sales_rep_id",
        "confidence": 0.040955631399317405,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.95,
          "structuralType": "identifier",
          "contextualIdentity": "person_identifier"
        },
        "learning_provenance": {
          "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
          "learned_at": "2026-05-15T11:42:00.517Z"
        }
      }
    }
  }
}
```

## Phase 2 -- Tyler Morrison data

NOTE — The first run of `diag046-tyler-data.ts` shadowed the JSONB field detection: the inspection loop set `dataFieldName` to the LAST object-valued column (`metadata`) instead of `row_data`, and the per-row dump returned all zeros / "MISSING" for `total_amount` / `product_category`. The script was rewritten to pin the payload column to `row_data` (the schema-correct column for committed-data source-row payload), and to dump row 0's `row_data` verbatim so the architect can inspect the shape directly. The pasted output below is the v2 authoritative read.

Command: `cd web && set -a && source .env.local && set +a && npx tsx scripts/diag046-tyler-data.ts`

```
=== ENTITY ===
Tyler Morrison (CRP-6007, id=79e8f66b-ecad-4d87-a1e4-ecc03a5bfc8b)

=== COMMITTED_DATA for Jan 1-15 (13 rows) ===
Row top-level keys: [
  'id',
  'tenant_id',
  'import_batch_id',
  'entity_id',
  'period_id',
  'data_type',
  'row_data',
  'metadata',
  'created_at',
  'source_date'
]
  JSONB field "row_data" sub-keys: [
  'date',
  'quantity',
  '_rowIndex',
  '_sheetName',
  'order_type',
  'unit_price',
  'product_name',
  'sales_rep_id',
  'total_amount',
  'customer_name',
  'sales_rep_name',
  'transaction_id',
  'product_category'
]
  JSONB field "metadata" sub-keys: [
  'source',
  'proposalId',
  'semantic_roles',
  'entity_id_field',
  'field_identities',
  'resolved_data_type',
  'informational_label'
]

Reading payload from JSONB column: "row_data"

=== ROW 0 row_data verbatim ===
{
  "date": 46023,
  "quantity": 1,
  "_rowIndex": 0,
  "_sheetName": "02_CRP_Sales_20260101_20260115",
  "order_type": "New Sale",
  "unit_price": 25897,
  "product_name": "MRI Scanner",
  "sales_rep_id": "CRP-6007",
  "total_amount": 25897,
  "customer_name": "Hospital-132",
  "sales_rep_name": "Tyler Morrison",
  "transaction_id": "EQ-0003",
  "product_category": "Capital Equipment"
}

=== PER-ROW DETAIL ===
  date=2026-01-01 | amt=25897 | cat="Capital Equipment" | order="New Sale" | product="MRI Scanner"
  date=2026-01-02 | amt=36465 | cat="Capital Equipment" | order="New Sale" | product="Surgical Robot"
  date=2026-01-02 | amt=1754 | cat="Consumables" | order="New Sale" | product="Imaging Plates"
  date=2026-01-03 | amt=1296 | cat="Consumables" | order="New Sale" | product="Surgical Gloves"
  date=2026-01-04 | amt=2039 | cat="Consumables" | order="New Sale" | product="Sterilization Pack"
  date=2026-01-05 | amt=2187 | cat="Consumables" | order="New Sale" | product="Catheter Kit"
  date=2026-01-05 | amt=919 | cat="Consumables" | order="New Sale" | product="Catheter Kit"
  date=2026-01-05 | amt=95000 | cat="Capital Equipment" | order="New Sale" | product="MRI Scanner"
  date=2026-01-06 | amt=6943 | cat="Consumables" | order="New Sale" | product="Contrast Agent"
  date=2026-01-08 | amt=3368 | cat="Consumables" | order="New Sale" | product="Catheter Kit"
  date=2026-01-11 | amt=22165 | cat="Capital Equipment" | order="New Sale" | product="CT Unit"
  date=2026-01-12 | amt=4062 | cat="Consumables" | order="New Sale" | product="Catheter Kit"
  date=2026-01-13 | amt=447 | cat="Consumables" | order="Cross-Sell" | product="Consumable Bundle"

=== TOTALS ===
All categories: 202542
Capital Equipment only: 179527
Consumables only: 23015
Other/Missing: 0

=== BY CATEGORY ===
  "Capital Equipment": count=4, sum=179527
  "Consumables": count=9, sum=23015

=== REFERENCE VALUES ===
GT Equipment Revenue for Tyler Jan 1-15: 179527
GT Commission: 0.06 * 179527 + 200 = 10971.619999999999
Engine output for Tyler Jan 1-15: 12352.52

=== PERIOD-AGNOSTIC ROWS (source_date IS NULL): 2 ===
  id=cb018a13-ee9b-489a-841c-332f3fe18a6e, data_type=entity
  id=b15a7b4f-d015-43e5-82d4-1541b87a0a6f, data_type=entity
```

## Phase 3 -- Convergence derivation comparison

Command: `cd web && set -a && source .env.local && set +a && npx tsx scripts/diag046-convergence-comparison.ts`

The `CONTAINS FILTER REFERENCE` line is a substring match on the JSON of `input_bindings` against the literal strings `filter`, `product_category`, or `Capital Equipment` (so it returns `yes` whenever the JSON merely contains the key name `filters: []`, even when the `filters` array is empty).

```
=== District Override Plan (c8cca63b-aa09-4e3e-a2c5-8490ac2756a5, created: 2026-05-15T11:37:34.968088+00:00) ===
  convergence_bindings: {
  "component_0": {
    "period": {
      "column": "date",
      "confidence": 0.775,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.9,
        "structuralType": "temporal",
        "contextualIdentity": "date"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:24.129Z"
      }
    },
    "entity_identifier": {
      "column": "sales_rep_id",
      "confidence": 0.040955631399317405,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.95,
        "structuralType": "identifier",
        "contextualIdentity": "person_identifier"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:24.109Z"
      }
    }
  }
}
  CONTAINS FILTER REFERENCE: no

=== Cross-Sell Bonus Plan (d7b332e8-4f63-4708-ac53-ce6ca65eab96, created: 2026-05-15T11:36:58.229804+00:00) ===
  convergence_bindings: {
  "component_0": {
    "actual": {
      "column": "quantity",
      "confidence": 0.9,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.7,
        "structuralType": "measure",
        "contextualIdentity": "count"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:31.698Z"
      }
    },
    "period": {
      "column": "date",
      "confidence": 0.775,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.9,
        "structuralType": "temporal",
        "contextualIdentity": "date"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:31.781Z"
      }
    },
    "entity_identifier": {
      "column": "sales_rep_id",
      "confidence": 0.040955631399317405,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.95,
        "structuralType": "identifier",
        "contextualIdentity": "person_identifier"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:31.757Z"
      }
    }
  }
}
  metric_derivations: [
  {
    "metric": "equipment_deal_count",
    "filters": [],
    "operation": "sum",
    "source_field": "total_amount",
    "source_pattern": "transaction"
  },
  {
    "metric": "cross_sell_count",
    "filters": [],
    "operation": "sum",
    "source_field": "total_amount",
    "source_pattern": "transaction"
  }
]
  CONTAINS FILTER REFERENCE: yes

=== Consumables Commission Plan (debe8763-2ff0-4a15-9956-787da822b242, created: 2026-05-15T11:36:21.72456+00:00) ===
  convergence_bindings: {
  "component_0": {
    "actual": {
      "column": "unit_price",
      "confidence": 0.26349999999999996,
      "match_pass": 3,
      "field_identity": {
        "confidence": 0.7,
        "structuralType": "measure",
        "contextualIdentity": "count"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:37.872Z"
      }
    },
    "period": {
      "column": "date",
      "confidence": 0.775,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.9,
        "structuralType": "temporal",
        "contextualIdentity": "date"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:37.942Z"
      }
    },
    "numerator": {
      "column": "total_amount",
      "confidence": 0.9,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.7,
        "structuralType": "measure",
        "contextualIdentity": "count"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:37.872Z"
      }
    },
    "denominator": {
      "column": "quantity",
      "confidence": 0.9,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.7,
        "structuralType": "measure",
        "contextualIdentity": "count"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:37.872Z"
      }
    },
    "entity_identifier": {
      "column": "sales_rep_id",
      "confidence": 0.040955631399317405,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.95,
        "structuralType": "identifier",
        "contextualIdentity": "person_identifier"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:43:37.925Z"
      }
    }
  }
}
  metric_derivations: [
  {
    "metric": "consumable_revenue",
    "filters": [],
    "operation": "sum",
    "source_field": "total_amount",
    "source_pattern": "transaction"
  },
  {
    "metric": "monthly_quota",
    "filters": [],
    "operation": "sum",
    "source_field": "total_amount",
    "source_pattern": "transaction"
  }
]
  CONTAINS FILTER REFERENCE: yes

=== Capital Equipment Commission Plan (7ae0fba1-83fe-4674-8664-e6516bb370c9, created: 2026-05-15T11:35:43.089993+00:00) ===
  convergence_bindings: {
  "component_0": {
    "actual": {
      "column": "total_amount",
      "confidence": 0.9,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.7,
        "structuralType": "measure",
        "contextualIdentity": "count"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:42:00.447Z"
      }
    },
    "period": {
      "column": "date",
      "confidence": 0.775,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.9,
        "structuralType": "temporal",
        "contextualIdentity": "date"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:42:00.540Z"
      }
    },
    "entity_identifier": {
      "column": "sales_rep_id",
      "confidence": 0.040955631399317405,
      "match_pass": 1,
      "field_identity": {
        "confidence": 0.95,
        "structuralType": "identifier",
        "contextualIdentity": "person_identifier"
      },
      "learning_provenance": {
        "batch_id": "f1fc7bff-fa67-49a0-a1c1-fb62fa538821",
        "learned_at": "2026-05-15T11:42:00.517Z"
      }
    }
  }
}
  metric_derivations: [
  {
    "metric": "period_equipment_revenue",
    "filters": [],
    "operation": "sum",
    "source_field": "total_amount",
    "source_pattern": "transaction"
  }
]
  CONTAINS FILTER REFERENCE: yes
```
