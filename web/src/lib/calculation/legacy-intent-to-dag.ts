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
      // Phase 1 translation: emit a reference to the pre-computed scope
      // aggregate key (matches legacy resolveSource at intent-executor.ts:159-165
      // reading from data.scopeAggregates[`${scope}:${field}:${aggregation}`]).
      // The executeIntent wrapper pre-populates context.metrics with this key.
      //
      // Phase 3 will swap this branch to the structural composition
      //   { prime: 'scope', boundary: scope, downstream: { prime: 'aggregate', op, field } }
      // once route.ts wires allEntityRows through EvalContext and deletes the
      // aggregateScopeRows pre-computation pass.
      return {
        prime: 'reference',
        field: `scope_aggregate:${scope}:${stripMetricPrefix(field)}:${aggregation}`,
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
