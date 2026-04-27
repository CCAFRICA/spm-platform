# AUD-004 Phase 0: Vocabulary and Shape Inventory

**Authored:** 2026-04-27
**Branch:** aud-004-phase-0 (off origin/main at 6bc005e65ec263f6b2c234c3501af4d80032f51d)
**Scope:** READ-ONLY inspection. No code changes, no DB modifications.
**Deliverable:** Pasted evidence corpus. No interpretation. No findings.
**Predecessor:** DIAG-024_FINDINGS.md, AUD-002_SIGNAL_SURFACE_INTEGRITY_v2.md
**Governing:** Decision 64 v2, Decision 151, Decision 153 (LOCKED, not yet on main),
              AP-25 (Korean Test as gate), AUD-002 v2 audit pattern.

---

## Phase 0 — Initialization

### Step 0.0 — Substrate Verification

```
$ git fetch origin
$ git rev-parse origin/main
6bc005e65ec263f6b2c234c3501af4d80032f51d

$ git log -1 origin/main --pretty=format:'%H %s%n%aD'
6bc005e65ec263f6b2c234c3501af4d80032f51d Merge pull request #344 from CCAFRICA/diag-024-importer-engine-alignment
Mon, 27 Apr 2026 05:37:41 -0700
```

**SHA divergence note:** The DIAG-024 anchor recorded in the directive is `6504b7cfeac23e8410643c5f0b3a844f59597e67` (the squashed commit on the diag-024 feature branch). `origin/main` HEAD is `6bc005e65ec263f6b2c234c3501af4d80032f51d`, the merge commit that brought PR #344 onto `main`. Tree contents are identical to the merged DIAG-024 commit. Per directive instruction ("If HEAD differs: Paste the new SHA and the `git log` entry. Do not halt. Report and continue."), recorded and continuing.

### Step 0.1 — Branch Creation

```
$ git checkout main
Already on 'main'
Your branch is up to date with 'origin/main'.

$ git pull origin main
From https://github.com/CCAFRICA/spm-platform
 * branch              main       -> FETCH_HEAD
Already up to date.

$ git checkout -b aud-004-phase-0
Switched to a new branch 'aud-004-phase-0'

$ git rev-parse HEAD
6bc005e65ec263f6b2c234c3501af4d80032f51d

$ git branch --show-current
aud-004-phase-0
```

### Step 0.2 — Report File Scaffold

This file (`docs/audits/AUD_004_PHASE_0_INVENTORY.md`) is the scaffold. Subsequent phases append below.

---

## Phase 0A — Vocabulary Inventory at Six Switch Boundaries

### Boundary 1 — Plan-Agent System Prompt

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
**Construct:** `SYSTEM_PROMPTS['plan_interpretation']` template literal, lines 134-541.

**Discovery output:**

```
$ grep -rn "system.*prompt\|systemPrompt\|SYSTEM_PROMPT" web/src/lib/ai/ --include="*.ts" | grep -v "node_modules\|.next"
web/src/lib/ai/providers/anthropic-adapter.ts:21:const SYSTEM_PROMPTS: Record<AITaskType, string> = {
web/src/lib/ai/providers/anthropic-adapter.ts:805:    const systemPrompt = SYSTEM_PROMPTS[request.task];
web/src/lib/ai/providers/anthropic-adapter.ts:841:      system: systemPrompt,

$ grep -rn "calculationIntent\|operation.*bounded_lookup\|operation.*linear_function" web/src/lib/ai/providers/ --include="*.ts" | head -30
web/src/lib/ai/providers/anthropic-adapter.ts:355:FOR EACH COMPONENT, also produce a "calculationIntent" field using this domain-agnostic structural vocabulary. ...
web/src/lib/ai/providers/anthropic-adapter.ts:377:MAPPING RULES (type → calculationIntent operation):
web/src/lib/ai/providers/anthropic-adapter.ts:389:EXAMPLE calculationIntent for a tiered_lookup:
web/src/lib/ai/providers/anthropic-adapter.ts:391:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:392:    "operation": "bounded_lookup_1d",
web/src/lib/ai/providers/anthropic-adapter.ts:405:EXAMPLE calculationIntent for a matrix_lookup:
web/src/lib/ai/providers/anthropic-adapter.ts:407:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:408:    "operation": "bounded_lookup_2d",
web/src/lib/ai/providers/anthropic-adapter.ts:426:EXAMPLE calculationIntent for a flat_percentage:
web/src/lib/ai/providers/anthropic-adapter.ts:428:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:435:EXAMPLE calculationIntent for a conditional_percentage (2 conditions, sorted by threshold descending):
web/src/lib/ai/providers/anthropic-adapter.ts:437:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:466:EXAMPLE calculationIntent for a linear_function:
web/src/lib/ai/providers/anthropic-adapter.ts:468:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:469:    "operation": "linear_function",
web/src/lib/ai/providers/anthropic-adapter.ts:476:EXAMPLE calculationIntent for a piecewise_linear:
web/src/lib/ai/providers/anthropic-adapter.ts:478:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:490:EXAMPLE calculationIntent for a scope_aggregate:
web/src/lib/ai/providers/anthropic-adapter.ts:492:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:499:EXAMPLE calculationIntent for a conditional_gate (binary prerequisite):
web/src/lib/ai/providers/anthropic-adapter.ts:501:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:517:EXAMPLE calculationIntent for a scalar_multiply:
web/src/lib/ai/providers/anthropic-adapter.ts:519:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:526:EXAMPLE calculationIntent for a linear_function with cap modifier:
web/src/lib/ai/providers/anthropic-adapter.ts:528:  "calculationIntent": {
web/src/lib/ai/providers/anthropic-adapter.ts:529:    "operation": "linear_function",
web/src/lib/ai/providers/anthropic-adapter.ts:539:CRITICAL: Every component MUST include both "calculationMethod" (existing format) AND "calculationIntent" (structural vocabulary). The calculationIntent must be valid against the 7 primitives above.
```

**Runtime authority confirmation:**

```
$ grep -rn "plan_interpretation\|task.*interpret" web/src/ --include="*.ts" | grep -v "node_modules\|.next"
web/src/lib/ai/types.ts:54:  | 'plan_interpretation'           // Extract compensation rules from document
web/src/lib/ai/providers/anthropic-adapter.ts:134:  plan_interpretation: `You are an expert ...
web/src/lib/ai/providers/anthropic-adapter.ts:812:    if (pdfBase64 && (request.task === 'plan_interpretation' || request.task === 'document_analysis')) {
web/src/lib/ai/providers/anthropic-adapter.ts:951:      case 'plan_interpretation': {
web/src/lib/ai/signal-persistence.ts:22:  signalType: string;          // 'sheet_classification' | 'field_mapping' | 'plan_interpretation' | 'training:*'
web/src/lib/ai/ai-service.ts:257:        task: 'plan_interpretation',
```

The prompt is source-code-resident in `anthropic-adapter.ts` (no DB load, no env-var, no remote fetch). HALT-A NOT triggered.

**Operation name enumeration (string literals appearing in the prompt):**

`calculationMethod.type` strings (in component-shape examples):
- `matrix_lookup` — line 150, 152
- `tiered_lookup` — line 181, 183
- `flat_percentage` — line 200, 202
- `conditional_percentage` — line 214, 216
- `linear_function` — line 233, 235
- `piecewise_linear` — line 249, 251
- `scope_aggregate` — line 269, 271
- `scalar_multiply` — line 283, 285
- `conditional_gate` — line 297, 299

`calculationIntent.operation` strings (in 7-primitives list and examples):
- `bounded_lookup_1d` — line 358, 392
- `bounded_lookup_2d` — line 359, 408
- `scalar_multiply` — line 360, 429, 445, 457, 509, 520
- `conditional_gate` — line 361, 438, 450, 502
- `aggregate` — line 362
- `ratio` — line 363
- `constant` — line 364, 461, 513
- `linear_function` — line 469, 529 (in examples; declared as primitive only via mapping-rule line 382)
- `piecewise_linear` — line 479 (in examples; declared as primitive only via mapping-rule line 383)
- `scope_aggregate` — line 493 (in examples; declared as primitive only via mapping-rule line 385)

**Example block enumeration (line ranges):**

- MATRIX LOOKUP example (calculationMethod): lines 144-174
- TIERED LOOKUP example: lines 176-193
- FLAT PERCENTAGE example: lines 195-207
- CONDITIONAL PERCENTAGE example: lines 209-226
- LINEAR FUNCTION example: lines 228-241
- PIECEWISE LINEAR example: lines 243-262
- SCOPE AGGREGATE example: lines 264-277
- SCALAR MULTIPLY example: lines 279-290
- CONDITIONAL GATE example: lines 292-307
- calculationIntent example for tiered_lookup: lines 389-403
- calculationIntent example for matrix_lookup: lines 405-424
- calculationIntent example for flat_percentage: lines 426-433
- calculationIntent example for conditional_percentage: lines 435-464
- calculationIntent example for linear_function: lines 466-474
- calculationIntent example for piecewise_linear: lines 476-488
- calculationIntent example for scope_aggregate: lines 490-497
- calculationIntent example for conditional_gate: lines 499-515
- calculationIntent example for scalar_multiply: lines 517-524
- calculationIntent example for linear_function with cap modifier: lines 526-537

**Constraint / "must" statement enumeration:**

- Line 309: `TYPE SELECTION RULES (MANDATORY — resolve ambiguity between similar types):`
- Line 311-320: RULE 1 — `When a plan describes rates (percentages) that change based on quota attainment ... ALWAYS use "piecewise_linear". NEVER use "conditional_percentage" or nested "conditional_gate" for quota-attainment rate curves.`
- Line 322-324: RULE 2 — `When tiers produce FIXED DOLLAR AMOUNTS ... use "tiered_lookup". When tiers produce RATES ... use "piecewise_linear".`
- Line 326-330: RULE 3 — `Use "conditional_gate" when there is ONE condition that gates ALL payout. Use "conditional_percentage" when MULTIPLE conditions select DIFFERENT RATES on the same metric.`
- Line 332-335: RULE 4 — `If the plan has a fixed base draw plus a commission rate, use "linear_function". If there is only a commission rate with no base draw, use "scalar_multiply". Do NOT use "linear_function" with intercept=0 — use "scalar_multiply" instead.`
- Line 337-339: RULE 5 — `flat_percentage is a LEGACY ALIAS for scalar_multiply: Always prefer "scalar_multiply".`
- Line 357: `7 PRIMITIVE OPERATIONS:` (lists 7: bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate, aggregate, ratio, constant)
- Line 377: `MAPPING RULES (type → calculationIntent operation):`
- Line 384: `IMPORTANT: piecewise_linear ALWAYS maps to piecewise_linear operation, NEVER to conditional_gate chain`
- Line 539: `CRITICAL: Every component MUST include both "calculationMethod" (existing format) AND "calculationIntent" (structural vocabulary). The calculationIntent must be valid against the 7 primitives above.`

**Vocabulary divergence within the prompt itself (recorded as evidence, not classified):**

The prompt declares "7 PRIMITIVE OPERATIONS" at line 357 (bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate, aggregate, ratio, constant). The MAPPING RULES section at lines 377-387 and the example blocks at lines 466-537 introduce additional operation strings (`linear_function`, `piecewise_linear`, `scope_aggregate`) used in `calculationIntent.operation` that are NOT among the 7 declared primitives. Line 539 instructs `calculationIntent must be valid against the 7 primitives above`, but the immediately preceding examples write `"operation": "linear_function"`, `"operation": "piecewise_linear"`, and `"operation": "scope_aggregate"`.

**Full prompt verbatim (lines 134-541):**

````
plan_interpretation: `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content, INCLUDING ALL PAYOUT VALUES.

CRITICAL REQUIREMENTS:
1. Extract EVERY distinct compensation component - do NOT merge similar components
2. Each table, each metric, each KPI with its own payout structure is a SEPARATE component
3. Detect ALL employee types/classifications if the document has different payout levels for different roles
4. CRITICAL: Extract ALL numeric payout values from every table - do NOT just identify structure

FOR EACH COMPONENT TYPE, EXTRACT COMPLETE DATA:

MATRIX LOOKUP (2D tables with row and column axes):
- Extract row axis: metric name, label, and ALL range boundaries
- Extract column axis: metric name, label, and ALL range boundaries
- Extract the COMPLETE values matrix - every cell value as a number
- Example structure:
  {
    "type": "matrix_lookup",
    "calculationMethod": {
      "type": "matrix_lookup",
      "rowAxis": {
        "metric": "optical_attainment",
        "label": "% Cumplimiento de meta Optica",
        "ranges": [
          { "min": 0, "max": 80, "label": "Menos de 80%" },
          { "min": 80, "max": 90, "label": "80% a menos de 90%" },
          { "min": 90, "max": 100, "label": "90% a menos de 100%" },
          { "min": 100, "max": 150, "label": "100% a menos de 150%" },
          { "min": 150, "max": 999999, "label": "150% o mas" }
        ]
      },
      "columnAxis": {
        "metric": "store_optical_sales",
        "label": "Venta de Optica de la tienda",
        "ranges": [
          { "min": 0, "max": 60000, "label": "Menos de $60k" },
          { "min": 60000, "max": 100000, "label": "$60k-$100K" }
        ]
      },
      "values": [[0, 0], [200, 300], [300, 500]]
    }
  }

TIERED LOOKUP (1D tables with ranges and payouts):
- Extract metric name and label
- Extract EVERY tier with min, max, and payout value
- Example:
  {
    "type": "tiered_lookup",
    "calculationMethod": {
      "type": "tiered_lookup",
      "metric": "store_sales_attainment",
      "metricLabel": "% Cumplimiento de meta de venta de tienda",
      "tiers": [
        { "min": 0, "max": 100, "payout": 0, "label": "<100%" },
        { "min": 100, "max": 105, "payout": 150, "label": "100%-104.99%" },
        { "min": 105, "max": 110, "payout": 300, "label": "105%-109.99%" },
        { "min": 110, "max": 999999, "payout": 500, "label": ">=110%" }
      ]
    }
  }

FLAT PERCENTAGE (simple rate applied to a base):
- Extract the rate as a decimal (4% = 0.04)
- Extract what it applies to
- Example:
  {
    "type": "flat_percentage",
    "calculationMethod": {
      "type": "flat_percentage",
      "metric": "warranty_sales",
      "metricLabel": "Garantia Extendida",
      "rate": 0.04
    }
  }

CONDITIONAL PERCENTAGE (different rates based on conditions):
- Extract each condition with threshold, operator, and rate
- Extract what the percentage applies to
- Example:
  {
    "type": "conditional_percentage",
    "calculationMethod": {
      "type": "conditional_percentage",
      "metric": "insurance_sales",
      "metricLabel": "Venta de Seguros",
      "conditionMetric": "store_goal_attainment",
      "conditionMetricLabel": "Cumplimiento Meta",
      "conditions": [
        { "threshold": 100, "operator": "<", "rate": 0.03, "label": "<100% cumplimiento" },
        { "threshold": 100, "operator": ">=", "rate": 0.05, "label": ">=100% cumplimiento" }
      ]
    }
  }

LINEAR FUNCTION (continuous formula: y = slope × input + intercept):
- For commissions calculated as rate × revenue + base draw, or any linear formula
- Use when the plan describes: "X% of revenue plus $Y base", "commission rate times sales plus guaranteed draw"
- Example:
  {
    "type": "linear_function",
    "calculationMethod": {
      "type": "linear_function",
      "slope": 0.06,
      "intercept": 200,
      "inputMetric": "period_equipment_revenue",
      "inputMetricLabel": "Equipment Revenue"
    }
  }

PIECEWISE LINEAR (accelerator curve: rate changes at attainment breakpoints):
- For commissions where the rate INCREASES as attainment exceeds quota thresholds
- The rate applies to the ENTIRE base amount (not marginal/incremental)
- Use when the plan describes: "3% below quota, 5% at quota, 8% above 120%"
- Example:
  {
    "type": "piecewise_linear",
    "calculationMethod": {
      "type": "piecewise_linear",
      "ratioMetric": "quota_attainment",
      "ratioMetricLabel": "Quota Attainment",
      "baseMetric": "consumable_revenue",
      "baseMetricLabel": "Consumable Revenue",
      "segments": [
        { "min": 0, "max": 1.0, "rate": 0.03, "label": "Below Quota" },
        { "min": 1.0, "max": 1.2, "rate": 0.05, "label": "At/Above Quota" },
        { "min": 1.2, "max": null, "rate": 0.08, "label": "Super Accelerator" }
      ]
    }
  }

SCOPE AGGREGATE (management override on team/district/region totals):
- For managers who earn a percentage of their team's aggregate metric
- Use when the plan describes: "1.5% of district total equipment revenue"
- Example:
  {
    "type": "scope_aggregate",
    "calculationMethod": {
      "type": "scope_aggregate",
      "scope": "district",
      "metric": "equipment_revenue",
      "metricLabel": "District Equipment Revenue",
      "rate": 0.015
    }
  }

SCALAR MULTIPLY (simple rate × base amount, no tiers or conditions):
- For flat commission percentages without tiers, thresholds, or conditions
- Example:
  {
    "type": "scalar_multiply",
    "calculationMethod": {
      "type": "scalar_multiply",
      "metric": "sales_amount",
      "metricLabel": "Sales Amount",
      "rate": 0.04
    }
  }

CONDITIONAL GATE (eligibility gate that depends on meeting a prerequisite):
- For bonuses that require meeting a condition before any payout
- Use when the plan describes: "must have at least 1 equipment sale to earn cross-sell bonus"
- Example:
  {
    "type": "conditional_gate",
    "calculationMethod": {
      "type": "conditional_gate",
      "conditionMetric": "equipment_deal_count",
      "conditionOperator": ">=",
      "conditionThreshold": 1,
      "payoutPerUnit": 50,
      "payoutMetric": "cross_sell_count",
      "payoutMetricLabel": "Cross-Sell Transactions"
    }
  }

TYPE SELECTION RULES (MANDATORY — resolve ambiguity between similar types):

RULE 1 — QUOTA ATTAINMENT RATE CURVES → ALWAYS piecewise_linear:
When a plan describes rates (percentages) that change based on quota attainment
(actual performance divided by a target/quota), ALWAYS use "piecewise_linear".
NEVER use "conditional_percentage" or nested "conditional_gate" for quota-attainment
rate curves. The structural signal is: there is a DENOMINATOR (quota/target) that
creates a RATIO, and the rate applies to a BASE AMOUNT (usually revenue).
Examples that MUST be piecewise_linear:
- "3% if below quota, 5% if at/above quota, 8% if above 120% of quota"
- "Commission rate increases with quota attainment"
- Any structure with a quota/target that creates attainment tiers with different rates

RULE 2 — FIXED DOLLAR PAYOUTS → tiered_lookup, RATE PERCENTAGES → piecewise_linear:
When tiers produce FIXED DOLLAR AMOUNTS ($0, $150, $300), use "tiered_lookup".
When tiers produce RATES (3%, 5%, 8%) applied to a revenue base, use "piecewise_linear".

RULE 3 — BINARY PREREQUISITE → conditional_gate, RATE SELECTION → conditional_percentage:
Use "conditional_gate" when there is ONE condition that gates ALL payout (must qualify to earn anything).
Use "conditional_percentage" when MULTIPLE conditions select DIFFERENT RATES on the same metric.
If you are building a nested chain of conditions to select a rate, ask: is this really a
piecewise_linear? (See Rule 1 — if rates change with attainment, it IS piecewise_linear.)

RULE 4 — NO INTERCEPT → scalar_multiply, HAS INTERCEPT → linear_function:
If the plan has a fixed base draw plus a commission rate, use "linear_function".
If there is only a commission rate with no base draw, use "scalar_multiply".
Do NOT use "linear_function" with intercept=0 — use "scalar_multiply" instead.

RULE 5 — flat_percentage is a LEGACY ALIAS for scalar_multiply:
Always prefer "scalar_multiply". If you would have used "flat_percentage",
use "scalar_multiply" instead.

NUMERIC PARSING RULES:
- Currency: Remove $ and commas. "$1,500" or "$1.500" -> 1500 (handle both comma and period as thousand separator)
- Percentages in ranges: "80% a menos de 90%" -> { min: 80, max: 90 }
- Open ranges: ">=110%" -> { min: 110, max: 999999 }, "<80%" -> { min: 0, max: 80 }
- Large numbers: "$60k" -> 60000, "$180K" -> 180000

IMPORTANT GUIDELINES:
1. Documents may be in ANY language. Preserve original language labels in component names and metric labels.
2. Extract worked examples if present - these are critical for validation.
3. Return confidence scores (0-100) for each component and overall.
4. If a table has different values for different employee types/classifications, create SEPARATE components for each.

=== CALCULATION INTENT (STRUCTURAL VOCABULARY) ===

FOR EACH COMPONENT, also produce a "calculationIntent" field using this domain-agnostic structural vocabulary. This is the contract between the AI (Domain Agent) and the execution engine (Foundational Agent).

7 PRIMITIVE OPERATIONS:
1. bounded_lookup_1d — 1D threshold table. Maps a single input value to an output via boundaries.
2. bounded_lookup_2d — 2D grid. Maps two input values (row, column) to a grid output.
3. scalar_multiply — Fixed rate multiplication: input × rate.
4. conditional_gate — If/then/else: evaluate condition, execute one of two operations.
5. aggregate — Return an aggregated value from a source.
6. ratio — Numerator / denominator with zero-guard.
7. constant — Fixed literal value.

INPUT SOURCES (how values are resolved):
- { "source": "metric", "sourceSpec": { "field": "metric_name" } } — from data row
- { "source": "ratio", "sourceSpec": { "numerator": "metric_name", "denominator": "metric_name" } } — computed ratio
- { "source": "constant", "value": 42 } — literal number
- { "source": "entity_attribute", "sourceSpec": { "attribute": "attr_name" } } — from entity record
- { "source": "prior_component", "sourceSpec": { "componentIndex": 0 } } — output from previous component

BOUNDARY FORMAT:
{ "min": number|null, "max": number|null, "minInclusive": true, "maxInclusive": true }
Use null for unbounded (no lower/upper limit). Both inclusive to match >= min AND <= max.

MAPPING RULES (type → calculationIntent operation):
- tiered_lookup → bounded_lookup_1d with metric input, boundaries from tiers, outputs from tier values
- matrix_lookup → bounded_lookup_2d with metric inputs, row/column boundaries, outputGrid
- flat_percentage → scalar_multiply with metric input and rate (flat_percentage is a legacy alias)
- conditional_percentage → nested conditional_gate chain (conditions in order, scalar_multiply on match)
- linear_function → linear_function with slope, intercept, and metric input
- piecewise_linear → piecewise_linear with ratioInput, baseInput, and segments array
  IMPORTANT: piecewise_linear ALWAYS maps to piecewise_linear operation, NEVER to conditional_gate chain
- scope_aggregate → scope_aggregate with scope, field, and aggregation
- scalar_multiply → scalar_multiply with metric input and rate
- conditional_gate → conditional_gate with condition, onTrue operation, onFalse operation

EXAMPLE calculationIntent for a tiered_lookup:
{
  "calculationIntent": {
    "operation": "bounded_lookup_1d",
    "input": { "source": "metric", "sourceSpec": { "field": "store_sales_attainment" } },
    "boundaries": [
      { "min": 0, "max": 99.999, "minInclusive": true, "maxInclusive": true },
      { "min": 100, "max": 104.999, "minInclusive": true, "maxInclusive": true },
      { "min": 105, "max": 109.999, "minInclusive": true, "maxInclusive": true },
      { "min": 110, "max": null, "minInclusive": true, "maxInclusive": true }
    ],
    "outputs": [0, 150, 300, 500],
    "noMatchBehavior": "zero"
  }
}

EXAMPLE calculationIntent for a matrix_lookup:
{
  "calculationIntent": {
    "operation": "bounded_lookup_2d",
    "inputs": {
      "row": { "source": "metric", "sourceSpec": { "field": "attainment" } },
      "column": { "source": "metric", "sourceSpec": { "field": "store_volume" } }
    },
    "rowBoundaries": [
      { "min": 0, "max": 79.999, "minInclusive": true, "maxInclusive": true },
      { "min": 80, "max": 89.999, "minInclusive": true, "maxInclusive": true }
    ],
    "columnBoundaries": [
      { "min": 0, "max": 59999, "minInclusive": true, "maxInclusive": true },
      { "min": 60000, "max": 99999, "minInclusive": true, "maxInclusive": true }
    ],
    "outputGrid": [[0, 0], [200, 300]],
    "noMatchBehavior": "zero"
  }
}

EXAMPLE calculationIntent for a flat_percentage:
{
  "calculationIntent": {
    "operation": "scalar_multiply",
    "input": { "source": "metric", "sourceSpec": { "field": "warranty_sales" } },
    "rate": 0.04
  }
}

EXAMPLE calculationIntent for a conditional_percentage (2 conditions, sorted by threshold descending):
{
  "calculationIntent": {
    "operation": "conditional_gate",
    "condition": {
      "left": { "source": "metric", "sourceSpec": { "field": "store_goal_attainment" } },
      "operator": ">=",
      "right": { "source": "constant", "value": 100 }
    },
    "onTrue": {
      "operation": "scalar_multiply",
      "input": { "source": "metric", "sourceSpec": { "field": "insurance_sales" } },
      "rate": 0.05
    },
    "onFalse": {
      "operation": "conditional_gate",
      "condition": {
        "left": { "source": "metric", "sourceSpec": { "field": "store_goal_attainment" } },
        "operator": ">=",
        "right": { "source": "constant", "value": 85 }
      },
      "onTrue": {
        "operation": "scalar_multiply",
        "input": { "source": "metric", "sourceSpec": { "field": "insurance_sales" } },
        "rate": 0.03
      },
      "onFalse": { "operation": "constant", "value": 0 }
    }
  }
}

EXAMPLE calculationIntent for a linear_function:
{
  "calculationIntent": {
    "operation": "linear_function",
    "input": { "source": "metric", "sourceSpec": { "field": "period_equipment_revenue" } },
    "slope": 0.06,
    "intercept": 200
  }
}

EXAMPLE calculationIntent for a piecewise_linear:
{
  "calculationIntent": {
    "operation": "piecewise_linear",
    "ratioInput": { "source": "ratio", "sourceSpec": { "numerator": "consumable_revenue", "denominator": "monthly_quota" } },
    "baseInput": { "source": "metric", "sourceSpec": { "field": "consumable_revenue" } },
    "segments": [
      { "min": 0, "max": 1.0, "rate": 0.03 },
      { "min": 1.0, "max": 1.2, "rate": 0.05 },
      { "min": 1.2, "max": null, "rate": 0.08 }
    ]
  }
}

EXAMPLE calculationIntent for a scope_aggregate:
{
  "calculationIntent": {
    "operation": "scope_aggregate",
    "input": { "source": "scope_aggregate", "sourceSpec": { "scope": "district", "field": "equipment_revenue", "aggregation": "sum" } },
    "rate": 0.015
  }
}

EXAMPLE calculationIntent for a conditional_gate (binary prerequisite):
{
  "calculationIntent": {
    "operation": "conditional_gate",
    "condition": {
      "left": { "source": "metric", "sourceSpec": { "field": "equipment_deal_count" } },
      "operator": ">=",
      "right": { "source": "constant", "value": 1 }
    },
    "onTrue": {
      "operation": "scalar_multiply",
      "input": { "source": "metric", "sourceSpec": { "field": "cross_sell_count" } },
      "rate": 50
    },
    "onFalse": { "operation": "constant", "value": 0 }
  }
}

EXAMPLE calculationIntent for a scalar_multiply:
{
  "calculationIntent": {
    "operation": "scalar_multiply",
    "input": { "source": "metric", "sourceSpec": { "field": "sales_amount" } },
    "rate": 0.04
  }
}

EXAMPLE calculationIntent for a linear_function with cap modifier:
{
  "calculationIntent": {
    "operation": "linear_function",
    "input": { "source": "metric", "sourceSpec": { "field": "revenue" } },
    "slope": 0.06,
    "intercept": 200,
    "modifiers": [
      { "modifier": "cap", "maxValue": 5000 }
    ]
  }
}

CRITICAL: Every component MUST include both "calculationMethod" (existing format) AND "calculationIntent" (structural vocabulary). The calculationIntent must be valid against the 7 primitives above.

Return your analysis as valid JSON.`,
````

**Default-branch equivalent for Boundary 1:** A prompt has no `default:` keyword. The closest analog is the prompt's behavior when the AI emits an operation name that falls outside the set the prompt declares/exemplifies. The prompt does not specify what should happen if the AI emits an unrecognized operation. The "7 PRIMITIVE OPERATIONS" list (line 357) names 7 strings; the example blocks introduce 3 additional strings (`linear_function`, `piecewise_linear`, `scope_aggregate`) that line 539's "must be valid against the 7 primitives" instruction does not cover.

### Boundary 2 — `normalizeComponentType`

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Function:** `normalizeComponentType` (line 269), private method on class `AIPlainInterpreter`.

**Discovery:**

```
$ grep -n "function normalizeComponentType\|normalizeComponentType =" web/src/lib/compensation/ai-plan-interpreter.ts
269:  private normalizeComponentType(type: unknown): ComponentCalculation['type'] {
```

**Function body (lines 269-285) — verbatim:**

```ts
  private normalizeComponentType(type: unknown): ComponentCalculation['type'] {
    // HF-156: Extended with OB-180/181 primitives (DIAG-013 Fix 1)
    const validTypes = [
      'matrix_lookup',
      'tiered_lookup',
      'percentage',
      'flat_percentage',
      'conditional_percentage',
      'linear_function',
      'piecewise_linear',
      'scope_aggregate',
      'scalar_multiply',
      'conditional_gate',
    ];
    const typeStr = String(type || 'tiered_lookup');
    return validTypes.includes(typeStr) ? (typeStr as ComponentCalculation['type']) : 'tiered_lookup';
  }
```

**This function uses a `validTypes` array, NOT a switch statement.** Membership-check semantics: line 284 — if `typeStr` is in `validTypes`, return it; otherwise return `'tiered_lookup'`. Empty input (`type === undefined || type === null || type === ''`) is also coerced to `'tiered_lookup'` via line 283 default.

**Recognized cases (line numbers refer to array entries):**
- `'matrix_lookup'` — line 272
- `'tiered_lookup'` — line 273
- `'percentage'` — line 274
- `'flat_percentage'` — line 275
- `'conditional_percentage'` — line 276
- `'linear_function'` — line 277
- `'piecewise_linear'` — line 278
- `'scope_aggregate'` — line 279
- `'scalar_multiply'` — line 280
- `'conditional_gate'` — line 281

**Default branch (line 283-284, ±5 lines context):**

```ts
      'scalar_multiply',
      'conditional_gate',
    ];
    const typeStr = String(type || 'tiered_lookup');
    return validTypes.includes(typeStr) ? (typeStr as ComponentCalculation['type']) : 'tiered_lookup';
  }
```

If the input is not in `validTypes`, the function returns the literal string `'tiered_lookup'`.

### Boundary 3 — `normalizeCalculationMethod`

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Function:** `normalizeCalculationMethod` (line 287), private method on class `AIPlainInterpreter`.

**Discovery:**

```
$ grep -n "normalizeCalculationMethod" web/src/lib/compensation/ai-plan-interpreter.ts
257:        calculationMethod: this.normalizeCalculationMethod(c.type, c.calculationMethod),
287:  private normalizeCalculationMethod(type: unknown, method: unknown): ComponentCalculation {
```

**Function body (lines 287-357) — verbatim:**

```ts
  private normalizeCalculationMethod(type: unknown, method: unknown): ComponentCalculation {
    const typeStr = this.normalizeComponentType(type);
    const m = (method || {}) as Record<string, unknown>;

    switch (typeStr) {
      case 'matrix_lookup': {
        const rowAxis = (m.rowAxis || {}) as Record<string, unknown>;
        const columnAxis = (m.columnAxis || {}) as Record<string, unknown>;
        return {
          type: 'matrix_lookup',
          rowAxis: {
            metric: String(rowAxis.metric || 'row_metric'),
            label: String(rowAxis.label || 'Row'),
            labelEs: rowAxis.labelEs ? String(rowAxis.labelEs) : undefined,
            ranges: this.normalizeRanges(rowAxis.ranges),
          },
          columnAxis: {
            metric: String(columnAxis.metric || 'column_metric'),
            label: String(columnAxis.label || 'Column'),
            labelEs: columnAxis.labelEs ? String(columnAxis.labelEs) : undefined,
            ranges: this.normalizeRanges(columnAxis.ranges),
          },
          values: this.normalizeMatrix(m.values),
        };
      }

      case 'tiered_lookup':
        return {
          type: 'tiered_lookup',
          metric: String(m.metric || 'metric'),
          metricLabel: m.metricLabel ? String(m.metricLabel) : undefined,
          tiers: this.normalizeTiers(m.tiers),
        };

      case 'percentage':
      case 'flat_percentage':
        return {
          type: typeStr,
          metric: String(m.metric || 'base_amount'),
          metricLabel: m.metricLabel ? String(m.metricLabel) : undefined,
          rate: Number(m.rate) || 0,
        };

      case 'conditional_percentage':
        return {
          type: 'conditional_percentage',
          metric: String(m.metric || 'base_amount'),
          metricLabel: m.metricLabel ? String(m.metricLabel) : undefined,
          conditionMetric: String(m.conditionMetric || 'condition_metric'),
          conditionMetricLabel: m.conditionMetricLabel ? String(m.conditionMetricLabel) : undefined,
          conditions: this.normalizeConditions(m.conditions),
        };

      // HF-159: Pass through new primitive types (DIAG-014 root cause)
      // Without these cases, the default overwrites type to 'tiered_lookup' with empty tiers.
      // This was the ACTUAL destroyer — 5 prior fixes missed it.
      case 'linear_function':
      case 'piecewise_linear':
      case 'scope_aggregate':
      case 'scalar_multiply':
      case 'conditional_gate':
        return { type: typeStr, ...m } as GenericCalculation;

      default:
        return {
          type: 'tiered_lookup',
          metric: 'metric',
          tiers: [],
        };
    }
  }
```

**Recognized cases (line numbers):**
- `'matrix_lookup'` — line 292
- `'tiered_lookup'` — line 313
- `'percentage'` — line 321 (fall-through with `'flat_percentage'`)
- `'flat_percentage'` — line 322
- `'conditional_percentage'` — line 330
- `'linear_function'` — line 343 (fall-through to 347 → return `{ type: typeStr, ...m }`)
- `'piecewise_linear'` — line 344
- `'scope_aggregate'` — line 345
- `'scalar_multiply'` — line 346
- `'conditional_gate'` — line 347

**Default branch (line 350-355, ±5 lines context):**

```ts
      case 'conditional_gate':
        return { type: typeStr, ...m } as GenericCalculation;

      default:
        return {
          type: 'tiered_lookup',
          metric: 'metric',
          tiers: [],
        };
    }
  }
```

The default branch returns a `tiered_lookup` shape with `metric: 'metric'` (literal string) and an empty `tiers` array. Note: per line 288, `typeStr` already passed through `normalizeComponentType`, so the only way `default:` is reached is if `normalizeComponentType` returned a string not in this switch's case list. Given Boundary 2 only emits strings from `validTypes` plus the fallback `'tiered_lookup'`, and `'tiered_lookup'` IS a case here, this default branch is effectively dead code under the current implementation — but exists as a safety net.

### Boundary 4 — `convertComponent`

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Function:** `convertComponent` (line 547), module-level function (not a method).

**Discovery:**

```
$ grep -n "function convertComponent\|convertComponent =" web/src/lib/compensation/ai-plan-interpreter.ts
547:function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
```

**Pre-switch logic (lines 547-570) — verbatim:**

```ts
function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
  // Null-safe base properties
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

  // Null-safe calculation method access
  // HF-158 / DIAG-014: Read calculationIntent.operation as fallback when calculationMethod is undefined.
  // The AI produces calculationIntent (with operation, rate, etc) but NOT calculationMethod.
  const calcMethod = comp?.calculationMethod;
  // HF-160: calculationIntent.operation checked FIRST (priority inversion safety net)
  // Even if AI returns tiered_lookup in calcMethod, calculationIntent has the correct type
  const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || 'tiered_lookup';
```

**Switch cases — verbatim (lines 571-680):**

```ts
  switch (calcType) {
    case 'matrix_lookup': {
      const m = calcMethod as MatrixCalculation;
      const rowAxis = m?.rowAxis || { metric: 'attainment', label: 'Attainment', ranges: [] };
      const colAxis = m?.columnAxis || { metric: 'sales', label: 'Sales', ranges: [] };
      return {
        ...base,
        componentType: 'matrix_lookup',
        matrixConfig: { /* ... */ },
      };
    }

    case 'tiered_lookup': {
      const t = calcMethod as TieredCalculation;
      const rawTiers = t?.tiers || [];
      const tiers = rawTiers.map((tier) => ({ /* ... */ }));
      return {
        ...base,
        componentType: 'tier_lookup',
        tierConfig: { /* ... */ },
      };
    }

    case 'percentage':
    case 'flat_percentage': {
      const p = calcMethod as PercentageCalculation;
      return {
        ...base,
        componentType: 'percentage',
        measurementLevel: 'individual',
        percentageConfig: { /* ... */ },
      };
    }

    case 'conditional_percentage': {
      const c = calcMethod as ConditionalPercentageCalculation;
      return {
        ...base,
        componentType: 'conditional_percentage',
        measurementLevel: 'individual',
        conditionalConfig: { /* ... */ },
      };
    }

    // HF-156 Fix 2: New primitive types — store calculationIntent in metadata.intent
    // so transformFromMetadata can find it (DIAG-013 disconnect 2+3)
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
    case 'scalar_multiply':
    case 'conditional_gate':
      return {
        ...base,
        componentType: calcType as 'linear_function' | 'piecewise_linear' | 'scope_aggregate',
        metadata: {
          ...(base.metadata || {}),
          intent: base.calculationIntent, // Copy to where transformFromMetadata reads
        },
      };

    default:
      // HF-156: If calculationIntent exists, use it as metadata.intent even for legacy types
      if (base.calculationIntent) {
        return {
          ...base,
          componentType: 'tier_lookup',
          metadata: {
            ...(base.metadata || {}),
            intent: base.calculationIntent,
          },
          tierConfig: {
            metric: 'unknown',
            metricLabel: 'Unknown',
            tiers: [],
            currency: 'MXN',
          },
        };
      }
      return {
        ...base,
        componentType: 'tier_lookup',
        tierConfig: {
          metric: 'unknown',
          metricLabel: 'Unknown',
          tiers: [],
          currency: 'MXN',
        },
      };
  }
}
```

**Recognized cases (line numbers, by switch on `calcType`):**
- `'matrix_lookup'` — line 572
- `'tiered_lookup'` — line 600
- `'percentage'` — line 626 (fall-through with flat_percentage)
- `'flat_percentage'` — line 627
- `'conditional_percentage'` — line 641
- `'linear_function'` — line 667 (fall-through to 671 → 5-tuple return)
- `'piecewise_linear'` — line 668
- `'scope_aggregate'` — line 669
- `'scalar_multiply'` — line 670
- `'conditional_gate'` — line 671

**Default branch (lines 681-708) — HF-156 fallback — verbatim:**

```ts
    default:
      // HF-156: If calculationIntent exists, use it as metadata.intent even for legacy types
      if (base.calculationIntent) {
        return {
          ...base,
          componentType: 'tier_lookup',
          metadata: {
            ...(base.metadata || {}),
            intent: base.calculationIntent,
          },
          tierConfig: {
            metric: 'unknown',
            metricLabel: 'Unknown',
            tiers: [],
            currency: 'MXN',
          },
        };
      }
      return {
        ...base,
        componentType: 'tier_lookup',
        tierConfig: {
          metric: 'unknown',
          metricLabel: 'Unknown',
          tiers: [],
          currency: 'MXN',
        },
      };
  }
```

This is the HF-156 fallback the directive flagged. The DEFAULT branch writes:
- `componentType: 'tier_lookup'` (line 686 if intent present; line 701 if not)
- `metadata.intent: base.calculationIntent` (line 689, only when calculationIntent exists)
- `tierConfig: { metric: 'unknown', metricLabel: 'Unknown', tiers: [], currency: 'MXN' }` (lines 691-696 / 702-707)

The `componentType` written is `'tier_lookup'` (note: the legacy switch in Boundary 5 uses `'tier_lookup'`, while Boundaries 2 and 3 use `'tiered_lookup'` — different strings). This is a string-name divergence within the codebase: import-side normalize functions output `'tiered_lookup'` while the engine-side legacy switch consumes `'tier_lookup'`. The `convertComponent` function bridges by re-mapping `'tiered_lookup'` (line 600 case) → `componentType: 'tier_lookup'` (line 616). The default branch (line 686) also emits `'tier_lookup'`.

### Boundary 5 — Legacy Engine Dispatch

**File:** `web/src/lib/calculation/run-calculation.ts`
**Switch site:** line 362, inside the function that evaluates a single component (the function body shown spans lines ~340-490).

**Discovery:**

```
$ grep -n "switch (component.componentType)" web/src/lib/calculation/run-calculation.ts
362:  switch (component.componentType) {
```

**Switch body (lines 362-408) — verbatim:**

```ts
  switch (component.componentType) {
    case 'tier_lookup':
      if (component.tierConfig) {
        const r = evaluateTierLookup(component.tierConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
    case 'percentage':
      if (component.percentageConfig) {
        const r = evaluatePercentage(component.percentageConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
    case 'matrix_lookup':
      if (component.matrixConfig) {
        const r = evaluateMatrixLookup(component.matrixConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
    case 'conditional_percentage': {
      // HF-120: If calculationIntent has a conditional_gate, use it as PRIMARY path.
      // The intent structure has the correct condition (operator, left, right) and
      // constant onTrue/onFalse values. The legacy evaluateConditionalPercentage
      // multiplies base × rate, which is wrong for gate semantics.
      const gateIntent = component.calculationIntent as unknown as Record<string, unknown> | undefined;
      if (gateIntent?.operation === 'conditional_gate' && isIntentOperation(gateIntent as unknown as IntentOperation)) {
        const entityData: EntityData = { entityId: '', metrics, attributes: {} };
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const gatePayout = toNumber(executeOperation(gateIntent as unknown as IntentOperation, entityData, inputLog, {}));
        payout = gatePayout;
        details = {
          source: 'calculationIntent',
          operation: 'conditional_gate',
          payout: gatePayout,
          inputs: inputLog,
        };
      } else if (component.conditionalConfig) {
        const r = evaluateConditionalPercentage(component.conditionalConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
    }
  }
```

**Recognized cases (line numbers):**
- `'tier_lookup'` — line 363
- `'percentage'` — line 370
- `'matrix_lookup'` — line 377
- `'conditional_percentage'` — line 384

**Default branch:** **NO `default:` keyword present.** The switch contains only the four cases above (lines 363-407) followed by closing brace at line 408. When `component.componentType` is none of those four strings, no case matches, no break is reached, control flows past line 408 with `payout` retaining its initial value (`payout = 0` from prior context) and `details` retaining its initial empty value.

**Post-switch fallback (lines 410-472) — verbatim, ±5 lines context shown for the post-switch flow:**

```ts
    }
  }

  // OB-117: calculationIntent fallback — when legacy evaluator produces $0
  // and the component has an AI-produced calculationIntent, attempt evaluation
  // via the intent executor. This handles cases where tierConfig is broken
  // (empty tiers, wrong metric) but calculationIntent has the correct structure.
  if (payout === 0 && component.calculationIntent) {
    try {
      let intentOp = component.calculationIntent as unknown as IntentOperation;

      // OB-120: Transform postProcessing.rateFromLookup into scalar_multiply wrapper.
      // ... [transformation logic at lines 423-433] ...

      // OB-120: Auto-detect isMarginal for bounded_lookup_1d with rate-like outputs.
      // ... [heuristic at lines 438-447] ...

      if (isIntentOperation(intentOp)) {
        const entityData: EntityData = {
          entityId: '',
          metrics,
          attributes: {},
        };
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const intentPayoutDecimal = executeOperation(intentOp, entityData, inputLog, {});
        const intentPayout = toNumber(intentPayoutDecimal);
        if (intentPayout > 0) {
          payout = intentPayout;
          details = {
            ...details,
            fallbackSource: 'calculationIntent',
            intentOperation: intentOp.operation,
            intentPayout,
            intentInputs: inputLog,
          };
        }
      }
    } catch {
      // Fallback failed silently — use original $0 payout
    }
  }
```

The post-switch behavior conditions on `payout === 0 && component.calculationIntent`. When the switch matches none of the four cases, the post-switch fallback runs (since `payout === 0`) iff `calculationIntent` is present. The `catch` block at line 469-471 silently swallows any thrown error.

### Boundary 6 — Intent Executor Dispatch

**File:** `web/src/lib/calculation/intent-executor.ts`
**Function:** `executeOperation` (line 432).

**Discovery:**

```
$ grep -n "switch (op.operation)\|function executeOperation" web/src/lib/calculation/intent-executor.ts
432:export function executeOperation(
438:  switch (op.operation) {
```

**Function body and switch (lines 432-451) — verbatim:**

```ts
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
  }
}
```

**Recognized cases (line numbers):**
- `'bounded_lookup_1d'` — line 439
- `'bounded_lookup_2d'` — line 440
- `'scalar_multiply'` — line 441
- `'conditional_gate'` — line 442
- `'aggregate'` — line 443
- `'ratio'` — line 444
- `'constant'` — line 445
- `'weighted_blend'` — line 446
- `'temporal_window'` — line 447
- `'linear_function'` — line 448
- `'piecewise_linear'` — line 449

**Default branch:** **NO `default:` keyword present.** The switch contains only the eleven cases above (lines 439-449) followed by closing brace at line 450. The function declares return type `Decimal` (line 437). With no default case and no fall-through return statement after line 450, if `op.operation` is none of the listed eleven, the switch falls through, the function reaches its closing brace at line 451 without an explicit return, and returns `undefined`. TypeScript's compile-time exhaustiveness check requires `op.operation` to be a discriminated union of exactly the eleven listed strings; any runtime value outside that union (e.g., from a JSONB field) bypasses the type check and produces this `undefined` return path.

**Notable absence:** `'scope_aggregate'` is NOT a case in this switch, despite being:
- Named in the prompt's MAPPING RULES at line 385: `scope_aggregate → scope_aggregate`
- Used as the operation string in the prompt example at line 493: `"operation": "scope_aggregate"`
- Recognized by Boundary 2 (line 279), Boundary 3 (line 345), and Boundary 4 (line 669) as a passthrough type

### Phase 0A.7 — Vocabulary Intersection Table

| Operation | B1: Prompt | B2: normalizeComponentType | B3: normalizeCalculationMethod | B4: convertComponent | B5: Legacy switch | B6: Intent executor switch |
|---|---|---|---|---|---|---|
| `matrix_lookup` | ✓ L150,152,408 | ✓ L272 | ✓ L292 | ✓ L572 | ✓ L377 | — |
| `tiered_lookup` | ✓ L181,183,392 | ✓ L273 | ✓ L313 | ✓ L600 | — | — |
| `tier_lookup` | — | — | — | (output of L616, L686, L701) | ✓ L363 | — |
| `percentage` | — | — | ✓ L321 | ✓ L626 | ✓ L370 | — |
| `flat_percentage` | ✓ L200,202,428 | ✓ L275 | ✓ L322 | ✓ L627 | — | — |
| `conditional_percentage` | ✓ L214,216,437 | ✓ L276 | ✓ L330 | ✓ L641 | ✓ L384 | — |
| `linear_function` | ✓ L233,235,469,529 | ✓ L277 | ✓ L343 | ✓ L667 | — | ✓ L448 |
| `piecewise_linear` | ✓ L249,251,479 | ✓ L278 | ✓ L344 | ✓ L668 | — | ✓ L449 |
| `scope_aggregate` | ✓ L269,271,493 | ✓ L279 | ✓ L345 | ✓ L669 | — | — |
| `scalar_multiply` | ✓ L283,285,360,429 | ✓ L280 | ✓ L346 | ✓ L670 | — | ✓ L441 |
| `conditional_gate` | ✓ L297,299,361,438 | ✓ L281 | ✓ L347 | ✓ L671 | — | ✓ L442 |
| `bounded_lookup_1d` | ✓ L358,392 | — | — | — | — | ✓ L439 |
| `bounded_lookup_2d` | ✓ L359,408 | — | — | — | — | ✓ L440 |
| `aggregate` | ✓ L362 | — | — | — | — | ✓ L443 |
| `ratio` | ✓ L363 | — | — | — | — | ✓ L444 |
| `constant` | ✓ L364,461,513 | — | — | — | — | ✓ L445 |
| `weighted_blend` | — | — | — | — | — | ✓ L446 |
| `temporal_window` | — | — | — | — | — | ✓ L447 |

**Note on `tier_lookup` vs `tiered_lookup`:** These are two distinct strings. Boundaries 1, 2, 3 use `'tiered_lookup'`. Boundary 5 uses `'tier_lookup'`. Boundary 4 reads `'tiered_lookup'` (line 600) but writes `componentType: 'tier_lookup'` (lines 616, 686, 701) — it bridges the names by re-emitting.

---

## Phase 0B — Default-Branch Behavior Characterization

### Boundary 1 (Plan-Agent Prompt) — default-equivalent behavior

**Q1 — Output shape:** A prompt has no programmatic output shape; the AI's response is JSON whose shape is constrained by the prompt's instructions. The prompt does not enumerate a shape for the case where the AI emits an operation outside the declared/exemplified set.

**Q2 — Operation/type name handling:** The prompt instructs (line 539) `The calculationIntent must be valid against the 7 primitives above`. The "7 primitives" list (lines 358-364) names: `bounded_lookup_1d`, `bounded_lookup_2d`, `scalar_multiply`, `conditional_gate`, `aggregate`, `ratio`, `constant`. Examples and mapping rules introduce additional strings (`linear_function`, `piecewise_linear`, `scope_aggregate`) that the line-539 constraint does not list. PRESERVED for the 7 declared + 3 example-introduced. No instruction governs strings outside that union.

**Q3 — Error throwing:** No error mechanism. The AI returns whatever JSON it emits. The prompt has no failure mode.

**Q4 — Logging:** No log emission from the prompt itself.

**Q5 — Downstream consumer:** The AI response is JSON parsed and passed to `validateAndNormalize` (in `web/src/lib/compensation/ai-plan-interpreter.ts`), which calls `normalizeComponents` (line 245), which invokes Boundary 2 (`normalizeComponentType`, line 253) and Boundary 3 (`normalizeCalculationMethod`, line 257). Any operation string the prompt produces enters the boundary chain at B2/B3.

### Boundary 2 (`normalizeComponentType`) — default branch behavior

**Q1 — Output shape:** Returns the literal string `'tiered_lookup'` (line 284). Single string field; no object structure.

**Q2 — Operation/type name handling:** OVERWRITTEN. Line 284: `validTypes.includes(typeStr) ? (typeStr as ...) : 'tiered_lookup'` — when input is not in `validTypes`, the returned value is `'tiered_lookup'`, regardless of what was passed in. The original input string is lost.

**Q3 — Error throwing:** No error thrown.

**Q4 — Logging:** No log emitted.

**Q5 — Downstream consumer:** The returned string is consumed inside the same module:
- Line 253: assigned to `comp.type` on the `InterpretedComponent` shape
- Line 288: re-passed to `normalizeCalculationMethod` (Boundary 3) as the first argument

```ts
// web/src/lib/compensation/ai-plan-interpreter.ts:253
type: this.normalizeComponentType(c.type),
```

Then `comp.type` flows into `convertComponent` (Boundary 4) at line 547 via the `interpretationToPlanConfig` loop (lines 466-477):

```ts
// web/src/lib/compensation/ai-plan-interpreter.ts:476
return convertComponent(compCopy, index);
```

### Boundary 3 (`normalizeCalculationMethod`) — default branch behavior

**Q1 — Output shape:** Returns an object (lines 351-355):

```ts
return {
  type: 'tiered_lookup',
  metric: 'metric',
  tiers: [],
};
```

Three fields assigned: `type` (literal `'tiered_lookup'`), `metric` (literal `'metric'`), `tiers` (empty array).

**Q2 — Operation/type name handling:** OVERWRITTEN to `'tiered_lookup'` (line 352). The original `typeStr` (which itself was already passed through B2 at line 288) is dropped. As noted in 0A, this default branch is unreachable in practice given B2's output range — but is structurally present.

**Q3 — Error throwing:** No error thrown.

**Q4 — Logging:** No log emitted.

**Q5 — Downstream consumer:** The returned object is assigned to `comp.calculationMethod` (line 257):

```ts
// web/src/lib/compensation/ai-plan-interpreter.ts:257
calculationMethod: this.normalizeCalculationMethod(c.type, c.calculationMethod),
```

Then read by `convertComponent` (Boundary 4) at line 563: `const calcMethod = comp?.calculationMethod;` — the `tiers: []` value flows into `convertComponent`'s `'tiered_lookup'` case (line 600), producing `tierConfig.tiers = []`.

### Boundary 4 (`convertComponent`) — default branch behavior (HF-156 fallback)

**Q1 — Output shape:** Two return-shape variants depending on whether `base.calculationIntent` exists:

**Variant 1 (with calculationIntent, lines 684-697):** Six fields assigned:
- `...base` — spreads id, name, description, order, enabled, measurementLevel, calculationIntent
- `componentType: 'tier_lookup'` (literal)
- `metadata: { ...(base.metadata || {}), intent: base.calculationIntent }`
- `tierConfig: { metric: 'unknown', metricLabel: 'Unknown', tiers: [], currency: 'MXN' }`

**Variant 2 (without calculationIntent, lines 699-708):** Five fields assigned:
- `...base` — spreads same set as above (calculationIntent will be undefined here)
- `componentType: 'tier_lookup'` (literal)
- `tierConfig: { metric: 'unknown', metricLabel: 'Unknown', tiers: [], currency: 'MXN' }`
- (no metadata override)

Verbatim assignment lines:

```ts
componentType: 'tier_lookup',
metadata: {
  ...(base.metadata || {}),
  intent: base.calculationIntent,
},
tierConfig: {
  metric: 'unknown',
  metricLabel: 'Unknown',
  tiers: [],
  currency: 'MXN',
},
```

**Q2 — Operation/type name handling:** OVERWRITTEN. Line 686 and line 701 both set `componentType: 'tier_lookup'`, regardless of the input `calcType`. The pre-switch `calcType` value (computed at line 566 as `(base.calculationIntent?.operation as string) || calcMethod?.type || 'tiered_lookup'`) is preserved ONLY in `metadata.intent.operation` — and only via Variant 1, which copies the full `calculationIntent` object into `metadata.intent`. Variant 2 (no intent present) loses all type information.

**Q3 — Error throwing:** No error thrown.

**Q4 — Logging:** No log emitted within the default branch itself. (The pre-switch line 569 emits a `console.log` showing `calcType` for every component, including ones routing to default.)

**Q5 — Downstream consumer:** The returned `PlanComponent` flows into `RuleSetConfig.configuration.variants[].components[]` (lines 491, 506) which is persisted into the `rule_sets.components` JSONB column. At calculation time, the persisted shape is read by:
- **Legacy switch (B5)** — receives `componentType: 'tier_lookup'`, matches `case 'tier_lookup'` at line 363, calls `evaluateTierLookup(component.tierConfig, metrics)` with `tierConfig.tiers = []`. The evaluator processes an empty tiers array and returns `payout: 0`.
- **Intent executor path** — reads `metadata.intent.operation` (Variant 1) or `calculationIntent.operation` (preserved on `base`), passes to `executeOperation` (B6). Whether B6 has a case for that operation determines the rest.

The downstream code at `run/route.ts:1572-1580` rounds `payout: 0` and pushes into `componentResults`. If the intent path subsequently produces a non-zero value, line 1699 overrides:

```ts
// web/src/app/api/calculation/run/route.ts:1697-1699
// Override componentResults payout with intent-authority value
if (componentResults[ci.componentIndex]) {
  componentResults[ci.componentIndex].payout = roundedValue;
}
```

### Boundary 5 (Legacy Engine Switch) — default-equivalent behavior

**Q1 — Output shape:** No `default:` keyword. With no case match, the switch falls through to its closing brace at line 408. `payout` and `details` retain their initial values from the function scope above the switch (the function initializes `payout: 0` before the switch). The function then proceeds to the post-switch fallback at line 414.

**Q2 — Operation/type name handling:** PRESERVED. The original `component.componentType` is never overwritten by the switch's no-match path. The unrecognized string is preserved in the `componentType` field of the returned `ComponentResult` (run-calculation.ts:477, lines 474-480 of the function):

```ts
// web/src/lib/calculation/run-calculation.ts:474-480
return {
  componentId: component.id,
  componentName: component.name,
  componentType: component.componentType,
  payout,
  metricValues: metrics,
```

**Q3 — Error throwing:** No error thrown by the switch itself. The post-switch fallback wraps `executeOperation` in a `try { ... } catch { /* silent */ }` block (lines 414-471):

```ts
// web/src/lib/calculation/run-calculation.ts:469-471
} catch {
  // Fallback failed silently — use original $0 payout
}
```

**Q4 — Logging:** No log emitted on no-match. The post-switch fallback's `catch` is intentionally empty per the comment at line 470.

**Q5 — Downstream consumer:** `componentResult.payout` (which is 0 from the no-match fall-through, possibly updated by the post-switch fallback if `calculationIntent` is present) is consumed at `web/src/app/api/calculation/run/route.ts:1578`:

```ts
// web/src/app/api/calculation/run/route.ts:1572-1580
const { rounded, trace: roundingTrace } = roundComponentOutput(
  result.payout, compIdx, component.name, precision
);
result.payout = toNumber(rounded);
entityRoundingTraces.push(roundingTrace);

componentResults.push(result);
perComponentMetrics.push(metrics);
legacyTotalDecimal = legacyTotalDecimal.plus(rounded);
```

Then HF-188 routing (run/route.ts:1697-1709) may override the payout with the intent-engine value:

```ts
// web/src/app/api/calculation/run/route.ts:1697-1709
// Override componentResults payout with intent-authority value
if (componentResults[ci.componentIndex]) {
  componentResults[ci.componentIndex].payout = roundedValue;
}
entityRoundingTraces[ci.componentIndex] = roundingTrace;

intentTotalDecimal = intentTotalDecimal.plus(rounded);
priorResults[ci.componentIndex] = roundedValue;
}

// HF-188: Intent executor is authoritative — legacy is concordance shadow
const intentTotal = toNumber(intentTotalDecimal);
const entityTotal = intentTotal;
```

So `total_payout` for the entity equals `intentTotal`, not the legacy total. The legacy `payout: 0` from a no-match fall-through is the value pushed into `componentResults[i].payout` ONLY IF the intent path does not produce its own value for that component index.

### Boundary 6 (Intent Executor Switch) — default-equivalent behavior

**Q1 — Output shape:** No `default:` keyword. With no case match, control falls through past line 449 to the function's closing brace at line 451. Function declares return type `Decimal` but with no fall-through return statement, the function returns `undefined`. TypeScript's compile-time exhaustiveness check normally prevents this, but only if `op.operation` is constrained to the discriminated union of the 11 case strings. Any value outside that union (e.g., from a JSONB-derived runtime input) reaches this fall-through and returns `undefined`.

**Q2 — Operation/type name handling:** PRESERVED in the input `op` parameter (the function does not mutate `op.operation`). DROPPED from the return value, since the function returns `undefined` rather than a `Decimal` containing the operation string.

**Q3 — Error throwing:** No error thrown by the switch itself. The function returns `undefined` silently.

**Q4 — Logging:** No log emitted.

**Q5 — Downstream consumer:** `executeOperation`'s return value flows to two distinct categories of caller:

**(a) Internal recursive callers within `intent-executor.ts`:**
- Line 154: `return executeOperation(sourceOrOp, data, inputLog, trace);` — return value cascades to `resolveValue`'s caller.
- Line 291: `return executeOperation(branch, data, inputLog, trace);` — used in `executeConditionalGate` for onTrue/onFalse branches.
- Line 589, 594, 607: assigned to `outcome` in `runComponentIntent` (the orchestrator).

In path (a), an `undefined` return propagates as `undefined` for the variable assignment. At line 611, `applyModifiers(outcome, intent.modifiers, entityData, modifierLog)` would receive `undefined`. At line 614, `toNumber(outcome)` calls `value.toNumber()` on `undefined` → TypeError.

**(b) External caller in `run-calculation.ts` (the legacy fallback path):**

```ts
// web/src/lib/calculation/run-calculation.ts:456-457
const intentPayoutDecimal = executeOperation(intentOp, entityData, inputLog, {});
const intentPayout = toNumber(intentPayoutDecimal);
```

If `executeOperation` returns `undefined`, line 457 calls `.toNumber()` on `undefined` → TypeError. The TypeError is caught by the outer `try { ... } catch { /* silent */ }` (lines 415-471), and `payout` retains its prior value (0 if from a fall-through legacy switch).

```ts
// web/src/lib/calculation/run-calculation.ts:469-471
} catch {
  // Fallback failed silently — use original $0 payout
}
```

The `runComponentIntent` orchestrator's call sites at intent-executor.ts:589/594/607 are NOT wrapped in try/catch within that function. Whether the TypeError is caught depends on the orchestrator's caller — to be inventoried in Phase 0F.

### Phase 0B — Constraint observed

The boundaries' default-branch behaviors range from "OVERWRITE input to a fixed fallback string" (B2, B3, B4 with intent, B4 without intent) to "PRESERVE input but emit zero-payout" (B5) to "DROP input by returning undefined" (B6). No boundary's default branch throws an error or emits a log identifying the unrecognized input. The post-switch try/catch at run-calculation.ts:469-471 is the only error-handling layer between the dispatch and the persisted result.

---

## Phase 0C — Per-Primitive Shape Contract Inventory

The directive's working set names 17 primitives. Each sub-section below has four parts: importer write shape (from Boundary 4 `convertComponent`), intent-executor read shape (from `intent-executor.ts`), legacy-engine read shape (if applicable), and field-name alignment table.

**Note on importer routing:** Most legacy primitives have explicit `case` arms in `convertComponent` that produce *typed* config shapes (`tierConfig`, `matrixConfig`, `percentageConfig`, `conditionalConfig`). The five "new primitives" (`linear_function`, `piecewise_linear`, `scope_aggregate`, `scalar_multiply`, `conditional_gate`) share a single fall-through 5-tuple branch (lines 667-679) that writes `componentType: calcType` and copies `base.calculationIntent` into `metadata.intent`. The intent-executor reads from `op.*` where `op` is the `calculationIntent` object (which is preserved on `base` at line 557 and copied to `metadata.intent`).

### Primitive 1 — `bounded_lookup_1d` (new primitive)

**Part 1 — Importer Write Shape:** No explicit case in `convertComponent`. The string `bounded_lookup_1d` does not appear as a `case` in Boundary 4. When the AI emits `calculationIntent.operation === 'bounded_lookup_1d'` (the typical mapping for `tiered_lookup` per prompt line 378), `calcType` (computed at line 566) is `'bounded_lookup_1d'`. None of the 5-tuple new-primitive cases (linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate) match `'bounded_lookup_1d'`. Routes to **default branch** (line 681-708), HF-156 fallback. The default branch writes:

```ts
componentType: 'tier_lookup',
metadata: { ...(base.metadata || {}), intent: base.calculationIntent },
tierConfig: { metric: 'unknown', metricLabel: 'Unknown', tiers: [], currency: 'MXN' },
```

So the `bounded_lookup_1d` calculationIntent is stored in `metadata.intent` and on `base.calculationIntent`. The `componentType` at top level is the literal `'tier_lookup'`.

**Part 2 — Intent-Executor Read Shape:** `executeBoundedLookup1D` (lines 197-225). Reads:
- `op.input` (line 203) — IntentSource
- `op.boundaries` (line 205) — Boundary[]
- `op.outputs[idx]` (line 212) — number array indexed by boundary match
- `op.isMarginal` (line 214) — boolean flag

```ts
const inputValue = resolveValue(op.input, data, inputLog, trace);
const idx = findBoundaryIndex(op.boundaries, toNumber(inputValue));
// ...
const rawOutput = toDecimal(op.outputs[idx] ?? 0);
const output = op.isMarginal ? rawOutput.mul(inputValue) : rawOutput;
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable — no legacy case for `bounded_lookup_1d`. (The `tier_lookup` componentType written by Boundary 4's default branch routes to `evaluateTierLookup`, which reads `tierConfig.tiers` — empty array per the default branch — producing $0; the post-switch fallback then re-routes to the intent executor.)

**Part 4 — Field-Name Alignment:**

```
Importer writes (default branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
metadata.intent.input                    |  op.input            ✓ (via metadata.intent)
metadata.intent.boundaries               |  op.boundaries       ✓ (via metadata.intent)
metadata.intent.outputs                  |  op.outputs          ✓ (via metadata.intent)
metadata.intent.isMarginal               |  op.isMarginal       ✓ (via metadata.intent)
componentType: 'tier_lookup' (literal)   |  (not read by executor)  ABSENT — primitive routes through default branch
tierConfig.tiers: []                     |  (not read by executor)  ABSENT — empty per default branch
```

The intent shape is preserved verbatim through `metadata.intent`. The top-level `componentType` and `tierConfig` are misleading scaffolding written by the default branch.

### Primitive 2 — `bounded_lookup_2d` (new primitive)

**Part 1 — Importer Write Shape:** No explicit case in `convertComponent`. Routes to default branch when `calcType === 'bounded_lookup_2d'`. Same default-branch shape as Primitive 1: `componentType: 'tier_lookup'`, `metadata.intent` preserves the intent.

Note: there IS a `case 'matrix_lookup'` (line 572) that writes a fully-populated `matrixConfig`. But that case fires only when `calcType === 'matrix_lookup'` (the `calculationMethod.type` string), not when `calcType === 'bounded_lookup_2d'` (the calculationIntent.operation string). Per line 566, `calcType` prefers `calculationIntent.operation` over `calculationMethod.type` — so when both are present, `calcType === 'bounded_lookup_2d'` wins, the matrix_lookup case does not fire, and the default branch runs.

**Part 2 — Intent-Executor Read Shape:** `executeBoundedLookup2D` (lines 227-255). Reads:
- `op.inputs.row` (line 233) — IntentSource
- `op.inputs.column` (line 234) — IntentSource
- `op.rowBoundaries` (line 236) — Boundary[]
- `op.columnBoundaries` (line 237) — Boundary[]
- `op.outputGrid[rowIdx][colIdx]` (line 248) — number[][]

**Part 3 — Legacy-Engine Read Shape:** Not applicable — no legacy case for `bounded_lookup_2d`. The legacy `case 'matrix_lookup'` reads `component.matrixConfig.{rowMetric, rowBands, columnMetric, columnBands, values}` — a different shape. (Matrix-named legacy.)

**Part 4 — Field-Name Alignment (intent path through `metadata.intent`):**

```
Importer writes (default branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
metadata.intent.inputs.row              |  op.inputs.row        ✓
metadata.intent.inputs.column           |  op.inputs.column     ✓
metadata.intent.rowBoundaries           |  op.rowBoundaries     ✓
metadata.intent.columnBoundaries        |  op.columnBoundaries  ✓
metadata.intent.outputGrid              |  op.outputGrid        ✓
componentType: 'tier_lookup' (literal)  |  (not read)           ABSENT — primitive routes through default branch
```

### Primitive 3 — `scalar_multiply` (new primitive, on intent + legacy importer paths)

**Part 1 — Importer Write Shape:** Boundary 4 has `case 'scalar_multiply'` at line 670 (in the 5-tuple fall-through, lines 667-679). Writes:

```ts
return {
  ...base,
  componentType: calcType as 'linear_function' | 'piecewise_linear' | 'scope_aggregate',
  metadata: {
    ...(base.metadata || {}),
    intent: base.calculationIntent,
  },
};
```

So `componentType: 'scalar_multiply'` (the literal string from `calcType`). `metadata.intent` holds the calculationIntent. No `tierConfig`/`matrixConfig`/etc.

**Part 2 — Intent-Executor Read Shape:** `executeScalarMultiply` (lines 257-268). Reads:
- `op.input` (line 263) — IntentSource
- `op.rate` (line 264-266) — number OR IntentSource (resolved via `resolveValue` if not a plain number)

```ts
const inputValue = resolveValue(op.input, data, inputLog, trace);
const rateValue = typeof op.rate === 'number'
  ? toDecimal(op.rate)
  : resolveValue(op.rate, data, inputLog, trace);
return inputValue.mul(rateValue);
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable — no legacy case for `scalar_multiply`. (Legacy switch only has `tier_lookup`, `percentage`, `matrix_lookup`, `conditional_percentage`. The componentType `'scalar_multiply'` falls through.)

**Part 4 — Field-Name Alignment:**

```
Importer writes (5-tuple branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
componentType: 'scalar_multiply'        |  (not read by executor)
metadata.intent.input                   |  op.input        ✓
metadata.intent.rate                    |  op.rate         ✓
```

### Primitive 4 — `conditional_gate` (new primitive)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 671 (5-tuple fall-through). Same shape as Primitive 3: `componentType: 'conditional_gate'`, `metadata.intent` holds the intent, no typed config.

**Part 2 — Intent-Executor Read Shape:** `executeConditionalGate` (lines 270-292). Reads:
- `op.condition.left` (line 276) — IntentSource
- `op.condition.right` (line 277) — IntentSource
- `op.condition.operator` (line 280) — string (`>=`, `>`, `<=`, `<`, `=`, `==`, `!=`)
- `op.onTrue` (line 290) — IntentOperation
- `op.onFalse` (line 290) — IntentOperation

```ts
const leftVal = resolveSource(op.condition.left, data, inputLog);
const rightVal = resolveSource(op.condition.right, data, inputLog);
// ... operator switch ...
const branch = conditionMet ? op.onTrue : op.onFalse;
return executeOperation(branch, data, inputLog, trace);
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable directly. However, legacy `case 'conditional_percentage'` (line 384) DOES check `gateIntent?.operation === 'conditional_gate'` (line 390) and dispatches to `executeOperation` with the gate intent. So when a `conditional_percentage` componentType has a `calculationIntent` whose `operation === 'conditional_gate'`, the gate path takes over (HF-120). Fields read in that path are the same `op.condition.{left,right,operator}`, `op.onTrue`, `op.onFalse`.

**Part 4 — Field-Name Alignment:**

```
Importer writes (5-tuple branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
componentType: 'conditional_gate'       |  (not read by executor)
metadata.intent.condition.left          |  op.condition.left      ✓
metadata.intent.condition.right         |  op.condition.right     ✓
metadata.intent.condition.operator      |  op.condition.operator  ✓
metadata.intent.onTrue                  |  op.onTrue              ✓
metadata.intent.onFalse                 |  op.onFalse             ✓
```

### Primitive 5 — `aggregate` (intent-only)

**Part 1 — Importer Write Shape:** No explicit case in `convertComponent`. Routes to default branch (HF-156 fallback). Writes `componentType: 'tier_lookup'`, `metadata.intent` preserves intent.

**Part 2 — Intent-Executor Read Shape:** `executeAggregateOp` (lines 294-300). Reads:
- `op.source` (line 299) — IntentSource

```ts
return resolveSource(op.source, data, inputLog);
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable — no legacy case.

**Part 4 — Field-Name Alignment:**

```
Importer writes (default branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
componentType: 'tier_lookup' (literal)  |  (not read)             ABSENT — primitive routes through default branch
metadata.intent.source                  |  op.source              ✓
```

### Primitive 6 — `ratio` (intent-only)

**Part 1 — Importer Write Shape:** No explicit case in `convertComponent`. Routes to default branch.

**Part 2 — Intent-Executor Read Shape:** `executeRatioOp` (lines 302-313). Reads:
- `op.numerator` (line 307) — IntentSource
- `op.denominator` (line 308) — IntentSource

```ts
const num = resolveSource(op.numerator, data, inputLog);
const den = resolveSource(op.denominator, data, inputLog);
if (den.isZero()) { return ZERO; }
return num.div(den);
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable.

**Part 4 — Field-Name Alignment:**

```
Importer writes (default branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
componentType: 'tier_lookup' (literal)  |  (not read)             ABSENT — primitive routes through default branch
metadata.intent.numerator               |  op.numerator           ✓
metadata.intent.denominator             |  op.denominator         ✓
```

### Primitive 7 — `constant` (intent-only)

**Part 1 — Importer Write Shape:** No explicit case in `convertComponent`. Routes to default branch.

**Part 2 — Intent-Executor Read Shape:** `executeConstantOp` (lines 315-317). Reads:
- `op.value` (line 316) — number

```ts
function executeConstantOp(op: ConstantOp): Decimal {
  return toDecimal(op.value);
}
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable.

**Part 4 — Field-Name Alignment:**

```
Importer writes (default branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
componentType: 'tier_lookup' (literal)  |  (not read)             ABSENT — primitive routes through default branch
metadata.intent.value                   |  op.value               ✓
```

### Primitive 8 — `weighted_blend` (intent-only)

**Part 1 — Importer Write Shape:** No explicit case in `convertComponent`. The string `weighted_blend` does NOT appear in the prompt (Boundary 1) at all, nor in normalizeComponentType's validTypes (Boundary 2), nor in any of B3/B4's switch cases. Routes to default branch only if the AI somehow emits it (per prompt, the AI should not emit it).

**Part 2 — Intent-Executor Read Shape:** `executeWeightedBlend` (lines 323-351). Reads:
- `op.inputs[].source` (line 341) — IntentSource per element
- `op.inputs[].weight` (line 329, 342) — number per element

```ts
const totalWeight = op.inputs.reduce((s, i) => s + i.weight, 0);
// ...
for (let i = 0; i < op.inputs.length; i++) {
  const input = op.inputs[i];
  const value = resolveValue(input.source, data, inputLog, trace);
  const weighted = value.mul(toDecimal(input.weight));
  result = result.plus(weighted);
}
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable.

**Part 4 — Field-Name Alignment:**

```
Importer writes                         |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
(prompt does not produce this)          |  op.inputs[].source      ABSENT — prompt does not emit weighted_blend
                                        |  op.inputs[].weight      ABSENT
```

`weighted_blend` is callable by the executor but not produced by the importer chain that originates with the AI prompt.

### Primitive 9 — `temporal_window` (intent-only)

**Part 1 — Importer Write Shape:** No explicit case in `convertComponent`. The string `temporal_window` does NOT appear in the prompt, nor in B2/B3/B4. Same status as Primitive 8 — only the executor recognizes it. Plan agent does not emit it.

**Part 2 — Intent-Executor Read Shape:** `executeTemporalWindow` (lines 357-425). Reads:
- `op.input` (line 363) — IntentSource
- `op.windowSize` (line 367) — number
- `op.includeCurrentPeriod` (line 370) — boolean
- `op.aggregation` (line 385) — string (`sum`, `average`, `min`, `max`, `trend`)

Also reads `data.periodHistory` (entity-level state, line 366) — pre-loaded from prior batches.

**Part 3 — Legacy-Engine Read Shape:** Not applicable.

**Part 4 — Field-Name Alignment:**

```
Importer writes                         |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
(prompt does not produce this)          |  op.input                ABSENT — prompt does not emit temporal_window
                                        |  op.windowSize           ABSENT
                                        |  op.includeCurrentPeriod ABSENT
                                        |  op.aggregation          ABSENT
```

### Primitive 10 — `linear_function` (new primitive on importer + intent paths)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 667 (5-tuple fall-through). Writes `componentType: 'linear_function'`, `metadata.intent` holds the intent. No typed config.

**Part 2 — Intent-Executor Read Shape:** `executeLinearFunction` (lines 457-466). Reads:
- `op.input` (line 463) — IntentSource
- `op.slope` (line 464) — number
- `op.intercept` (line 464) — number

```ts
const inputValue = resolveValue(op.input, data, inputLog, trace);
const result = inputValue.mul(op.slope).plus(op.intercept);
return result;
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable — no legacy case for `linear_function`. The legacy switch falls through (componentType `'linear_function'` matches no case), `payout` stays 0; the post-switch fallback (`run-calculation.ts:414`) runs `executeOperation(component.calculationIntent)`.

**Part 4 — Field-Name Alignment:**

```
Importer writes (5-tuple branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
componentType: 'linear_function'        |  (not read by executor)
metadata.intent.input                   |  op.input                ✓
metadata.intent.slope                   |  op.slope                ✓
metadata.intent.intercept               |  op.intercept            ✓
metadata.intent.modifiers (optional)    |  (handled by applyModifiers in runComponentIntent path, not in executeLinearFunction itself)
```

### Primitive 11 — `piecewise_linear` (new primitive)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 668 (5-tuple fall-through). Writes `componentType: 'piecewise_linear'`, `metadata.intent` holds the intent.

**Part 2 — Intent-Executor Read Shape:** `executePiecewiseLinear` (lines 472-503). Reads:
- `op.ratioInput` (line 478) — IntentSource
- `op.baseInput` (line 479) — IntentSource
- `op.targetValue` (line 484) — number (optional)
- `op.segments[]` — `seg.min`, `seg.max`, `seg.rate` per segment (line 494-498)

```ts
let ratio = toNumber(resolveValue(op.ratioInput, data, inputLog, trace));
const baseValue = resolveValue(op.baseInput, data, inputLog, trace);
// OB-186: target-value fallback ...
if (ratio === 0 && op.targetValue && op.targetValue > 0 && toNumber(baseValue) > 0) { ... }
for (const seg of op.segments) {
  const inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max);
  if (inRange) { return baseValue.mul(seg.rate); }
}
return ZERO;
```

**Part 3 — Legacy-Engine Read Shape:** Not applicable.

**Part 4 — Field-Name Alignment:**

```
Importer writes (5-tuple branch)        |  Executor reads (op.*)
──────────────────────────────────────  |  ──────────────────────────
componentType: 'piecewise_linear'       |  (not read by executor)
metadata.intent.ratioInput              |  op.ratioInput          ✓
metadata.intent.baseInput               |  op.baseInput           ✓
metadata.intent.segments[].min          |  op.segments[].min      ✓
metadata.intent.segments[].max          |  op.segments[].max      ✓
metadata.intent.segments[].rate         |  op.segments[].rate     ✓
metadata.intent.targetValue (optional)  |  op.targetValue         ✓
```

### Primitive 12 — `tier_lookup` / `tiered_lookup` (legacy)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 600 (`case 'tiered_lookup'`). Writes:

```ts
return {
  ...base,
  componentType: 'tier_lookup',
  tierConfig: {
    metric: t?.metric || 'attainment',
    metricLabel: t?.metricLabel || t?.metric || 'Attainment',
    tiers,
    currency: 'MXN',
  },
};
```

Note the string transformation: input case label is `'tiered_lookup'`, output `componentType` is `'tier_lookup'`. The `tiers` array is populated from `calcMethod.tiers` (lines 605-610) with `{min, max, label, value}` per tier (where `value` is read from `tier.payout`).

**Part 2 — Intent-Executor Read Shape:** When the AI also emits `calculationIntent.operation === 'bounded_lookup_1d'` (the prompt's mapping for tiered_lookup), the executor reads `op.input`, `op.boundaries`, `op.outputs`, `op.isMarginal` — see Primitive 1. The `tierConfig.tiers` (legacy shape) is NOT read by the intent executor.

**Part 3 — Legacy-Engine Read Shape:** `evaluateTierLookup` (run-calculation.ts:231-264). Reads:
- `config.metric` (line 232) — string
- `metrics[config.metric]` (line 232) — looked up in metrics map
- `config.tiers[].value` (line 238, 247, 256) — number per tier
- `config.tiers[].min` / `config.tiers[].max` / `config.tiers[].label` (line 245, 246, 253)

```ts
const metricValue = metrics[config.metric] ?? metrics['attainment'] ?? 0;
const nonZeroValues = config.tiers.map(t => t.value).filter(v => v !== 0);
const allRates = nonZeroValues.length > 0 && nonZeroValues.every(v => v > 0 && v < 1.0);
const tierIdx = resolveBandIndex(config.tiers, metricValue);
if (tierIdx >= 0) {
  const tier = config.tiers[tierIdx];
  // ...
  const basePayout = allRates ? tier.value * metricValue : tier.value;
  // ...
}
```

**Part 4 — Field-Name Alignment:**

```
Importer writes (case 'tiered_lookup') |  Executor reads (intent path)              |  Legacy reads (config.*)
─────────────────────────────────────  |  ──────────────────────────────────────────  |  ──────────────────────────
componentType: 'tier_lookup'            |  (not read by intent executor)              |  switch case 'tier_lookup' ✓
tierConfig.metric                       |  (intent uses op.input, not config.metric)  |  config.metric            ✓
tierConfig.metricLabel                  |  —                                           |  (not read directly)
tierConfig.tiers[].value (← payout)     |  intent uses op.outputs[]                    |  config.tiers[].value     ✓
tierConfig.tiers[].min                  |  intent uses op.boundaries[].min             |  config.tiers[].min       ✓
tierConfig.tiers[].max                  |  intent uses op.boundaries[].max             |  config.tiers[].max       ✓
tierConfig.tiers[].label                |  —                                           |  config.tiers[].label     ✓
tierConfig.currency: 'MXN' (literal)    |  —                                           |  (not read)
```

DIVERGE: The importer writes `tier.value` (legacy shape, populated from `tier.payout`); the intent executor reads `op.outputs[idx]` (intent shape — a flat number array). The two are populated from the same AI source (`tier.payout`) but stored in different fields. Fields match within each path; the divergence is between the two paths.

### Primitive 13 — `matrix_lookup` (legacy)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 572. Writes:

```ts
return {
  ...base,
  componentType: 'matrix_lookup',
  matrixConfig: {
    rowMetric: rowAxis.metric || 'attainment',
    rowMetricLabel: rowAxis.label || 'Attainment',
    rowBands: (rowAxis.ranges || []).map((r) => ({
      min: r?.min ?? 0,
      max: r?.max ?? 100,
      label: r?.label || '',
    })),
    columnMetric: colAxis.metric || 'sales',
    columnMetricLabel: colAxis.label || 'Sales',
    columnBands: (colAxis.ranges || []).map((r) => ({ /* same shape */ })),
    values: m?.values || [[0]],
    currency: 'MXN',
  },
};
```

**Part 2 — Intent-Executor Read Shape:** When AI emits `calculationIntent.operation === 'bounded_lookup_2d'` (prompt mapping for matrix_lookup, line 379), the executor reads `op.inputs.row`, `op.inputs.column`, `op.rowBoundaries`, `op.columnBoundaries`, `op.outputGrid` — see Primitive 2. The legacy `matrixConfig.{rowBands, columnBands, values}` shape is NOT read by the intent executor.

**Part 3 — Legacy-Engine Read Shape:** `evaluateMatrixLookup` (run-calculation.ts:288-312). Reads:
- `config.rowMetric` (line 289) → `metrics[config.rowMetric]`
- `config.columnMetric` (line 290) → `metrics[config.columnMetric]`
- `config.rowBands[]` (line 295) — for `resolveBandIndex`
- `config.columnBands[]` (line 296)
- `config.values[rowIdx][colIdx]` (line 298)

**Part 4 — Field-Name Alignment:**

```
Importer writes (case 'matrix_lookup')  |  Executor reads (intent path)         |  Legacy reads (config.*)
─────────────────────────────────────   |  ──────────────────────────────────  |  ──────────────────────────
componentType: 'matrix_lookup'          |  (not read)                           |  switch case 'matrix_lookup' ✓
matrixConfig.rowMetric                  |  intent uses op.inputs.row            |  config.rowMetric          ✓
matrixConfig.rowBands                   |  intent uses op.rowBoundaries         |  config.rowBands           ✓
matrixConfig.columnMetric               |  intent uses op.inputs.column         |  config.columnMetric       ✓
matrixConfig.columnBands                |  intent uses op.columnBoundaries      |  config.columnBands        ✓
matrixConfig.values                     |  intent uses op.outputGrid            |  config.values             ✓
matrixConfig.currency: 'MXN' (literal)  |  —                                    |  (not read)
```

DIVERGE between paths: `matrixConfig.values` (legacy nested array) vs `op.outputGrid` (intent nested array) — same shape, different field name. `matrixConfig.rowBands[].min/max` vs `op.rowBoundaries[].min/max/minInclusive/maxInclusive` — legacy uses 3 fields per band, intent uses 4 fields with explicit inclusivity.

### Primitive 14 — `percentage` (legacy)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 626 (`case 'percentage'` / `case 'flat_percentage'` fall-through). Writes:

```ts
return {
  ...base,
  componentType: 'percentage',
  measurementLevel: 'individual',
  percentageConfig: {
    rate: p?.rate ?? 0,
    appliedTo: p?.metric || 'sales',
    appliedToLabel: p?.metricLabel || p?.metric || 'Sales',
  },
};
```

`measurementLevel` is overridden from `'store'` (the default in `base`) to `'individual'`.

**Part 2 — Intent-Executor Read Shape:** Per prompt (line 380), `flat_percentage → scalar_multiply`. So when the AI emits `calculationIntent.operation === 'scalar_multiply'`, the executor reads `op.input` and `op.rate` — see Primitive 3.

**Part 3 — Legacy-Engine Read Shape:** `evaluatePercentage` (run-calculation.ts:266-286). Reads:
- `config.appliedTo` → `metrics[config.appliedTo]` (line 267)
- `config.rate` (line 268, 282)
- `config.minThreshold` (line 270) — optional gate
- `config.maxPayout` (line 273) — optional cap

**Part 4 — Field-Name Alignment:**

```
Importer writes (case 'percentage')     |  Executor reads (intent path)    |  Legacy reads (config.*)
─────────────────────────────────────   |  ───────────────────────────────  |  ──────────────────────────
componentType: 'percentage'             |  (not read)                      |  switch case 'percentage'   ✓
percentageConfig.rate                   |  intent uses op.rate             |  config.rate                ✓
percentageConfig.appliedTo              |  intent uses op.input.sourceSpec.field  |  config.appliedTo    ✓
percentageConfig.appliedToLabel         |  —                                |  (not read)
(no minThreshold/maxPayout written)     |  —                                |  config.minThreshold       ABSENT — importer doesn't write
                                         |                                   |  config.maxPayout          ABSENT — importer doesn't write
```

DIVERGE: legacy `evaluatePercentage` reads `config.minThreshold` and `config.maxPayout`, but the importer's `case 'percentage'` block does NOT write either field. They will be `undefined` at evaluation time. Per legacy code (lines 270, 273), the `if` guards check truthiness — so `undefined` is treated as "no threshold" / "no cap". This is intentional (the AI prompt's flat_percentage example doesn't include those modifiers either).

### Primitive 15 — `flat_percentage` (legacy alias for `percentage`)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 627 (fall-through with `'percentage'`). Same shape as Primitive 14 — `componentType: 'percentage'`. So `flat_percentage` is import-time aliased to `percentage`.

**Part 2 — Intent-Executor Read Shape:** Same as Primitive 14 — intent path uses `scalar_multiply`.

**Part 3 — Legacy-Engine Read Shape:** Same as Primitive 14 — `evaluatePercentage` via the `case 'percentage'` branch. There is NO `case 'flat_percentage'` in the legacy switch (Boundary 5).

**Part 4 — Field-Name Alignment:** Identical to Primitive 14. Note: the prompt's RULE 5 (line 337) says `flat_percentage is a LEGACY ALIAS for scalar_multiply: Always prefer "scalar_multiply"`. Importer treats it as alias for legacy `percentage`. Executor never sees `flat_percentage` — it sees `scalar_multiply` (via calculationIntent).

### Primitive 16 — `conditional_percentage` (legacy)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 641. Writes:

```ts
return {
  ...base,
  componentType: 'conditional_percentage',
  measurementLevel: 'individual',
  conditionalConfig: {
    conditions: (c?.conditions || []).map((cond) => ({
      metric: c?.conditionMetric || 'attainment',
      metricLabel: c?.conditionMetricLabel || c?.conditionMetric || 'Attainment',
      min: cond?.operator === '<' || cond?.operator === '<=' ? 0 : (cond?.threshold ?? 0),
      max:
        cond?.operator === '<' || cond?.operator === '<='
          ? (cond?.threshold ?? 100)
          : (cond?.maxThreshold ?? Infinity),
      rate: cond?.rate ?? 0,
      label: cond?.label || '',
    })),
    appliedTo: c?.metric || 'sales',
    appliedToLabel: c?.metricLabel || c?.metric || 'Sales',
  },
};
```

The importer transforms the AI's conditions (with `operator`/`threshold`/`maxThreshold`) into bands with `min`/`max`. The operator/threshold information is destroyed in the transform.

**Part 2 — Intent-Executor Read Shape:** Per prompt (line 381), `conditional_percentage → nested conditional_gate chain`. The executor's `executeConditionalGate` reads `op.condition.{left,right,operator}`, `op.onTrue`, `op.onFalse` — see Primitive 4. The intent shape preserves the operator/threshold structure that the legacy import-side discards.

Additionally, the legacy `case 'conditional_percentage'` (run-calculation.ts:384-407) checks `gateIntent?.operation === 'conditional_gate'` (line 390); if true, it dispatches to `executeOperation` with the gate intent — bypassing `evaluateConditionalPercentage`.

**Part 3 — Legacy-Engine Read Shape:** `evaluateConditionalPercentage` (run-calculation.ts:314-344). Reads:
- `config.appliedTo` → `metrics[config.appliedTo]` (line 315)
- `config.conditions[].metric` → `metrics[condition.metric]` (line 318)
- `config.conditions[].min`, `condition.max` (line 319, 320, 322)
- `config.conditions[].rate` (line 326, 335)

**Part 4 — Field-Name Alignment:**

```
Importer writes                         |  Intent path (conditional_gate)            |  Legacy reads (config.*)
─────────────────────────────────────   |  ──────────────────────────────────────────  |  ──────────────────────────
componentType: 'conditional_percentage' |  (not read; HF-120 routing in legacy switch detects gate intent and delegates) |  switch case 'conditional_percentage' ✓
conditionalConfig.appliedTo             |  intent uses op.condition.left.sourceSpec  |  config.appliedTo            ✓
conditionalConfig.conditions[].metric   |  intent uses op.condition.left.sourceSpec.field  |  condition.metric        ✓
conditionalConfig.conditions[].min/max  |  intent uses op.condition.right.value (threshold) + operator  |  condition.min/max ✓
conditionalConfig.conditions[].rate     |  intent uses op.onTrue (scalar_multiply.rate) |  condition.rate            ✓
```

DIVERGE: importer collapses `(operator, threshold, maxThreshold)` into `(min, max)` bands; intent-path preserves operator/threshold via `condition.operator` + `condition.right.value`. Same source data, different stored shape.

### Primitive 17 — `scope_aggregate` (named in 7 + importer + intent prompt mapping; ABSENT from intent-executor switch)

**Part 1 — Importer Write Shape:** Boundary 4 case at line 669 (5-tuple fall-through). Writes:

```ts
return {
  ...base,
  componentType: 'scope_aggregate',
  metadata: {
    ...(base.metadata || {}),
    intent: base.calculationIntent,
  },
};
```

**Part 2 — Intent-Executor Read Shape:** **NO HANDLER.** The `executeOperation` switch (intent-executor.ts:438-450) has no `case 'scope_aggregate'`. Per Phase 0A Boundary 6, the recognized cases are `bounded_lookup_1d`, `bounded_lookup_2d`, `scalar_multiply`, `conditional_gate`, `aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window`, `linear_function`, `piecewise_linear`. When `op.operation === 'scope_aggregate'`, the switch falls through and `executeOperation` returns `undefined` (per Phase 0B Boundary 6 analysis).

However, NOTE: there IS a separate `case 'scope_aggregate'` inside `resolveSource` at line 132 (lines 132-138), which handles `IntentSource` of type `scope_aggregate` (a *value source*, not a *top-level operation*):

```ts
case 'scope_aggregate': {
  const { field, scope, aggregation } = src.sourceSpec;
  const key = `${scope}:${field}:${aggregation}`;
  const val = data.scopeAggregates?.[key] ?? 0;
  inputLog[`scope_aggregate:${key}`] = { source: 'scope_aggregate', rawValue: val, resolvedValue: val };
  return toDecimal(val);
}
```

This is dispatched by `resolveSource` when an `IntentSource.source === 'scope_aggregate'` — a different switch. The prompt's `scope_aggregate` calculationIntent example (line 490-497) wraps the scope_aggregate inside a `scalar_multiply` whose `input.source === 'scope_aggregate'`:

```json
{
  "operation": "scope_aggregate",
  "input": { "source": "scope_aggregate", "sourceSpec": { "scope": "district", "field": "equipment_revenue", "aggregation": "sum" } },
  "rate": 0.015
}
```

The TOP-LEVEL operation in this example is `'scope_aggregate'`. The executor switch has NO case for that string, so the operation falls through. The nested `input.source === 'scope_aggregate'` would be reachable IF the top-level operation were e.g. `'scalar_multiply'` (which has cases at line 441) and the input source resolution reached `resolveSource`. Per the prompt example, the top-level operation IS `'scope_aggregate'`, so resolution never reaches the nested source.

**Part 3 — Legacy-Engine Read Shape:** Not applicable — no legacy case for `scope_aggregate`.

**Part 4 — Field-Name Alignment:**

```
Importer writes (5-tuple branch)         |  Executor reads (op.*)
──────────────────────────────────────   |  ──────────────────────────
componentType: 'scope_aggregate'         |  (not read)
metadata.intent.operation === 'scope_aggregate'  |  switch falls through — no case      ABSENT — primitive routes to switch fall-through (B6 default)
metadata.intent.input.source === 'scope_aggregate'  |  resolveSource case at line 132  ✓ (only reachable if top-level op recognized)
metadata.intent.rate                     |  (would be read by scalar_multiply if that were the top-level op)
```

### Phase 0C — Summary observations (no classification)

Cases routed through `convertComponent`'s default branch (Primitives 1, 2, 5, 6, 7) write `componentType: 'tier_lookup'` regardless of the underlying intent operation. Cases routed through the 5-tuple branch (Primitives 3, 4, 10, 11, 17) write `componentType: <calcType>` matching the intent operation string. Cases with explicit case arms (Primitives 12-16) write the legacy-shaped configs (`tierConfig`, `matrixConfig`, etc.) and lose direct visibility of `calculationIntent` from the legacy evaluator path (intent is preserved on `base.calculationIntent` but the legacy evaluators never read it).

`scope_aggregate` is the only string named as both a prompt example operation (line 493) and an importer 5-tuple case (line 669) without a corresponding intent-executor case. `weighted_blend` and `temporal_window` are the inverse: present as executor cases without prompt or importer recognition.

---

## Phase 0D — Signal Surface Inventory

### Step 0D.1 — Schema Verification

Schema verification was performed via `web/scripts/aud004-phase0d-inventory.ts` (a tsx script using `@supabase/supabase-js` with the service role key — the project's standard pattern; the `postgres` library named in the directive is not installed). The script attempts to read each named table; PostgREST returns "Could not find the table" if the table is not exposed in the schema cache. Output verbatim:

```
TABLE classification_signals: EXISTS (total_rows=60)
  Columns from sample row:
    id: string
    tenant_id: string
    entity_id: null
    signal_type: string
    signal_value: object
    confidence: number
    source: string
    context: object
    created_at: string
    source_file_name: string
    sheet_name: string
    structural_fingerprint: object
    classification: string
    decision_source: string
    classification_trace: object
    header_comprehension: null
    vocabulary_bindings: null
    agent_scores: object
    human_correction_from: null
    scope: string
    rule_set_id: null
    metric_name: null
    component_index: null

TABLE foundational_classification_signals: NOT EXISTS or NOT EXPOSED — error="Could not find the table 'public.foundational_classification_signals' in the schema cache"

TABLE domain_classification_signals: NOT EXISTS or NOT EXPOSED — error="Could not find the table 'public.domain_classification_signals' in the schema cache"

TABLE rule_sets: EXISTS (total_rows=4)
  Columns from sample row:
    id: string
    tenant_id: string
    name: string
    description: string
    status: string
    version: number
    effective_from: null
    effective_to: null
    population_config: object
    input_bindings: object
    components: object
    cadence_config: object
    outcome_config: object
    metadata: object
    created_by: string
    approved_by: null
    created_at: string
    updated_at: string

TABLE synaptic_density: EXISTS (total_rows=6)
  Columns from sample row:
    id: string
    tenant_id: string
    signature: string
    confidence: number
    execution_mode: string
    total_executions: number
    last_anomaly_rate: number
    last_correction_count: number
    learned_behaviors: object
    created_at: string
    updated_at: string
```

**Schema observations (recorded as evidence, not classified):**

1. `classification_signals` exposes 23 columns in the live sample. SCHEMA_REFERENCE_LIVE.md (generated 2026-03-18) lists 20 columns. Three additional columns appear in the live row: `rule_set_id`, `metric_name`, `component_index`. These columns post-date the 2026-03-18 schema snapshot.

2. `foundational_classification_signals` and `domain_classification_signals` do NOT exist as tables, neither in SCHEMA_REFERENCE_LIVE.md nor in the live PostgREST schema cache. The `classification_signals` table includes a `scope` column (default `'tenant'` per SCHEMA_REFERENCE_LIVE.md line 155) — flywheel-scope partitioning is implemented as a column rather than as separate tables.

3. There is no `level` column on `classification_signals` — the directive's Step 0D.5 query template referenced `level`, but the column does not exist on the substrate. The query was adapted to omit `level` (results in 0D.5 below).

4. `rule_sets`, `synaptic_density` schemas match SCHEMA_REFERENCE_LIVE.md.

### Step 0D.2 — Signal_Type Write Inventory (Codebase Grep)

```
$ grep -rn "signal_type" web/src/ --include="*.ts" \
  | grep -v "node_modules\|.next" \
  | grep -v "SELECT\|select \|interface "
```

Output (41 lines, full):

```
web/src/app/api/signals/route.ts:4: * GET /api/signals?tenant_id=...&signal_type=...&limit=...
web/src/app/api/signals/route.ts:13: *   id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at
web/src/app/api/signals/route.ts:23:    const signalType = searchParams.get('signal_type');
web/src/app/api/signals/route.ts:38:      .select('id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at')
web/src/app/api/signals/route.ts:44:      query = query.eq('signal_type', signalType);
web/src/app/api/signals/route.ts:65:      typeBreakdown[signal.signal_type] = (typeBreakdown[signal.signal_type] || 0) + 1;
web/src/app/api/signals/route.ts:103:        signal_type: string;
web/src/app/api/signals/route.ts:119:      signal_type: s.signal_type,
web/src/app/api/platform/observatory/route.ts:390:    .select('id, tenant_id, signal_type, confidence')
web/src/app/api/platform/observatory/route.ts:410:    if (!byType[s.signal_type]) byType[s.signal_type] = { count: 0, totalConf: 0 };
web/src/app/api/platform/observatory/route.ts:411:    byType[s.signal_type].count++;
web/src/app/api/platform/observatory/route.ts:412:    byType[s.signal_type].totalConf += conf;
web/src/app/api/platform/observatory/route.ts:429:    safeSignals.some(s => s.tenant_id === tid && s.signal_type.startsWith('sci:'))
web/src/lib/intelligence/ai-metrics-service.ts:8: * - computeAccuracyMetrics: per signal_type acceptance/correction/rejection rates
web/src/lib/intelligence/ai-metrics-service.ts:72:  signal_type: string;
web/src/lib/intelligence/ai-metrics-service.ts:97:    .select('id, tenant_id, signal_type, confidence, source, created_at')
web/src/lib/intelligence/ai-metrics-service.ts:153:    if (!byType[s.signal_type]) {
web/src/lib/intelligence/ai-metrics-service.ts:154:      byType[s.signal_type] = { total: 0, accepted: 0, corrected: 0, rejected: 0, confSum: 0, confCount: 0 };
web/src/lib/intelligence/ai-metrics-service.ts:156:    const t = byType[s.signal_type];
web/src/lib/intelligence/convergence-service.ts:255:          signal_type: 'convergence_calculation_validation',
web/src/lib/signals/stream-signals.ts:49:      signal_type: 'stream_interaction',
web/src/lib/signals/briefing-signals.ts:48:      signal_type: 'briefing_interaction',
web/src/lib/sci/signal-capture-service.ts:15: * Returns signal_type on success, null on failure. NEVER throws.
web/src/lib/sci/classification-signal-service.ts:92:        signal_type: 'sci:classification_outcome_v2',
web/src/lib/agents/agent-memory.ts:188:      .select('signal_type, signal_value, confidence, created_at')
web/src/lib/agents/agent-memory.ts:212:    const signalType = row.signal_type as string;
web/src/lib/supabase/database.types.ts:764:          signal_type: string;
web/src/lib/supabase/database.types.ts:775:          signal_type: string;
web/src/lib/supabase/data-service.ts:407:    signal_type: signal.signalType,
web/src/lib/supabase/data-service.ts:433:  if (options?.signalType) query = query.eq('signal_type', options.signalType);
web/src/lib/ai/signal-persistence.ts:10: *   id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at
web/src/lib/ai/signal-persistence.ts:52:        signal_type: signal.signalType,
web/src/lib/ai/signal-persistence.ts:60:      console.error('[SignalPersistence] Failed to persist signal:', error.message, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
web/src/lib/ai/signal-persistence.ts:65:    console.error('[SignalPersistence] Exception:', err, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
web/src/lib/ai/signal-persistence.ts:88:      signal_type: s.signalType,
web/src/lib/ai/signal-persistence.ts:137:      query = query.eq('signal_type', signalType);
web/src/lib/ai/signal-persistence.ts:149:      signalType: row.signal_type,
web/src/lib/data/platform-queries.ts:391:    .select('id, tenant_id, signal_type, confidence')
web/src/lib/data/platform-queries.ts:417:    if (!byType[s.signal_type]) byType[s.signal_type] = { count: 0, totalConf: 0 };
web/src/lib/data/platform-queries.ts:418:    byType[s.signal_type].count++;
web/src/lib/data/platform-queries.ts:419:    byType[s.signal_type].totalConf += conf;
```

**Distinct `signal_type` string literals written by code (where the literal is on the same line):**

- `'sci:classification_outcome_v2'` — `web/src/lib/sci/classification-signal-service.ts:92`
- `'convergence_calculation_validation'` — `web/src/lib/intelligence/convergence-service.ts:255`
- `'stream_interaction'` — `web/src/lib/signals/stream-signals.ts:49`
- `'briefing_interaction'` — `web/src/lib/signals/briefing-signals.ts:48`

**Other writes via dynamic `signal.signalType` (call-site dependent):**
- `data-service.ts:407` — writes `signal_type: signal.signalType` (whatever the caller passes)
- `signal-persistence.ts:52, 88` — writes `signal_type: signal.signalType` / `s.signalType`

CC does NOT enumerate which strings are passed at runtime. The DB universe (Step 0D.4) shows the actually-persisted set.

### Step 0D.3 — Signal_Type Read Inventory (Codebase Grep)

```
$ grep -rn "classification_signals\|signal_type" web/src/ --include="*.ts" \
  | grep -i "select\|from\|query\|fetch\|read\|get\|.eq(" \
  | grep -v "node_modules\|.next"
```

Output (44 lines, full):

```
web/src/app/api/ingest/classification/route.ts:38:      .from('classification_signals')
web/src/app/api/signals/route.ts:23:    const signalType = searchParams.get('signal_type');
web/src/app/api/signals/route.ts:37:      .from('classification_signals')
web/src/app/api/signals/route.ts:38:      .select('id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at')
web/src/app/api/signals/route.ts:44:      query = query.eq('signal_type', signalType);
web/src/app/api/signals/route.ts:127:      .from('classification_signals')
web/src/app/api/platform/observatory/route.ts:223:    supabase.from('classification_signals').select('confidence').limit(1000),
web/src/app/api/platform/observatory/route.ts:389:    .from('classification_signals')
web/src/app/api/platform/observatory/route.ts:390:    .select('id, tenant_id, signal_type, confidence')
web/src/app/api/platform/observatory/route.ts:710:    supabase.from('classification_signals')
web/src/app/api/import/sci/trace/route.ts:27:      .from('classification_signals')
web/src/lib/intelligence/ai-metrics-service.ts:96:    .from('classification_signals')
web/src/lib/intelligence/ai-metrics-service.ts:97:    .select('id, tenant_id, signal_type, confidence, source, created_at')
web/src/lib/intelligence/convergence-service.ts:253:        await supabase.from('classification_signals').insert({
web/src/lib/signals/stream-signals.ts:64:    await supabase.from('classification_signals').insert(rows);
web/src/lib/signals/briefing-signals.ts:60:    await supabase.from('classification_signals').insert(rows);
web/src/lib/sci/contextual-reliability.ts:67:      .from('classification_signals')
web/src/lib/sci/classification-signal-service.ts:89:      .from('classification_signals')
web/src/lib/sci/classification-signal-service.ts:146:      .from('classification_signals')
web/src/lib/sci/classification-signal-service.ts:349:      .from('classification_signals')
web/src/lib/sci/classification-signal-service.ts:539:      .from('classification_signals')
web/src/lib/agents/agent-memory.ts:187:      .from('classification_signals')
web/src/lib/agents/agent-memory.ts:188:      .select('signal_type, signal_value, confidence, created_at')
web/src/lib/supabase/data-service.ts:414:    .from('classification_signals')
web/src/lib/supabase/data-service.ts:429:    .from('classification_signals')
web/src/lib/supabase/data-service.ts:433:  if (options?.signalType) query = query.eq('signal_type', options.signalType);
web/src/lib/ai/signal-persistence.ts:48:      .from('classification_signals')
web/src/lib/ai/signal-persistence.ts:96:      .from('classification_signals')
web/src/lib/ai/signal-persistence.ts:130:      .from('classification_signals')
web/src/lib/ai/signal-persistence.ts:137:      query = query.eq('signal_type', signalType);
web/src/lib/data/persona-queries.ts:679:      .from('classification_signals')
web/src/lib/data/platform-queries.ts:390:    .from('classification_signals')
web/src/lib/data/platform-queries.ts:391:    .select('id, tenant_id, signal_type, confidence')
```

**Read sites with explicit `signal_type` filters:**
- `web/src/app/api/signals/route.ts:44` — `query = query.eq('signal_type', signalType)` (signalType from query string param, line 23)
- `web/src/lib/supabase/data-service.ts:433` — `query = query.eq('signal_type', options.signalType)` (caller-supplied)
- `web/src/lib/ai/signal-persistence.ts:137` — `query = query.eq('signal_type', signalType)` (caller-supplied)

**Read sites without a `signal_type` filter (read all signal types for the queried tenant):**
- `web/src/app/api/platform/observatory/route.ts:223, 389-390` — observatory dashboard
- `web/src/lib/intelligence/ai-metrics-service.ts:96-97` — metrics aggregation
- `web/src/lib/agents/agent-memory.ts:187-188` — agent memory loader
- `web/src/lib/sci/classification-signal-service.ts:89, 146, 349, 539` — classification signal service (these reads filter on `entity_id` / `structural_fingerprint`, not `signal_type`)
- `web/src/lib/sci/contextual-reliability.ts:67` — contextual reliability
- `web/src/lib/data/persona-queries.ts:679` — persona queries
- `web/src/lib/data/platform-queries.ts:390-391` — platform queries

CC does NOT classify these as correct or incorrect.

### Step 0D.4 — Production Signal_Type Universe (DB)

The directive's SQL was executed via supabase-js client-side aggregation (no `exec_sql` RPC). Output verbatim:

```
signal_type | rows | distinct_tenants
-----------|------|-----------------
sci:classification_outcome_v2 | 41 | 2
training:synaptic_density | 6 | 2
sci:cost_event | 4 | 2
training:plan_interpretation | 4 | 2
stream_interaction | 2 | 2
training:dual_path_concordance | 2 | 2
convergence_calculation_validation | 1 | 1

Total rows: 60, distinct signal_type: 7
```

**Observation:** Of the 7 distinct `signal_type` strings present in the database, 4 are NOT directly emitted as string literals by codebase grep (Step 0D.2): `training:synaptic_density`, `sci:cost_event`, `training:plan_interpretation`, `training:dual_path_concordance`. These are written via dynamic `signal.signalType` paths (e.g., training-signal-service, sci/cost-event service). 1 IS emitted as literal: `sci:classification_outcome_v2`, `convergence_calculation_validation`, `stream_interaction`. (`briefing_interaction` literal is emitted in code but not present in DB.)

### Step 0D.5 — Plan-Comprehension Signal Check

The directive's SQL referenced a `level` column (which doesn't exist — see 0D.1 evidence). Adapted query: select `signal_type` and `source` filtered by ILIKE on signal_type fragments and source equality. Output:

```
Found 4 rows across 1 (signal_type, source) pairs:
  signal_type='training:plan_interpretation', source='ai_prediction' -> 4 rows
```

**Observation:** No row has `signal_type` containing the substring `comprehension`. No row has `signal_type` starting with `agent_activity:`. No row has `signal_type` exactly `plan_interpretation` (the prefix-renamed form per HF-193-A). The 4 rows match `training:plan_interpretation` (legacy training-signal naming).

### Step 0D.6 — Seeds Path Inventory

```
$ grep -rn "plan_agent_seeds" web/src/ --include="*.ts" | grep -v "node_modules\|.next"
(no output — zero matches)
```

**Codebase observation:** The string `plan_agent_seeds` appears NOWHERE in the TypeScript source of `web/src/`. V-001's documented code locations are absent from this substrate.

DB query:

```
Active rule_sets returned: 4
Rule sets with input_bindings.plan_agent_seeds present: 0 of 4
Shape distribution (— = absent):
  —: 4

Detailed list (id | name | status | seeds_state | seeds_shape | created_at):
  f7b82b93-b2f6-44c6-8a20-317eec182ce7 | Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026 | active | absent | absent | 2026-04-27T00:39:32.659944+00:00
  26cb1efd-b949-47c8-a7a8-d3b56eb3c3b7 | Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026 | active | absent | absent | 2026-04-27T00:38:33.193184+00:00
  8cea7486-7304-419e-84fa-dc00b9ef4b04 | Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026 | active | absent | absent | 2026-04-26T23:40:09.948975+00:00
  1591f450-c226-4173-adfe-d63b8c19eec3 | Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026 | active | absent | absent | 2026-04-26T23:39:09.73493+00:00
```

**DB observation:** All 4 active rule_sets are for the BCL tenant. None have `input_bindings.plan_agent_seeds` set. V-001 is structurally absent from both code and active data on this substrate.

### Step 0D.7 — Convergence One-Way-Door State

```
$ grep -n "classification_signals\|signal_type\|lookupPriorSignals\|readSignals" \
    web/src/lib/intelligence/convergence-service.ts
253:        await supabase.from('classification_signals').insert({
255:          signal_type: 'convergence_calculation_validation',
```

**Convergence service write/read enumeration on `classification_signals`:**

- Line 253: **WRITE** — `await supabase.from('classification_signals').insert({...})`. Writes a `convergence_calculation_validation` row with confidence 0.85, source `'convergence_validation'`, decision_source `'structural_anomaly'`.
- Line 255: write content (not a separate operation; line is the `signal_type` field within the line-253 insert).

**No reads on `classification_signals` from convergence-service.ts.** The function names `lookupPriorSignals` and `readSignals` named in the directive's grep do not appear in this file.

`grep "select\|from" /Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/convergence-service.ts` returned other selects, all on different tables:
- Line 133: `.select('id, name, components, input_bindings')` — on `rule_sets`
- Line 628, 636: `.select('data_type, row_data, metadata, import_batch_id')` — on `committed_data`
- Line 1858: `.select('row_data')` — on `committed_data`

CC enumerates: convergence-service.ts has 1 WRITE site to `classification_signals` (line 253-274 block) and 0 READ sites against `classification_signals`.



