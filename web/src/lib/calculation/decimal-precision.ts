/**
 * Decimal Precision Module (Decision 122 — DS-010)
 *
 * The ONLY place where decimal.js is imported and configured.
 * All calculation code imports from this module, never directly from decimal.js.
 *
 * IEEE 754-2019 Section 4.3.1: roundTiesToEven (Banker's Rounding)
 * Eliminates systematic bias at scale (Goldberg 1991, Kahan 1996).
 */

import Decimal from 'decimal.js';
import type { OutputPrecision, RoundingTrace } from './intent-types';
import { DEFAULT_OUTPUT_PRECISION } from './intent-types';

// Configure decimal.js for financial calculation
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9,
  toExpPos: 21,
});

// Re-export Decimal class for use in intent executor
export { Decimal };

/** Convert a native number to Decimal for precise arithmetic */
export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

/** Convert Decimal back to native number (at output boundary only) */
export function toNumber(value: Decimal): number {
  return value.toNumber();
}

/** Cached zero constant — avoids repeated construction */
export const ZERO = new Decimal(0);

/** Round a component output per its outputPrecision and return the trace */
export function roundComponentOutput(
  rawValue: Decimal | number,
  componentIndex: number,
  label: string,
  precision?: OutputPrecision
): { rounded: Decimal; trace: RoundingTrace } {
  const prec = precision || DEFAULT_OUTPUT_PRECISION;
  const raw = rawValue instanceof Decimal ? rawValue : toDecimal(rawValue);

  const roundingMode = getRoundingMode(prec.roundingMethod);
  const rounded = raw.toDecimalPlaces(prec.decimalPlaces, roundingMode);

  return {
    rounded,
    trace: {
      componentIndex,
      label,
      rawValue: raw.toNumber(),
      roundedValue: rounded.toNumber(),
      roundingAdjustment: rounded.minus(raw).toNumber(),
      precision: prec,
    },
  };
}

function getRoundingMode(method: string): Decimal.Rounding {
  switch (method) {
    case 'half_even': return Decimal.ROUND_HALF_EVEN;
    case 'half_up': return Decimal.ROUND_HALF_UP;
    case 'floor': return Decimal.ROUND_FLOOR;
    case 'ceil': return Decimal.ROUND_CEIL;
    case 'truncate': return Decimal.ROUND_DOWN;
    default: return Decimal.ROUND_HALF_EVEN;
  }
}

/**
 * Infer outputPrecision from a component's plan structure.
 * Examines output values (boundary outputs, constant values, grid values, rates)
 * to determine if they are all integers → decimalPlaces: 0.
 *
 * Korean Test: examines numeric VALUES, not currency codes or locale strings.
 */
export function inferOutputPrecision(
  calculationIntent?: Record<string, unknown>,
  componentConfig?: Record<string, unknown>
): OutputPrecision {
  const values: number[] = [];

  // Collect output values from calculationIntent tree
  if (calculationIntent) {
    collectOutputValues(calculationIntent, values);
  }

  // Collect from legacy component configs
  if (componentConfig) {
    collectConfigValues(componentConfig, values);
  }

  if (values.length === 0) return DEFAULT_OUTPUT_PRECISION;

  // Check if all values are integers
  const allIntegers = values.every(v => Number.isInteger(v));
  if (allIntegers) {
    return { decimalPlaces: 0, roundingMethod: 'half_even', source: 'inferred_from_outputs' };
  }

  // Find max decimal places among values
  const maxDecimalPlaces = values.reduce((max, v) => {
    const str = v.toString();
    const dotIdx = str.indexOf('.');
    if (dotIdx < 0) return max;
    return Math.max(max, str.length - dotIdx - 1);
  }, 0);

  return {
    decimalPlaces: Math.min(maxDecimalPlaces, 10),
    roundingMethod: 'half_even',
    source: 'inferred_from_outputs',
  };
}

/** Recursively collect output values from an intent operation tree */
function collectOutputValues(op: Record<string, unknown>, values: number[]): void {
  if (!op || typeof op !== 'object') return;

  const operation = op.operation as string | undefined;

  switch (operation) {
    case 'bounded_lookup_1d': {
      const outputs = op.outputs as number[] | undefined;
      if (Array.isArray(outputs)) values.push(...outputs.filter(v => typeof v === 'number'));
      break;
    }
    case 'bounded_lookup_2d': {
      const grid = op.outputGrid as number[][] | undefined;
      if (Array.isArray(grid)) {
        for (const row of grid) {
          if (Array.isArray(row)) values.push(...row.filter(v => typeof v === 'number'));
        }
      }
      break;
    }
    case 'scalar_multiply': {
      if (typeof op.rate === 'number') values.push(op.rate);
      // Recurse into nested input/rate operations
      if (op.input && typeof op.input === 'object' && 'operation' in (op.input as Record<string, unknown>)) {
        collectOutputValues(op.input as Record<string, unknown>, values);
      }
      if (op.rate && typeof op.rate === 'object' && 'operation' in (op.rate as Record<string, unknown>)) {
        collectOutputValues(op.rate as Record<string, unknown>, values);
      }
      break;
    }
    case 'conditional_gate': {
      if (op.onTrue && typeof op.onTrue === 'object') {
        collectOutputValues(op.onTrue as Record<string, unknown>, values);
      }
      if (op.onFalse && typeof op.onFalse === 'object') {
        collectOutputValues(op.onFalse as Record<string, unknown>, values);
      }
      break;
    }
    case 'constant': {
      if (typeof op.value === 'number') values.push(op.value);
      break;
    }
  }
}

/** Collect output values from legacy component configs */
function collectConfigValues(config: Record<string, unknown>, values: number[]): void {
  // Tier config
  const tiers = (config as Record<string, unknown>).tiers as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(tiers)) {
    for (const tier of tiers) {
      if (typeof tier.payout === 'number') values.push(tier.payout);
      if (typeof tier.value === 'number') values.push(tier.value);
    }
  }

  // Matrix config
  const matrixValues = (config as Record<string, unknown>).values as number[][] | undefined;
  if (Array.isArray(matrixValues)) {
    for (const row of matrixValues) {
      if (Array.isArray(row)) values.push(...row.filter(v => typeof v === 'number'));
    }
  }

  // Percentage config
  if (typeof (config as Record<string, unknown>).rate === 'number') {
    values.push((config as Record<string, unknown>).rate as number);
  }

  // Conditional config
  const conditions = (config as Record<string, unknown>).conditions as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(conditions)) {
    for (const cond of conditions) {
      if (typeof cond.rate === 'number') values.push(cond.rate);
    }
  }
}
