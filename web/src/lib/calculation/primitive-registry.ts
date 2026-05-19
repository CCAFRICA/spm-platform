/**
 * Foundational Primitive Registry — OB-196 E1 (Decision 24 + Decision 155)
 *
 * Single canonical declaration of the structural primitive vocabulary the
 * platform recognizes. Every dispatch boundary, prompt-vocabulary builder,
 * importer normalization step, and validation site consumes the vocabulary
 * from this module — never from a private string-literal copy.
 *
 * Decision 154 (LOCKED 2026-04-27): Korean Test extended to operation
 * vocabulary. Foundational code references identifiers structurally; only
 * the Domain Agent translation surface may carry domain language.
 *
 * Decision 155 (LOCKED 2026-04-27): the canonical declaration is a SURFACE
 * (this registry), not a string. Consumers import a typed reference; the
 * TypeScript compiler enforces single-source-of-truth at every consumer.
 *
 * AUD-004 closure mapping:
 * - F-001: vocabulary integrity at dispatch (round-trip closure depends on registry).
 * - F-005: prompt vocabulary drift (six locations, six counts) — replaced by
 *   `getRegistry()` consumed by the prompt builder.
 * - F-007: `tier_lookup` ↔ `tiered_lookup` divergence — registry is the
 *   single name authority; legacy normalization layers consult registry.
 * - F-008: `weighted_blend` / `temporal_window` orphan primitives —
 *   registry asserts presence; Phase 2's structured failure surfaces any
 *   orphan that lacks an executor handler.
 */

// ──────────────────────────────────────────────
// Identifier set — Decision 154 narrow exemption boundary
// ──────────────────────────────────────────────

/**
 * The thirteen foundational primitive identifiers. Order is canonical;
 * consumers depending on order should reference `getRegistry()` not the array.
 *
 * HF-238 R2 — twelve of these are legacy named-operation primitives marked
 * `deprecated: true`. They are retained for (a) the storage-boundary adapter
 * `legacyIntentToDAG` which translates old stored intents into PrimeNode
 * trees, and (b) compile-time type narrowing (the `ComponentType` and
 * `FoundationalPrimitive` unions derive from this array).
 *
 * The only non-deprecated identifier is `prime_dag` — a recursive PrimeNode
 * tree expressing the computation as a composition of the nine engine primes
 * (arithmetic, aggregate, filter, conditional, scope, compare, logical,
 * constant, reference). Prompt builders filter deprecated entries before
 * surfacing the vocabulary to the LLM; only `prime_dag` is presented as a
 * recommended emission target.
 *
 * There is no per-primitive dispatch surface — `evaluate()` in
 * intent-executor.ts walks PrimeNode trees uniformly.
 */
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
   * Classification used by prompt builders and validators.
   *
   * HF-238: the engine no longer dispatches per-primitive — every stored
   * intent flows through `legacyIntentToDAG` and is walked by `evaluate()`.
   * `kind` is now purely descriptive: `operation` means the identifier can
   * appear as the top-level `type` field on a stored component;
   * `source_only` means the identifier may appear inside an IntentSource
   * but never as a top-level operation. `prime_dag` is the recommended
   * top-level identifier for new emissions; legacy `operation`-kind
   * entries are retained for the storage-boundary adapter only.
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
   * HF-238 Closure 1 — DEPRECATED for legacy-named primitives. Old entries
   * (bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate,
   * linear_function, piecewise_linear) had their `promptStructuralExample`
   * stripped because the example content teaches the LLM named convenience
   * patterns that the prime-DAG composition prompt (anthropic-adapter.ts
   * lines 418-643) explicitly forbids. New emissions should use prime_dag
   * with a PrimeNode tree; only entries carrying actual prime-composition
   * guidance retain this field.
   *
   * Content discipline (Korean Test, AP-25): describe value-distribution
   * shapes, data-type signatures, input/output cardinality. Do NOT use
   * domain-named keywords (e.g., 'commission', 'sales', 'tier').
   *
   * The plan-interpretation prompt builder iterates registry entries
   * (filtered by `deprecated !== true`) and emits a structural-examples
   * block; deprecated entries are skipped even if they happen to carry
   * a value.
   */
  readonly promptStructuralExample?: string;
  /**
   * HF-238 Closure 1: marks legacy named primitives as adapter-only.
   * Deprecated entries are retained in the registry for compile-time type
   * safety (the `ComponentType` and `FoundationalPrimitive` unions derive
   * from `FOUNDATIONAL_PRIMITIVES`) and for the storage-boundary adapter
   * (`legacyIntentToDAG`) to recognize old stored intents, but they are
   * filtered out of prompt-facing surfaces. Only `prime_dag` (and any
   * future prime-composition entries) carries `deprecated !== true`.
   */
  readonly deprecated?: boolean;
}

// ──────────────────────────────────────────────
// Registry contents — frozen at module load
// ──────────────────────────────────────────────

const REGISTRY: readonly PrimitiveEntry[] = Object.freeze([
  // Legacy named-operation primitives (deprecated post-HF-238). Retained
  // for the storage-boundary adapter (legacyIntentToDAG) and for compile-time
  // type narrowing (ComponentType / FoundationalPrimitive unions derive from
  // FOUNDATIONAL_PRIMITIVES). New emissions should use 'prime_dag'.
  // promptStructuralExample stripped — these examples teach named convenience
  // patterns that conflict with the prime-DAG composition prompt.
  {
    id: 'bounded_lookup_1d',
    kind: 'operation',
    description: '1D threshold table — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'input', 'boundaries', 'outputs', 'noMatchBehavior', 'isMarginal'],
    deprecated: true,
  },
  {
    id: 'bounded_lookup_2d',
    kind: 'operation',
    description: '2D grid lookup — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'inputs', 'rowBoundaries', 'columnBoundaries', 'outputGrid', 'noMatchBehavior'],
    deprecated: true,
  },
  {
    id: 'scalar_multiply',
    kind: 'operation',
    description: 'Fixed rate multiplication — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'input', 'rate'],
    deprecated: true,
  },
  {
    id: 'conditional_gate',
    kind: 'operation',
    description: 'If/then/else — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'condition', 'onTrue', 'onFalse'],
    deprecated: true,
  },
  {
    id: 'aggregate',
    kind: 'operation',
    description: 'Aggregated value source — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'source'],
    deprecated: true,
  },
  {
    id: 'ratio',
    kind: 'operation',
    description: 'Numerator / denominator with zero-guard — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'numerator', 'denominator', 'zeroDenominatorBehavior'],
    deprecated: true,
  },
  {
    id: 'constant',
    kind: 'operation',
    description: 'Fixed literal value — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'value'],
    deprecated: true,
  },
  {
    id: 'weighted_blend',
    kind: 'operation',
    description: 'N-input weighted combination — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'inputs'],
    deprecated: true,
  },
  {
    id: 'temporal_window',
    kind: 'operation',
    description: 'Rolling N-period aggregation — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'input', 'windowSize', 'aggregation', 'includeCurrentPeriod'],
    deprecated: true,
  },
  {
    id: 'linear_function',
    kind: 'operation',
    description: 'Linear function y = slope*x + intercept — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'input', 'slope', 'intercept', 'modifiers'],
    deprecated: true,
  },
  {
    id: 'piecewise_linear',
    kind: 'operation',
    description: 'Piecewise linear — adapter-only; new emissions use prime_dag.',
    allowedKeys: ['operation', 'ratioInput', 'baseInput', 'segments', 'targetValue'],
    deprecated: true,
  },
  {
    id: 'scope_aggregate',
    kind: 'source_only',
    description: 'Hierarchical aggregate (district / region) IntentSource — adapter-only; new emissions use prime_dag with a scope+aggregate composition.',
    allowedKeys: ['scope', 'field', 'aggregation'],
    deprecated: true,
  },
  // HF-238: the operative top-level identifier. A prime_dag component carries
  // a recursive PrimeNode tree under metadata.intent; the engine walks it via
  // evaluate() without legacy adapter intervention.
  {
    id: 'prime_dag',
    kind: 'operation',
    description:
      'Prime-DAG composition (HF-238): a recursive PrimeNode tree expressing the ' +
      'component computation as a composition of nine irreducible operations ' +
      '(arithmetic, aggregate, filter, conditional, scope, compare, logical, constant, ' +
      'reference). The single operative top-level form; legacy named-operation entries ' +
      'are translated to this shape at the storage boundary.',
    allowedKeys: ['operation', 'prime', 'op', 'inputs', 'field', 'predicate', 'downstream',
                  'condition', 'then', 'else', 'boundary', 'value'],
  },
]);

// ──────────────────────────────────────────────
// Public API — registry consumers
// ──────────────────────────────────────────────

/** Type guard. True iff the given string is a registered foundational primitive. */
export function isRegisteredPrimitive(s: string): s is FoundationalPrimitive {
  return (FOUNDATIONAL_PRIMITIVES as readonly string[]).includes(s);
}

/**
 * Returns the registry entry for a given identifier, or null if the
 * identifier is not registered. Use this when a code path needs the
 * structural metadata (e.g., for prompt building or error reporting).
 */
export function lookupPrimitive(id: string): PrimitiveEntry | null {
  if (!isRegisteredPrimitive(id)) return null;
  return REGISTRY.find((e) => e.id === id) ?? null;
}

/** Returns the frozen registry array. Order is canonical. */
export function getRegistry(): readonly PrimitiveEntry[] {
  return REGISTRY;
}

/**
 * Returns only the operation-kind primitives (those with executor handlers in the
 * current substrate). Used by the prompt builder when a list of executable
 * top-level operations is needed.
 */
export function getOperationPrimitives(): readonly PrimitiveEntry[] {
  return REGISTRY.filter((e) => e.kind === 'operation');
}

// ──────────────────────────────────────────────
// Domain Agent registration — stub for v1
// ──────────────────────────────────────────────

/**
 * Stub for Domain Agent primitive registration. Decision 154's narrow
 * exemption permits domain-specific primitives to be registered via this API
 * by Domain Agents. Actual mechanism design is a separate work item; v1
 * surfaces the surface as NotImplementedError so any premature consumer
 * fails loud.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerDomainPrimitive(owner: string, entry: PrimitiveEntry): never {
  throw new Error(
    '[primitive-registry] registerDomainPrimitive is not implemented. ' +
      'Decision 154 reserves a narrow domain-extension surface; the registration mechanism ' +
      'is a separate work item beyond OB-196 scope.',
  );
}
