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
  | { type: 'prior_component'; component_index: number }
  // OB-225: row-level filtered aggregate — aggregate a measure over the entity's OWN
  // transaction rows that match a predicate (e.g. count rows WHERE Verificado='Si';
  // sum Monto_Total WHERE Categoria='ALI'). The constructor emits filter(predicate){
  // aggregate(op, field) }, evaluated against the entity's activeRows at calc time.
  //
  // This filters ROWS (transactions) WITHIN one entity's component. It is NOT entity/role
  // differentiation (HF-252 routes per-ENTITY categories at the variant boundary via
  // applies_to) — a single entity legitimately has rows of several categories here.
  // `field` is omitted for op:'count' (count is row-cardinality).
  | {
      type: 'filtered_aggregate';
      op: 'sum' | 'count' | 'avg' | 'min' | 'max';
      field?: string;
      predicate: {
        field: string;
        operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
        value: string | number;
      };
    }
  // HF-341 (RA-2): reference-table read — look up a value from a reference data_type keyed by a
  // column, as a FIRST-CLASS operation alongside aggregate(column, op). This is the Robles
  // factor-model primitive (participant_rate = ref(base_table, recipient) × ref(product_factor,
  // category) × …): a value resolved from a dimensional table by a key, NOT an aggregation over the
  // entity's own rows. The constructor realizes the resolvable (static-key) form as
  // filter(key_column == keyValue){ aggregate(value_column, op) } over the joined reference rows
  // (HF-329 reference-join merges reference rows into the entity's activeRows at calc time); a fully
  // dynamic key (resolved from another reference at calc time) is the Robles engine arc and fails
  // loud at construction rather than constructing a wrong tree (C2). MIR exercises no reference read.
  // Korean Test: data_type is the LLM's free-form classification surface; no table-name registry.
  | {
      type: 'reference_lookup';
      data_type: string;        // the reference sheet's free-form data_type classification
      key_column: string;       // the reference-table column matched against the key value
      key_source: ReferenceSource;  // resolves the key value (e.g. an entity attribute/metric)
      value_column: string;     // the reference-table column whose value is returned
      op?: 'sum' | 'avg' | 'min' | 'max' | 'first';  // collapse when multiple ref rows match (default first)
    };

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
    // HF-341 (RA-4): the comparison RHS is operand-typed so a gate can express BOTH a numeric
    // threshold (the common eligibility gate: collection_rate > 0.70) AND a categorical attribute
    // match (channel == "wholesale", product_line == "<machine_line>"). Resolution precedence in
    // constructConditional: rightReference > value > threshold. Open-vocabulary — the category VALUE
    // is a free-form string with NO enumerated set; the operator set {gt,gte,lt,lte,eq,neq} is the
    // structural compare alphabet (peer of arithmetic +−×÷), not a domain taxonomy. The engine's
    // `compare` prime already evaluates string eq/neq (OB-220), so no engine change is needed.
    threshold?: number;                  // numeric gate (byte-identical construction via buildConstantWithScale)
    value?: string | number | boolean;   // RA-4: categorical/numeric operand value (string → categorical compare)
    rightReference?: ReferenceSource;     // RA-4: reference-vs-reference comparison
  };
  then: StructuralDescription | OperandDescription;
  else: StructuralDescription | OperandDescription;
}

// ─────────────────────────────────────────────
// ComposedDescription — composition wrapper (sum/multiply/max/min/first_match of children)
// ─────────────────────────────────────────────
//
// HF-341 (RA-1): `multiply` makes an N-factor multiplicative CHAIN declarable in the DAG —
// total = c0 × c1 × … × cn — NOT a two-component special case. This is the Robles factor-model
// shape (participant_rate = ref(base) × ref(product_factor) × ref(channel_factor)). The constructor
// folds N children with the existing reduceArithmetic(children, 'multiply'); the engine already
// evaluates arithmetic-multiply within a component. `multiply` is reused from the engine's
// arithmetic alphabet — no new composition-mode registry, no component-type→mode map (Korean Test).

export interface ComposedDescription {
  shape: 'composed';
  composition: 'sum' | 'multiply' | 'max' | 'min' | 'first_match';
  children: StructuralDescription[];
}

// ─────────────────────────────────────────────
// CategorizedDescription — per-row category-differentiated rates (OB-225)
// ─────────────────────────────────────────────
//
// A single component whose payout is Σ over categories of:
//   (aggregate `op` of `measure_field` over rows WHERE `category_field` == value) × rate
//
// e.g. "ALI 2.5%, BEB 2.0%, LIM 3.0%, CPE 3.5%" → one component, four categories.
// The constructor expands this to composed(sum)[ multiply(filtered_aggregate, constant(rate)) … ].
//
// This is row-level (transaction) categorization — orthogonal to the variant/role boundary
// (HF-252 applies_to), which differentiates ENTITIES. The same entity's rows span categories.

export interface CategorizedDescription {
  shape: 'categorized';
  category_field: string;
  measure_field: string;
  op: 'sum' | 'count' | 'avg' | 'min' | 'max';
  categories: Array<{ value: string | number; rate: number }>;
}

// ─────────────────────────────────────────────
// StructuralDescription — discriminated on `shape`
// ─────────────────────────────────────────────

export type StructuralDescription =
  | BandedLookupDescription
  | ArithmeticDescription
  | ConditionalDescription
  | ComposedDescription
  | CategorizedDescription;

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
  /**
   * HF-341 (RA-5 / Validation Premise Law): open-vocabulary post-base modifier shapes
   * (cap / floor / tope / streak / devolución / …) declared for the live prime_dag path. `kind` is a
   * FREE-FORM string, never a closed enum — Robles introduces modifier shapes beyond cap/floor that
   * must be expressible in the contract before the engine supports them (the modifier engine is the
   * §6A Robles arc). The constructor wraps the base DAG per declared modifier; an unknown kind with
   * no structural basis fails loud (C2). No modifier-name→behavior map (Korean Test).
   */
  modifiers?: Array<{ kind: string; params?: Record<string, unknown> }>;
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

/**
 * HF-252: structured failure when an LLM plan_component response lacks
 * compositional_intent. Per Decision 154 + T0-E03: the construction pathway
 * is the sole plan-interpretation pathway; there is no fallback to the
 * deprecated emission pathway. Missing compositional_intent is a typed
 * failure raised to the caller, mapped to cognition_failure for retry
 * via the HF-248 error class taxonomy. NEVER silent downgrade.
 */
export class MissingCompositionalIntentError extends Error {
  constructor(public readonly componentId: string, public readonly componentName: string) {
    super(
      `[plan-component] Response for component "${componentName}" (id="${componentId}") lacked ` +
      `compositional_intent. Construction pathway (Decision 158) is the sole plan-interpretation ` +
      `pathway. No fallback. Classify as cognition_failure and retry per error class taxonomy.`,
    );
    this.name = 'MissingCompositionalIntentError';
  }
}

// HF-272: FieldResolutionError (HF-270) was REMOVED with the interpretation-time
// field-resolution gate (AUD-009). The hallucination-catch it served — a token that
// maps to no real column — is relocated to convergence as a loud per-component failure
// at calc time (HF-272 Phase 3), where "no real column" is knowable against the real
// columns present (complete-by-construction), never against an incomplete declared set.

/**
 * HF-271: structural-coherence failure. The emitted compositional_intent is the
 * structure the LLM recognized; the constructed DAG is what was built. When the two
 * are internally incoherent — a declared `ratio` that did not surface as a `divide`
 * over two DISTINCT reference fields, or whose numerator and denominator are identical
 * or missing — the composition is structurally wrong even though it is grammar-valid.
 * Per AUD-009 + the Korean Test, this is a structured failure (a structure-to-structure
 * coherence assertion, NOT a catalog lookup) raised post-construction in
 * plan-orchestration.ts, mapped to cognition_violation for retry. Never a silent wrong
 * answer; never steers toward any named shape.
 */
export class StructuralCoherenceError extends Error {
  constructor(
    public readonly componentId: string,
    public readonly incoherence: string,
  ) {
    super(
      `[plan-component] component "${componentId}" composed a structurally-incoherent intent: ` +
      `${incoherence}. The recognized structure and the constructed DAG disagree; ` +
      `classify as cognition_violation and retry.`,
    );
    this.name = 'StructuralCoherenceError';
  }
}

// ─────────────────────────────────────────────
// HF-279: DAG-divide band coherence invariant
// ─────────────────────────────────────────────
//
// A banded_lookup dimension whose reference_source is a `ratio` (a DAG divide of
// two reference fields) declares its breaks in the QUOTIENT'S OWN SPACE; therefore
// NO scale may accompany it. Recognition emits coherent intents (HF-279 §2.1) and
// construction omits meta for DAG divides (buildConstantWithScale); this invariant
// is the loud deterministic GUARD between them — a non-conforming recognition (a
// ratio-source band paired with a binding scale) fails loudly at recognition
// output rather than being silently constructed into a wrong tier (the BCL c1
// failure class: 1.03 quotient x100 = 103 clears a 1.3 break -> top tier overpay).
//
// Korean Test: keys on reference_source.type === 'ratio' + scale presence/binding
// only — no field literals, no magnitudes, no break-space inference.

// Collect the reference_field of every banded_lookup dimension whose
// reference_source is a `ratio`. `firstDim` holds the fields of bands whose
// DIMENSION 0 is the ratio source — the constructor (buildConstantWithScale,
// applyMeta = dimIdx === 0) only ever attaches scale at dimension 0, so an ambient
// scale (no reference_field) can bind only to a band's first dimension. `all`
// holds every ratio band field, for a scale that names a specific field.
function collectRatioBandFields(node: unknown, out: { all: string[]; firstDim: string[] }): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.shape === 'banded_lookup' && Array.isArray(obj.dimensions)) {
    obj.dimensions.forEach((dim, idx) => {
      const d = dim as Record<string, unknown> | null;
      const src = d?.reference_source as Record<string, unknown> | undefined;
      if (src?.type === 'ratio') {
        const field = d && typeof d.reference_field === 'string' ? d.reference_field : '';
        out.all.push(field);
        if (idx === 0) out.firstDim.push(field);
      }
    });
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const child of v) collectRatioBandFields(child, out);
    } else if (v && typeof v === 'object') {
      collectRatioBandFields(v, out);
    }
  }
}

/**
 * Throws StructuralCoherenceError (mapped to cognition_violation by the
 * plan-orchestration caller, routed through the existing retry policy and NEVER
 * persisted) when a ratio-source band is emitted WITH a scale that would BIND to
 * it — ambient (no reference_field -> constructor attaches at dimension 0) or named
 * via scale.reference_field. The binding test mirrors buildConstantWithScale. A
 * scale that binds to a NON-ratio dimension (e.g. a pre-computed percent column on
 * another axis; DD-7) does not trigger — only a scale on a quotient-space band does.
 */
export function assertRatioBandScaleCoherence(ci: CompositionalIntent, componentId: string): void {
  if (!ci.scale) return;
  const ratioBands = { all: [] as string[], firstDim: [] as string[] };
  collectRatioBandFields(ci.structure as unknown, ratioBands);
  if (ratioBands.all.length === 0 && ratioBands.firstDim.length === 0) return;
  const scaleField = ci.scale.reference_field;
  const offending = scaleField
    ? ratioBands.all.find(f => f === scaleField)   // named scale binds to this ratio band
    : ratioBands.firstDim[0];                       // ambient scale binds to a band's dimension 0
  if (offending === undefined) return;
  throw new StructuralCoherenceError(
    componentId,
    `a ratio-source band (reference_field="${offending}") was emitted WITH a scale ` +
      `(side="${ci.scale.side}", value=${ci.scale.value}, ` +
      `${scaleField ? `reference_field="${scaleField}"` : 'ambient (no reference_field)'}). ` +
      `A DAG-divide band declares its breaks in the quotient's own space; no scale may ` +
      `accompany it (HF-279 coherence invariant). Emit scale: null for ratio-source bands`,
  );
}

// ─────────────────────────────────────────────
// Re-exports for downstream callers
// ─────────────────────────────────────────────

export type { PrimeNode, ConstantScaleMeta };
