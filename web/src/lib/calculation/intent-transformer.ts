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
    default:
      return null;
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

  const intent: IntentOperation = {
    operation: 'bounded_lookup_1d',
    input: metricSource(config.metric),
    boundaries,
    outputs,
    noMatchBehavior: 'zero',
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
