/**
 * Calculation Intent — Structural Vocabulary
 *
 * The contract between Domain Agents and Foundational Agents.
 * ZERO domain language in this file. The executor does not know
 * what domain it operates in. It processes structures.
 *
 * 7 primitive operations, 6 input sources, 4 modifier types.
 */

// ──────────────────────────────────────────────
// Input Sources — where a value comes from
// ──────────────────────────────────────────────

export type IntentSource =
  | { source: 'metric'; sourceSpec: { field: string } }
  | { source: 'ratio'; sourceSpec: { numerator: string; denominator: string } }
  | { source: 'aggregate'; sourceSpec: { field: string; scope: 'entity' | 'group' | 'global'; aggregation: AggregationType } }
  | { source: 'constant'; value: number }
  | { source: 'entity_attribute'; sourceSpec: { attribute: string } }
  | { source: 'prior_component'; sourceSpec: { componentIndex: number } };

export type AggregationType = 'sum' | 'average' | 'count' | 'min' | 'max' | 'first' | 'last';

// ──────────────────────────────────────────────
// Boundary — a range for lookup operations
// ──────────────────────────────────────────────

export interface Boundary {
  min: number | null;       // null = no lower bound
  max: number | null;       // null = no upper bound
  minInclusive?: boolean;   // default true
  maxInclusive?: boolean;   // default false
}

// ──────────────────────────────────────────────
// The 7 Primitive Operations
// ──────────────────────────────────────────────

export type IntentOperation =
  | BoundedLookup1D
  | BoundedLookup2D
  | ScalarMultiply
  | ConditionalGate
  | AggregateOp
  | RatioOp
  | ConstantOp;

/** 1D threshold table — maps a single value to an output */
export interface BoundedLookup1D {
  operation: 'bounded_lookup_1d';
  input: IntentSource | IntentOperation;   // Can be a computed value
  boundaries: Boundary[];
  outputs: number[];
  noMatchBehavior: 'zero' | 'error' | 'nearest';
}

/** 2D grid lookup — maps two values to a grid output */
export interface BoundedLookup2D {
  operation: 'bounded_lookup_2d';
  inputs: {
    row: IntentSource | IntentOperation;    // Can be computed
    column: IntentSource | IntentOperation;  // Can be computed
  };
  rowBoundaries: Boundary[];
  columnBoundaries: Boundary[];
  outputGrid: number[][];   // outputGrid[rowIndex][colIndex]
  noMatchBehavior: 'zero' | 'error' | 'nearest';
}

/** Fixed rate multiplication — input × rate */
export interface ScalarMultiply {
  operation: 'scalar_multiply';
  input: IntentSource | IntentOperation;   // Can be a nested operation
  rate: number | IntentOperation;           // Can be a nested operation (e.g., lookup result)
}

/** Conditional branching — evaluate condition, execute one of two operations */
export interface ConditionalGate {
  operation: 'conditional_gate';
  condition: {
    left: IntentSource;
    operator: '>=' | '>' | '<=' | '<' | '==' | '!=';
    right: IntentSource;
  };
  onTrue: IntentOperation;
  onFalse: IntentOperation;
}

/** Aggregation — return aggregated value */
export interface AggregateOp {
  operation: 'aggregate';
  source: IntentSource;
}

/** Ratio — numerator / denominator with zero-guard */
export interface RatioOp {
  operation: 'ratio';
  numerator: IntentSource;
  denominator: IntentSource;
  zeroDenominatorBehavior: 'zero' | 'error' | 'null';
}

/** Fixed value */
export interface ConstantOp {
  operation: 'constant';
  value: number;
}

// ──────────────────────────────────────────────
// Modifiers — applied after base calculation
// ──────────────────────────────────────────────

export type IntentModifier =
  | { modifier: 'cap'; maxValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'floor'; minValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'proration'; numerator: IntentSource; denominator: IntentSource }
  | { modifier: 'temporal_adjustment'; lookbackPeriods: number; triggerCondition: IntentSource; adjustmentType: 'full_reversal' | 'partial' | 'prorated' };

// ──────────────────────────────────────────────
// Variant Routing — route to different operations
// based on entity attribute
// ──────────────────────────────────────────────

export interface VariantRouting {
  routingAttribute: IntentSource;
  routes: Array<{
    matchValue: string | number | boolean;
    intent: IntentOperation;
  }>;
  noMatchBehavior: 'error' | 'skip' | 'first';
}

// ──────────────────────────────────────────────
// Complete Component Intent
// ──────────────────────────────────────────────

export interface ComponentIntent {
  componentIndex: number;
  label: string;
  confidence: number;
  dataSource: {
    sheetClassification: string;
    entityScope: 'entity' | 'group';
    requiredMetrics: string[];
    groupLinkField?: string;
  };
  variants?: VariantRouting;
  intent?: IntentOperation;       // used when no variants
  modifiers: IntentModifier[];
  metadata: {
    domainLabel?: string;
    planReference?: string;
    aiConfidence?: number;
    interpretationNotes?: string;
  };
}

// ──────────────────────────────────────────────
// Execution Trace — audit/reconciliation/explanation
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Type Guard — distinguish IntentOperation from IntentSource
// ──────────────────────────────────────────────

export function isIntentOperation(value: unknown): value is IntentOperation {
  return typeof value === 'object' && value !== null && 'operation' in value;
}

export interface ExecutionTrace {
  entityId: string;
  componentIndex: number;
  variantRoute?: {
    attribute: string;
    value: string | number | boolean;
    matched: string;
  };
  inputs: Record<string, {
    source: string;
    rawValue: unknown;
    resolvedValue: number;
  }>;
  lookupResolution?: {
    rowBoundaryMatched?: { min: number | null; max: number | null; index: number };
    columnBoundaryMatched?: { min: number | null; max: number | null; index: number };
    outputValue: number;
  };
  modifiers: Array<{
    modifier: string;
    before: number;
    after: number;
  }>;
  finalOutcome: number;
  confidence: number;
}
