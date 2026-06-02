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
 *   4. Scale mutual exclusion (HF-244) — when `scale.side === 'evaluator'`,
 *      the constructor attaches ConstantScaleMeta to the outermost node's
 *      compare-position constants; when `scale.side === 'convergence'`, the
 *      meta is omitted (convergence binding carries scale_factor instead).
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

  if (!('shape' in n) && !('kind' in n)) {
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
    default: {
      // Exhaustiveness — TypeScript narrows desc to `never` here. Defensive
      // throw for runtime malformations (e.g., LLM emitting an unknown shape).
      const unknownShape = (desc as { shape?: unknown }).shape;
      throw new ConstructionError(
        path,
        desc as StructuralDescription,
        `unknown shape "${String(unknownShape)}" (expected banded_lookup | arithmetic | conditional | composed)`,
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
          buildConstantWithScale(breakValue, scale, dim.reference_field, dimIdx === 0),
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
  return {
    prime: 'conditional',
    condition: {
      prime: 'compare',
      op: desc.condition.operator,
      inputs: [
        buildReferenceNode(desc.condition.reference, refSourceField(desc.condition.reference), `${path}.condition.reference`),
        buildConstantWithScale(desc.condition.threshold, scale, refSourceField(desc.condition.reference), true),
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
        `unknown composition "${String(unknown)}" (expected sum | max | min | first_match)`,
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
): PrimeNode {
  // Apply ConstantScaleMeta only when:
  //  - applyMeta is true (constructor's outermost / boundary positions)
  //  - scale is non-null and scale.side === 'evaluator'
  //  - scale is for a specific reference field, the field matches OR scale
  //    is field-agnostic
  if (!applyMeta || !scale || scale.side !== 'evaluator') {
    return { prime: 'constant', value };
  }
  if (scale.reference_field && scale.reference_field !== fieldOnOtherSide) {
    return { prime: 'constant', value };
  }
  const meta: ConstantScaleMeta = {
    unit: scale.unit,
    scale: scale.value,
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
    case 'ratio':
      return source.numerator_field;
    case 'cross_data':
      return source.field ?? source.data_type;
    case 'prior_component':
      return `prior:${source.component_index}`;
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
