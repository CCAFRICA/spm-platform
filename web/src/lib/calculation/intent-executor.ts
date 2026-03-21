/**
 * Intent Executor — The Foundational Calculation Agent
 *
 * Executes structural operations defined by ComponentIntent.
 * ZERO domain awareness. Does not know what domain it operates in.
 * Processes boundaries, ratios, grids, conditions, and scalars.
 *
 * Decision 122 (DS-010): All arithmetic uses decimal.js with Banker's Rounding.
 * Native number is used ONLY for boundary comparison (exact plan values)
 * and at the output boundary (executeIntent → number).
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
  WeightedBlendOp,
  TemporalWindowOp,
  IntentModifier,
} from './intent-types';
import { isIntentOperation } from './intent-types';
import { Decimal, toDecimal, toNumber, ZERO } from './decimal-precision';

// ──────────────────────────────────────────────
// Entity Data — the executor's view of an entity
// ──────────────────────────────────────────────

export interface EntityData {
  entityId: string;
  metrics: Record<string, number>;
  attributes: Record<string, string | number | boolean>;
  groupMetrics?: Record<string, number>;
  priorResults?: number[];    // outcomes of previously calculated components
  periodHistory?: number[];   // prior period values for temporal_window (loaded in batch, not per-entity)
  // OB-181: Cross-data counts — pre-computed counts/sums of committed_data by data_type
  crossDataCounts?: Record<string, number>;  // key: "dataType:count" or "dataType:sum:field" → value
  // OB-181: Scope aggregates — pre-computed sums across entities in hierarchical scope
  scopeAggregates?: Record<string, number>;  // key: "scope:field:aggregation" → value
}

export interface ExecutionResult {
  entityId: string;
  componentIndex: number;
  outcome: number;
  trace: ExecutionTrace;
}

// ──────────────────────────────────────────────
// Source Resolution (returns Decimal — Decision 122)
// ──────────────────────────────────────────────

function resolveSource(
  src: IntentSource,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  switch (src.source) {
    case 'metric': {
      const field = src.sourceSpec.field;
      // Strip "metric:" prefix if present
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      const raw = data.metrics[key] ?? 0;
      inputLog[field] = { source: 'metric', rawValue: data.metrics[key], resolvedValue: raw };
      return toDecimal(raw);
    }
    case 'ratio': {
      const numKey = src.sourceSpec.numerator.startsWith('metric:')
        ? src.sourceSpec.numerator.slice(7) : src.sourceSpec.numerator;
      const denKey = src.sourceSpec.denominator.startsWith('metric:')
        ? src.sourceSpec.denominator.slice(7) : src.sourceSpec.denominator;
      const num = toDecimal(data.metrics[numKey] ?? 0);
      const den = toDecimal(data.metrics[denKey] ?? 0);
      const val = den.isZero() ? ZERO : num.div(den);
      inputLog[`ratio(${numKey}/${denKey})`] = {
        source: 'ratio',
        rawValue: { numerator: toNumber(num), denominator: toNumber(den) },
        resolvedValue: toNumber(val),
      };
      return val;
    }
    case 'aggregate': {
      const field = src.sourceSpec.field;
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      if (src.sourceSpec.scope === 'group' && data.groupMetrics) {
        const raw = data.groupMetrics[key] ?? 0;
        inputLog[`aggregate:group:${key}`] = { source: 'aggregate:group', rawValue: raw, resolvedValue: raw };
        return toDecimal(raw);
      }
      const raw = data.metrics[key] ?? 0;
      inputLog[`aggregate:${src.sourceSpec.scope}:${key}`] = {
        source: `aggregate:${src.sourceSpec.scope}`,
        rawValue: raw,
        resolvedValue: raw,
      };
      return toDecimal(raw);
    }
    case 'constant': {
      inputLog[`constant:${src.value}`] = { source: 'constant', rawValue: src.value, resolvedValue: src.value };
      return toDecimal(src.value);
    }
    case 'entity_attribute': {
      const attr = src.sourceSpec.attribute;
      const raw = data.attributes[attr];
      const val = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseFloat(raw) || 0 : 0);
      inputLog[`attr:${attr}`] = { source: 'entity_attribute', rawValue: raw, resolvedValue: val };
      return toDecimal(val);
    }
    case 'prior_component': {
      const idx = src.sourceSpec.componentIndex;
      const val = data.priorResults?.[idx] ?? 0;
      inputLog[`prior:${idx}`] = { source: 'prior_component', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Cross-data count — reads pre-computed count/sum from crossDataCounts
    case 'cross_data': {
      const { dataType, field, aggregation } = src.sourceSpec;
      const key = field ? `${dataType}:${aggregation}:${field}` : `${dataType}:${aggregation}`;
      const val = data.crossDataCounts?.[key] ?? 0;
      inputLog[`cross_data:${key}`] = { source: 'cross_data', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Scope aggregate — reads pre-computed hierarchical aggregate from scopeAggregates
    case 'scope_aggregate': {
      const { field, scope, aggregation } = src.sourceSpec;
      const key = `${scope}:${field}:${aggregation}`;
      const val = data.scopeAggregates?.[key] ?? 0;
      inputLog[`scope_aggregate:${key}`] = { source: 'scope_aggregate', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
  }
}

// ──────────────────────────────────────────────
// Composable Value Resolution — handles IntentSource or nested IntentOperation
// ──────────────────────────────────────────────

function resolveValue(
  sourceOrOp: IntentSource | IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  if (isIntentOperation(sourceOrOp)) {
    // Recursive: execute the nested operation to get a value
    return executeOperation(sourceOrOp, data, inputLog, trace);
  }
  // Existing: resolve from entity data
  return resolveSource(sourceOrOp, data, inputLog);
}

// ──────────────────────────────────────────────
// Boundary Matching
// Boundary values are exact plan constants — native number comparison is sufficient.
// ──────────────────────────────────────────────

export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const minOk = b.min === null || (b.minInclusive !== false ? value >= b.min : value > b.min);

    // OB-169: Handle .999 approximation in AI-extracted boundaries.
    // When maxInclusive is true and max has a fractional part within 0.01
    // of the next integer (e.g., 79.999), the AI meant the boundary to be
    // exclusive at the ceiling value. Snap to ceiling and use strict less-than.
    let maxOk: boolean;
    if (b.max === null) {
      maxOk = true;
    } else {
      let effectiveMax = b.max;
      let effectiveInclusive = b.maxInclusive === true;
      const frac = effectiveMax % 1;
      if (frac > 0 && (1 - frac) < 0.01 && effectiveInclusive) {
        effectiveMax = Math.ceil(effectiveMax);
        effectiveInclusive = false;
      }
      maxOk = effectiveInclusive ? value <= effectiveMax : value < effectiveMax;
    }

    if (minOk && maxOk) return i;
  }
  return -1;
}

// ──────────────────────────────────────────────
// Primitive Executors (Decimal arithmetic — Decision 122)
// ──────────────────────────────────────────────

function executeBoundedLookup1D(
  op: BoundedLookup1D,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  // Boundary comparison uses native number — plan values are exact
  const idx = findBoundaryIndex(op.boundaries, toNumber(inputValue));

  if (idx < 0) {
    trace.lookupResolution = { outputValue: 0 };
    return ZERO;
  }

  const rawOutput = toDecimal(op.outputs[idx] ?? 0);
  // OB-117: isMarginal — outputs are rates to multiply against the input value
  const output = op.isMarginal ? rawOutput.mul(inputValue) : rawOutput;
  trace.lookupResolution = {
    rowBoundaryMatched: {
      min: op.boundaries[idx].min,
      max: op.boundaries[idx].max,
      index: idx,
    },
    outputValue: toNumber(output),
    ...(op.isMarginal ? { isMarginal: true, rate: toNumber(rawOutput), inputValue: toNumber(inputValue) } : {}),
  };
  return output;
}

function executeBoundedLookup2D(
  op: BoundedLookup2D,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const rowValue = resolveValue(op.inputs.row, data, inputLog, trace);
  const colValue = resolveValue(op.inputs.column, data, inputLog, trace);

  const rowIdx = findBoundaryIndex(op.rowBoundaries, toNumber(rowValue));
  const colIdx = findBoundaryIndex(op.columnBoundaries, toNumber(colValue));

  if (rowIdx < 0 || colIdx < 0) {
    trace.lookupResolution = {
      rowBoundaryMatched: rowIdx >= 0 ? { min: op.rowBoundaries[rowIdx].min, max: op.rowBoundaries[rowIdx].max, index: rowIdx } : undefined,
      columnBoundaryMatched: colIdx >= 0 ? { min: op.columnBoundaries[colIdx].min, max: op.columnBoundaries[colIdx].max, index: colIdx } : undefined,
      outputValue: 0,
    };
    return ZERO;
  }

  const output = toDecimal(op.outputGrid[rowIdx]?.[colIdx] ?? 0);
  trace.lookupResolution = {
    rowBoundaryMatched: { min: op.rowBoundaries[rowIdx].min, max: op.rowBoundaries[rowIdx].max, index: rowIdx },
    columnBoundaryMatched: { min: op.columnBoundaries[colIdx].min, max: op.columnBoundaries[colIdx].max, index: colIdx },
    outputValue: toNumber(output),
  };
  return output;
}

function executeScalarMultiply(
  op: ScalarMultiply,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  const rateValue = typeof op.rate === 'number'
    ? toDecimal(op.rate)
    : resolveValue(op.rate, data, inputLog, trace);
  return inputValue.mul(rateValue);
}

function executeConditionalGate(
  op: ConditionalGate,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const leftVal = resolveSource(op.condition.left, data, inputLog);
  const rightVal = resolveSource(op.condition.right, data, inputLog);

  let conditionMet = false;
  switch (op.condition.operator) {
    case '>=': conditionMet = leftVal.gte(rightVal); break;
    case '>':  conditionMet = leftVal.gt(rightVal);  break;
    case '<=': conditionMet = leftVal.lte(rightVal); break;
    case '<':  conditionMet = leftVal.lt(rightVal);  break;
    case '=':  // AI plan interpreter produces single-equals for equality
    case '==': conditionMet = leftVal.eq(rightVal);  break;
    case '!=': conditionMet = !leftVal.eq(rightVal); break;
  }

  const branch = conditionMet ? op.onTrue : op.onFalse;
  return executeOperation(branch, data, inputLog, trace);
}

function executeAggregateOp(
  op: AggregateOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  return resolveSource(op.source, data, inputLog);
}

function executeRatioOp(
  op: RatioOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  const num = resolveSource(op.numerator, data, inputLog);
  const den = resolveSource(op.denominator, data, inputLog);
  if (den.isZero()) {
    return ZERO;
  }
  return num.div(den);
}

function executeConstantOp(op: ConstantOp): Decimal {
  return toDecimal(op.value);
}

// ──────────────────────────────────────────────
// Weighted Blend — N-input weighted combination
// ──────────────────────────────────────────────

function executeWeightedBlend(
  op: WeightedBlendOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const totalWeight = op.inputs.reduce((s, i) => s + i.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    inputLog['weighted_blend:weight_warning'] = {
      source: 'weighted_blend',
      rawValue: totalWeight,
      resolvedValue: totalWeight,
    };
  }

  let result = ZERO;
  for (let i = 0; i < op.inputs.length; i++) {
    const input = op.inputs[i];
    const value = resolveValue(input.source, data, inputLog, trace);
    const weighted = value.mul(toDecimal(input.weight));
    result = result.plus(weighted);
    inputLog[`blend_input_${i}`] = {
      source: 'weighted_blend',
      rawValue: toNumber(value),
      resolvedValue: toNumber(weighted),
    };
  }
  return result;
}

// ──────────────────────────────────────────────
// Temporal Window — rolling N-period aggregation
// ──────────────────────────────────────────────

function executeTemporalWindow(
  op: TemporalWindowOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const currentValue = resolveValue(op.input, data, inputLog, trace);

  // Build window values from period history
  const history = data.periodHistory ?? [];
  const historySlice = history.slice(-(op.windowSize));
  let windowValues: Decimal[] = historySlice.map(v => toDecimal(v));

  if (op.includeCurrentPeriod) {
    windowValues = [...windowValues, currentValue];
  }

  // Graceful degradation: no history → return current value
  if (windowValues.length === 0) {
    inputLog['temporal_window:no_history'] = {
      source: 'temporal_window',
      rawValue: toNumber(currentValue),
      resolvedValue: toNumber(currentValue),
    };
    return currentValue;
  }

  let result: Decimal;
  switch (op.aggregation) {
    case 'sum':
      result = windowValues.reduce((a, b) => a.plus(b), ZERO);
      break;
    case 'average': {
      const sum = windowValues.reduce((a, b) => a.plus(b), ZERO);
      result = sum.div(toDecimal(windowValues.length));
      break;
    }
    case 'min':
      result = windowValues.reduce((a, b) => a.lt(b) ? a : b);
      break;
    case 'max':
      result = windowValues.reduce((a, b) => a.gt(b) ? a : b);
      break;
    case 'trend': {
      // Linear regression slope: y = mx + b, return m
      const n = windowValues.length;
      if (n < 2) { result = ZERO; break; }
      const xMean = toDecimal((n - 1) / 2);
      const yMean = windowValues.reduce((a, b) => a.plus(b), ZERO).div(toDecimal(n));
      let num = ZERO;
      let den = ZERO;
      for (let i = 0; i < n; i++) {
        const xDiff = toDecimal(i).minus(xMean);
        num = num.plus(xDiff.mul(windowValues[i].minus(yMean)));
        den = den.plus(xDiff.mul(xDiff));
      }
      result = den.isZero() ? ZERO : num.div(den);
      break;
    }
  }

  inputLog['temporal_window'] = {
    source: 'temporal_window',
    rawValue: { windowSize: op.windowSize, aggregation: op.aggregation, valuesUsed: windowValues.length },
    resolvedValue: toNumber(result),
  };

  return result;
}

// ──────────────────────────────────────────────
// Operation Dispatch (returns Decimal — Decision 122)
// ──────────────────────────────────────────────

// OB-117: Exported for use by evaluateComponent's calculationIntent fallback
export function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  switch (op.operation) {
    case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
    case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
    case 'aggregate':         return executeAggregateOp(op, data, inputLog);
    case 'ratio':             return executeRatioOp(op, data, inputLog);
    case 'constant':          return executeConstantOp(op);
    case 'weighted_blend':    return executeWeightedBlend(op, data, inputLog, trace);
    case 'temporal_window':   return executeTemporalWindow(op, data, inputLog, trace);
    case 'linear_function':   return executeLinearFunction(op, data, inputLog, trace);
    case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
  }
}

// ──────────────────────────────────────────────
// OB-180: Linear Function — y = slope * x + intercept
// ──────────────────────────────────────────────

function executeLinearFunction(
  op: import('./intent-types').LinearFunctionOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  const result = inputValue.mul(op.slope).plus(op.intercept);
  return result;
}

// ──────────────────────────────────────────────
// OB-180: Piecewise Linear — attainment selects rate, applied to base
// ──────────────────────────────────────────────

function executePiecewiseLinear(
  op: import('./intent-types').PiecewiseLinearOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const ratio = toNumber(resolveValue(op.ratioInput, data, inputLog, trace));
  const baseValue = resolveValue(op.baseInput, data, inputLog, trace);

  // Find the matching segment
  for (const seg of op.segments) {
    const inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max);
    if (inRange) {
      return baseValue.mul(seg.rate);
    }
  }

  // No segment matched — return zero
  return ZERO;
}

// ──────────────────────────────────────────────
// Modifier Application (Decimal — Decision 122)
// ──────────────────────────────────────────────

function applyModifiers(
  value: Decimal,
  modifiers: IntentModifier[],
  data: EntityData,
  modifierLog: Array<{ modifier: string; before: number; after: number }>
): Decimal {
  let result = value;

  for (const mod of modifiers) {
    const before = toNumber(result);

    switch (mod.modifier) {
      case 'cap': {
        const cap = toDecimal(mod.maxValue);
        result = result.gt(cap) ? cap : result;
        break;
      }
      case 'floor': {
        const floor = toDecimal(mod.minValue);
        result = result.lt(floor) ? floor : result;
        break;
      }
      case 'proration': {
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const num = resolveSource(mod.numerator, data, inputLog);
        const den = resolveSource(mod.denominator, data, inputLog);
        result = den.isZero() ? ZERO : result.mul(num.div(den));
        break;
      }
      case 'temporal_adjustment':
        // Temporal adjustment requires historical data — not applied in single-period execution
        break;
    }

    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
  }

  return result;
}

// ──────────────────────────────────────────────
// Main Entry Point
// Decision 122: Decimal→number conversion at output boundary
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

  let outcome = ZERO;

  // 1. Resolve variant routing (if present)
  if (intent.variants) {
    const routing = intent.variants;
    const attrSrc = routing.routingAttribute;

    // For entity_attribute source, resolve as string for matching
    let attrValue: string | number | boolean = '';
    if (attrSrc.source === 'entity_attribute') {
      attrValue = entityData.attributes[attrSrc.sourceSpec.attribute] ?? '';
    } else {
      attrValue = toNumber(resolveSource(attrSrc, entityData, inputLog));
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
          outcome = ZERO;
          break;
        case 'error':
          outcome = ZERO;
          break;
      }
    }
  } else if (intent.intent) {
    // 2. Execute single operation (no variants)
    outcome = executeOperation(intent.intent, entityData, inputLog, trace);
  }

  // 3. Apply modifiers
  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);

  // 4. Convert to native number at output boundary (Decision 122)
  const outcomeNumber = toNumber(outcome);

  // 5. Build complete trace
  const executionTrace: ExecutionTrace = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    variantRoute: trace.variantRoute,
    inputs: inputLog,
    lookupResolution: trace.lookupResolution,
    modifiers: modifierLog,
    finalOutcome: outcomeNumber,
    confidence: intent.confidence,
  };

  return {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    outcome: outcomeNumber,
    trace: executionTrace,
  };
}
