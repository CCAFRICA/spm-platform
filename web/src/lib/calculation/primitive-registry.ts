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
 * The twelve foundational primitive identifiers. Order is canonical;
 * consumers depending on order should reference `getRegistry()` not the array.
 *
 * 11 of these have a corresponding `IntentOperation` shape interface in
 * `intent-types.ts` and a dispatch case in `intent-executor.ts:executeOperation`.
 * `scope_aggregate` is recognized vocabulary (named in plan-agent prompt examples
 * and the importer's 5-tuple branch) but has no top-level executor case in the
 * current substrate; per AUD-004 Phase 0G evidence, the prompt typically wraps
 * scope aggregation as `scalar_multiply { input.source: 'scope_aggregate' }`.
 * Phase 2's `UnknownPrimitiveError` surfaces any AI emission of `scope_aggregate`
 * as a top-level operation as structured failure.
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
