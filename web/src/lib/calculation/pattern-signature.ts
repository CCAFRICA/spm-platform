/**
 * Pattern Signature Generator
 *
 * Produces structural hashes from ComponentIntent.
 * Zero domain language. Purely structural description.
 *
 * Examples:
 *   "bounded_lookup_2d:ratio+metric:g2x2:entity"
 *   "bounded_lookup_1d:metric:b3:entity"
 *   "scalar_multiply:metric:rate_num:entity"
 *   "scalar_multiply:metric:rate_op(bounded_lookup_1d):entity"
 *   "conditional_gate:metric+constant:entity"
 */

import type { ComponentIntent, IntentOperation, IntentSource } from './intent-types';
import { isIntentOperation } from './intent-types';

/**
 * Generate a structural signature for a ComponentIntent.
 * Same structure → same signature, regardless of labels or metric names.
 */
export function generatePatternSignature(intent: ComponentIntent): string {
  const scope = intent.dataSource.entityScope;
  const modifiers = intent.modifiers.length > 0
    ? ':' + intent.modifiers.map(m => m.modifier).sort().join('+')
    : '';

  if (intent.variants) {
    return `variant:${intent.variants.routes.length}routes:${scope}${modifiers}`;
  }

  if (!intent.intent) {
    return `empty:${scope}${modifiers}`;
  }

  return `${describeOperation(intent.intent)}:${scope}${modifiers}`;
}

/**
 * Describe an operation structurally (recursive for nested ops).
 */
function describeOperation(op: IntentOperation): string {
  switch (op.operation) {
    case 'bounded_lookup_1d':
      return `bounded_lookup_1d:${describeInput(op.input)}:b${op.boundaries.length}`;

    case 'bounded_lookup_2d':
      return `bounded_lookup_2d:${describeInput(op.inputs.row)}+${describeInput(op.inputs.column)}:g${op.rowBoundaries.length}x${op.columnBoundaries.length}`;

    case 'scalar_multiply': {
      const rateDesc = typeof op.rate === 'number'
        ? 'rate_num'
        : `rate_op(${describeOperation(op.rate)})`;
      return `scalar_multiply:${describeInput(op.input)}:${rateDesc}`;
    }

    case 'conditional_gate':
      return `conditional_gate:${describeInput(op.condition.left)}+${describeInput(op.condition.right)}`;

    case 'aggregate':
      return `aggregate:${describeSourceType(op.source)}`;

    case 'ratio':
      return `ratio:${describeSourceType(op.numerator)}+${describeSourceType(op.denominator)}`;

    case 'constant':
      return 'constant';
  }
}

/**
 * Describe an input that may be IntentSource or IntentOperation.
 */
function describeInput(input: IntentSource | IntentOperation): string {
  if (isIntentOperation(input)) {
    return `op(${describeOperation(input)})`;
  }
  return describeSourceType(input);
}

/**
 * Describe a source type (just the kind, not the field name).
 */
function describeSourceType(src: IntentSource): string {
  return src.source;
}
