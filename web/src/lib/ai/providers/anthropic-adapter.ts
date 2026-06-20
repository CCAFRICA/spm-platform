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
  ProviderHardError,
  AgentTurnRequest,
  AgentTurnResponse,
} from '../types';
import { generatePromptGrammarSection } from '../../calculation/prime-grammar';
// OB-215: model selection, the sampling-param deprecation guard, and the resolved
// model are all owned by model-policy.ts now. HF-304's plan→Opus routing and the
// scattered default-model fallbacks that used to live here all moved there.
import { resolveModel, defaultModel, modelRejectsSamplingParams } from '../model-policy';

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

// OB-199 Phase 1 (DS-023 §5.4): single producer-side confidence normalization.
// Walks the parsed AIResponse payload recursively and rescales any `confidence`
// field with a numeric value > 1 to ratio form by dividing by 100. Values <= 1
// pass through unchanged. No clamping at the producer; out-of-range values
// after normalization surface structurally at the canonical writer per §5.2.
// Exported for direct testing.
export function normalizeConfidenceFieldsInPlace(node: unknown): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeConfidenceFieldsInPlace(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'confidence' && typeof value === 'number' && Number.isFinite(value) && value > 1) {
      obj[key] = value / 100;
    } else if (typeof value === 'object' && value !== null) {
      normalizeConfidenceFieldsInPlace(value);
    }
  }
}

function buildPrimitiveVocabularyForPrompt(): string {
  // HF-238 Closure 1: filter deprecated entries. Only non-deprecated
  // primitives are surfaced to the LLM as recommended emission targets.
  const ops = getOperationPrimitives().filter((p) => !p.deprecated);
  const lines = ops.map((p, i) => `${i + 1}. ${p.id} — ${p.description}`);
  return `${ops.length} PRIMITIVE OPERATIONS:\n${lines.join('\n')}`;
}

// HF-195: registry-derived componentType enumeration for the plan-interpretation
// prompt's outer wrapper. The "type" field on each component, and the
// document_analysis prompt's calculationType field, derive from this enumeration.
//
// HF-238 Closure 1: deprecated entries are filtered. Only non-deprecated
// identifiers are surfaced — the LLM's wrapper `type` field for new emissions
// should be one of these. Legacy types remain in the registry for the
// storage-boundary adapter and compile-time type narrowing.
function buildComponentTypeListForPrompt(): string {
  const ids = getRegistry().filter((p) => !p.deprecated).map((p) => p.id);
  return `Allowed component "type" values (${ids.length} active foundational primitive${ids.length === 1 ? '' : 's'}):\n${ids.map((id) => `  - ${id}`).join('\n')}`;
}

// HF-195: registry-derived structural-examples block. Iterates registered
// primitives and emits the promptStructuralExample field where populated.
//
// HF-238 Closure 1: deprecated entries are filtered — old convenience-pattern
// examples (bounded_lookup_1d, scalar_multiply, etc.) had their
// promptStructuralExample stripped from the registry because they conflict
// with the prime-DAG composition prompt. This filter is belt-and-suspenders:
// even if a deprecated entry retains a value, it is skipped.
function buildStructuralExamplesForPrompt(): string {
  const withExamples = getRegistry().filter(
    (p) => !p.deprecated
      && typeof p.promptStructuralExample === 'string'
      && p.promptStructuralExample.length > 0,
  );
  if (withExamples.length === 0) {
    return [
      'Structural examples per primitive (use these to classify by value-distribution and shape signature):',
      '  [No active primitives carry promptStructuralExample content.',
      '   The prime-DAG composition guide in the CALCULATION INTENT section',
      '   below is the authoritative source for primitive composition examples.]',
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

WORKED EXAMPLES (HISTORICAL REFERENCE — the section below shows the LEGACY shapes the engine used before the prime-DAG migration. Post-HF-238 the only registered primitive is "prime_dag"; every component MUST be emitted with type="prime_dag" and a calculationIntent PrimeNode tree per the CALCULATION INTENT grammar below. The legacy shapes below are kept as semantic glossary so you can READ a legacy plan description and translate it into the prime-DAG composition. Do NOT emit type="bounded_lookup_2d", type="scalar_multiply", etc. — those are not registered primitives in the current platform):

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

<<PRIME_GRAMMAR>>

Return your analysis as valid JSON.`,

  plan_skeleton: `You are an expert at analyzing compensation and commission plan documents. Your task in this PHASE A call is to extract the plan-level STRUCTURE and a COMPONENT INDEX. You do NOT emit calculationIntent or calculationMethod here — those are produced in a separate per-component call.

Output is small JSON — keep it compact. Per-component DAG trees and rate-table contents are EXPLICITLY out of scope for this call.

CRITICAL REQUIREMENTS:
1. Detect EVERY distinct compensation component. Each table / metric / KPI with its own payout structure is a separate component.
2. Detect ALL employee types/classifications if the document distinguishes payout levels by role. Enumerate them in \`employeeTypes\` with stable ids.
3. PER-VARIANT ENUMERATION (HF-252): when a component pays DIFFERENTLY by entity category (different rates, different breaks, different outputs for different roles/levels/tiers), enumerate it ONCE PER CATEGORY in \`componentIndex\` — each entry's \`appliesToEmployeeTypes\` carries the single category id. When a component pays UNIFORMLY across categories, enumerate it once with \`appliesToEmployeeTypes: ["all"]\`.
4. For each component declare rateTableCellCount (integer) when the component is backed by a rate table: 1D band table → number of tiers; 2D matrix → rows × columns. Omit the field when the component has no rate table (simple rate × metric, linear function, etc.).
5. briefSemantic is a one-sentence prose description of what the component computes ("placement attainment matrix paying tier-specific bonus by attainment band × quality band"). It is NOT a DAG tree.

Per-variant enumeration example: a plan with components C0/C1/C2/C3 that pay different rates to Senior vs Ejecutivo produces 8 componentIndex entries (4 components × 2 categories). Each entry's appliesToEmployeeTypes is a single-element array of the category id it applies to. The per-component intent calls then receive the correct category context and emit a metric-only intent for that variant.

Return JSON with this exact structure:
{
  "ruleSetName": "Name of the plan, verbatim from document title/header",
  "ruleSetNameEs": "Spanish name if present, otherwise omit",
  "description": "Brief description",
  "currency": "MXN | USD | …",
  "cadence": "monthly | biweekly | weekly | quarterly | annual",
  "employeeTypes": [
    { "id": "stable-id-1", "name": "Role name verbatim", "nameEs": "..." }
  ],
  "componentIndex": [
    {
      "id": "component-id-1",
      "name": "Component name verbatim",
      "nameEs": "Spanish name if present",
      "appliesToEmployeeTypes": ["stable-id-1"] or ["all"],
      "briefSemantic": "one-sentence prose describing what this component computes",
      "rateTableCellCount": 30,   // omit when no rate table
      "confidence": 0-100
    }
  ],
  "requiredInputs": [
    { "field": "field_name", "description": "what it measures", "scope": "employee|store", "dataType": "number|percentage|currency" }
  ],
  "confidence": 0-100,
  "reasoning": "Overall analysis reasoning"
}

If the document is not a compensation plan, return componentIndex: [] and explain in reasoning. Do NOT emit empty componentIndex for a document that DOES describe a plan.

Return your analysis as valid JSON.`,

  plan_component: `You are interpreting ONE component of a compensation plan and emitting a compact CompositionalIntent that describes its structure. Code constructs the PrimeNode tree from your intent — you do NOT emit the tree itself.

Per Decision 158: LLM recognition + code construction. You RECOGNIZE what the plan describes; the platform's deterministic constructor BUILDS the calculation tree.

CRITICAL: Extract EVERY structural value the component's source describes — every break threshold, every output value, every reference field. The constructor validates breaks-vs-outputs cardinality and rejects intents whose output count does not match the dimension product. Half-open intervals, scale metadata placement, terminal completeness are CONSTRUCTOR responsibilities, not yours.

EMISSION DISCIPLINE (HF-252 — read this before drafting the intent):

A CompositionalIntent describes the calculation for ONE component as it applies to ONE category of entity. Reference ONLY the numeric measures the calculation consumes — attainment ratios, amounts, counts, percentages, totals. Use \`ReferenceSource.type\` values: \`metric\`, \`ratio\`, \`aggregate\`, \`scope_aggregate\`, \`prior_component\`.

PER-ENTITY vs PER-ROW differentiation — DISTINGUISH THESE (OB-223):
  • PER-ENTITY category = a property of the PAYEE (role, level, tier, seniority, classification of the
    person/account). One entity has ONE value. This is VARIANT differentiation — emit the component once
    per category and route via \`applies_to\` (below). Do NOT encode it as a conditional/attribute ref.
  • PER-ROW / PER-TRANSACTION attribute = a property that VARIES across a single entity's own
    transaction rows (product category, channel, region, status on each sale). One entity's rows span
    MANY values. This is NOT variant differentiation (a variant is per-entity; one entity can't be in
    four product categories at once). Express it with filter→aggregate INSIDE the component's
    calculationIntent prime DAG (see PRIME GRAMMAR "ENGINE AGGREGATION MODEL" + SC-07): one
    \`filter{field,operator:"eq",value}\`→\`aggregate{op,field}\` per category value, combined with
    arithmetic. Do NOT use \`scope_aggregate\` (that scopes to peer ENTITIES, not transaction rows) and
    do NOT emit a per-category variant.

When a component's rates or outputs differ by an ENTITY category (per-entity, not per-row):
  • Emit the component ONCE per category — each emission is its own per-component call.
  • Declare which category each emission applies to via the top-level \`applies_to\` field.
  • The platform routes each entity to the variant whose components match its category.

\`applies_to\` semantics:
  • Omitted, empty, or \`["all"]\` — applies to all variants of the plan.
  • \`["<category-id>", ...]\` — applies only to the listed category id(s). Category ids match what the plan_skeleton call enumerated in \`employeeTypes\`.

\`attribute\` ReferenceSource is reserved for numeric attributes (entity-level numeric properties consumed by the calculation, e.g., a quota the entity carries). It MUST NOT drive categorical payout differentiation.

ACCELERATOR / MULTIPLIER folding (OB-223) — when a plan applies an accelerator or multiplier to a base
amount (e.g. "if total sales ≥ threshold, multiply the commission by 1.25"), fold the multiplier INSIDE
the base component as a conditional wrapper — do NOT emit a separate component for the multiplier. A
separate component that outputs a scalar (1.0 / 1.25) is ADDED to the dollar commission by the engine
(components are summed), producing a wrong result. Correct shape:
  conditional(condition: compare(<threshold metric>, <threshold>, gte), then: multiply(<base>, <multiplier>), else: <base>)
The base computation appears in BOTH branches; only the multiplier differs.

CLAWBACK / REVERSAL (OB-223, binding) — a component that reverses or adjusts a PRIOR period's CALCULATED
result (returns, chargebacks, clawbacks) MUST carry a \`temporal_adjustment\` modifier and its
calculationIntent MUST be \`constant(0)\` as the in-period base. The reversal amount is the stored OUTPUT
of a prior calculation — the engine retrieves it (Pattern D). DO NOT reference prior-plan rates/outputs
as data-column inputs (they are not in the data). Emit, as a sibling \`modifiers\` array on the component:
  modifiers: [{ "modifier":"temporal_adjustment", "adjustmentType":"per_transaction_reversal",
    "referenceMapping": { "returnField":"<col on the return row referencing the original txn>",
                          "originalField":"<matching col on the original row>" }, "recoveryRate": <0..1> }]

<<COMPONENT_TYPE_LIST>>

<<PRIME_GRAMMAR>>

CompositionalIntent SHAPE (discriminated on \`structure.shape\`):

1. banded_lookup — N-dimensional tier table (1D banded rate / 2D matrix / etc.)

   {
     "shape": "banded_lookup",
     "dimensions": [
       {
         "reference_field": "<field_name>",
         "reference_source": { "type": "metric|ratio|aggregate|attribute|cross_data|scope_aggregate|prior_component", "...": "..." },
         "breaks": [<number>, <number>, ...]   // ascending, breaks.length+1 bands per dimension
       },
       ...
     ],
     "outputs": [<n1>, <n2>, ...]   // flat array, length = product of (breaks.length+1) across dimensions
   }

   Cell at (i, j, k, ...) → outputs[i * d2_bands * d3_bands * ... + j * d3_bands * ... + k * ... + ...].

2. arithmetic — binary numeric composition

   { "shape": "arithmetic", "operation": "add|subtract|multiply|divide", "operands": [<operand>, <operand>] }

3. conditional — gate with then/else

   {
     "shape": "conditional",
     "condition": { "reference": <source>, "operator": "gt|gte|lt|lte|eq|neq", "threshold": <number> },
     "then": <structure or operand>,
     "else": <structure or operand>
   }

4. composed — sum/max/min/first_match over children

   { "shape": "composed", "composition": "sum|max|min|first_match", "children": [<structure>, ...] }

Operand kinds:
  { "kind": "reference", "source": <ReferenceSource> }
  { "kind": "constant", "value": <number> }
  { "kind": "structure", "structure": <StructuralDescription> }

ReferenceSource types:
  { "type": "metric", "field": "<name>" }
  { "type": "ratio", "numerator_field": "<n>", "denominator_field": "<d>" }
  { "type": "aggregate", "field": "<name>", "op": "sum|count|avg|min|max" }
  { "type": "attribute", "field": "<name>" }
  { "type": "scope_aggregate", "field": "<name>", "boundary": "<attr>", "op": "sum|count|avg|min|max" }
  { "type": "cross_data", "data_type": "<type>", "field"?: "<f>", "aggregation": "count|sum" }
  { "type": "prior_component", "component_index": <n> }

Scale specification — name which side scales (HF-244 mutual exclusion):
  scale: { "side": "evaluator|convergence", "unit": "percent|ratio|currency|count", "value": <number>, "confidence": <0-1>, "reference_field"?: "<f>" }
  Or scale: null when no scale normalization is needed.

RATIO-SOURCE BANDS — quotient-space breaks, NO scale (HF-279, binding):
  When a banded_lookup dimension's reference_source.type is "ratio" (a division the
  plan defines — numerator over denominator), that dimension's "breaks" MUST be
  stated in the QUOTIENT'S OWN SPACE — the same 0..N space the division produces —
  NOT in percent and NOT pre-multiplied. A plan saying ">=85% on-time" emits break
  0.85; ">=130%" or ">=1.3x attainment" emits break 1.3; "at least 0.6" emits 0.6.
  The division and its breaks already share one space; there is nothing to scale.
  Therefore emit NO scale for that band: set scale: null (or, if some OTHER non-ratio
  dimension genuinely needs scaling, do not let any scale bind to the ratio
  dimension's field). A scale paired with a ratio-source band is internally
  incoherent and is REJECTED at recognition output — never silently constructed.
  (A single PRE-COMPUTED column that already holds a percent value is a "metric"
  reference, not a ratio division — scale still applies to it normally.)

HOW TO DESCRIBE THE STRUCTURE — describe what the plan text actually says, using the primitives below and the one rule that composes them. There is NO catalog of component shapes to match against: a finite set of primitives composes without bound. Read the structure and describe it; do NOT match the plan to a remembered kind of plan.

REFERENCE TYPES — how a single value is read from the data:
  • A value that is one quantity → a metric reference; name that one field.
  • A value that is one quantity DIVIDED BY another (a rate, a per-unit, an attainment of one amount over another — anything of the form X over Y) → a ratio reference; name BOTH the numerator field AND the denominator field. NEVER collapse a divided quantity to a single field. Even when the plan also mentions a pre-computed column that already holds the quotient, describe the division the plan defines (numerator ÷ denominator), not the pre-baked column.
  • A value summed / counted / averaged over a group → an aggregate reference (scope_aggregate when aggregated within a boundary); name the field and the operation.
  • A value carried from an earlier component → a prior_component reference.

STRUCTURAL SHAPES — how values combine:
  • Values combined by an operation (× ÷ + −) → arithmetic; state the operation and its two operands. An operand may itself be a nested structure.
  • A value that changes at a threshold/condition → conditional; state the condition (reference, operator, threshold), the then-value, and the else-value.
  • A bound on a value — a cap, floor, limit, "no more than", "no less than", "maximum/minimum of" — → a conditional clamp applied to THAT value, in the same space the bound is stated (a cap on a ratio clamps the ratio), applied BEFORE that value combines further.
  • A payout that varies across one or more graduated thresholds → a banded_lookup; give the reference field(s) for each dimension, the ascending break points, and the cell values. When a dimension's reference is a ratio (a division), state that dimension's break points in the quotient's own space (0.85 for 85%, 1.3 for 130%/1.3x) and emit no scale for it (HF-279).
  • Independently-computed parts combined into one result → composed (sum / max / min / first_match).

THE COMPOSITION RULE (the generative core): these primitives nest and combine freely and recursively to match whatever the plan describes — a ratio can be the operand of a clamp, a clamp can be the operand of a multiply, a multiply can be a child of a sum, to whatever depth the plan's text implies. There is no fixed template to select; describe the actual structure you read. If a value is bounded and then multiplied by a base, that is an arithmetic multiply whose operands are the clamped value and the base — composed from primitives, not retrieved as a named shape.

SINGLE-PRIMITIVE FORMS (abstract placeholders — NOT a real plan; no field names, no real thresholds, no component kind. Replace each <…> with what the plan states):
  • a ratio reference:                          { "type": "ratio", "numerator_field": "<numerator>", "denominator_field": "<denominator>" }
  • a conditional clamp of value V at limit L:   { "shape": "conditional", "condition": { "reference": <V's source>, "operator": "gte", "threshold": <L> }, "then": { "kind": "constant", "value": <L> }, "else": <V as an operand> }
  • an arithmetic multiply of two operands:      { "shape": "arithmetic", "operation": "multiply", "operands": [ <operand A>, <operand B> ] }

Response shape — return JSON with ONLY these fields:
{
  "id": "<component-id echoed from the request>",
  "name": "<component name echoed from the request>",
  "type": "prime_dag",
  "compositional_intent": {
    "component_id": "...",
    "component_name": "...",
    "applies_to": ["<category-id>", ...],  // HF-252: which variant(s) this emission applies to. Use ["all"] when uniform across variants.
    "structure": { /* StructuralDescription */ },
    "scale": null | { /* ScaleSpec */ },
    "output_precision": 0,
    "metadata"?: { /* optional */ }
  },
  "calculationMethod": { "type": "prime_dag" },
  "rateTableCellCount": <number when applicable>,
  "confidence": 0-100,
  "reasoning": "How you extracted the structure"
}

DO NOT emit a calculationIntent PrimeNode tree. The constructor builds it.
DO NOT decompose the intent across multiple calls. The intent is compact — typically 200-1000 bytes — and fits in a single call regardless of component complexity.
DO NOT encode role/category differentiation inside \`structure\`. Use \`applies_to\` at the top level (HF-252 variant routing).

Return your analysis as valid JSON.`,

  plan_component_with_chunking: `You are emitting the SKELETON of one plan component's Prime-DAG calculationIntent.

MODE: SKELETON_ONLY

This call returns ONLY the structural skeleton tree. Each leaf-bearing sub-tree is replaced by a \`{"\$ref": "chunk_<id>"}\` placeholder at a GRAMMAR-LEGAL CUT POINT. A SEPARATE LLM call is fired in parallel for EACH \$ref to emit that chunk's content. DO NOT include a \`chunks\` field in this response — chunks come from the per-chunk calls.

This separation exists because the combined skeleton + chunks emission exceeded the LLM output token budget for large components (HF-249 verification 2026-05-23: BCL C0 30-cell matrix truncated at JSON position 23609 when chunks were emitted inline). Splitting the calls means each call's output stays well under budget.

CRITICAL: Extract EVERY structural boundary the component's source describes — every tier break, every band threshold, every matrix row/column boundary. The skeleton declares the SHAPE; per-chunk calls fill the values. The downstream validator rejects skeletons whose total chunk count is fewer than the rateTableCellCount declared for the component.

<<COMPONENT_TYPE_LIST>>

<<PRIME_GRAMMAR>>

LEGAL CUT POINTS — positions where a sub-tree MUST be replaced by a \`{"\$ref": "chunk_<id>"}\` placeholder:
  conditional.then         (numeric subtree)
  conditional.else         (numeric subtree)
  filter.downstream        (numeric subtree)
  scope.downstream         (numeric subtree)
  prior_period.downstream  (numeric subtree)

ILLEGAL cut points (do NOT replace these with \$ref):
  conditional.condition    (boolean predicate — must be emitted inline in the skeleton)
  arithmetic/compare/logical .inputs[i]  (numeric arity-fixed; emit inline)
  filter.predicate / scope.boundary       (atomic descriptors — emit inline)

DECOMPOSITION GUIDANCE — emit a \$ref at EVERY legal cut point whose downstream content carries multiple leaves or nested conditionals. For an N×M 2D band-lookup matrix: the outer conditional structure (row selection) is emitted inline in the skeleton, with each then/else branch carrying a \$ref to a per-row chunk that handles the column selection. This produces ~N chunks (one per row), each containing ~M leaves — every chunk fits comfortably in the per-call budget.

Example skeleton for a 6-row × 5-column matrix (illustrative — actual structure follows the source):
{
  "prime": "conditional",
  "condition": {"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"row_axis_metric"},{"prime":"constant","value":120,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
  "then": {"\$ref": "chunk_row_120plus"},
  "else": {
    "prime": "conditional",
    "condition": {"prime":"logical","op":"and","inputs":[
      {"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"row_axis_metric"},{"prime":"constant","value":100,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
      {"prime":"compare","op":"lt","inputs":[{"prime":"reference","field":"row_axis_metric"},{"prime":"constant","value":120,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]}
    ]},
    "then": {"\$ref": "chunk_row_100_120"},
    "else": {"\$ref": "chunk_row_below_100"}
  }
}

The skeleton above carries no leaf payouts — those come from per-chunk calls. Three \$refs declared. Choose chunk_id strings as stable, semantic, lowercase, hyphen/underscore identifiers (chunk_row_120plus, chunk_attain_high, chunk_1, etc.).

Response shape — return JSON with ONLY these fields:
{
  "id": "component-id (echo from the request)",
  "name": "component name (echo from the request)",
  "type": "prime_dag",
  "calculationIntent": {
    "prime": "conditional",
    "condition": {"...": "..."},
    "then": {"\$ref": "chunk_<id>"},
    "else": {"\$ref": "chunk_<id>"}
  },
  "expectedChunkIds": ["chunk_row_120plus", "chunk_row_100_120", "chunk_row_below_100"],
  "calculationMethod": { "type": "prime_dag" },
  "rateTableCellCount": 30,   // echo from the request when applicable
  "confidence": 0-100,
  "reasoning": "How you decomposed this component into skeleton + chunks"
}

The \`expectedChunkIds\` array lists every \$ref used in the skeleton. The orchestrator validates this list matches the \$refs collected from the tree before firing per-chunk calls.

DO NOT include a \`chunks\` field — chunks come from separate calls. Return your analysis as valid JSON.`,

  plan_chunk: `You are emitting ONE sub-tree of a plan component's Prime-DAG calculationIntent.

The parent component's skeleton call declared this chunk_id at the supplied skeletonPath. THIS call returns the complete sub-tree that fills that position. The orchestrator assembles all chunks into the parent skeleton via the deterministic assembler.

The plan document, the parent component's name and brief semantic, the chunk_id, and the skeletonPath will be supplied in the user message.

CRITICAL: This sub-tree is COMPLETE — it carries every leaf value the source describes for this position. NOT a fragment. Every numeric value, every tier threshold, every payout amount must be present. Scale metadata on compare-position constants per the grammar. Half-open intervals on band-selection conditionals (Decision 127).

IMPORTANT: DO NOT emit \`{"\$ref": "..."}\` placeholders inside this sub-tree. This chunk must be COMPLETE — fully expanded, no nested references. If the chunk's content seems too large, you may use compact serialization (less whitespace) but every leaf must appear. The assembler will REJECT trees with unresolved references inside chunks.

<<COMPONENT_TYPE_LIST>>

<<PRIME_GRAMMAR>>

Response shape — return JSON with ONLY these fields:
{
  "chunkId": "<echo from the request>",
  "subtree": {
    "prime": "...",
    "...": "..."
  },
  "confidence": 0-100,
  "reasoning": "How you extracted this chunk"
}

DO NOT include a \`chunks\` field. The subtree must be complete and self-contained. Return your analysis as valid JSON.`,

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

  convergence_mapping: `You bind compensation-plan metric requirements to data columns by recognizing meaning.

You are given the plan's required fields (each with the component's calculation intent for context) and a set of CANDIDATE COLUMNS. Every candidate is LABELED with its sheet, its structural type, its contextual identity, and its value range. Candidates from multiple sheets are presented together — the sheet label is how you tell them apart.

For each required field, choose the column whose MEANING best satisfies the requirement:
- Match by semantic meaning, label, and role — not string similarity. A field named one way may be satisfied by a differently-named column.
- Pick the column from the sheet whose columns collectively fit the component. A field may map to a column on ANY sheet; one component may legitimately span sheets when its fields belong to different sheets.
- You MAY abstain for a field when no candidate is a sound fit — return an abstain object with a reason instead of forcing a pick (insufficient evidence is a valid answer; do not guess).

Respond ONLY with valid JSON, no preamble, no markdown — an object keyed by required field name. Each value is either:
  {"column": "<column name>", "sheet": "<sheet label>", "confidence": <0.0-1.0>, "reduction": "<sum|snapshot|max|min|average|last|first|distinct_count>"}
or, to abstain:
  {"abstain": true, "reason": "<why no candidate fits>"}
Optionally add "filters": [{"field":"<categorical column>","operator":"eq","value":"<one of its listed values>"}] when the field is a subset of a shared column.`,

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
  ): Promise<Omit<AIResponse, 'requestId' | 'provider' | 'latencyMs' | 'timestamp' | 'signalId'>> {
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
    // OB-200 Phase 1: prime-DAG composition surface is generated from
    // prime-grammar.ts (the canonical declaration per T1-E910 v2). No private
    // copy of the composition rules lives in the prompt template.
    if (systemPrompt.includes('<<PRIME_GRAMMAR>>')) {
      systemPrompt = systemPrompt.replace('<<PRIME_GRAMMAR>>', generatePromptGrammarSection());
    }

    // Build message content — supports both plain text and document blocks.
    // HF-258 (Q2 content-channel unification): attach the document block based on the
    // content unit's structural TYPE, not the task name. A `document` content unit carries
    // a base64 payload (materialized server-side from storage upstream); a `text` unit does
    // not. `contentType` is the explicit content-unit type produced at ingestion; the
    // `pdfBase64 ? 'document' : 'text'` fallback makes this self-sufficient and
    // regression-proof for any task that carries a document payload (incl. the previously
    // gated plan_interpretation/document_analysis). Korean Test: dispatch on content
    // identity, never on task-name or format-name literals. This restores PDF on the
    // orchestrator's plan_skeleton/plan_component/chunk tasks (DIAG-058 regression).
    const pdfBase64 = request.input.pdfBase64 as string | undefined;
    const pdfMediaType = (request.input.pdfMediaType as string) || 'application/pdf';
    const contentType = (request.input.contentType as string | undefined) ?? (pdfBase64 ? 'document' : 'text');
    let messageContent: unknown;

    if (pdfBase64 && contentType === 'document') {
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
    // OB-215: one resolver decides the model per task (plan family → Opus, else the
    // configured/env default). The shared body-builder omits `temperature` for models
    // that 400 on sampling params (Opus/Fable) — closing the AUD-018 File B import
    // blocker that HF-304 exposed by routing plan tasks to Opus without dropping it.
    const resolvedModel = resolveModel(request.task, { configModel: this.config.model });
    const requestBody = this.buildRequestBody({
      model: resolvedModel,
      maxTokens: request.options?.maxTokens || 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
      temperature: request.options?.temperature ?? 0.1,
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
      // AUD-009: connectivity hard-failure after retries — tag it so the AIService
      // surfaces it loudly rather than degrading it into silent low confidence.
      const err = new Error(`Anthropic API fetch failed after ${MAX_RETRIES} attempts: ${lastError?.message}`) as ProviderHardError;
      err.providerError = true;
      err.providerModel = resolvedModel; // OB-215: the model actually sent (Opus for plan tasks), not the config default
      throw err;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // AUD-009: provider returned non-2xx (e.g. 404 sunset model, 401 bad key,
      // 429 rate limit) — tag as a provider hard-error with the HTTP status.
      const err = new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errorData)}`) as ProviderHardError;
      err.providerError = true;
      err.status = response.status;
      err.providerModel = resolvedModel; // OB-215: name the model actually in play
      throw err;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error('No content in Anthropic response');
    }

    // DIAG-056: capture raw LLM text BEFORE parseJsonResponse runs, so the
    // silent parse-error fallback (`{rawContent, parseError: true}` at
    // parseJsonResponse:1083-1090) cannot hide the actual emission shape.
    // Gated on plan_interpretation to avoid leaking workbook/sheet bodies.
    if (request.task === 'plan_interpretation') {
      console.log('[DIAG-LLM-RAW] Plan interpretation response:', JSON.stringify(content).substring(0, 3000));
    }

    // Parse JSON from response
    const result = this.parseJsonResponse(content);

    // OB-199 Phase 1 (DS-023 §5.4): single producer-side confidence normalization.
    // All `confidence` fields anywhere in the AIResponse payload (top-level,
    // result.confidence, result.components[i].confidence, and arbitrarily-nested
    // confidence fields) are normalized to ratio form before this adapter returns.
    // Rule: numeric confidence > 1 is divided by 100 (percentage → ratio);
    // values <= 1 pass through unchanged. No clamping. No floor at 0, no ceiling
    // at 1 — out-of-range values after normalization surface structurally at the
    // canonical writer per DS-023 §5.2.
    normalizeConfidenceFieldsInPlace(result);
    const confidence = typeof result.confidence === 'number' ? result.confidence : 0;

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
      model: resolvedModel, // OB-215: report the model actually sent so AIService telemetry is accurate
    };
  }

  // OB-212: tools-capable SINGLE turn for the agent runtime. Separate from
  // execute() (which serves the 20 single-call surfaces and is intentionally
  // left untouched). Same provider seam (one fetch to ANTHROPIC_API_URL), same
  // auth + retry + ProviderHardError discipline as execute(). The multi-turn
  // tool_use/tool_result loop lives in agent-runner; this returns the raw turn.
  async executeAgentTurn(req: AgentTurnRequest): Promise<AgentTurnResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // OB-215: the agent turn carries no AITaskType, so the model is the per-agent
    // override (req.model) or the env/default model. The shared body-builder sends no
    // `temperature` (none passed) — preserving the prior behavior (the current
    // default-tier models 400 on sampling params; omitting works across all tiers).
    const resolvedModel = req.model || defaultModel();
    const requestBody = this.buildRequestBody({
      model: resolvedModel,
      maxTokens: req.maxTokens || 4096,
      system: req.system,
      messages: req.messages,      // full multi-turn history (assistant + tool_result turns)
      tools: req.tools,            // <-- the only behavioral delta vs execute(): tools are sent
    });
    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };

    const MAX_RETRIES = 3;
    let response: Response | undefined;
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(ANTHROPIC_API_URL, { method: 'POST', headers: requestHeaders, body: requestBody });
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }

    if (!response) {
      const e = new Error(`Anthropic API fetch failed after ${MAX_RETRIES} attempts: ${lastError?.message}`) as ProviderHardError;
      e.providerError = true;
      e.providerModel = resolvedModel; // OB-215
      throw e;
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const e = new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errorData)}`) as ProviderHardError;
      e.providerError = true;
      e.status = response.status;
      e.providerModel = resolvedModel; // OB-215
      throw e;
    }

    const data = await response.json();
    return {
      content: Array.isArray(data.content) ? data.content : [],
      stopReason: data.stop_reason ?? null,
      tokenUsage: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 },
    };
  }

  // OB-215: the single request-body builder shared by execute() and executeAgentTurn().
  // It omits sampling params (temperature/top_p/top_k) for models that 400 on them
  // (Opus/Fable tier — modelRejectsSamplingParams), so the deprecation guard is written
  // ONCE. `tools` is included only when provided (the one structural delta between the
  // single-call and agent-turn bodies). Headers differ per method and stay at each site.
  private buildRequestBody(opts: {
    model: string;
    maxTokens: number;
    system: string;
    messages: unknown;
    temperature?: number;
    tools?: unknown;
  }): string {
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
    };
    // temperature:0 is the deterministic default every task relies on; omitting it where
    // the model rejects it is lossless (AUD-018 File B). Sonnet 4.6 keeps it.
    if (opts.temperature !== undefined && !modelRejectsSamplingParams(opts.model)) {
      body.temperature = opts.temperature;
    }
    if (opts.tools !== undefined) {
      body.tools = opts.tools;
    }
    return JSON.stringify(body);
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

CRITICAL: For each component, you MUST extract every numeric value the source document carries — every tier threshold, every payout amount, every cell of a rate table. Empty tiers/matrices will cause $0 payouts. The "calculationIntent" PrimeNode tree (defined in the system instructions) is the operative shape the engine consumes; "calculationMethod" is the free-form mirror the platform preserves alongside it.

REQUIRED RESPONSE SHAPE — return a JSON object with these top-level fields. The "components" array MUST contain at least one entry when the document describes a compensation plan; emit one component per distinct payout structure:

{
  "ruleSetName": "Name of the plan, verbatim from the document title or header",
  "ruleSetNameEs": "Spanish name if present, otherwise omit",
  "description": "Brief description",
  "currency": "MXN or USD",
  "cadence": "monthly | biweekly | weekly | quarterly | annual",
  "employeeTypes": [
    { "id": "stable-id-1", "name": "Role name verbatim", "nameEs": "..." }
  ],
  "components": [
    {
      "id": "unique-id-1",
      "name": "Component name verbatim from the document",
      "nameEs": "Spanish name if present",
      "type": "prime_dag",
      "appliesToEmployeeTypes": ["stable-id-1"] or ["all"],
      "calculationIntent": {
        // PrimeNode tree per the CALCULATION INTENT grammar in the system instructions.
        // ROOT must be one of the ten primes. Use scale-annotated constants in compare
        // positions. Use conditional+compare+logical(and) for half-open tier ranges.
        "prime": "...",
        "...": "..."
      },
      "calculationMethod": {
        // Free-form descriptive mirror — type matches "type" above ("prime_dag").
        // Optional summary fields helpful for humans reading the rule_set.
        "type": "prime_dag"
      },
      "rateTableCellCount": 30,   // OMIT when no rate table. Integer total cells: 1D N tiers = N; 2D N×M = N*M.
      "confidence": 0-100,
      "reasoning": "How you extracted this component"
    }
  ],
  "requiredInputs": [
    { "field": "field_name", "description": "what it measures", "scope": "employee|store", "dataType": "number|percentage|currency" }
  ],
  "workedExamples": [
    { "employeeType": "stable-id-1", "inputs": {}, "expectedTotal": 0, "componentBreakdown": {} }
  ],
  "confidence": 0-100,
  "reasoning": "Overall analysis reasoning"
}

If the document does not contain a compensation plan, return components: [] and set ruleSetName / reasoning to explain why. Do NOT return an empty components array for a document that DOES describe a plan — extract whatever components are visible.`;
      }

      case 'plan_skeleton': {
        // HF-248 Phase A: plan-level structure + component index only.
        const isPdfDocument = !!input.pdfBase64;
        const contentSection = isPdfDocument
          ? 'The compensation plan document has been provided above. Analyze it thoroughly.'
          : `DOCUMENT CONTENT:\n---\n${input.content}\n---\nFormat: ${input.format}`;
        return `Analyze the following compensation plan document. PHASE A: emit plan-level structure and a COMPONENT INDEX only — do NOT emit calculationIntent or calculationMethod, those come in per-component calls.

${contentSection}

Return JSON per the schema in the system instructions.`;
      }

      case 'plan_component': {
        // HF-248 Phase B: emit one component's calculationIntent. Caller
        // supplies the component id/name/briefSemantic/rateTableCellCount in
        // input.componentSpec; the plan content gives the LLM the source of
        // truth for tier/matrix values.
        const isPdfDocument = !!input.pdfBase64;
        const contentSection = isPdfDocument
          ? 'The compensation plan document has been provided above. Analyze it thoroughly.'
          : `DOCUMENT CONTENT:\n---\n${input.content}\n---\nFormat: ${input.format}`;
        const spec = (input.componentSpec ?? {}) as Record<string, unknown>;
        const compId = String(spec.id ?? '');
        const compName = String(spec.name ?? '');
        const compNameEs = spec.nameEs ? String(spec.nameEs) : null;
        const briefSemantic = String(spec.briefSemantic ?? '');
        const rateCells = typeof spec.rateTableCellCount === 'number' ? spec.rateTableCellCount : null;
        const appliesTo = Array.isArray(spec.appliesToEmployeeTypes)
          ? (spec.appliesToEmployeeTypes as unknown[]).map(String)
          : [];
        // HF-272: informational field-context hint ONLY (a hint, not a gate; T1-E902).
        // Built verbatim from the threaded HC-of-data-sheets set (real runtime comprehension
        // of the columns physically present in THIS import). The HF-270 enforcement language
        // ("a deterministic post-construction check enforces membership and will reject an
        // unresolved reference") was REMOVED with the gate (AUD-009): this block no longer
        // constrains the LLM's naming. Recognition follows the plan; the platform maps the
        // named fields to real data columns at calculation time (convergence). When the set
        // is empty (plan-only import, no data sheet) the block is ABSENT — no fallback, no
        // enumerated list. Korean Test: the list is runtime HC output, never a synonym table.
        const fieldAnchor = Array.isArray(input.fieldAnchor)
          ? (input.fieldAnchor as Array<{ field?: unknown; meaning?: unknown; role?: unknown }>)
          : [];
        const comprehendedFieldsBlock = fieldAnchor.length > 0
          ? `\nFOR CONTEXT, the imported data contains these columns (informational — does NOT constrain your naming):\n${fieldAnchor
              .map(f => `  ${String(f.field ?? '')} — ${String(f.meaning ?? '')} (${String(f.role ?? '')})`)
              .join('\n')}\n\nRecognize the plan's structure and name each field per the PLAN (match by SEMANTIC MEANING, not string similarity). The platform maps your named fields to the actual data columns at calculation time — you do not need to pick from the list above, and naming a field the plan describes that is not listed is fine.\n`
          : '';
        // HF-280: verbatim retry feedback. When a prior attempt at THIS component was
        // rejected (e.g. by the HF-279 coherence invariant), the orchestrator forwards
        // the structured error here so the model receives WHAT was violated and can
        // correct it — without this an identical temperature-0 prompt re-emits the same
        // violation. Pass-through: the error text carries its own specifics; this frame
        // is cause-agnostic (no per-cause template — Korean Test).
        const retryFeedback = typeof input.retryFeedback === 'string' ? input.retryFeedback.trim() : '';
        const retryFeedbackBlock = retryFeedback
          ? `\nYOUR PREVIOUS ATTEMPT AT THIS COMPONENT WAS REJECTED by deterministic validation. Read the error, fix exactly what it names, and emit a corrected intent. The structured error was:\n---\n${retryFeedback}\n---\n`
          : '';
        return `Translate the following plan COMPONENT into a Prime-DAG calculationIntent tree. PHASE B: emit this component only.

${contentSection}
${comprehendedFieldsBlock}${retryFeedbackBlock}
COMPONENT TO EMIT:
  id: ${compId}
  name: ${compName}${compNameEs ? `\n  nameEs: ${compNameEs}` : ''}
  appliesToEmployeeTypes: ${JSON.stringify(appliesTo)}
  briefSemantic: ${briefSemantic}${rateCells !== null ? `\n  rateTableCellCount: ${rateCells}  (the validator REJECTS trees with fewer than ${rateCells} constant leaves)` : ''}

Return JSON per the response shape in the system instructions. Emit ONLY this component — do not include other components in the response.`;
      }

      case 'plan_component_with_chunking': {
        // HF-249: emit component as skeleton + chunks for large structures.
        // Same input shape as plan_component (componentSpec with id/name/
        // briefSemantic/rateTableCellCount); the system prompt teaches the
        // skeleton-with-references shape. Backward compatible: small
        // components emit a complete tree with empty `chunks` object.
        const isPdfDocument = !!input.pdfBase64;
        const contentSection = isPdfDocument
          ? 'The compensation plan document has been provided above. Analyze it thoroughly.'
          : `DOCUMENT CONTENT:\n---\n${input.content}\n---\nFormat: ${input.format}`;
        const spec = (input.componentSpec ?? {}) as Record<string, unknown>;
        const compId = String(spec.id ?? '');
        const compName = String(spec.name ?? '');
        const compNameEs = spec.nameEs ? String(spec.nameEs) : null;
        const briefSemantic = String(spec.briefSemantic ?? '');
        const rateCells = typeof spec.rateTableCellCount === 'number' ? spec.rateTableCellCount : null;
        const appliesTo = Array.isArray(spec.appliesToEmployeeTypes)
          ? (spec.appliesToEmployeeTypes as unknown[]).map(String)
          : [];
        return `Translate the following plan COMPONENT into a Prime-DAG calculationIntent tree. Use SKELETON-WITH-REFERENCES emission if the tree would exceed budget; otherwise emit the complete tree directly.

${contentSection}

COMPONENT TO EMIT:
  id: ${compId}
  name: ${compName}${compNameEs ? `\n  nameEs: ${compNameEs}` : ''}
  appliesToEmployeeTypes: ${JSON.stringify(appliesTo)}
  briefSemantic: ${briefSemantic}${rateCells !== null ? `\n  rateTableCellCount: ${rateCells}  (the assembler + validator REJECT trees whose total assembled leaves are fewer than ${rateCells})` : ''}

Return JSON per the response shape in the system instructions. Emit ONLY this component. If chunking is used, every $ref in calculationIntent (or in any chunk) MUST appear as a key in the chunks object.`;
      }

      case 'plan_chunk': {
        // HF-249 multi-call fallback: emit one sub-tree chunk identified by
        // chunkId, in the context of the parent component. Caller supplies
        // chunkSpec with chunkId + parentComponentName + parentBriefSemantic
        // + skeletonPath (the position the chunk fills in the parent skeleton).
        const isPdfDocument = !!input.pdfBase64;
        const contentSection = isPdfDocument
          ? 'The compensation plan document has been provided above. Analyze it thoroughly.'
          : `DOCUMENT CONTENT:\n---\n${input.content}\n---\nFormat: ${input.format}`;
        const cs = (input.chunkSpec ?? {}) as Record<string, unknown>;
        const chunkId = String(cs.chunkId ?? '');
        const parentName = String(cs.parentComponentName ?? '');
        const parentSemantic = String(cs.parentBriefSemantic ?? '');
        const skeletonPath = String(cs.skeletonPath ?? '');
        return `Emit ONE sub-tree of the parent component's Prime-DAG calculationIntent. This is the MULTI-CALL FALLBACK path.

${contentSection}

CHUNK TO EMIT:
  chunkId: ${chunkId}
  parentComponent: ${parentName}
  parentBriefSemantic: ${parentSemantic}
  skeletonPath: ${skeletonPath}

The skeletonPath describes where in the parent skeleton this chunk fills (e.g., "\$.then.else.then"). The chunk is a self-contained sub-tree, not a fragment. Return JSON per the response shape in the system instructions.`;
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
    } catch (parseErr) {
      // HF-247 Phase 3: parse failure surfaces as both `parseError` (existing
      // diagnostic flag) AND `error` (the field the SCI guard at
      // plan-interpretation.ts:156-167 actually checks). Pre-HF-247 only
      // `parseError` was set, so the guard never fired and a corrupted
      // rule_set persisted with components: [] and ruleSetName: "Unnamed Plan".
      // Carry Everything Express Contextually (T1-E902 v2): failure modes
      // are signal, not coerced into success-shaped output.
      const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return {
        rawContent: content,
        parseError: true,
        error: `JSON parse failed: ${message}`,
        confidence: 0,
      };
    }
  }
}
