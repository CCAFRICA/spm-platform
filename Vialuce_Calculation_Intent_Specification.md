# Vialuce Calculation Intent Specification
## The Negotiation Interface Between Domain Agents and Foundational Agents
### Draft v1 — February 22, 2026

---

## PURPOSE

The Calculation Intent is the structured contract that a Domain Agent produces and a Foundational Agent executes. It is the negotiation interface between the two tiers of the agentic architecture.

**The Domain Agent (e.g., ICM Agent) says:** "I have a compensation plan with 6 components. Here's exactly what each one needs."

**The Foundational Calculation Agent says:** "I don't know what compensation is. Give me structural instructions and I'll execute them."

The Calculation Intent IS those structural instructions. It contains everything the Calculation Agent needs to produce an outcome — without any domain knowledge.

---

## DESIGN PRINCIPLES

### 1. Zero Domain Language
The Calculation Intent never contains words like "commission," "attainment," "quota," "payout," "compensation," "royalty," or "rebate." It uses structural/mathematical vocabulary only.

**Test:** If you replaced every domain term with a random word and the Calculation Agent still produced correct results, the Intent is properly domain-agnostic.

### 2. Complete Specification
The Calculation Agent should execute the Intent without inference, heuristics, or assumptions. Everything it needs is in the Intent. No looking up patterns. No matching sheet names. No guessing what a field means.

**Test:** If you gave this Intent to a junior developer with no domain knowledge, could they write a function that produces the correct output? If yes, the Intent is complete.

### 3. Composable Primitives
Complex calculations are composed from simple primitives. A "matrix lookup" is a 2D bounded lookup. A "tiered commission" is a 1D bounded lookup. A "percentage of sales" is a scalar multiplication. The Intent expresses composition, not types.

**Test:** Can every calculation in the system be expressed as a tree of these primitives? If a new plan requires a primitive that doesn't exist, add it to the vocabulary — don't add a domain-specific handler.

### 4. Self-Describing
The Intent carries its own documentation. Every boundary, every condition, every transform includes metadata that the Insight Agent and Resolution Agent can use to generate explanations and trace evidence.

---

## THE STRUCTURAL VOCABULARY

### Primitive Operations

These are the atomic operations the Calculation Agent can execute. They are mathematical/structural, not domain-specific.

#### 1. BOUNDED_LOOKUP_1D
Find a value in a ranked table based on where an input falls within boundaries.

```json
{
  "operation": "bounded_lookup_1d",
  "input": {
    "source": "ratio",
    "sourceSpec": { "numerator": "metric:actual", "denominator": "metric:target" }
  },
  "boundaries": [
    { "min": 0, "max": 0.9999, "minInclusive": true, "maxInclusive": false },
    { "min": 1.0, "max": 1.0499, "minInclusive": true, "maxInclusive": false },
    { "min": 1.05, "max": 1.0999, "minInclusive": true, "maxInclusive": false },
    { "min": 1.10, "max": null, "minInclusive": true, "maxInclusive": false }
  ],
  "outputs": [0, 150, 300, 500],
  "noMatchBehavior": "zero",
  "metadata": {
    "description": "1D threshold lookup: ratio of actual to target determines output",
    "boundaryCount": 4,
    "outputRange": { "min": 0, "max": 500 }
  }
}
```

**Domain-agnostic:** This doesn't know if it's a sales commission tier table, a franchise royalty schedule, or a food safety penalty scale. It maps a ratio to a fixed output via boundaries.

#### 2. BOUNDED_LOOKUP_2D
Find a value in a grid based on where two inputs fall within their respective boundaries.

```json
{
  "operation": "bounded_lookup_2d",
  "inputs": {
    "row": {
      "source": "ratio",
      "sourceSpec": { "numerator": "metric:actual", "denominator": "metric:target" }
    },
    "column": {
      "source": "aggregate",
      "sourceSpec": { "field": "metric:group_amount", "scope": "group", "aggregation": "sum" }
    }
  },
  "rowBoundaries": [
    { "min": 0, "max": 0.7999, "minInclusive": true, "maxInclusive": false },
    { "min": 0.80, "max": 0.8999, "minInclusive": true, "maxInclusive": false },
    { "min": 0.90, "max": 0.9999, "minInclusive": true, "maxInclusive": false },
    { "min": 1.00, "max": 1.4999, "minInclusive": true, "maxInclusive": false },
    { "min": 1.50, "max": null, "minInclusive": true, "maxInclusive": false }
  ],
  "columnBoundaries": [
    { "min": 0, "max": 59999, "minInclusive": true, "maxInclusive": false },
    { "min": 60000, "max": 99999, "minInclusive": true, "maxInclusive": false },
    { "min": 100000, "max": 119999, "minInclusive": true, "maxInclusive": false },
    { "min": 120000, "max": 179999, "minInclusive": true, "maxInclusive": false },
    { "min": 180000, "max": null, "minInclusive": true, "maxInclusive": false }
  ],
  "outputGrid": [
    [0, 0, 0, 500, 800],
    [200, 300, 500, 800, 1100],
    [300, 500, 800, 1100, 1500],
    [800, 1100, 1500, 1800, 2500],
    [1000, 1300, 1800, 2200, 3000]
  ],
  "noMatchBehavior": "zero",
  "metadata": {
    "description": "2D grid lookup: row input × column input determines output",
    "gridDimensions": "5×5",
    "outputRange": { "min": 0, "max": 3000 }
  }
}
```

**Domain-agnostic:** This doesn't know it's an optical sales incentive matrix. It's a 2D grid where a ratio determines the row and a group aggregate determines the column.

#### 3. SCALAR_MULTIPLY
Multiply a value by a fixed rate.

```json
{
  "operation": "scalar_multiply",
  "input": {
    "source": "metric",
    "sourceSpec": { "field": "metric:amount" }
  },
  "rate": 0.04,
  "metadata": {
    "description": "Fixed rate multiplication: input × rate = output",
    "rate": 0.04
  }
}
```

**Domain-agnostic:** Could be a 4% commission, a 4% royalty, or a 4% penalty. The agent doesn't care.

#### 4. CONDITIONAL_GATE
Evaluate a condition. If true, execute the inner operation. If false, produce the fallback value.

```json
{
  "operation": "conditional_gate",
  "condition": {
    "left": {
      "source": "aggregate",
      "sourceSpec": { "field": "metric:group_ratio", "scope": "group", "aggregation": "first" }
    },
    "operator": ">=",
    "right": { "source": "constant", "value": 1.0 }
  },
  "onTrue": {
    "operation": "scalar_multiply",
    "input": { "source": "metric", "sourceSpec": { "field": "metric:amount" } },
    "rate": 0.04
  },
  "onFalse": { "operation": "constant", "value": 0 },
  "metadata": {
    "description": "Conditional: if group ratio >= 1.0, apply scalar multiplication; else zero"
  }
}
```

**Domain-agnostic:** "If a group-level ratio meets a threshold, apply a rate. Otherwise, zero." Could be a store attainment gate for insurance commission, a franchise compliance gate for rebates, or a quality score gate for bonuses.

#### 5. AGGREGATE
Compute an aggregate value from entity or group data.

```json
{
  "operation": "aggregate",
  "source": "metric",
  "sourceSpec": { "field": "metric:amount", "scope": "group", "aggregation": "sum" },
  "metadata": {
    "description": "Sum of amount values at group scope"
  }
}
```

Aggregation types: `sum`, `average`, `count`, `min`, `max`, `first`, `last`.
Scope: `entity` (individual data only), `group` (data from the entity's group), `global` (all data in period).

#### 6. RATIO
Compute a ratio from two values.

```json
{
  "operation": "ratio",
  "numerator": { "source": "metric", "sourceSpec": { "field": "metric:actual" } },
  "denominator": { "source": "metric", "sourceSpec": { "field": "metric:target" } },
  "zeroDenominatorBehavior": "zero",
  "metadata": {
    "description": "Ratio of actual to target"
  }
}
```

#### 7. CONSTANT
A fixed value.

```json
{
  "operation": "constant",
  "value": 0,
  "metadata": { "description": "Fixed zero value" }
}
```

---

## INPUT SOURCES

Every operation's input comes from one of these sources:

### metric
A value from the entity's committed data, identified by semantic type (not column name).

```json
{ "source": "metric", "sourceSpec": { "field": "metric:actual" } }
```

The `metric:` prefix signals to the Ingestion Agent's field mapping. The Calculation Agent resolves `metric:actual` by looking up the AI Import Context for which source column was mapped to semantic type "actual" (or "amount" — resolved via the AI's classification, not hardcoded synonyms).

### ratio
A computed ratio between two metrics.

```json
{
  "source": "ratio",
  "sourceSpec": { "numerator": "metric:actual", "denominator": "metric:target" }
}
```

### aggregate
An aggregated value at a specified scope.

```json
{
  "source": "aggregate",
  "sourceSpec": { "field": "metric:amount", "scope": "group", "aggregation": "sum" }
}
```

### constant
A literal value.

```json
{ "source": "constant", "value": 1.0 }
```

### prior_component
The output of a previously calculated component (for chaining/dependencies).

```json
{ "source": "prior_component", "sourceSpec": { "componentIndex": 0 } }
```

### entity_attribute
An attribute from the entity record (for variant routing, eligibility).

```json
{ "source": "entity_attribute", "sourceSpec": { "attribute": "certification_status" } }
```

---

## VARIANT ROUTING

Some rules produce different outcomes based on entity attributes (e.g., certified vs non-certified). This is expressed as variant routing at the component level:

```json
{
  "variants": {
    "routingAttribute": "entity_attribute:certification_status",
    "routes": [
      {
        "matchValue": "certified",
        "intent": { "operation": "bounded_lookup_2d", "...": "..." }
      },
      {
        "matchValue": "non_certified",
        "intent": { "operation": "bounded_lookup_2d", "...": "..." }
      }
    ],
    "noMatchBehavior": "error"
  }
}
```

**Domain-agnostic:** The routing attribute is whatever the entity record carries. Could be certification status, market, job title, franchise tier. The Calculation Agent doesn't interpret the attribute — it matches values.

---

## MODIFIERS

Modifiers are applied after the base calculation:

### Cap (Ceiling)
```json
{
  "modifier": "cap",
  "maxValue": 5000,
  "scope": "per_period",
  "metadata": { "description": "Maximum output per period: 5000" }
}
```

### Floor (Minimum)
```json
{
  "modifier": "floor",
  "minValue": 0,
  "scope": "per_period",
  "metadata": { "description": "Minimum output: 0 (no negative outcomes)" }
}
```

### Proration
```json
{
  "modifier": "proration",
  "numerator": { "source": "entity_attribute", "sourceSpec": { "attribute": "active_days" } },
  "denominator": { "source": "constant", "value": 30 },
  "metadata": { "description": "Prorate by active days in period" }
}
```

### Temporal Adjustment (Clawback/Reversal)
```json
{
  "modifier": "temporal_adjustment",
  "lookbackPeriods": 6,
  "triggerCondition": {
    "source": "entity_attribute",
    "sourceSpec": { "attribute": "status" },
    "operator": "==",
    "value": "cancelled"
  },
  "adjustmentType": "full_reversal",
  "metadata": { "description": "Full reversal if entity status is cancelled within 6 periods" }
}
```

---

## COMPLETE COMPONENT INTENT

A full component Intent that a Domain Agent produces and the Calculation Agent executes:

```json
{
  "componentIndex": 0,
  "label": "Component 1",
  "confidence": 0.94,
  "dataSource": {
    "sheetClassification": "individual_performance",
    "entityScope": "entity",
    "requiredMetrics": ["actual", "target"],
    "groupLinkField": "metric:group_id"
  },
  "variants": {
    "routingAttribute": "entity_attribute:variant_key",
    "routes": [
      {
        "matchValue": "variant_a",
        "intent": {
          "operation": "bounded_lookup_2d",
          "inputs": {
            "row": {
              "source": "ratio",
              "sourceSpec": { "numerator": "metric:actual", "denominator": "metric:target" }
            },
            "column": {
              "source": "aggregate",
              "sourceSpec": { "field": "metric:group_amount", "scope": "group", "aggregation": "sum" }
            }
          },
          "rowBoundaries": [
            { "min": 0, "max": 0.7999 },
            { "min": 0.80, "max": 0.8999 },
            { "min": 0.90, "max": 0.9999 },
            { "min": 1.00, "max": 1.4999 },
            { "min": 1.50, "max": null }
          ],
          "columnBoundaries": [
            { "min": 0, "max": 59999 },
            { "min": 60000, "max": 99999 },
            { "min": 100000, "max": 119999 },
            { "min": 120000, "max": 179999 },
            { "min": 180000, "max": null }
          ],
          "outputGrid": [
            [0, 0, 0, 500, 800],
            [200, 300, 500, 800, 1100],
            [300, 500, 800, 1100, 1500],
            [800, 1100, 1500, 1800, 2500],
            [1000, 1300, 1800, 2200, 3000]
          ],
          "noMatchBehavior": "zero"
        }
      },
      {
        "matchValue": "variant_b",
        "intent": {
          "operation": "bounded_lookup_2d",
          "inputs": { "...same structure, different grid values..." : true },
          "outputGrid": [
            [0, 0, 0, 250, 400],
            [100, 150, 250, 400, 550],
            [150, 250, 400, 550, 750],
            [400, 550, 750, 600, 1250],
            [500, 650, 900, 2200, 1500]
          ]
        }
      }
    ],
    "noMatchBehavior": "error"
  },
  "modifiers": [
    { "modifier": "floor", "minValue": 0, "scope": "per_period" }
  ],
  "metadata": {
    "planReference": "Slide 3-4",
    "aiConfidence": 0.94,
    "interpretationNotes": "2D grid with 5 performance tiers × 5 group amount ranges. Two variants routed by entity attribute."
  }
}
```

---

## FULL RULE SET AS CALCULATION INTENT

The rule_sets table stores components as JSONB. Today this JSONB contains domain-flavored structures (`calculationType: "matrix_lookup"`, `tiers: [...]`). The migration path:

### Today (Domain-Flavored)
```json
{
  "components": [
    {
      "name": "Optical Sales Incentive - Certified",
      "calculationType": "matrix_lookup",
      "tiers": [...],
      "matrix": {...}
    }
  ]
}
```

### Target (Calculation Intent)
```json
{
  "components": [
    {
      "componentIndex": 0,
      "label": "Component 1",
      "confidence": 0.94,
      "dataSource": { "sheetClassification": "...", "entityScope": "entity", "requiredMetrics": ["actual", "target"] },
      "variants": { "...": "..." },
      "modifiers": [],
      "metadata": { "domainLabel": "Optical Sales Incentive - Certified", "planReference": "Slide 3" }
    }
  ]
}
```

**Note:** The domain label ("Optical Sales Incentive") moves to metadata. It's for display only. The Calculation Agent never reads it.

---

## DATA SOURCE RESOLUTION

The `dataSource` block tells the Calculation Agent where to find data for this component. It references the AI Import Context (persisted by the Ingestion Agent in OB-75):

```json
{
  "dataSource": {
    "sheetClassification": "individual_performance",
    "entityScope": "entity",
    "requiredMetrics": ["actual", "target"],
    "groupLinkField": "metric:group_id"
  }
}
```

The Calculation Agent resolves this:
1. Looks up AI Import Context for which sheet was classified as "individual_performance"
2. Filters committed_data by that sheet's data_type
3. For each entity, extracts metrics mapped to semantic types "actual" and "target"
4. If `groupLinkField` is specified, resolves the entity's group and fetches group-level data

**Zero hardcoded sheet names. Zero hardcoded column names. Everything resolved through AI Import Context.**

---

## HOW THE DOMAIN AGENT PRODUCES THE INTENT

### Step 1: Interpretation Agent reads the plan document
The AI sees: "Optical Sales — Certified Optometrist matrix" with a 5×5 grid, Spanish labels, percentage boundaries, currency outputs.

### Step 2: Domain Agent (ICM) contextualizes
The ICM Agent recognizes: "This is a performance-to-outcome matrix. The row is individual attainment (ratio of sales to quota). The column is store-level optical sales (group aggregate). Two variants exist for certified vs non-certified."

### Step 3: Domain Agent translates to structural vocabulary
The ICM Agent produces the Calculation Intent using only structural primitives: `bounded_lookup_2d`, `ratio`, `aggregate`, `entity_attribute` routing. No domain terms in the execution path.

### Step 4: Calculation Agent executes
The Calculation Agent reads the Intent and executes it. It doesn't know this is compensation. It resolves metrics from committed_data via AI Import Context, computes ratios, performs lookups, applies modifiers, and produces an outcome with a trace.

---

## EXECUTION TRACE

Every execution produces a trace that the Reconciliation Agent and Resolution Agent can read:

```json
{
  "entityId": "96568046",
  "componentIndex": 0,
  "trace": {
    "variantRoute": { "attribute": "certification_status", "value": "certified", "matched": "variant_a" },
    "inputs": {
      "row": { "source": "ratio", "numerator": 285000, "denominator": 300000, "result": 0.95 },
      "column": { "source": "aggregate", "field": "group_amount", "scope": "store_47", "result": 145000 }
    },
    "lookupResolution": {
      "rowBoundaryMatched": { "min": 0.90, "max": 0.9999, "index": 2 },
      "columnBoundaryMatched": { "min": 120000, "max": 179999, "index": 3 },
      "outputValue": 1100
    },
    "modifiers": [],
    "finalOutcome": 1100,
    "confidence": 0.97
  }
}
```

**This trace is the evidence package for disputes, reconciliation, and audit.** The Resolution Agent reads it. The Reconciliation Agent compares it against benchmark data. The Insight Agent generates the explanation: "You received $1,100 for Component 1 because your performance ratio was 95% (row 3) and your group's aggregate was $145,000 (column 4), producing grid value $1,100."

---

## PRIMITIVE COMPLETENESS CHECK

Can every known calculation pattern be expressed with these primitives?

| Current Engine Handler | Calculation Intent Expression | Primitives Used |
|---|---|---|
| `matrix_lookup` | `bounded_lookup_2d` with ratio row + aggregate column | bounded_lookup_2d, ratio, aggregate |
| `tier_lookup` | `bounded_lookup_1d` with ratio or aggregate input | bounded_lookup_1d, ratio or aggregate |
| `percentage` | `scalar_multiply` with metric input | scalar_multiply |
| `conditional_percentage` | `conditional_gate` → `scalar_multiply` | conditional_gate, scalar_multiply, aggregate |
| Clawback | `temporal_adjustment` modifier | temporal_adjustment |
| Scope blend | `aggregate` at multiple scopes + weighted sum | aggregate, scalar_multiply, sum |
| Cascading distribution | Sequential `scalar_multiply` with `prior_component` input | scalar_multiply, prior_component |
| Eligibility gate | `conditional_gate` with `entity_attribute` | conditional_gate |

**Missing primitives to add later:**
- `weighted_blend` — for scope blending (50% individual + 50% team)
- `ranked_selection` — for stack ranking / forced distribution
- `graph_traversal` — for cascading distribution chains
- `temporal_window` — for rolling averages / recovery windows

These can be added to the vocabulary without changing any existing Intent structures. The Calculation Agent just learns a new primitive.

---

## MIGRATION PATH

### Phase 1 (OB-75 — happening now)
- Persist AI Import Context (Ingestion Agent memory)
- Eliminate SHEET_COMPONENT_PATTERNS (stop hardcoding)
- Engine reads AI context from DB

### Phase 2 (OB-76/77)
- AI Plan Interpreter outputs Calculation Intent format alongside current component structure
- Both stored in rule_sets.components JSONB
- Calculation engine reads Intent when present, falls back to current structure when not
- Dual-path: proves Intent produces same results as current engine

### Phase 3 (OB-78/79)
- Calculation engine uses Intent exclusively
- Remove current hardcoded handlers (matrix_lookup, tier_lookup, etc.)
- Add confidence scores to calculation outputs
- Add execution traces

### Phase 4 (OB-80+)
- Domain Agent produces Intent from plan interpretation
- Foundational Calculation Agent executes without domain awareness
- Training signal capture on outcomes
- Cross-tenant pattern learning (Flywheel 2)

---

*"The Domain Agent understands the plan. The Foundational Agent executes the math. The Intent is the contract between them."*

*"There is no enum of allowed component types. There is a vocabulary of structural primitives that can express any rule."*
