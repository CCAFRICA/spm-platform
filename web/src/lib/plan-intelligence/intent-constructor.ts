/**
 * HF-251 — CompositionalIntent → PrimeNode Constructor
 *
 * Deterministic translation of a CompositionalIntent into a PrimeNode DAG
 * tree per Decision 158 LOCKED. The LLM emits the intent (compact, semantic);
 * this constructor builds the tree (verbose, grammar-compliant).
 *
 * Guarantees enforced by the constructor (NOT by the LLM):
 *   1. Exhaustive emission — every cell of a banded lookup appears as a
 *      leaf in the tree (no truncation possible; the constructor walks the
 *      outputs array completely).
 *   2. Half-open intervals (Decision 127) — `[break[i], break[i+1])` semantics
 *      via descending-break recursion with `gte` comparisons and naturally
 *      ordered nesting.
 *   3. Terminal completeness — every conditional chain terminates in an
 *      explicit `constant(0)` (no-match fallback).
 *   4. Scale mutual exclusion (HF-244) + DAG-divide band coherence (HF-279) —
 *      meta.scale attaches at exactly ONE site: a single PRE-COMPUTED `reference`
 *      operand scaled on the EVALUATOR side (an already-percent column read as a
 *      `metric` reference; DD-7). It is OMITTED for every DAG-divide (ratio)
 *      operand on EITHER side — the quotient defines its own 0–N space and its
 *      breaks are declared in that space — and for every convergence-side operand
 *      (the binding's scale_factor normalizes the bound column there). HF-279
 *      generalizes HF-277 (evaluator-only omit) and RETIRES HF-274's
 *      convergence-ratio attach: recognition now emits coherent quotient-space
 *      breaks (HF-279 §2.1), so there is no scaled break space for a quotient to
 *      be scaled up to meet.
 *   5. Grammar compliance — constructor only emits PrimeNode discriminators
 *      declared in intent-types.ts. No private grammar.
 *
 * Per T1-E910 v2 (Korean Test): the constructor recurses through grammar
 * primitives. No domain vocabulary. No closed taxonomy of compensation
 * patterns. The constructor dispatches on the intent's `shape` field
 * (banded_lookup / arithmetic / conditional / composed) — structural
 * descriptions, not business semantics.
 *
 * Per AUD-009 (Registry/Cherry-Pick structural preclusion): there is no
 * registry of pattern names this code knows. The four shape kinds are
 * structural primitives, not enumerated compensation patterns.
 *
 * Per Decision 151 / T2-E25 (Intent Executor Authority): the constructor
 * sits ABOVE the engine boundary. Its output is the same PrimeNode shape
 * the engine already consumes; no engine modification.
 */

import type {
  CompositionalIntent,
  StructuralDescription,
  BandedLookupDescription,
  BandedLookupDimension,
  ArithmeticDescription,
  ConditionalDescription,
  ComposedDescription,
  CategorizedDescription,
  OperandDescription,
  ReferenceSource,
  ScaleSpec,
} from './compositional-intent';
import { ConstructionError } from './compositional-intent';
import type { PrimeNode, ConstantScaleMeta } from '../calculation/intent-types';

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Construct a PrimeNode DAG tree from a CompositionalIntent.
 *
 * Validates the intent structurally before construction. Throws
 * ConstructionError on any malformed input — callers should map to the
 * HF-248 error class taxonomy (cognition_violation when the intent shape
 * is wrong; cognition_truncation when output counts mismatch).
 */
export function constructTree(intent: CompositionalIntent): PrimeNode {
  if (!intent || typeof intent !== 'object') {
    throw new ConstructionError('$', null, 'intent is not an object');
  }
  if (!intent.structure) {
    throw new ConstructionError('$.structure', null, 'structure field missing');
  }
  // HF-266 P2: snapshot the RAW LLM intent before normalization, so a construction
  // failure surfaces the exact malformation (previously only the error path string survived).
  let rawSnapshot: string;
  try { rawSnapshot = JSON.stringify(intent); } catch { rawSnapshot = '<unserializable>'; }
  // HF-266 P3: infer missing shape/kind discriminants from structural cues before validation.
  normalizeCompositionalIntent(intent);
  try {
    return constructStructure(intent.structure, intent.scale, '$.structure');
  } catch (err) {
    // HF-266 P2: the raw intent is the diagnostic evidence for any future failure (§4A — retain).
    console.error(
      `[intent-constructor] HF-266 construction failed: ${err instanceof Error ? err.message : String(err)} ` +
      `— raw CompositionalIntent (pre-normalization): ${rawSnapshot}`,
    );
    throw err;
  }
}

// ─────────────────────────────────────────────
// HF-266 — structural normalization pass
// ─────────────────────────────────────────────
//
// The LLM sometimes emits nodes that carry the right structural fields but lack
// the `shape`/`kind` discriminant the constructor dispatches on (e.g. `{ value: 500 }`
// missing `kind:"constant"`, or `{ operation, operands }` missing `shape:"arithmetic"`).
// This pass infers the missing discriminant from the node's own fields, recursively,
// BEFORE validation. Korean Test: keys on structural field PRESENCE only — no domain
// vocabulary. Unknown patterns are left untouched so the constructor still throws (and
// P2 logs the raw intent). Inference rules are append-only (§4A).

function normalizeNode(node: unknown): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const n = node as Record<string, unknown>;

  // HF-266 patch: value-truthiness, not key-existence. The LLM emits nodes like
  // { shape: undefined, operands: [...] } — `'shape' in n` is true (key present) so the
  // original guard skipped them and the dispatcher threw `unknown shape "undefined"`.
  // `!n.shape` catches both an absent key and a present-but-falsy value.
  if (!n.shape && !n.kind) {
    // Operand discriminant (`kind`) — a leaf value, a data reference, or a wrapped structure.
    if (typeof n.value === 'number' || typeof n.value === 'string' || typeof n.value === 'boolean') {
      n.kind = 'constant';
    } else if (n.source && typeof n.source === 'object') {
      n.kind = 'reference';
    } else if (n.structure && typeof n.structure === 'object' && !Array.isArray(n.structure)) {
      n.kind = 'structure';
    }
    // Structure discriminant (`shape`) — inferred from the schema's composite fields.
    else if (Array.isArray(n.operands)) {
      n.shape = 'arithmetic';            // ArithmeticDescription { operation, operands }
    } else if (n.condition && typeof n.condition === 'object') {
      n.shape = 'conditional';           // ConditionalDescription { condition, then, else }
    } else if (Array.isArray(n.dimensions) || Array.isArray(n.outputs)) {
      n.shape = 'banded_lookup';         // BandedLookupDescription { dimensions, outputs }
    } else if (Array.isArray(n.children)) {
      n.shape = 'composed';              // ComposedDescription { composition, children }
    } else if (Array.isArray(n.categories) && typeof n.category_field === 'string') {
      n.shape = 'categorized';           // OB-225 CategorizedDescription { category_field, categories }
    }
    // else: unknown pattern → leave untouched; the constructor throws (rule 7).
  }

  // Recurse into every node-bearing position, regardless of the node's own discriminant,
  // so deeply-nested branches (then/else/children/operands) are normalized too.
  if (Array.isArray(n.operands)) n.operands.forEach(normalizeNode);
  if (Array.isArray(n.children)) n.children.forEach(normalizeNode);
  if ('then' in n) normalizeNode(n.then);
  if ('else' in n) normalizeNode(n.else);
  if ('output_derivation' in n) normalizeNode(n.output_derivation);
  if (n.structure && typeof n.structure === 'object' && !Array.isArray(n.structure)) normalizeNode(n.structure);
}

/**
 * HF-266: normalize a CompositionalIntent in place — infer missing shape/kind
 * discriminants throughout the structure tree. Exported for unit verification.
 */
export function normalizeCompositionalIntent(intent: CompositionalIntent): void {
  if (intent && typeof intent === 'object' && intent.structure) {
    normalizeNode(intent.structure);
  }
}

// ─────────────────────────────────────────────
// Structural dispatcher
// ─────────────────────────────────────────────

function constructStructure(
  desc: StructuralDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  if (!desc || typeof desc !== 'object') {
    throw new ConstructionError(path, null, 'structural description is not an object');
  }
  switch (desc.shape) {
    case 'banded_lookup':
      return constructBandedLookup(desc, scale, path);
    case 'arithmetic':
      return constructArithmetic(desc, scale, path);
    case 'conditional':
      return constructConditional(desc, scale, path);
    case 'composed':
      return constructComposed(desc, scale, path);
    case 'categorized':
      return constructCategorized(desc, scale, path);
    default: {
      // Exhaustiveness — TypeScript narrows desc to `never` here. Defensive
      // throw for runtime malformations (e.g., LLM emitting an unknown shape).
      const unknownShape = (desc as { shape?: unknown }).shape;
      throw new ConstructionError(
        path,
        desc as StructuralDescription,
        `unknown shape "${String(unknownShape)}" (expected banded_lookup | arithmetic | conditional | composed | categorized)`,
      );
    }
  }
}

// ─────────────────────────────────────────────
// Banded lookup constructor
// ─────────────────────────────────────────────
//
// Builds nested conditionals from the dimensions array. For each dimension,
// iterates breaks in DESCENDING order so the outermost conditional checks
// the highest tier first; the half-open interval semantics emerge naturally:
//
//   1D, breaks=[100, 110, 130], outputs=[0, 150, 300, 500]:
//
//     conditional(reference >= 130,
//       constant(500),
//       conditional(reference >= 110,
//         constant(300),
//         conditional(reference >= 100,
//           constant(150),
//           constant(0))))
//
//   Equivalence: value in [130, ∞) → 500; in [110, 130) → 300;
//   in [100, 110) → 150; in [-∞, 100) → 0. Half-open intervals from gte.
//
// 2D extends the recursion: at each row band, the then-branch is a 1D
// banded lookup over the column dimension. Cell index into outputs[] is
// `row_band * (col_breaks.length + 1) + col_band` where band 0 is the
// LOWEST tier (below the smallest break) and band N (= breaks.length) is
// the HIGHEST tier (at or above the largest break).

function constructBandedLookup(
  desc: BandedLookupDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  validateBandedLookup(desc, path);

  const dims = desc.dimensions;
  const totalCells = dims.reduce((acc, d) => acc * (d.breaks.length + 1), 1);
  if (desc.outputs.length !== totalCells) {
    throw new ConstructionError(
      path,
      desc,
      `output count ${desc.outputs.length} does not match dimension product ${totalCells} ` +
        `(${dims.map(d => d.breaks.length + 1).join('×')})`,
    );
  }

  // Recursive build over dimensions. cellIndexBase advances by the product
  // of remaining-dimension band counts as we descend through outer-dim
  // bands. The innermost recursion emits the constant leaf.
  return buildDimRecursive(desc, scale, dims, 0, 0, path);
}

function buildDimRecursive(
  desc: BandedLookupDescription,
  scale: ScaleSpec | null,
  dims: readonly BandedLookupDimension[],
  dimIdx: number,
  cellIndexBase: number,
  path: string,
): PrimeNode {
  if (dimIdx >= dims.length) {
    // Leaf — emit the output value at this cell index. Output index can be
    // adjusted further if output_derivation is supplied (deferred — for now,
    // outputs are literal constants).
    const value = desc.outputs[cellIndexBase];
    return { prime: 'constant', value };
  }

  const dim = dims[dimIdx];
  const numBands = dim.breaks.length + 1;
  // remainingProduct = number of cells per band at this dimension (the
  // product of band counts for all deeper dimensions). Used to advance
  // cellIndexBase as we move through bands at this level.
  let remainingProduct = 1;
  for (let i = dimIdx + 1; i < dims.length; i++) {
    remainingProduct *= dims[i].breaks.length + 1;
  }

  // Build the nested conditional chain for this dimension. We start from
  // the HIGHEST band (index numBands - 1, no upper bound) and recurse
  // downward, emitting `conditional(ref >= break[i], thenBranch, elseBranch)`
  // at each level. The leaf-most else is constant(0) (no-match terminator).
  let chain: PrimeNode = { prime: 'constant', value: 0 };

  // Iterate bands from index 0 (lowest, "below break[0]") up to numBands-1
  // (highest, "at or above break[numBands-2]"). Build the chain from inside
  // out: chain currently is the no-match terminator; we wrap each band's
  // conditional around it, but we iterate breaks from LOWEST to HIGHEST so
  // the resulting tree has the highest band as the outermost conditional.
  //
  // band index b corresponds to:
  //   b = 0:                          ref < break[0]                 → outputs cell base + 0*remainingProduct
  //   b = i (0 < i < numBands-1):     break[i-1] <= ref < break[i]   → outputs cell base + i*remainingProduct
  //   b = numBands-1 (= breaks.length): break[breaks.length-1] <= ref → outputs cell base + (numBands-1)*remainingProduct
  //
  // The chain we build from inside out works like this. Start with the lowest
  // band (b=0) as the deepest else (it's the "all checks above failed" case).
  // chain := build_subtree_for_band(0)
  // Then for b = 1..numBands-1: chain := conditional(ref >= break[b-1], build_subtree_for_band(b), chain)
  // End result: outermost conditional checks break[numBands-2], i.e. the
  // highest break, exactly as the example at the top of this function shows.

  // Band 0 (lowest — no break gate; this becomes the deepest else).
  chain = buildDimRecursive(
    desc,
    scale,
    dims,
    dimIdx + 1,
    cellIndexBase + 0 * remainingProduct,
    `${path}.dim[${dimIdx}].band[0]`,
  );

  // Bands 1..numBands-1.
  for (let b = 1; b < numBands; b++) {
    const breakValue = dim.breaks[b - 1];
    const thenBranch = buildDimRecursive(
      desc,
      scale,
      dims,
      dimIdx + 1,
      cellIndexBase + b * remainingProduct,
      `${path}.dim[${dimIdx}].band[${b}]`,
    );
    chain = {
      prime: 'conditional',
      condition: {
        prime: 'compare',
        op: 'gte',
        inputs: [
          buildReferenceNode(dim.reference_source, dim.reference_field, `${path}.dim[${dimIdx}].ref`),
          buildConstantWithScale(breakValue, scale, dim.reference_field, dimIdx === 0, dim.reference_source?.type === 'ratio'),
        ],
      },
      then: thenBranch,
      else: chain,
    };
  }

  return chain;
}

// ─────────────────────────────────────────────
// Arithmetic constructor
// ─────────────────────────────────────────────

function constructArithmetic(
  desc: ArithmeticDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  if (!desc.operands || desc.operands.length !== 2) {
    throw new ConstructionError(path, desc, `arithmetic requires exactly 2 operands, got ${desc.operands?.length ?? 0}`);
  }
  return {
    prime: 'arithmetic',
    op: desc.operation,
    inputs: [
      constructOperand(desc.operands[0], scale, `${path}.operands[0]`),
      constructOperand(desc.operands[1], scale, `${path}.operands[1]`),
    ],
  };
}

// ─────────────────────────────────────────────
// Categorized constructor (OB-225) — per-row category-differentiated rates
// ─────────────────────────────────────────────
//
// Expands to composed(sum) of per-category terms, each:
//   multiply( filtered_aggregate(op, measure_field WHERE category_field == value), rate )
// and DELEGATES to constructComposed so the sum-fold + child dispatch are the
// proven, single code path (no bespoke fold). Each term's filtered aggregate is
// expressed as a `filtered_aggregate` reference source, so the leaf construction
// is buildReferenceNode's single filter→aggregate emission.

function constructCategorized(
  desc: CategorizedDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  if (!Array.isArray(desc.categories) || desc.categories.length === 0) {
    throw new ConstructionError(path, desc as never, 'categorized requires a non-empty categories array');
  }
  if (!desc.category_field || !desc.measure_field || !desc.op) {
    throw new ConstructionError(path, desc as never, 'categorized requires category_field, measure_field, and op');
  }
  const composed: ComposedDescription = {
    shape: 'composed',
    composition: 'sum',
    children: desc.categories.map((c): ArithmeticDescription => ({
      shape: 'arithmetic',
      operation: 'multiply',
      operands: [
        {
          kind: 'reference',
          source: {
            type: 'filtered_aggregate',
            op: desc.op,
            field: desc.measure_field,
            predicate: { field: desc.category_field, operator: 'eq', value: c.value },
          },
        },
        { kind: 'constant', value: c.rate },
      ],
    })),
  };
  return constructComposed(composed, scale, path);
}

// ─────────────────────────────────────────────
// Conditional constructor
// ─────────────────────────────────────────────

function constructConditional(
  desc: ConditionalDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  if (!desc.condition) {
    throw new ConstructionError(path, desc, 'conditional requires a condition');
  }
  if (desc.then === undefined || desc.else === undefined) {
    throw new ConstructionError(path, desc, 'conditional requires both then and else branches');
  }
  const cond = desc.condition;
  // HF-341 (RA-4): operand-typed RHS — precedence rightReference > value > numeric threshold. A
  // categorical value emits a string-valued constant (the executor's compare prime evaluates string
  // eq/neq via rawOperand, OB-220). The numeric-threshold path is byte-identical (buildConstantWithScale).
  let rhs: PrimeNode;
  if (cond.rightReference) {
    rhs = buildReferenceNode(cond.rightReference, refSourceField(cond.rightReference), `${path}.condition.rightReference`);
  } else if (cond.value !== undefined) {
    rhs = typeof cond.value === 'number'
      ? { prime: 'constant', value: cond.value }
      // string | boolean → string-valued constant. PrimeNode types constant.value as number; the
      // categorical/AI path carries category strings, tolerated by evaluate()'s constant+compare cases.
      : { prime: 'constant', value: String(cond.value) as unknown as number };
  } else if (typeof cond.threshold === 'number') {
    rhs = buildConstantWithScale(cond.threshold, scale, refSourceField(cond.reference), true, cond.reference?.type === 'ratio');
  } else {
    throw new ConstructionError(path, desc, 'conditional condition requires one of: rightReference, value, or numeric threshold');
  }
  return {
    prime: 'conditional',
    condition: {
      prime: 'compare',
      op: cond.operator,
      inputs: [
        buildReferenceNode(cond.reference, refSourceField(cond.reference), `${path}.condition.reference`),
        rhs,
      ],
    },
    then: constructBranchOrOperand(desc.then, scale, `${path}.then`),
    else: constructBranchOrOperand(desc.else, scale, `${path}.else`),
  };
}

function constructBranchOrOperand(
  branch: StructuralDescription | OperandDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  if (!branch || typeof branch !== 'object') {
    throw new ConstructionError(path, null, 'branch is not an object');
  }
  if ('shape' in branch) {
    return constructStructure(branch as StructuralDescription, scale, path);
  }
  if ('kind' in branch) {
    return constructOperand(branch as OperandDescription, scale, path);
  }
  throw new ConstructionError(path, branch as never, 'branch is neither a structure (shape field) nor an operand (kind field)');
}

// ─────────────────────────────────────────────
// Composed constructor
// ─────────────────────────────────────────────
//
// Composition reduces children to a single output:
//   sum         — pairwise add reduction
//   max / min   — pairwise conditional reduction (a > b ? a : b)
//   first_match — first non-zero child wins (conditional cascade)

function constructComposed(
  desc: ComposedDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  if (!Array.isArray(desc.children) || desc.children.length === 0) {
    throw new ConstructionError(path, desc, 'composed requires at least one child');
  }

  // HF-266: composed children may be structures OR operands (a constant/reference can be a
  // legitimate child of a sum/max). Dispatch via constructBranchOrOperand so a normalized
  // operand child (e.g. {kind:'constant', value:100}) is accepted instead of forced to a shape.
  const childNodes = desc.children.map((c, i) => constructBranchOrOperand(c, scale, `${path}.children[${i}]`));

  if (childNodes.length === 1) return childNodes[0];

  switch (desc.composition) {
    case 'sum':
      return reduceArithmetic(childNodes, 'add');
    case 'multiply':
      // HF-341 (RA-1): N-factor multiplicative chain — total = c0 × c1 × … × cn — declared in the
      // DAG via the existing N-way reduceArithmetic fold. The Robles factor-model shape.
      return reduceArithmetic(childNodes, 'multiply');
    case 'max':
      return reducePairwiseMax(childNodes, 'gt');
    case 'min':
      return reducePairwiseMax(childNodes, 'lt');
    case 'first_match':
      return reduceFirstMatch(childNodes);
    default: {
      const unknown = (desc as { composition?: unknown }).composition;
      throw new ConstructionError(
        path,
        desc,
        `unknown composition "${String(unknown)}" (expected sum | multiply | max | min | first_match)`,
      );
    }
  }
}

function reduceArithmetic(nodes: PrimeNode[], op: 'add' | 'multiply'): PrimeNode {
  let acc = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    acc = { prime: 'arithmetic', op, inputs: [acc, nodes[i]] };
  }
  return acc;
}

function reducePairwiseMax(nodes: PrimeNode[], cmpOp: 'gt' | 'lt'): PrimeNode {
  let acc = nodes[0];
  for (let i = 1; i < nodes.length; i++) {
    acc = {
      prime: 'conditional',
      condition: { prime: 'compare', op: cmpOp, inputs: [acc, nodes[i]] },
      then: acc,
      else: nodes[i],
    };
  }
  return acc;
}

function reduceFirstMatch(nodes: PrimeNode[]): PrimeNode {
  // First non-zero child wins: conditional(child[0] != 0, child[0], conditional(child[1] != 0, child[1], ...))
  let acc: PrimeNode = nodes[nodes.length - 1];
  for (let i = nodes.length - 2; i >= 0; i--) {
    acc = {
      prime: 'conditional',
      condition: {
        prime: 'compare',
        op: 'neq',
        inputs: [nodes[i], { prime: 'constant', value: 0 }],
      },
      then: nodes[i],
      else: acc,
    };
  }
  return acc;
}

// ─────────────────────────────────────────────
// Operand constructor — reference / constant / nested structure
// ─────────────────────────────────────────────

function constructOperand(
  op: OperandDescription,
  scale: ScaleSpec | null,
  path: string,
): PrimeNode {
  if (!op || typeof op !== 'object') {
    throw new ConstructionError(path, null, 'operand is not an object');
  }
  switch (op.kind) {
    case 'reference':
      return buildReferenceNode(op.source, refSourceField(op.source), path);
    case 'constant':
      return { prime: 'constant', value: op.value };
    case 'structure':
      return constructStructure(op.structure, scale, `${path}.structure`);
    default: {
      const unknown = (op as { kind?: unknown }).kind;
      throw new ConstructionError(path, op as never, `unknown operand kind "${String(unknown)}"`);
    }
  }
}

// ─────────────────────────────────────────────
// Reference / constant helpers
// ─────────────────────────────────────────────
//
// buildReferenceNode translates a ReferenceSource into the appropriate
// grammar composition. Most sources resolve to a simple `reference` prime
// with the resolved field name; ratio/aggregate/scope_aggregate compose
// arithmetic/aggregate/scope around the base reference per HF-238's
// established conventions.

function buildReferenceNode(
  source: ReferenceSource,
  fieldHint: string,
  path: string,
): PrimeNode {
  if (!source || typeof source !== 'object') {
    throw new ConstructionError(path, null, 'reference_source is not an object');
  }
  switch (source.type) {
    case 'metric':
    case 'attribute':
      // Simple metric / attribute reference. The downstream metric-resolution
      // layer (convergence) maps these to data columns at calc time.
      return { prime: 'reference', field: source.field };
    case 'ratio':
      // ratio is `numerator / denominator` — emit divide arithmetic over
      // two reference primes. Zero-denominator guard is engine-side
      // (intent-executor's divide returns 0 when denom is 0).
      return {
        prime: 'arithmetic',
        op: 'divide',
        inputs: [
          { prime: 'reference', field: source.numerator_field },
          { prime: 'reference', field: source.denominator_field },
        ],
      };
    case 'aggregate':
      return { prime: 'aggregate', op: source.op, field: source.field };
    case 'filtered_aggregate':
      // OB-225: filter(predicate){ aggregate(op, field) } over the entity's activeRows.
      // count is row-cardinality (aggregate ignores field); sum/avg/min/max use the field.
      return {
        prime: 'filter',
        predicate: {
          field: source.predicate.field,
          operator: source.predicate.operator,
          value: source.predicate.value,
        },
        downstream: {
          prime: 'aggregate',
          op: source.op,
          field: source.field ?? source.predicate.field,
        },
      };
    case 'scope_aggregate':
      // scope(boundary, aggregate(op, field))
      return {
        prime: 'scope',
        boundary: source.boundary,
        downstream: { prime: 'aggregate', op: source.op, field: source.field },
      };
    case 'cross_data': {
      // cross_data uses the synthetic-key reference convention established
      // pre-HF-251 in convergence-service.ts: "cross_data:<dataType>:<agg>[:<field>]".
      // The metric-resolution layer recognizes this key and resolves it.
      const field = source.field
        ? `cross_data:${source.data_type}:${source.aggregation}:${source.field}`
        : `cross_data:${source.data_type}:${source.aggregation}`;
      return { prime: 'reference', field };
    }
    case 'prior_component':
      // Synthetic-key reference to a prior component's output. Same
      // convention as cross_data — convergence resolves "prior:<index>".
      return { prime: 'reference', field: `prior:${source.component_index}` };
    case 'reference_lookup': {
      // HF-341 (RA-2): reference-table read — ref(data_type, key_column) → value_column. The OPERATION
      // VOCABULARY includes this first-class reference read (the ReferenceSource union + this recognized
      // constructor case prove PG-12 representability), but its CALC-TIME RESOLVER is the Robles
      // distribution/factor-model arc (§6A residual #1) and is NOT yet wired. Emitting a synthetic
      // `reference_lookup:*` key here would resolve to 0 at calc (the `reference` prime coerces a missing
      // metric to 0), silently zeroing any multiply chain — a C2 violation. So construction FAILS LOUD
      // until the resolver lands, rather than constructing a silently-wrong DAG. Korean Test: data_type /
      // columns are free-form structural identifiers (no table registry); the failure is structural, not
      // a value-set check. reference_lookup is NOT advertised in the live LLM prompt for the same reason.
      throw new ConstructionError(
        path, source as never,
        `reference_lookup (data_type="${source.data_type}", key_column="${source.key_column}" → ` +
        `value_column="${source.value_column}") is representable in the operation vocabulary (RA-2/PG-12) ` +
        `but its calc-time resolver is the Robles arc (§6A residual #1) and is not yet wired. Construction ` +
        `fails loud rather than emit a reference that silently resolves to 0 (C2).`,
      );
    }
    default: {
      const unknown = (source as { type?: unknown }).type;
      throw new ConstructionError(path, source as never, `unknown reference_source.type "${String(unknown)}"`);
    }
  }
}

function buildConstantWithScale(
  value: number,
  scale: ScaleSpec | null,
  fieldOnOtherSide: string,
  applyMeta: boolean,
  // HF-279: true when the value on the OTHER side of this compare is a DAG-divide
  // ratio (an `arithmetic`/`divide` computed in-DAG over two reference fields, i.e.
  // reference_source.type === 'ratio'). A DAG-divide band declares its breaks in
  // the quotient's OWN space; no scale may accompany it, on EITHER side. The
  // HF-271 structural-coherence proofread guarantees a declared ratio surfaces as a
  // two-distinct-field divide, so this declared-structure flag is equivalent to
  // "the constructed compare operand is arithmetic/divide".
  otherSideIsDagDivide: boolean = false,
): PrimeNode {
  if (!applyMeta || !scale) {
    return { prime: 'constant', value };
  }
  // HF-279 DAG-divide band coherence (generalizes HF-277; retires HF-274's
  // convergence-side attach for divides). The NUMERIC RESCALE (meta.scale) is
  // applied by the evaluator at exactly ONE site — a single PRE-COMPUTED
  // `reference` operand scaled on the EVALUATOR side (DD-7):
  //  - scale.side === 'evaluator', NON-ratio operand (an already-percent column read
  //    as a `metric` reference): the evaluator scales the data-native column onto
  //    plan units → carry the real scale.value.
  //  - scale.side === 'evaluator', DAG-DIVIDE operand (HF-277): the quotient defines
  //    its own 0–N space; nothing to rescale → scale:1.
  //  - scale.side === 'convergence', NON-ratio operand: the convergence binding's
  //    scale_factor already normalized the single bound column; a second evaluator
  //    rescale would DOUBLE-scale (run-calculation.ts:188) → scale:1.
  //  - scale.side === 'convergence', DAG-DIVIDE operand (HF-279): breaks are in the
  //    quotient's own space; the convergence scale is incoherent for it → scale:1.
  // Korean Test: structural checks only (scale.side + DAG-divide operand); no field
  // name, breakpoint, component name, or magnitude constant.
  //
  // HF-339 (Validator Premise Correction) — CARRY-NOT-STRIP, where the nature is
  // COHERENT with the constructed value. The prior code returned a BARE
  // { prime:'constant', value } on every non-evaluator branch, discarding the
  // nature the model expressed (the "strip"). We now carry the model's
  // self-describing nature (scale.unit, free-form) so the compare node is
  // self-description-sufficient (Decision 158 guarantee). The NUMERIC rescale is
  // unchanged from HF-279: the evaluator multiplies the opposing operand by
  // meta.scale at exactly one site; off it we carry scale:1 (identity — a no-op
  // multiply → byte-identical calc; HF-279 no-double-scale preserved).
  // Construction emits compare(reference, constant), never constant-vs-constant,
  // so an identity-scale constant never alters branching.
  const attach = scale.side === 'evaluator' && !otherSideIsDagDivide;
  const fieldMismatch = !!scale.reference_field && scale.reference_field !== fieldOnOtherSide;
  if (otherSideIsDagDivide || fieldMismatch) {
    // DAG-divide operand: the value lives in the quotient's OWN 0–N space — a raw
    // quotient is self-describing, no scale nature is coherent (HF-277/279).
    // Field-mismatched scale: the ScaleSpec describes a DIFFERENT field, not this
    // value. Either way stay bare — the validator's self-description check
    // correctly does NOT flag a bare constant (the model's valid "needs no
    // normalization" declaration).
    return { prime: 'constant', value };
  }
  const meta: ConstantScaleMeta = {
    unit: scale.unit,
    scale: attach ? scale.value : 1,
    confidence: scale.confidence,
  };
  return { prime: 'constant', value, meta };
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

function refSourceField(source: ReferenceSource): string {
  switch (source.type) {
    case 'metric':
    case 'attribute':
    case 'aggregate':
    case 'scope_aggregate':
      return source.field;
    case 'filtered_aggregate':
      return source.field ?? source.predicate.field;
    case 'ratio':
      return source.numerator_field;
    case 'cross_data':
      return source.field ?? source.data_type;
    case 'prior_component':
      return `prior:${source.component_index}`;
    case 'reference_lookup':
      return source.value_column;  // HF-341 (RA-2): the field read from the reference table
  }
}

function validateBandedLookup(desc: BandedLookupDescription, path: string): void {
  if (!Array.isArray(desc.dimensions) || desc.dimensions.length === 0) {
    throw new ConstructionError(path, desc, 'banded_lookup requires at least one dimension');
  }
  desc.dimensions.forEach((dim, i) => {
    if (!Array.isArray(dim.breaks)) {
      throw new ConstructionError(`${path}.dimensions[${i}]`, desc, 'dimension.breaks is not an array');
    }
    if (dim.breaks.length === 0) {
      throw new ConstructionError(`${path}.dimensions[${i}]`, desc, 'dimension.breaks is empty (need at least 1 break for 2 bands)');
    }
    for (let j = 1; j < dim.breaks.length; j++) {
      if (dim.breaks[j] <= dim.breaks[j - 1]) {
        throw new ConstructionError(
          `${path}.dimensions[${i}].breaks[${j}]`,
          desc,
          `breaks not in ascending order: breaks[${j-1}]=${dim.breaks[j-1]} >= breaks[${j}]=${dim.breaks[j]}`,
        );
      }
    }
    if (!dim.reference_source) {
      throw new ConstructionError(`${path}.dimensions[${i}].reference_source`, desc, 'reference_source missing');
    }
    if (typeof dim.reference_field !== 'string' || dim.reference_field.length === 0) {
      throw new ConstructionError(`${path}.dimensions[${i}].reference_field`, desc, 'reference_field must be a non-empty string');
    }
  });
  if (!Array.isArray(desc.outputs)) {
    throw new ConstructionError(`${path}.outputs`, desc, 'outputs is not an array');
  }
  desc.outputs.forEach((o, i) => {
    if (typeof o !== 'number' || !Number.isFinite(o)) {
      throw new ConstructionError(`${path}.outputs[${i}]`, desc, `outputs[${i}] is not a finite number (got ${o})`);
    }
  });
}
