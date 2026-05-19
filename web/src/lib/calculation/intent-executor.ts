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
