# AUD-011 — HF-238 Architectural Integrity Audit

**Audit branch:** `aud-011-hf238-integrity` off `main @ 8600aaa7`
**Code under audit:** `hf-238-prime-dag-engine @ 086c9d8a` (PR #420)
**Date captured:** 2026-05-19
**Scope:** Read-only verbatim code extraction. No code changes; no file modifications. Zero interpretation.

Eight probes follow. Each probe pastes verbatim code from the HF-238 branch at the
specified file paths and line ranges. The architect reviews the pasted code and
determines genuine vs facade.

---

## PROBE 1 — THE ADAPTER

**File:** `web/src/lib/calculation/legacy-intent-to-dag.ts`
**Full file, 755 lines:**

```typescript
// HF-238: Legacy intent → Prime DAG format adapter.
//
// Single-purpose deterministic format translator. NOT an execution path —
// produces PrimeNode trees that the evaluate() walker in intent-executor.ts
// processes. The ONE evaluator handles output; this file handles input.
//
// Coverage gate (Phase 0 inventory, audit at 8600aaa7):
//   Operation types (7):   bounded_lookup_1d, bounded_lookup_2d,
//                          conditional_gate, constant, linear_function,
//                          piecewise_linear, scalar_multiply
//   Source types (5):      aggregate, constant, metric, ratio, scope_aggregate
//   Modifier types (1):    cap
//   Intent signatures (7): see Phase 0 commit body
//
// Every shape in the inventory has a translation rule below. Untranslatable
// shapes throw `UntranslatableLegacyIntentError` with the LLM emission
// preserved — Korean Test v2 / structured failure on unrecognized.

import type {
  IntentOperation,
  IntentSource,
  IntentModifier,
  ComponentIntent,
  PrimeNode,
  PrimePredicate,
} from './intent-types';
import { isPrimeNode } from './intent-types';

export class UntranslatableLegacyIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UntranslatableLegacyIntentError';
  }
}

// ──────────────────────────────────────────────
// Source-position translation
// ──────────────────────────────────────────────
//
// IntentSource values appear in input positions (e.g., `linear_function.input`,
// `scalar_multiply.input`, `conditional_gate.condition.left`). Each source type
// becomes a sub-tree whose evaluation produces the value the legacy executor
// would have produced via resolveSource.
//
// Source-to-reference mapping (consistent with intent-executor pre-HF-238
// behavior, see line numbers in deleted resolveSource for verification):
//   metric          { sourceSpec.field }    → reference(field strip 'metric:')
//   aggregate       { sourceSpec.field }    → reference(field)  (engine reads data.metrics[field];
//                                                                  field can be a derived metric name)
//   ratio           { sourceSpec.numerator, denominator } → divide(ref(num), ref(den)) zero-guarded
//   constant        { value }               → constant(value)
//   entity_attribute{ sourceSpec.attribute }→ reference('attr:' + attr)  (pre-populated in metrics)
//   prior_component { sourceSpec.componentIndex } → reference('prior:' + idx)
//   cross_data      { sourceSpec.dataType, field?, aggregation } → reference('cross_data:' + key)
//   scope_aggregate { sourceSpec.field, scope, aggregation } → scope(boundary, aggregate(op, field))

function stripMetricPrefix(field: string): string {
  return field.startsWith('metric:') ? field.slice(7) : field;
}

function translateSource(src: IntentSource | IntentOperation): PrimeNode {
  // If it's actually an IntentOperation in a source slot (composability),
  // dispatch through translateOperation.
  if ('operation' in src && typeof (src as { operation?: string }).operation === 'string') {
    return translateOperation(src as IntentOperation);
  }

  const s = src as IntentSource;
  switch (s.source) {
    case 'metric': {
      const field = (s.sourceSpec?.field ?? '') as string;
      return { prime: 'reference', field: stripMetricPrefix(field) };
    }
    case 'ratio': {
      const num = (s.sourceSpec?.numerator ?? '') as string;
      const den = (s.sourceSpec?.denominator ?? '') as string;
      // Zero-guard via conditional: if denominator == 0, return 0; else divide.
      return {
        prime: 'conditional',
        condition: {
          prime: 'compare',
          op: 'eq',
          inputs: [
            { prime: 'reference', field: stripMetricPrefix(den) },
            { prime: 'constant', value: 0 },
          ],
        },
        then: { prime: 'constant', value: 0 },
        else: {
          prime: 'arithmetic',
          op: 'divide',
          inputs: [
            { prime: 'reference', field: stripMetricPrefix(num) },
            { prime: 'reference', field: stripMetricPrefix(den) },
          ],
        },
      };
    }
    case 'aggregate': {
      const field = (s.sourceSpec?.field ?? '') as string;
      const stripped = stripMetricPrefix(field);
      // Legacy resolveSource at intent-executor.ts:113-132 reads from
      // data.groupMetrics when scope === 'group', otherwise data.metrics.
      // executeIntent's buildEvalContext pre-populates context.metrics with
      // both keys: bare `field` (entity scope) and `group:field` (group scope).
      const scope = (s.sourceSpec as { scope?: string })?.scope;
      return {
        prime: 'reference',
        field: scope === 'group' ? `group:${stripped}` : stripped,
      };
    }
    case 'constant': {
      return { prime: 'constant', value: Number(s.value ?? 0) };
    }
    case 'entity_attribute': {
      const attr = s.sourceSpec.attribute;
      // Caller pre-populates context.metrics['attr:' + attr] from data.attributes
      // in the executeIntent wrapper. Adapter emits a reference to that synthetic key.
      return { prime: 'reference', field: `attr:${attr}` };
    }
    case 'prior_component': {
      const idx = s.sourceSpec.componentIndex;
      return { prime: 'reference', field: `prior:${idx}` };
    }
    case 'cross_data': {
      const { dataType, field, aggregation } = s.sourceSpec;
      const key = field ? `${dataType}:${aggregation}:${field}` : `${dataType}:${aggregation}`;
      return { prime: 'reference', field: `cross_data:${key}` };
    }
    case 'scope_aggregate': {
      const { field, scope, aggregation } = s.sourceSpec;
      // HF-238 Phase 3: structural composition. The `scope` prime narrows
      // context.allEntityRows to siblings sharing the boundary value (with
      // self-exclusion per legacy aggregateScopeRows semantics); the
      // `aggregate` prime reduces those rows to the requested aggregation.
      // Replaces the Phase 1 reference-form translation now that route.ts
      // wires allEntityRows through EntityData.
      const op = aggregation === 'average' ? 'avg'
        : aggregation === 'first' || aggregation === 'last' ? 'sum'  // fallback for unsupported aggregations
        : (aggregation as 'sum' | 'count' | 'min' | 'max');
      return {
        prime: 'scope',
        boundary: scope,
        downstream: {
          prime: 'aggregate',
          op,
          field: stripMetricPrefix(field),
        },
      };
    }
    default: {
      const ex = (s as { source?: string }).source ?? '<undefined>';
      throw new UntranslatableLegacyIntentError(
        `[legacyIntentToDAG] Unrecognized IntentSource discriminator "${ex}". ` +
        `Source emission preserved: ${JSON.stringify(s)}. Phase 0 inventory must include this shape.`
      );
    }
  }
}

// ──────────────────────────────────────────────
// Operation translation
// ──────────────────────────────────────────────

function translateOperation(op: IntentOperation): PrimeNode {
  // Phase 0 inventory edge case: some stored intents persist a bare
  // IntentSource at the top level (no `operation` discriminator) — Meridian
  // Fleet Utilization components carry `{ source: 'ratio', sourceSpec: ... }`
  // directly. Treat this as a source-position intent and translate via
  // translateSource.
  const opOrSource = op as unknown as Record<string, unknown>;
  if (typeof opOrSource.operation !== 'string' && typeof opOrSource.source === 'string') {
    return translateSource(opOrSource as unknown as IntentSource);
  }

  switch (op.operation) {
    case 'constant': {
      return { prime: 'constant', value: Number(op.value ?? 0) };
    }

    case 'linear_function': {
      // y = slope × input + intercept
      return {
        prime: 'arithmetic',
        op: 'add',
        inputs: [
          {
            prime: 'arithmetic',
            op: 'multiply',
            inputs: [translateSource(op.input), { prime: 'constant', value: Number(op.slope) }],
          },
          { prime: 'constant', value: Number(op.intercept) },
        ],
      };
    }

    case 'scalar_multiply': {
      // input × rate. Rate can itself be a nested operation (deal with that recursively).
      const rateNode: PrimeNode = typeof op.rate === 'number'
        ? { prime: 'constant', value: op.rate }
        : translateOperation(op.rate);
      return {
        prime: 'arithmetic',
        op: 'multiply',
        inputs: [translateSource(op.input), rateNode],
      };
    }

    case 'ratio': {
      // Mirror of IntentSource ratio — same zero-guarded division shape.
      return {
        prime: 'conditional',
        condition: {
          prime: 'compare',
          op: 'eq',
          inputs: [translateSource(op.denominator), { prime: 'constant', value: 0 }],
        },
        then: { prime: 'constant', value: 0 },
        else: {
          prime: 'arithmetic',
          op: 'divide',
          inputs: [translateSource(op.numerator), translateSource(op.denominator)],
        },
      };
    }

    case 'aggregate': {
      return translateSource(op.source);
    }

    case 'conditional_gate': {
      // condition: { left: IntentSource, operator, right: IntentSource }
      const cond = op.condition;
      const compareOp = (cond.operator === '=' || cond.operator === '==') ? 'eq'
        : cond.operator === '!=' ? 'neq'
        : cond.operator as 'gt' | 'gte' | 'lt' | 'lte';

      return {
        prime: 'conditional',
        condition: {
          prime: 'compare',
          op: compareOp,
          inputs: [translateSource(cond.left), translateSource(cond.right)],
        },
        then: translateOperation(op.onTrue),
        else: translateOperation(op.onFalse),
      };
    }

    case 'piecewise_linear': {
      // ratio = ratioInput (typically a ratio source)
      // base = baseInput (typically a metric source)
      // segments: [{ min, max, rate }, ...] sorted ascending by min
      // outcome = base × segment.rate where segment matches ratio
      //
      // Engine semantics (pre-HF-238 at intent-executor.ts:572):
      //   inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max)
      // Strict half-open intervals; maxInclusive on the legacy shape is
      // IGNORED by the executor today. Adapter preserves this: tier check
      // uses `lt` (strict less-than) for non-final tiers, no upper bound
      // for the final null-max tier.
      //
      // Nested conditional chain, walking segments tier by tier:
      //   tier N final (max === null):
      //     if ratio >= seg.min then base × rate else 0
      //   tier N non-final:
      //     if ratio < seg.max (and we've already verified ratio >= seg.min
      //     via the previous tier's else branch)
      //       then base × rate
      //       else <next tier>
      //
      // The chain is built bottom-up: start with the final tier (or 0), then
      // wrap each earlier tier as a conditional checking its upper bound.

      const ratioNode = translateSource(op.ratioInput);
      const baseNode = translateSource(op.baseInput);

      // OB-186 fallback: when ratio resolves to 0 AND targetValue exists AND
      // baseValue > 0, ratio = baseValue / targetValue. Adapter wraps the
      // ratio-resolution in this fallback via conditional.
      const effectiveRatio: PrimeNode = op.targetValue && op.targetValue > 0
        ? {
            prime: 'conditional',
            condition: {
              prime: 'logical',
              op: 'and',
              inputs: [
                { prime: 'compare', op: 'eq', inputs: [ratioNode, { prime: 'constant', value: 0 }] },
                { prime: 'compare', op: 'gt', inputs: [baseNode, { prime: 'constant', value: 0 }] },
              ],
            },
            then: {
              prime: 'arithmetic',
              op: 'divide',
              inputs: [baseNode, { prime: 'constant', value: op.targetValue }],
            },
            else: ratioNode,
          }
        : ratioNode;

      const segments = Array.isArray(op.segments) ? op.segments : [];
      // Build the chain from the LAST tier back to the FIRST.
      let chain: PrimeNode = { prime: 'constant', value: 0 };
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        const tierPayout: PrimeNode = {
          prime: 'arithmetic',
          op: 'multiply',
          inputs: [baseNode, { prime: 'constant', value: Number(seg.rate) }],
        };
        if (seg.max === null) {
          // Final tier (or open-ended): ratio >= min → payout, else <next>
          chain = {
            prime: 'conditional',
            condition: {
              prime: 'compare',
              op: 'gte',
              inputs: [effectiveRatio, { prime: 'constant', value: Number(seg.min) }],
            },
            then: tierPayout,
            else: chain,
          };
        } else {
          // Non-final: ratio >= min AND ratio < max → payout, else <next>
          chain = {
            prime: 'conditional',
            condition: {
              prime: 'logical',
              op: 'and',
              inputs: [
                {
                  prime: 'compare',
                  op: 'gte',
                  inputs: [effectiveRatio, { prime: 'constant', value: Number(seg.min) }],
                },
                {
                  prime: 'compare',
                  op: 'lt',
                  inputs: [effectiveRatio, { prime: 'constant', value: Number(seg.max) }],
                },
              ],
            },
            then: tierPayout,
            else: chain,
          };
        }
      }
      return chain;
    }

    case 'bounded_lookup_1d': {
      // input falls into one of N boundaries; output is outputs[idx].
      // Boundaries are half-open per Decision 127: [min, max). Final bounded
      // boundary may carry maxInclusive=true.
      const inputNode = translateSource(op.input);
      const boundaries = Array.isArray(op.boundaries) ? op.boundaries : [];
      const outputs = Array.isArray(op.outputs) ? op.outputs : [];

      // Build chain bottom-up; if no boundary matches, return 0 (consistent
      // with executeBoundedLookup1D's no-match return at line 247).
      let chain: PrimeNode = { prime: 'constant', value: 0 };
      for (let i = boundaries.length - 1; i >= 0; i--) {
        const b = boundaries[i];
        const rawOutput = Number(outputs[i] ?? 0);
        const isLast = i === boundaries.length - 1;

        // Construct min check (if b.min !== null)
        const minCheck: PrimeNode | null = b.min === null ? null : {
          prime: 'compare',
          op: b.minInclusive !== false ? 'gte' : 'gt',
          inputs: [inputNode, { prime: 'constant', value: b.min }],
        };
        // Max check (if b.max !== null)
        let maxCheck: PrimeNode | null = null;
        if (b.max !== null) {
          const useInclusive = isLast && b.maxInclusive === true;
          maxCheck = {
            prime: 'compare',
            op: useInclusive ? 'lte' : 'lt',
            inputs: [inputNode, { prime: 'constant', value: b.max }],
          };
        }

        const conditions: PrimeNode[] = [];
        if (minCheck) conditions.push(minCheck);
        if (maxCheck) conditions.push(maxCheck);
        const cond: PrimeNode = conditions.length === 0
          ? { prime: 'constant', value: 1 } // always matches
          : conditions.length === 1
            ? conditions[0]
            : { prime: 'logical', op: 'and', inputs: conditions };

        // OB-117: isMarginal — output is a rate multiplied by inputValue
        const tierValue: PrimeNode = op.isMarginal
          ? {
              prime: 'arithmetic',
              op: 'multiply',
              inputs: [{ prime: 'constant', value: rawOutput }, inputNode],
            }
          : { prime: 'constant', value: rawOutput };

        chain = {
          prime: 'conditional',
          condition: cond,
          then: tierValue,
          else: chain,
        };
      }
      return chain;
    }

    case 'bounded_lookup_2d': {
      // 2D grid lookup — same shape as 1D but over (row, column) pair.
      // outputGrid[rowIdx][colIdx].
      const rowNode = translateSource(op.inputs.row);
      const colNode = translateSource(op.inputs.column);
      const rb = Array.isArray(op.rowBoundaries) ? op.rowBoundaries : [];
      const cb = Array.isArray(op.columnBoundaries) ? op.columnBoundaries : [];
      const grid = Array.isArray(op.outputGrid) ? op.outputGrid : [];

      const buildBoundaryCheck = (
        node: PrimeNode,
        b: { min: number | null; max: number | null; minInclusive?: boolean; maxInclusive?: boolean },
        isLast: boolean,
      ): PrimeNode => {
        const conditions: PrimeNode[] = [];
        if (b.min !== null) {
          conditions.push({
            prime: 'compare',
            op: b.minInclusive !== false ? 'gte' : 'gt',
            inputs: [node, { prime: 'constant', value: b.min }],
          });
        }
        if (b.max !== null) {
          const useInclusive = isLast && b.maxInclusive === true;
          conditions.push({
            prime: 'compare',
            op: useInclusive ? 'lte' : 'lt',
            inputs: [node, { prime: 'constant', value: b.max }],
          });
        }
        if (conditions.length === 0) return { prime: 'constant', value: 1 };
        if (conditions.length === 1) return conditions[0];
        return { prime: 'logical', op: 'and', inputs: conditions };
      };

      // Nested 2D conditional: walk row boundaries (outer), then column (inner).
      // For each row matching, walk column boundaries; if match, return grid[r][c].
      let outerChain: PrimeNode = { prime: 'constant', value: 0 };
      for (let r = rb.length - 1; r >= 0; r--) {
        const rIsLast = r === rb.length - 1;
        const rowCond = buildBoundaryCheck(rowNode, rb[r], rIsLast);

        let innerChain: PrimeNode = { prime: 'constant', value: 0 };
        for (let c = cb.length - 1; c >= 0; c--) {
          const cIsLast = c === cb.length - 1;
          const colCond = buildBoundaryCheck(colNode, cb[c], cIsLast);
          const cellValue = Number(grid[r]?.[c] ?? 0);
          innerChain = {
            prime: 'conditional',
            condition: colCond,
            then: { prime: 'constant', value: cellValue },
            else: innerChain,
          };
        }

        outerChain = {
          prime: 'conditional',
          condition: rowCond,
          then: innerChain,
          else: outerChain,
        };
      }
      return outerChain;
    }

    // The following operation types appear in the IntentOperation union but
    // are NOT in the Phase 0 production inventory. They are translatable
    // through the same patterns above; included for forward compatibility.

    case 'weighted_blend': {
      // result = Σ (input_i × weight_i)
      const inputs = Array.isArray(op.inputs) ? op.inputs : [];
      if (inputs.length === 0) return { prime: 'constant', value: 0 };
      let sum: PrimeNode = {
        prime: 'arithmetic',
        op: 'multiply',
        inputs: [translateSource(inputs[0].source), { prime: 'constant', value: inputs[0].weight }],
      };
      for (let i = 1; i < inputs.length; i++) {
        sum = {
          prime: 'arithmetic',
          op: 'add',
          inputs: [
            sum,
            {
              prime: 'arithmetic',
              op: 'multiply',
              inputs: [translateSource(inputs[i].source), { prime: 'constant', value: inputs[i].weight }],
            },
          ],
        };
      }
      return sum;
    }

    case 'temporal_window': {
      // The temporal_window primitive depends on period history which is not
      // available in the row-context EvalContext. For the Phase 0 inventory
      // (no production temporal_window usage), this branch throws a clear
      // structured failure rather than emitting an under-translated DAG.
      throw new UntranslatableLegacyIntentError(
        `[legacyIntentToDAG] temporal_window translation requires period-history context ` +
        `(not in Phase 0 production inventory; row-context EvalContext does not carry periodHistory). ` +
        `Emission preserved: ${JSON.stringify(op)}.`
      );
    }

    default: {
      const opName = (op as { operation?: string }).operation ?? '<undefined>';
      throw new UntranslatableLegacyIntentError(
        `[legacyIntentToDAG] Unrecognized IntentOperation discriminator "${opName}". ` +
        `Emission preserved: ${JSON.stringify(op)}.`
      );
    }
  }
}

// ──────────────────────────────────────────────
// Modifier translation
// ──────────────────────────────────────────────
//
// Modifiers wrap the base computation. Apply in declaration order — same as
// the legacy applyModifiers loop at intent-executor.ts:585-623.

function wrapModifier(value: PrimeNode, mod: IntentModifier): PrimeNode {
  switch (mod.modifier) {
    case 'cap': {
      // result = min(value, maxValue)
      return {
        prime: 'conditional',
        condition: {
          prime: 'compare',
          op: 'gt',
          inputs: [value, { prime: 'constant', value: mod.maxValue }],
        },
        then: { prime: 'constant', value: mod.maxValue },
        else: value,
      };
    }
    case 'floor': {
      return {
        prime: 'conditional',
        condition: {
          prime: 'compare',
          op: 'lt',
          inputs: [value, { prime: 'constant', value: mod.minValue }],
        },
        then: { prime: 'constant', value: mod.minValue },
        else: value,
      };
    }
    case 'proration': {
      // result = value × (numerator / denominator), zero-guarded on denominator
      const num = translateSource(mod.numerator);
      const den = translateSource(mod.denominator);
      return {
        prime: 'conditional',
        condition: { prime: 'compare', op: 'eq', inputs: [den, { prime: 'constant', value: 0 }] },
        then: { prime: 'constant', value: 0 },
        else: {
          prime: 'arithmetic',
          op: 'multiply',
          inputs: [value, { prime: 'arithmetic', op: 'divide', inputs: [num, den] }],
        },
      };
    }
    case 'temporal_adjustment': {
      throw new UntranslatableLegacyIntentError(
        `[legacyIntentToDAG] temporal_adjustment modifier requires period-history context ` +
        `(not in Phase 0 production inventory). Emission preserved: ${JSON.stringify(mod)}.`
      );
    }
    default: {
      const modName = (mod as { modifier?: string }).modifier ?? '<undefined>';
      throw new UntranslatableLegacyIntentError(
        `[legacyIntentToDAG] Unrecognized IntentModifier discriminator "${modName}". ` +
        `Emission preserved: ${JSON.stringify(mod)}.`
      );
    }
  }
}

// ──────────────────────────────────────────────
// Public — component intent → PrimeNode DAG
// ──────────────────────────────────────────────

/**
 * Translate a ComponentIntent's legacy `intent` operation + modifiers into
 * a single PrimeNode tree. Variant routing is handled at the caller
 * (executeIntent) since it depends on entity attributes — the variant's
 * matched route's IntentOperation is passed in.
 */
export function legacyIntentToDAG(
  op: IntentOperation,
  modifiers: IntentModifier[] = [],
): PrimeNode {
  let dag = translateOperation(op);
  for (const mod of modifiers) {
    dag = wrapModifier(dag, mod);
  }
  return dag;
}

// ──────────────────────────────────────────────
// Derivation adapter
// ──────────────────────────────────────────────

/**
 * Legacy metric derivation shape (per Phase 0 inventory):
 *   { metric, operation: 'sum'|'count'|..., source_field, filters: [...], source_pattern }
 *
 * Translation: aggregate node, wrapped in filter chain if filters present.
 */
export interface LegacyDerivation {
  metric: string;
  operation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'ratio' | 'delta';
  source_field?: string;
  filters?: PrimePredicate[];
  source_pattern?: string;
  numerator_metric?: string;
  denominator_metric?: string;
  scale_factor?: number;
}

export function legacyDerivationToDAG(d: LegacyDerivation): PrimeNode {
  // Ratio derivation: numerator_metric / denominator_metric × scale_factor
  if (d.operation === 'ratio') {
    const num = d.numerator_metric ?? '';
    const den = d.denominator_metric ?? '';
    const scale = d.scale_factor ?? 1;
    const ratio: PrimeNode = {
      prime: 'conditional',
      condition: {
        prime: 'compare',
        op: 'eq',
        inputs: [{ prime: 'reference', field: den }, { prime: 'constant', value: 0 }],
      },
      then: { prime: 'constant', value: 0 },
      else: {
        prime: 'arithmetic',
        op: 'divide',
        inputs: [{ prime: 'reference', field: num }, { prime: 'reference', field: den }],
      },
    };
    return scale === 1 ? ratio : {
      prime: 'arithmetic',
      op: 'multiply',
      inputs: [ratio, { prime: 'constant', value: scale }],
    };
  }

  // Delta derivation needs prior-period data; not in Phase 0 inventory.
  if (d.operation === 'delta') {
    throw new UntranslatableLegacyIntentError(
      `[legacyDerivationToDAG] delta operation requires prior-period rows in EvalContext ` +
      `(not in Phase 0 production inventory). Emission preserved: ${JSON.stringify(d)}.`
    );
  }

  // Aggregate ops: sum / count / avg / min / max with optional filter chain
  const field = d.source_field ?? '';
  let dag: PrimeNode = {
    prime: 'aggregate',
    op: d.operation,
    field,
  };

  if (Array.isArray(d.filters) && d.filters.length > 0) {
    // Innermost filter sits closest to the aggregate. Reverse so the OUTERMOST
    // filter in the DAG is the FIRST filter in the rule (declaration order
    // preserved as filter-chain order top-down).
    for (let i = d.filters.length - 1; i >= 0; i--) {
      const f = d.filters[i];
      dag = {
        prime: 'filter',
        predicate: { field: f.field, operator: f.operator, value: f.value },
        downstream: dag,
      };
    }
  }

  return dag;
}

// ──────────────────────────────────────────────
// Variant-aware component translation
// ──────────────────────────────────────────────

/**
 * Translate a ComponentIntent into the operative PrimeNode for a given
 * entity. Resolves variant routing using the entity's routing-attribute
 * value (pre-resolved by the caller) before producing the DAG.
 */
export function componentIntentToDAG(
  intent: ComponentIntent,
  routingAttributeValue?: string | number | boolean,
): { dag: PrimeNode; matchedRoute?: { matchValue: string | number | boolean } } {
  // HF-238: prime-DAG format short-circuit. When the persisted intent shape
  // is already a PrimeNode (discriminator key `prime`), skip translation and
  // use it directly. The shape arrives here at runtime because the engine
  // hydrates ComponentIntent loosely from JSON — TypeScript views .intent as
  // an IntentOperation, but a prime-format component carries { prime, ... }
  // instead.
  const maybePrimeIntent = (intent as unknown as { intent?: unknown }).intent;
  if (maybePrimeIntent && isPrimeNode(maybePrimeIntent)) {
    let dag: PrimeNode = maybePrimeIntent;
    for (const mod of intent.modifiers ?? []) {
      dag = wrapModifier(dag, mod);
    }
    return { dag };
  }

  // Variant-routed component
  if (intent.variants) {
    const routing = intent.variants;
    const matched = routing.routes.find(r => String(r.matchValue) === String(routingAttributeValue));
    if (matched) {
      return {
        dag: legacyIntentToDAG(matched.intent, intent.modifiers),
        matchedRoute: { matchValue: matched.matchValue },
      };
    }
    switch (routing.noMatchBehavior) {
      case 'first':
        if (routing.routes.length > 0) {
          return {
            dag: legacyIntentToDAG(routing.routes[0].intent, intent.modifiers),
            matchedRoute: { matchValue: routing.routes[0].matchValue },
          };
        }
        return { dag: { prime: 'constant', value: 0 } };
      case 'skip':
      case 'error':
      default:
        return { dag: { prime: 'constant', value: 0 } };
    }
  }

  if (intent.intent) {
    return { dag: legacyIntentToDAG(intent.intent, intent.modifiers) };
  }

  return { dag: { prime: 'constant', value: 0 } };
}
```

---

## PROBE 2 — THE EVALUATOR

**File:** `web/src/lib/calculation/intent-executor.ts`
**Full file, 416 lines:**

```typescript
/**
 * Intent Executor — Prime-Level DAG Calculation Engine (HF-238).
 *
 * Single recursive `evaluate()` walker over nine irreducible PrimeNode types
 * (see intent-types.ts). All stored intents flow through translation adapters
 * at the storage boundary (legacy-intent-to-dag.ts) and produce PrimeNode
 * trees that evaluate() processes. There is ONE execution path; legacy
 * named-operation formats are not executed directly — they are translated
 * to DAG form and walked.
 *
 * Decision 122 (DS-010): all arithmetic uses decimal.js with Banker's Rounding.
 * Native number is used only for boundary comparison inputs and at the output
 * boundary (evaluate's caller converts Decimal → number).
 */

import type {
  ComponentIntent,
  IntentOperation,
  ExecutionTrace,
  Boundary,
  PrimeNode,
  EvalContext,
} from './intent-types';
import { Decimal, toDecimal, toNumber, ZERO } from './decimal-precision';
import { legacyIntentToDAG, componentIntentToDAG } from './legacy-intent-to-dag';

// ──────────────────────────────────────────────
// EntityData — the executor's view of an entity (preserved interface)
// ──────────────────────────────────────────────

export interface EntityData {
  entityId: string;
  metrics: Record<string, number>;
  attributes: Record<string, string | number | boolean>;
  groupMetrics?: Record<string, number>;
  priorResults?: number[];
  periodHistory?: number[];
  crossDataCounts?: Record<string, number>;
  scopeAggregates?: Record<string, number>;
  // Phase 1: EvalContext.allEntityRows + activeRows not yet wired through
  // route.ts (Phase 3 wiring). Adapters that emit scope/aggregate/filter
  // primes consume these when populated; until Phase 3 they read as empty
  // and the legacy reference path (via pre-computed scopeAggregates /
  // crossDataCounts in context.metrics) supplies the value.
  allEntityRows?: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }>;
  activeRows?: Record<string, unknown>[];
  /** HF-211: optional trace collector for [CalcTrace] emissions. */
  traceCollector?: (line: string) => void;
}

export interface ExecutionResult {
  entityId: string;
  componentIndex: number;
  outcome: number;
  trace: ExecutionTrace;
}

/**
 * OB-196 Phase 3 (E4 round-trip closure / Q-A.5.5): structured failure on
 * unknown discriminator at the evaluator. Preserved for callers; the
 * `evaluate()` walker raises this for unrecognized prime discriminators and
 * legacy-intent-to-dag raises UntranslatableLegacyIntentError for
 * unrecognized legacy shapes.
 */
export class IntentExecutorUnknownOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentExecutorUnknownOperationError';
  }
}

// ──────────────────────────────────────────────
// Boundary index helper — utility retained for trajectory-engine and
// reconciliation callers (the executor itself no longer uses it; piecewise
// and bounded-lookup translations express boundary semantics via nested
// conditional + compare primes).
// ──────────────────────────────────────────────

export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const isLast = i === boundaries.length - 1;
    const minOk = b.min === null
      ? true
      : (b.minInclusive !== false ? value >= b.min : value > b.min);
    let maxOk: boolean;
    if (b.max === null) {
      maxOk = true;
    } else if (isLast && b.maxInclusive === true) {
      maxOk = value <= b.max;
    } else {
      maxOk = value < b.max;
    }
    if (minOk && maxOk) return i;
  }
  return -1;
}

// ──────────────────────────────────────────────
// Predicate matcher — used by `filter` prime
// ──────────────────────────────────────────────

function rowMatchesPredicate(
  row: Record<string, unknown>,
  predicate: { field: string; operator: string; value: string | number | boolean },
): boolean {
  const raw = row[predicate.field];
  switch (predicate.operator) {
    case 'eq':       return raw === predicate.value;
    case 'neq':      return raw !== predicate.value;
    case 'gt':       return typeof raw === 'number' && raw > Number(predicate.value);
    case 'gte':      return typeof raw === 'number' && raw >= Number(predicate.value);
    case 'lt':       return typeof raw === 'number' && raw < Number(predicate.value);
    case 'lte':      return typeof raw === 'number' && raw <= Number(predicate.value);
    case 'contains': return typeof raw === 'string' && String(raw).includes(String(predicate.value));
    default:         return false;
  }
}

// ──────────────────────────────────────────────
// evaluate() — the ONE engine surface
// ──────────────────────────────────────────────

/**
 * Recursively evaluate a PrimeNode tree against an EvalContext, returning
 * a Decimal (Decision 122). Nine cases — one per prime discriminator.
 * Boolean primes (compare, logical) return Decimal(1) for true, Decimal(0)
 * for false; conditional treats Decimal > 0 as truthy.
 */
export function evaluate(node: PrimeNode, context: EvalContext): Decimal {
  switch (node.prime) {
    case 'constant': {
      return toDecimal(node.value);
    }

    case 'reference': {
      const raw = context.metrics[node.field];
      return raw === undefined || raw === null ? ZERO : toDecimal(raw);
    }

    case 'arithmetic': {
      const a = evaluate(node.inputs[0], context);
      const b = evaluate(node.inputs[1], context);
      switch (node.op) {
        case 'add':      return a.plus(b);
        case 'subtract': return a.minus(b);
        case 'multiply': return a.mul(b);
        case 'divide':   return b.isZero() ? ZERO : a.div(b);
      }
      return ZERO;
    }

    case 'compare': {
      const a = evaluate(node.inputs[0], context);
      const b = evaluate(node.inputs[1], context);
      let result: boolean;
      switch (node.op) {
        case 'gt':  result = a.gt(b); break;
        case 'gte': result = a.gte(b); break;
        case 'lt':  result = a.lt(b); break;
        case 'lte': result = a.lte(b); break;
        case 'eq':  result = a.eq(b); break;
        case 'neq': result = !a.eq(b); break;
        default:    result = false;
      }
      return result ? toDecimal(1) : ZERO;
    }

    case 'logical': {
      const inputs = node.inputs.map(n => evaluate(n, context));
      let result: boolean;
      switch (node.op) {
        case 'and': result = inputs.every(d => d.gt(ZERO)); break;
        case 'or':  result = inputs.some(d => d.gt(ZERO)); break;
        case 'not': result = inputs.length > 0 ? inputs[0].isZero() : true; break;
        default:    result = false;
      }
      return result ? toDecimal(1) : ZERO;
    }

    case 'conditional': {
      const cond = evaluate(node.condition, context);
      // Truthy: Decimal > 0. Zero, negative, and null-coerced-to-zero are falsy.
      const isTrue = cond.gt(ZERO);
      return evaluate(isTrue ? node.then : node.else, context);
    }

    case 'filter': {
      const filtered = context.activeRows.filter(r => rowMatchesPredicate(r, node.predicate));
      return evaluate(node.downstream, { ...context, activeRows: filtered });
    }

    case 'scope': {
      // Find the boundary value on the entity, then narrow allEntityRows
      // to PEER entities sharing that boundary value (self-excluded, matching
      // legacy aggregateScopeRows semantics at route.ts:2363 — "Manager does
      // not earn override on own revenue"). The downstream sees the peer
      // rows as activeRows.
      const boundaryValue = context.entity.metadata[node.boundary];
      const selfEntityId = context.entity.metadata.entityId;
      const siblings = context.allEntityRows
        .filter(r =>
          r.entityMetadata[node.boundary] === boundaryValue
          && r.entityMetadata.entityId !== selfEntityId
        )
        .map(r => r.row);
      return evaluate(node.downstream, { ...context, activeRows: siblings });
    }

    case 'aggregate': {
      const rows = context.activeRows;
      if (rows.length === 0) {
        // count of empty rows is 0; sum/avg/min/max of empty rows is 0.
        return ZERO;
      }
      if (node.op === 'count') {
        return toDecimal(rows.length);
      }
      const values = rows.map(r => {
        const v = r[node.field];
        return typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : 0) || 0;
      });
      switch (node.op) {
        case 'sum': {
          let total = ZERO;
          for (const v of values) total = total.plus(toDecimal(v));
          return total;
        }
        case 'avg': {
          let total = ZERO;
          for (const v of values) total = total.plus(toDecimal(v));
          return total.div(toDecimal(values.length));
        }
        case 'min': {
          let m = toDecimal(values[0]);
          for (let i = 1; i < values.length; i++) {
            const d = toDecimal(values[i]);
            if (d.lt(m)) m = d;
          }
          return m;
        }
        case 'max': {
          let m = toDecimal(values[0]);
          for (let i = 1; i < values.length; i++) {
            const d = toDecimal(values[i]);
            if (d.gt(m)) m = d;
          }
          return m;
        }
      }
      return ZERO;
    }

    default: {
      const prime = (node as { prime?: string }).prime ?? '<undefined>';
      throw new IntentExecutorUnknownOperationError(
        `[evaluate] Unrecognized PrimeNode discriminator "${prime}". ` +
        `Node: ${JSON.stringify(node)}.`
      );
    }
  }
}

// ──────────────────────────────────────────────
// EvalContext construction — translates EntityData into the context shape
// evaluate() walks. Pre-populates synthetic reference keys that match the
// adapter's emission shape for legacy source types.
// ──────────────────────────────────────────────

function buildEvalContext(data: EntityData): EvalContext {
  // Start with raw metrics map (entity scope).
  const metrics: Record<string, number> = { ...data.metrics };

  // Group-scope aggregate sources: adapter emits `group:${field}`.
  if (data.groupMetrics) {
    for (const [k, v] of Object.entries(data.groupMetrics)) {
      metrics[`group:${k}`] = v;
    }
  }

  // entity_attribute sources: adapter emits `attr:${attribute}`.
  for (const [attr, raw] of Object.entries(data.attributes)) {
    const numeric = typeof raw === 'number'
      ? raw
      : (typeof raw === 'string' ? parseFloat(raw) || 0 : (raw === true ? 1 : 0));
    metrics[`attr:${attr}`] = numeric;
  }

  // prior_component sources: adapter emits `prior:${idx}`.
  if (data.priorResults) {
    for (let i = 0; i < data.priorResults.length; i++) {
      metrics[`prior:${i}`] = data.priorResults[i] ?? 0;
    }
  }

  // cross_data sources: adapter emits `cross_data:${key}` where key already
  // contains dataType:agg[:field] (matches data.crossDataCounts key shape).
  if (data.crossDataCounts) {
    for (const [k, v] of Object.entries(data.crossDataCounts)) {
      metrics[`cross_data:${k}`] = v;
    }
  }

  // scope_aggregate sources: adapter emits `scope_aggregate:${key}` where
  // key already contains scope:field:aggregation (matches data.scopeAggregates
  // key shape per legacy resolveSource at intent-executor.ts:161).
  if (data.scopeAggregates) {
    for (const [k, v] of Object.entries(data.scopeAggregates)) {
      metrics[`scope_aggregate:${k}`] = v;
    }
  }

  return {
    entity: { metadata: { ...data.attributes, entityId: data.entityId } },
    activeRows: data.activeRows ?? [],
    allEntityRows: data.allEntityRows ?? [],
    metrics,
  };
}

// ──────────────────────────────────────────────
// Main Entry — variant routing, DAG translation, evaluate, Decimal→number
// ──────────────────────────────────────────────

export function executeIntent(
  intent: ComponentIntent,
  entityData: EntityData,
): ExecutionResult {
  const context = buildEvalContext(entityData);

  // Resolve routing attribute value for variant-routed components, so the
  // adapter selects the operative route.
  let routingAttributeValue: string | number | boolean | undefined;
  if (intent.variants) {
    const attrSrc = intent.variants.routingAttribute;
    if (attrSrc.source === 'entity_attribute') {
      routingAttributeValue = entityData.attributes[attrSrc.sourceSpec.attribute] ?? '';
    } else {
      // Resolve as numeric via the same adapter+evaluator path the rest of
      // the engine uses; emit a single-leaf DAG for the routing source.
      const routingDag = legacyIntentToDAG({ operation: 'aggregate', source: attrSrc });
      routingAttributeValue = toNumber(evaluate(routingDag, context));
    }
  }

  const { dag, matchedRoute } = componentIntentToDAG(intent, routingAttributeValue);

  // For trace fidelity, capture the operative IntentOperation discriminator
  // (legacy primitive type) before translation.
  const operativeOp: IntentOperation | undefined = intent.variants
    ? intent.variants.routes.find(r => String(r.matchValue) === String(routingAttributeValue))?.intent
      ?? intent.variants.routes[0]?.intent
    : intent.intent;
  const componentType = operativeOp?.operation ?? 'unknown';

  const outcomeDecimal = evaluate(dag, context);
  const outcomeNumber = toNumber(outcomeDecimal);

  const executionTrace: ExecutionTrace = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    componentType,
    variantRoute: matchedRoute
      ? {
          attribute: intent.variants?.routingAttribute.source === 'entity_attribute'
            ? intent.variants.routingAttribute.sourceSpec.attribute
            : 'resolved',
          value: routingAttributeValue ?? '',
          matched: String(matchedRoute.matchValue),
        }
      : undefined,
    inputs: {},               // Phase 1: granular inputLog is no longer
                              // produced — Phase 3 will reintroduce a
                              // selective trace via evaluate() opt-in hook
                              // when needed for [CalcTrace].
    lookupResolution: undefined,
    modifiers: [],            // Modifiers are now DAG compositions wrapped by
                              // the adapter; their before/after values are
                              // not separately observable post-translation.
    finalOutcome: outcomeNumber,
    confidence: intent.confidence,
  };

  return {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    outcome: outcomeNumber,
    trace: executionTrace,
  };
}

// ──────────────────────────────────────────────
// Backward-compat wrapper for run-calculation.ts:335 fallback path
// ──────────────────────────────────────────────

/**
 * Executes a single IntentOperation directly. Used by the legacy
 * calculationIntent fallback path in run-calculation.ts. Translates the
 * operation to a PrimeNode DAG and evaluates it; signature preserved for
 * backward compatibility (inputLog and trace params are accepted but the
 * new engine no longer emits per-source granular inputs).
 */
export function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>,
): Decimal {
  // inputLog and trace are accepted for signature compatibility; the new
  // engine does not populate them. Touch them to satisfy strict no-unused-vars.
  void inputLog;
  void trace;
  const dag = legacyIntentToDAG(op);
  const context = buildEvalContext(data);
  return evaluate(dag, context);
}
```

---

## PROBE 3 — THE PROMPT

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
**Requested lines 580-720 (verbatim):**

```typescript
      },
      { "prime": "constant", "value": 0.015 }
    ]
  }
}

F) Cap modifier (e.g., "commission capped at $5,000"): wrap the base computation with a conditional that returns the cap when exceeded.
{
  "calculationIntent": {
    "prime": "conditional",
    "condition": { "prime": "compare", "op": "gt",
      "inputs": [
        <BASE_COMPUTATION>,
        { "prime": "constant", "value": 5000 }
      ]
    },
    "then": { "prime": "constant", "value": 5000 },
    "else": <BASE_COMPUTATION>
  }
}

G) Floor modifier ("minimum guarantee $500"): same pattern with "lt" + constant on the then branch:
{
  "prime": "conditional",
  "condition": { "prime": "compare", "op": "lt", "inputs": [<BASE>, { "prime": "constant", "value": 500 }] },
  "then": { "prime": "constant", "value": 500 },
  "else": <BASE>
}

H) Input constraint (e.g., "attainment capped at 150% before applying rate"): wrap the input — not the output — in a conditional that caps it at the upper bound.
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "multiply",
    "inputs": [
      { "prime": "conditional",
        "condition": { "prime": "compare", "op": "lte",
          "inputs": [
            { "prime": "arithmetic", "op": "divide",
              "inputs": [
                { "prime": "reference", "field": "actual_units" },
                { "prime": "reference", "field": "target_units" }
              ]},
            { "prime": "constant", "value": 1.5 }
          ]},
        "then": { "prime": "arithmetic", "op": "divide",
          "inputs": [
            { "prime": "reference", "field": "actual_units" },
            { "prime": "reference", "field": "target_units" }
          ]},
        "else": { "prime": "constant", "value": 1.5 }
      },
      { "prime": "constant", "value": 800 }
    ]
  }
}

DECISION 127 — boundary inclusivity in tier conditionals:
When translating tiered/piecewise plans, express tier-selection ranges as half-open intervals [min, max). For each non-final tier use "compare gte" against min AND "compare lt" against max, joined by "logical and". For the final tier (open-ended ceiling), use "compare gte" against the min only.

DO NOT use .999 / .X99 / decimal-truncation patterns. Express "less than X" as a "compare lt" against X.

CRITICAL: Every component MUST include both "calculationMethod" (existing free-form description) AND "calculationIntent" (the PrimeNode tree). The tree's root must carry a "prime" discriminator from the nine listed above. The engine rejects any node whose discriminator is not one of the nine.

Return your analysis as valid JSON.`,

  workbook_analysis: `You are an expert at analyzing compensation data workbooks for a Sales Performance Management (SPM) platform. Your task is to analyze ALL sheets in a workbook together to understand how they relate and feed into compensation calculations.

SHEET CLASSIFICATION TYPES:
1. "roster" - Employee roster with employee IDs, names, positions, store assignments
2. "component_data" - Feeds a specific plan component (sales data, performance metrics, etc.)
3. "reference" - Lookup/reference data (product lists, rate tables, etc.)
4. "regional_partition" - Same structure as another sheet but for a different region/store/territory
5. "period_summary" - Aggregated period-level data
6. "unrelated" - Does not appear related to compensation calculations

RELATIONSHIP DETECTION:
- Look for shared column names across sheets (e.g., entity_id, store_id, period)
- Column names may be in any language — use multilingual understanding to detect relationships
- Detect primary keys and foreign key relationships
- Identify if one sheet references another

FIELD MAPPING (CRITICAL — for each column, suggest a target field type):

EXPANDED TARGET FIELD TYPES (22 types — OB-110):
Identity:
- entity_id: Unique identifier for a person/entity (numeric or alphanumeric code)
- entity_name: Human-readable name like "Carlos Garcia" — NOT a role/position
- store_id: Store/branch/location identifier code
- store_name: Human-readable store/location name
- transaction_id: Transaction/order/event identifier
- reference_id: Cross-reference to another system

Temporal:
- date: Date value (transaction, snapshot, hire, effective)
- period: Time period label (month name, quarter, period code)

Financial:
- amount: Monetary value (revenue, sales, payout, balance, goal/target)
- currency_code: ISO currency code (USD, MXN, EUR) — short TEXT strings, NOT numbers
- rate: Rate, percentage, ratio (commission rate, tip rate)

Metrics:
- count_growth: Items ADDED/opened/gained/acquired (new accounts, new customers)
- count_reduction: Items REMOVED/closed/lost/churned (closed accounts, cancellations)
- quantity: Generic count (neutral direction — items, headcount, visits)
- achievement_pct: Attainment % of goal (0-200% or 0-2.0 decimal)
- score: Performance score, quality rating, index value

Classification:
- role: Job title, position, function ("Manager", "mesero", "Optometrista")
- product_code: SKU, product ID, catalog number
- product_name: Product or service name
- category: Grouping label (department, segment, tier)
- status: Status indicator (active, inactive, pending)
- boolean_flag: Boolean (0/1, true/false, yes/no, si/no)
```

**Additional context — `anthropic-adapter.ts` lines 418-579 (the START of the rewritten prompt section that the audit window 580-720 cuts into mid-flow). Captured for completeness so the architect sees the full rewritten prompt:**

```typescript
=== CALCULATION INTENT (PRIME-DAG COMPOSITION) ===

FOR EACH COMPONENT, produce a "calculationIntent" field as a recursive PrimeNode tree composed of nine irreducible building blocks. The execution engine walks this tree directly. Do NOT emit named operation types (scalar_multiply, conditional_gate, piecewise_linear, etc.) — compose them from primes instead.

NINE PRIMES (the only operations the engine recognizes):

1. constant     — { "prime": "constant", "value": <number> }
2. reference    — { "prime": "reference", "field": "<metric_name>" }
                  Reads a numeric value from the entity's resolved metrics map.
                  Synthetic-key references for non-metric sources:
                    "attr:<attribute>"               → entity attribute (numeric/coerced)
                    "prior:<componentIndex>"         → output of an earlier component
                    "cross_data:<dataType>:<agg>[:<field>]" → cross-plan data count/sum
                    "group:<metric>"                 → group-scope aggregate
                    "scope_aggregate:<scope>:<field>:<agg>" → hierarchical aggregate
3. arithmetic   — { "prime": "arithmetic", "op": "add"|"subtract"|"multiply"|"divide", "inputs": [A, B] }
                  divide returns 0 when B is 0.
4. compare      — { "prime": "compare", "op": "gt"|"gte"|"lt"|"lte"|"eq"|"neq", "inputs": [A, B] }
                  Returns 1 (true) or 0 (false).
5. logical      — { "prime": "logical", "op": "and"|"or"|"not", "inputs": [A, B, ...] }
                  Returns 1 (true) or 0 (false). Truthy = value > 0.
6. conditional  — { "prime": "conditional", "condition": <node>, "then": <node>, "else": <node> }
                  Branches on condition truthy (> 0).
7. filter       — { "prime": "filter", "predicate": {"field":"<col>","operator":"<op>","value":<v>}, "downstream": <node> }
                  Narrows activeRows for the subtree. Operators: eq, neq, gt, gte, lt, lte, contains.
8. scope        — { "prime": "scope", "boundary": "<attribute>", "downstream": <node> }
                  Narrows activeRows to entity siblings sharing the same boundary attribute value.
9. aggregate    — { "prime": "aggregate", "op": "sum"|"count"|"avg"|"min"|"max", "field": "<row_field>" }
                  Reduces activeRows to a single number.

COMPOSITION GUIDE — every legacy pattern composes from these primes:

A) Simple rate × metric (e.g., "4% of warranty sales"):
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "multiply",
    "inputs": [
      { "prime": "reference", "field": "warranty_sales" },
      { "prime": "constant",  "value": 0.04 }
    ]
  }
}

B) Linear function (rate × metric + intercept, e.g., "6% of revenue plus $200"):
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "add",
    "inputs": [
      { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "period_equipment_revenue" },
          { "prime": "constant",  "value": 0.06 }
        ]},
      { "prime": "constant", "value": 200 }
    ]
  }
}

C) Conditional gate (e.g., "5% if attainment >= 100%, else 3% if >= 85%, else 0"):
{
  "calculationIntent": {
    "prime": "conditional",
    "condition": { "prime": "compare", "op": "gte",
      "inputs": [
        { "prime": "reference", "field": "store_goal_attainment" },
        { "prime": "constant",  "value": 100 }
      ]
    },
    "then": { "prime": "arithmetic", "op": "multiply",
      "inputs": [
        { "prime": "reference", "field": "insurance_sales" },
        { "prime": "constant",  "value": 0.05 }
      ]
    },
    "else": {
      "prime": "conditional",
      "condition": { "prime": "compare", "op": "gte",
        "inputs": [
          { "prime": "reference", "field": "store_goal_attainment" },
          { "prime": "constant",  "value": 85 }
        ]
      },
      "then": { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "insurance_sales" },
          { "prime": "constant",  "value": 0.03 }
        ]
      },
      "else": { "prime": "constant", "value": 0 }
    }
  }
}

D) Piecewise rate × base (e.g., "3% if attainment < 100%, 5% if 100%-120%, 8% if >= 120%, applied to consumable_revenue"):
Express tier selection as nested conditional + logical(and) + compare. The selected tier's rate multiplies the base.
{
  "calculationIntent": {
    "prime": "conditional",
    "condition": { "prime": "compare", "op": "gte",
      "inputs": [
        { "prime": "arithmetic", "op": "divide",
          "inputs": [
            { "prime": "reference", "field": "consumable_revenue" },
            { "prime": "reference", "field": "monthly_quota" }
          ]},
        { "prime": "constant", "value": 1.2 }
      ]
    },
    "then": { "prime": "arithmetic", "op": "multiply",
      "inputs": [
        { "prime": "reference", "field": "consumable_revenue" },
        { "prime": "constant",  "value": 0.08 }
      ]
    },
    "else": {
      "prime": "conditional",
      "condition": { "prime": "logical", "op": "and",
        "inputs": [
          { "prime": "compare", "op": "gte",
            "inputs": [
              { "prime": "arithmetic", "op": "divide",
                "inputs": [
                  { "prime": "reference", "field": "consumable_revenue" },
                  { "prime": "reference", "field": "monthly_quota" }
                ]},
              { "prime": "constant", "value": 1.0 }
            ]},
          { "prime": "compare", "op": "lt",
            "inputs": [
              { "prime": "arithmetic", "op": "divide",
                "inputs": [
                  { "prime": "reference", "field": "consumable_revenue" },
                  { "prime": "reference", "field": "monthly_quota" }
                ]},
              { "prime": "constant", "value": 1.2 }
            ]}
        ]
      },
      "then": { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "consumable_revenue" },
          { "prime": "constant",  "value": 0.05 }
        ]
      },
      "else": { "prime": "arithmetic", "op": "multiply",
        "inputs": [
          { "prime": "reference", "field": "consumable_revenue" },
          { "prime": "constant",  "value": 0.03 }
        ]
      }
    }
  }
}

E) Manager / regional override (sum a metric across siblings in the same hierarchy, then multiply by a rate):
The "boundary" string names the entity attribute the engine uses to identify peers — typically "district" or "region".
{
  "calculationIntent": {
    "prime": "arithmetic", "op": "multiply",
    "inputs": [
      { "prime": "scope", "boundary": "district",
        "downstream": { "prime": "aggregate", "op": "sum", "field": "equipment_revenue" }
```

---

## PROBE 4 — THE CALL SITES

### 4A — executeOperation wrapper and call sites

**File:** `web/src/lib/calculation/intent-executor.ts`
**Function (lines 396-416):**

```typescript
/**
 * Executes a single IntentOperation directly. Used by the legacy
 * calculationIntent fallback path in run-calculation.ts. Translates the
 * operation to a PrimeNode DAG and evaluates it; signature preserved for
 * backward compatibility (inputLog and trace params are accepted but the
 * new engine no longer emits per-source granular inputs).
 */
export function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>,
): Decimal {
  // inputLog and trace are accepted for signature compatibility; the new
  // engine does not populate them. Touch them to satisfy strict no-unused-vars.
  void inputLog;
  void trace;
  const dag = legacyIntentToDAG(op);
  const context = buildEvalContext(data);
  return evaluate(dag, context);
}
```

**Command:** `grep -rn "executeOperation" web/src/lib/ web/src/app/ --include="*.ts" --include="*.tsx"`
**Full output:**

```
src/lib/calculation/intent-executor.ts:403:export function executeOperation(
src/lib/calculation/run-calculation.ts:22:import { executeOperation, evaluate, type EntityData } from '@/lib/calculation/intent-executor';
src/lib/calculation/run-calculation.ts:343:        const intentPayoutDecimal = executeOperation(intentOp, entityData, inputLog, {});
src/lib/calculation/primitive-registry.ts:37: * `intent-types.ts` and a dispatch case in `intent-executor.ts:executeOperation`.
src/lib/calculation/primitive-registry.ts:85:   * (handled by `executeOperation` in `intent-executor.ts`) or only a
```

### 4B — isIntentOperation gate

**File:** `web/src/lib/calculation/run-calculation.ts`
**Lines 320-370 (verbatim):**

```typescript
      }

      // OB-120: Auto-detect isMarginal for bounded_lookup_1d with rate-like outputs.
      // Mirrors OB-117 rate heuristic in evaluateTierLookup: if all non-zero outputs
      // are < 1.0, they represent rates to multiply against the input value.
      if (intentOp.operation === 'bounded_lookup_1d') {
        const bl = intentOp as unknown as Record<string, unknown>;
        const outputs = bl.outputs as number[] | undefined;
        if (!bl.isMarginal && Array.isArray(outputs)) {
          const nonZero = outputs.filter(v => v !== 0);
          if (nonZero.length > 0 && nonZero.every(v => v > 0 && v < 1.0)) {
            bl.isMarginal = true;
          }
        }
      }

      if (isIntentOperation(intentOp)) {
        const entityData: EntityData = {
          entityId: '',
          metrics,
          attributes: {},
        };
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const intentPayoutDecimal = executeOperation(intentOp, entityData, inputLog, {});
        const intentPayout = toNumber(intentPayoutDecimal);
        if (intentPayout > 0) {
          payout = intentPayout;
          details = {
            ...details,
            fallbackSource: 'calculationIntent',
            intentOperation: intentOp.operation,
            intentPayout,
            intentInputs: inputLog,
          };
        }
      }
    } catch {
      // Fallback failed silently — use original $0 payout
    }
  }

  return {
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    payout,
    metricValues: metrics,
    details,
  };
}

```

### 4C — evaluate() call sites

**Command:** `grep -rn "evaluate(" web/src/lib/calculation/ web/src/app/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."`
**Full output:**

```
src/lib/calculation/run-calculation.ts:203:      const result = evaluate(dag, context);
src/lib/calculation/intent-executor.ts:4: * Single recursive `evaluate()` walker over nine irreducible PrimeNode types
src/lib/calculation/intent-executor.ts:7: * trees that evaluate() processes. There is ONE execution path; legacy
src/lib/calculation/intent-executor.ts:61: * `evaluate()` walker raises this for unrecognized prime discriminators and
src/lib/calculation/intent-executor.ts:121:// evaluate() — the ONE engine surface
src/lib/calculation/intent-executor.ts:130:export function evaluate(node: PrimeNode, context: EvalContext): Decimal {
src/lib/calculation/intent-executor.ts:142:      const a = evaluate(node.inputs[0], context);
src/lib/calculation/intent-executor.ts:143:      const b = evaluate(node.inputs[1], context);
src/lib/calculation/intent-executor.ts:154:      const a = evaluate(node.inputs[0], context);
src/lib/calculation/intent-executor.ts:155:      const b = evaluate(node.inputs[1], context);
src/lib/calculation/intent-executor.ts:170:      const inputs = node.inputs.map(n => evaluate(n, context));
src/lib/calculation/intent-executor.ts:182:      const cond = evaluate(node.condition, context);
src/lib/calculation/intent-executor.ts:185:      return evaluate(isTrue ? node.then : node.else, context);
src/lib/calculation/intent-executor.ts:190:      return evaluate(node.downstream, { ...context, activeRows: filtered });
src/lib/calculation/intent-executor.ts:207:      return evaluate(node.downstream, { ...context, activeRows: siblings });
src/lib/calculation/intent-executor.ts:266:// evaluate() walks. Pre-populates synthetic reference keys that match the
src/lib/calculation/intent-executor.ts:342:      routingAttributeValue = toNumber(evaluate(routingDag, context));
src/lib/calculation/intent-executor.ts:356:  const outcomeDecimal = evaluate(dag, context);
src/lib/calculation/intent-executor.ts:374:                              // selective trace via evaluate() opt-in hook
src/lib/calculation/intent-executor.ts:415:  return evaluate(dag, context);
src/lib/calculation/legacy-intent-to-dag.ts:4:// produces PrimeNode trees that the evaluate() walker in intent-executor.ts
src/lib/calculation/intent-types.ts:330:// irreducible operations + two leaf node types. The recursive `evaluate()`
src/lib/calculation/intent-types.ts:334:// PrimeNode trees that evaluate() processes.
src/lib/calculation/intent-types.ts:341:// referenced by the evaluate() walker.
src/lib/calculation/intent-types.ts:373:/** The execution context evaluate() carries down the tree. */
src/lib/calculation/primitive-registry.ts:61:  // components straight through evaluate() without going through</textt>
```

External (non-comment, non-recursive) `evaluate(` call sites:
- `intent-executor.ts:342` (variant routing leaf DAG)
- `intent-executor.ts:356` (main executeIntent body)
- `intent-executor.ts:415` (executeOperation back-compat wrapper)
- `run-calculation.ts:203` (applyMetricDerivations DAG path)

All remaining matches in `intent-executor.ts` (142, 143, 154, 155, 170, 182, 185, 190, 207) are recursive self-calls inside `evaluate()`'s switch arms.

---

## PROBE 5 — THE DERIVATION PATH

### 5A — applyMetricDerivations

**File:** `web/src/lib/calculation/run-calculation.ts`
**Function (lines 119-212, verbatim, full body):**

```typescript

export function applyMetricDerivations(
  entitySheetData: Map<string, Array<{ row_data: Json }>>,
  derivations: MetricDerivationRule[],
  priorPeriodData?: Map<string, Array<{ row_data: Json }>>
): Record<string, number> {
  const derived: Record<string, number> = {};

  // Flatten all rows into a single array, unwrapping row_data for the DAG
  // evaluator's activeRows view.
  const allRows: Record<string, unknown>[] = [];
  for (const [, rows] of Array.from(entitySheetData.entries())) {
    for (const r of rows) {
      const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
        ? r.row_data as Record<string, unknown>
        : {};
      allRows.push(rd);
    }
  }

  for (const rule of derivations) {
    // HF-238: delta operation requires prior-period rows, which are not
    // carried in the standard EvalContext. Route delta through the legacy
    // sum-and-subtract path; all other operations flow through the DAG
    // evaluator via legacyDerivationToDAG().
    if (rule.operation === 'delta' && rule.source_field) {
      let currentTotal = 0;
      for (const rd of allRows) {
        if (!rowMatchesFilters(rd, rule.filters)) continue;
        const val = rd[rule.source_field];
        if (typeof val === 'number') currentTotal += val;
      }
      let priorTotal = 0;
      if (priorPeriodData) {
        for (const [, rows] of Array.from(priorPeriodData.entries())) {
          for (const row of rows) {
            const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
              ? row.row_data as Record<string, unknown>
              : {};
            if (!rowMatchesFilters(rd, rule.filters)) continue;
            const val = rd[rule.source_field];
            if (typeof val === 'number') priorTotal += val;
          }
        }
      }
      derived[rule.metric] = currentTotal - priorTotal;
      if (!priorPeriodData) {
        console.log(`[Derivation] delta: no prior period data for "${rule.metric}" — using current value only`);
      }
      continue;
    }

    // Build the LegacyDerivation shape from the rule and translate to DAG.
    const legacyShape: LegacyDerivation = {
      metric: rule.metric,
      operation: rule.operation,
      source_field: rule.source_field,
      filters: rule.filters as PrimePredicate[] | undefined,
      source_pattern: rule.source_pattern,
      numerator_metric: rule.numerator_metric,
      denominator_metric: rule.denominator_metric,
      scale_factor: rule.scale_factor,
    };

    let dag;
    try {
      dag = legacyDerivationToDAG(legacyShape);
    } catch (err) {
      console.warn(`[Derivation] legacyDerivationToDAG failed for "${rule.metric}": ${(err as Error).message}`);
      derived[rule.metric] = 0;
      continue;
    }

    // Context: activeRows are the current period's flattened rows; metrics
    // map carries previously-derived values so ratio derivations can read
    // their numerator / denominator references.
    const context: EvalContext = {
      entity: { metadata: {} },
      activeRows: allRows,
      allEntityRows: [],
      metrics: { ...derived },
    };

    try {
      const result = evaluate(dag, context);
      derived[rule.metric] = toNumber(result);
    } catch (err) {
      console.warn(`[Derivation] evaluate failed for "${rule.metric}": ${(err as Error).message}`);
      derived[rule.metric] = 0;
    }
  }

  return derived;
}
```

### 5B — legacyDerivationToDAG

See Probe 1, `legacy-intent-to-dag.ts` lines 636-694 (the `legacyDerivationToDAG` export). The function returns a `PrimeNode` — either a `conditional`-wrapped `divide` (ratio), a structured-failure throw (delta), or an `aggregate` node optionally wrapped in a chain of `filter` primes.

---

## PROBE 6 — THE SCOPE PATH

### 6A — Scope pre-computation deletion grep

**Command:** `grep -rn "aggregateScopeRows\|entityScopeAgg\|scopeAggregates\|scopePreCompute" web/src/ --include="*.ts" --include="*.tsx"`
**Full output:**

```
src/app/api/calculation/run/route.ts:499:  // HF-157: Added metadata for HF-155 scopeAggregates (district/region resolution)
src/app/api/calculation/run/route.ts:1673:  // pre-computed per-entity via aggregateScopeRows (deleted below).
src/app/api/calculation/run/route.ts:2363:    // HF-238 Phase 3: aggregateScopeRows pre-computation deleted. The scope+
src/app/api/calculation/run/route.ts:2410:        // scopeAggregates surface; the scope prime walks these rows directly.
src/lib/calculation/intent-executor.ts:39:  scopeAggregates?: Record<string, number>;
src/lib/calculation/intent-executor.ts:43:  // and the legacy reference path (via pre-computed scopeAggregates /
src/lib/calculation/intent-executor.ts:196:      // legacy aggregateScopeRows semantics at route.ts:2363 — "Manager does
src/lib/calculation/intent-executor.ts:305:  // key already contains scope:field:aggregation (matches data.scopeAggregates
src/lib/calculation/intent-executor.ts:307:  if (data.scopeAggregates) {
src/lib/calculation/intent-executor.ts:308:    for (const [k, v] of Object.entries(data.scopeAggregates)) {
src/lib/calculation/legacy-intent-to-dag.ts:134:      // self-exclusion per legacy aggregateScopeRows semantics); the
```

Comment / docstring hits: 7. Live-code hits: 4 (all in `intent-executor.ts`):
- Line 39: `scopeAggregates?: Record<string, number>;` — optional field on `EntityData` interface.
- Lines 305-310: `buildEvalContext` reads `data.scopeAggregates` and pre-populates `metrics[\`scope_aggregate:${k}\`]`.

### 6B — allEntityRowsForPeriod construction

**File:** `web/src/app/api/calculation/run/route.ts`
**Lines 1654-1708 (verbatim, 20 lines context above + construction site + 20 lines below):**

```typescript
  // ═══════════════════════════════════════════════════════════════
  // HF-212 TIER 1 HEADER: emits BEFORE entity loop
  // ═══════════════════════════════════════════════════════════════
  addLog(`[CalcRecon-T1] ╔═══════════════════════════════════════════════════════════════╗`);
  addLog(`[CalcRecon-T1] ║              CALC RECONCILIATION HEADER                       ║`);
  addLog(`[CalcRecon-T1] ╚═══════════════════════════════════════════════════════════════╝`);
  addLog(`[CalcRecon-T1] tenant=${tenantName ?? 'n/a'}`);
  addLog(`[CalcRecon-T1] period=${period?.canonical_key ?? 'n/a'}`);
  addLog(`[CalcRecon-T1] ruleSet="${ruleSet?.name ?? 'n/a'}"`);
  addLog(`[CalcRecon-T1] batchId=${batch.id} run=${calculationRunId ?? 'n/a'}`);
  addLog(`[CalcRecon-T1] entitiesAssigned=${calculationEntityIds.length} components=${defaultComponents.length}`);
  const t1ComponentNames = defaultComponents.map((c, i) => `c${i}:${c.name ?? 'unnamed'}`).join(' | ');
  addLog(`[CalcRecon-T1] componentList=[${t1ComponentNames}]`);
  addLog(`[CalcRecon-T1] verbosityMode=${CALC_TRACE_VERBOSE ? 'FORENSIC (Tier 4 enabled)' : 'DEFAULT (Tier 1-3 only)'}`);
  addLog(`[CalcRecon-T1] ─── Loop starts; Tier 2 lines emit per entity, Tier 3 emit on exceptions ───`);

  // HF-238 Phase 3: build allEntityRows once per period for the scope+aggregate
  // prime composition. The structural scope prime narrows allEntityRows to
  // peer entities sharing the boundary attribute value; previously this was
  // pre-computed per-entity via aggregateScopeRows (deleted below).
  const allEntityRowsForPeriod: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }> = [];
  for (const [eid, sheetMap] of Array.from(dataByEntity.entries())) {
    const meta = (entityMap.get(eid)?.metadata || {}) as Record<string, unknown>;
    const metaWithId: Record<string, unknown> = { ...meta, entityId: eid };
    for (const [, rows] of Array.from(sheetMap.entries())) {
      for (const r of rows) {
        const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
          ? r.row_data as Record<string, unknown>
          : {};
        allEntityRowsForPeriod.push({ entityMetadata: metaWithId, row: rd });
      }
    }
  }

  for (const entityId of calculationEntityIds) {
    const entityInfo = entityMap.get(entityId);
    const entityRowsFlat = flatDataByEntity.get(entityId) || [];

    // HF-212: Per-entity component breakdown. Cleared per iteration.
    // Populated at component_complete site (per-component); consumed at Tier 2 emission.
    const perEntityComponentBreakdown: Map<number, number> = new Map();
    // HF-212: Reset handler-scope flags collector for this entity (closures see the same binding).
    currentEntityFlags = [];

    // Find this entity's store ID and role (use FIRST occurrence, not sum)
    const allEntityMetrics = aggregateMetrics(entityRowsFlat);
    let entityStoreId: string | number | undefined;
    for (const row of entityRowsFlat) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      if (entityStoreId === undefined) {
        const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
        if (sid !== undefined && sid !== null) {
          entityStoreId = sid as string | number;
        }
      }
```

---

## PROBE 7 — THE TYPE SYSTEM

**File:** `web/src/lib/calculation/intent-types.ts`
**Lines 325-403 (verbatim — HF-238 section: PrimeNode, EvalContext, VALID_PRIMES, isPrimeNode):**

```typescript
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
 *   • `filter` and `scope` carry `downstream: PrimeNode` — they modify
 *     context for the sub-tree below them.
 *   • `aggregate` operates on whatever `activeRows` are in context
 *     (narrowed by upstream filter/scope).
 *   • `arithmetic`, `compare`, `logical` operate on values via `inputs`.
 *   • `conditional` evaluates `condition`, then evaluates `then` or `else`.
 *   • `constant` and `reference` are leaves.
 */
export type PrimeNode =
  | { prime: 'arithmetic'; op: 'add' | 'subtract' | 'multiply' | 'divide'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'aggregate'; op: 'sum' | 'count' | 'avg' | 'min' | 'max'; field: string }
  | { prime: 'filter'; predicate: PrimePredicate; downstream: PrimeNode }
  | { prime: 'conditional'; condition: PrimeNode; then: PrimeNode; else: PrimeNode }
  | { prime: 'scope'; boundary: string; downstream: PrimeNode }
  | { prime: 'compare'; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'logical'; op: 'and' | 'or' | 'not'; inputs: PrimeNode[] }
  | { prime: 'constant'; value: number }
  | { prime: 'reference'; field: string };

/** The execution context evaluate() carries down the tree. */
export interface EvalContext {
  /** Entity being evaluated — read by `scope` prime to look up the boundary value. */
  entity: { metadata: Record<string, unknown> };
  /** Data rows currently in scope. Narrowed by upstream `filter` / `scope` primes. */
  activeRows: Record<string, unknown>[];
  /** All entity rows across the tenant — read by `scope` prime to find siblings. */
  allEntityRows: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }>;
  /** Resolved metrics map — read by `reference` prime; populated by upstream derivations. */
  metrics: Record<string, number>;
}

/** The nine recognized prime discriminators. */
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
]);

/** Type guard — narrows unknown into PrimeNode. */
export function isPrimeNode(value: unknown): value is PrimeNode {
  return typeof value === 'object' && value !== null && 'prime' in value
    && typeof (value as Record<string, unknown>).prime === 'string'
    && VALID_PRIMES.has((value as { prime: string }).prime as PrimeNode['prime']);
}
```

**Legacy operation interface definitions remain in `intent-types.ts` lines 73-198** (BoundedLookup1D, BoundedLookup2D, ScalarMultiply, ConditionalGate, AggregateOp, RatioOp, ConstantOp, WeightedBlendOp, TemporalWindowOp, LinearFunctionOp, PiecewiseLinearOp — the IntentOperation union). The HF-238 commentary at lines 336-341 states these are "retained ABOVE this section as read-only legacy formats consumed by legacyIntentToDAG()."

**Command:** `grep -rn "LinearFunctionOp\|PiecewiseLinearOp\|ConditionalGate\b\|ScalarMultiply\b\|BoundedLookup1D\|BoundedLookup2D\|AggregateOp\|RatioOp\|ConstantOp\|WeightedBlendOp\|TemporalWindowOp" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "legacy-intent-to-dag\|intent-types.ts"`
**Full output:**

```
src/lib/intelligence/trajectory-engine.ts:98:function projectBoundedLookup1D(
src/lib/intelligence/trajectory-engine.ts:146:function projectBoundedLookup2D(
src/lib/intelligence/trajectory-engine.ts:253:      trajectory = projectBoundedLookup1D(result.name, intent, att, result.value);
src/lib/intelligence/trajectory-engine.ts:255:      trajectory = projectBoundedLookup2D(result.name, intent, att, result.value);
src/lib/calculation/intent-validator.ts:81:      validateBoundedLookup1D(obj, errors, warnings);
src/lib/calculation/intent-validator.ts:84:      validateBoundedLookup2D(obj, errors, warnings);
src/lib/calculation/intent-validator.ts:87:      validateScalarMultiply(obj, errors, warnings);
src/lib/calculation/intent-validator.ts:90:      validateConditionalGate(obj, errors, warnings);
src/lib/calculation/intent-validator.ts:260:function validateBoundedLookup1D(obj: Record<string, unknown>, errors: string[], warnings: string[]): void {
src/lib/calculation/intent-validator.ts:293:function validateBoundedLookup2D(obj: Record<string, unknown>, errors: string[], warnings: string[]): void {
src/lib/calculation/intent-validator.ts:343:function validateScalarMultiply(obj: Record<string, unknown>, errors: string[], warnings: string[]): void {
src/lib/calculation/intent-validator.ts:358:function validateConditionalGate(obj: Record<string, unknown>, errors: string[], warnings: string[]): void {
```

Two files outside `intent-types.ts` and `legacy-intent-to-dag.ts` reference the legacy operation names: `trajectory-engine.ts` (forecasting / projection consumer) and `intent-validator.ts` (validation surface). The grep does not detect references to the LLM prompt, the evaluator, or other consumers.

---

## PROBE 8 — PRIMITIVE REGISTRY

**File:** `web/src/lib/calculation/primitive-registry.ts`
**Full `FOUNDATIONAL_PRIMITIVES` array and `REGISTRY` object (lines 45-241):**

```typescript
export const FOUNDATIONAL_PRIMITIVES = [
  'bounded_lookup_1d',
  'bounded_lookup_2d',
  'scalar_multiply',
  'conditional_gate',
  'aggregate',
  'ratio',
  'constant',
  'weighted_blend',
  'temporal_window',
  'linear_function',
  'piecewise_linear',
  'scope_aggregate',
  // HF-238: prime-DAG composition format. A `prime_dag` component carries a
  // recursive PrimeNode tree (intent-types.ts) under metadata.intent rather
  // than one of the legacy operation shapes. The engine routes prime_dag
  // components straight through evaluate() without going through
  // legacyIntentToDAG.
  'prime_dag',
] as const;

/** Type-level union derived from the registry array. */
export type FoundationalPrimitive = (typeof FOUNDATIONAL_PRIMITIVES)[number];

// ──────────────────────────────────────────────
// Registry entry shape
// ──────────────────────────────────────────────

/**
 * Structural metadata for a registered primitive. The shape interfaces
 * (BoundedLookup1D, BoundedLookup2D, etc.) in `intent-types.ts` carry the
 * full TypeScript shape; this entry carries human-readable metadata for
 * documentation / discovery / validation paths that don't have a typed
 * shape interface (e.g., prompt builders, error messages, telemetry).
 */
export interface PrimitiveEntry {
  /** Canonical identifier — must be a member of FoundationalPrimitive. */
  readonly id: FoundationalPrimitive;
  /**
   * Whether this primitive is a top-level executable operation
   * (handled by `executeOperation` in `intent-executor.ts`) or only a
   * source / sub-component (used inside `IntentSource.source` or as an
   * input spec). `scope_aggregate` is recognized at the source level
   * only in the current substrate.
   */
  readonly kind: 'operation' | 'source_only';
  /** One-line description for prompt builders and error messages. */
  readonly description: string;
  /**
   * Allowed top-level keys an emission of this primitive may carry on
   * its `metadata.intent` payload (or in the IntentOperation shape).
   * Used by validation paths to detect extra / missing keys.
   */
  readonly allowedKeys: readonly string[];
  /**
   * HF-195: optional STRUCTURAL worked example for prompt construction.
   *
   * Content discipline (Korean Test, AP-25): describe value-distribution
   * shapes, data-type signatures, input/output cardinality. Do NOT use
   * domain-named keywords (e.g., 'commission', 'sales', 'tier'). The
   * build-time gate scans for forbidden literal patterns; populated
   * fields that violate the discipline fail the gate at HF-195 Phase 4.
   *
   * Empty/absent for primitives that don't need disambiguation examples.
   * The plan-interpretation prompt builder iterates registry entries and
   * emits a structural-examples block at construction time — entries
   * without this field are silently skipped, leaving an empty section
   * placeholder slot per the option_b_plus_c PREPARE-path hook
   * (IRA-HF-195 Inv-2 rank 1; Inv-3 rank 1 = sub_option_b_beta).
   */
  readonly promptStructuralExample?: string;
}

// ──────────────────────────────────────────────
// Registry contents — frozen at module load
// ──────────────────────────────────────────────

const REGISTRY: readonly PrimitiveEntry[] = Object.freeze([
  {
    id: 'bounded_lookup_1d',
    kind: 'operation',
    description: '1D threshold table — maps a single input value to an output via boundary array.',
    allowedKeys: ['operation', 'input', 'boundaries', 'outputs', 'noMatchBehavior', 'isMarginal'],
    promptStructuralExample:
      'Single numeric input mapped to numeric output via boundary array. Shape: ' +
      'input value falls into one of N non-overlapping range bands; output is the value ' +
      'associated with the matching band. Example signature: input∈ℝ, ' +
      'boundaries∈[(min,max,minInclusive,maxInclusive)]ⁿ, outputs∈ℝⁿ. Selection is a ' +
      'range-membership test on a single dimension.',
  },
  {
    id: 'bounded_lookup_2d',
    kind: 'operation',
    description: '2D grid lookup — maps two input values (row, column) to a grid output.',
    allowedKeys: ['operation', 'inputs', 'rowBoundaries', 'columnBoundaries', 'outputGrid', 'noMatchBehavior'],
    promptStructuralExample:
      'Two numeric inputs mapped to numeric output via row × column grid. Shape: ' +
      'input₁ falls into row band, input₂ falls into column band, output = grid[row_idx][col_idx]. ' +
      'Example signature: rowBoundaries∈[(min,max)]ʳ, columnBoundaries∈[(min,max)]ᶜ, ' +
      'outputGrid∈ℝʳˣᶜ. Two-dimensional range-membership test.',
  },
  {
    id: 'scalar_multiply',
    kind: 'operation',
    description: 'Fixed rate multiplication: input × rate.',
    allowedKeys: ['operation', 'input', 'rate'],
    promptStructuralExample:
      'Single numeric input multiplied by fixed numeric rate. Shape: ' +
      'output = input × rate. Example signature: input∈ℝ, rate∈ℝ. ' +
      'No conditional logic, no thresholds, no piecewise structure.',
  },
  {
    id: 'conditional_gate',
    kind: 'operation',
    description: 'If/then/else: evaluate condition, execute one of two operations.',
    allowedKeys: ['operation', 'condition', 'onTrue', 'onFalse'],
    promptStructuralExample:
      'Conditional dispatch on boolean predicate. Shape: ' +
      'if condition then operation_A else operation_B. Example signature: ' +
      'condition∈Boolean, onTrue∈IntentOperation, onFalse∈IntentOperation. ' +
      'Used when a single binary criterion selects between two distinct calculation paths.',
  },
  {
    id: 'aggregate',
    kind: 'operation',
    description: 'Return an aggregated value from a source.',
    allowedKeys: ['operation', 'source'],
  },
  {
    id: 'ratio',
    kind: 'operation',
    description: 'Numerator / denominator with zero-guard.',
    allowedKeys: ['operation', 'numerator', 'denominator', 'zeroDenominatorBehavior'],
  },
  {
    id: 'constant',
    kind: 'operation',
    description: 'Fixed literal value.',
    allowedKeys: ['operation', 'value'],
  },
  {
    id: 'weighted_blend',
    kind: 'operation',
    description: 'N-input weighted combination — weights must sum to 1.0.',
    allowedKeys: ['operation', 'inputs'],
  },
  {
    id: 'temporal_window',
    kind: 'operation',
    description: 'Rolling N-period aggregation over historical values.',
    allowedKeys: ['operation', 'input', 'windowSize', 'aggregation', 'includeCurrentPeriod'],
  },
  {
    id: 'linear_function',
    kind: 'operation',
    description: 'Linear function — y = slope * x + intercept.',
    allowedKeys: ['operation', 'input', 'slope', 'intercept', 'modifiers'],
    promptStructuralExample:
      'Continuous linear function of a single numeric input. Shape: ' +
      'output = slope × input + intercept. Example signature: input∈ℝ, slope∈ℝ, ' +
      'intercept∈ℝ. Continuous over the input range; no stepped boundaries.',
  },
  {
    id: 'piecewise_linear',
    kind: 'operation',
    description: 'Piecewise linear — attainment ratio selects rate segment, applied to base input.',
    allowedKeys: ['operation', 'ratioInput', 'baseInput', 'segments', 'targetValue'],
    promptStructuralExample:
      'Two-input piecewise computation. Shape: ratioInput selects a rate segment from ' +
      'a non-overlapping band array; baseInput is multiplied by that selected rate. ' +
      'Example signature: ratioInput∈ℝ, baseInput∈ℝ, segments∈[{min,max,rate}]ⁿ, ' +
      'optional targetValue∈ℝ. Distinguished from bounded_lookup_1d by the second ' +
      'input (base) that the selected segment rate operates on, rather than returning ' +
      'a fixed output per band.',
  },
  {
    id: 'scope_aggregate',
    kind: 'source_only',
    description:
      'Hierarchical aggregate (district / region) used as an IntentSource. ' +
      'Not a top-level operation in the current substrate; emissions as a top-level operation ' +
      'are surfaced as structured failure by the executor.',
    allowedKeys: ['scope', 'field', 'aggregation'],
  },
  {
    id: 'prime_dag',
    kind: 'operation',
    description:
      'Prime-DAG composition (HF-238): a recursive PrimeNode tree expressing the ' +
      'component computation as a composition of nine irreducible operations ' +
      '(arithmetic, aggregate, filter, conditional, scope, compare, logical, constant, ' +
      'reference). Replaces all named-operation forms; legacy intents are translated to ' +
      'this shape at the storage boundary.',
    allowedKeys: ['operation', 'prime', 'op', 'inputs', 'field', 'predicate', 'downstream',
                  'condition', 'then', 'else', 'boundary', 'value'],
  },
]);
```

---

## END

Eight probes complete. Pasted code is the verbatim state of `hf-238-prime-dag-engine @ 086c9d8a` at the file paths and line ranges specified by the audit directive. No interpretation. No recommendations. Architect review determines genuine vs facade.
