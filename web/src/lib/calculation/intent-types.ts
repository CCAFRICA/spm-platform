/**
 * Calculation Intent — Structural Vocabulary
 *
 * The contract between Domain Agents and Foundational Agents.
 * ZERO domain language in this file. The executor does not know
 * what domain it operates in. It processes structures.
 *
 * Per Decision 155 (LOCKED 2026-04-27), the canonical operation vocabulary
 * lives in `primitive-registry.ts`. The shape interfaces in this file
 * (BoundedLookup1D, BoundedLookup2D, etc.) carry the per-primitive
 * structural shape; their `operation` discriminator references the
 * `FoundationalPrimitive` union exported from the registry. The
 * `IntentOperation` union enumerates the executable subset (those
 * primitives with corresponding shape interfaces and dispatch handlers).
 */

import type { FoundationalPrimitive } from './primitive-registry';

// ──────────────────────────────────────────────
// Input Sources — where a value comes from
// ──────────────────────────────────────────────

export type IntentSource =
  | { source: 'metric'; sourceSpec: { field: string } }
  | { source: 'ratio'; sourceSpec: { numerator: string; denominator: string } }
  | { source: 'aggregate'; sourceSpec: { field: string; scope: 'entity' | 'group' | 'global'; aggregation: AggregationType } }
  | { source: 'constant'; value: number }
  | { source: 'entity_attribute'; sourceSpec: { attribute: string } }
  | { source: 'prior_component'; sourceSpec: { componentIndex: number } }
  // OB-181: Cross-plan data count — counts/sums committed_data rows matching criteria
  | { source: 'cross_data'; sourceSpec: {
      dataType: string;     // structural filter on committed_data.data_type (e.g., 'equipment_sales')
      field?: string;       // field to aggregate (for sum). If absent, counts rows.
      aggregation: 'count' | 'sum';
    }}
  // OB-181: Hierarchical aggregate — sums a metric across all entities in scope
  | { source: 'scope_aggregate'; sourceSpec: {
      field: string;        // metric field to aggregate
      scope: 'district' | 'region';  // hierarchy level
      aggregation: AggregationType;
    }};

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
// Primitive Operations — registry-derived discriminators (Decision 155)
// ──────────────────────────────────────────────
//
// Each shape interface's `operation` field references a member of
// `FoundationalPrimitive` from `primitive-registry.ts` via `Op<T>`. If a
// shape interface is added with a discriminator string not in the registry,
// TypeScript rejects it at compile time — the structural enforcement
// Decision 155 demands.

/**
 * Constrains the literal type T to be a member of FoundationalPrimitive.
 * Acts as a compile-time check that every shape interface's `operation`
 * discriminator is a registered foundational primitive.
 */
type Op<T extends FoundationalPrimitive> = T;

export type IntentOperation =
  | BoundedLookup1D
  | BoundedLookup2D
  | ScalarMultiply
  | ConditionalGate
  | AggregateOp
  | RatioOp
  | ConstantOp
  | WeightedBlendOp
  | TemporalWindowOp
  | LinearFunctionOp
  | PiecewiseLinearOp;

/** 1D threshold table — maps a single value to an output */
export interface BoundedLookup1D {
  operation: Op<'bounded_lookup_1d'>;
  input: IntentSource | IntentOperation;   // Can be a computed value
  boundaries: Boundary[];
  outputs: number[];
  noMatchBehavior: 'zero' | 'error' | 'nearest';
  /** OB-117: When true, outputs are rates (e.g., 0.003 = 0.3%) to multiply
   * against the input value, not flat payout amounts. The executor returns
   * output × inputValue instead of just output. */
  isMarginal?: boolean;
}

/** 2D grid lookup — maps two values to a grid output */
export interface BoundedLookup2D {
  operation: Op<'bounded_lookup_2d'>;
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
  operation: Op<'scalar_multiply'>;
  input: IntentSource | IntentOperation;   // Can be a nested operation
  rate: number | IntentOperation;           // Can be a nested operation (e.g., lookup result)
}

/** Conditional branching — evaluate condition, execute one of two operations */
export interface ConditionalGate {
  operation: Op<'conditional_gate'>;
  condition: {
    left: IntentSource;
    operator: '>=' | '>' | '<=' | '<' | '=' | '==' | '!=';
    right: IntentSource;
  };
  onTrue: IntentOperation;
  onFalse: IntentOperation;
}

/** Aggregation — return aggregated value */
export interface AggregateOp {
  operation: Op<'aggregate'>;
  source: IntentSource;
}

/** Ratio — numerator / denominator with zero-guard */
export interface RatioOp {
  operation: Op<'ratio'>;
  numerator: IntentSource;
  denominator: IntentSource;
  zeroDenominatorBehavior: 'zero' | 'error' | 'null';
}

/** Fixed value */
export interface ConstantOp {
  operation: Op<'constant'>;
  value: number;
}

/** N-input weighted combination — weights must sum to 1.0 */
export interface WeightedBlendOp {
  operation: Op<'weighted_blend'>;
  inputs: Array<{
    source: IntentSource | IntentOperation;   // composable — can be nested
    weight: number;                            // 0-1, all weights must sum to 1.0
    scope?: 'entity' | 'group';               // optional scope override per input
  }>;
}

/** Rolling N-period aggregation over historical values */
export interface TemporalWindowOp {
  operation: Op<'temporal_window'>;
  input: IntentSource | IntentOperation;       // composable
  windowSize: number;                           // number of periods
  aggregation: TemporalAggregation;
  includeCurrentPeriod: boolean;
}

export type TemporalAggregation = 'sum' | 'average' | 'min' | 'max' | 'trend';

/** OB-180: Linear function — y = slope * x + intercept */
export interface LinearFunctionOp {
  operation: Op<'linear_function'>;
  input: IntentSource | IntentOperation;
  slope: number;
  intercept: number;
}

/** OB-180: Piecewise linear — attainment determines rate segment, applied to base input */
export interface PiecewiseLinearOp {
  operation: Op<'piecewise_linear'>;
  /** The ratio/attainment input that determines which segment applies */
  ratioInput: IntentSource | IntentOperation;
  /** The base value to multiply the rate by (e.g., revenue) */
  baseInput: IntentSource | IntentOperation;
  /** OB-186: Target/quota value for computing attainment when denominator metric unavailable.
   *  When ratioInput resolves to 0 (missing denominator), evaluator uses:
   *  attainment = baseValue / targetValue */
  targetValue?: number;
  /** Rate segments — each defines a range and its rate */
  segments: Array<{
    min: number;
    max: number | null;  // null = no upper bound
    rate: number;
  }>;
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
  /**
   * OB-196 Phase 3 (E4 round-trip closure): foundational primitive identifier
   * persisted directly on the trace. Populated at trace construction in
   * intent-executor. Trace is self-describing — readers recover primitive
   * identity from the trace alone, no rule_sets dereference required.
   */
  componentType: string;
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

// ──────────────────────────────────────────────
// Output Precision (Decision 122 — DS-010)
// ──────────────────────────────────────────────

/** Output precision specification — per-component rounding */
export interface OutputPrecision {
  /** Number of decimal places to round to (0-10) */
  decimalPlaces: number;
  /** Rounding method — default: half_even (Banker's Rounding, IEEE 754) */
  roundingMethod: 'half_even' | 'half_up' | 'floor' | 'ceil' | 'truncate';
  /** How precision was determined (metadata for audit) */
  source: 'inferred_from_outputs' | 'explicit_in_plan' | 'default_currency' | 'user_override';
}

/** Rounding trace per component (stored in calculation_results.metadata) */
export interface RoundingTrace {
  componentIndex: number;
  label: string;
  rawValue: number;
  roundedValue: number;
  roundingAdjustment: number;
  precision: OutputPrecision;
}

/** Default output precision when not specified in plan */
export const DEFAULT_OUTPUT_PRECISION: OutputPrecision = {
  decimalPlaces: 2,
  roundingMethod: 'half_even',
  source: 'default_currency',
};

// ──────────────────────────────────────────────
// HF-238: Prime-Level DAG Calculation Engine
// ──────────────────────────────────────────────
//
// Every compensation calculation decomposes into compositions of seven
// irreducible operations + two leaf node types. The recursive `evaluate()`
// walker in intent-executor.ts is the ONE engine surface; all stored
// intents (legacy named-operation format and new prime-DAG format) flow
// through translation adapters at the storage boundary and produce
// PrimeNode trees that evaluate() processes.
//
// All legacy IntentOperation / IntentSource / IntentModifier interfaces
// (LinearFunctionOp, PiecewiseLinearOp, ConditionalGate, ScalarMultiply,
// BoundedLookup1D, BoundedLookup2D, AggregateOp, RatioOp, ConstantOp,
// WeightedBlendOp, TemporalWindowOp) are retained ABOVE this section as
// read-only legacy formats consumed by legacyIntentToDAG(). They are NOT
// referenced by the evaluate() walker.

/** Predicate used by filter prime — matches MetricDerivationRule['filters'][0] shape. */
export interface PrimePredicate {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number | boolean;
}

/**
 * PrimeNode — the engine's irreducible operation vocabulary.
 *
 * Topology:
 *   • `filter`, `scope`, `prior_period` carry `downstream: PrimeNode` —
 *     each modifies context for the sub-tree below it.
 *   • `aggregate` operates on whatever `activeRows` are in context
 *     (narrowed by upstream filter / scope / prior_period).
 *   • `arithmetic`, `compare`, `logical` operate on values via `inputs`.
 *   • `conditional` evaluates `condition`, then evaluates `then` or `else`.
 *   • `constant` and `reference` are leaves.
 *
 * HF-238 R2 Closure 5: `prior_period` added so delta derivations express
 * as `arithmetic(subtract, <current>, prior_period(<prior>))` — one
 * execution path for every derivation type.
 */
/**
 * OB-200 Phase 2: scale metadata on constant nodes. The LLM annotates the
 * constant with its native scale on the plan side ("120%" → value:120,
 * meta:{unit:'percent',scale:100}). The convergence layer reads this to
 * reconcile against data-native values without inference; the engine
 * evaluator applies the scale to the compared reference at evaluate() time.
 *
 * HF-339 (Validator Premise Correction): `unit` is the value's SELF-DESCRIBING
 * NATURE in the model's own free-form terms (any language) — NOT a closed,
 * developer-maintained enum. The prior `'percent'|'ratio'|'currency'|'count'`
 * set was a registry (AP-26 / No-Fixed-Taxonomy): a developer extended the
 * recognizer's valid vocabulary by editing a list. It is now open-vocabulary;
 * the deterministic evaluator reads ONLY the numeric `scale` (never `unit`),
 * so freeing the nature is calc-neutral. `scale` is the evaluator-side
 * normalization multiplier; `scale: 1` is identity (the nature is carried for
 * self-description/trace, but no evaluator rescale is applied — used when the
 * convergence binding's scale_factor already normalized the data, HF-279).
 */
export interface ConstantScaleMeta {
  /** Self-describing nature, free-form, the model's own terms (no enumerated set). */
  unit: string;
  /** Evaluator-side normalization multiplier (1 = identity, nature-carried-only). */
  scale: number;
  confidence: number;
}

/**
 * OB-200 Phase 2: temporal scope on `scope` nodes. Carries an optional
 * temporal_range that switches activeRows to a windowed slice of prior
 * periods, complementing the existing boundary attribute.
 */
export interface ScopeTemporalRange {
  offset: number;
  length: number;
}

export type PrimeNode =
  | { prime: 'arithmetic'; op: 'add' | 'subtract' | 'multiply' | 'divide'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'aggregate'; op: 'sum' | 'count' | 'avg' | 'min' | 'max'; field: string }
  | { prime: 'filter'; predicate: PrimePredicate; downstream: PrimeNode }
  | { prime: 'conditional'; condition: PrimeNode; then: PrimeNode; else: PrimeNode }
  | { prime: 'scope'; boundary: string; downstream: PrimeNode; temporal_range?: ScopeTemporalRange }
  | { prime: 'compare'; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'logical'; op: 'and' | 'or' | 'not'; inputs: PrimeNode[] }
  | { prime: 'constant'; value: number; meta?: ConstantScaleMeta }
  | { prime: 'reference'; field: string }
  | { prime: 'prior_period'; downstream: PrimeNode };

/** The execution context evaluate() carries down the tree. */
export interface EvalContext {
  /** Entity being evaluated — read by `scope` prime to look up the boundary value. */
  entity: { metadata: Record<string, unknown> };
  /** Data rows currently in scope. Narrowed by upstream `filter` / `scope` / `prior_period` primes. */
  activeRows: Record<string, unknown>[];
  /** All entity rows across the tenant — read by `scope` prime to find siblings. */
  allEntityRows: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }>;
  /** Resolved metrics map — read by `reference` prime; populated by upstream derivations. */
  metrics: Record<string, number>;
  /**
   * HF-238 R2 Closure 5: prior-period rows. The `prior_period` prime
   * switches activeRows to these for its downstream. Absent (or empty)
   * means delta computations beneath a `prior_period` prime see an
   * empty row set and resolve to zero.
   */
  priorPeriodRows?: Record<string, unknown>[];
  /**
   * HF-325 (Decision 111): true when this entity's metrics were resolved by convergence bindings
   * (the convergence_bindings resolution path). A convergence-bound field's value — with its
   * convergence reduction (sum/count/snapshot/…) already applied — lives in `metrics[field]`. The
   * `aggregate` prime then reads that authoritative scalar instead of re-deriving from rows. Unset on
   * the sheet-matching fallback path, where the row-iterating aggregate behavior is retained.
   */
  convergenceAuthoritative?: boolean;
  /**
   * HF-325: set true on the downstream context whenever `filter` / `scope` / `prior_period` narrows
   * `activeRows`. A bound aggregate evaluated beneath such a narrowing must re-derive from the
   * narrowed subset (the convergence scalar reflects the un-narrowed set), so the
   * convergence-authoritative bypass does NOT apply there.
   */
  activeRowsScoped?: boolean;
}

/** The ten recognized prime discriminators. */
export const VALID_PRIMES = new Set<PrimeNode['prime']>([
  'arithmetic',
  'aggregate',
  'filter',
  'conditional',
  'scope',
  'compare',
  'logical',
  'constant',
  'reference',
  'prior_period',
]);

/** Type guard — narrows unknown into PrimeNode. */
export function isPrimeNode(value: unknown): value is PrimeNode {
  return typeof value === 'object' && value !== null && 'prime' in value
    && typeof (value as Record<string, unknown>).prime === 'string'
    && VALID_PRIMES.has((value as { prime: string }).prime as PrimeNode['prime']);
}
