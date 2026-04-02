/**
 * Intent Transformer — Bridge from PlanComponent to ComponentIntent
 *
 * Deterministic transformation. No AI. No heuristics.
 * Reads the existing plan component JSONB and produces a structural intent
 * that the domain-agnostic executor can process.
 *
 * Mapping:
 *   tier_lookup            → bounded_lookup_1d
 *   matrix_lookup           → bounded_lookup_2d
 *   percentage              → scalar_multiply (+ optional cap/gate modifiers)
 *   conditional_percentage  → chained conditional_gate → scalar_multiply
 */

import type {
  PlanComponent,
  TierConfig,
  MatrixConfig,
  PercentageConfig,
  ConditionalConfig,
  ConditionalRate,
} from '../../types/compensation-plan';

import type {
  ComponentIntent,
  IntentOperation,
  IntentSource,
  Boundary,
  IntentModifier,
} from './intent-types';

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Transform a PlanComponent into a ComponentIntent.
 * Returns null if the component is disabled or has no valid config.
 */
export function transformComponent(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  if (!component.enabled) return null;

  switch (component.componentType) {
    case 'tier_lookup':
      return component.tierConfig
        ? transformTierLookup(component, component.tierConfig, componentIndex)
        : null;
    case 'matrix_lookup':
      return component.matrixConfig
        ? transformMatrixLookup(component, component.matrixConfig, componentIndex)
        : null;
    case 'percentage':
      return component.percentageConfig
        ? transformPercentage(component, component.percentageConfig, componentIndex)
        : null;
    case 'conditional_percentage':
      return component.conditionalConfig
        ? transformConditionalPercentage(component, component.conditionalConfig, componentIndex)
        : null;
    // HF-156: All new primitive types route to metadata-driven intent construction
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
    case 'scalar_multiply':
    case 'conditional_gate':
      return transformFromMetadata(component, componentIndex);
    default:
      // HF-156: For legacy types (tier_lookup) with calculationIntent, try metadata path
      // This handles existing CRP data where componentType='tier_lookup' but calculationIntent exists
      return transformFromMetadata(component, componentIndex);
  }
}

/**
 * Transform all components in a variant into ComponentIntents.
 */
export function transformVariant(
  components: PlanComponent[]
): ComponentIntent[] {
  const results: ComponentIntent[] = [];
  for (let i = 0; i < components.length; i++) {
    const intent = transformComponent(components[i], i);
    if (intent) results.push(intent);
  }
  return results;
}

// ──────────────────────────────────────────────
// Boundary Helpers
// ──────────────────────────────────────────────

function toBoundary(min: number, max: number): Boundary {
  return {
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    minInclusive: true,
    maxInclusive: true, // Current engine uses >= min && <= max (both inclusive)
  };
}

function metricSource(field: string): IntentSource {
  return { source: 'metric', sourceSpec: { field } };
}

function constantSource(value: number): IntentSource {
  return { source: 'constant', value };
}

function entityScope(level: string): 'entity' | 'group' {
  return level === 'individual' ? 'entity' : 'group';
}

// ──────────────────────────────────────────────
// tier_lookup → bounded_lookup_1d
// ──────────────────────────────────────────────

function transformTierLookup(
  component: PlanComponent,
  config: TierConfig,
  componentIndex: number
): ComponentIntent {
  const boundaries: Boundary[] = config.tiers.map(t => toBoundary(t.min, t.max));
  const outputs: number[] = config.tiers.map(t => t.value);

  // OB-117: Carry isMarginal from AI-produced calculationIntent if present.
  // When true, the executor multiplies output × inputValue (rate × volume).
  const aiIntent = component.calculationIntent as Record<string, unknown> | undefined;
  const isMarginal = aiIntent?.isMarginal === true;

  const intent: IntentOperation = {
    operation: 'bounded_lookup_1d',
    input: metricSource(config.metric),
    boundaries,
    outputs,
    noMatchBehavior: 'zero',
    ...(isMarginal ? { isMarginal: true } : {}),
  };

  return buildComponentIntent(component, componentIndex, intent, [config.metric]);
}

// ──────────────────────────────────────────────
// matrix_lookup → bounded_lookup_2d
// ──────────────────────────────────────────────

function transformMatrixLookup(
  component: PlanComponent,
  config: MatrixConfig,
  componentIndex: number
): ComponentIntent {
  const rowBoundaries: Boundary[] = config.rowBands.map(b => toBoundary(b.min, b.max));
  const columnBoundaries: Boundary[] = config.columnBands.map(b => toBoundary(b.min, b.max));

  const intent: IntentOperation = {
    operation: 'bounded_lookup_2d',
    inputs: {
      row: metricSource(config.rowMetric),
      column: metricSource(config.columnMetric),
    },
    rowBoundaries,
    columnBoundaries,
    outputGrid: config.values,
    noMatchBehavior: 'zero',
  };

  return buildComponentIntent(component, componentIndex, intent, [config.rowMetric, config.columnMetric]);
}

// ──────────────────────────────────────────────
// percentage → scalar_multiply (+ optional modifiers)
// ──────────────────────────────────────────────

function transformPercentage(
  component: PlanComponent,
  config: PercentageConfig,
  componentIndex: number
): ComponentIntent {
  const scalarOp: IntentOperation = {
    operation: 'scalar_multiply',
    input: metricSource(config.appliedTo),
    rate: config.rate,
  };

  // If minThreshold exists, wrap in conditional_gate
  let intent: IntentOperation;
  if (config.minThreshold) {
    intent = {
      operation: 'conditional_gate',
      condition: {
        left: metricSource(config.appliedTo),
        operator: '>=',
        right: constantSource(config.minThreshold),
      },
      onTrue: scalarOp,
      onFalse: { operation: 'constant', value: 0 },
    };
  } else {
    intent = scalarOp;
  }

  // If max cap exists, add cap modifier
  const modifiers: IntentModifier[] = [];
  if (config.maxPayout) {
    modifiers.push({ modifier: 'cap', maxValue: config.maxPayout, scope: 'per_entity' });
  }

  return buildComponentIntent(component, componentIndex, intent, [config.appliedTo], modifiers);
}

// ──────────────────────────────────────────────
// conditional_percentage → conditional_gate chain
// ──────────────────────────────────────────────

function transformConditionalPercentage(
  component: PlanComponent,
  config: ConditionalConfig,
  componentIndex: number
): ComponentIntent {
  const conditions = config.conditions;
  if (conditions.length === 0) {
    return buildComponentIntent(
      component, componentIndex,
      { operation: 'constant', value: 0 },
      [config.appliedTo]
    );
  }

  // Detect if all conditions use the same metric (common case)
  const allSameMetric = conditions.every(c => c.metric === conditions[0].metric);

  let intent: IntentOperation;
  if (allSameMetric) {
    intent = buildSameMetricChain(conditions, config.appliedTo);
  } else {
    intent = buildMixedMetricChain(conditions, config.appliedTo);
  }

  const requiredMetrics = [config.appliedTo];
  for (const c of conditions) {
    if (!requiredMetrics.includes(c.metric)) {
      requiredMetrics.push(c.metric);
    }
  }

  return buildComponentIntent(component, componentIndex, intent, requiredMetrics);
}

/**
 * All conditions check the same metric.
 * Sort by min descending, chain: if >= min_highest → rate_highest, elif >= min_next → ...
 * This works because conditions are non-overlapping tiers on the same metric.
 */
function buildSameMetricChain(
  conditions: ConditionalRate[],
  appliedTo: string
): IntentOperation {
  // Sort by min descending so we check highest threshold first
  const sorted = [...conditions].sort((a, b) => b.min - a.min);

  // Build chain from bottom up
  let fallback: IntentOperation = { operation: 'constant', value: 0 };

  for (let i = sorted.length - 1; i >= 0; i--) {
    const cond = sorted[i];
    const gate: IntentOperation = {
      operation: 'conditional_gate',
      condition: {
        left: metricSource(cond.metric),
        operator: '>=',
        right: constantSource(Number.isFinite(cond.min) ? cond.min : 0),
      },
      onTrue: {
        operation: 'scalar_multiply',
        input: metricSource(appliedTo),
        rate: cond.rate,
      },
      onFalse: fallback,
    };
    fallback = gate;
  }

  return fallback;
}

/**
 * Conditions check different metrics.
 * Iterate in original order (first-match wins).
 * Each condition: gate(>= min) → gate(<= max) → scalar_multiply, else try next.
 */
function buildMixedMetricChain(
  conditions: ConditionalRate[],
  appliedTo: string
): IntentOperation {
  let fallback: IntentOperation = { operation: 'constant', value: 0 };

  // Build from last condition backwards
  for (let i = conditions.length - 1; i >= 0; i--) {
    const cond = conditions[i];
    const min = Number.isFinite(cond.min) ? cond.min : null;
    const max = Number.isFinite(cond.max) ? cond.max : null;

    const resultOp: IntentOperation = {
      operation: 'scalar_multiply',
      input: metricSource(appliedTo),
      rate: cond.rate,
    };

    // Build inside-out: check max first (inner), then min (outer)
    let innerOp: IntentOperation = resultOp;

    // Max check (if bounded)
    if (max !== null) {
      innerOp = {
        operation: 'conditional_gate',
        condition: {
          left: metricSource(cond.metric),
          operator: '<=',
          right: constantSource(max),
        },
        onTrue: resultOp,
        onFalse: fallback,
      };
    }

    // Min check (outer)
    if (min !== null) {
      fallback = {
        operation: 'conditional_gate',
        condition: {
          left: metricSource(cond.metric),
          operator: '>=',
          right: constantSource(min),
        },
        onTrue: innerOp,
        onFalse: fallback,
      };
    } else {
      fallback = innerOp;
    }
  }

  return fallback;
}

// ──────────────────────────────────────────────
// ComponentIntent Builder
// ──────────────────────────────────────────────

function buildComponentIntent(
  component: PlanComponent,
  componentIndex: number,
  intent: IntentOperation,
  requiredMetrics: string[],
  modifiers: IntentModifier[] = []
): ComponentIntent {
  return {
    componentIndex,
    label: component.name,
    confidence: 1.0, // Deterministic transformation = full confidence
    dataSource: {
      sheetClassification: component.id,
      entityScope: entityScope(component.measurementLevel),
      requiredMetrics,
      groupLinkField: component.measurementLevel !== 'individual' ? 'storeId' : undefined,
    },
    intent,
    modifiers,
    metadata: {
      domainLabel: component.name,
      planReference: component.id,
      aiConfidence: 1.0,
      interpretationNotes: `Deterministic transform from ${component.componentType}`,
    },
  };
}

// ──────────────────────────────────────────────
// OB-182: Metadata-driven intent construction for new primitives
// The AI plan interpreter stores the intent structure in component.metadata
// for types that don't fit the legacy PlanComponent config structure.
// ──────────────────────────────────────────────

/**
 * HF-187: Normalize an AI-produced source reference into a valid IntentSource or IntentOperation.
 *
 * AI format for metrics:  { source: "metric", sourceSpec: { field: "X" } }  → pass through
 * AI format for ratios:   { source: "ratio", sourceSpec: { numerator: "X", denominator: "Y" } }
 *                         → { operation: "ratio", numerator: IntentSource, denominator: IntentSource }
 * AI format for constants: { source: "constant", value: N } → pass through
 * String shorthand:       "field_name" → { source: "metric", sourceSpec: { field: "field_name" } }
 */
function normalizeIntentInput(raw: unknown): IntentSource | IntentOperation {
  if (raw == null) return { source: 'constant', value: 0 };

  // String shorthand → metric source
  if (typeof raw === 'string') {
    return { source: 'metric', sourceSpec: { field: raw } };
  }

  // Number → constant
  if (typeof raw === 'number') {
    return { source: 'constant', value: raw };
  }

  const obj = raw as Record<string, unknown>;

  // Already a valid IntentOperation (has 'operation' field) → recurse nested inputs
  if ('operation' in obj && typeof obj.operation === 'string') {
    if (obj.operation === 'ratio') {
      const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
      return {
        operation: 'ratio',
        numerator: normalizeIntentInput(obj.numerator || spec.numerator),
        denominator: normalizeIntentInput(obj.denominator || spec.denominator),
        zeroDenominatorBehavior: (obj.zeroDenominatorBehavior as string) || 'zero',
      } as IntentOperation;
    }
    return obj as unknown as IntentOperation;
  }

  // source: "ratio" → convert to RatioOp (IntentOperation)
  if (obj.source === 'ratio') {
    const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
    return {
      operation: 'ratio',
      numerator: normalizeIntentInput(spec.numerator),
      denominator: normalizeIntentInput(spec.denominator),
      zeroDenominatorBehavior: 'zero',
    } as IntentOperation;
  }

  // Valid IntentSource types — pass through
  if (obj.source === 'metric' || obj.source === 'constant' || obj.source === 'entity_attribute'
    || obj.source === 'prior_component' || obj.source === 'cross_data'
    || obj.source === 'scope_aggregate' || obj.source === 'aggregate') {
    return obj as unknown as IntentSource;
  }

  // Unknown format — constant 0 fallback
  return { source: 'constant', value: 0 };
}

function transformFromMetadata(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  const meta = (component.metadata || {}) as Record<string, unknown>;
  // HF-156 Fix 3: Read from metadata.intent OR component.calculationIntent (DIAG-013 disconnect 3)
  const rawIntent = (meta?.intent || (component as unknown as Record<string, unknown>).calculationIntent) as Record<string, unknown> | undefined;
  if (!rawIntent) return null;

  // HF-156: Convert AI calculationIntent to proper IntentOperation
  // The AI may produce { operation: "scalar_multiply", rate: 0.06, input: {...}, additionalConstant: 200 }
  // If additionalConstant exists, this is actually a linear_function (y = mx + b)
  let operation: IntentOperation;
  if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
    // Linear function: rate * input + constant
    operation = {
      operation: 'linear_function',
      input: normalizeIntentInput(rawIntent.input),
      slope: Number(rawIntent.rate),
      intercept: Number(rawIntent.additionalConstant),
    } as IntentOperation;
  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
    operation = {
      operation: 'scalar_multiply',
      input: normalizeIntentInput(rawIntent.input),
      rate: Number(rawIntent.rate),
    } as IntentOperation;
  } else if (rawIntent.operation === 'piecewise_linear') {
    // HF-187: Typed transformation for piecewise_linear
    const calcMethod = (component as unknown as Record<string, unknown>).calculationMethod as Record<string, unknown> | undefined;
    const tv = rawIntent.targetValue ?? calcMethod?.targetValue ?? meta?.targetValue;
    operation = {
      operation: 'piecewise_linear',
      ratioInput: normalizeIntentInput(rawIntent.ratioInput),
      baseInput: normalizeIntentInput(rawIntent.baseInput),
      ...(tv != null && Number(tv) > 0 ? { targetValue: Number(tv) } : {}),
      segments: Array.isArray(rawIntent.segments) ? rawIntent.segments.map((seg: Record<string, unknown>) => ({
        min: Number(seg.min ?? 0),
        max: seg.max != null ? Number(seg.max) : null,
        rate: Number(seg.rate ?? 0),
      })) : [],
    } as IntentOperation;
  } else if (rawIntent.operation === 'conditional_gate') {
    // HF-187: Typed transformation for conditional_gate
    const cond = (rawIntent.condition || {}) as Record<string, unknown>;
    operation = {
      operation: 'conditional_gate',
      condition: {
        left: normalizeIntentInput(cond.left),
        operator: String(cond.operator || '>='),
        right: normalizeIntentInput(cond.right),
      },
      onTrue: normalizeIntentInput(rawIntent.onTrue) as IntentOperation,
      onFalse: normalizeIntentInput(rawIntent.onFalse) as IntentOperation,
    } as IntentOperation;
  } else {
    // Use as-is if it's already a proper IntentOperation
    operation = rawIntent as unknown as IntentOperation;
  }

  const modifiers: IntentModifier[] = [];

  // HF-187: Extract modifiers from inside the intent object (AI places them there)
  if (Array.isArray(rawIntent.modifiers)) {
    for (const mod of rawIntent.modifiers) {
      const m = mod as Record<string, unknown>;
      if (m.modifier === 'cap' && m.maxValue != null) {
        modifiers.push({ modifier: 'cap', maxValue: Number(m.maxValue), scope: 'per_period' });
      }
      if (m.modifier === 'floor' && m.minValue != null) {
        modifiers.push({ modifier: 'floor', minValue: Number(m.minValue), scope: 'per_period' });
      }
    }
  }

  // Also check component-level metadata (legacy path)
  if (meta.cap != null && Number(meta.cap) > 0) {
    modifiers.push({ modifier: 'cap', maxValue: Number(meta.cap), scope: 'per_period' });
  }
  if (meta.floor != null && Number(meta.floor) > 0) {
    modifiers.push({ modifier: 'floor', minValue: Number(meta.floor), scope: 'per_period' });
  }

  return {
    componentIndex,
    label: component.name,
    confidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
    dataSource: {
      sheetClassification: 'transaction',
      entityScope: 'entity',
      requiredMetrics: [],
    },
    intent: operation,
    modifiers,
    metadata: {
      domainLabel: component.name,
      planReference: component.id,
      aiConfidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
      interpretationNotes: `AI-interpreted ${component.componentType} via calculationIntent`,
    },
  };
}
