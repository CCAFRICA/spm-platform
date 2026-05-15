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
