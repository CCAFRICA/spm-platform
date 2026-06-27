/**
 * AI-Powered Plan Interpreter
 *
 * Uses AIService for provider-agnostic AI interpretation of commission plan documents.
 * Handles any format (PPTX, CSV, Excel, PDF text) and any language (Spanish, English, mixed).
 */

// OB-199 Phase 1: getAIService import deleted; only the deleted AIPlainInterpreter
// class consumed it. Callers requiring AIService use it directly via @/lib/ai.
import {
  isRegisteredPrimitive,
  getOperationPrimitives,
  type FoundationalPrimitive,
} from '@/lib/calculation/primitive-registry';
import {
  canonicalizeBoundaries,
  BoundaryCanonicalizationError,
} from '@/lib/calculation/boundary-canonicalizer';
import type { Boundary } from '@/lib/calculation/intent-types';
import { isPrimeNode, VALID_PRIMES } from '@/lib/calculation/intent-types';
import { validateComponentIntent, logValidationViolations } from '@/lib/calculation/prime-validator';

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
  /**
   * HF-244 Phase 2: total number of cells in the source rate table for this
   * component. The LLM emits this alongside the calculationIntent so the
   * post-generation validator can enforce exhaustive emission — if the tree
   * carries fewer constant leaves than rateTableCellCount, the component is
   * rejected because the table was truncated. Omitted for components without
   * a rate table (simple rate × metric, linear function, etc.).
   */
  rateTableCellCount?: number;
  confidence: number;
  reasoning: string;
  /**
   * HF-251: orchestration-time metadata carried into the persisted component.
   * Populated by plan-orchestration.ts when the CompositionalIntent
   * construction pathway (Decision 158) ran for this component, carrying
   * the original intent and the construction_method marker. Merged into the
   * persisted component's metadata in convertComponent.
   */
  metadataExtension?: Record<string, unknown>;
  /**
   * HF-341 R7 (A2): a component that semantically MODIFIES (scales) another
   * component's payout — e.g. a volume accelerator that the plan describes as a
   * "multiplier" — is NOT a separate additive component. The LLM skeleton marks
   * it with the host component it composes into and the operator the plan
   * expresses; assembly folds it INTO the host's PrimeNode DAG (host × modifier)
   * so the additive component-combination layer only ever sums genuinely
   * independent components. Composition mode comes from the expression, never a
   * fold default (Decision 158); `target` matches the host by id or name.
   */
  composesInto?: { target: string; operator: 'multiply' };
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

// OB-199 Phase 1 (DS-023 §5.4): AIPlainInterpreter class deleted. Producer-side
// confidence normalization now happens once at anthropic-adapter.ts via
// normalizeConfidenceFieldsInPlace. Downstream consumers (this file's
// bridgeAIToEngineFormat path + plan-comprehension-emitter path) receive
// ratio-form confidence values from a single source. The validation/coercion
// surface previously inside AIPlainInterpreter.validateAndNormalize is preserved
// as the standalone exported function validateAndNormalizePlanInterpretation
// below; bridgeAIToEngineFormat calls it directly without class indirection.
//
// Deletion scope per architect Option (b) disposition 2026-05-11:
//   - AIPlainInterpreter class (constructor, isConfigured, interpretPlan,
//     validateAndNormalizePublic, validateAndNormalize, normalizeConfidence,
//     normalize* helpers)
//   - getAIInterpreter factory
//   - resetAIInterpreter
//   - interpreterInstance singleton
// Replacement: module-level helper functions + validateAndNormalizePlanInterpretation.

// AIInterpreterConfig interface deleted — only the deleted class consumed it.

// ============================================
// VALIDATION / NORMALIZATION HELPERS (module-level; no class indirection)
// ============================================

function normalizeEmployeeTypes(types: unknown): EmployeeType[] {
  if (!Array.isArray(types)) return [];

  return types.map((t, index) => ({
    id: String(t.id || `employee-type-${index}`),
    name: String(t.name || `Type ${index + 1}`),
    nameEs: t.nameEs ? String(t.nameEs) : undefined,
    eligibilityCriteria: t.eligibilityCriteria as Record<string, unknown> | undefined,
  }));
}

function normalizeComponentType(type: unknown): ComponentCalculation['type'] {
  // OB-196 Phase 1.5 (Decision 155 fully closed): every recognized identifier
  // is sourced from primitive-registry.ts. No private alias lists.
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

function normalizeCalculationMethod(type: unknown, method: unknown): ComponentCalculation {
  const typeStr = normalizeComponentType(type);
  const m = (method || {}) as Record<string, unknown>;
  return { type: typeStr, ...m } as GenericCalculation;
}

function normalizeComponents(components: unknown): InterpretedComponent[] {
  if (!Array.isArray(components)) return [];

  return components.map((c, index) => {
    // OB-199 Phase 1: confidence arrives ratio-form post-producer-normalization
    // at anthropic-adapter.ts. Direct Number() read; fallback 0.5 preserved for
    // missing/invalid (matches prior B2 fallback semantic for component-level).
    const rawConf = Number(c.confidence);
    const comp: InterpretedComponent = {
      id: String(c.id || `component-${index}`),
      name: String(c.name || `Component ${index + 1}`),
      nameEs: c.nameEs ? String(c.nameEs) : undefined,
      type: normalizeComponentType(c.type),
      appliesToEmployeeTypes: Array.isArray(c.appliesToEmployeeTypes)
        ? c.appliesToEmployeeTypes.map(String)
        : ['all'],
      calculationMethod: normalizeCalculationMethod(c.type, c.calculationMethod),
      // OB-77: Preserve AI-produced structural intent (validated downstream)
      calculationIntent: c.calculationIntent && typeof c.calculationIntent === 'object'
        ? c.calculationIntent as Record<string, unknown>
        : undefined,
      // HF-244 Phase 2: integer cell-count declaration for rate-table components.
      rateTableCellCount: typeof c.rateTableCellCount === 'number' && c.rateTableCellCount > 0
        ? Math.floor(c.rateTableCellCount)
        : undefined,
      // HF-251: carry the orchestrator's metadataExtension (compositional_intent + construction_method).
      metadataExtension: c.metadataExtension && typeof c.metadataExtension === 'object'
        ? c.metadataExtension as Record<string, unknown>
        : undefined,
      confidence: Number.isFinite(rawConf) ? rawConf : 0.5,
      reasoning: String(c.reasoning || ''),
    };
    // HF-341 R7 (A2): carry the LLM-recognized multiplicative-modifier link so a
    // component that scales another folds into the host DAG (interpretationToPlanConfig).
    const ci = c.composesInto as Record<string, unknown> | undefined;
    if (ci && typeof ci.target === 'string' && ci.operator === 'multiply') {
      comp.composesInto = { target: ci.target, operator: 'multiply' };
    }
    return comp;
  });
}

function normalizeScope(scope: unknown): RequiredInput['scope'] {
  const validScopes = ['employee', 'store', 'company'];
  const scopeStr = String(scope || 'employee');
  return validScopes.includes(scopeStr) ? (scopeStr as RequiredInput['scope']) : 'employee';
}

function normalizeDataType(dataType: unknown): RequiredInput['dataType'] {
  const validTypes = ['number', 'percentage', 'currency'];
  const typeStr = String(dataType || 'number');
  return validTypes.includes(typeStr) ? (typeStr as RequiredInput['dataType']) : 'number';
}

function normalizeRequiredInputs(inputs: unknown): RequiredInput[] {
  if (!Array.isArray(inputs)) return [];
  return inputs.map((i) => ({
    field: String(i.field || ''),
    description: String(i.description || ''),
    descriptionEs: i.descriptionEs ? String(i.descriptionEs) : undefined,
    scope: normalizeScope(i.scope),
    dataType: normalizeDataType(i.dataType),
  }));
}

function normalizeWorkedExamples(examples: unknown): WorkedExample[] {
  if (!Array.isArray(examples)) return [];
  return examples.map((e) => ({
    employeeType: String(e.employeeType || 'default'),
    inputs: (e.inputs as Record<string, number>) || {},
    expectedTotal: Number(e.expectedTotal) || 0,
    componentBreakdown: (e.componentBreakdown as Record<string, number>) || {},
  }));
}

/**
 * Validate and normalize the raw AI response payload into a PlanInterpretation.
 * OB-199 Phase 1: extracted as a standalone exported function (no class
 * indirection) per architect Option (b) disposition. Confidence values arrive
 * ratio-form post-producer-normalization at anthropic-adapter.ts; this function
 * preserves structural validation (shape coercion, missing-field handling,
 * non-confidence fallbacks).
 */
export function validateAndNormalizePlanInterpretation(rawResult: unknown): PlanInterpretation {
  const parsed = (rawResult ?? {}) as Record<string, unknown>;
  const rawTopConf = Number(parsed.confidence);
  return {
    ruleSetName: String(parsed.ruleSetName || 'Unnamed Plan'),
    ruleSetNameEs: parsed.ruleSetNameEs ? String(parsed.ruleSetNameEs) : undefined,
    description: String(parsed.description || ''),
    descriptionEs: parsed.descriptionEs ? String(parsed.descriptionEs) : undefined,
    currency: String(parsed.currency || 'USD').toUpperCase(),
    employeeTypes: normalizeEmployeeTypes(parsed.employeeTypes),
    components: normalizeComponents(parsed.components),
    requiredInputs: normalizeRequiredInputs(parsed.requiredInputs),
    workedExamples: normalizeWorkedExamples(parsed.workedExamples),
    confidence: Number.isFinite(rawTopConf) ? rawTopConf : 0,
    reasoning: String(parsed.reasoning || ''),
  };
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
// HF-341 R7 (A2): fold each component the LLM recognized as a multiplicative
// MODIFIER of another (composesInto.operator==='multiply') INTO its host's
// PrimeNode DAG as `arithmetic(multiply, host, modifier)`, and drop it from the
// component list. This removes the assumption that every emitted component is an
// independent ADDITIVE term — the accelerator (a 1.0/1.25 factor) must SCALE the
// commission, not be summed to it. The composition is expressed by the plan
// (carried by the LLM), not inferred by a heuristic; the already-existing
// `arithmetic` prime + executor evaluate it with no engine change (Korean Test:
// no component-type→mode registry, no dimensionless-factor detection).
export function foldComposedModifiers(components: InterpretedComponent[]): InterpretedComponent[] {
  if (!Array.isArray(components) || components.length === 0) return components;
  const byId = new Map(components.map(c => [c.id, c] as const));
  const byName = new Map(components.map(c => [c.name, c] as const));
  const folded = new Set<string>();

  for (const mod of components) {
    const compose = mod.composesInto;
    if (!compose || compose.operator !== 'multiply') continue;
    const host = byId.get(compose.target) ?? byName.get(compose.target);
    if (!host || host.id === mod.id) {
      console.log(`[foldComposedModifiers] "${mod.name}" composesInto target "${compose.target}" not found — left as an independent component.`);
      continue;
    }
    if (!host.calculationIntent || typeof host.calculationIntent.prime !== 'string'
        || !mod.calculationIntent || typeof mod.calculationIntent.prime !== 'string') {
      console.log(`[foldComposedModifiers] "${mod.name}"→"${host.name}": one side is not a prime DAG — left as separate components.`);
      continue;
    }
    // host := host × modifier (the modifier becomes a factor inside the host's DAG)
    host.calculationIntent = {
      prime: 'arithmetic',
      op: 'multiply',
      inputs: [host.calculationIntent, mod.calculationIntent],
    } as Record<string, unknown>;
    folded.add(mod.id);
    console.log(`[foldComposedModifiers] HF-341 R7 A2: folded "${mod.name}" as a ×multiplier into "${host.name}" (one fewer additive component).`);
  }
  return components.filter(c => !folded.has(c.id));
}

export function interpretationToPlanConfig(
  interpretation: PlanInterpretation,
  tenantId: string,
  userId: string
): RuleSetConfig {
  const now = new Date().toISOString();
  const ruleSetId = crypto.randomUUID();

  // Build variants from employee types
  const employeeTypes = interpretation.employeeTypes || [];
  // HF-341 R7 (A2): fold multiplicative modifiers into their host DAGs BEFORE the
  // additive component list is built, so a recognized multiplier scales (not sums).
  const allComponents = foldComposedModifiers(interpretation.components || []);

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

    // Log variant components with tier-data presence (HF-199 D1: foundational primitives
    // store tier data in calculationIntent.outputGrid (2d) / .outputs (1d) / .rate (scalar)
    // — the legacy tierConfig.tiers field was removed in OB-196 Phase 1.5. Diagnostic
    // updated to inspect calculationIntent shape per primitive).
    console.log(`[variant ${empType.id}] ${components.length} components:`);
    components.forEach((c, i) => {
      const intent = c.calculationIntent as Record<string, unknown> | undefined;
      const op = (intent?.operation as string) ?? c.componentType;
      let tierShape = 'n/a';
      if (intent) {
        if (op === 'bounded_lookup_2d') {
          const og = intent.outputGrid as unknown[][] | undefined;
          tierShape = og ? `outputGrid=${og.length}x${og[0]?.length ?? 0}` : 'outputGrid=absent';
        } else if (op === 'bounded_lookup_1d') {
          const outs = intent.outputs as unknown[] | undefined;
          tierShape = outs ? `outputs=${outs.length}` : 'outputs=absent';
        } else if (op === 'scalar_multiply') {
          tierShape = `rate=${intent.rate ? 'present' : 'absent'}`;
        } else if (op === 'conditional_gate') {
          tierShape = intent.condition ? 'condition=present' : 'condition=absent';
        } else {
          tierShape = `op=${op}`;
        }
      }
      console.log(`  [${i}] ${c.name}: componentType=${c.componentType}, ${tierShape}`);
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

  // HF-238: format detection. Prime-DAG components carry a recursive
  // PrimeNode tree under calculationIntent (discriminator key `prime`)
  // rather than the legacy named-operation shape (discriminator key
  // `operation`). Detect and route accordingly.
  const calcMethod = comp?.calculationMethod;
  const intentNode = base.calculationIntent as Record<string, unknown> | undefined;
  const isPrimeDag = !!intentNode && typeof intentNode.prime === 'string';

  if (isPrimeDag) {
    // Validate the entire PrimeNode tree before persisting.
    if (!validatePrimeNodeTree(intentNode)) {
      throw new UnconvertibleComponentError(
        `[convertComponent] "${base.name}" emitted a prime-DAG calculationIntent ` +
        `that does not validate against VALID_PRIMES (${Array.from(VALID_PRIMES).join(',')}). ` +
        `Emission: ${JSON.stringify(intentNode).slice(0, 500)}.`,
      );
    }
    // OB-200 Phase 4 + HF-244 Phase 2: structural validation against
    // PRIME_GRAMMAR. Critical violations (unknown_prime, arity, op_unknown,
    // child_topology, exhaustive_emission when rateTableCellCount declared)
    // throw — the component cannot proceed. Warnings (scale_annotation,
    // terminal_completeness, decision_127) log but do not block.
    //
    // HF-244: rateTableCellCount on the component output is the LLM's
    // declaration of source rate-table dimensions; the validator counts
    // emitted constant leaves and rejects truncated trees. Closes the
    // BCL C0 class defect (30-cell matrix → 3-leaf tree silently persisted).
    const expectedCellCount = typeof comp.rateTableCellCount === 'number' && comp.rateTableCellCount > 0
      ? comp.rateTableCellCount
      : undefined;
    const validation = validateComponentIntent(intentNode, { componentLabel: base.name, expectedCellCount });
    logValidationViolations(validation, base.name);
    if (!validation.valid) {
      const critical = validation.violations.filter(v => v.severity === 'critical');
      throw new UnconvertibleComponentError(
        `[convertComponent] "${base.name}" emitted a prime-DAG calculationIntent ` +
        `with ${critical.length} critical grammar violation(s): ` +
        `${critical.map(v => `${v.check}@${v.nodePath}: ${v.message}`).join('; ')}.`,
      );
    }
    return {
      ...base,
      componentType: 'prime_dag' as FoundationalPrimitive,
      metadata: {
        ...(base.metadata || {}),
        intent: base.calculationIntent,
        // HF-251: merge orchestrator-carried construction_method +
        // compositional_intent into the persisted component metadata.
        // Downstream signal-surface writers (Decision 153 L2 signals) can
        // read these from rule_sets.components[].metadata for diagnostic
        // and progressive-performance use.
        ...(comp?.metadataExtension ? comp.metadataExtension : {}),
      },
    };
  }

  // Legacy path: calcType derives from calculationIntent.operation (primary)
  // with calculationMethod.type as transitional fallback.
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

  // HF-196 Phase 1G-15 — Decision 127 structural enforcement at plan persistence.
  // Canonicalize bounded_lookup boundaries to half-open partition form before
  // the rule_set lands in the database. AI-emitted .X99 inclusive-end shapes
  // (which produce non-contiguous partitions and engine resolver gap-misses)
  // are normalized; structurally malformed shapes throw with named error.
  if (calcType === 'bounded_lookup_1d' || calcType === 'bounded_lookup_2d') {
    const intent = base.calculationIntent as Record<string, unknown> | undefined;
    if (intent) {
      try {
        if (calcType === 'bounded_lookup_1d') {
          const bs = intent.boundaries as Boundary[] | undefined;
          if (bs && bs.length > 0) intent.boundaries = canonicalizeBoundaries(bs);
        }
        if (calcType === 'bounded_lookup_2d') {
          const rb = intent.rowBoundaries as Boundary[] | undefined;
          const cb = intent.columnBoundaries as Boundary[] | undefined;
          if (rb && rb.length > 0) intent.rowBoundaries = canonicalizeBoundaries(rb);
          if (cb && cb.length > 0) intent.columnBoundaries = canonicalizeBoundaries(cb);
        }
      } catch (err) {
        if (err instanceof BoundaryCanonicalizationError) {
          throw new UnconvertibleComponentError(
            `[convertComponent] "${base.name}" boundary canonicalization failed (Decision 127): ${err.message}`,
          );
        }
        throw err;
      }
    }
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
    case 'prime_dag':
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

/**
 * HF-238: recursively validate that every node in a PrimeNode tree has a
 * recognized `prime` discriminator and that branch nodes carry the expected
 * sub-fields. Returns false on the first invalid node.
 */
function validatePrimeNodeTree(node: unknown): boolean {
  if (!isPrimeNode(node)) return false;
  switch (node.prime) {
    case 'constant':
    case 'reference':
      return true;
    case 'arithmetic':
    case 'compare':
      return Array.isArray(node.inputs)
        && node.inputs.length === 2
        && validatePrimeNodeTree(node.inputs[0])
        && validatePrimeNodeTree(node.inputs[1]);
    case 'logical':
      return Array.isArray(node.inputs)
        && node.inputs.length > 0
        && node.inputs.every((n: unknown) => validatePrimeNodeTree(n));
    case 'conditional':
      return validatePrimeNodeTree(node.condition)
        && validatePrimeNodeTree(node.then)
        && validatePrimeNodeTree(node.else);
    case 'filter':
    case 'scope':
    case 'prior_period':
      return validatePrimeNodeTree(node.downstream);
    case 'aggregate':
      return typeof node.field === 'string';
    default:
      return false;
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
  // OB-199 Phase 1: standalone function call (no class indirection per architect Option (b))
  const normalized = validateAndNormalizePlanInterpretation(rawResult);

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
// OB-199 Phase 1: SINGLETON INSTANCE block deleted (class deleted per
// architect Option (b) disposition). Consumers call standalone exported
// functions directly:
//   - validateAndNormalizePlanInterpretation(rawResult)
//   - bridgeAIToEngineFormat(rawResult, tenantId, userId)
// ============================================
