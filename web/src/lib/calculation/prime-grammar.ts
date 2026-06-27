/**
 * Prime-DAG Composition Grammar — Canonical Declaration
 *
 * Per T1-E910 v2 (Korean Test): the structural primitives of the calculation
 * engine live in exactly one canonical declaration. Every boundary that names,
 * dispatches on, validates, or documents a primitive derives from this file —
 * the LLM prompt (anthropic-adapter.ts) calls generatePromptGrammarSection(),
 * the post-generation validator (prime-validator.ts) calls validatePrimeTree(),
 * and the engine evaluator (intent-executor.ts) consumes PrimeNode trees whose
 * shape matches the union defined in intent-types.ts.
 *
 * Per T1-E902 v2 (Carry Everything): every prime defined here is recognizable
 * at every boundary it traverses. Adding a prime requires updating the union
 * in intent-types.ts, this grammar, the evaluator, and any boundary that
 * persists DAG trees.
 *
 * Per Decision 127 (LOCKED): tier-selection conditionals use half-open
 * intervals [min, max). The grammar's prompt section instructs the LLM
 * accordingly; the validator checks compliance.
 */

import type { PrimeNode } from './intent-types';
import { VALID_PRIMES } from './intent-types';

// ──────────────────────────────────────────────
// Grammar — type system + arity + child topology
// ──────────────────────────────────────────────

export type PrimeType =
  | 'constant'
  | 'reference'
  | 'arithmetic'
  | 'compare'
  | 'logical'
  | 'conditional'
  | 'filter'
  | 'scope'
  | 'aggregate'
  | 'prior_period';

export type OutputType = 'numeric' | 'boolean';

export type ArityKind =
  | { kind: 'leaf' }
  | { kind: 'fixed'; count: number }
  | { kind: 'variadic'; min: number };

export interface ChildSlot {
  key: 'downstream' | 'condition' | 'then' | 'else';
  type: OutputType;
}

export interface PrimeRule {
  type: PrimeType;
  output: OutputType;
  /** Arity over the `inputs` array. Leaf primes have no `inputs`. */
  arity: ArityKind;
  /** Per-input expected output types. Length must match arity when fixed. */
  inputTypes?: OutputType[];
  /** Non-`inputs` children carried in named keys. */
  children?: ChildSlot[];
  /** Allowed ops, when the prime carries an `op` discriminator. */
  ops?: string[];
  /** One-line description for prompt generation. */
  description: string;
}

export const PRIME_GRAMMAR: Record<PrimeType, PrimeRule> = {
  constant: {
    type: 'constant',
    output: 'numeric',
    arity: { kind: 'leaf' },
    description:
      'Literal numeric value. Carries optional meta={unit,scale,confidence} when used in a compare against a reference value (see SCALE METADATA below).',
  },
  reference: {
    type: 'reference',
    output: 'numeric',
    arity: { kind: 'leaf' },
    description:
      'Read a resolved numeric metric. Synthetic keys: "attr:<a>" (entity attribute), "prior:<i>" (prior component output), "cross_data:<type>:<agg>[:<field>]" (cross-plan count/sum), "group:<m>" (group-scope metric).',
  },
  arithmetic: {
    type: 'arithmetic',
    output: 'numeric',
    arity: { kind: 'fixed', count: 2 },
    inputTypes: ['numeric', 'numeric'],
    ops: ['add', 'subtract', 'multiply', 'divide'],
    description: 'Binary numeric operation. divide returns 0 when the denominator is 0.',
  },
  compare: {
    type: 'compare',
    output: 'boolean',
    arity: { kind: 'fixed', count: 2 },
    inputTypes: ['numeric', 'numeric'],
    ops: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
    description: 'Binary numeric comparison returning 1/0. Use gte for lower bounds and lt for upper bounds on non-final tiers (Decision 127).',
  },
  logical: {
    type: 'logical',
    output: 'boolean',
    arity: { kind: 'variadic', min: 1 },
    ops: ['and', 'or', 'not'],
    description: 'Boolean combinator. and/or take 2+ boolean inputs; not takes 1.',
  },
  conditional: {
    type: 'conditional',
    output: 'numeric',
    arity: { kind: 'leaf' },
    children: [
      { key: 'condition', type: 'boolean' },
      { key: 'then', type: 'numeric' },
      { key: 'else', type: 'numeric' },
    ],
    description: 'Branches on condition truthy (>0). Both branches return numeric values. Every conditional chain must terminate in an explicit constant (typically constant(0)).',
  },
  filter: {
    type: 'filter',
    output: 'numeric',
    arity: { kind: 'leaf' },
    children: [{ key: 'downstream', type: 'numeric' }],
    ops: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'],
    description: 'Carries predicate={field,operator,value} and narrows activeRows for the downstream subtree.',
  },
  scope: {
    type: 'scope',
    output: 'numeric',
    arity: { kind: 'leaf' },
    children: [{ key: 'downstream', type: 'numeric' }],
    description: 'Narrows activeRows to entity siblings sharing the boundary attribute. Carries boundary:string and optional temporal_range={offset,length}.',
  },
  aggregate: {
    type: 'aggregate',
    output: 'numeric',
    arity: { kind: 'leaf' },
    ops: ['sum', 'count', 'avg', 'min', 'max'],
    description: 'Reduces activeRows to a single number over the named row field.',
  },
  prior_period: {
    type: 'prior_period',
    output: 'numeric',
    arity: { kind: 'leaf' },
    children: [{ key: 'downstream', type: 'numeric' }],
    description: 'Switches activeRows to prior-period rows for the downstream subtree.',
  },
};

// ──────────────────────────────────────────────
// HF-249: Grammar-Aware Subtree Decomposition Cut Points
// ──────────────────────────────────────────────
//
// Per IRA v2 OPTION_A (Rank 1): when a calculationIntent tree's serialized
// emission exceeds the LLM's output-token budget, the LLM emits a skeleton
// with $ref placeholders at grammar-legal cut points and a sibling `chunks`
// object containing the sub-trees. A deterministic assembler stitches the
// chunks back into a single PrimeNode tree (assembleTree in this file).
//
// Cut points are POSITIONS within a prime's structure where a sub-tree may
// be replaced by a {$ref: "chunk_N"} placeholder during emission. They are
// derived from the grammar's nine primes — not from domain vocabulary or
// plan-content patterns (T1-E910 v2 Korean Test compliance). The set below
// is a projection of the grammar's existing nested-child structure:
//
//   conditional { condition, then, else } — `then` / `else` are cut points
//   filter      { predicate, downstream } — `downstream` is a cut point
//   scope       { boundary, downstream }  — `downstream` is a cut point
//   prior_period { downstream }           — `downstream` is a cut point
//
// The `condition` child of `conditional` is intentionally NOT a cut point:
// conditions are small (compare/logical compositions) and chunking them
// fragments the boolean evaluation across calls without scale benefit.
//
// arithmetic/compare/logical inputs are NOT cut points either — they are
// numeric arity-fixed and short; replacing one input with a ref would
// produce verbose chunks for negligible gain.
//
// aggregate, constant, reference are leaves — no children, no cut points.
//
// Adding a new prime to PRIME_GRAMMAR with nestable children extends this
// declaration as part of the prime's definition; the assembler picks up
// the new cut points without changes.

export type CutPointField = 'downstream' | 'then' | 'else';

export const GRAMMAR_CUT_POINTS: Partial<Record<PrimeType, ReadonlyArray<CutPointField>>> = {
  conditional: ['then', 'else'],
  filter: ['downstream'],
  scope: ['downstream'],
  prior_period: ['downstream'],
} as const;

export function isLegalCutPoint(parentPrime: PrimeType, fieldName: string): boolean {
  const cutPoints = GRAMMAR_CUT_POINTS[parentPrime];
  if (!cutPoints) return false;
  return cutPoints.includes(fieldName as CutPointField);
}

// ──────────────────────────────────────────────
// Scale metadata (Phase 2 — consumed by convergence + evaluator)
// ──────────────────────────────────────────────

// HF-339: the value's self-describing nature, free-form, the model's own terms
// (any language). NOT a closed developer-maintained enum — the prior
// `'percent'|'ratio'|'currency'|'count'` set was a registry (AP-26 /
// No-Fixed-Taxonomy): a developer extended the recognizer's valid vocabulary by
// editing this list. Open-vocabulary now; the evaluator reads only the numeric
// scale, never the nature, so freeing it is calc-neutral.
export type ScaleUnit = string;

export interface ScaleMetadata {
  unit: ScaleUnit;
  scale: number;
  confidence: number;
}

// ──────────────────────────────────────────────
// Validator (called by Phase 4 wiring in ai-plan-interpreter.ts)
// ──────────────────────────────────────────────

export type ViolationCheck =
  | 'unknown_prime'
  | 'arity'
  | 'input_type'
  | 'child_topology'
  | 'op_unknown'
  | 'scale_annotation'
  | 'decision_127'
  | 'terminal_completeness'
  | 'exhaustive_emission';

export interface ValidationViolation {
  check: ViolationCheck;
  nodePath: string;
  message: string;
  severity: 'critical' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
}

export interface ValidateOptions {
  /** Expected leaf-count for band-selection patterns (1D N or 2D N×M). */
  expectedCellCount?: number;
}

/**
 * Recursively validate a candidate PrimeNode tree against PRIME_GRAMMAR.
 * Reports critical violations (unknown prime, arity, unknown op) and
 * warnings (missing scale metadata, missing terminal constant, D127 non-compliance).
 */
export function validatePrimeTree(
  node: unknown,
  opts: ValidateOptions = {},
): ValidationResult {
  const violations: ValidationViolation[] = [];

  // Track constant leaf count for exhaustive-emission warning.
  let constantLeafCount = 0;

  const walk = (n: unknown, path: string, parentPrime: PrimeType | null): void => {
    if (n === null || typeof n !== 'object') {
      violations.push({
        check: 'arity',
        nodePath: path,
        message: 'Node is not an object.',
        severity: 'critical',
      });
      return;
    }

    const obj = n as Record<string, unknown>;
    const prime = obj.prime;
    if (typeof prime !== 'string' || !VALID_PRIMES.has(prime as PrimeNode['prime'])) {
      violations.push({
        check: 'unknown_prime',
        nodePath: path,
        message: `Prime "${String(prime)}" is not in the canonical declaration.`,
        severity: 'critical',
      });
      return;
    }

    const rule = PRIME_GRAMMAR[prime as PrimeType];

    // Op discriminator check. Most ops-bearing primes carry the op at top-level `obj.op`
    // (arithmetic/compare/logical/aggregate). OB-222: `filter` is the exception — its operator lives
    // at predicate.operator (PrimePredicate), not at obj.op. Reading obj.op for a filter node
    // spuriously rejected every well-formed filter as op_unknown (latent until the grammar prompt
    // began illustrating filter->aggregate, OB-222 Phase 2). Read the operator from the correct
    // location per prime — which also makes the filter's predicate.operator actually validated.
    if (rule.ops) {
      let op: string | undefined;
      if (prime === 'filter') {
        const pred = obj.predicate as Record<string, unknown> | undefined;
        op = typeof pred?.operator === 'string' ? pred.operator : undefined;
      } else {
        op = typeof obj.op === 'string' ? obj.op : undefined;
      }
      if (!op || !rule.ops.includes(op)) {
        violations.push({
          check: 'op_unknown',
          nodePath: path,
          message: prime === 'filter'
            ? `Prime "filter" requires predicate.operator in {${rule.ops.join(', ')}}, got "${String(op)}".`
            : `Prime "${prime}" requires op in {${rule.ops.join(', ')}}, got "${String(op)}".`,
          severity: 'critical',
        });
      }
    }

    // Arity check (over `inputs` array)
    if (rule.arity.kind === 'fixed') {
      const inputs = Array.isArray(obj.inputs) ? obj.inputs : [];
      if (inputs.length !== rule.arity.count) {
        violations.push({
          check: 'arity',
          nodePath: path,
          message: `Prime "${prime}" expects exactly ${rule.arity.count} inputs, got ${inputs.length}.`,
          severity: 'critical',
        });
      }
      inputs.forEach((child, i) => walk(child, `${path}.inputs[${i}]`, prime as PrimeType));
    } else if (rule.arity.kind === 'variadic') {
      const inputs = Array.isArray(obj.inputs) ? obj.inputs : [];
      if (inputs.length < rule.arity.min) {
        violations.push({
          check: 'arity',
          nodePath: path,
          message: `Prime "${prime}" expects at least ${rule.arity.min} inputs, got ${inputs.length}.`,
          severity: 'critical',
        });
      }
      inputs.forEach((child, i) => walk(child, `${path}.inputs[${i}]`, prime as PrimeType));
    }

    // Child slots (downstream / condition / then / else)
    if (rule.children) {
      for (const slot of rule.children) {
        const child = obj[slot.key];
        if (child === undefined) {
          violations.push({
            check: 'child_topology',
            nodePath: path,
            message: `Prime "${prime}" is missing required child "${slot.key}".`,
            severity: 'critical',
          });
          continue;
        }
        walk(child, `${path}.${slot.key}`, prime as PrimeType);
      }
    }

    // HF-339 (Validator Premise Correction): self-description-sufficiency, NOT
    // set-membership. The prior check warned whenever a compare-constant lacked
    // meta — a false positive on every correct-but-stripped value, whose
    // reflexive remedy re-laundered the strip (and on convergence-side
    // constants re-introduced HF-274 double-scaling). It validated against a
    // frozen developer expectation (the closed ScaleUnit set), not carried
    // reality. The fix carries the model's self-describing nature at
    // construction (intent-constructor.buildConstantWithScale); the bare case
    // is the model's VALID declaration that the value needs no normalization
    // (it is in the data's native space) — that is correct, not a defect, so we
    // do NOT warn on it. We assert only that a carried nature is well-formed:
    // open-vocabulary (any non-empty descriptor, any language), loud-fail on a
    // MALFORMED structure (meta present but no self-describing nature), never a
    // match against an enumerated unit set.
    if (prime === 'constant' && parentPrime === 'compare') {
      const meta = obj.meta as Record<string, unknown> | null | undefined;
      if (meta !== undefined && meta !== null) {
        const nature = (meta as { unit?: unknown }).unit;
        if (typeof nature !== 'string' || nature.trim() === '') {
          violations.push({
            check: 'scale_annotation',
            nodePath: path,
            // HF-341 R3: ELEVATED warning→critical. With direct PrimeNode-DAG emission (the shape
            // layer + intent-constructor.buildConstantWithScale are gone), a malformed scale carrier is
            // no longer fixed deterministically by construction — a meta present without a
            // self-describing nature is a structurally malformed scale and is rejected loudly (C2).
            message: 'Compare-constant carries scale metadata without a self-describing nature (meta.unit). Open-vocabulary nature required; no enumerated unit set.',
            severity: 'critical',
          });
        }
      }
    }

    // HF-341 R3 (re-expresses the deleted CI-side assertRatioBandScaleCoherence at the DAG level): a
    // ratio-source band declares its break in the QUOTIENT'S OWN space, so a `compare` whose one
    // operand is a DAG-divide (arithmetic op:divide — a ratio) and whose other operand is a `constant`
    // carrying a non-identity scale (meta.scale ≠ 1) is incoherent — the BCL-c1 overpay class (a 1.03
    // quotient ×100 = 103 clears a 1.3 break → top tier). constructTree guaranteed this by omitting
    // scale on ratio bands; with direct emission it is a CRITICAL structural rejection (C2). Korean
    // Test: keys on node TOPOLOGY (divide + scaled-constant), no field literals or magnitudes.
    if (prime === 'compare' && Array.isArray(obj.inputs) && obj.inputs.length === 2) {
      const isRatio = (n: unknown): boolean => {
        const r = n as Record<string, unknown> | undefined;
        return !!r && r.prime === 'arithmetic' && r.op === 'divide';
      };
      const isScaledConstant = (n: unknown): boolean => {
        const r = n as Record<string, unknown> | undefined;
        if (!r || r.prime !== 'constant') return false;
        const m = r.meta as { scale?: unknown } | null | undefined;
        return !!m && typeof m.scale === 'number' && m.scale !== 1;
      };
      const [a, b] = obj.inputs as unknown[];
      if ((isRatio(a) && isScaledConstant(b)) || (isRatio(b) && isScaledConstant(a))) {
        violations.push({
          check: 'scale_annotation',
          nodePath: path,
          message: 'HF-279: a ratio-source band (compare against a DAG-divide) must NOT carry a scale on its constant — the break is in the quotient\'s own space. Emit the break unscaled (e.g. 1.3 for 130%).',
          severity: 'critical',
        });
      }
    }

    // Decision 127 compliance: when a conditional's condition is a logical(and)
    // over two compare nodes referencing the same field, the lower bound must
    // be gte and the upper bound must be lt (half-open).
    if (prime === 'conditional') {
      const cond = obj.condition as Record<string, unknown> | undefined;
      if (cond && cond.prime === 'logical' && cond.op === 'and' && Array.isArray(cond.inputs)) {
        const cmps = (cond.inputs as Record<string, unknown>[]).filter(c => c.prime === 'compare');
        if (cmps.length === 2) {
          const ops = cmps.map(c => c.op).sort();
          // Acceptable pairs for half-open: [gte, lt]. Reject any [..., lte] pair.
          if (ops.includes('lte') || (!ops.includes('gte') && !ops.includes('lt'))) {
            violations.push({
              check: 'decision_127',
              nodePath: `${path}.condition`,
              message: `Decision 127: tier-selection conditional must use gte+lt (half-open), found ${JSON.stringify(ops)}.`,
              // HF-341 R3: ELEVATED warning→critical. constructTree built half-open band edges
              // deterministically; with direct DAG emission an lte upper bound gap-misses the tier
              // resolver → wrong tier → BCL/MIR drift. Rejected loudly at import (C2).
              severity: 'critical',
            });
          }
        }
      }
    }

    // Terminal completeness: a conditional whose `else` recurses into another
    // conditional must eventually terminate in a leaf constant.
    if (prime === 'conditional') {
      // Walk the else chain to verify it ends in a constant somewhere.
      let cursor: unknown = obj.else;
      let depth = 0;
      let terminated = false;
      while (cursor && typeof cursor === 'object' && depth < 64) {
        const c = cursor as Record<string, unknown>;
        if (c.prime === 'constant') {
          terminated = true;
          break;
        }
        if (c.prime !== 'conditional') break;
        cursor = c.else;
        depth += 1;
      }
      if (!terminated) {
        violations.push({
          check: 'terminal_completeness',
          nodePath: `${path}.else`,
          message: 'Conditional else chain does not terminate in an explicit constant. Add constant(0) as the final fallback.',
          // HF-341 R3: ELEVATED warning→critical. constructTree always emitted a terminal constant(0);
          // with direct DAG emission a non-terminating else chain is a structural hole (undefined
          // fallback) and is rejected loudly at import (C2).
          severity: 'critical',
        });
      }
    }

    if (prime === 'constant') constantLeafCount += 1;
  };

  walk(node, '$', null);

  if (typeof opts.expectedCellCount === 'number' && opts.expectedCellCount > 0) {
    if (constantLeafCount < opts.expectedCellCount) {
      // HF-244 Phase 2: critical severity. When the LLM declares
      // rateTableCellCount on the component, it is asserting the table's true
      // dimensions; a tree carrying fewer constants than that is a truncated
      // emission (BCL C0 case: declared 30 cells, emitted 3 leaves). Persisting
      // the truncated tree silently produces wrong calculations. The validator
      // throws via ai-plan-interpreter.convertComponent so the component
      // never lands in rule_sets.components.
      violations.push({
        check: 'exhaustive_emission',
        nodePath: '$',
        message: `Plan declares ${opts.expectedCellCount} rate-table cells but the emitted tree carries only ${constantLeafCount} constant leaves. Cells are missing — the LLM truncated the table.`,
        severity: 'critical',
      });
    }
  }

  const critical = violations.some(v => v.severity === 'critical');
  return { valid: !critical, violations };
}

// ──────────────────────────────────────────────
// Prompt generation
// ──────────────────────────────────────────────

/**
 * Renders the CALCULATION INTENT block for the plan-interpretation prompt.
 * The prompt's composition surface is generated from PRIME_GRAMMAR — the
 * single canonical declaration — not from a hand-written private copy.
 */
export function generatePromptGrammarSection(): string {
  const primeTable = (Object.keys(PRIME_GRAMMAR) as PrimeType[])
    .map(t => {
      const r = PRIME_GRAMMAR[t];
      const opsTxt = r.ops ? ` ops:{${r.ops.join('|')}}` : '';
      const arityTxt =
        r.arity.kind === 'leaf' ? 'leaf' :
        r.arity.kind === 'fixed' ? `inputs:${r.arity.count}` :
        `inputs:${r.arity.min}+`;
      const childTxt = r.children ? ` children:[${r.children.map(c => c.key).join(',')}]` : '';
      return `  ${t.padEnd(12)} → ${r.output}, ${arityTxt}${opsTxt}${childTxt}`;
    })
    .join('\n');

  return `=== CALCULATION INTENT (PRIME-DAG COMPOSITION) ===

For each component emit a "calculationIntent" field as a recursive PrimeNode tree composed from the ten primes below. Compose freely; do NOT emit named operation types (scalar_multiply, conditional_gate, piecewise_linear, etc.).

PRIME TABLE (canonical declaration — every emission must conform):
${primeTable}

NODE SHAPES:
  constant     { "prime":"constant",     "value":<number>, "meta"?:{...} }
  reference    { "prime":"reference",    "field":"<name>" }
  arithmetic   { "prime":"arithmetic",   "op":"add|subtract|multiply|divide", "inputs":[A,B] }
  compare      { "prime":"compare",      "op":"gt|gte|lt|lte|eq|neq",         "inputs":[A,B] }
  logical      { "prime":"logical",      "op":"and|or|not",                   "inputs":[A,B,...] }
  conditional  { "prime":"conditional",  "condition":<bool>, "then":<num>, "else":<num> }
  filter       { "prime":"filter",       "predicate":{"field":"<col>","operator":"eq|neq|gt|gte|lt|lte|contains","value":<v>}, "downstream":<node> }
  scope        { "prime":"scope",        "boundary":"<attribute>", "downstream":<node>, "temporal_range"?:{"offset":<int>,"length":<int>} }
  aggregate    { "prime":"aggregate",    "op":"sum|count|avg|min|max", "field":"<row_field>" }
  prior_period { "prime":"prior_period", "downstream":<node> }

ENGINE AGGREGATION MODEL (per-row identity vs aggregate identity — CRITICAL for categorical plans):
A "reference" reads a PRE-AGGREGATED metric: before the tree evaluates, the engine has already reduced
all of the entity's transaction rows for that field to a single number. Per-row categorical attributes
(product type, channel, segment, region, status — any field whose values partition the rows into groups)
DO NOT EXIST at that aggregate level. An entity whose transactions span multiple values of an attribute
has NO single value for it after aggregation, so a "conditional" that compares such an attribute against
a constant is meaningless (it can never be evaluated per-row).

"filter" and "aggregate" instead operate on the entity's RAW per-row rows, where per-row identity is
intact. Compose filter -> aggregate to differentiate by a per-row attribute:

1. CATEGORY-DIFFERENTIATED RATES — when a plan applies different rates/rules by a per-ROW attribute,
   emit ONE filtered aggregate per attribute value and combine them with arithmetic. Do NOT gate on the
   attribute with conditional(compare(reference,...)):
     filter{field:<attribute>,operator:"eq",value:<group_value>} -> aggregate{op:"sum",field:<measure>}
   sums <measure> over ONLY the rows where <attribute> == <group_value>. (See SC-07.)

   PER-ROW vs PER-ENTITY: this is for attributes carried on each transaction ROW. For a PER-ENTITY
   category (the payee's role / tier / seniority — one value for the whole entity), do NOT filter rows;
   that differentiation is handled upstream by the variant mechanism (one component per variant id).

2. CONDITIONAL COUNT — when a payout depends on the NUMBER of rows meeting a condition:
     filter{field:<condition_field>,operator:<op>,value:<v>} -> aggregate{op:"count",field:"*"}
   resolves to the count of qualifying rows (the field is ignored for count). (See SC-08.)

3. TEMPORAL ADJUSTMENT (reversal / clawback) — when a plan reverses a prior period's calculation, the
   reversal amount is NOT a data column; it is the stored OUTPUT of a prior calculation. Do NOT reference
   prior-plan outputs (rates, accelerators, multipliers) as data inputs — they are not in the data.
   Emit a sibling "modifiers" array on the component (alongside calculationIntent) so the engine looks up
   the stored original by its reference keys. (See SC-09.)

EXHAUSTIVE EMISSION (CRITICAL):
When the plan contains a rate table with N tiers (1D) or N×M cells (2D), emit exactly N or N×M constant leaf nodes. Every cell must appear in the tree. Do not summarize, collapse, omit, or use a fallback to substitute for missing cells. A 6×5 matrix produces 30 distinct constant leaves; a 5-tier 1D band produces 5 distinct constants plus an explicit constant(0) terminal.

HF-244 — RATE-TABLE CELL DECLARATION (REQUIRED for components with rate tables):
Alongside the calculationIntent on each component, emit a sibling field "rateTableCellCount" with the integer total number of cells in the source rate table. A 5-tier 1D band: rateTableCellCount: 5. A 6×5 matrix: rateTableCellCount: 30. The platform's post-generation validator checks that the emitted tree carries at least rateTableCellCount constant leaves; if fewer, the component is REJECTED. When the component has no rate table (simple rate × metric, linear function, etc.), omit rateTableCellCount entirely.

SCALE METADATA (CRITICAL):
For every constant used in a compare against a reference, annotate the constant with meta describing its native scale on the plan side:
  { "prime":"constant", "value":120, "meta":{"unit":"percent","scale":100,"confidence":0.95} }
  { "prime":"constant", "value":1.2, "meta":{"unit":"ratio","scale":1,    "confidence":0.95} }
The convergence layer reads this metadata to reconcile plan-native values against data-native values without inference. "unit" is the value's NATIVE NATURE in your own terms — describe it freely (e.g. percent, ratio, currency, count, basis points, or whatever fits); there is no fixed set of allowed units. "scale" is the numeric multiplier that converts a ratio-stored data value to the constant's nature (e.g., data=1.1354 × scale=100 = 113.54, comparable to constant=120); use scale=1 when the value needs no conversion.

DECISION 127 — half-open intervals:
Tier-selection conditionals use [min, max). For each non-final tier use compare(gte, input, min) AND compare(lt, input, max), joined by logical(and). For the final tier (open-ended ceiling) use compare(gte, input, min) only. Do NOT use .999 or decimal-truncation patterns. Every conditional else chain must terminate in an explicit constant.

ILLUSTRATIONS:

SC-01 — Simple rate × metric ("4% of warranty sales"):
{ "prime":"arithmetic","op":"multiply",
  "inputs":[
    { "prime":"reference","field":"warranty_sales" },
    { "prime":"constant","value":0.04 }
  ]
}

SC-04 — 1D fixed-output band (5 tiers, payout per attainment band):
{ "prime":"conditional",
  "condition":{ "prime":"compare","op":"gte","inputs":[ {"prime":"reference","field":"attainment"}, {"prime":"constant","value":130,"meta":{"unit":"percent","scale":100,"confidence":0.95}} ] },
  "then":{"prime":"constant","value":550},
  "else":{ "prime":"conditional",
    "condition":{ "prime":"logical","op":"and","inputs":[
      {"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":110,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
      {"prime":"compare","op":"lt","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":130,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]}
    ]},
    "then":{"prime":"constant","value":400},
    "else":{ "prime":"conditional",
      "condition":{ "prime":"logical","op":"and","inputs":[
        {"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":100,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
        {"prime":"compare","op":"lt","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":110,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]}
      ]},
      "then":{"prime":"constant","value":250},
      "else":{ "prime":"conditional",
        "condition":{ "prime":"logical","op":"and","inputs":[
          {"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":80,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
          {"prime":"compare","op":"lt","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":100,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]}
        ]},
        "then":{"prime":"constant","value":120},
        "else":{"prime":"constant","value":0}
      }
    }
  }
}

SC-06 — 2D fixed-output band (3×3 matrix, intersection of two ranges):
Each cell is one nested conditional. For a 3×3 matrix, emit 9 constant leaves plus a constant(0) terminal. Structure:
{ "prime":"conditional",
  "condition":{"prime":"logical","op":"and","inputs":[
    {"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":120,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
    {"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"quality"},{"prime":"constant","value":95,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]}
  ]},
  "then":{"prime":"constant","value":700},
  "else":{ "prime":"conditional", "condition":"…", "then":"…", "else":"…" }
}
... continue nesting until all 9 cells emit; terminate else chain in constant(0).

SC-05 — Piecewise rate × base ("rate varies by attainment band, applied to revenue"):
{ "prime":"arithmetic","op":"multiply",
  "inputs":[
    { "prime":"reference","field":"revenue" },
    { "prime":"conditional",
      "condition":{"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":100,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
      "then":{"prime":"constant","value":0.05},
      "else":{ "prime":"conditional",
        "condition":{"prime":"compare","op":"gte","inputs":[{"prime":"reference","field":"attainment"},{"prime":"constant","value":85,"meta":{"unit":"percent","scale":100,"confidence":0.95}}]},
        "then":{"prime":"constant","value":0.03},
        "else":{"prime":"constant","value":0}
      }
    }
  ]
}

SC-07 — Category-differentiated rates (per-ROW attribute: 8% on rows where product_type="warranty", 3% on rows where product_type="accessory"). One filtered aggregate per category, combined with add — NOT a conditional on the category:
{ "prime":"arithmetic","op":"add",
  "inputs":[
    { "prime":"arithmetic","op":"multiply","inputs":[
      { "prime":"filter","predicate":{"field":"product_type","operator":"eq","value":"warranty"},
        "downstream":{"prime":"aggregate","op":"sum","field":"amount"} },
      { "prime":"constant","value":0.08 }
    ]},
    { "prime":"arithmetic","op":"multiply","inputs":[
      { "prime":"filter","predicate":{"field":"product_type","operator":"eq","value":"accessory"},
        "downstream":{"prime":"aggregate","op":"sum","field":"amount"} },
      { "prime":"constant","value":0.03 }
    ]}
  ]
}

SC-08 — Conditional count ("$25 per transaction with status="approved""). filter -> aggregate(count, "*") times a per-unit constant:
{ "prime":"arithmetic","op":"multiply",
  "inputs":[
    { "prime":"filter","predicate":{"field":"status","operator":"eq","value":"approved"},
      "downstream":{"prime":"aggregate","op":"count","field":"*"} },
    { "prime":"constant","value":25 }
  ]
}

SC-09 — Temporal adjustment / clawback (reversal of a prior commission on returned items). Emit a sibling "modifiers" array on the COMPONENT (NOT inside calculationIntent); the reversal amount is resolved by the engine from the stored original calculation via its reference keys, never from a data column. The calculationIntent describes only the in-period portion (often constant(0) for a pure reversal):
  "calculationIntent": { "prime":"constant","value":0 },
  "modifiers": [
    { "modifier":"temporal_adjustment",
      "adjustmentType":"per_transaction_reversal",
      "referenceMapping":{ "returnField":"<column on the return row referencing the original txn>",
                           "originalField":"<matching column on the original row>" },
      "recoveryRate":1.0 }
  ]

CRITICAL: Every component MUST carry both "calculationMethod" (the free-form description, preserved) AND "calculationIntent" (the PrimeNode tree). The tree's root must use one of the ten primes above — the engine rejects any other discriminator.`;
}
