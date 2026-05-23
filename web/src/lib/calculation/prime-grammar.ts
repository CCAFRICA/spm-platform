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

export type ScaleUnit = 'percent' | 'ratio' | 'currency' | 'count';

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

    // Op discriminator check
    if (rule.ops) {
      const op = typeof obj.op === 'string' ? obj.op : undefined;
      if (!op || !rule.ops.includes(op)) {
        violations.push({
          check: 'op_unknown',
          nodePath: path,
          message: `Prime "${prime}" requires op in {${rule.ops.join(', ')}}, got "${String(op)}".`,
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

    // Scale annotation check: a constant used as the second input of a compare
    // and not referenced against another constant should carry meta. The check
    // fires for the constant node when its parent is a compare.
    if (prime === 'constant' && parentPrime === 'compare') {
      const meta = obj.meta;
      if (meta === undefined || meta === null) {
        violations.push({
          check: 'scale_annotation',
          nodePath: path,
          message: 'Constant in compare position lacks meta={unit,scale,confidence}. Convergence may need to infer scale.',
          severity: 'warning',
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
              severity: 'warning',
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
          severity: 'warning',
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

EXHAUSTIVE EMISSION (CRITICAL):
When the plan contains a rate table with N tiers (1D) or N×M cells (2D), emit exactly N or N×M constant leaf nodes. Every cell must appear in the tree. Do not summarize, collapse, omit, or use a fallback to substitute for missing cells. A 6×5 matrix produces 30 distinct constant leaves; a 5-tier 1D band produces 5 distinct constants plus an explicit constant(0) terminal.

HF-244 — RATE-TABLE CELL DECLARATION (REQUIRED for components with rate tables):
Alongside the calculationIntent on each component, emit a sibling field "rateTableCellCount" with the integer total number of cells in the source rate table. A 5-tier 1D band: rateTableCellCount: 5. A 6×5 matrix: rateTableCellCount: 30. The platform's post-generation validator checks that the emitted tree carries at least rateTableCellCount constant leaves; if fewer, the component is REJECTED. When the component has no rate table (simple rate × metric, linear function, etc.), omit rateTableCellCount entirely.

SCALE METADATA (CRITICAL):
For every constant used in a compare against a reference, annotate the constant with meta describing its native scale on the plan side:
  { "prime":"constant", "value":120, "meta":{"unit":"percent","scale":100,"confidence":0.95} }
  { "prime":"constant", "value":1.2, "meta":{"unit":"ratio","scale":1,    "confidence":0.95} }
The convergence layer reads this metadata to reconcile plan-native values against data-native values without inference. Units: "percent" | "ratio" | "currency" | "count". scale is the multiplier that converts a ratio-stored data value to the constant's units (e.g., data=1.1354 × scale=100 = 113.54, comparable to constant=120).

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

CRITICAL: Every component MUST carry both "calculationMethod" (the free-form description, preserved) AND "calculationIntent" (the PrimeNode tree). The tree's root must use one of the ten primes above — the engine rejects any other discriminator.`;
}
