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

  plan_interpretation: `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content.

CRITICAL REQUIREMENTS:
1. Extract EVERY distinct compensation component - do NOT merge similar components
2. Each table, each metric, each KPI with its own payout structure is a SEPARATE component
3. Detect ALL employee types/classifications if the document has different payout levels for different roles

IMPORTANT GUIDELINES:
1. Documents may be in Spanish, English, or mixed languages. Preserve original language labels where found.
2. Look for tables (matrices or single-column tiers), percentage mentions, and conditional rules.
3. Identify whether metrics are per-employee, per-store, or per-company scope.
4. Extract worked examples if present - these are critical for validation.
5. Return confidence scores (0-100) for each component and overall.
6. If something is ambiguous, flag it in the reasoning rather than guessing.

COMMON SPANISH TERMS:
- "% cumplimiento" = "% attainment"
- "Venta de..." = "Sales of..."
- "Meta" = "Goal/Target"
- "Tienda" = "Store"
- "Clientes Nuevos" = "New Customers"
- "Cobranza" = "Collections"
- "Seguros" = "Insurance"
- "Servicios/Garantia Extendida" = "Warranty/Extended Services"

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
- Look for shared column names across sheets (e.g., employee_id, store_id, period)
- Spanish column names are common: num_empleado, No_Tienda, Fecha_Corte
- Detect primary keys and foreign key relationships
- Identify if one sheet references another

FIELD MAPPING (CRITICAL - for each sheet's columns, suggest target field mappings):
Target fields: employeeId, storeId, date, period, amount, goal, attainment, quantity, role
- Map EVERY column to the most appropriate target field
- Spanish terms: num_empleado/id_empleado -> employeeId, no_tienda/tienda -> storeId, fecha -> date, monto/venta -> amount, meta/cuota -> goal, puesto/cargo -> role
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
        max_tokens: request.options?.maxTokens || 4000,
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
        return `Analyze the following compensation plan document and extract its COMPLETE structure.

DOCUMENT CONTENT:
---
${input.content}
---
Format: ${input.format}

Return a JSON object with:
{
  "planName": "Name of the plan",
  "description": "Brief description",
  "currency": "USD or MXN",
  "employeeTypes": [...],
  "components": [...],
  "requiredInputs": [...],
  "workedExamples": [...],
  "confidence": 0-100,
  "reasoning": "Overall reasoning"
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
  "sheets": [{ "name": "", "classification": "", "classificationConfidence": 0-100, "matchedComponent": null, "detectedPrimaryKey": null, "suggestedFieldMappings": [{ "sourceColumn": "exact_column_name_from_headers", "targetField": "employeeId|storeId|date|period|amount|goal|attainment|quantity|role", "confidence": 0-100 }] }],
  "relationships": [{ "fromSheet": "", "toSheet": "", "relationshipType": "", "sharedKeys": [], "confidence": 0-100 }],
  "rosterDetected": { "found": false, "sheetName": null, "employeeIdColumn": null },
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
