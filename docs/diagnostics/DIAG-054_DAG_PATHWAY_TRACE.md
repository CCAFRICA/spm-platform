# DIAG-054 — DAG Engine Full Pathway Trace

**Branch:** `diag-054-dag-pathway-trace` off `main @ ad2f1038`
**Date captured:** 2026-05-20
**Scope:** Read-only audit. Eight probes traversing the full DAG-engine pathway from LLM emission through stored intent, convergence binding, metric resolution, and evaluation. No code changes.

---

## PROBE 1 — Stored DAG intents

**Script:** `web/scripts/diag-054-probe1-stored-intents.ts`

BCL has TWO active rule_sets (HF-241 supersession appears to be failing silently). The script picks the most-recently-updated. Every component is `componentType: prime_dag`. Full output (8 components × full JSON + tree visualization) below.

```
=== DIAG-054 Probe 1: stored DAG intents ===
BCL active rule_sets: 2
  id=0dbd0a95-bf01-40f7-9568-76a0c47fffbb updated=2026-05-20T20:52:13.65042+00:00 name="Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026"
  id=8cbc4779-e131-4f44-ae8f-11648ebc42d4 updated=2026-05-20T20:48:39.599167+00:00 name="Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026"

Using most-recently-updated: id=0dbd0a95-bf01-40f7-9568-76a0c47fffbb

Flattened component count: 8

────────────────────────────────────────
Component 0 (variant 0) "Credit Placement - Senior Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "else": {
    "else": {
      "prime": "constant",
      "value": 0
    },
    "then": {
      "prime": "constant",
      "value": 680
    },
    "prime": "conditional",
    "condition": {
      "op": "and",
      "prime": "logical",
      "inputs": [
        {
          "op": "gte",
          "prime": "compare",
          "inputs": [
            {
              "field": "cumplimiento_colocacion",
              "prime": "reference"
            },
            {
              "prime": "constant",
              "value": 120
            }
          ]
        },
        {
          "op": "and",
          "prime": "logical",
          "inputs": [
            {
              "op": "gte",
              "prime": "compare",
              "inputs": [
                {
                  "field": "calidad_cartera",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 0.9
                }
              ]
            },
            {
              "op": "lt",
              "prime": "compare",
              "inputs": [
                {
                  "field": "calidad_cartera",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 0.95
                }
              ]
            }
          ]
        }
      ]
    }
  },
  "then": {
    "prime": "constant",
    "value": 700
  },
  "prime": "conditional",
  "condition": {
    "op": "and",
    "prime": "logical",
    "inputs": [
      {
        "op": "gte",
        "prime": "compare",
        "inputs": [
          {
            "field": "cumplimiento_colocacion",
            "prime": "reference"
          },
          {
            "prime": "constant",
            "value": 120
          }
        ]
      },
      {
        "op": "gte",
        "prime": "compare",
        "inputs": [
          {
            "field": "calidad_cartera",
            "prime": "reference"
          },
          {
            "prime": "constant",
            "value": 0.95
          }
        ]
      }
    ]
  }
}
  tree visualization:
conditional
  if:
    logical(and)
      compare(gte)
        reference(cumplimiento_colocacion)
        constant(120)
      compare(gte)
        reference(calidad_cartera)
        constant(0.95)
  then:
    constant(700)
  else:
    conditional
      if:
        logical(and)
          compare(gte)
            reference(cumplimiento_colocacion)
            constant(120)
          logical(and)
            compare(gte)
              reference(calidad_cartera)
              constant(0.9)
            compare(lt)
              reference(calidad_cartera)
              constant(0.95)
      then:
        constant(680)
      else:
        constant(0)

────────────────────────────────────────
Component 1 (variant 0) "Deposit Capture - Senior Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "else": {
    "else": {
      "else": {
        "else": {
          "prime": "constant",
          "value": 0
        },
        "then": {
          "prime": "constant",
          "value": 120
        },
        "prime": "conditional",
        "condition": {
          "op": "and",
          "prime": "logical",
          "inputs": [
            {
              "op": "gte",
              "prime": "compare",
              "inputs": [
                {
                  "field": "cumplimiento_depositos",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 60
                }
              ]
            },
            {
              "op": "lt",
              "prime": "compare",
              "inputs": [
                {
                  "field": "cumplimiento_depositos",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 80
                }
              ]
            }
          ]
        }
      },
      "then": {
        "prime": "constant",
        "value": 250
      },
      "prime": "conditional",
      "condition": {
        "op": "and",
        "prime": "logical",
        "inputs": [
          {
            "op": "gte",
            "prime": "compare",
            "inputs": [
              {
                "field": "cumplimiento_depositos",
                "prime": "reference"
              },
              {
                "prime": "constant",
                "value": 80
              }
            ]
          },
          {
            "op": "lt",
            "prime": "compare",
            "inputs": [
              {
                "field": "cumplimiento_depositos",
                "prime": "reference"
              },
              {
                "prime": "constant",
                "value": 100
              }
            ]
          }
        ]
      }
    },
    "then": {
      "prime": "constant",
      "value": 400
    },
    "prime": "conditional",
    "condition": {
      "op": "and",
      "prime": "logical",
      "inputs": [
        {
          "op": "gte",
          "prime": "compare",
          "inputs": [
            {
              "field": "cumplimiento_depositos",
              "prime": "reference"
            },
            {
              "prime": "constant",
              "value": 100
            }
          ]
        },
        {
          "op": "lt",
          "prime": "compare",
          "inputs": [
            {
              "field": "cumplimiento_depositos",
              "prime": "reference"
            },
            {
              "prime": "constant",
              "value": 130
            }
          ]
        }
      ]
    }
  },
  "then": {
    "prime": "constant",
    "value": 550
  },
  "prime": "conditional",
  "condition": {
    "op": "gte",
    "prime": "compare",
    "inputs": [
      {
        "field": "cumplimiento_depositos",
        "prime": "reference"
      },
      {
        "prime": "constant",
        "value": 130
      }
    ]
  }
}
  tree visualization:
conditional
  if:
    compare(gte)
      reference(cumplimiento_depositos)
      constant(130)
  then:
    constant(550)
  else:
    conditional
      if:
        logical(and)
          compare(gte)
            reference(cumplimiento_depositos)
            constant(100)
          compare(lt)
            reference(cumplimiento_depositos)
            constant(130)
      then:
        constant(400)
      else:
        conditional
          if:
            logical(and)
              compare(gte)
                reference(cumplimiento_depositos)
                constant(80)
              compare(lt)
                reference(cumplimiento_depositos)
                constant(100)
          then:
            constant(250)
          else:
            conditional
              if:
                logical(and)
                  compare(gte)
                    reference(cumplimiento_depositos)
                    constant(60)
                  compare(lt)
                    reference(cumplimiento_depositos)
                    constant(80)
              then:
                constant(120)
              else:
                constant(0)

────────────────────────────────────────
Component 2 (variant 0) "Cross Products - Senior Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "op": "multiply",
  "prime": "arithmetic",
  "inputs": [
    {
      "field": "productos_cruzados_vendidos",
      "prime": "reference"
    },
    {
      "prime": "constant",
      "value": 25
    }
  ]
}
  tree visualization:
arithmetic(multiply)
  reference(productos_cruzados_vendidos)
  constant(25)

────────────────────────────────────────
Component 3 (variant 0) "Regulatory Compliance - Senior Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "else": {
    "prime": "constant",
    "value": 0
  },
  "then": {
    "prime": "constant",
    "value": 150
  },
  "prime": "conditional",
  "condition": {
    "op": "eq",
    "prime": "compare",
    "inputs": [
      {
        "field": "infracciones_regulatorias",
        "prime": "reference"
      },
      {
        "prime": "constant",
        "value": 0
      }
    ]
  }
}
  tree visualization:
conditional
  if:
    compare(eq)
      reference(infracciones_regulatorias)
      constant(0)
  then:
    constant(150)
  else:
    constant(0)

────────────────────────────────────────
Component 4 (variant 1) "Credit Placement - Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "else": {
    "else": {
      "prime": "constant",
      "value": 0
    },
    "then": {
      "prime": "constant",
      "value": 480
    },
    "prime": "conditional",
    "condition": {
      "op": "and",
      "prime": "logical",
      "inputs": [
        {
          "op": "gte",
          "prime": "compare",
          "inputs": [
            {
              "field": "cumplimiento_colocacion",
              "prime": "reference"
            },
            {
              "prime": "constant",
              "value": 120
            }
          ]
        },
        {
          "op": "and",
          "prime": "logical",
          "inputs": [
            {
              "op": "gte",
              "prime": "compare",
              "inputs": [
                {
                  "field": "calidad_cartera",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 0.9
                }
              ]
            },
            {
              "op": "lt",
              "prime": "compare",
              "inputs": [
                {
                  "field": "calidad_cartera",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 0.95
                }
              ]
            }
          ]
        }
      ]
    }
  },
  "then": {
    "prime": "constant",
    "value": 500
  },
  "prime": "conditional",
  "condition": {
    "op": "and",
    "prime": "logical",
    "inputs": [
      {
        "op": "gte",
        "prime": "compare",
        "inputs": [
          {
            "field": "cumplimiento_colocacion",
            "prime": "reference"
          },
          {
            "prime": "constant",
            "value": 120
          }
        ]
      },
      {
        "op": "gte",
        "prime": "compare",
        "inputs": [
          {
            "field": "calidad_cartera",
            "prime": "reference"
          },
          {
            "prime": "constant",
            "value": 0.95
          }
        ]
      }
    ]
  }
}
  tree visualization:
conditional
  if:
    logical(and)
      compare(gte)
        reference(cumplimiento_colocacion)
        constant(120)
      compare(gte)
        reference(calidad_cartera)
        constant(0.95)
  then:
    constant(500)
  else:
    conditional
      if:
        logical(and)
          compare(gte)
            reference(cumplimiento_colocacion)
            constant(120)
          logical(and)
            compare(gte)
              reference(calidad_cartera)
              constant(0.9)
            compare(lt)
              reference(calidad_cartera)
              constant(0.95)
      then:
        constant(480)
      else:
        constant(0)

────────────────────────────────────────
Component 5 (variant 1) "Deposit Capture - Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "else": {
    "else": {
      "else": {
        "else": {
          "prime": "constant",
          "value": 0
        },
        "then": {
          "prime": "constant",
          "value": 80
        },
        "prime": "conditional",
        "condition": {
          "op": "and",
          "prime": "logical",
          "inputs": [
            {
              "op": "gte",
              "prime": "compare",
              "inputs": [
                {
                  "field": "cumplimiento_depositos",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 60
                }
              ]
            },
            {
              "op": "lt",
              "prime": "compare",
              "inputs": [
                {
                  "field": "cumplimiento_depositos",
                  "prime": "reference"
                },
                {
                  "prime": "constant",
                  "value": 80
                }
              ]
            }
          ]
        }
      },
      "then": {
        "prime": "constant",
        "value": 180
      },
      "prime": "conditional",
      "condition": {
        "op": "and",
        "prime": "logical",
        "inputs": [
          {
            "op": "gte",
            "prime": "compare",
            "inputs": [
              {
                "field": "cumplimiento_depositos",
                "prime": "reference"
              },
              {
                "prime": "constant",
                "value": 80
              }
            ]
          },
          {
            "op": "lt",
            "prime": "compare",
            "inputs": [
              {
                "field": "cumplimiento_depositos",
                "prime": "reference"
              },
              {
                "prime": "constant",
                "value": 100
              }
            ]
          }
        ]
      }
    },
    "then": {
      "prime": "constant",
      "value": 300
    },
    "prime": "conditional",
    "condition": {
      "op": "and",
      "prime": "logical",
      "inputs": [
        {
          "op": "gte",
          "prime": "compare",
          "inputs": [
            {
              "field": "cumplimiento_depositos",
              "prime": "reference"
            },
            {
              "prime": "constant",
              "value": 100
            }
          ]
        },
        {
          "op": "lt",
          "prime": "compare",
          "inputs": [
            {
              "field": "cumplimiento_depositos",
              "prime": "reference"
            },
            {
              "prime": "constant",
              "value": 130
            }
          ]
        }
      ]
    }
  },
  "then": {
    "prime": "constant",
    "value": 420
  },
  "prime": "conditional",
  "condition": {
    "op": "gte",
    "prime": "compare",
    "inputs": [
      {
        "field": "cumplimiento_depositos",
        "prime": "reference"
      },
      {
        "prime": "constant",
        "value": 130
      }
    ]
  }
}
  tree visualization:
conditional
  if:
    compare(gte)
      reference(cumplimiento_depositos)
      constant(130)
  then:
    constant(420)
  else:
    conditional
      if:
        logical(and)
          compare(gte)
            reference(cumplimiento_depositos)
            constant(100)
          compare(lt)
            reference(cumplimiento_depositos)
            constant(130)
      then:
        constant(300)
      else:
        conditional
          if:
            logical(and)
              compare(gte)
                reference(cumplimiento_depositos)
                constant(80)
              compare(lt)
                reference(cumplimiento_depositos)
                constant(100)
          then:
            constant(180)
          else:
            conditional
              if:
                logical(and)
                  compare(gte)
                    reference(cumplimiento_depositos)
                    constant(60)
                  compare(lt)
                    reference(cumplimiento_depositos)
                    constant(80)
              then:
                constant(80)
              else:
                constant(0)

────────────────────────────────────────
Component 6 (variant 1) "Cross Products - Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "op": "multiply",
  "prime": "arithmetic",
  "inputs": [
    {
      "field": "productos_cruzados_vendidos",
      "prime": "reference"
    },
    {
      "prime": "constant",
      "value": 18
    }
  ]
}
  tree visualization:
arithmetic(multiply)
  reference(productos_cruzados_vendidos)
  constant(18)

────────────────────────────────────────
Component 7 (variant 1) "Regulatory Compliance - Executive"
componentType: prime_dag
  format: PRIME-DAG
  full intent JSON:
{
  "else": {
    "prime": "constant",
    "value": 0
  },
  "then": {
    "prime": "constant",
    "value": 100
  },
  "prime": "conditional",
  "condition": {
    "op": "eq",
    "prime": "compare",
    "inputs": [
      {
        "field": "infracciones_regulatorias",
        "prime": "reference"
      },
      {
        "prime": "constant",
        "value": 0
      }
    ]
  }
}
  tree visualization:
conditional
  if:
    compare(eq)
      reference(infracciones_regulatorias)
      constant(0)
  then:
    constant(100)
  else:
    constant(0)


```

---

## PROBE 2 — Plan-interpretation prompt + convertComponent

### Prompt section (anthropic-adapter.ts lines 428-651)

The CALCULATION INTENT block of `plan_interpretation` prompt. Teaches nine prime building blocks and presents 8 composition examples (A simple rate × metric, B linear function, C conditional gate, D piecewise tier, E manager override, F cap modifier, G floor modifier, H input constraint). **No example demonstrates a 2D fixed-output band lookup (bounded_lookup_2d equivalent).**

```typescript
=== CALCULATION INTENT (PRIME-DAG COMPOSITION) ===

FOR EACH COMPONENT, produce a "calculationIntent" field as a recursive PrimeNode tree composed of nine irreducible building blocks. The execution engine walks this tree directly. Do NOT emit named operation types (scalar_multiply, conditional_gate, piecewise_linear, etc.) — compose them from primes instead.

NINE PRIMES (the only operations the engine recognizes):

1. constant     — { "prime": "constant", "value": <number> }
2. reference    — { "prime": "reference", "field": "<metric_name>" }
                  Reads a numeric value from the entity's resolved metrics map.
                  Synthetic-key references for non-metric sources:
                    "attr:<attribute>"               → entity attribute (numeric/coerced)
                    "prior:<componentIndex>"         → output of an earlier component
                    "cross_data:<dataType>:<agg>[:<field>]" → cross-plan data count/sum
                    "group:<metric>"                 → group-scope aggregate
                  For hierarchical (district / region) aggregates, compose
                  the "scope" prime over an "aggregate" downstream directly —
                  do NOT use a reference synthetic key. See Example E.
3. arithmetic   — { "prime": "arithmetic", "op": "add"|"subtract"|"multiply"|"divide", "inputs": [A, B] }
                  divide returns 0 when B is 0.
4. compare      — { "prime": "compare", "op": "gt"|"gte"|"lt"|"lte"|"eq"|"neq", "inputs": [A, B] }
                  Returns 1 (true) or 0 (false).
5. logical      — { "prime": "logical", "op": "and"|"or"|"not", "inputs": [A, B, ...] }
                  Returns 1 (true) or 0 (false). Truthy = value > 0.
6. conditional  — { "prime": "conditional", "condition": <node>, "then": <node>, "else": <node> }
                  Branches on condition truthy (> 0).
7. filter       — { "prime": "filter", "predicate": {"field":"<col>","operator":"<op>","value":<v>}, "downstream": <node> }
                  Narrows activeRows for the subtree. Operators: eq, neq, gt, gte, lt, lte, contains.
8. scope        — { "prime": "scope", "boundary": "<attribute>", "downstream": <node> }
                  Narrows activeRows to entity siblings sharing the same boundary attribute value.
9. aggregate    — { "prime": "aggregate", "op": "sum"|"count"|"avg"|"min"|"max", "field": "<row_field>" }
                  Reduces activeRows to a single number.

COMPOSITION GUIDE — every legacy pattern composes from these primes:

A) Simple rate × metric (e.g., "4% of warranty sales"):
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "multiply",
    "inputs": [
      { "prime": "reference", "field": "warranty_sales" },
      { "prime": "constant",  "value": 0.04 }
    ]
  }
}

B) Linear function (rate × metric + intercept, e.g., "6% of revenue plus $200"):
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "add",
    "inputs": [
      { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "period_equipment_revenue" },
          { "prime": "constant",  "value": 0.06 }
        ]},
      { "prime": "constant", "value": 200 }
    ]
  }
}

C) Conditional gate (e.g., "5% if attainment >= 100%, else 3% if >= 85%, else 0"):
{
  "calculationIntent": {
    "prime": "conditional",
    "condition": { "prime": "compare", "op": "gte",
      "inputs": [
        { "prime": "reference", "field": "store_goal_attainment" },
        { "prime": "constant",  "value": 100 }
      ]
    },
    "then": { "prime": "arithmetic", "op": "multiply",
      "inputs": [
        { "prime": "reference", "field": "insurance_sales" },
        { "prime": "constant",  "value": 0.05 }
      ]
    },
    "else": {
      "prime": "conditional",
      "condition": { "prime": "compare", "op": "gte",
        "inputs": [
          { "prime": "reference", "field": "store_goal_attainment" },
          { "prime": "constant",  "value": 85 }
        ]
      },
      "then": { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "insurance_sales" },
          { "prime": "constant",  "value": 0.03 }
        ]
      },
      "else": { "prime": "constant", "value": 0 }
    }
  }
}

D) Piecewise rate × base (e.g., "3% if attainment < 100%, 5% if 100%-120%, 8% if >= 120%, applied to consumable_revenue"):
Express tier selection as nested conditional + logical(and) + compare. The selected tier's rate multiplies the base.
{
  "calculationIntent": {
    "prime": "conditional",
    "condition": { "prime": "compare", "op": "gte",
      "inputs": [
        { "prime": "arithmetic", "op": "divide",
          "inputs": [
            { "prime": "reference", "field": "consumable_revenue" },
            { "prime": "reference", "field": "monthly_quota" }
          ]},
        { "prime": "constant", "value": 1.2 }
      ]
    },
    "then": { "prime": "arithmetic", "op": "multiply",
      "inputs": [
        { "prime": "reference", "field": "consumable_revenue" },
        { "prime": "constant",  "value": 0.08 }
      ]
    },
    "else": {
      "prime": "conditional",
      "condition": { "prime": "logical", "op": "and",
        "inputs": [
          { "prime": "compare", "op": "gte",
            "inputs": [
              { "prime": "arithmetic", "op": "divide",
                "inputs": [
                  { "prime": "reference", "field": "consumable_revenue" },
                  { "prime": "reference", "field": "monthly_quota" }
                ]},
              { "prime": "constant", "value": 1.0 }
            ]},
          { "prime": "compare", "op": "lt",
            "inputs": [
              { "prime": "arithmetic", "op": "divide",
                "inputs": [
                  { "prime": "reference", "field": "consumable_revenue" },
                  { "prime": "reference", "field": "monthly_quota" }
                ]},
              { "prime": "constant", "value": 1.2 }
            ]}
        ]
      },
      "then": { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "consumable_revenue" },
          { "prime": "constant",  "value": 0.05 }
        ]
      },
      "else": { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "consumable_revenue" },
          { "prime": "constant",  "value": 0.03 }
        ]
      }
    }
  }
}

E) Manager / regional override (sum a metric across siblings in the same hierarchy, then multiply by a rate):
The "boundary" string names the entity attribute the engine uses to identify peers — typically "district" or "region".
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "multiply",
    "inputs": [
      { "prime": "scope", "boundary": "district",
        "downstream": { "prime": "aggregate", "op": "sum", "field": "equipment_revenue" }
      },
      { "prime": "constant", "value": 0.015 }
    ]
  }
}

F) Cap modifier (e.g., "commission capped at $5,000"): wrap the base computation with a conditional that returns the cap when exceeded.
{
  "calculationIntent": {
    "prime": "conditional",
    "condition": { "prime": "compare", "op": "gt",
      "inputs": [
        <BASE_COMPUTATION>,
        { "prime": "constant", "value": 5000 }
      ]
    },
    "then": { "prime": "constant", "value": 5000 },
    "else": <BASE_COMPUTATION>
  }
}

G) Floor modifier ("minimum guarantee $500"): same pattern with "lt" + constant on the then branch:
{
  "prime": "conditional",
  "condition": { "prime": "compare", "op": "lt", "inputs": [<BASE>, { "prime": "constant", "value": 500 }] },
  "then": { "prime": "constant", "value": 500 },
  "else": <BASE>
}

H) Input constraint (e.g., "attainment capped at 150% before applying rate"): wrap the input — not the output — in a conditional that caps it at the upper bound.
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "multiply",
    "inputs": [
      { "prime": "conditional",
        "condition": { "prime": "compare", "op": "lte",
          "inputs": [
            { "prime": "arithmetic", "op": "divide",
              "inputs": [
                { "prime": "reference", "field": "actual_units" },
                { "prime": "reference", "field": "target_units" }
              ]},
            { "prime": "constant", "value": 1.5 }
          ]},
        "then": { "prime": "arithmetic", "op": "divide",
          "inputs": [
            { "prime": "reference", "field": "actual_units" },
            { "prime": "reference", "field": "target_units" }
          ]},
        "else": { "prime": "constant", "value": 1.5 }
      },
      { "prime": "constant", "value": 800 }
    ]
  }
}

DECISION 127 — boundary inclusivity in tier conditionals:
When translating tiered/piecewise plans, express tier-selection ranges as half-open intervals [min, max). For each non-final tier use "compare gte" against min AND "compare lt" against max, joined by "logical and". For the final tier (open-ended ceiling), use "compare gte" against the min only.

DO NOT use .999 / .X99 / decimal-truncation patterns. Express "less than X" as a "compare lt" against X.

```

### convertComponent (ai-plan-interpreter.ts lines 383-426)

```typescript
function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
  // OB-196 Phase 1.5: legacy alias elimination + truncation. AI emits foundational
  // identifiers directly; importer carries calculationIntent through without
  // per-shape translation. Legacy case arms (matrix_lookup, tiered_lookup,
  // percentage/flat_percentage, conditional_percentage) and the silent-fallback
  // default branch deleted. Default branch throws (Phase 2 replaces with the
  // typed UnconvertibleComponentError).
  const base: Omit<PlanComponent, 'componentType' | 'matrixConfig' | 'tierConfig' | 'percentageConfig' | 'conditionalConfig'> = {
    id: comp?.id || `component-${order}`,
    name: comp?.name || `Component ${order + 1}`,
    description: comp?.nameEs || comp?.reasoning || '',
    order: order + 1,
    enabled: true,
    measurementLevel: 'store',
    // OB-77: Pass through AI-produced structural intent
    calculationIntent: comp?.calculationIntent,
  };

  // HF-238: format detection. Prime-DAG components carry a recursive
  // PrimeNode tree under calculationIntent (discriminator key `prime`)
  // rather than the legacy named-operation shape (discriminator key
  // `operation`). Detect and route accordingly.
  const calcMethod = comp?.calculationMethod;
  const intentNode = base.calculationIntent as Record<string, unknown> | undefined;
  const isPrimeDag = !!intentNode && typeof intentNode.prime === 'string';

  if (isPrimeDag) {
    // Validate the entire PrimeNode tree before persisting.
    if (!validatePrimeNodeTree(intentNode)) {
      throw new UnconvertibleComponentError(
        `[convertComponent] "${base.name}" emitted a prime-DAG calculationIntent ` +
        `that does not validate against VALID_PRIMES (${Array.from(VALID_PRIMES).join(',')}). ` +
        `Emission: ${JSON.stringify(intentNode).slice(0, 500)}.`,
      );
    }
    return {
      ...base,
      componentType: 'prime_dag' as FoundationalPrimitive,
      metadata: {
        ...(base.metadata || {}),
        intent: base.calculationIntent,
      },
    };
  }

```

---

## PROBE 3 — Convergence bindings + DAG cross-reference

**Script:** `web/scripts/diag-054-probe3-bindings.ts`

```
=== DIAG-054 Probe 3: stored input_bindings + DAG cross-reference ===
Rule set: 0dbd0a95-bf01-40f7-9568-76a0c47fffbb (most recent)

--- top-level keys ---
[ 'convergence_version', 'convergence_bindings' ]

convergence_bindings: 4 component entries

────────────────────────────────────────
Component 0: "Credit Placement - Senior Executive" componentType=prime_dag
  binding keys: [period, calidad_cartera, entity_identifier, cumplimiento_colocacion]
  DAG reference fields: [cumplimiento_colocacion, calidad_cartera]
  ── per-field binding lookup ──
    cumplimiento_colocacion:
      column=Cumplimiento_Colocacion confidence=0.9 match_pass=1 scale_factor=(none) filters=0
    calidad_cartera:
      column=Indice_Calidad_Cartera confidence=0.9 match_pass=1 scale_factor=(none) filters=0

────────────────────────────────────────
Component 1: "Deposit Capture - Senior Executive" componentType=prime_dag
  binding keys: [period, entity_identifier, cumplimiento_depositos]
  DAG reference fields: [cumplimiento_depositos]
  ── per-field binding lookup ──
    cumplimiento_depositos:
      column=Pct_Meta_Depositos confidence=0.9 match_pass=1 scale_factor=(none) filters=0

────────────────────────────────────────
Component 2: "Cross Products - Senior Executive" componentType=prime_dag
  binding keys: [period, entity_identifier, productos_cruzados_vendidos]
  DAG reference fields: [productos_cruzados_vendidos]
  ── per-field binding lookup ──
    productos_cruzados_vendidos:
      column=Cantidad_Productos_Cruzados confidence=0.9 match_pass=1 scale_factor=(none) filters=0

────────────────────────────────────────
Component 3: "Regulatory Compliance - Senior Executive" componentType=prime_dag
  binding keys: [period, entity_identifier, infracciones_regulatorias]
  DAG reference fields: [infracciones_regulatorias]
  ── per-field binding lookup ──
    infracciones_regulatorias:
      column=Infracciones_Regulatorias confidence=0.9 match_pass=1 scale_factor=(none) filters=0

────────────────────────────────────────
Component 4: "Credit Placement - Executive" componentType=prime_dag
  no convergence_bindings entry for component_4
────────────────────────────────────────
Component 5: "Deposit Capture - Executive" componentType=prime_dag
  no convergence_bindings entry for component_5
────────────────────────────────────────
Component 6: "Cross Products - Executive" componentType=prime_dag
  no convergence_bindings entry for component_6
────────────────────────────────────────
Component 7: "Regulatory Compliance - Executive" componentType=prime_dag
  no convergence_bindings entry for component_7

```

---

## PROBE 4 — Metric resolution for BCL-5003 October

**Script:** `web/scripts/diag-054-probe4-metric-resolution.ts`

BCL-5001 (Adriana Reyes Molina) is the VP Banca Minorista — a manager with no transactional data of her own. Retargeted to BCL-5003 (Gabriela Vascones Delgado, Senior Executive, Gerente Regional Sierra), the most senior frontline employee with full October transactional data.

```
=== DIAG-054 Probe 4: BCL-5001 metric resolution ===
Entity: BCL-5003 "Gabriela Vascones Delgado" id=73a272e1-372e-4960-a377-b8603c55818e
Metadata: {"role":"Ejecutivo Senior","cargo":"Gerente Regional","region":"Sierra","nivel_cargo":"Ejecutivo Senior","fecha_ingreso":"2017-01-20"}

committed_data rows with source_date=2025-10-01: 85
October rows matching BCL-5003: 1

--- Raw row_data for matched rows ---
data_type=transaction entity_id=73a272e1-372e-4960-a377-b8603c55818e
{
  "Periodo": "2025-10-01",
  "Sucursal": "Regional",
  "_rowIndex": 2,
  "_sheetName": "Datos",
  "ID_Empleado": "BCL-5003",
  "Meta_Depositos": 45000,
  "Meta_Colocacion": 150000,
  "Nombre_Completo": "Gabriela Vascones Delgado",
  "Monto_Colocacion": 170312.46,
  "Pct_Meta_Depositos": 1.282,
  "Depositos_Nuevos_Netos": 57688.65,
  "Indice_Calidad_Cartera": 0.9412,
  "Cumplimiento_Colocacion": 1.1354,
  "Infracciones_Regulatorias": 0,
  "Cantidad_Productos_Cruzados": 10
}

────────────────────────────────────────
Component 0: "Credit Placement - Senior Executive"
  DAG references: [cumplimiento_colocacion, calidad_cartera]
  cumplimiento_colocacion → binding.column="Cumplimiento_Colocacion" raw=1.1354 (from data_type=transaction) scale=none scaled=1.1354
  calidad_cartera → binding.column="Indice_Calidad_Cartera" raw=0.9412 (from data_type=transaction) scale=none scaled=0.9412
  → metrics map for evaluate(): {"cumplimiento_colocacion":1.1354,"calidad_cartera":0.9412}
────────────────────────────────────────
Component 1: "Deposit Capture - Senior Executive"
  DAG references: [cumplimiento_depositos]
  cumplimiento_depositos → binding.column="Pct_Meta_Depositos" raw=1.282 (from data_type=transaction) scale=none scaled=1.282
  → metrics map for evaluate(): {"cumplimiento_depositos":1.282}
────────────────────────────────────────
Component 2: "Cross Products - Senior Executive"
  DAG references: [productos_cruzados_vendidos]
  productos_cruzados_vendidos → binding.column="Cantidad_Productos_Cruzados" raw=10 (from data_type=transaction) scale=none scaled=10
  → metrics map for evaluate(): {"productos_cruzados_vendidos":10}
────────────────────────────────────────
Component 3: "Regulatory Compliance - Senior Executive"
  DAG references: [infracciones_regulatorias]
  infracciones_regulatorias → binding.column="Infracciones_Regulatorias" raw=0 (from data_type=transaction) scale=none scaled=0
  → metrics map for evaluate(): {"infracciones_regulatorias":0}
────────────────────────────────────────
Component 4: "Credit Placement - Executive"
  no bindings
────────────────────────────────────────
Component 5: "Deposit Capture - Executive"
  no bindings
────────────────────────────────────────
Component 6: "Cross Products - Executive"
  no bindings
────────────────────────────────────────
Component 7: "Regulatory Compliance - Executive"
  no bindings

```

---

## PROBE 5 — `evaluate()` trace for BCL-5003

**Script:** `web/scripts/diag-054-probe5-evaluation.ts`

Imports the production `evaluate()` and `buildEvalContext()` from `intent-executor.ts`. For each component runs (1) the engine evaluate path AND (2) a verbose hand-walk that prints every node value.

```
=== DIAG-054 Probe 5: evaluate() trace for BCL-5003 (Gabriela, Senior Exec, October) ===
Metrics: {"cumplimiento_colocacion":1.1354,"calidad_cartera":0.9412,"cumplimiento_depositos":1.282,"productos_cruzados_vendidos":10,"infracciones_regulatorias":0}


──────────── Component 0: "Credit Placement - Senior Executive" ────────────
  ENGINE evaluate() result: 0
  VERBOSE trace:
  conditional — evaluating condition:
    logical(and) input 0:
        reference(cumplimiento_colocacion) → 1.1354
        constant(120) → 120
      compare(gte) 1.1354 gte 120 → 0
    logical(and) input 1:
        reference(calidad_cartera) → 0.9412
        constant(0.95) → 0.95
      compare(gte) 0.9412 gte 0.95 → 0
    logical(and) → 0
  conditional → ELSE branch:
    conditional — evaluating condition:
      logical(and) input 0:
          reference(cumplimiento_colocacion) → 1.1354
          constant(120) → 120
        compare(gte) 1.1354 gte 120 → 0
      logical(and) input 1:
        logical(and) input 0:
            reference(calidad_cartera) → 0.9412
            constant(0.9) → 0.9
          compare(gte) 0.9412 gte 0.9 → 1
        logical(and) input 1:
            reference(calidad_cartera) → 0.9412
            constant(0.95) → 0.95
          compare(lt) 0.9412 lt 0.95 → 1
        logical(and) → 1
      logical(and) → 0
    conditional → ELSE branch:
      constant(0) → 0
  VERBOSE final: 0

──────────── Component 1: "Deposit Capture - Senior Executive" ────────────
  ENGINE evaluate() result: 0
  VERBOSE trace:
  conditional — evaluating condition:
      reference(cumplimiento_depositos) → 1.282
      constant(130) → 130
    compare(gte) 1.282 gte 130 → 0
  conditional → ELSE branch:
    conditional — evaluating condition:
      logical(and) input 0:
          reference(cumplimiento_depositos) → 1.282
          constant(100) → 100
        compare(gte) 1.282 gte 100 → 0
      logical(and) input 1:
          reference(cumplimiento_depositos) → 1.282
          constant(130) → 130
        compare(lt) 1.282 lt 130 → 1
      logical(and) → 0
    conditional → ELSE branch:
      conditional — evaluating condition:
        logical(and) input 0:
            reference(cumplimiento_depositos) → 1.282
            constant(80) → 80
          compare(gte) 1.282 gte 80 → 0
        logical(and) input 1:
            reference(cumplimiento_depositos) → 1.282
            constant(100) → 100
          compare(lt) 1.282 lt 100 → 1
        logical(and) → 0
      conditional → ELSE branch:
        conditional — evaluating condition:
          logical(and) input 0:
              reference(cumplimiento_depositos) → 1.282
              constant(60) → 60
            compare(gte) 1.282 gte 60 → 0
          logical(and) input 1:
              reference(cumplimiento_depositos) → 1.282
              constant(80) → 80
            compare(lt) 1.282 lt 80 → 1
          logical(and) → 0
        conditional → ELSE branch:
          constant(0) → 0
  VERBOSE final: 0

──────────── Component 2: "Cross Products - Senior Executive" ────────────
  ENGINE evaluate() result: 250
  VERBOSE trace:
    reference(productos_cruzados_vendidos) → 10
    constant(25) → 25
  arithmetic(multiply) 10 ⊕ 25 → 250
  VERBOSE final: 250

──────────── Component 3: "Regulatory Compliance - Senior Executive" ────────────
  ENGINE evaluate() result: 150
  VERBOSE trace:
  conditional — evaluating condition:
      reference(infracciones_regulatorias) → 0
      constant(0) → 0
    compare(eq) 0 eq 0 → 1
  conditional → THEN branch:
    constant(150) → 150
  VERBOSE final: 150

```

---

## PROBE 6 — Legacy translation rule for `bounded_lookup_1d`

`web/src/lib/calculation/legacy-intent-to-dag.ts` lines 351-410 — the translation rule for `bounded_lookup_1d` operations (the closest pre-HF-238 equivalent of BCL Component 1 Deposit Capture tier table):

```typescript
    case 'bounded_lookup_1d': {
      // input falls into one of N boundaries; output is outputs[idx].
      // Boundaries are half-open per Decision 127: [min, max). Final bounded
      // boundary may carry maxInclusive=true.
      const inputNode = translateSource(op.input);
      const boundaries = Array.isArray(op.boundaries) ? op.boundaries : [];
      const outputs = Array.isArray(op.outputs) ? op.outputs : [];

      // HF-238 R2 Closure 4 (relocated OB-120): auto-detect isMarginal for
      // rate-like output sets. Mirrors the pre-HF-238 heuristic at the call
      // site (run-calculation.ts) — if every non-zero output is in (0, 1.0),
      // treat outputs as rates and multiply against the input value.
      // Localizing the heuristic inside the adapter keeps call sites free
      // of named-type dispatch.
      let isMarginal = !!op.isMarginal;
      if (!isMarginal && Array.isArray(outputs)) {
        const nonZero = outputs.filter(v => v !== 0);
        if (nonZero.length > 0 && nonZero.every(v => v > 0 && v < 1.0)) {
          isMarginal = true;
        }
      }

      // Build chain bottom-up; if no boundary matches, return 0 (consistent
      // with executeBoundedLookup1D's no-match return at line 247).
      let chain: PrimeNode = { prime: 'constant', value: 0 };
      for (let i = boundaries.length - 1; i >= 0; i--) {
        const b = boundaries[i];
        const rawOutput = Number(outputs[i] ?? 0);
        const isLast = i === boundaries.length - 1;

        // Construct min check (if b.min !== null)
        const minCheck: PrimeNode | null = b.min === null ? null : {
          prime: 'compare',
          op: b.minInclusive !== false ? 'gte' : 'gt',
          inputs: [inputNode, { prime: 'constant', value: b.min }],
        };
        // Max check (if b.max !== null)
        let maxCheck: PrimeNode | null = null;
        if (b.max !== null) {
          const useInclusive = isLast && b.maxInclusive === true;
          maxCheck = {
            prime: 'compare',
            op: useInclusive ? 'lte' : 'lt',
            inputs: [inputNode, { prime: 'constant', value: b.max }],
          };
        }

        const conditions: PrimeNode[] = [];
        if (minCheck) conditions.push(minCheck);
        if (maxCheck) conditions.push(maxCheck);
        const cond: PrimeNode = conditions.length === 0
          ? { prime: 'constant', value: 1 } // always matches
          : conditions.length === 1
            ? conditions[0]
            : { prime: 'logical', op: 'and', inputs: conditions };

        // OB-117 / HF-238 R2 Closure 4: isMarginal — output is a rate
        // multiplied by inputValue. Effective value combines explicit
        // op.isMarginal with the relocated auto-detect heuristic above.
        const tierValue: PrimeNode = isMarginal

```

The legacy translation reads explicit `boundaries: [{ min, max }, ...]` and `outputs: [...]` from a stored `bounded_lookup_1d` intent. The resulting DAG shape is identical to what the LLM emitted for BCL Component 1 in Probe 1 — BUT the legacy intent shape preserves the structured boundary array, which `extractInputRequirements` consumes via `extractRangeFromBoundaries` to compute `expectedRange`. That `expectedRange` drives `scoreColumnForRequirement` scale detection (the function tries ×1 and ×100 scaling, picks whichever matches column distribution).

For prime_dag emissions, the structured boundaries are gone. Constants are embedded directly in `compare` nodes. `extractInputRequirements` prime_dag case (HF-242) sets `expectedRange: null` because there is no boundary array to extract — scale-factor inference is disabled.

---

## PROBE 7 — File inventory

```
=== intent-types.ts ===
23:export type IntentSource =
43:export type AggregationType = 'sum' | 'average' | 'count' | 'min' | 'max' | 'first' | 'last';
49:export interface Boundary {
73:export type IntentOperation =
87:export interface BoundedLookup1D {
100:export interface BoundedLookup2D {
113:export interface ScalarMultiply {
120:export interface ConditionalGate {
132:export interface AggregateOp {
138:export interface RatioOp {
146:export interface ConstantOp {
152:export interface WeightedBlendOp {
162:export interface TemporalWindowOp {
170:export type TemporalAggregation = 'sum' | 'average' | 'min' | 'max' | 'trend';
173:export interface LinearFunctionOp {
181:export interface PiecewiseLinearOp {
203:export type IntentModifier =
214:export interface VariantRouting {
227:export interface ComponentIntent {
256:export function isIntentOperation(value: unknown): value is IntentOperation {
260:export interface ExecutionTrace {
299:export interface OutputPrecision {
309:export interface RoundingTrace {
319:export const DEFAULT_OUTPUT_PRECISION: OutputPrecision = {
344:export interface PrimePredicate {

=== intent-executor.ts ===
31:export interface EntityData {
49:export interface ExecutionResult {
63:export class IntentExecutorUnknownOperationError extends Error {
77:export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
128:export function evaluate(node: PrimeNode, context: EvalContext): Decimal {
278:export function buildEvalContext(data: EntityData): EvalContext {
328:export function executeIntent(

=== legacy-intent-to-dag.ts ===
29:export class UntranslatableLegacyIntentError extends Error {
61:function translateSource(src: IntentSource | IntentOperation): PrimeNode {
165:function translateOperation(op: IntentOperation): PrimeNode {
620:export function legacyIntentToDAG(
641:export interface LegacyDerivation {
652:export function legacyDerivationToDAG(d: LegacyDerivation): PrimeNode {
747:export function componentIntentToDAG(

=== anthropic-adapter.ts prime markers ===
80:// with the prime-DAG composition prompt. This filter is belt-and-suspenders:
92:      '   The prime-DAG composition guide in the CALCULATION INTENT section',
305:  MULTIPLE thresholds are nested as if/then/else chains
406:Use "conditional_gate" when one or more nested binary criteria gate the calculation.
407:A nested chain of "conditional_gate" expressions can encode multi-tier conditional
408:selection. Before nesting, check Rule 1: if rates change with a ratio input applied
409:to a base, it is "piecewise_linear", not nested "conditional_gate".
430:FOR EACH COMPONENT, produce a "calculationIntent" field as a recursive PrimeNode tree composed of nine irreducible building blocks. The execution engine walks this tree directly. Do NOT emit named operation types (scalar_multiply, conditional_gate, piecewise_linear, etc.) — compose them from primes instead.
434:1. constant     — { "prime": "constant", "value": <number> }
435:2. reference    — { "prime": "reference", "field": "<metric_name>" }
442:                  For hierarchical (district / region) aggregates, compose
443:                  the "scope" prime over an "aggregate" downstream directly —
445:3. arithmetic   — { "prime": "arithmetic", "op": "add"|"subtract"|"multiply"|"divide", "inputs": [A, B] }
447:4. compare      — { "prime": "compare", "op": "gt"|"gte"|"lt"|"lte"|"eq"|"neq", "inputs": [A, B] }
449:5. logical      — { "prime": "logical", "op": "and"|"or"|"not", "inputs": [A, B, ...] }

=== ai-plan-interpreter.ts ===
20:import { isPrimeNode, VALID_PRIMES } from '@/lib/calculation/intent-types';
23:// Phase 1.5's prior throw at convertComponent's default branch named this class
40:// normalizeCalculationMethod + convertComponent) accepts ONLY foundational
299:        return convertComponent(compCopy, index);
348:        return convertComponent(compCopy, index);
383:function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
413:        `[convertComponent] "${base.name}" emitted a prime-DAG calculationIntent ` +
414:        `that does not validate against VALID_PRIMES (${Array.from(VALID_PRIMES).join(',')}). ` +
420:      componentType: 'prime_dag' as FoundationalPrimitive,
433:    `[convertComponent] "${base.name}" calcType="${calcType}" ` +
443:      `[convertComponent] componentType "${calcType}" for component "${base.name}" ` +
472:            `[convertComponent] "${base.name}" boundary canonicalization failed (Decision 127): ${err.message}`,
493:    case 'prime_dag':
508:        `[convertComponent] exhaustive guard failed for "${calcType}" on component "${base.name}". ` +

=== convergence-service.ts ===
1405:export function extractReferencesFromDAG(node: unknown): string[] {
1437:function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
1441:  // HF-242: prime_dag components carry a PrimeNode tree under
1449:  const isPrimeDag = compType === 'prime_dag'
1452:    const refs = extractReferencesFromDAG(intent);
2314:    const reqs = extractInputRequirements(match.component);
2380:    const requirements = extractInputRequirements(comp);

=== run/route.ts ===
37:import { convergeBindings, extractLeafSources, extractReferencesFromDAG } from '@/lib/intelligence/convergence-service';
1306:    // HF-242: prime_dag components carry per-field bindings keyed by the
1308:    // prime_dag branch). The DAG evaluator reads every field from
1312:    // because prime_dag components have NO `actual` / `row` / `numerator`
1318:    if (compType === 'prime_dag' || intentIsPrimeNode) {
1319:      const refs = extractReferencesFromDAG(intent);
1320:      const dagMetrics: Record<string, number> = {};
1327:        dagMetrics[field] = scaled;
1329:          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:prime_dag_field entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | field=${field} | column=${fieldBinding.column} | raw=${rawValue} | scale=${fieldBinding.scale_factor ?? 'undefined'} | scaled=${scaled}`);
1332:      const dagResult = Object.keys(dagMetrics).length > 0 ? dagMetrics : null;
1334:        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=prime_dag | refs=${refs.length} | resolved=${Object.keys(dagMetrics).length} | metrics=${JSON.stringify(dagMetrics)} | returnedNull=${dagResult === null}`);

=== primitive-registry.ts ===
42: * The only non-deprecated identifier is `prime_dag` — a recursive PrimeNode
46: * surfacing the vocabulary to the LLM; only `prime_dag` is presented as a
65:  // HF-238: prime-DAG composition format. A `prime_dag` component carries a
67:  // than one of the legacy operation shapes. The engine routes prime_dag
70:  'prime_dag',
98:   * but never as a top-level operation. `prime_dag` is the recommended
119:   * lines 418-643) explicitly forbids. New emissions should use prime_dag
139:   * filtered out of prompt-facing surfaces. Only `prime_dag` (and any
153:  // FOUNDATIONAL_PRIMITIVES). New emissions should use 'prime_dag'.
159:    description: '1D threshold table — adapter-only; new emissions use prime_dag.',

```

---

## PROBE 8 — LLM input context

**Script:** `web/scripts/diag-054-probe8-llm-context.ts`

The plan source text is not persisted on `rule_sets`. Available metadata names the source file and sheets:

```
Rule set columns: [
  'id',                'tenant_id',
  'name',              'description',
  'status',            'version',
  'effective_from',    'effective_to',
  'population_config', 'input_bindings',
  'components',        'cadence_config',
  'outcome_config',    'metadata',
  'created_by',        'approved_by',
  'created_at',        'updated_at'
]

metadata:
{
  "source": "sci",
  "plan_type": "additive_lookup",
  "aiConfidence": 0.95,
  "batchedSheets": [
    "BCL_Plan_Comisiones_2025.xlsx::Plan General::0",
    "BCL_Plan_Comisiones_2025.xlsx::Tablas de Tasas::1",
    "BCL_Plan_Comisiones_2025.xlsx::Metas Mensuales::2"
  ],
  "contentUnitId": "BCL_Plan_Comisiones_2025.xlsx::Plan General::0"
}

```

The actual interpretation input would have been: the system prompt block from Probe 2 + extracted XLSX text from `BCL_Plan_Comisiones_2025.xlsx` sheets `[Plan General, Tablas de Tasas, Metas Mensuales]` (per `metadata.batchedSheets`). The source XLSX file is uploaded to `ingestion-raw` storage and consumed at plan-interpretation time but is not retained for retrospective inspection from rule_sets.

---

## END

Eight probes complete. The pasted output is the verbatim state of the DAG-engine pathway at `main @ ad2f1038`. No interpretation. No recommendations. Architect reads and dispositions.
