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
9. Use plan component context — if component needs "goal" and you see "Meta_Individual", that's likely amount (goal).
10. Keywords (Spanish/Portuguese): "meta"/"objetivo" → amount (goal), "venta"/"monto" → amount, "cumplimiento" → achievement_pct, "cliente"/"count" → quantity

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

NUMERIC PARSING RULES:
- Currency: Remove $ and commas. "$1,500" or "$1.500" -> 1500 (handle both comma and period as thousand separator)
- Percentages in ranges: "80% a menos de 90%" -> { min: 80, max: 90 }
- Open ranges: ">=110%" -> { min: 110, max: 999999 }, "<80%" -> { min: 0, max: 80 }
- Large numbers: "$60k" -> 60000, "$180K" -> 180000

IMPORTANT GUIDELINES:
1. Documents may be in Spanish, English, or mixed languages. Preserve original language labels.
2. Extract worked examples if present - these are critical for validation.
3. Return confidence scores (0-100) for each component and overall.
4. If a table has different values for different employee types (e.g., Certified vs Non-Certified), create SEPARATE components for each.

COMMON SPANISH TERMS:
- "% cumplimiento" = "% attainment"
- "Venta de..." = "Sales of..."
- "Meta" = "Goal/Target"
- "Tienda" = "Store"
- "Clientes Nuevos" = "New Customers"
- "Cobranza" = "Collections"
- "Seguros" = "Insurance"
- "Servicios/Garantia Extendida" = "Warranty/Extended Services"
- "Menos de" = "Less than"
- "o mas" = "or more"

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

MAPPING RULES:
- tiered_lookup → bounded_lookup_1d with metric input, boundaries from tiers, outputs from tier values
- matrix_lookup → bounded_lookup_2d with metric inputs, row/column boundaries from bands, outputGrid from values matrix
- flat_percentage → scalar_multiply with metric input and rate
- conditional_percentage → nested conditional_gate chain (check conditions in order, scalar_multiply with rate on match)

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
- Spanish column names are common: num_empleado, No_Tienda, Fecha_Corte
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

    const systemPrompt = SYSTEM_PROMPTS[request.task];

    // Build message content — supports both plain text and document blocks (PDF)
    const pdfBase64 = request.input.pdfBase64 as string | undefined;
    const pdfMediaType = (request.input.pdfMediaType as string) || 'application/pdf';
    let messageContent: unknown;

    if (pdfBase64 && request.task === 'plan_interpretation') {
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

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
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
      }),
    });

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
    const confidence = (result.confidence as number) / 100 || 0.5;

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
  "employeeTypes": [
    { "id": "certified", "name": "Optometrista Certificado", "nameEs": "..." },
    { "id": "non_certified", "name": "Optometrista No Certificado", "nameEs": "..." }
  ],
  "components": [
    {
      "id": "unique-id",
      "name": "Component Name",
      "nameEs": "Spanish name",
      "type": "matrix_lookup | tiered_lookup | percentage | flat_percentage | conditional_percentage",
      "appliesToEmployeeTypes": ["certified"] or ["all"],
      "calculationMethod": {
        // For matrix_lookup: include rowAxis.ranges[], columnAxis.ranges[], values[][]
        // For tiered_lookup: include tiers[] with min, max, payout for EACH tier
        // For percentage/flat_percentage: include rate (as decimal) and metric
        // For conditional_percentage: include conditions[] and metric
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
