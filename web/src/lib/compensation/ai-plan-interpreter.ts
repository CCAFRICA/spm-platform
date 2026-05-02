/**
 * AI-Powered Plan Interpreter
 *
 * Uses AIService for provider-agnostic AI interpretation of commission plan documents.
 * Handles any format (PPTX, CSV, Excel, PDF text) and any language (Spanish, English, mixed).
 */

import { getAIService } from '@/lib/ai';
import {
  isRegisteredPrimitive,
  getOperationPrimitives,
  type FoundationalPrimitive,
} from '@/lib/calculation/primitive-registry';

// HF-194: typed structured-failure surface for the importer dispatch boundary.
// Phase 1.5's prior throw at convertComponent's default branch named this class
// in its message ("Phase 2 replaces this throw with UnconvertibleComponentError");
// HF-194 ships that promise.
export class UnconvertibleComponentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnconvertibleComponentError';
  }
}

// ============================================
// TYPES
// ============================================

// OB-196 Phase 1.5 (legacy alias elimination at the AI-plan-interpreter site):
//
// At the runtime level, this file's importer (normalizeComponentType +
// normalizeCalculationMethod + convertComponent) accepts ONLY foundational
// identifiers; legacy switch arms (matrix_lookup, tier_lookup, tiered_lookup,
// percentage, flat_percentage, conditional_percentage) deleted; helper methods
// for legacy shapes deleted. AI emits foundational identifiers directly per
// the Phase 1.5 plan-agent prompt update.
//
// The TYPE-LEVEL union below is intentionally wider than the runtime
// emission — `ComponentCalculation['type']` continues to admit the legacy
// discriminator strings because Phase 2 will delete the run-calculation.ts
// legacy switch arms (which read these discriminators), and Phase 1.6.5/1.7
// are still in flight for calc-side and UI consumers that depend on them.
// When Phase 1.7 lands, the legacy interfaces below are deleted and
// ComponentCalculation narrows to GenericCalculation.
//
// When the architect dispositions plan-interpreter.ts, this union narrows to
// `GenericCalculation` and the legacy interfaces below are deleted entirely.

// OB-196 Phase 1.7: legacy interfaces (MatrixCalculation, TieredCalculation,
// PercentageCalculation, ConditionalPercentageCalculation, AxisRange) deleted.
// plan-interpreter.ts (the consumer that needed them) was deleted in Phase 1.6.
// Foundational-only envelope post-narrowing.
//
// HF-194: type field derives from FoundationalPrimitive (registry-canonical 12 primitives)
// instead of carrying a private subset. Closes Rule 8 violation (no private vocabulary copies).
export interface GenericCalculation {
  type: FoundationalPrimitive;
  [key: string]: unknown;
}

export type ComponentCalculation = GenericCalculation;

export interface InterpretedComponent {
  id: string;
  name: string;
  nameEs?: string;
  type: ComponentCalculation['type'];
  appliesToEmployeeTypes: string[];
  calculationMethod: ComponentCalculation;
  calculationIntent?: Record<string, unknown>; // OB-77: AI-produced structural intent
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
  ruleSetName: string;
  ruleSetNameEs?: string;
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
      console.log('Plan name:', interpretation.ruleSetName);
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
   * Public wrapper for validateAndNormalize (used by bridgeAIToEngineFormat)
   */
  public validateAndNormalizePublic(parsed: Record<string, unknown>): PlanInterpretation {
    return this.validateAndNormalize(parsed);
  }

  /**
   * Validate and normalize the AI response
   */
  private validateAndNormalize(parsed: Record<string, unknown>): PlanInterpretation {
    return {
      ruleSetName: String(parsed.ruleSetName || 'Unnamed Plan'),
      ruleSetNameEs: parsed.ruleSetNameEs ? String(parsed.ruleSetNameEs) : undefined,
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
        // OB-77: Preserve AI-produced structural intent (validated downstream)
        calculationIntent: c.calculationIntent && typeof c.calculationIntent === 'object'
          ? c.calculationIntent as Record<string, unknown>
          : undefined,
        confidence: Number(c.confidence) || 50,
        reasoning: String(c.reasoning || ''),
      };
      return comp;
    });
  }

  private normalizeComponentType(type: unknown): ComponentCalculation['type'] {
    // OB-196 Phase 1.5 (Decision 155 fully closed): every recognized identifier
    // is sourced from primitive-registry.ts. No private alias lists.
    //
    // HF-194: prior 5-of-12 importable subset Set deleted (Rule 8 violation —
    // private vocabulary copy of registry primitives). All 12 registered
    // primitives are now importable; convertComponent's canonical-dispatch
    // switch handles all of them. Throw replaced with UnconvertibleComponentError.
    const typeStr = String(type ?? '');
    if (!isRegisteredPrimitive(typeStr)) {
      throw new UnconvertibleComponentError(
        `[ai-plan-interpreter] non-foundational componentType "${typeStr}". ` +
          `The registry holds ${getOperationPrimitives().length} foundational primitives; ` +
          `AI emission and persisted rule_sets must match. ` +
          `This is an OB-196 Phase 1.5 closure invariant.`,
      );
    }
    return typeStr as ComponentCalculation['type'];
  }

  private normalizeCalculationMethod(type: unknown, method: unknown): ComponentCalculation {
    // OB-196 Phase 1.5: legacy switch arms (matrix_lookup, tier_lookup,
    // tiered_lookup, percentage, flat_percentage, conditional_percentage)
    // deleted entirely. Foundational 5-tuple expected exclusively.
    // normalizeComponentType throws if the input falls outside the importable
    // foundational subset, so by the time control reaches the spread below,
    // typeStr is guaranteed to be one of the five canonical identifiers.
    const typeStr = this.normalizeComponentType(type);
    const m = (method || {}) as Record<string, unknown>;
    return { type: typeStr, ...m } as GenericCalculation;
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
  RuleSetConfig,
  PlanComponent,
  AdditiveLookupConfig,
} from '@/types/compensation-plan';

/**
 * Convert AI interpretation to RuleSetConfig
 */
export function interpretationToPlanConfig(
  interpretation: PlanInterpretation,
  tenantId: string,
  userId: string
): RuleSetConfig {
  const now = new Date().toISOString();
  const ruleSetId = crypto.randomUUID();

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

  // OB-196 Phase 1.7: legacy tier_lookup summary log stripped (filter dead post-foundational narrowing).
  console.log(`[interpretationToPlanConfig] ${variants.length} variants created`);

  return {
    id: ruleSetId,
    tenantId,
    name: interpretation.ruleSetName,
    description: interpretation.description,
    ruleSetType: 'additive_lookup',
    status: 'draft',
    effectiveDate: now,
    endDate: null,
    eligibleRoles: [], // HF-161: Removed Korean Test violation. Roles derived from AI interpretation or user configuration.
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

  // calcType derives from calculationIntent.operation (primary) with
  // calculationMethod.type as transitional fallback. Phase 1.5 removed the
  // tiered_lookup silent-fallback (legacy) removed; if neither is present the default
  // branch throws.
  const calcMethod = comp?.calculationMethod;
  const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || '';

  console.log(
    `[convertComponent] "${base.name}" calcType="${calcType}" ` +
      `(from calcMethod.type="${calcMethod?.type}", calculationIntent.operation="${base.calculationIntent?.operation}")`,
  );

  // HF-194: canonical 12-case dispatch pattern, mirroring intent-executor.ts:444-471
  // and run-calculation.ts:255-280. Vocabulary derivation is type-level
  // (FoundationalPrimitive union from primitive-registry.ts); structured-failure
  // default for runtime safety beyond compile-time enforcement, per Decision 154.
  if (!isRegisteredPrimitive(calcType)) {
    throw new UnconvertibleComponentError(
      `[convertComponent] componentType "${calcType}" for component "${base.name}" ` +
      `is not a registered foundational primitive. The registry holds ` +
      `${getOperationPrimitives().length} primitives; AI emission and persisted rule_sets ` +
      `must match. This is an OB-196 Phase 1.5 closure invariant.`,
    );
  }

  switch (calcType as FoundationalPrimitive) {
    case 'bounded_lookup_1d':
    case 'bounded_lookup_2d':
    case 'scalar_multiply':
    case 'conditional_gate':
    case 'aggregate':
    case 'ratio':
    case 'constant':
    case 'weighted_blend':
    case 'temporal_window':
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
      return {
        ...base,
        componentType: calcType as FoundationalPrimitive,
        metadata: {
          ...(base.metadata || {}),
          intent: base.calculationIntent, // copy for transformFromMetadata
        },
      };
    default: {
      // Unreachable per type-system + isRegisteredPrimitive guard above.
      // Structured failure for runtime safety per Decision 154.
      const _exhaustive: never = calcType as never;
      void _exhaustive;
      throw new UnconvertibleComponentError(
        `[convertComponent] exhaustive guard failed for "${calcType}" on component "${base.name}". ` +
        `Registry/dispatch divergence; this is a Decision 154 violation requiring architect attention.`,
      );
    }
  }
}

// ============================================
// OB-155: PUBLIC BRIDGE — raw AI response → engine-compatible format
// ============================================

/**
 * Convert raw AI interpretation response to engine-compatible components format.
 * Used by SCI execute route to bridge the gap between AI output and engine input.
 *
 * @param rawResult - The raw `response.result` from `aiService.interpretPlan()`
 * @param tenantId - Tenant ID for the rule set
 * @param userId - User ID for created_by
 * @returns Object with `components` (variants format) and `ruleSetConfig` for the engine
 */
export function bridgeAIToEngineFormat(
  rawResult: Record<string, unknown>,
  tenantId: string,
  userId: string,
): {
  name: string;
  description: string;
  components: { variants: Array<{ variantId: string; variantName: string; description?: string; components: PlanComponent[] }> };
  inputBindings: Record<string, unknown>;
} {
  // Step 1: Normalize the raw AI output through the same pipeline as the plan import page
  const interpreter = new AIPlainInterpreter();
  const normalized = interpreter.validateAndNormalizePublic(rawResult);

  // Step 2: Convert to engine format via interpretationToPlanConfig
  const config = interpretationToPlanConfig(normalized, tenantId, userId);
  const additiveLookup = config.configuration as AdditiveLookupConfig;

  return {
    name: normalized.ruleSetName,
    description: normalized.description,
    components: { variants: additiveLookup.variants },
    inputBindings: {},
  };
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
