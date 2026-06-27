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
  ConstantScaleMeta,
  DistributionFactorModel,
  DistributionFactorRef,
  DistributionRecipientSpec,
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
  // HF-238 R2 Closure 2: scopeAggregates field deleted. The scope prime
  // computes hierarchical aggregates on the fly from allEntityRows; there
  // is no longer a pre-computed reference-form path. Callers MUST populate
  // allEntityRows for scope-bearing intents.
  allEntityRows?: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }>;
  activeRows?: Record<string, unknown>[];
  /** HF-211: optional trace collector for [CalcTrace] emissions. */
  traceCollector?: (line: string) => void;
  /**
   * HF-325 (Decision 111): the caller resolved `metrics` via convergence bindings. When true, the
   * `aggregate` prime reads a bound field's convergence-resolved scalar from `metrics[field]` instead
   * of re-deriving it from rows. Unset on the sheet-matching fallback path.
   */
  convergenceAuthoritative?: boolean;
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

/**
 * OB-200 Phase 2: type guard used by the compare case to detect constant
 * nodes carrying scale metadata. The LLM annotates the constant on the plan
 * side ("120%" → value:120, meta:{unit:'percent',scale:100}); the evaluator
 * applies meta.scale to the OTHER input before comparing so plan-native and
 * data-native values reconcile at a single site.
 */
function isConstantWithMeta(
  node: PrimeNode,
): node is { prime: 'constant'; value: number; meta: ConstantScaleMeta } {
  return node.prime === 'constant'
    && typeof node.value === 'number'
    && node.meta !== undefined
    && typeof node.meta.scale === 'number';
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
/** OB-220: is a raw operand value numeric (number, or a numeric-looking non-empty string)? */
function isNumericRaw(v: unknown): boolean {
  return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
}

/**
 * OB-220: the RAW value of a compare operand, before decimal coercion — so the `compare` case can
 * detect categorical (string) operands and compare them as values. `constant` → its literal (which
 * may be a category string the PrimeNode type widens to number); `reference` → the resolved metric
 * (numeric); any computed sub-tree → its numeric outcome.
 */
function rawOperand(node: PrimeNode, context: EvalContext): string | number | null {
  if (node.prime === 'constant') return node.value;
  if (node.prime === 'reference') {
    const raw = context.metrics[node.field];
    return raw === undefined || raw === null ? null : raw;
  }
  return toNumber(evaluate(node, context));
}

export function evaluate(node: PrimeNode, context: EvalContext): Decimal {
  switch (node.prime) {
    case 'constant': {
      // OB-220: a non-numeric (categorical) constant — e.g. a category code "ALI" — must not crash
      // `new Decimal()`. In a numeric context it degrades to 0 (mirror of the `reference` rule); string
      // constants are compared as RAW values in the `compare` case below. Korean Test: type detection,
      // not value detection — no column/value literal.
      const cv = node.value as unknown; // PrimeNode types value as number, but AI intents carry category strings.
      if (typeof cv === 'string' && (cv.trim() === '' || isNaN(Number(cv)))) {
        return ZERO;
      }
      return toDecimal(node.value);
    }

    case 'reference': {
      // OB-216 §G.1: coerce non-numeric to ZERO (mirror the `aggregate` prime). A categorical/text
      // value that reaches a numeric reference (e.g. a mis-bound attribute) must not crash
      // `new Decimal()` — it degrades to 0. Korean Test: "non-numeric → 0", no column-name literal.
      const raw = context.metrics[node.field];
      if (raw === undefined || raw === null) return ZERO;
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      return Number.isFinite(n) ? toDecimal(n) : ZERO;
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
      // OB-220: type-aware comparison. A categorical condition (e.g. Categoria == "ALI") routes string
      // operands here; the prior code passed both through `new Decimal()` and crashed
      // ([DecimalError] Invalid argument: ALI). Detect non-numeric operands from their RAW values and
      // do string equality/inequality; ordering operators on strings are not meaningful in compensation
      // logic (SR-34: structured warning, return false — never crash, never silent wrong-type ordering).
      // Korean Test: type detection, not value detection.
      const lRaw = rawOperand(node.inputs[0], context);
      const rRaw = rawOperand(node.inputs[1], context);
      if (!isNumericRaw(lRaw) || !isNumericRaw(rRaw)) {
        const ls = lRaw === null || lRaw === undefined ? '' : String(lRaw);
        const rs = rRaw === null || rRaw === undefined ? '' : String(rRaw);
        switch (node.op) {
          case 'eq':  return ls === rs ? toDecimal(1) : ZERO;
          case 'neq': return ls !== rs ? toDecimal(1) : ZERO;
          default:
            console.warn(`[PrimeDAG] OB-220: ordering operator '${node.op}' on non-numeric operands ('${ls}' vs '${rs}') — returning false`);
            return ZERO;
        }
      }
      // OB-200 Phase 2: scale reconciliation site (single authority per the
      // directive — no scale logic anywhere else in the evaluator). When one
      // side is a constant carrying meta={unit,scale,confidence} and the other
      // side is not such a constant, scale the non-meta side onto the
      // constant's units before comparing. This consumes the LLM-emitted
      // metadata so the engine no longer needs ambient inference. If neither
      // side carries meta, compare as-is (backward compatible with trees
      // emitted before HF-243 / OB-200).
      const leftMeta = isConstantWithMeta(node.inputs[0]) ? node.inputs[0].meta : undefined;
      const rightMeta = isConstantWithMeta(node.inputs[1]) ? node.inputs[1].meta : undefined;
      let a = evaluate(node.inputs[0], context);
      let b = evaluate(node.inputs[1], context);
      if (leftMeta && !rightMeta) {
        b = b.mul(toDecimal(leftMeta.scale));
      } else if (rightMeta && !leftMeta) {
        a = a.mul(toDecimal(rightMeta.scale));
      }
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
      // HF-325: rows narrowed → a downstream bound aggregate must re-derive from `filtered`, not the
      // convergence scalar (which is over the un-narrowed set).
      return evaluate(node.downstream, { ...context, activeRows: filtered, activeRowsScoped: true });
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
      // HF-325: rows narrowed to peers → downstream bound aggregate re-derives from `siblings`.
      return evaluate(node.downstream, { ...context, activeRows: siblings, activeRowsScoped: true });
    }

    case 'prior_period': {
      // HF-238 R2 Closure 5: switch activeRows to the prior-period rows
      // for the downstream sub-tree. Absent prior_period data resolves to
      // an empty active set (downstream aggregates return zero).
      return evaluate(node.downstream, {
        ...context,
        activeRows: context.priorPeriodRows ?? [],
        activeRowsScoped: true, // HF-325: prior-period rows ≠ the convergence (current-period) scalar
      });
    }

    case 'aggregate': {
      // HF-325 (Decision 111): convergence is authoritative. When convergence bindings resolved this
      // entity's metrics and this aggregate's field is among them, `metrics[field]` already holds the
      // value with the convergence reduction (sum/count/snapshot/…) applied. Read that scalar
      // regardless of node.op — the count/sum re-derivation below is the vestigial path that the
      // LLM's node-type choice used to select between (the BCL Productos Cruzados defect: one variant
      // emitted `metric`→correct, the other `aggregate/count`→re-counted rows→wrong). The bypass is
      // gated on convergence-binding PRESENCE (`field in metrics`), NOT node type, and is suppressed
      // when an upstream filter/scope/prior_period has narrowed activeRows (`activeRowsScoped`), since
      // a filtered/scoped aggregate must re-derive from the narrowed rows, not the un-narrowed scalar.
      // Non-convergence (sheet-matching) paths leave convergenceAuthoritative unset → unchanged.
      if (
        context.convergenceAuthoritative &&
        !context.activeRowsScoped &&
        typeof node.field === 'string' &&
        node.field in context.metrics
      ) {
        const raw = context.metrics[node.field];
        if (raw === undefined || raw === null) return ZERO;
        const cn = typeof raw === 'number' ? raw : parseFloat(String(raw));
        return Number.isFinite(cn) ? toDecimal(cn) : ZERO;
      }
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

export function buildEvalContext(data: EntityData): EvalContext {
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

  // HF-238 R2 Closure 2: scope_aggregate pre-population block removed.
  // The scope prime in evaluate() narrows allEntityRows directly; there is
  // no `scope_aggregate:*` synthetic key in context.metrics any longer.

  return {
    entity: { metadata: { ...data.attributes, entityId: data.entityId } },
    activeRows: data.activeRows ?? [],
    allEntityRows: data.allEntityRows ?? [],
    metrics,
    convergenceAuthoritative: data.convergenceAuthoritative, // HF-325
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

// HF-238 R2 Closure 3: executeOperation wrapper deleted. The single
// fallback caller (run-calculation.ts:343) was inlined to call
// legacyIntentToDAG + buildEvalContext + evaluate directly. There is no
// remaining surface that takes a legacy IntentOperation and returns a
// Decimal in one call.

// ──────────────────────────────────────────────
// OB-248: Distribution — pure fan-out primitives (P-E1..E4)
// ──────────────────────────────────────────────
//
// These are PURE functions: no DB, no network. The engine (route.ts) loads
// edges + reference data and supplies them as plain data / callbacks; tests
// supply synthetic data. Per §0.2 these are new utility functions inside an
// existing file, not a new execution surface. Decision 158: code CONSTRUCTS
// the traversal / fan-out / constraint pass deterministically from the
// contract; nothing here names a role / product / channel / edge type / table.

/** One resolved recipient of a single sale's fan-out. */
export interface ResolvedRecipient {
  role: string;
  entityExternalId: string;
  hops: number;
  /** The edge type the traversal followed to reach this recipient; null for the originator (hops:0, self). */
  viaEdgeType: string | null;
}

export interface RecipientResolution {
  resolved: ResolvedRecipient[];
  /** Roles that could not be reached for this sale (C2: reported, never fabricated). */
  unresolved: Array<{ role: string; reason: string }>;
}

/**
 * P-V1/P-E1 recipient resolution. From the originator, for each recipient role,
 * walk `hops` typed edges (deterministic: first match by target order), gated by
 * the role's inclusion condition against the sale-row attributes. hops:0 = the
 * originator (self). Edge types come ENTIRELY from the contract `edgeTypes`.
 *
 * `adjacency` is a directed map sourceExternalId → outbound edges; the engine
 * orients hierarchy edges so the originator walks "up" via outbound edges
 * (convention documented in the ADR). An unreachable role is returned in
 * `unresolved` — never silently dropped, never fabricated (C2).
 */
export function resolveDistributionRecipients(
  adjacency: Map<string, Array<{ target: string; type: string }>>,
  originatorExternalId: string,
  recipients: DistributionRecipientSpec[],
  rowAttributes: Record<string, unknown>,
): RecipientResolution {
  const resolved: ResolvedRecipient[] = [];
  const unresolved: Array<{ role: string; reason: string }> = [];

  for (const spec of recipients) {
    // Inclusion gate (overlay recipients): an attribute_match recipient is included
    // only when the sale row's attribute matches. A non-match is NOT an error —
    // the recipient simply does not participate in this sale (per-row recipient set).
    if (spec.inclusion.kind === 'attribute_match') {
      const inc = spec.inclusion;
      const v = rowAttributes[inc.rowAttributeColumn];
      const matches = inc.matchValues && inc.matchValues.length > 0
        ? inc.matchValues.some(mv => String(mv) === String(v ?? ''))
        : (v !== null && v !== undefined && String(v).trim() !== '');
      if (!matches) continue;
    }

    if (spec.hops === 0) {
      resolved.push({ role: spec.role, entityExternalId: originatorExternalId, hops: 0, viaEdgeType: null });
      continue;
    }

    let current = originatorExternalId;
    let viaType: string | null = null;
    let reached = true;
    for (let h = 0; h < spec.hops; h++) {
      const edges = (adjacency.get(current) ?? [])
        .filter(e => spec.edgeTypes.includes(e.type))
        .sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0)); // deterministic
      if (edges.length === 0) { reached = false; break; }
      current = edges[0].target;
      viaType = edges[0].type;
    }
    if (!reached) {
      unresolved.push({
        role: spec.role,
        reason: `no [${spec.edgeTypes.join('|')}] edge chain of ${spec.hops} hop(s) from originator`,
      });
      continue;
    }
    resolved.push({ role: spec.role, entityExternalId: current, hops: spec.hops, viaEdgeType: viaType });
  }

  return { resolved, unresolved };
}

/** Right-nested multiply over `reference` leaves — the factor model as a real PrimeNode DAG. */
function multiplyChain(refKeys: string[]): PrimeNode {
  if (refKeys.length === 0) return { prime: 'constant', value: 0 };
  let node: PrimeNode = { prime: 'reference', field: refKeys[refKeys.length - 1] };
  for (let i = refKeys.length - 2; i >= 0; i--) {
    node = { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'reference', field: refKeys[i] }, node] };
  }
  return node;
}

/** Resolves one bound factor reference to its numeric value (null = unresolved → C2 fail-loud). */
export type FactorResolver = (
  ref: DistributionFactorRef,
  recipientExternalId: string,
  row: Record<string, unknown>,
) => number | null;

export interface RecipientAmountResult {
  /** Resolved amount, or null when a required base rate / factor reference is absent (C2 — never silent 0). */
  amount: number | null;
  /** Reference tables that did not resolve (drives the C2 diagnostic). */
  missing: string[];
  saleAmount: number;
  baseRate: number;
  factors: number[];
}

/**
 * P-E1 / P-C2: evaluate one recipient's amount =
 *   sale × base(recipient) × Πfactorsᵢ(attrᵢ)
 * built as a PrimeNode multiply DAG and run through the EXISTING `evaluate()`
 * (extends the evaluation context, not the algebra). A missing required
 * reference returns amount:null with the table(s) in `missing` (C2 fail-loud:
 * missing base rate / missing factor entry are two of the five guarded paths).
 */
export function evaluateRecipientAmount(
  factorModel: DistributionFactorModel,
  recipientExternalId: string,
  row: Record<string, unknown>,
  resolveFactor: FactorResolver,
): RecipientAmountResult {
  const missing: string[] = [];
  const saleRaw = row[factorModel.saleAmountColumn];
  const saleAmount = typeof saleRaw === 'number' ? saleRaw : parseFloat(String(saleRaw ?? '')) || 0;

  const metrics: Record<string, number> = { __sale: saleAmount };
  const refKeys: string[] = ['__sale'];

  let baseRate = 1;
  if (factorModel.baseRate) {
    const b = resolveFactor(factorModel.baseRate, recipientExternalId, row);
    if (b === null) missing.push(factorModel.baseRate.referenceTable);
    else { baseRate = b; metrics.__base = b; refKeys.push('__base'); }
  }

  const factors: number[] = [];
  factorModel.factors.forEach((f, i) => {
    const v = resolveFactor(f, recipientExternalId, row);
    if (v === null) missing.push(f.referenceTable);
    else { factors.push(v); const k = `__f${i}`; metrics[k] = v; refKeys.push(k); }
  });

  if (missing.length > 0) {
    return { amount: null, missing, saleAmount, baseRate, factors };
  }

  const dag = multiplyChain(refKeys);
  const ctx: EvalContext = { entity: { metadata: {} }, activeRows: [], allEntityRows: [], metrics };
  const amount = toNumber(evaluate(dag, ctx));
  return { amount, missing, saleAmount, baseRate, factors };
}

export interface CapResult {
  amounts: number[];
  /** True when the cap bound and amounts were proportionally reduced. */
  applied: boolean;
  rawSum: number;
  capAmount: number;
}

/**
 * P-E2 cross-recipient cap (tope). Post-evaluation pass over ONE transaction's
 * materialized cascade: if Σ amounts exceeds the cap, every recipient is reduced
 * proportionally so the sum equals the cap. The "tope applied to zero recipients"
 * C2 path is guarded at the call site (the engine reports an empty cascade); here
 * an empty / non-positive sum is a structural no-op.
 */
export function applyCrossRecipientCap(amounts: number[], capAmount: number): CapResult {
  const rawSum = amounts.reduce((s, a) => s + a, 0);
  if (rawSum <= capAmount || rawSum <= 0) {
    return { amounts: [...amounts], applied: false, rawSum, capAmount };
  }
  const scale = capAmount / rawSum;
  return { amounts: amounts.map(a => a * scale), applied: true, rawSum, capAmount };
}

/** P-E3 volume cliff: own-period aggregate ≥ threshold → multiply the rate by `multiplier`. */
export function applyVolumeCliff(
  baseRate: number,
  ownPeriodAggregate: number,
  cliff: { threshold: number; multiplier: number },
): number {
  return ownPeriodAggregate >= cliff.threshold ? baseRate * cliff.multiplier : baseRate;
}

/** P-E3 component floor: max(amount, floorValue) per originator per period. */
export function applyComponentFloor(amount: number, floorValue: number): number {
  return Math.max(amount, floorValue);
}

export interface StreakResult {
  metConsecutively: boolean;
  streakLength: number;
  bonus: number;
}

/**
 * P-E3 consecutive-period streak. `periodHistoryMostRecentFirst` are the
 * originator's prior-period outcomes (most recent first, the engine's
 * periodHistory order). When the most recent `periodCount` periods all meet
 * `threshold`, the bonus applies; a single miss resets the accumulator (bonus 0).
 */
export function computeConsecutiveStreak(
  periodHistoryMostRecentFirst: number[],
  periodCount: number,
  threshold: number,
  bonus: number,
): StreakResult {
  let streak = 0;
  for (const v of periodHistoryMostRecentFirst) {
    if (v >= threshold) streak++;
    else break;
  }
  const met = streak >= periodCount;
  return { metConsecutively: met, streakLength: streak, bonus: met ? bonus : 0 };
}

/** One row of a materialized distribution cascade (a single recipient's payout for one sale). */
export interface CascadeRow {
  role: string;
  entityExternalId: string;
  amount: number;
}

/**
 * P-E4 cascade reversal (devolución): atomically reverse every recipient's
 * payout for the original sale — negate each amount. The caller posts these as
 * new calculation_results rows referencing the original (C2: an empty original
 * cascade is reported at the call site — "reversal with no original trace").
 */
export function reverseCascade(originalCascade: CascadeRow[]): CascadeRow[] {
  return originalCascade.map(r => ({ role: r.role, entityExternalId: r.entityExternalId, amount: -r.amount }));
}

/**
 * P-E4 retro recompute (price correction): given the original cascade and the
 * cascade recomputed at the corrected net, post the per-recipient delta
 * (recomputed − original), matched by recipient identity. Recipients present in
 * the original but absent from the recompute are reversed fully.
 */
export function recomputeCascadeDelta(originalCascade: CascadeRow[], recomputedCascade: CascadeRow[]): CascadeRow[] {
  const originalByEntity = new Map<string, number>();
  for (const r of originalCascade) {
    originalByEntity.set(r.entityExternalId, (originalByEntity.get(r.entityExternalId) ?? 0) + r.amount);
  }
  const out: CascadeRow[] = [];
  const seen = new Set<string>();
  for (const r of recomputedCascade) {
    const old = originalByEntity.get(r.entityExternalId) ?? 0;
    out.push({ role: r.role, entityExternalId: r.entityExternalId, amount: r.amount - old });
    seen.add(r.entityExternalId);
  }
  for (const r of originalCascade) {
    if (!seen.has(r.entityExternalId)) {
      out.push({ role: r.role, entityExternalId: r.entityExternalId, amount: -r.amount });
    }
  }
  return out;
}

// ──────────────────────────────────────────────
// OB-248: Distribution fan-out ORCHESTRATION (pure) — P-E1..E3 composed
// ──────────────────────────────────────────────
//
// `runDistributionFanOut` is the engine's distribution computation, factored out
// of route.ts as a PURE function so it is unit-testable without a live tenant
// (the route.ts branch supplies DB data + the resolveFactor closure and writes
// the results). §0.2: a utility function inside an existing file, not a new
// execution surface. Composes the helpers above: resolve recipients → evaluate
// each factor model → volume cliff (on the originator) → cross-recipient tope
// (per sale) → per-recipient period aggregation → component floor + streak (per
// originator). Every unresolved recipient / missing reference / empty cascade is
// reported in `diagnostics` (C2 fail-loud — never a silent $0).

import type { DistributionDerivation, DistributionModifier } from './intent-types';

export interface DistributionSaleRow {
  /** committed_data.id — the source-sale lineage for traces / reversal. */
  committedDataId: string;
  rowData: Record<string, unknown>;
  /** optional explicit transaction reference (else derived/absent). */
  transactionRef?: string | null;
}

export interface DistributionFanOutInput {
  derivation: DistributionDerivation;
  saleRows: DistributionSaleRow[];
  /** Directed adjacency in EXTERNAL-ID space: sourceExternalId → outbound edges. */
  adjacency: Map<string, Array<{ target: string; type: string }>>;
  resolveFactor: FactorResolver;
  /** originator external_id → own-period aggregate (volume cliff input). */
  ownPeriodAggregate?: Map<string, number>;
  /** originator external_id → prior-period outcomes, most-recent-first (streak input). */
  periodHistory?: Map<string, number[]>;
}

export interface DistributionPayoutRow {
  recipientExternalId: string;
  role: string;
  amount: number;
  saleCommittedDataId: string;
  transactionRef: string | null;
  originatorExternalId: string;
  viaEdgeType: string | null;
  /** true when this sale's cascade was reduced by the cross-recipient cap. */
  capped: boolean;
}

export interface DistributionDiagnostic {
  kind: 'unresolved_recipient' | 'missing_reference' | 'empty_cascade';
  detail: string;
  saleCommittedDataId?: string;
}

export interface DistributionFanOutResult {
  /** One row per (recipient, sale) — PG-4 cardinality. */
  payoutRows: DistributionPayoutRow[];
  /** recipient external_id → Σ amount over the period (feeds entity_period_outcomes). */
  perRecipientPeriodTotal: Map<string, number>;
  diagnostics: DistributionDiagnostic[];
}

export function runDistributionFanOut(input: DistributionFanOutInput): DistributionFanOutResult {
  const { derivation, saleRows, adjacency, resolveFactor, ownPeriodAggregate, periodHistory } = input;
  const payoutRows: DistributionPayoutRow[] = [];
  const diagnostics: DistributionDiagnostic[] = [];

  const cap = derivation.modifiers.find((m): m is Extract<DistributionModifier, { kind: 'cross_recipient_cap' }> => m.kind === 'cross_recipient_cap');
  const cliff = derivation.modifiers.find((m): m is Extract<DistributionModifier, { kind: 'volume_cliff' }> => m.kind === 'volume_cliff');
  const floor = derivation.modifiers.find((m): m is Extract<DistributionModifier, { kind: 'component_floor' }> => m.kind === 'component_floor');
  const streak = derivation.modifiers.find((m): m is Extract<DistributionModifier, { kind: 'consecutive_streak' }> => m.kind === 'consecutive_streak');

  for (const sale of saleRows) {
    const originator = String(sale.rowData[derivation.originatorColumn] ?? '').trim();
    if (!originator) continue;
    const { resolved, unresolved } = resolveDistributionRecipients(adjacency, originator, derivation.recipients, sale.rowData);
    for (const u of unresolved) {
      diagnostics.push({ kind: 'unresolved_recipient', detail: `${u.role}: ${u.reason}`, saleCommittedDataId: sale.committedDataId });
    }

    // Evaluate each recipient's factor model; cliff scales the originator's (hops:0) rate.
    const evaluated: Array<{ rec: ResolvedRecipient; amount: number }> = [];
    for (const rec of resolved) {
      const res = evaluateRecipientAmount(derivation.factorModel, rec.entityExternalId, sale.rowData, resolveFactor);
      if (res.amount === null) {
        diagnostics.push({ kind: 'missing_reference', detail: `${rec.role} (${rec.entityExternalId}): ${res.missing.join(', ')}`, saleCommittedDataId: sale.committedDataId });
        continue; // C2: recorded, not fabricated, not silent 0
      }
      let amount = res.amount;
      if (cliff && rec.hops === 0 && ownPeriodAggregate) {
        const agg = ownPeriodAggregate.get(originator) ?? 0;
        // amount = sale × rate × factors; scaling amount by the cliff multiplier == scaling the rate.
        amount = applyVolumeCliff(amount, agg, { threshold: cliff.threshold, multiplier: cliff.multiplier });
      }
      evaluated.push({ rec, amount });
    }

    // Cross-recipient cap (tope) over THIS sale's cascade.
    let capped = false;
    if (cap) {
      if (evaluated.length === 0) {
        diagnostics.push({ kind: 'empty_cascade', detail: 'cross-recipient cap on a sale that resolved zero recipients', saleCommittedDataId: sale.committedDataId });
      } else {
        const saleAmount = (() => { const v = sale.rowData[derivation.factorModel.saleAmountColumn]; return typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0; })();
        const capResult = applyCrossRecipientCap(evaluated.map(e => e.amount), cap.capFraction * saleAmount);
        capped = capResult.applied;
        capResult.amounts.forEach((a, i) => { evaluated[i].amount = a; });
      }
    }

    for (const e of evaluated) {
      payoutRows.push({
        recipientExternalId: e.rec.entityExternalId,
        role: e.rec.role,
        amount: e.amount,
        saleCommittedDataId: sale.committedDataId,
        transactionRef: sale.transactionRef ?? null,
        originatorExternalId: originator,
        viaEdgeType: e.rec.viaEdgeType,
        capped,
      });
    }
  }

  // ── Per-originator period passes: component floor + consecutive streak ──
  // The floor/streak apply to the ORIGINATOR's own component (the hops:0 / self
  // role), summed across the period. We add adjustment rows so per-recipient
  // totals reflect them without disturbing the per-sale cascade rows.
  if (floor || streak) {
    // sum each originator's own-role (hops:0) amount across the period
    const ownRoleByOriginator = new Map<string, number>();
    for (const p of payoutRows) {
      if (p.viaEdgeType === null && p.recipientExternalId === p.originatorExternalId) {
        ownRoleByOriginator.set(p.originatorExternalId, (ownRoleByOriginator.get(p.originatorExternalId) ?? 0) + p.amount);
      }
    }
    for (const [originator, ownTotal] of Array.from(ownRoleByOriginator.entries())) {
      if (floor && (!floor.appliesToRole || true)) {
        const topUp = applyComponentFloor(ownTotal, floor.floorValue) - ownTotal;
        if (topUp > 0) {
          payoutRows.push({ recipientExternalId: originator, role: '__floor__', amount: topUp, saleCommittedDataId: '', transactionRef: null, originatorExternalId: originator, viaEdgeType: null, capped: false });
        }
      }
      if (streak && periodHistory) {
        const hist = periodHistory.get(originator) ?? [];
        const s = computeConsecutiveStreak(hist, streak.periodCount, streak.threshold, streak.bonus);
        if (s.bonus > 0) {
          payoutRows.push({ recipientExternalId: originator, role: '__streak__', amount: s.bonus, saleCommittedDataId: '', transactionRef: null, originatorExternalId: originator, viaEdgeType: null, capped: false });
        }
      }
    }
  }

  // Per-recipient period aggregation (feeds entity_period_outcomes).
  const perRecipientPeriodTotal = new Map<string, number>();
  for (const p of payoutRows) {
    perRecipientPeriodTotal.set(p.recipientExternalId, (perRecipientPeriodTotal.get(p.recipientExternalId) ?? 0) + p.amount);
  }

  return { payoutRows, perRecipientPeriodTotal, diagnostics };
}
