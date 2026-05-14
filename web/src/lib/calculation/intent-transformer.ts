/**
 * Intent Transformer — Bridge from PlanComponent to ComponentIntent
 *
 * Deterministic transformation. No AI. No heuristics.
 * Reads the existing plan component and produces a structural intent
 * that the domain-agnostic executor can process.
 *
 * Foundational primitives only — legacy vocabulary case arms removed in OB-196 Phase 1.6.5.
 */

import type { PlanComponent } from '../../types/compensation-plan';

import type {
  ComponentIntent,
  IntentOperation,
  IntentSource,
  IntentModifier,
} from './intent-types';

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Transform a PlanComponent into a ComponentIntent.
 * Returns null if the component is disabled or has no valid intent.
 */
export function transformComponent(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  if (!component.enabled) return null;

  switch (component.componentType) {
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
    case 'scalar_multiply':
    case 'conditional_gate':
      return transformFromMetadata(component, componentIndex);
    default:
      // Default path: any component with calculationIntent or metadata.intent
      // routes through metadata-driven construction. Components lacking either
      // produce null (no transform).
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
// Helpers
// ──────────────────────────────────────────────

function entityScope(level: string): 'entity' | 'group' {
  return level === 'individual' ? 'entity' : 'group';
}

// ──────────────────────────────────────────────
// Metadata-driven intent construction (OB-182)
// The AI plan interpreter stores the intent structure in component.metadata.intent
// or component.calculationIntent.
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

  if (typeof raw === 'string') {
    return { source: 'metric', sourceSpec: { field: raw } };
  }

  if (typeof raw === 'number') {
    return { source: 'constant', value: raw };
  }

  const obj = raw as Record<string, unknown>;

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

  if (obj.source === 'ratio') {
    const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
    return {
      operation: 'ratio',
      numerator: normalizeIntentInput(spec.numerator),
      denominator: normalizeIntentInput(spec.denominator),
      zeroDenominatorBehavior: 'zero',
    } as IntentOperation;
  }

  if (obj.source === 'metric' || obj.source === 'constant' || obj.source === 'entity_attribute'
    || obj.source === 'prior_component' || obj.source === 'cross_data'
    || obj.source === 'scope_aggregate' || obj.source === 'aggregate') {
    return obj as unknown as IntentSource;
  }

  return { source: 'constant', value: 0 };
}

function transformFromMetadata(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  const meta = (component.metadata || {}) as Record<string, unknown>;
  const rawIntent = (meta?.intent || (component as unknown as Record<string, unknown>).calculationIntent) as Record<string, unknown> | undefined;
  if (!rawIntent) return null;

  let operation: IntentOperation;
  if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
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
    operation = rawIntent as unknown as IntentOperation;
  }

  // HF-223 Phase 1: validation-passthrough replaces reconstruction.
  // Pre-HF-223 the transformer cherry-picked known fields from rawIntent.modifiers
  // (modifier + maxValue/minValue), hardcoded scope='per_period', and silently
  // dropped 'proration' and 'temporal_adjustment' discriminants entirely. That
  // gated LLM expression at the transformer layer — Decision 153 (plan intelligence
  // forward) was blocked. Validation-passthrough: carry LLM emission faithfully;
  // default only when LLM omits or emits invalid values.
  const modifiers: IntentModifier[] = [];

  if (Array.isArray(rawIntent.modifiers)) {
    for (const mod of rawIntent.modifiers) {
      const m = mod as Record<string, unknown>;
      const modType = m.modifier as string;

      if (modType === 'cap' && m.maxValue != null) {
        modifiers.push({
          modifier: 'cap',
          maxValue: Number(m.maxValue),
          scope: (typeof m.scope === 'string' && ['per_period', 'per_entity', 'total'].includes(m.scope))
            ? m.scope as 'per_period' | 'per_entity' | 'total'
            : 'per_period',
        });
      } else if (modType === 'floor' && m.minValue != null) {
        modifiers.push({
          modifier: 'floor',
          minValue: Number(m.minValue),
          scope: (typeof m.scope === 'string' && ['per_period', 'per_entity', 'total'].includes(m.scope))
            ? m.scope as 'per_period' | 'per_entity' | 'total'
            : 'per_period',
        });
      } else if (modType === 'proration' && m.numerator != null && m.denominator != null) {
        modifiers.push({
          modifier: 'proration',
          // IntentModifier.proration fields are typed as IntentSource; normalizeIntentInput
          // accepts the broader IntentSource | IntentOperation union. Cast asserts the
          // narrower type — runtime callers (applyModifiers via resolveSource) require
          // IntentSource shape; if LLM emits a non-IntentSource shape here, the existing
          // resolveSource fallback at intent-executor.ts handles the degenerate case.
          numerator: normalizeIntentInput(m.numerator) as IntentSource,
          denominator: normalizeIntentInput(m.denominator) as IntentSource,
        });
      } else if (modType === 'temporal_adjustment' && m.lookbackPeriods != null) {
        modifiers.push({
          modifier: 'temporal_adjustment',
          lookbackPeriods: Number(m.lookbackPeriods),
          triggerCondition: normalizeIntentInput(m.triggerCondition) as IntentSource,
          adjustmentType: (typeof m.adjustmentType === 'string' && ['full_reversal', 'partial', 'prorated'].includes(m.adjustmentType))
            ? m.adjustmentType as 'full_reversal' | 'partial' | 'prorated'
            : 'full_reversal',
        });
      }
      // Unrecognized modifier discriminants: not pushed to typed array.
      // The LLM emission is preserved in rule_sets.components[].calculationIntent
      // (source of record). The executor processes typed modifiers only.
      // No data lost; the raw emission persists.
    }
  }

  // Legacy shortcut: meta.cap / meta.floor (top-level fields outside modifiers array,
  // pre-intent-architecture). Behavior preserved per DD-7. Future cleanup HF retires.
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
      entityScope: entityScope(component.measurementLevel),
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
