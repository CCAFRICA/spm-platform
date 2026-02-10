/**
 * AI-Powered Plan Interpreter
 *
 * Uses AIService for provider-agnostic AI interpretation of commission plan documents.
 * Handles any format (PPTX, CSV, Excel, PDF text) and any language (Spanish, English, mixed).
 */

import { getAIService } from '@/lib/ai';

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
// AI INTERPRETER CLASS (uses AIService for provider abstraction)
// ============================================

export class AIPlainInterpreter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: AIInterpreterConfig = {}) {
    // Config is ignored - we use AIService for all AI calls
  }

  public isConfigured(): boolean {
    // AIService handles configuration internally
    try {
      getAIService();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Interpret a plan document using AIService (provider-agnostic)
   */
  public async interpretPlan(documentContent: string): Promise<PlanInterpretation> {
    console.log('\n========== AI INTERPRETER DEBUG ==========');
    console.log('Document content length:', documentContent.length, 'chars');

    try {
      // Use AIService for provider abstraction
      const aiService = getAIService();
      console.log('Calling AIService.interpretPlan...');

      const response = await aiService.interpretPlan(documentContent, 'text');

      console.log('\n========== AI RESPONSE ==========');
      console.log('Request ID:', response.requestId);
      console.log('Signal ID:', response.signalId);
      console.log('Confidence:', (response.confidence * 100).toFixed(1) + '%');
      console.log('Latency:', response.latencyMs + 'ms');
      console.log('Provider:', response.provider);
      console.log('Model:', response.model);

      // Parse and normalize the result
      const interpretation = this.validateAndNormalize(response.result);
      interpretation.rawApiResponse = JSON.stringify(response.result);

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
   * Validate and normalize the AI response
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
  const employeeTypes = interpretation.employeeTypes || [];
  const allComponents = interpretation.components || [];

  const variants = employeeTypes.map((empType) => {
    const components = allComponents
      .filter(
        (c) =>
          // Null-safe check for appliesToEmployeeTypes
          (c.appliesToEmployeeTypes?.includes('all') ?? true) ||
          (c.appliesToEmployeeTypes?.includes(empType.id) ?? false)
      )
      .map((comp, index) => {
        // DEFENSIVE: Deep copy the component to prevent mutation issues across variants
        const compCopy = JSON.parse(JSON.stringify(comp)) as InterpretedComponent;
        return convertComponent(compCopy, index);
      });

    // Log variant components with tier counts
    console.log(`[variant ${empType.id}] ${components.length} components:`);
    components.forEach((c, i) => {
      const tc = 'tierConfig' in c ? (c.tierConfig as { tiers?: unknown[] }) : undefined;
      console.log(`  [${i}] ${c.name}: ${tc?.tiers?.length ?? 'no tiers'}`);
    });

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
      components: allComponents.map((comp, index) => {
        // DEFENSIVE: Deep copy the component to prevent mutation issues
        const compCopy = JSON.parse(JSON.stringify(comp)) as InterpretedComponent;
        return convertComponent(compCopy, index);
      }),
    });
  }

  const config: AdditiveLookupConfig = {
    type: 'additive_lookup',
    variants,
  };

  // Final summary log
  console.log(`[interpretationToPlanConfig] ${variants.length} variants created`);
  variants.forEach((v, vi) => {
    const tierSummary = v.components
      .filter(c => c.componentType === 'tier_lookup')
      .map(c => `${c.name}:${(c.tierConfig as { tiers?: unknown[] })?.tiers?.length ?? 0}`)
      .join(', ');
    console.log(`  [${vi}] ${v.variantId}: ${tierSummary}`);
  });

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
  // Null-safe base properties
  const base: Omit<PlanComponent, 'componentType' | 'matrixConfig' | 'tierConfig' | 'percentageConfig' | 'conditionalConfig'> = {
    id: comp?.id || `component-${order}`,
    name: comp?.name || `Component ${order + 1}`,
    description: comp?.nameEs || comp?.reasoning || '',
    order: order + 1,
    enabled: true,
    measurementLevel: 'store',
  };

  // Null-safe calculation method access
  const calcMethod = comp?.calculationMethod;
  const calcType = calcMethod?.type || 'tiered_lookup';

  // DEBUG: Log exactly what type is being processed
  console.log(`[convertComponent] "${base.name}" calcType="${calcType}" (from calcMethod.type="${calcMethod?.type}")`);

  switch (calcType) {
    case 'matrix_lookup': {
      const m = calcMethod as MatrixCalculation;
      const rowAxis = m?.rowAxis || { metric: 'attainment', label: 'Attainment', ranges: [] };
      const colAxis = m?.columnAxis || { metric: 'sales', label: 'Sales', ranges: [] };
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
          columnBands: (colAxis.ranges || []).map((r) => ({
            min: r?.min ?? 0,
            max: r?.max ?? 100,
            label: r?.label || '',
          })),
          values: m?.values || [[0]],
          currency: 'MXN',
        },
      };
    }

    case 'tiered_lookup': {
      const t = calcMethod as TieredCalculation;
      const rawTiers = t?.tiers || [];

      // Simple direct mapping - no transformation issues
      const tiers = rawTiers.map((tier) => ({
        min: tier?.min ?? 0,
        max: tier?.max ?? 100,
        label: tier?.label || '',
        value: tier?.payout ?? 0,
      }));

      console.log(`[convertComponent] ${base.name}: ${rawTiers.length} input tiers -> ${tiers.length} output tiers`);

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
    }

    case 'percentage':
    case 'flat_percentage': {
      const p = calcMethod as PercentageCalculation;
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
    }

    case 'conditional_percentage': {
      const c = calcMethod as ConditionalPercentageCalculation;
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
