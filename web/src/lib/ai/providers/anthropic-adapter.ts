/**
 * Anthropic Provider Adapter
 *
 * Implements AIProviderAdapter for Anthropic Claude API.
 * This is the ONLY file that should import Anthropic-specific code.
 */

import {
  AIRequest,
  AIResponse,
  AIProviderAdapter,
  AIServiceConfig,
  AITaskType,
} from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// === FOUNDATIONAL PRIMITIVE VOCABULARY (OB-196 E1 / Decision 155) ===
//
// The plan-agent prompt is the Domain Agent translation surface — Decision 154
// permits domain language here for translation purposes. However, the LIST of
// foundational primitives the AI may emit must derive from the canonical
// registry, not be hardcoded in the prompt template (closes F-005:
// prompt vocabulary drift). The prompt template carries the placeholder
// `<<FOUNDATIONAL_PRIMITIVES>>`; at lookup time, the placeholder is replaced
// with the registry-derived enumeration.

import { getOperationPrimitives, getRegistry } from '@/lib/calculation/primitive-registry';

function buildPrimitiveVocabularyForPrompt(): string {
  const ops = getOperationPrimitives();
  const lines = ops.map((p, i) => `${i + 1}. ${p.id} — ${p.description}`);
  return `${ops.length} PRIMITIVE OPERATIONS:\n${lines.join('\n')}`;
}

// HF-195: registry-derived componentType enumeration for the plan-interpretation
// prompt's outer wrapper. The "type" field on each component, and the
// document_analysis prompt's calculationType field, derive from this enumeration —
// not from a private hardcoded list. Closes Korean Test (E910) at the prompt-layer
// surface; instantiates Rule 27 (T5 standing rule). Per IRA-HF-195 Inv-2 rank 1
// (option_b_plus_c) Phase 1 b-component.
function buildComponentTypeListForPrompt(): string {
  const ids = getRegistry().map((p) => p.id);
  return `Allowed component "type" values (${ids.length} foundational primitives):\n${ids.map((id) => `  - ${id}`).join('\n')}`;
}

// HF-195: registry-derived structural-examples block. Iterates registered
// primitives and emits the promptStructuralExample field where populated.
// PREPARE-path hook for IRA-HF-195 Inv-3 rank 1 (sub_option_b_beta) — entries
// without an example are silently skipped; if zero entries carry examples the
// section emits an explicit empty-section placeholder so Phase 2 follow-on OB
// (option_c flywheel population) has the slot to populate.
function buildStructuralExamplesForPrompt(): string {
  const withExamples = getRegistry().filter((p) => typeof p.promptStructuralExample === 'string' && p.promptStructuralExample.length > 0);
  if (withExamples.length === 0) {
    return [
      'Structural examples per primitive (use these to classify by value-distribution and shape signature):',
      '  [No primitives currently carry promptStructuralExample content.',
      '   This section is populated as registry entries gain content via',
      '   Phase 2 follow-on work (option_c flywheel population from vocabulary_bindings).]',
    ].join('\n');
  }
  return [
    'Structural examples per primitive (use these to classify by value-distribution and shape signature):',
    ...withExamples.map((p) => `  - ${p.id}:\n    ${p.promptStructuralExample!.replace(/\n/g, '\n    ')}`),
  ].join('\n');
}

// === SYSTEM PROMPTS BY TASK ===

const SYSTEM_PROMPTS: Record<AITaskType, string> = {
  file_classification: `You are an expert at classifying business data files. Analyze the file name, content preview, and metadata to determine:
1. The type of data (POS cheques, compensation plans, employee rosters, transaction data, etc.)
2. Which platform module should process this file
3. The recommended parsing strategy

Return a JSON object with:
{
  "fileType": "pos_cheque" | "compensation_plan" | "employee_roster" | "transaction_data" | "unknown",
  "suggestedModule": "financial" | "compensation" | "workforce" | "unknown",
  "parseStrategy": "excel_tabular" | "text_structured" | "csv_delimited" | "pdf_extract",
  "confidence": 0-100,
  "reasoning": "Brief explanation of classification logic"
}`,

  sheet_classification: `You are an expert at analyzing spreadsheet data. Given a sheet name, headers, and sample rows, determine:
1. What type of data this sheet contains
2. What entity it maps to in the platform
3. Suggested column-to-field mappings

Return a JSON object with:
{
  "dataType": "string describing data type",
  "mappedEntity": "platform entity name",
  "suggestedMappings": [
    { "sourceColumn": "column name", "targetField": "platform field", "confidence": 0-100 }
  ],
  "confidence": 0-100,
  "reasoning": "Brief explanation"
}`,

  field_mapping: `You are an expert at mapping data columns to platform fields. Given a column name and sample values, suggest the best platform field match.

Return a JSON object with:
{
  "suggestedField": "best match field name",
  "alternativeFields": ["other possible matches"],
  "transformationNeeded": true/false,
  "transformationHint": "hint for any needed transformation",
  "confidence": 0-100,
  "reasoning": "Brief explanation"
}`,

  field_mapping_second_pass: `You are an expert at classifying data columns for a compensation management platform.

CONTEXT:
You are resolving columns that could not be classified on first pass. You now have PLAN CONTEXT that tells you what metrics each component needs.

VALID SEMANTIC TYPES (expanded — OB-110):
Identity:
- entity_id: Unique identifier for a person, account, or entity (numeric or alphanumeric code)
- entity_name: Display name of a person or entity — contains human-readable names like "Carlos Garcia"
- store_id: Identifier code for a store, branch, office, or location
- store_name: Human-readable name of a store, branch, office, or location
- transaction_id: Unique identifier for a transaction, order, event, or record
- reference_id: A cross-reference to another record, system, or external identifier

Temporal:
- date: A date value — transaction date, snapshot date, hire date, effective date
- period: A time period label or identifier — month name, quarter label, period code

Financial:
- amount: A monetary value — revenue, deposit balance, payout, sale total, balance (also used for goals/targets)
- currency_code: ISO currency code like USD, MXN, EUR — short text strings, NOT monetary amounts
- rate: A rate, percentage, or ratio — commission rate, tip percentage, discount rate

Metrics:
- count_growth: Count of items ADDED, opened, gained, acquired — new accounts, new customers, units sold
- count_reduction: Count of items REMOVED, closed, lost, churned — closed accounts, cancellations, returns
- quantity: A generic count when direction is unclear or neutral — total items, headcount, visits
- achievement_pct: Attainment or achievement as a percentage of goal or target
- score: A performance score, quality rating, index value, or ranking number

Classification:
- role: Job title, role, position, or function — values like "Manager", "Sales Rep", "mesero"
- product_code: SKU, product ID, product code, or catalog number
- product_name: Product or service description or name
- category: A grouping label — department, division, segment, tier, type, class
- status: A status indicator — active, inactive, approved, pending, open, closed
- boolean_flag: A boolean or binary value — 0/1, true/false, yes/no, si/no

Other:
- text: Free text, notes, comments, or descriptions
- unknown: Cannot determine field type

LEGACY ALIASES (accept these in input, return canonical types above):
- entityId → entity_id, storeId → store_id, name → entity_name
- attainment → achievement_pct, goal → amount, storeRange → category

CRITICAL CLASSIFICATION RULES:
1. ALWAYS examine SAMPLE VALUES first. They are more reliable than column names.
2. If sample values are short text strings like "MXN", "USD", "EUR" → currency_code, NOT amount.
3. If sample values are human names like "Carlos Garcia" → entity_name, NOT role.
4. If column contains "opened", "new", "added", "gained" → count_growth.
5. If column contains "closed", "lost", "churned", "cancelled" → count_reduction.
6. NEVER map two semantically opposite columns to the same type.
7. If sample values are all 0 and 1 (or true/false) → boolean_flag.
8. Confidence MUST reflect certainty. If column name suggests one type but values suggest another, FOLLOW the sample values and LOWER confidence.
9. Use plan component context — if a component needs "goal" and you see a column that appears to describe targets/goals in any language, that is likely amount (goal).
10. Use your multilingual understanding — column names may be in any language. Classify based on meaning, not language-specific keyword matching.

Return JSON array:
{
  "classifications": [
    {
      "sourceColumn": "column name",
      "semanticType": "one of the valid types above or null",
      "confidence": 60-100,
      "reasoning": "Brief explanation"
    }
  ]
}`,

  plan_interpretation: `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content, INCLUDING ALL PAYOUT VALUES.

CRITICAL REQUIREMENTS:
1. Extract EVERY distinct compensation component - do NOT merge similar components
2. Each table, each metric, each KPI with its own payout structure is a SEPARATE component
3. Detect ALL employee types/classifications if the document has different payout levels for different roles
4. CRITICAL: Extract ALL numeric payout values from every table - do NOT just identify structure

FOR EACH COMPONENT TYPE, EXTRACT COMPLETE DATA.
The "type" field MUST be a registered foundational primitive identifier — see the
"Allowed component type values" enumeration below (registry-derived at prompt-construction
time; this is the single canonical surface).

<<COMPONENT_TYPE_LIST>>

<<STRUCTURAL_EXAMPLES>>

WORKED EXAMPLES (use these to populate calculationMethod payloads correctly):

bounded_lookup_2d (2D grid: two range-banded inputs → grid output):
- Extract row axis: metric name, label, and ALL range boundaries
- Extract column axis: metric name, label, and ALL range boundaries
- Extract the COMPLETE values matrix — every cell value as a number
- Example structure:
  {
    "type": "bounded_lookup_2d",
    "calculationMethod": {
      "type": "bounded_lookup_2d",
      "rowAxis": {
        "metric": "row_axis_metric",
        "label": "row axis label preserved verbatim from document",
        "ranges": [
          { "min": 0, "max": 80, "label": "verbatim band label 1" },
          { "min": 80, "max": 90, "label": "verbatim band label 2" },
          { "min": 90, "max": 100, "label": "verbatim band label 3" },
          { "min": 100, "max": 150, "label": "verbatim band label 4" },
          { "min": 150, "max": 999999, "label": "verbatim band label 5" }
        ]
      },
      "columnAxis": {
        "metric": "column_axis_metric",
        "label": "column axis label preserved verbatim from document",
        "ranges": [
          { "min": 0, "max": 60000, "label": "verbatim band label 1" },
          { "min": 60000, "max": 100000, "label": "verbatim band label 2" }
        ]
      },
      "values": [[0, 0], [200, 300], [300, 500]]
    }
  }

bounded_lookup_1d (1D table: one range-banded input → numeric output):
- Extract metric name and label
- Extract EVERY tier with min, max, and payout value
- Example:
  {
    "type": "bounded_lookup_1d",
    "calculationMethod": {
      "type": "bounded_lookup_1d",
      "metric": "input_metric_name",
      "metricLabel": "metric label preserved verbatim from document",
      "tiers": [
        { "min": 0, "max": 100, "payout": 0, "label": "verbatim band label 1" },
        { "min": 100, "max": 105, "payout": 150, "label": "verbatim band label 2" },
        { "min": 105, "max": 110, "payout": 300, "label": "verbatim band label 3" },
        { "min": 110, "max": 999999, "payout": 500, "label": "verbatim band label 4" }
      ]
    }
  }

scalar_multiply (single rate × single base; no thresholds, no conditions):
- Extract the rate as a decimal (4% = 0.04)
- Extract what it applies to
- Example:
  {
    "type": "scalar_multiply",
    "calculationMethod": {
      "type": "scalar_multiply",
      "metric": "input_metric_name",
      "metricLabel": "metric label preserved verbatim from document",
      "rate": 0.04
    }
  }

conditional_gate (binary predicate selects between two operations):
- Extract the predicate condition (left value, operator, right value)
- Extract the onTrue branch and onFalse branch
- Use this when ONE binary criterion gates the entire payout, OR when
  MULTIPLE thresholds are nested as if/then/else chains
- Example:
  {
    "type": "conditional_gate",
    "calculationMethod": {
      "type": "conditional_gate",
      "metric": "rate_target_metric",
      "metricLabel": "metric label preserved verbatim from document",
      "conditionMetric": "predicate_metric",
      "conditionMetricLabel": "predicate label preserved verbatim from document",
      "conditions": [
        { "threshold": 100, "operator": "<", "rate": 0.03, "label": "verbatim band label 1" },
        { "threshold": 100, "operator": ">=", "rate": 0.05, "label": "verbatim band label 2" }
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

TYPE SELECTION RULES (MANDATORY — resolve ambiguity between structurally similar primitives):

RULE 1 — RATIO INPUT SELECTING A RATE APPLIED TO A BASE → "piecewise_linear":
When the plan describes rates (percentages) that change based on a ratio input
(actual performance divided by a target/quota), and the selected rate is multiplied
by a BASE amount (usually revenue), use "piecewise_linear". Structural signal: a
DENOMINATOR (quota/target) creates a RATIO; the rate applies to a separate BASE
amount.
Examples that MUST be "piecewise_linear":
- "3% if below quota, 5% if at/above quota, 8% if above 120% of quota"
- Any structure with a ratio input that creates attainment bands with different rates
  applied to a base amount

RULE 2 — FIXED OUTPUT PER BAND → "bounded_lookup_1d", RATE PER BAND APPLIED TO BASE → "piecewise_linear":
When bands produce FIXED OUTPUT VALUES ($0, $150, $300), use "bounded_lookup_1d".
When bands produce RATES (3%, 5%, 8%) applied to a separate base amount, use "piecewise_linear".

RULE 3 — BINARY GATE ON ENTIRE PAYOUT → "conditional_gate":
Use "conditional_gate" when one or more nested binary criteria gate the calculation.
A nested chain of "conditional_gate" expressions can encode multi-tier conditional
selection. Before nesting, check Rule 1: if rates change with a ratio input applied
to a base, it is "piecewise_linear", not nested "conditional_gate".

RULE 4 — NO INTERCEPT → "scalar_multiply", HAS INTERCEPT → "linear_function":
If the plan has a fixed base value plus a rate × input, use "linear_function".
If there is only a rate × input with no base value, use "scalar_multiply".
Do NOT use "linear_function" with intercept=0 — use "scalar_multiply" instead.

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

<<FOUNDATIONAL_PRIMITIVES>>

INPUT SOURCES (how values are resolved):
- { "source": "metric", "sourceSpec": { "field": "metric_name" } } — from data row
- { "source": "ratio", "sourceSpec": { "numerator": "metric_name", "denominator": "metric_name" } } — computed ratio
- { "source": "constant", "value": 42 } — literal number
- { "source": "entity_attribute", "sourceSpec": { "attribute": "attr_name" } } — from entity record
- { "source": "prior_component", "sourceSpec": { "componentIndex": 0 } } — output from previous component

BOUNDARY FORMAT (Decision 127 — half-open intervals):
{ "min": number|null, "max": number|null, "minInclusive": true, "maxInclusive": false }

Convention: half-open intervals [min, max). Inclusive lower bound; exclusive upper bound.
Each boundary's max equals the next boundary's min EXACTLY (contiguous partition; no gaps).
The FINAL boundary in any sequence uses one of:
  - max: null (open-ended; no upper limit)
  - maxInclusive: true (capped; includes the ceiling)

DO NOT use .999 / .X99 / decimal-truncation patterns. Express "less than X" as max: X with maxInclusive: false.
DO NOT leave gaps between consecutive boundaries.
DO NOT overlap consecutive boundaries.

EXAMPLE calculationIntent for bounded_lookup_1d (half-open partition, open-ended ceiling):
{
  "calculationIntent": {
    "operation": "bounded_lookup_1d",
    "input": { "source": "metric", "sourceSpec": { "field": "store_sales_attainment" } },
    "boundaries": [
      { "min": 0,   "max": 100,  "minInclusive": true, "maxInclusive": false },
      { "min": 100, "max": 105,  "minInclusive": true, "maxInclusive": false },
      { "min": 105, "max": 110,  "minInclusive": true, "maxInclusive": false },
      { "min": 110, "max": null, "minInclusive": true, "maxInclusive": true  }
    ],
    "outputs": [0, 150, 300, 500],
    "noMatchBehavior": "zero"
  }
}

EXAMPLE calculationIntent for bounded_lookup_2d (half-open partitions on both axes):
{
  "calculationIntent": {
    "operation": "bounded_lookup_2d",
    "inputs": {
      "row": { "source": "metric", "sourceSpec": { "field": "attainment" } },
      "column": { "source": "metric", "sourceSpec": { "field": "store_volume" } }
    },
    "rowBoundaries": [
      { "min": 0,   "max": 80,   "minInclusive": true, "maxInclusive": false },
      { "min": 80,  "max": 90,   "minInclusive": true, "maxInclusive": false },
      { "min": 90,  "max": 100,  "minInclusive": true, "maxInclusive": false },
      { "min": 100, "max": 120,  "minInclusive": true, "maxInclusive": false },
      { "min": 120, "max": null, "minInclusive": true, "maxInclusive": true  }
    ],
    "columnBoundaries": [
      { "min": 0,     "max": 60000,  "minInclusive": true, "maxInclusive": false },
      { "min": 60000, "max": 100000, "minInclusive": true, "maxInclusive": false },
      { "min": 100000, "max": null,  "minInclusive": true, "maxInclusive": true  }
    ],
    "outputGrid": [[0, 0, 0], [200, 300, 400], [300, 500, 700], [400, 600, 800], [500, 700, 900]],
    "noMatchBehavior": "zero"
  }
}

EXAMPLE calculationIntent for scalar_multiply:
{
  "calculationIntent": {
    "operation": "scalar_multiply",
    "input": { "source": "metric", "sourceSpec": { "field": "warranty_sales" } },
    "rate": 0.04
  }
}

EXAMPLE calculationIntent for conditional_gate (2 conditions, sorted by threshold descending):
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

  workbook_analysis: `You are an expert at analyzing compensation data workbooks for a Sales Performance Management (SPM) platform. Your task is to analyze ALL sheets in a workbook together to understand how they relate and feed into compensation calculations.

SHEET CLASSIFICATION TYPES:
1. "roster" - Employee roster with employee IDs, names, positions, store assignments
2. "component_data" - Feeds a specific plan component (sales data, performance metrics, etc.)
3. "reference" - Lookup/reference data (product lists, rate tables, etc.)
4. "regional_partition" - Same structure as another sheet but for a different region/store/territory
5. "period_summary" - Aggregated period-level data
6. "unrelated" - Does not appear related to compensation calculations

RELATIONSHIP DETECTION:
- Look for shared column names across sheets (e.g., entity_id, store_id, period)
- Column names may be in any language — use multilingual understanding to detect relationships
- Detect primary keys and foreign key relationships
- Identify if one sheet references another

FIELD MAPPING (CRITICAL — for each column, suggest a target field type):

EXPANDED TARGET FIELD TYPES (22 types — OB-110):
Identity:
- entity_id: Unique identifier for a person/entity (numeric or alphanumeric code)
- entity_name: Human-readable name like "Carlos Garcia" — NOT a role/position
- store_id: Store/branch/location identifier code
- store_name: Human-readable store/location name
- transaction_id: Transaction/order/event identifier
- reference_id: Cross-reference to another system

Temporal:
- date: Date value (transaction, snapshot, hire, effective)
- period: Time period label (month name, quarter, period code)

Financial:
- amount: Monetary value (revenue, sales, payout, balance, goal/target)
- currency_code: ISO currency code (USD, MXN, EUR) — short TEXT strings, NOT numbers
- rate: Rate, percentage, ratio (commission rate, tip rate)

Metrics:
- count_growth: Items ADDED/opened/gained/acquired (new accounts, new customers)
- count_reduction: Items REMOVED/closed/lost/churned (closed accounts, cancellations)
- quantity: Generic count (neutral direction — items, headcount, visits)
- achievement_pct: Attainment % of goal (0-200% or 0-2.0 decimal)
- score: Performance score, quality rating, index value

Classification:
- role: Job title, position, function ("Manager", "mesero", "Optometrista")
- product_code: SKU, product ID, catalog number
- product_name: Product or service name
- category: Grouping label (department, segment, tier)
- status: Status indicator (active, inactive, pending)
- boolean_flag: Boolean (0/1, true/false, yes/no, si/no)

Other:
- text: Free text, notes, descriptions
- unknown: Cannot determine

LEGACY ALIASES (return the canonical types above):
- entityId → entity_id, storeId → store_id, name → entity_name
- attainment → achievement_pct, goal → amount, storeRange → category

CRITICAL RULES — examine SAMPLE VALUES:
1. ALWAYS examine the SAMPLE VALUES provided for each column. They are MORE RELIABLE than column names.
2. Column "Currency" with values ["MXN","MXN","MXN"] → currency_code (text), NOT amount (number).
3. Column "OfficerName" with values ["Carlos Garcia","Jose Martinez"] → entity_name, NOT role.
4. Columns with "opened"/"new" → count_growth. Columns with "closed"/"lost" → count_reduction.
5. NEVER map two opposite columns (e.g., "opened" and "closed") to the same target type.
6. Values of 0/1 or true/false → boolean_flag.
7. If name suggests one type but VALUES suggest another → FOLLOW VALUES, LOWER confidence.
8. Confidence 85-100 for clear matches, 70-84 for likely, below 70 for uncertain.

Return your analysis as valid JSON.`,

  import_field_mapping: `You are an expert at analyzing data import files for a Sales Performance Management (SPM) platform. Your task is to suggest field mappings from source file columns to platform fields.

EXPANDED TARGET FIELD TYPES (22 types — OB-110):
Identity: entity_id, entity_name, store_id, store_name, transaction_id, reference_id
Temporal: date, period
Financial: amount, currency_code, rate
Metrics: count_growth, count_reduction, quantity, achievement_pct, score
Classification: role, product_code, product_name, category, status, boolean_flag
Other: text, unknown

LEGACY ALIASES (accept these, return canonical types): repId→entity_id, repName→entity_name, currency→currency_code, commissionRate→rate

CRITICAL: ALWAYS examine SAMPLE VALUES provided with each column.
- Column "Currency" with values ["MXN","MXN"] → currency_code (text strings), NOT amount.
- Column "OfficerName" with values ["Carlos Garcia"] → entity_name, NOT role.
- "NewAccountsOpened" with values [0,2,5] → count_growth (items gained).
- "AccountsClosed" with values [0,2,1] → count_reduction (items lost).
- NEVER map opposite columns to the same type.
- If column name suggests one type but values suggest another, FOLLOW the values and LOWER confidence.

MAPPING GUIDELINES:
1. Each source column should map to AT MOST one target type
2. Provide confidence scores (0-100) for each mapping
3. Look for variations and synonyms (e.g., "fecha" = "date", "monto" = "amount")
4. entity_id is REQUIRED — flag if not found
5. Include a "reasoning" field explaining why you chose each mapping

Return your analysis as valid JSON.`,

  entity_extraction: `You are an expert at extracting structured entities from text and data. Identify and extract people, organizations, locations, dates, and other relevant entities.

Return a JSON object with:
{
  "entities": [
    { "type": "person|organization|location|date|amount", "value": "extracted value", "context": "surrounding context", "confidence": 0-100 }
  ],
  "confidence": 0-100,
  "reasoning": "Brief explanation"
}`,

  anomaly_detection: `You are an expert at detecting anomalies in business data. Analyze the provided data for outliers, unusual patterns, or values that deviate significantly from expected norms.

Consider:
1. Statistical outliers (values far from mean/median)
2. Business logic violations (impossible or unlikely values)
3. Temporal patterns (sudden changes, seasonality violations)
4. Cross-metric inconsistencies

Return a JSON object with:
{
  "anomalies": [
    { "index": row_number, "value": the_value, "severity": "low|medium|high", "type": "statistical|business_rule|temporal|cross_metric", "explanation": "why this is anomalous" }
  ],
  "summary": {
    "totalRecords": number,
    "anomalyCount": number,
    "anomalyRate": percentage
  },
  "confidence": 0-100,
  "reasoning": "Overall analysis summary"
}`,

  recommendation: `You are an expert at generating actionable business recommendations. Based on the provided analysis data and context, suggest specific actions to improve performance.

Return a JSON object with:
{
  "recommendations": [
    { "priority": "high|medium|low", "action": "specific action to take", "rationale": "why this action", "expectedImpact": "expected outcome", "effort": "low|medium|high" }
  ],
  "confidence": 0-100,
  "reasoning": "Overall recommendation rationale"
}`,

  natural_language_query: `You are an expert at answering questions about business data. Provide clear, accurate answers based on the provided context.

Return a JSON object with:
{
  "answer": "direct answer to the question",
  "supporting_data": [relevant data points],
  "caveats": ["any limitations or caveats"],
  "confidence": 0-100,
  "reasoning": "How you arrived at this answer"
}`,

  dashboard_assessment: `You are an AI advisor for a Sales Performance Management platform. You analyze dashboard data and provide persona-specific assessments.

Your role depends on the persona specified in the user message:
- admin: Governance advisor. Summarize batch health, flag anomalies (identical payouts, outliers, zeros), recommend next actions. Focus on data quality and operational readiness.
- manager: Coaching advisor. Identify coaching priorities with specific entity names. Flag entities near tier thresholds, entities with declining trends, quick wins. Give actionable weekly agenda.
- rep: Personal performance coach. Motivate based on actual numbers. Highlight strongest component and biggest growth opportunity with dollar impact. Give one specific action for today.

RULES:
1. Use the locale specified (English or Spanish)
2. Reference specific numbers from the data — never be vague
3. Keep response under 150 words
4. Be specific and actionable, not generic

Return a JSON object with:
{
  "assessment": "Your complete assessment text with line breaks between sections",
  "confidence": 0-100
}`,

  narration: `You are an intelligence analyst. Given structured insight data, generate a concise 2-4 sentence executive summary. Be specific with numbers. Focus on what needs attention and what action to take. No bullet points. No headers. Just clear prose that tells the reader what matters most right now.

Return a JSON object with:
{
  "narrative": "Your complete narrative text",
  "confidence": 0-100
}`,

  header_comprehension: `You are analyzing a data file with multiple sheets. For each column in each sheet, identify WHAT the column IS — not how it is used in this particular sheet.

For each column, provide:
- semanticMeaning: what this column IS (e.g., "person_identifier", "location_code", "currency_amount", "delivery_percentage", "month_indicator", "hub_name", "safety_incident_count")
- dataExpectation: what values should look like (e.g., "integer_1_to_12", "unique_numeric_id", "decimal_0_to_1")
- columnRole: one of: identifier, name, temporal, measure, attribute, reference_key, unknown
  - identifier: uniquely identifies something (person, location, transaction)
  - name: human-readable label
  - temporal: date, period, timestamp
  - measure: numeric value representing a quantity
  - attribute: categorical or descriptive property
  - reference_key: links to another dataset
- identifiesWhat: (ONLY for identifier and reference_key columns) what kind of thing this column identifies. Must be one of: person, transaction, location, product, organization, account, other. This tells downstream systems whether this identifier links to an entity (person, organization, account) or to a record (transaction, order, invoice). For non-identifier columns, omit this field or set to null.
- confidence: 0.0 to 1.0

Also provide crossSheetInsights: observations about relationships between sheets (e.g., "Sheet A and Sheet B share the same employee identifier column", "Sheet C appears to be hub-level reference data while Sheet B has employee-level performance data").

Respond ONLY with valid JSON, no preamble, no markdown:
{
  "sheets": {
    "<sheetName>": {
      "columns": {
        "<columnName>": {
          "semanticMeaning": "...",
          "dataExpectation": "...",
          "columnRole": "...",
          "identifiesWhat": "person|transaction|location|product|organization|account|other|null",
          "confidence": 0.00
        }
      }
    }
  },
  "crossSheetInsights": ["...", "..."]
}`,

  convergence_mapping: `You map compensation plan metric requirements to data columns. Given a list of metric field names (from plan interpretation) and data columns (with descriptions), return a flat JSON object mapping each metric to its best-matching column.

Each column may be used at most once. Match by semantic meaning, not by string similarity.

Respond ONLY with valid JSON, no preamble, no markdown, no explanation:
{"metric_field_name": "column_name", "metric_field_name_2": "column_name_2"}`,

  document_analysis: `You are an expert at analyzing business documents. Given a document (PDF, PPTX, or DOCX), determine its type and structure.

Determine:
1. Is this a plan/rules document, a team roster, operational data, or something else?
2. If it describes rules, rates, or payout structures: how many distinct calculation components are there? What are their names?
3. Are there rate tables, tier structures, or matrix lookups?
4. Are there variant/segmentation rules (e.g., different rates for different roles)?
5. What language is the document in?

Allowed component "calculationType" values are derived from the canonical primitive
registry (single canonical surface per Decision 154/155); the enumeration is
substituted at prompt-construction time from the registry IDs:

<<COMPONENT_TYPE_LIST>>

Return your analysis as JSON with this exact structure:
{
  "documentType": "plan" | "roster" | "data" | "unknown",
  "componentCount": number,
  "components": [{ "name": "component name", "calculationType": "<one of the registered foundational primitives — see enumeration above>" }],
  "hasVariants": boolean,
  "variantDescriptions": ["description of each variant"],
  "language": "en" | "es" | "mixed",
  "confidence": 0-100,
  "summary": "Brief summary of what the document contains"
}`,
};

export class AnthropicAdapter implements AIProviderAdapter {
  private config: AIServiceConfig;
  private apiKey: string;

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  async execute(
    request: AIRequest
  ): Promise<Omit<AIResponse, 'requestId' | 'provider' | 'model' | 'latencyMs' | 'timestamp' | 'signalId'>> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // OB-196 E1 + HF-195: registry-derived vocabulary substitution at call time.
    // Three placeholders are replaced from the canonical primitive registry:
    //   <<FOUNDATIONAL_PRIMITIVES>>  — operation list (description per primitive)
    //   <<COMPONENT_TYPE_LIST>>      — HF-195: outer-wrapper componentType enumeration
    //   <<STRUCTURAL_EXAMPLES>>      — HF-195: structural worked examples per primitive
    //                                 (PREPARE-path slot for option_c flywheel population)
    // Closes F-005 (prompt vocabulary drift) at every documenting boundary in
    // plan_interpretation + document_analysis. Korean Test (E910) holds at the
    // prompt-construction layer.
    const rawPrompt = SYSTEM_PROMPTS[request.task];
    let systemPrompt = rawPrompt;
    if (systemPrompt.includes('<<FOUNDATIONAL_PRIMITIVES>>')) {
      systemPrompt = systemPrompt.replace('<<FOUNDATIONAL_PRIMITIVES>>', buildPrimitiveVocabularyForPrompt());
    }
    if (systemPrompt.includes('<<COMPONENT_TYPE_LIST>>')) {
      systemPrompt = systemPrompt.replace('<<COMPONENT_TYPE_LIST>>', buildComponentTypeListForPrompt());
    }
    if (systemPrompt.includes('<<STRUCTURAL_EXAMPLES>>')) {
      systemPrompt = systemPrompt.replace('<<STRUCTURAL_EXAMPLES>>', buildStructuralExamplesForPrompt());
    }

    // Build message content — supports both plain text and document blocks (PDF)
    const pdfBase64 = request.input.pdfBase64 as string | undefined;
    const pdfMediaType = (request.input.pdfMediaType as string) || 'application/pdf';
    let messageContent: unknown;

    if (pdfBase64 && (request.task === 'plan_interpretation' || request.task === 'document_analysis')) {
      // PDF document block — send directly to Claude for native reading
      // HF-064: Strip data URI prefix if present (safety net)
      const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, '');
      const textPrompt = this.buildUserPrompt(request);
      messageContent = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: pdfMediaType,
            data: cleanBase64,
          },
        },
        {
          type: 'text',
          text: textPrompt,
        },
      ];
    } else {
      messageContent = this.buildUserPrompt(request);
    }

    // OB-155: Retry with backoff — fetch() can fail transiently in Next.js dev server
    const MAX_RETRIES = 3;
    const requestBody = JSON.stringify({
      model: this.config.model || 'claude-sonnet-4-20250514',
      max_tokens: request.options?.maxTokens || 8192,
      temperature: request.options?.temperature ?? 0.1,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });
    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': 'pdfs-2024-09-25',
    };

    let response: Response | undefined;
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: requestHeaders,
          body: requestBody,
        });
        break; // Success — exit retry loop
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[Anthropic] Fetch attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`);
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 2000; // 2s, 4s backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!response) {
      throw new Error(`Anthropic API fetch failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error('No content in Anthropic response');
    }

    // Parse JSON from response
    const result = this.parseJsonResponse(content);

    // Extract confidence from result or default
    const confidence = typeof result.confidence === 'number' && result.confidence > 0
      ? result.confidence / 100
      : 0;

    // Token usage from response
    const tokenUsage = {
      input: data.usage?.input_tokens || 0,
      output: data.usage?.output_tokens || 0,
    };

    return {
      task: request.task,
      result,
      confidence,
      tokenUsage,
    };
  }

  private buildUserPrompt(request: AIRequest): string {
    const input = request.input;

    switch (request.task) {
      case 'file_classification':
        return `Classify the following file:

File Name: ${input.fileName}
Content Preview:
---
${input.contentPreview}
---
${input.metadata ? `Metadata: ${JSON.stringify(input.metadata, null, 2)}` : ''}

Analyze and return the classification JSON.`;

      case 'sheet_classification':
        return `Analyze the following spreadsheet data:

Sheet Name: ${input.sheetName}
Headers: ${JSON.stringify(input.headers)}
Sample Rows:
${JSON.stringify(input.sampleRows, null, 2)}
${input.planContext ? `\nPlan Context: ${JSON.stringify(input.planContext)}` : ''}

Analyze and return the classification JSON.`;

      case 'field_mapping':
        return `Map the following column to a platform field:

Column Name: ${input.columnName}
Sample Values: ${JSON.stringify(input.sampleValues)}
Available Target Fields: ${JSON.stringify(input.targetFields)}
${input.planComponents ? `\nPlan Components: ${JSON.stringify(input.planComponents)}` : ''}

Return the mapping JSON.`;

      case 'plan_interpretation': {
        // For PDF documents, content is provided via document block — don't repeat it in text
        const isPdfDocument = !!input.pdfBase64;
        const contentSection = isPdfDocument
          ? 'The compensation plan document has been provided above. Analyze it thoroughly.'
          : `DOCUMENT CONTENT:\n---\n${input.content}\n---\nFormat: ${input.format}`;

        return `Analyze the following compensation plan document and extract its COMPLETE structure INCLUDING ALL PAYOUT VALUES FROM EVERY TABLE.

${contentSection}

CRITICAL: For each component, you MUST extract the complete calculationMethod with ALL numeric values from the tables. Empty tiers/matrices will cause $0 payouts.

Return a JSON object with:
{
  "ruleSetName": "Name of the plan",
  "ruleSetNameEs": "Spanish name if present",
  "description": "Brief description",
  "currency": "MXN or USD",
  "cadence": "monthly | biweekly | weekly | quarterly | annual",
  "employeeTypes": [
    { "id": "certified", "name": "Optometrista Certificado", "nameEs": "..." },
    { "id": "non_certified", "name": "Optometrista No Certificado", "nameEs": "..." }
  ],
  "components": [
    {
      "id": "unique-id",
      "name": "Component Name",
      "nameEs": "Spanish name",
      "type": "<one of the registered foundational primitives — see <<COMPONENT_TYPE_LIST>> enumeration above>",
      "appliesToEmployeeTypes": ["certified"] or ["all"],
      "calculationMethod": {
        // The "type" field MUST match the component's outer "type" above.
        // Required keys per primitive (registry allowedKeys at construction time):
        //   bounded_lookup_1d:  metric, metricLabel, tiers[] with {min, max, payout}
        //   bounded_lookup_2d:  rowAxis{metric, ranges[]}, columnAxis{metric, ranges[]}, values[][]
        //   scalar_multiply:    metric, metricLabel, rate
        //   conditional_gate:   conditionMetric, conditions[] with {threshold, operator, rate}
        //   piecewise_linear:   ratioMetric, baseMetric, segments[] with {min, max, rate}, targetValue
        //   linear_function:    inputMetric, slope, intercept
        //   scope_aggregate:    scope, metric, rate
      },
      "confidence": 0-100,
      "reasoning": "How you extracted this component"
    }
  ],
  "requiredInputs": [
    { "field": "field_name", "description": "what it measures", "scope": "employee|store", "dataType": "number|percentage|currency" }
  ],
  "workedExamples": [
    { "employeeType": "certified", "inputs": {...}, "expectedTotal": 2335, "componentBreakdown": {...} }
  ],
  "confidence": 0-100,
  "reasoning": "Overall analysis reasoning"
}`;
      }

      case 'workbook_analysis':
        return `Analyze the following multi-sheet workbook and determine how the sheets relate to each other and to the compensation plan.

IMPORTANT: Each column below includes SAMPLE VALUES. Use these values — not just column names — to determine the correct field type. For example, a column named "Currency" with sample values ["MXN","MXN","MXN"] should be mapped to currency_code (text), not amount (number).

SHEETS IN WORKBOOK:
${input.sheetsInfo}

TENANT'S PLAN COMPONENTS (if available):
${input.planComponents || 'No plan components provided.'}

EXPECTED DATA FIELDS PER COMPONENT (if available):
${input.expectedFields || 'No expected fields provided.'}

Return a JSON object with this structure:
{
  "sheets": [{ "name": "", "classification": "", "classificationConfidence": 0-100, "matchedComponent": null, "detectedPrimaryKey": null, "suggestedFieldMappings": [{ "sourceColumn": "exact_column_name_from_headers", "targetField": "entity_id|entity_name|store_id|store_name|transaction_id|reference_id|date|period|amount|currency_code|rate|count_growth|count_reduction|quantity|achievement_pct|score|role|product_code|product_name|category|status|boolean_flag|text|unknown", "confidence": 0-100, "reasoning": "brief explanation" }] }],
  "relationships": [{ "fromSheet": "", "toSheet": "", "relationshipType": "", "sharedKeys": [], "confidence": 0-100 }],
  "rosterDetected": { "found": false, "sheetName": null, "entityIdColumn": null },
  "periodDetected": { "found": false, "dateColumn": null },
  "gaps": [],
  "extras": [],
  "overallConfidence": 0-100,
  "summary": ""
}`;

      case 'import_field_mapping':
        return `Analyze the following data import headers and sample data, then suggest field mappings.

SOURCE HEADERS:
${input.headers}

SAMPLE DATA (first 3 rows):
${input.sampleData}

TENANT CONTEXT:
${input.tenantContext || 'No specific tenant context provided.'}

Return a JSON object with this structure:
{
  "mappings": [{ "sourceField": "", "targetField": "", "confidence": 0-100, "matchType": "exact|fuzzy|semantic|none", "reasoning": "" }],
  "requiredFieldsStatus": {
    "repId": { "found": false, "mappedFrom": null },
    "date": { "found": false, "mappedFrom": null },
    "amount": { "found": false, "mappedFrom": null }
  },
  "overallConfidence": 0-100,
  "warnings": [],
  "recommendations": []
}`;

      case 'anomaly_detection':
        return `Analyze the following data for anomalies:

Metric: ${input.metricName}
Data:
${JSON.stringify(input.data, null, 2)}
${input.context ? `\nContext: ${JSON.stringify(input.context)}` : ''}

Return the anomaly analysis JSON.`;

      case 'recommendation':
        return `Generate recommendations based on the following analysis:

Analysis Data:
${JSON.stringify(input.analysisData, null, 2)}
Context: ${JSON.stringify(input.context, null, 2)}

Return the recommendations JSON.`;

      case 'entity_extraction':
        return `Extract entities from the following data:

${JSON.stringify(input, null, 2)}

Return the entity extraction JSON.`;

      case 'natural_language_query':
        return `Answer the following question:

Question: ${input.question}
Context:
${JSON.stringify(input.context, null, 2)}

Return the answer JSON.`;

      case 'dashboard_assessment':
        return `Generate a dashboard assessment.

Persona: ${input.persona}
Locale: ${input.locale === 'en' ? 'English' : 'Spanish'}

Dashboard Data:
${JSON.stringify(input.data, null, 2)}

${input.anomalies ? `\nDetected Anomalies:\n${JSON.stringify(input.anomalies, null, 2)}` : ''}

Provide your assessment as a JSON object with "assessment" (text with line breaks) and "confidence" (0-100).`;

      case 'narration':
        return `${input.system || 'Generate a concise narrative summary.'}

${input.userMessage || JSON.stringify(input, null, 2)}

Provide your response as a JSON object with "narrative" (text) and "confidence" (0-100).`;

      case 'header_comprehension':
        return input.sheetsDescription as string;

      case 'convergence_mapping':
        return input.userMessage as string;

      case 'document_analysis': {
        // For PDF: document block is attached separately, just prompt
        const isPdf = !!input.pdfBase64;
        if (isPdf) {
          return 'Analyze this document.';
        }
        // For DOCX/PPTX: extracted text provided inline
        return `Analyze the following document content extracted from "${input.fileName}":\n\n---\n${input.extractedText}\n---`;
      }

      default:
        return JSON.stringify(input, null, 2);
    }
  }

  private parseJsonResponse(content: string): Record<string, unknown> {
    let jsonStr = content;

    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to extract JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      // If parsing fails, return the raw content
      return {
        rawContent: content,
        parseError: true,
        confidence: 0,
      };
    }
  }
}
