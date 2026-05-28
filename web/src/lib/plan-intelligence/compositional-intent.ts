/**
 * HF-251 — CompositionalIntent Schema
 *
 * Implements Decision 158 (LOCKED): the LLM emits a compact CompositionalIntent
 * describing a plan component's structure using grammar vocabulary; deterministic
 * code constructs the PrimeNode DAG tree from that intent.
 *
 * Per Decision 158 + DS-024 v1.0:
 *   - LLM RECOGNITION: identifies WHAT structural shape the plan describes
 *     (banded lookup, arithmetic rate, conditional gate, composed structure)
 *     and the SEMANTIC INPUTS (which fields, which breaks, which outputs).
 *   - CODE CONSTRUCTION: builds the full PrimeNode tree from those semantic
 *     inputs deterministically. Half-open intervals, terminal completeness,
 *     scale metadata placement are constructor responsibilities.
 *
 * The LLM emission size scales with O(semantic_complexity), not O(tree_size).
 * A 30-cell 2D matrix's CompositionalIntent is ~750 bytes; the PrimeNode tree
 * the constructor produces is ~28KB. The LLM never has to emit the tree.
 *
 * Per T1-E910 v2 (Korean Test): this file imports PrimeNode/ConstantScaleMeta
 * from intent-types.ts. The grammar is the canonical vocabulary on BOTH sides
 * of the construction boundary — the intent uses grammar field names; the
 * constructor produces grammar trees.
 *
 * Per AUD-009 (Registry/Cherry-Pick structural preclusion): the intent's
 * shapes (banded_lookup / arithmetic / conditional / composed) are structural
 * descriptions, not named compensation patterns. The constructor recurses
 * through them; no closed taxonomy of business semantics.
 */

import type { PrimeNode, ConstantScaleMeta } from '../calculation/intent-types';

// ─────────────────────────────────────────────
// ReferenceSource — how a numeric reference is resolved at runtime
// ─────────────────────────────────────────────
//
// Each source kind corresponds to a grammar pattern the constructor knows
// how to express. The LLM picks the kind; the constructor builds the prime
// composition that realizes it.

export type ReferenceSource =
  | { type: 'ratio'; numerator_field: string; denominator_field: string }
  | { type: 'aggregate'; field: string; op: 'sum' | 'count' | 'avg' | 'min' | 'max' }
  | { type: 'metric'; field: string }
  | { type: 'attribute'; field: string }
  | { type: 'cross_data'; data_type: string; field?: string; aggregation: 'count' | 'sum' }
  | { type: 'scope_aggregate'; field: string; boundary: string; op: 'sum' | 'count' | 'avg' | 'min' | 'max' }
  | { type: 'prior_component'; component_index: number };

// ─────────────────────────────────────────────
// OperandDescription — used by arithmetic / conditional operands
// ─────────────────────────────────────────────

export type OperandDescription =
  | { kind: 'reference'; source: ReferenceSource }
  | { kind: 'constant'; value: number }
  | { kind: 'structure'; structure: StructuralDescription };

// ─────────────────────────────────────────────
// BandedLookupDescription — N-dimensional tier table
// ─────────────────────────────────────────────
//
// dimensions: ordered array of dimension descriptors. For a 1D 4-tier band,
// dimensions has length 1 with 3 breaks. For a 6×5 2D matrix, dimensions
// has length 2 with [5 breaks, 4 breaks] (row breaks then column breaks).
//
// outputs: flat array indexed by joint cell. For dimensions [breaks_a, breaks_b],
// the cell at (i, j) maps to index i * (breaks_b.length + 1) + j.
// Length must equal product of (breaks.length + 1) across all dimensions.
//
// breaks: in ascending order. Half-open intervals [break[i], break[i+1])
// are produced by the constructor; the LLM emits the breakpoint values only.
//
// output_derivation: optional. When outputs are not literal constants but
// derived from references (e.g., "5% of revenue per tier"), the derivation
// describes the per-cell computation.

export interface BandedLookupDimension {
  reference_field: string;
  reference_source: ReferenceSource;
  breaks: number[];
}

export interface BandedLookupDescription {
  shape: 'banded_lookup';
  dimensions: BandedLookupDimension[];
  outputs: number[];
  output_derivation?: OperandDescription;
}

// ─────────────────────────────────────────────
// ArithmeticDescription — binary arithmetic composition
// ─────────────────────────────────────────────

export interface ArithmeticDescription {
  shape: 'arithmetic';
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  operands: [OperandDescription, OperandDescription];
}

// ─────────────────────────────────────────────
// ConditionalDescription — gate with then/else
// ─────────────────────────────────────────────

export interface ConditionalDescription {
  shape: 'conditional';
  condition: {
    reference: ReferenceSource;
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
    threshold: number;
  };
  then: StructuralDescription | OperandDescription;
  else: StructuralDescription | OperandDescription;
}

// ─────────────────────────────────────────────
// ComposedDescription — composition wrapper (sum/max/min/first_match of children)
// ─────────────────────────────────────────────

export interface ComposedDescription {
  shape: 'composed';
  composition: 'sum' | 'max' | 'min' | 'first_match';
  children: StructuralDescription[];
}

// ─────────────────────────────────────────────
// StructuralDescription — discriminated on `shape`
// ─────────────────────────────────────────────

export type StructuralDescription =
  | BandedLookupDescription
  | ArithmeticDescription
  | ConditionalDescription
  | ComposedDescription;

// ─────────────────────────────────────────────
// ScaleSpec — which side of the boundary applies scale
// ─────────────────────────────────────────────
//
// Per HF-244 mutual exclusion: scale is applied at exactly one site. The LLM
// reports which site is authoritative for THIS component; the constructor
// places ConstantScaleMeta on the outermost node when evaluator scaling
// applies, or omits meta entirely when convergence scaling applies (in
// which case scale_factor lives on the binding).
//
// scale.value is the multiplier (e.g., 100 for percent → ratio normalization).
// scale.unit names the metric's native unit on the plan side.

export interface ScaleSpec {
  side: 'evaluator' | 'convergence';
  unit: ConstantScaleMeta['unit'];
  value: number;
  confidence: number;
  reference_field?: string;
}

// ─────────────────────────────────────────────
// CompositionalIntent — the LLM's per-component emission
// ─────────────────────────────────────────────

export interface CompositionalIntent {
  component_id: string;
  component_name: string;
  /**
   * HF-252: which entity categories this component applies to. Maps to
   * appliesToEmployeeTypes in the existing variant decomposition pipeline
   * (interpretationToPlanConfig filters allComponents by appliesToEmployeeTypes
   * per employee type; HF-119 variant router selects each entity's variant
   * before component evaluation).
   *
   * Role / category differentiation lives HERE — at the variant boundary,
   * ABOVE component evaluation. A CompositionalIntent's `structure` field
   * MUST NOT encode role differentiation via internal categorical conditionals
   * or `attribute` references; the platform's variant assignment handles
   * that upstream. If a plan pays different rates by category, the LLM
   * emits the component ONCE per category and declares which category
   * each emission applies to via this field.
   *
   * Semantics:
   *   omitted / empty / ['all'] = applies to all variants
   *   ['<category-id>', ...]    = applies only to the listed variant ids
   *
   * The category ids must match those declared in the plan_skeleton's
   * employeeTypes index so variant filtering routes correctly.
   */
  applies_to?: string[];
  structure: StructuralDescription;
  scale: ScaleSpec | null;
  output_precision: number;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// ConstructionError — thrown when constructor input is malformed
// ─────────────────────────────────────────────
//
// Per T1-E906 v2: failures surface as diagnostic signals, not silent
// fallbacks. The error carries the failing intent path so callers can map
// to the HF-248 error class taxonomy (cognition_truncation /
// cognition_violation) and surface a structured diagnostic to the user.

export class ConstructionError extends Error {
  constructor(
    public readonly path: string,
    public readonly intent: StructuralDescription | OperandDescription | ReferenceSource | null,
    message: string,
  ) {
    super(`[intent-constructor] ${path}: ${message}`);
    this.name = 'ConstructionError';
  }
}

// ─────────────────────────────────────────────
// Re-exports for downstream callers
// ─────────────────────────────────────────────

export type { PrimeNode, ConstantScaleMeta };
