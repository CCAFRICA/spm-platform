# OB-200 — Plan Comprehension Contract: Grammar, Scale, Convergence Unification

**Branch:** `dev` (off `main @ 614a748d` via merge `cf858c28`)
**Date:** 2026-05-20
**Scope:** Structural response to the six-iteration audit-fix pattern (AUD-011 → DIAG-054 + HF-241 → HF-243). Five defects closed in one OB: incomplete LLM emission, scale mismatch, dual-path convergence, missing scope expression, evaluator boundary semantics.

---

## Phase 1 — Compositional Grammar

### `web/src/lib/calculation/prime-grammar.ts`

Per T1-E910 v2: the structural primitives of the prime-DAG engine live in **exactly one canonical declaration**. The prompt, the validator, and the evaluator all derive from this file.

The exported `PRIME_GRAMMAR` is a record keyed by `PrimeType` listing for each prime: output type (numeric/boolean), arity (leaf/fixed/variadic), per-input expected types, named child slots (downstream/condition/then/else), and the allowed `op` discriminators.

```typescript
export const PRIME_GRAMMAR: Record<PrimeType, PrimeRule> = {
  constant: {
    type: 'constant',
    output: 'numeric',
    arity: { kind: 'leaf' },
    description: 'Literal numeric value. Carries optional meta={unit,scale,confidence} when used in a compare against a reference value (see SCALE METADATA below).',
  },
  reference: {
    type: 'reference',
    output: 'numeric',
    arity: { kind: 'leaf' },
    description: 'Read a resolved numeric metric. Synthetic keys: "attr:<a>" (entity attribute), "prior:<i>" (prior component output), "cross_data:<type>:<agg>[:<field>]" (cross-plan count/sum), "group:<m>" (group-scope metric).',
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
```

### `generatePromptGrammarSection()` — generated prompt block

The plan-interpretation prompt's CALCULATION INTENT block is produced from `PRIME_GRAMMAR` via `generatePromptGrammarSection()`. The placeholder `<<PRIME_GRAMMAR>>` lives in the system prompt (`web/src/lib/ai/providers/anthropic-adapter.ts`) and is substituted at request time using the existing `<<…>>` pattern (line ~720). The generated block: **7411 chars / ~1853 tokens** — well under the HALT-1 4000-token ceiling.

```
=== CALCULATION INTENT (PRIME-DAG COMPOSITION) ===

For each component emit a "calculationIntent" field as a recursive PrimeNode tree composed from the ten primes below. Compose freely; do NOT emit named operation types (scalar_multiply, conditional_gate, piecewise_linear, etc.).

PRIME TABLE (canonical declaration — every emission must conform):
  constant     → numeric, leaf
  reference    → numeric, leaf
  arithmetic   → numeric, inputs:2 ops:{add|subtract|multiply|divide}
  compare      → boolean, inputs:2 ops:{gt|gte|lt|lte|eq|neq}
  logical      → boolean, inputs:1+ ops:{and|or|not}
  conditional  → numeric, leaf children:[condition,then,else]
  filter       → numeric, leaf ops:{eq|neq|gt|gte|lt|lte|contains} children:[downstream]
  scope        → numeric, leaf children:[downstream]
  aggregate    → numeric, leaf ops:{sum|count|avg|min|max}
  prior_period → numeric, leaf children:[downstream]

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
      …
      "then":{"prime":"constant","value":250},
      …
      "then":{"prime":"constant","value":120},
      "else":{"prime":"constant","value":0}
    }
  }
}

SC-06 — 2D fixed-output band (3×3 matrix, intersection of two ranges) — 9 constant leaves + constant(0) terminal.
SC-05 — Piecewise rate × base — rate switches by attainment band, multiplied against revenue.

CRITICAL: Every component MUST carry both "calculationMethod" (the free-form description, preserved) AND "calculationIntent" (the PrimeNode tree). The tree's root must use one of the ten primes above — the engine rejects any other discriminator.
```

### `validatePrimeTree` — body

```typescript
export function validatePrimeTree(
  node: unknown,
  opts: ValidateOptions = {},
): ValidationResult {
  const violations: ValidationViolation[] = [];
  let constantLeafCount = 0;

  const walk = (n: unknown, path: string, parentPrime: PrimeType | null): void => {
    if (n === null || typeof n !== 'object') {
      violations.push({ check: 'arity', nodePath: path, message: 'Node is not an object.', severity: 'critical' });
      return;
    }
    const obj = n as Record<string, unknown>;
    const prime = obj.prime;
    if (typeof prime !== 'string' || !VALID_PRIMES.has(prime as PrimeNode['prime'])) {
      violations.push({ check: 'unknown_prime', nodePath: path,
        message: `Prime "${String(prime)}" is not in the canonical declaration.`, severity: 'critical' });
      return;
    }
    const rule = PRIME_GRAMMAR[prime as PrimeType];

    if (rule.ops) {
      const op = typeof obj.op === 'string' ? obj.op : undefined;
      if (!op || !rule.ops.includes(op)) {
        violations.push({ check: 'op_unknown', nodePath: path,
          message: `Prime "${prime}" requires op in {${rule.ops.join(', ')}}, got "${String(op)}".`,
          severity: 'critical' });
      }
    }
    if (rule.arity.kind === 'fixed') {
      const inputs = Array.isArray(obj.inputs) ? obj.inputs : [];
      if (inputs.length !== rule.arity.count) {
        violations.push({ check: 'arity', nodePath: path,
          message: `Prime "${prime}" expects exactly ${rule.arity.count} inputs, got ${inputs.length}.`,
          severity: 'critical' });
      }
      inputs.forEach((child, i) => walk(child, `${path}.inputs[${i}]`, prime as PrimeType));
    } else if (rule.arity.kind === 'variadic') {
      const inputs = Array.isArray(obj.inputs) ? obj.inputs : [];
      if (inputs.length < rule.arity.min) {
        violations.push({ check: 'arity', nodePath: path,
          message: `Prime "${prime}" expects at least ${rule.arity.min} inputs, got ${inputs.length}.`,
          severity: 'critical' });
      }
      inputs.forEach((child, i) => walk(child, `${path}.inputs[${i}]`, prime as PrimeType));
    }
    if (rule.children) {
      for (const slot of rule.children) {
        const child = obj[slot.key];
        if (child === undefined) {
          violations.push({ check: 'child_topology', nodePath: path,
            message: `Prime "${prime}" is missing required child "${slot.key}".`, severity: 'critical' });
          continue;
        }
        walk(child, `${path}.${slot.key}`, prime as PrimeType);
      }
    }
    // Scale annotation: constant in compare position without meta → warning
    if (prime === 'constant' && parentPrime === 'compare') {
      if (obj.meta === undefined || obj.meta === null) {
        violations.push({ check: 'scale_annotation', nodePath: path,
          message: 'Constant in compare position lacks meta={unit,scale,confidence}. Convergence may need to infer scale.',
          severity: 'warning' });
      }
    }
    // Decision 127: tier-selection conditional with logical(and) over two compares — require gte+lt (not lte) → warning
    if (prime === 'conditional') {
      const cond = obj.condition as Record<string, unknown> | undefined;
      if (cond && cond.prime === 'logical' && cond.op === 'and' && Array.isArray(cond.inputs)) {
        const cmps = (cond.inputs as Record<string, unknown>[]).filter(c => c.prime === 'compare');
        if (cmps.length === 2) {
          const ops = cmps.map(c => c.op).sort();
          if (ops.includes('lte') || (!ops.includes('gte') && !ops.includes('lt'))) {
            violations.push({ check: 'decision_127', nodePath: `${path}.condition`,
              message: `Decision 127: tier-selection conditional must use gte+lt (half-open), found ${JSON.stringify(ops)}.`,
              severity: 'warning' });
          }
        }
      }
    }
    // Terminal completeness: conditional else chain must end in a constant → warning
    if (prime === 'conditional') {
      let cursor: unknown = obj.else;
      let depth = 0;
      let terminated = false;
      while (cursor && typeof cursor === 'object' && depth < 64) {
        const c = cursor as Record<string, unknown>;
        if (c.prime === 'constant') { terminated = true; break; }
        if (c.prime !== 'conditional') break;
        cursor = c.else;
        depth += 1;
      }
      if (!terminated) {
        violations.push({ check: 'terminal_completeness', nodePath: `${path}.else`,
          message: 'Conditional else chain does not terminate in an explicit constant. Add constant(0) as the final fallback.',
          severity: 'warning' });
      }
    }
    if (prime === 'constant') constantLeafCount += 1;
  };

  walk(node, '$', null);

  if (typeof opts.expectedCellCount === 'number' && opts.expectedCellCount > 0) {
    if (constantLeafCount < opts.expectedCellCount) {
      violations.push({ check: 'exhaustive_emission', nodePath: '$',
        message: `Plan declares ${opts.expectedCellCount} rate-table cells but the emitted tree carries only ${constantLeafCount} constant leaves. Cells are missing.`,
        severity: 'warning' });
    }
  }

  const critical = violations.some(v => v.severity === 'critical');
  return { valid: !critical, violations };
}
```

### `anthropic-adapter.ts` wiring

Existing `<<…>>` placeholder pattern (used for `<<FOUNDATIONAL_PRIMITIVES>>`, `<<COMPONENT_TYPE_LIST>>`, `<<STRUCTURAL_EXAMPLES>>`) extended with `<<PRIME_GRAMMAR>>`. The CALCULATION INTENT block in `plan_interpretation` shrunk from ~226 lines of hand-written examples to one placeholder line:

```
=== CALCULATION INTENT (PRIME-DAG COMPOSITION) ===   (pre-OB-200, lines 429-654 of anthropic-adapter.ts)

vs.

<<PRIME_GRAMMAR>>                                     (post-OB-200, line 429 — substituted at request time)
```

Substitution at line 721:
```typescript
if (systemPrompt.includes('<<PRIME_GRAMMAR>>')) {
  systemPrompt = systemPrompt.replace('<<PRIME_GRAMMAR>>', generatePromptGrammarSection());
}
```

---

## Phase 2 — Scale Metadata + D127 Evaluator Reconciliation

### `PrimeNode.constant` gains optional `meta`

`web/src/lib/calculation/intent-types.ts`:

```typescript
export interface ConstantScaleMeta {
  unit: 'percent' | 'ratio' | 'currency' | 'count';
  scale: number;
  confidence: number;
}
export interface ScopeTemporalRange {
  offset: number;
  length: number;
}
export type PrimeNode =
  | …
  | { prime: 'scope'; boundary: string; downstream: PrimeNode; temporal_range?: ScopeTemporalRange }
  | …
  | { prime: 'constant'; value: number; meta?: ConstantScaleMeta }
  | …;
```

Additive — existing trees without `meta` evaluate exactly as before.

### Evaluator compare reconciliation

Single reconciliation site in `intent-executor.ts` (compare case). When ONE input is a constant carrying `meta` and the OTHER is not, the non-meta side is scaled onto the constant's units before comparing:

```typescript
case 'compare': {
  const leftMeta = isConstantWithMeta(node.inputs[0]) ? node.inputs[0].meta : undefined;
  const rightMeta = isConstantWithMeta(node.inputs[1]) ? node.inputs[1].meta : undefined;
  let a = evaluate(node.inputs[0], context);
  let b = evaluate(node.inputs[1], context);
  if (leftMeta && !rightMeta)      b = b.mul(toDecimal(leftMeta.scale));
  else if (rightMeta && !leftMeta) a = a.mul(toDecimal(rightMeta.scale));
  // … existing op switch unchanged
}
```

Worked example: `reference(cumplimiento_colocacion)` = 1.1354 (ratio), `constant(120, meta={unit:'percent',scale:100})` = 120. The right side has meta; the left does not — scale the left: 1.1354 × 100 = 113.54. Compare 113.54 vs 120 → false. Correct.

### Convergence consumption

`convergence-service.ts` gains `extractScaleMetadataFromDAG(node, fieldName)`: walks the DAG for compare nodes where one side references `fieldName` and the other is a constant carrying `meta`. Returns the first found `{unit, scale, confidence}` (the LLM emits a consistent scale per field).

`ComponentInputRequirement` gains optional `scaleMetadata`. The `prime_dag` case in `extractInputRequirements` populates it alongside the HF-243 `expectedRange`. `scoreColumnForRequirement` short-circuits with the LLM-provided scale when present — the ratio-vs-percentage trial is bypassed because the LLM told us the scale.

### Decision 127 evaluator

The evaluator's compare case already honors per-node operator (`gt`/`gte`/`lt`/`lte`/`eq`/`neq`). Decision 127 compliance therefore flows from the DAG's compare nodes — and Phase 1's grammar prompt now teaches the LLM to emit `gte` + `lt` for half-open intervals. The legacy `findBoundaryIndex` helper (unused by `evaluate()`) already honors `minInclusive`/`maxInclusive`. No evaluator-side change required.

---

## Phase 3 — Convergence Pipeline Unification

### Dual-path defect removed

Pre-OB-200 (`convergence-service.ts` lines 613–620):

```typescript
const hasCategoricalData = capabilities.some(cap => (cap.categoricalFields?.length ?? 0) > 0);
const allResolvedMetrics = new Set(derivations.map(d => d.metric));
const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
const unresolvedForAI = hasCategoricalData
  ? allRequiredMetrics
  : allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));  // ← gate bypassed Pass 5
```

When `hasCategoricalData === false`, only the unresolved subset reached Pass 5. The earlier ratio-pair inline block produced filter-less derivations (`filters: []`), gating Pass 5 from firing for those metrics. Filter discovery was architecturally unreachable.

Post-OB-200:

```typescript
const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
const unresolvedForAI = allRequiredMetrics;  // unified — every metric reaches Pass 5
```

`applyMetricDerivations` processes the derivations array in order; the last entry wins per metric key. Pass 5's authoritative output supersedes any earlier inline derivation for the same metric — additive change preserving git-blame readability.

### Scope expression on derivation rules

`MetricDerivationRule` (`run-calculation.ts:63`) gains:

```typescript
scope?: {
  entity_group_by?: string;        // e.g., 'district', 'team_lead_id'
  temporal_range?: { offset: number; length: number };
  aggregation_function?: 'sum' | 'count' | 'avg' | 'min' | 'max';
};
```

`LegacyDerivation` gains the same shape. `legacyDerivationToDAG` wraps the produced filter-chain+aggregate DAG with a `scope` prime when `entity_group_by` is set:

```typescript
if (d.scope?.entity_group_by) {
  dag = {
    prime: 'scope',
    boundary: d.scope.entity_group_by,
    downstream: dag,
    ...(d.scope.temporal_range ? { temporal_range: d.scope.temporal_range } : {}),
  };
}
```

Same `evaluate()` surface handles intent-side scope and derivation-side scope — one execution path.

### Pass 5 prompt — scope teaching

The AI prompt in `generateAISemanticDerivations` extended with a SCOPE EXPRESSION section explaining when to emit `scope:{entity_group_by, aggregation_function}` on a derivation. Output schema example updated to show the field. Post-LLM, the runtime validates the scope shape (entity_group_by must be a non-empty string) before persisting — malformed emissions ignored.

### HALT-3 / HALT-4 compliance

- HALT-3: no convergence function signatures changed. The single call site at `route.ts:252` (`convergeBindings(tenantId, ruleSetId, supabase, calculationRunId)`) and the persistence at lines 263–275 are unchanged.
- HALT-4: change is additive — `scope?` is a new optional field; existing rules without scope flow through unchanged. Pass 5's output appends to the derivations array; the in-order overwrite semantics preserve correctness for tenants whose data was already correctly resolved by earlier passes.

---

## Phase 4 — Post-Generation Constraint Validator

### `web/src/lib/calculation/prime-validator.ts`

Thin wrapper over `prime-grammar.validatePrimeTree`:

```typescript
import { validatePrimeTree } from './prime-grammar';
import type { ValidationResult, ValidationViolation } from './prime-grammar';

export function validateComponentIntent(
  intent: unknown,
  opts: ValidateComponentOptions = {},
): ValidationResult {
  return validatePrimeTree(intent, { expectedCellCount: opts.expectedCellCount });
}

export function logValidationViolations(
  result: ValidationResult,
  componentLabel: string,
  logger: (line: string) => void = (s) => console.warn(s),
): void {
  if (result.violations.length === 0) return;
  for (const v of result.violations) {
    logger(
      `[PrimeValidator] ${componentLabel} (${v.severity}) ${v.check} @ ${v.nodePath}: ${v.message}`,
    );
  }
}
```

### Wiring in `ai-plan-interpreter.ts`

After the existing structural `validatePrimeNodeTree(intentNode)` check in `convertComponent`, OB-200 Phase 4 runs `validateComponentIntent`. Critical violations (unknown_prime, arity, op_unknown, child_topology) throw `UnconvertibleComponentError` — the component cannot proceed because the emission shape would crash the evaluator. Warnings (scale_annotation, terminal_completeness, decision_127, exhaustive_emission) are logged but do not block.

```typescript
const validation = validateComponentIntent(intentNode, { componentLabel: base.name });
logValidationViolations(validation, base.name);
if (!validation.valid) {
  const critical = validation.violations.filter(v => v.severity === 'critical');
  throw new UnconvertibleComponentError(
    `[convertComponent] "${base.name}" emitted a prime-DAG calculationIntent ` +
    `with ${critical.length} critical grammar violation(s): ` +
    `${critical.map(v => `${v.check}@${v.nodePath}: ${v.message}`).join('; ')}.`,
  );
}
```

---

## Phase 5 — Verification

### 5.1 Build verification (CC, local)

```
pkill -f "next dev"
rm -rf .next
npm run build    → ✓ Compiled successfully
npm run dev      → HTTP 307 at /
npx tsc --noEmit → clean
```

Adapter API surface unchanged (HF-238 contract preserved): `evaluate`, `buildEvalContext`, `executeIntent`, `findBoundaryIndex`, `IntentExecutorUnknownOperationError` (intent-executor); `legacyIntentToDAG`, `legacyDerivationToDAG`, `componentIntentToDAG`, `UntranslatableLegacyIntentError` (legacy-intent-to-dag); `extractReferencesFromDAG`, `extractExpectedRangeFromDAG`, `extractScaleMetadataFromDAG` (convergence-service).

### 5.2 BCL verification — architect-manual

CC provided the verification scaffolding; runtime numbers require the architect to drive the browser (per session-wide constraint: CC cannot drive browser).

Wipe procedure:

```sql
-- Run from Supabase SQL editor (service role)
UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

Or run the wipe script:

```bash
cd web && set -a && source .env.local && set +a
npx tsx scripts/ob200-wipe-bcl-crp-bindings.ts
```

Then trigger a BCL October calculation through the browser. After the calc completes, run:

```bash
npx tsx scripts/ob200-report-results.ts
```

The report script prints per-component totals, per-period grand totals, and the binding shape (column / scale_factor / filters / scope per component_N).

Expected convergence log signatures post-OB-200 for BCL October:

```
[Convergence] HF-112 Cumplimiento Colocación:cumplimiento_colocacion → <col> (AI+validated, scale=100, filters=…)
[Convergence] HF-112 Cumplimiento Depósitos:cumplimiento_depositos → <col> (AI+validated, scale=100, filters=…)
[Convergence] HF-112 Calidad de Cartera:calidad_cartera → <col> (AI+validated, scale=100, filters=…)
```

Scale=100 should now be CONSUMED from the DAG's `constant.meta.scale` (no longer inferred from threshold distribution) for trees that the LLM re-emitted under the OB-200 prompt. For BCL trees still carrying the pre-OB-200 emission (without `meta`), HF-243's `extractExpectedRangeFromDAG` deterministic fallback fires — this is the documented graceful-degradation path.

To be filled by architect after manual run:

| Period | Grand total | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|---|
| October | _$..._ | _..._ | _..._ | _..._ | _..._ | _..._ | _..._ | _..._ | _..._ |
| (5 other periods) | … | | | | | | | | |

### 5.3 CRP verification — architect-manual

```sql
UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

CRP Plans 1+3 should retain reconciliation. Plans 2+4 (`piecewise_linear`, `scope_aggregate`) are the OB-200 target: Phase 3's unified Pass 5 now produces complete derivation rules including filters and scope for every component. The CRP Plan 4 scope_aggregate path is the test case for the new scope wiring (`legacyDerivationToDAG` wraps with `scope` prime when the AI emits `scope:{entity_group_by:…}`).

To be filled by architect:

| Plan | Total |
|---|---|
| Plan 1 | _..._ |
| Plan 2 | _..._ |
| Plan 3 | _..._ |
| Plan 4 | _..._ |

---

## Out of scope (per directive §10)

- Plan supersession fix (DIAG-054 Probe 1) — separate HF.
- Evaluator unit test suite — separate HF.
- Temporal prime extensions (clawback SC-15, retroactive SC-16, accelerator SC-17, draw SC-18, cumulative SC-20) — separate DS.
- Substrate supersession candidates (T1-E902/E910/E906/E903 extensions) — VG-side work.
- Read-before-derive at plan interpretation — separate HF.

## Residuals

- Existing rule_sets with old-format intents (no `meta` on constants) use `extractExpectedRangeFromDAG` fallback. A migration HF to re-interpret existing plans through the OB-200 grammar is deferred. The fallback is byte-identical to HF-243 behavior, so no regression.
- The grammar covers the 14 non-deferred structure classes. Novel structures the grammar doesn't anticipate compose from the same rules but may need additional grammar illustrations in future HFs.
- Phase 3 unification removed the categorical-data gate. Tenants whose Pass 5 emits suboptimal filters (e.g., adding spurious filters where none are needed) will surface during architect-manual verification; the architect can tune the Pass 5 prompt without re-introducing the gate.

---

## Files changed

Phase 1:
- `web/src/lib/calculation/prime-grammar.ts` (new)
- `web/src/lib/ai/providers/anthropic-adapter.ts` (calc-intent block → placeholder + substitution)

Phase 2:
- `web/src/lib/calculation/intent-types.ts` (ConstantScaleMeta, ScopeTemporalRange, PrimeNode union extensions)
- `web/src/lib/calculation/intent-executor.ts` (compare reconciliation, isConstantWithMeta)
- `web/src/lib/intelligence/convergence-service.ts` (extractScaleMetadataFromDAG, ComponentInputRequirement.scaleMetadata, scoreColumnForRequirement short-circuit)

Phase 3:
- `web/src/lib/calculation/run-calculation.ts` (MetricDerivationRule.scope, applyMetricDerivations propagation)
- `web/src/lib/calculation/legacy-intent-to-dag.ts` (LegacyDerivation.scope, scope-prime wrap)
- `web/src/lib/intelligence/convergence-service.ts` (gate removed, Pass 5 prompt scope teaching, scope shape validation)

Phase 4:
- `web/src/lib/calculation/prime-validator.ts` (new)
- `web/src/lib/compensation/ai-plan-interpreter.ts` (validateComponentIntent wiring)

Phase 5:
- `web/scripts/ob200-wipe-bcl-crp-bindings.ts` (new — service-role wipe helper)
- `web/scripts/ob200-report-results.ts` (new — post-calc verification reporter)
- `docs/completion-reports/OB-200_COMPLETION_REPORT.md` (this file)
