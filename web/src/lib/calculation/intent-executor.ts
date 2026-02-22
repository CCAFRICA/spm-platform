/**
 * Intent Executor — The Foundational Calculation Agent
 *
 * Executes structural operations defined by ComponentIntent.
 * ZERO domain awareness. Does not know what domain it operates in.
 * Processes boundaries, ratios, grids, conditions, and scalars.
 */

import type {
  ComponentIntent,
  IntentOperation,
  IntentSource,
  ExecutionTrace,
  Boundary,
  BoundedLookup1D,
  BoundedLookup2D,
  ScalarMultiply,
  ConditionalGate,
  AggregateOp,
  RatioOp,
  ConstantOp,
  IntentModifier,
} from './intent-types';

// ──────────────────────────────────────────────
// Entity Data — the executor's view of an entity
// ──────────────────────────────────────────────

export interface EntityData {
  entityId: string;
  metrics: Record<string, number>;
  attributes: Record<string, string | number | boolean>;
  groupMetrics?: Record<string, number>;
  priorResults?: number[];    // outcomes of previously calculated components
}

export interface ExecutionResult {
  entityId: string;
  componentIndex: number;
  outcome: number;
  trace: ExecutionTrace;
}

// ──────────────────────────────────────────────
// Source Resolution
// ──────────────────────────────────────────────

function resolveSource(
  src: IntentSource,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): number {
  switch (src.source) {
    case 'metric': {
      const field = src.sourceSpec.field;
      // Strip "metric:" prefix if present
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      const val = data.metrics[key] ?? 0;
      inputLog[field] = { source: 'metric', rawValue: data.metrics[key], resolvedValue: val };
      return val;
    }
    case 'ratio': {
      const numKey = src.sourceSpec.numerator.startsWith('metric:')
        ? src.sourceSpec.numerator.slice(7) : src.sourceSpec.numerator;
      const denKey = src.sourceSpec.denominator.startsWith('metric:')
        ? src.sourceSpec.denominator.slice(7) : src.sourceSpec.denominator;
      const num = data.metrics[numKey] ?? 0;
      const den = data.metrics[denKey] ?? 0;
      const val = den !== 0 ? num / den : 0;
      inputLog[`ratio(${numKey}/${denKey})`] = {
        source: 'ratio',
        rawValue: { numerator: num, denominator: den },
        resolvedValue: val,
      };
      return val;
    }
    case 'aggregate': {
      const field = src.sourceSpec.field;
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      if (src.sourceSpec.scope === 'group' && data.groupMetrics) {
        const val = data.groupMetrics[key] ?? 0;
        inputLog[`aggregate:group:${key}`] = { source: 'aggregate:group', rawValue: val, resolvedValue: val };
        return val;
      }
      const val = data.metrics[key] ?? 0;
      inputLog[`aggregate:${src.sourceSpec.scope}:${key}`] = {
        source: `aggregate:${src.sourceSpec.scope}`,
        rawValue: val,
        resolvedValue: val,
      };
      return val;
    }
    case 'constant': {
      inputLog[`constant:${src.value}`] = { source: 'constant', rawValue: src.value, resolvedValue: src.value };
      return src.value;
    }
    case 'entity_attribute': {
      const attr = src.sourceSpec.attribute;
      const raw = data.attributes[attr];
      const val = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseFloat(raw) || 0 : 0);
      inputLog[`attr:${attr}`] = { source: 'entity_attribute', rawValue: raw, resolvedValue: val };
      return val;
    }
    case 'prior_component': {
      const idx = src.sourceSpec.componentIndex;
      const val = data.priorResults?.[idx] ?? 0;
      inputLog[`prior:${idx}`] = { source: 'prior_component', rawValue: val, resolvedValue: val };
      return val;
    }
  }
}

// ──────────────────────────────────────────────
// Boundary Matching
// ──────────────────────────────────────────────

export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const minOk = b.min === null || (b.minInclusive !== false ? value >= b.min : value > b.min);
    const maxOk = b.max === null || (b.maxInclusive === true ? value <= b.max : value < b.max);
    if (minOk && maxOk) return i;
  }
  return -1;
}

// ──────────────────────────────────────────────
// Primitive Executors
// ──────────────────────────────────────────────

function executeBoundedLookup1D(
  op: BoundedLookup1D,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): number {
  const inputValue = resolveSource(op.input, data, inputLog);
  const idx = findBoundaryIndex(op.boundaries, inputValue);

  if (idx < 0) {
    trace.lookupResolution = { outputValue: 0 };
    return op.noMatchBehavior === 'zero' ? 0 : 0;
  }

  const output = op.outputs[idx] ?? 0;
  trace.lookupResolution = {
    rowBoundaryMatched: {
      min: op.boundaries[idx].min,
      max: op.boundaries[idx].max,
      index: idx,
    },
    outputValue: output,
  };
  return output;
}

function executeBoundedLookup2D(
  op: BoundedLookup2D,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): number {
  const rowValue = resolveSource(op.inputs.row, data, inputLog);
  const colValue = resolveSource(op.inputs.column, data, inputLog);

  const rowIdx = findBoundaryIndex(op.rowBoundaries, rowValue);
  const colIdx = findBoundaryIndex(op.columnBoundaries, colValue);

  if (rowIdx < 0 || colIdx < 0) {
    trace.lookupResolution = {
      rowBoundaryMatched: rowIdx >= 0 ? { min: op.rowBoundaries[rowIdx].min, max: op.rowBoundaries[rowIdx].max, index: rowIdx } : undefined,
      columnBoundaryMatched: colIdx >= 0 ? { min: op.columnBoundaries[colIdx].min, max: op.columnBoundaries[colIdx].max, index: colIdx } : undefined,
      outputValue: 0,
    };
    return op.noMatchBehavior === 'zero' ? 0 : 0;
  }

  const output = op.outputGrid[rowIdx]?.[colIdx] ?? 0;
  trace.lookupResolution = {
    rowBoundaryMatched: { min: op.rowBoundaries[rowIdx].min, max: op.rowBoundaries[rowIdx].max, index: rowIdx },
    columnBoundaryMatched: { min: op.columnBoundaries[colIdx].min, max: op.columnBoundaries[colIdx].max, index: colIdx },
    outputValue: output,
  };
  return output;
}

function executeScalarMultiply(
  op: ScalarMultiply,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): number {
  const inputValue = resolveSource(op.input, data, inputLog);
  return inputValue * op.rate;
}

function executeConditionalGate(
  op: ConditionalGate,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): number {
  const leftVal = resolveSource(op.condition.left, data, inputLog);
  const rightVal = resolveSource(op.condition.right, data, inputLog);

  let conditionMet = false;
  switch (op.condition.operator) {
    case '>=': conditionMet = leftVal >= rightVal; break;
    case '>':  conditionMet = leftVal > rightVal;  break;
    case '<=': conditionMet = leftVal <= rightVal; break;
    case '<':  conditionMet = leftVal < rightVal;  break;
    case '==': conditionMet = leftVal === rightVal; break;
    case '!=': conditionMet = leftVal !== rightVal; break;
  }

  const branch = conditionMet ? op.onTrue : op.onFalse;
  return executeOperation(branch, data, inputLog, trace);
}

function executeAggregateOp(
  op: AggregateOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): number {
  return resolveSource(op.source, data, inputLog);
}

function executeRatioOp(
  op: RatioOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): number {
  const num = resolveSource(op.numerator, data, inputLog);
  const den = resolveSource(op.denominator, data, inputLog);
  if (den === 0) {
    return op.zeroDenominatorBehavior === 'zero' ? 0 : 0;
  }
  return num / den;
}

function executeConstantOp(op: ConstantOp): number {
  return op.value;
}

// ──────────────────────────────────────────────
// Operation Dispatch
// ──────────────────────────────────────────────

function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): number {
  switch (op.operation) {
    case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
    case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog);
    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
    case 'aggregate':         return executeAggregateOp(op, data, inputLog);
    case 'ratio':             return executeRatioOp(op, data, inputLog);
    case 'constant':          return executeConstantOp(op);
  }
}

// ──────────────────────────────────────────────
// Modifier Application
// ──────────────────────────────────────────────

function applyModifiers(
  value: number,
  modifiers: IntentModifier[],
  data: EntityData,
  modifierLog: Array<{ modifier: string; before: number; after: number }>
): number {
  let result = value;

  for (const mod of modifiers) {
    const before = result;

    switch (mod.modifier) {
      case 'cap':
        result = Math.min(result, mod.maxValue);
        break;
      case 'floor':
        result = Math.max(result, mod.minValue);
        break;
      case 'proration': {
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const num = resolveSource(mod.numerator, data, inputLog);
        const den = resolveSource(mod.denominator, data, inputLog);
        result = den !== 0 ? result * (num / den) : 0;
        break;
      }
      case 'temporal_adjustment':
        // Temporal adjustment requires historical data — not applied in single-period execution
        break;
    }

    modifierLog.push({ modifier: mod.modifier, before, after: result });
  }

  return result;
}

// ──────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────

export function executeIntent(
  intent: ComponentIntent,
  entityData: EntityData
): ExecutionResult {
  const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
  const modifierLog: Array<{ modifier: string; before: number; after: number }> = [];
  const trace: Partial<ExecutionTrace> = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    confidence: intent.confidence,
  };

  let outcome = 0;

  // 1. Resolve variant routing (if present)
  if (intent.variants) {
    const routing = intent.variants;
    const attrSrc = routing.routingAttribute;

    // For entity_attribute source, resolve as string for matching
    let attrValue: string | number | boolean = '';
    if (attrSrc.source === 'entity_attribute') {
      attrValue = entityData.attributes[attrSrc.sourceSpec.attribute] ?? '';
    } else {
      attrValue = resolveSource(attrSrc, entityData, inputLog);
    }

    const matchedRoute = routing.routes.find(r => String(r.matchValue) === String(attrValue));

    if (matchedRoute) {
      trace.variantRoute = {
        attribute: attrSrc.source === 'entity_attribute' ? attrSrc.sourceSpec.attribute : 'resolved',
        value: attrValue,
        matched: String(matchedRoute.matchValue),
      };
      outcome = executeOperation(matchedRoute.intent, entityData, inputLog, trace);
    } else {
      switch (routing.noMatchBehavior) {
        case 'first':
          if (routing.routes.length > 0) {
            outcome = executeOperation(routing.routes[0].intent, entityData, inputLog, trace);
          }
          break;
        case 'skip':
          outcome = 0;
          break;
        case 'error':
          outcome = 0;
          break;
      }
    }
  } else if (intent.intent) {
    // 2. Execute single operation (no variants)
    outcome = executeOperation(intent.intent, entityData, inputLog, trace);
  }

  // 3. Apply modifiers
  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);

  // 4. Build complete trace
  const executionTrace: ExecutionTrace = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    variantRoute: trace.variantRoute,
    inputs: inputLog,
    lookupResolution: trace.lookupResolution,
    modifiers: modifierLog,
    finalOutcome: outcome,
    confidence: intent.confidence,
  };

  return {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    outcome,
    trace: executionTrace,
  };
}
