/**
 * AI-Powered Plan Interpreter
 *
 * Uses Anthropic Claude API to intelligently interpret commission plan documents.
 * Handles any format (PPTX, CSV, Excel, PDF text) and any language (Spanish, English, mixed).
 */

// ============================================
// TYPES
// ============================================

export interface AxisRange {
  min: number;
  max: number;
  label: string;
  labelEs?: string;
}

export interface MatrixCalculation {
  type: 'matrix_lookup';
  rowAxis: {
    metric: string;
    label: string;
    labelEs?: string;
    ranges: AxisRange[];
  };
  columnAxis: {
    metric: string;
    label: string;
    labelEs?: string;
    ranges: AxisRange[];
  };
  values: number[][];
}

export interface TieredCalculation {
  type: 'tiered_lookup';
  metric: string;
  metricLabel?: string;
  tiers: {
    min: number;
    max: number;
    label?: string;
    payout: number;
  }[];
}

export interface PercentageCalculation {
  type: 'percentage' | 'flat_percentage';
  metric: string;
  metricLabel?: string;
  rate: number;
}

export interface ConditionalPercentageCalculation {
  type: 'conditional_percentage';
  metric: string;
  metricLabel?: string;
  conditionMetric: string;
  conditionMetricLabel?: string;
  conditions: {
    threshold: number;
    operator: '<' | '<=' | '>' | '>=' | '==' | 'between';
    maxThreshold?: number;
    rate: number;
    label?: string;
  }[];
}

export type ComponentCalculation =
  | MatrixCalculation
  | TieredCalculation
  | PercentageCalculation
  | ConditionalPercentageCalculation;

export interface InterpretedComponent {
  id: string;
  name: string;
  nameEs?: string;
  type: ComponentCalculation['type'];
  appliesToEmployeeTypes: string[];
  calculationMethod: ComponentCalculation;
  confidence: number;
  reasoning: string;
}

export interface EmployeeType {
  id: string;
  name: string;
  nameEs?: string;
  eligibilityCriteria?: Record<string, unknown>;
}

export interface RequiredInput {
  field: string;
  description: string;
  descriptionEs?: string;
  scope: 'employee' | 'store' | 'company';
  dataType: 'number' | 'percentage' | 'currency';
}

export interface WorkedExample {
  employeeType: string;
  inputs: Record<string, number>;
  expectedTotal: number;
  componentBreakdown: Record<string, number>;
}

export interface PlanInterpretation {
  planName: string;
  planNameEs?: string;
  description: string;
  descriptionEs?: string;
  currency: string;
  employeeTypes: EmployeeType[];
  components: InterpretedComponent[];
  requiredInputs: RequiredInput[];
  workedExamples: WorkedExample[];
  confidence: number;
  reasoning: string;
  rawApiResponse?: string;
}

export interface AIInterpreterConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

// ============================================
// API PROMPT
// ============================================

const SYSTEM_PROMPT = `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content.

CRITICAL REQUIREMENTS:
1. Extract EVERY distinct compensation component - do NOT merge similar components
2. Each table, each metric, each KPI with its own payout structure is a SEPARATE component
3. Detect ALL employee types/classifications if the document has different payout levels for different roles

IMPORTANT GUIDELINES:
1. Documents may be in Spanish, English, or mixed languages. Preserve original language labels where found.
2. Look for tables (matrices or single-column tiers), percentage mentions, and conditional rules.
3. Identify whether metrics are per-employee, per-store, or per-company scope.
4. Extract worked examples if present — these are critical for validation.
5. Return confidence scores (0-100) for each component and overall.
6. If something is ambiguous, flag it in the reasoning rather than guessing.

COMPONENT DETECTION RULES:
- Each slide or section with a distinct title/header is likely a separate component
- Each table measuring a DIFFERENT metric is a SEPARATE component (even if similar structure)
- Common component types in retail plans:
  * Optical/Product Sales (often a 2D matrix with attainment % and sales volume)
  * Store Sales Attainment (tiered lookup based on store goal %)
  * New Customers (tiered lookup based on customer acquisition %)
  * Collections/Cobranza (tiered lookup based on collection goal %)
  * Insurance/Seguros Sales (percentage of individual sales, may be conditional)
  * Warranty/Servicios Sales (flat percentage of individual sales)
- DO NOT combine "New Customers" and "Collections" into one component - they are separate
- DO NOT combine any tiered lookups just because they have similar tier structures

EMPLOYEE TYPE DETECTION:
- Look for phrases like "Certificado/Certified", "No Certificado/Non-Certified", "Senior", "Junior"
- Look for different payout matrices or values for different employee classifications
- If a component shows TWO different payout tables (e.g., one labeled for certified, one for non-certified), create TWO employee types
- Components that are the same for all employee types should have appliesToEmployeeTypes: ["all"]
- Components that differ should specify which employee type they apply to

PAY ATTENTION TO:
- Matrix lookups: Two-dimensional tables where payout depends on two metrics (row and column)
- Tiered lookups: Single-dimension tables with thresholds and corresponding payouts
- Percentage calculations: Rate applied to a base amount
- Conditional percentages: Rate varies based on another metric's value

COMMON SPANISH TERMS:
- "% cumplimiento" = "% attainment"
- "Venta de..." = "Sales of..."
- "Meta" = "Goal/Target"
- "Tienda" = "Store"
- "Clientes Nuevos" = "New Customers"
- "Cobranza" = "Collections"
- "Seguros" = "Insurance"
- "Servicios/Garantía Extendida" = "Warranty/Extended Services"

Return your analysis as valid JSON matching the specified schema.`;

const USER_PROMPT_TEMPLATE = `Analyze the following compensation plan document and extract its COMPLETE structure.

IMPORTANT:
- Extract ALL distinct components (typically 4-8 components in a retail plan)
- Each metric/KPI with its own payout table is a SEPARATE component
- Detect if there are multiple employee types with different payout levels

DOCUMENT CONTENT:
---
{CONTENT}
---

Return a JSON object with this exact structure:
{
  "planName": "Name of the plan in English",
  "planNameEs": "Name in Spanish if found",
  "description": "Brief description of the plan",
  "descriptionEs": "Description in Spanish if found",
  "currency": "USD" or "MXN" or other currency code,
  "employeeTypes": [
    {
      "id": "unique-slug-id",
      "name": "Employee Type Name",
      "nameEs": "Spanish name if found",
      "eligibilityCriteria": { "key": "value" }
    }
  ],
  "components": [
    {
      "id": "unique-component-id",
      "name": "Component Name",
      "nameEs": "Spanish name if found",
      "type": "matrix_lookup | tiered_lookup | percentage | flat_percentage | conditional_percentage",
      "appliesToEmployeeTypes": ["all"] or ["specific-type-id"],
      "calculationMethod": {
        // Structure depends on type - see below
      },
      "confidence": 0-100,
      "reasoning": "Why this component was identified this way"
    }
  ],
  "requiredInputs": [
    {
      "field": "metric_name",
      "description": "What this input represents",
      "descriptionEs": "Spanish description",
      "scope": "employee | store | company",
      "dataType": "number | percentage | currency"
    }
  ],
  "workedExamples": [
    {
      "employeeType": "type-id",
      "inputs": { "metric_name": value },
      "expectedTotal": number,
      "componentBreakdown": { "component-id": value }
    }
  ],
  "confidence": 0-100,
  "reasoning": "Overall reasoning about the plan interpretation"
}

CALCULATION METHOD STRUCTURES:

For matrix_lookup:
{
  "type": "matrix_lookup",
  "rowAxis": {
    "metric": "metric_field_name",
    "label": "Row Axis Label",
    "labelEs": "Spanish label",
    "ranges": [
      { "min": 0, "max": 80, "label": "<80%" },
      { "min": 80, "max": 90, "label": "80%-90%" }
    ]
  },
  "columnAxis": {
    "metric": "metric_field_name",
    "label": "Column Axis Label",
    "ranges": [
      { "min": 0, "max": 60000, "label": "<$60k" }
    ]
  },
  "values": [[0, 0, 0], [100, 200, 300]]  // 2D grid matching row x column
}

For tiered_lookup:
{
  "type": "tiered_lookup",
  "metric": "metric_field_name",
  "metricLabel": "Metric Label",
  "tiers": [
    { "min": 0, "max": 100, "payout": 0, "label": "<100%" },
    { "min": 100, "max": 105, "payout": 150, "label": "100%-105%" }
  ]
}

For percentage/flat_percentage:
{
  "type": "percentage",
  "metric": "metric_to_apply_rate_to",
  "metricLabel": "What this metric represents",
  "rate": 0.04  // 4% as decimal
}

For conditional_percentage:
{
  "type": "conditional_percentage",
  "metric": "metric_to_apply_rate_to",
  "metricLabel": "Base amount description",
  "conditionMetric": "metric_that_determines_rate",
  "conditionMetricLabel": "Condition description",
  "conditions": [
    { "threshold": 100, "operator": "<", "rate": 0.03, "label": "<100%" },
    { "threshold": 100, "operator": ">=", "rate": 0.05, "label": ">=100%" }
  ]
}

Analyze the document thoroughly and return the complete JSON structure.`;

// ============================================
// AI INTERPRETER CLASS
// ============================================

export class AIPlainInterpreter {
  private apiKey: string | null;
  private model: string;
  private maxTokens: number;

  constructor(config: AIInterpreterConfig = {}) {
    this.apiKey = config.apiKey || this.getApiKey();
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 8000;
  }

  private getApiKey(): string | null {
    // Read from environment variable only
    // In Next.js, server-side env vars are available via process.env
    // For client-side, we need to use NEXT_PUBLIC_ prefix or call an API route
    if (typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY) {
      return process.env.ANTHROPIC_API_KEY;
    }

    return null;
  }

  public isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Interpret a plan document using Claude API
   */
  public async interpretPlan(documentContent: string): Promise<PlanInterpretation> {
    if (!this.isConfigured()) {
      throw new Error(
        'AI plan interpretation is not configured. Contact platform administrator.'
      );
    }

    console.log('\n========== AI INTERPRETER DEBUG ==========');
    console.log('Document content length:', documentContent.length, 'chars');
    console.log('Model:', this.model);
    console.log('Max tokens:', this.maxTokens);

    const userPrompt = USER_PROMPT_TEMPLATE.replace('{CONTENT}', documentContent);
    console.log('User prompt length:', userPrompt.length, 'chars');

    try {
      console.log('Calling Anthropic API...');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: SYSTEM_PROMPT,
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
        console.error('API error:', response.status, errorData);
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}. ${
            errorData.error?.message || ''
          }`
        );
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      console.log('\n========== RAW AI RESPONSE ==========');
      console.log('Response length:', content?.length || 0, 'chars');
      console.log('Full response:');
      console.log(content);
      console.log('======================================\n');

      if (!content) {
        throw new Error('No content in API response');
      }

      // Parse the JSON response
      const interpretation = this.parseApiResponse(content);
      interpretation.rawApiResponse = content;

      console.log('\n========== PARSED INTERPRETATION ==========');
      console.log('Plan name:', interpretation.planName);
      console.log('Employee types:', interpretation.employeeTypes.length);
      interpretation.employeeTypes.forEach((et, i) => {
        console.log(`  ${i + 1}. ${et.name} (${et.id})`);
      });
      console.log('Components:', interpretation.components.length);
      interpretation.components.forEach((comp, i) => {
        console.log(`  ${i + 1}. ${comp.name} (${comp.type}) - ${comp.confidence}% confidence`);
        console.log(`     Calculation method:`, JSON.stringify(comp.calculationMethod).substring(0, 200));
      });
      console.log('Worked examples:', interpretation.workedExamples.length);
      console.log('Overall confidence:', interpretation.confidence);
      console.log('============================================\n');

      return interpretation;
    } catch (error) {
      console.error('AI interpretation error:', error);
      throw error;
    }
  }

  /**
   * Parse the API response JSON
   */
  private parseApiResponse(content: string): PlanInterpretation {
    // Try to extract JSON from the response
    let jsonStr = content;

    // Handle markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed);
    } catch (parseError) {
      console.error('Failed to parse API response:', parseError);
      console.error('Raw content:', content);

      // Return a minimal interpretation with the error
      return {
        planName: 'Unrecognized Plan',
        description: 'Failed to parse AI response. Manual configuration required.',
        currency: 'USD',
        employeeTypes: [],
        components: [],
        requiredInputs: [],
        workedExamples: [],
        confidence: 0,
        reasoning: `Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Raw response available for debugging.`,
        rawApiResponse: content,
      };
    }
  }

  /**
   * Validate and normalize the parsed response
   */
  private validateAndNormalize(parsed: Record<string, unknown>): PlanInterpretation {
    return {
      planName: String(parsed.planName || 'Unnamed Plan'),
      planNameEs: parsed.planNameEs ? String(parsed.planNameEs) : undefined,
      description: String(parsed.description || ''),
      descriptionEs: parsed.descriptionEs ? String(parsed.descriptionEs) : undefined,
      currency: String(parsed.currency || 'USD').toUpperCase(),
      employeeTypes: this.normalizeEmployeeTypes(parsed.employeeTypes),
      components: this.normalizeComponents(parsed.components),
      requiredInputs: this.normalizeRequiredInputs(parsed.requiredInputs),
      workedExamples: this.normalizeWorkedExamples(parsed.workedExamples),
      confidence: Number(parsed.confidence) || 0,
      reasoning: String(parsed.reasoning || ''),
    };
  }

  private normalizeEmployeeTypes(types: unknown): EmployeeType[] {
    if (!Array.isArray(types)) return [];

    return types.map((t, index) => ({
      id: String(t.id || `employee-type-${index}`),
      name: String(t.name || `Type ${index + 1}`),
      nameEs: t.nameEs ? String(t.nameEs) : undefined,
      eligibilityCriteria: t.eligibilityCriteria as Record<string, unknown> | undefined,
    }));
  }

  private normalizeComponents(components: unknown): InterpretedComponent[] {
    if (!Array.isArray(components)) return [];

    return components.map((c, index) => {
      const comp: InterpretedComponent = {
        id: String(c.id || `component-${index}`),
        name: String(c.name || `Component ${index + 1}`),
        nameEs: c.nameEs ? String(c.nameEs) : undefined,
        type: this.normalizeComponentType(c.type),
        appliesToEmployeeTypes: Array.isArray(c.appliesToEmployeeTypes)
          ? c.appliesToEmployeeTypes.map(String)
          : ['all'],
        calculationMethod: this.normalizeCalculationMethod(c.type, c.calculationMethod),
        confidence: Number(c.confidence) || 50,
        reasoning: String(c.reasoning || ''),
      };
      return comp;
    });
  }

  private normalizeComponentType(type: unknown): ComponentCalculation['type'] {
    const validTypes = [
      'matrix_lookup',
      'tiered_lookup',
      'percentage',
      'flat_percentage',
      'conditional_percentage',
    ];
    const typeStr = String(type || 'tiered_lookup');
    return validTypes.includes(typeStr) ? (typeStr as ComponentCalculation['type']) : 'tiered_lookup';
  }

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

      default:
        return {
          type: 'tiered_lookup',
          metric: 'metric',
          tiers: [],
        };
    }
  }

  private normalizeRanges(ranges: unknown): AxisRange[] {
    if (!Array.isArray(ranges)) return [];
    return ranges.map((r) => ({
      min: Number(r.min) || 0,
      max: r.max === Infinity || r.max === 'Infinity' ? Infinity : Number(r.max) || 100,
      label: String(r.label || ''),
      labelEs: r.labelEs ? String(r.labelEs) : undefined,
    }));
  }

  private normalizeMatrix(values: unknown): number[][] {
    if (!Array.isArray(values)) return [];
    return values.map((row) => {
      if (!Array.isArray(row)) return [];
      return row.map((v) => Number(v) || 0);
    });
  }

  private normalizeTiers(tiers: unknown): TieredCalculation['tiers'] {
    if (!Array.isArray(tiers)) return [];
    return tiers.map((t) => ({
      min: Number(t.min) || 0,
      max: t.max === Infinity || t.max === 'Infinity' ? Infinity : Number(t.max) || 100,
      payout: Number(t.payout) || 0,
      label: t.label ? String(t.label) : undefined,
    }));
  }

  private normalizeConditions(conditions: unknown): ConditionalPercentageCalculation['conditions'] {
    if (!Array.isArray(conditions)) return [];
    return conditions.map((c) => ({
      threshold: Number(c.threshold) || 0,
      operator: this.normalizeOperator(c.operator),
      maxThreshold: c.maxThreshold !== undefined ? Number(c.maxThreshold) : undefined,
      rate: Number(c.rate) || 0,
      label: c.label ? String(c.label) : undefined,
    }));
  }

  private normalizeOperator(op: unknown): ConditionalPercentageCalculation['conditions'][0]['operator'] {
    const validOps = ['<', '<=', '>', '>=', '==', 'between'];
    const opStr = String(op || '>=');
    return validOps.includes(opStr)
      ? (opStr as ConditionalPercentageCalculation['conditions'][0]['operator'])
      : '>=';
  }

  private normalizeRequiredInputs(inputs: unknown): RequiredInput[] {
    if (!Array.isArray(inputs)) return [];
    return inputs.map((i) => ({
      field: String(i.field || ''),
      description: String(i.description || ''),
      descriptionEs: i.descriptionEs ? String(i.descriptionEs) : undefined,
      scope: this.normalizeScope(i.scope),
      dataType: this.normalizeDataType(i.dataType),
    }));
  }

  private normalizeScope(scope: unknown): RequiredInput['scope'] {
    const validScopes = ['employee', 'store', 'company'];
    const scopeStr = String(scope || 'employee');
    return validScopes.includes(scopeStr) ? (scopeStr as RequiredInput['scope']) : 'employee';
  }

  private normalizeDataType(dataType: unknown): RequiredInput['dataType'] {
    const validTypes = ['number', 'percentage', 'currency'];
    const typeStr = String(dataType || 'number');
    return validTypes.includes(typeStr) ? (typeStr as RequiredInput['dataType']) : 'number';
  }

  private normalizeWorkedExamples(examples: unknown): WorkedExample[] {
    if (!Array.isArray(examples)) return [];
    return examples.map((e) => ({
      employeeType: String(e.employeeType || 'default'),
      inputs: (e.inputs as Record<string, number>) || {},
      expectedTotal: Number(e.expectedTotal) || 0,
      componentBreakdown: (e.componentBreakdown as Record<string, number>) || {},
    }));
  }
}

// ============================================
// CONVERSION TO PLAN CONFIG
// ============================================

import type {
  CompensationPlanConfig,
  PlanComponent,
  AdditiveLookupConfig,
} from '@/types/compensation-plan';

/**
 * Convert AI interpretation to CompensationPlanConfig
 */
export function interpretationToPlanConfig(
  interpretation: PlanInterpretation,
  tenantId: string,
  userId: string
): CompensationPlanConfig {
  const now = new Date().toISOString();
  const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Build variants from employee types
  const variants = interpretation.employeeTypes.map((empType) => {
    const components = interpretation.components
      .filter(
        (c) =>
          c.appliesToEmployeeTypes.includes('all') ||
          c.appliesToEmployeeTypes.includes(empType.id)
      )
      .map((comp, index) => convertComponent(comp, index));

    return {
      variantId: empType.id,
      variantName: empType.name,
      description: empType.nameEs || empType.name,
      eligibilityCriteria: empType.eligibilityCriteria || {},
      components,
    };
  });

  // If no employee types defined, create a single default variant
  if (variants.length === 0) {
    variants.push({
      variantId: 'default',
      variantName: 'Default',
      description: 'Default plan variant',
      eligibilityCriteria: {},
      components: interpretation.components.map((comp, index) => convertComponent(comp, index)),
    });
  }

  const config: AdditiveLookupConfig = {
    type: 'additive_lookup',
    variants,
  };

  return {
    id: planId,
    tenantId,
    name: interpretation.planName,
    description: interpretation.description,
    planType: 'additive_lookup',
    status: 'draft',
    effectiveDate: now,
    endDate: null,
    eligibleRoles: ['sales_rep', 'optometrista'],
    version: 1,
    previousVersionId: null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
    configuration: config,
  };
}

function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
  const base: Omit<PlanComponent, 'componentType' | 'matrixConfig' | 'tierConfig' | 'percentageConfig' | 'conditionalConfig'> = {
    id: comp.id,
    name: comp.name,
    description: comp.nameEs || comp.reasoning,
    order: order + 1,
    enabled: true,
    measurementLevel: 'store',
  };

  switch (comp.calculationMethod.type) {
    case 'matrix_lookup': {
      const m = comp.calculationMethod as MatrixCalculation;
      return {
        ...base,
        componentType: 'matrix_lookup',
        matrixConfig: {
          rowMetric: m.rowAxis.metric,
          rowMetricLabel: m.rowAxis.label,
          rowBands: m.rowAxis.ranges.map((r) => ({
            min: r.min,
            max: r.max,
            label: r.label,
          })),
          columnMetric: m.columnAxis.metric,
          columnMetricLabel: m.columnAxis.label,
          columnBands: m.columnAxis.ranges.map((r) => ({
            min: r.min,
            max: r.max,
            label: r.label,
          })),
          values: m.values,
          currency: 'MXN',
        },
      };
    }

    case 'tiered_lookup': {
      const t = comp.calculationMethod as TieredCalculation;
      return {
        ...base,
        componentType: 'tier_lookup',
        tierConfig: {
          metric: t.metric,
          metricLabel: t.metricLabel || t.metric,
          tiers: t.tiers.map((tier) => ({
            min: tier.min,
            max: tier.max,
            label: tier.label || '',
            value: tier.payout,
          })),
          currency: 'MXN',
        },
      };
    }

    case 'percentage':
    case 'flat_percentage': {
      const p = comp.calculationMethod as PercentageCalculation;
      return {
        ...base,
        componentType: 'percentage',
        measurementLevel: 'individual',
        percentageConfig: {
          rate: p.rate,
          appliedTo: p.metric,
          appliedToLabel: p.metricLabel || p.metric,
        },
      };
    }

    case 'conditional_percentage': {
      const c = comp.calculationMethod as ConditionalPercentageCalculation;
      return {
        ...base,
        componentType: 'conditional_percentage',
        measurementLevel: 'individual',
        conditionalConfig: {
          conditions: c.conditions.map((cond) => ({
            metric: c.conditionMetric,
            metricLabel: c.conditionMetricLabel || c.conditionMetric,
            min: cond.operator === '<' || cond.operator === '<=' ? 0 : cond.threshold,
            max:
              cond.operator === '<' || cond.operator === '<='
                ? cond.threshold
                : cond.maxThreshold || Infinity,
            rate: cond.rate,
            label: cond.label || '',
          })),
          appliedTo: c.metric,
          appliedToLabel: c.metricLabel || c.metric,
        },
      };
    }

    default:
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

// ============================================
// SINGLETON INSTANCE
// ============================================

let interpreterInstance: AIPlainInterpreter | null = null;

export function getAIInterpreter(): AIPlainInterpreter {
  if (!interpreterInstance) {
    interpreterInstance = new AIPlainInterpreter();
  }
  return interpreterInstance;
}

export function resetAIInterpreter(): void {
  interpreterInstance = null;
}
