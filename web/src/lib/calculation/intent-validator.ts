/**
 * Intent Validator — Validates AI-produced ComponentIntents
 *
 * Checks structural integrity of intents produced by the AI Domain Agent.
 * Returns validation results with specific error messages.
 * If validation fails, the caller should fall back to the deterministic
 * transformer (OB-76 bridge).
 */

// Types referenced for documentation — validation uses runtime checks
import type {} from './intent-types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_OPERATIONS = [
  'bounded_lookup_1d',
  'bounded_lookup_2d',
  'scalar_multiply',
  'conditional_gate',
  'aggregate',
  'ratio',
  'constant',
] as const;

const VALID_SOURCES = [
  'metric',
  'ratio',
  'aggregate',
  'constant',
  'entity_attribute',
  'prior_component',
] as const;

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Validate a raw AI-produced intent object.
 * Returns { valid, errors, warnings }.
 */
export function validateIntent(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Intent is null or not an object'], warnings };
  }

  const obj = raw as Record<string, unknown>;

  // Check operation field
  const operation = obj.operation as string;
  if (!operation) {
    errors.push('Missing "operation" field');
    return { valid: false, errors, warnings };
  }

  if (!VALID_OPERATIONS.includes(operation as typeof VALID_OPERATIONS[number])) {
    errors.push(`Invalid operation: "${operation}". Must be one of: ${VALID_OPERATIONS.join(', ')}`);
    return { valid: false, errors, warnings };
  }

  // Validate based on operation type
  switch (operation) {
    case 'bounded_lookup_1d':
      validateBoundedLookup1D(obj, errors, warnings);
      break;
    case 'bounded_lookup_2d':
      validateBoundedLookup2D(obj, errors, warnings);
      break;
    case 'scalar_multiply':
      validateScalarMultiply(obj, errors);
      break;
    case 'conditional_gate':
      validateConditionalGate(obj, errors, warnings);
      break;
    case 'aggregate':
      validateAggregate(obj, errors);
      break;
    case 'ratio':
      validateRatio(obj, errors);
      break;
    case 'constant':
      validateConstant(obj, errors);
      break;
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a complete ComponentIntent (with metadata wrapper).
 */
export function validateComponentIntent(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['ComponentIntent is null or not an object'], warnings };
  }

  const obj = raw as Record<string, unknown>;

  // Check required fields
  if (typeof obj.componentIndex !== 'number') {
    errors.push('Missing or invalid componentIndex');
  }
  if (typeof obj.label !== 'string') {
    warnings.push('Missing label');
  }
  if (typeof obj.confidence !== 'number') {
    warnings.push('Missing confidence');
  }

  // Validate intent operation (if no variants)
  if (obj.intent) {
    const intentResult = validateIntent(obj.intent);
    errors.push(...intentResult.errors);
    warnings.push(...intentResult.warnings);
  } else if (!obj.variants) {
    errors.push('ComponentIntent has neither intent nor variants');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ──────────────────────────────────────────────
// Source Validation
// ──────────────────────────────────────────────

function validateSource(src: unknown, label: string, errors: string[]): boolean {
  if (!src || typeof src !== 'object') {
    errors.push(`${label}: missing or invalid source`);
    return false;
  }

  const s = src as Record<string, unknown>;
  const source = s.source as string;

  if (!source || !VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) {
    errors.push(`${label}: invalid source type "${source}"`);
    return false;
  }

  switch (source) {
    case 'metric':
      if (!s.sourceSpec || typeof (s.sourceSpec as Record<string, unknown>).field !== 'string') {
        errors.push(`${label}: metric source missing field`);
        return false;
      }
      break;
    case 'ratio':
      if (!s.sourceSpec ||
        typeof (s.sourceSpec as Record<string, unknown>).numerator !== 'string' ||
        typeof (s.sourceSpec as Record<string, unknown>).denominator !== 'string') {
        errors.push(`${label}: ratio source missing numerator/denominator`);
        return false;
      }
      break;
    case 'constant':
      if (typeof s.value !== 'number') {
        errors.push(`${label}: constant source missing value`);
        return false;
      }
      break;
    case 'entity_attribute':
      if (!s.sourceSpec || typeof (s.sourceSpec as Record<string, unknown>).attribute !== 'string') {
        errors.push(`${label}: entity_attribute source missing attribute`);
        return false;
      }
      break;
    case 'prior_component':
      if (!s.sourceSpec || typeof (s.sourceSpec as Record<string, unknown>).componentIndex !== 'number') {
        errors.push(`${label}: prior_component source missing componentIndex`);
        return false;
      }
      break;
  }

  return true;
}

// ──────────────────────────────────────────────
// Boundary Validation
// ──────────────────────────────────────────────

function validateBoundary(b: unknown, index: number, label: string, errors: string[], warnings: string[]): boolean {
  if (!b || typeof b !== 'object') {
    errors.push(`${label}[${index}]: not an object`);
    return false;
  }

  const boundary = b as Record<string, unknown>;
  const min = boundary.min;
  const max = boundary.max;

  // min and max can be null (unbounded) or number
  if (min !== null && typeof min !== 'number') {
    errors.push(`${label}[${index}]: min must be number or null`);
    return false;
  }
  if (max !== null && typeof max !== 'number') {
    errors.push(`${label}[${index}]: max must be number or null`);
    return false;
  }

  // Check ordering: min <= max (if both present)
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    warnings.push(`${label}[${index}]: min (${min}) > max (${max})`);
  }

  return true;
}

// ──────────────────────────────────────────────
// Operation Validators
// ──────────────────────────────────────────────

function validateBoundedLookup1D(obj: Record<string, unknown>, errors: string[], warnings: string[]): void {
  // Input
  validateSource(obj.input, 'bounded_lookup_1d.input', errors);

  // Boundaries
  const boundaries = obj.boundaries;
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    errors.push('bounded_lookup_1d: boundaries must be non-empty array');
    return;
  }

  for (let i = 0; i < boundaries.length; i++) {
    validateBoundary(boundaries[i], i, 'boundary', errors, warnings);
  }

  // Outputs
  const outputs = obj.outputs;
  if (!Array.isArray(outputs)) {
    errors.push('bounded_lookup_1d: outputs must be array');
    return;
  }

  if (boundaries.length !== outputs.length) {
    errors.push(`bounded_lookup_1d: boundaries length (${boundaries.length}) !== outputs length (${outputs.length})`);
  }

  for (let i = 0; i < outputs.length; i++) {
    if (typeof outputs[i] !== 'number') {
      errors.push(`bounded_lookup_1d: outputs[${i}] is not a number`);
    }
  }
}

function validateBoundedLookup2D(obj: Record<string, unknown>, errors: string[], warnings: string[]): void {
  const inputs = obj.inputs as Record<string, unknown> | undefined;
  if (!inputs) {
    errors.push('bounded_lookup_2d: missing inputs');
    return;
  }

  validateSource(inputs.row, 'bounded_lookup_2d.inputs.row', errors);
  validateSource(inputs.column, 'bounded_lookup_2d.inputs.column', errors);

  const rowBoundaries = obj.rowBoundaries;
  const colBoundaries = obj.columnBoundaries;

  if (!Array.isArray(rowBoundaries) || rowBoundaries.length === 0) {
    errors.push('bounded_lookup_2d: rowBoundaries must be non-empty array');
  } else {
    for (let i = 0; i < rowBoundaries.length; i++) {
      validateBoundary(rowBoundaries[i], i, 'rowBoundary', errors, warnings);
    }
  }

  if (!Array.isArray(colBoundaries) || colBoundaries.length === 0) {
    errors.push('bounded_lookup_2d: columnBoundaries must be non-empty array');
  } else {
    for (let i = 0; i < colBoundaries.length; i++) {
      validateBoundary(colBoundaries[i], i, 'colBoundary', errors, warnings);
    }
  }

  const grid = obj.outputGrid;
  if (!Array.isArray(grid)) {
    errors.push('bounded_lookup_2d: outputGrid must be array');
    return;
  }

  if (Array.isArray(rowBoundaries) && grid.length !== rowBoundaries.length) {
    errors.push(`bounded_lookup_2d: outputGrid rows (${grid.length}) !== rowBoundaries (${rowBoundaries.length})`);
  }

  if (Array.isArray(colBoundaries)) {
    for (let r = 0; r < grid.length; r++) {
      if (!Array.isArray(grid[r])) {
        errors.push(`bounded_lookup_2d: outputGrid[${r}] is not an array`);
      } else if (grid[r].length !== colBoundaries.length) {
        errors.push(`bounded_lookup_2d: outputGrid[${r}] columns (${grid[r].length}) !== columnBoundaries (${colBoundaries.length})`);
      }
    }
  }
}

function validateScalarMultiply(obj: Record<string, unknown>, errors: string[]): void {
  validateSource(obj.input, 'scalar_multiply.input', errors);
  if (typeof obj.rate !== 'number') {
    errors.push('scalar_multiply: rate must be a number');
  }
}

function validateConditionalGate(obj: Record<string, unknown>, errors: string[], warnings: string[]): void {
  const condition = obj.condition as Record<string, unknown> | undefined;
  if (!condition) {
    errors.push('conditional_gate: missing condition');
    return;
  }

  validateSource(condition.left, 'conditional_gate.condition.left', errors);
  validateSource(condition.right, 'conditional_gate.condition.right', errors);

  const validOps = ['>=', '>', '<=', '<', '==', '!='];
  if (!validOps.includes(condition.operator as string)) {
    errors.push(`conditional_gate: invalid operator "${condition.operator}"`);
  }

  // Validate onTrue and onFalse recursively
  if (obj.onTrue) {
    const trueResult = validateIntent(obj.onTrue);
    errors.push(...trueResult.errors.map(e => `onTrue: ${e}`));
    warnings.push(...trueResult.warnings.map(w => `onTrue: ${w}`));
  } else {
    errors.push('conditional_gate: missing onTrue');
  }

  if (obj.onFalse) {
    const falseResult = validateIntent(obj.onFalse);
    errors.push(...falseResult.errors.map(e => `onFalse: ${e}`));
    warnings.push(...falseResult.warnings.map(w => `onFalse: ${w}`));
  } else {
    errors.push('conditional_gate: missing onFalse');
  }
}

function validateAggregate(obj: Record<string, unknown>, errors: string[]): void {
  validateSource(obj.source, 'aggregate.source', errors);
}

function validateRatio(obj: Record<string, unknown>, errors: string[]): void {
  validateSource(obj.numerator, 'ratio.numerator', errors);
  validateSource(obj.denominator, 'ratio.denominator', errors);
}

function validateConstant(obj: Record<string, unknown>, errors: string[]): void {
  if (typeof obj.value !== 'number') {
    errors.push('constant: value must be a number');
  }
}
