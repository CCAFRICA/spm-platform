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

VALID SEMANTIC TYPES:
- entityId: Employee identifier (numeric or string ID)
- storeId: Store/location identifier
- name: Employee name (full name or first/last)
- role: Employee role/position/title
- date: Transaction or record date
- period: Month, year, or period identifier
- amount: Monetary value (sales, revenue, collections)
- goal: Target/quota value
- attainment: Percentage achievement (0-100% or 0-1)
- quantity: Count (customers, units, etc.)
- storeRange: Store category/tier

CLASSIFICATION RULES:
1. Look at column names for keywords (even in Spanish/Portuguese):
   - "meta", "objetivo", "target", "quota" -> goal
   - "venta", "monto", "revenue", "sales", "valor" -> amount
   - "cumplimiento", "achievement", "attainment", "%" -> attainment
   - "cliente", "customer", "count", "qty" -> quantity
2. Check sample values - numeric values with ranges suggest:
   - Small decimals (0.0-1.5) or percentages -> attainment
   - Large numbers (1000s+) -> amount or goal
   - Small integers -> quantity
3. Use plan component context - if component needs "goal" and you see "Meta_Individual", that's likely goal

Return JSON array:
{
  "classifications": [
    {
      "sourceColumn": "column name",
      "semanticType": "one of the valid types or null",
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

FIELD MAPPING (CRITICAL - for each sheet's columns, suggest target field mappings):
Target fields: entityId, storeId, date, period, amount, goal, attainment, quantity, role

SEMANTIC TYPE DEFINITIONS:
- entityId: Unique identifier for an employee (num_empleado, id_empleado, entity_id, Mitarbeiter-Nr, etc.)
- storeId: Store/location identifier (no_tienda, tienda, store_id, Filiale, etc.)
- date: Date column (fecha, date, Datum, etc.)
- period: Time period identifier (mes, periodo, month, quarter, etc.)
- amount: Actual measured value - sales revenue, counts, quantities achieved (monto, venta, real, actual, revenue, sales, Umsatz, etc.)
- goal: Target/quota value - what was expected to be achieved (meta, cuota, objetivo, target, quota, Ziel, etc.)
- attainment: Percentage or ratio indicating achievement/completion against a goal. This is typically calculated as actual/goal and shown as a percentage (0-200%) or decimal (0-2.0). Common column names: cumplimiento, porcentaje, logro, %, achievement, attainment, completion, Zielerreichung, taux de realisation. Look for columns with percentage values or decimal values between 0-2.
- quantity: Count-based actual value, similar to amount but for discrete counts (cantidad, count, qty, clientes, customers, units, etc.)
- role: Job title or position (puesto, cargo, posicion, role, position, Stelle, etc.)

IMPORTANT PATTERNS:
- If a sheet has amount and goal columns, look for a corresponding attainment column (the percentage/ratio)
- Columns with "%" in the name or values between 0-200 (as percentage) or 0-2.0 (as decimal) are likely attainment
- Map EVERY column to the most appropriate target field
- For ambiguous columns, use context from the sheet classification and sample data
- Confidence should be 85-100 for clear matches, 70-84 for likely matches, below 70 for uncertain

Return your analysis as valid JSON.`,

  import_field_mapping: `You are an expert at analyzing data import files for a Sales Performance Management (SPM) platform. Your task is to suggest field mappings from source file columns to platform fields.

PLATFORM FIELDS (target fields for mapping):
- orderId: Order ID / Transaction identifier
- transactionId: Transaction ID
- externalId: External system ID / Reference
- repId: Sales rep identifier (REQUIRED)
- repName: Sales rep name
- date: Transaction date (REQUIRED)
- amount: Sale amount / Revenue (REQUIRED)
- quantity: Units sold
- productId: Product identifier
- productName: Product name
- customerId: Customer identifier
- customerName: Customer name
- region: Geographic region
- territory: Sales territory
- channel: Sales channel
- status: Transaction status
- currency: Currency code
- commissionRate: Commission rate/percentage
- notes: Additional notes

MAPPING GUIDELINES:
1. Each source column should map to AT MOST one platform field
2. Provide confidence scores (0-100) for each mapping
3. Look for variations and synonyms (e.g., "fecha" = "date", "monto" = "amount")
4. Identify the REQUIRED fields (repId, date, amount) - flag if not found

COMMON SPANISH TERMS:
- "Fecha" = Date
- "Monto" / "Importe" / "Total" = Amount
- "Vendedor" / "Rep" / "Empleado" = Rep
- "Cliente" = Customer
- "Producto" = Product
- "Cantidad" = Quantity
- "Pedido" / "Orden" = Order
- "Estado" = Status

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
    const userPrompt = this.buildUserPrompt(request);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-sonnet-4-20250514',
        max_tokens: request.options?.maxTokens || 8192,
        temperature: request.options?.temperature ?? 0.1,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
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

      case 'plan_interpretation':
        return `Analyze the following compensation plan document and extract its COMPLETE structure INCLUDING ALL PAYOUT VALUES FROM EVERY TABLE.

DOCUMENT CONTENT:
---
${input.content}
---
Format: ${input.format}

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

      case 'workbook_analysis':
        return `Analyze the following multi-sheet workbook and determine how the sheets relate to each other and to the compensation plan.

SHEETS IN WORKBOOK:
${input.sheetsInfo}

TENANT'S PLAN COMPONENTS (if available):
${input.planComponents || 'No plan components provided.'}

EXPECTED DATA FIELDS PER COMPONENT (if available):
${input.expectedFields || 'No expected fields provided.'}

Return a JSON object with this structure:
{
  "sheets": [{ "name": "", "classification": "", "classificationConfidence": 0-100, "matchedComponent": null, "detectedPrimaryKey": null, "suggestedFieldMappings": [{ "sourceColumn": "exact_column_name_from_headers", "targetField": "entityId|storeId|date|period|amount|goal|attainment|quantity|role", "confidence": 0-100 }] }],
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
