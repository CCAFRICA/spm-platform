# Revised primitive-registry.ts — Phase 1.5.1 P1.5.1.1 proposed final state

**Path:** `web/src/lib/calculation/primitive-registry.ts`

**Phase:** OB-196 Phase 1.5.1 — Plan-agent prompt closure (Decisions 154 + 155).

**Diff vs HEAD `61496dde` (228 lines):** ~3.2× expansion. New surface area:
- 3 sub-vocabulary `as const` arrays (Polish 2)
- 1 import (Decimal from `./decimal-precision`, per Decision 122)
- 1 helper (`isFiniteNum`)
- 1 new interface (`ValidationResult`)
- 1 new error class (`InvalidPrimitiveShapeError`, co-located per Polish 3 disposition)
- 5 new prompt-facing fields on `PrimitiveEntry` (`promptDescription`, `promptStructuralExample`, `promptIntentExample`, `promptSelectionGuidance`, `promptEmissionPattern`)
- 1 new `validate` field on `PrimitiveEntry`
- 12 entries in REGISTRY each populated with all 9 fields (existing 4 + 4 prompt-facing + emissionPattern + validate)

Existing surface (FOUNDATIONAL_PRIMITIVES array, type alias, public API functions, registerDomainPrimitive stub) unchanged.

```typescript
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
 *
 * Phase 1.5.1 (this revision): registry surface extended with prompt-facing
 * metadata fields (promptDescription, promptStructuralExample,
 * promptIntentExample, promptSelectionGuidance, promptEmissionPattern) and
 * per-primitive structural-validity check (`validate`). Plan-agent prompt
 * builder derives all primitive-facing content from this surface.
 */

import { Decimal } from './decimal-precision';

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

// ──────────────────────────────────────────────
// Sub-vocabulary constants — single declaration per sub-vocabulary.
// Decision 155's "every boundary derives from the surface" applied to
// sub-vocabularies consumed by validate bodies.
// ──────────────────────────────────────────────

const FOUNDATIONAL_AGGREGATIONS = ['sum', 'average', 'min', 'max', 'count'] as const;
const LINEAR_FUNCTION_MODIFIERS = ['cap', 'floor', 'multiplier'] as const;
const RATIO_ZERO_DENOMINATOR_BEHAVIORS = ['zero', 'null', 'error'] as const;

/** Type-level union derived from the registry array. */
export type FoundationalPrimitive = (typeof FOUNDATIONAL_PRIMITIVES)[number];

// ──────────────────────────────────────────────
// Validation result + error class
// ──────────────────────────────────────────────

export interface ValidationResult {
  readonly valid: boolean;
  readonly violations: readonly string[]; // structural; no domain language
}

/**
 * Structured failure surface for emissions that pass identifier validation
 * (`isRegisteredPrimitive` returns true) but fail per-primitive structural
 * invariants (e.g., weights not summing to 1.0, axis dimensions mismatched
 * with grid dimensions, segments not contiguous).
 *
 * Per Decision 154's structured-failure obligation: the violations array
 * carries structural descriptions only — no domain language.
 */
export class InvalidPrimitiveShapeError extends Error {
  constructor(
    public primitive: string,
    public violations: readonly string[],
    public context: { boundary: string; tenant_id?: string },
  ) {
    super(`[${context.boundary}] Invalid shape for primitive '${primitive}': ${violations.join('; ')}`);
    this.name = 'InvalidPrimitiveShapeError';
  }
}

// ──────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────

/** Type guard for finite numeric values (rejects NaN, Infinity, non-numbers). */
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ──────────────────────────────────────────────
// Registry entry shape
// ──────────────────────────────────────────────

/**
 * Structural metadata for a registered primitive. The shape interfaces
 * (BoundedLookup1D, BoundedLookup2D, etc.) in `intent-types.ts` carry the
 * full TypeScript shape; this entry carries human-readable metadata for
 * documentation / discovery / validation paths that don't have a typed
 * shape interface (e.g., prompt builders, error messages, telemetry).
 *
 * Phase 1.5.1: extended with prompt-facing fields and per-primitive
 * `validate` per Decisions 154 + 155.
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

  // ────────────────────────────────────────────────────────────────────
  // OB-196 Phase 1.5.1 — Decision 155 closure: prompt-builder content
  // derives from the registry, not from private prompt copy.
  // ────────────────────────────────────────────────────────────────────

  /**
   * Multi-paragraph structural description for the plan-interpretation
   * prompt. Describes the primitive's structural pattern (when/why this
   * primitive applies) without naming domain vocabulary. The AI's
   * structural reasoning consumes this when deciding which primitive
   * to emit.
   */
  readonly promptDescription: string;

  /**
   * Per-primitive structural example showing the primitive's own structural
   * shape. For top-level operations, this is the calculationMethod payload.
   * For source-only primitives (e.g., scope_aggregate), this is the
   * source-spec object that gets wrapped within an outer operation's
   * input.sourceSpec field. Neutral placeholders (e.g., 'metric_a',
   * 'threshold_value') — the AI fills with plan-specific values at
   * interpretation time.
   *
   * Format: a JSON-stringified object that the prompt builder embeds
   * verbatim in the prompt's structural-example section.
   */
  readonly promptStructuralExample: string;

  /**
   * Per-primitive structural example for the calculationIntent field —
   * realistic emission usage. For top-level operations, the example shows
   * the calculationIntent payload as emitted. For source-only primitives,
   * the example shows the realistic wrapping pattern (the source nested
   * within an outer operation's input.source). Same neutral-placeholder
   * discipline as promptStructuralExample.
   */
  readonly promptIntentExample: string;

  /**
   * Selection guidance — what structural pattern signals this primitive
   * is the right choice. Multi-line, no domain vocabulary, no
   * language-specific keywords. Korean Test compliant.
   */
  readonly promptSelectionGuidance: string;

  /**
   * One- or two-sentence structural description of how this primitive
   * participates in emissions. The prompt-builder template renders all
   * primitives through one unified path; promptEmissionPattern is the
   * data-level discrimination the AI consumes. The kind field remains for
   * type-system / consumer-side typing but does NOT drive template branching.
   */
  readonly promptEmissionPattern: string;

  /**
   * Per-primitive structural-validity check. Validates arithmetic and
   * structural-consistency invariants on emitted shapes that allowedKeys
   * cannot catch (weights summing to 1.0, axis dimensions matching grid
   * dimensions, segments contiguous and non-overlapping, etc.).
   *
   * Validation failures surface as InvalidPrimitiveShapeError per
   * Decision 154's structured-failure obligation. Violation strings are
   * structural — primitive name, field path, observed value — never
   * domain language.
   */
  readonly validate: (emission: Record<string, unknown>) => ValidationResult;
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
    promptDescription:
      "A 1D threshold table where a single input metric is mapped to an output value via an ordered set of numeric boundaries. The input value is located within the boundary array and the output at the matching index is returned. Every boundary range produces a fixed output (typically a payout amount).",
    promptStructuralExample: JSON.stringify({
      type: 'bounded_lookup_1d',
      calculationMethod: {
        type: 'bounded_lookup_1d',
        metric: 'input_metric_name',
        metricLabel: 'human-readable label of the input metric',
        tiers: [
          { min: 0, max: 100, payout: 0, label: 'below threshold' },
          { min: 100, max: 105, payout: 150, label: 'tier 1' },
          { min: 105, max: 110, payout: 300, label: 'tier 2' },
          { min: 110, max: 999999, payout: 500, label: 'tier 3' },
        ],
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'bounded_lookup_1d',
        input: { source: 'metric', sourceSpec: { field: 'input_metric_name' } },
        boundaries: [
          { min: 0, max: 99.999, minInclusive: true, maxInclusive: true },
          { min: 100, max: 104.999, minInclusive: true, maxInclusive: true },
          { min: 105, max: 109.999, minInclusive: true, maxInclusive: true },
          { min: 110, max: null, minInclusive: true, maxInclusive: true },
        ],
        outputs: [0, 150, 300, 500],
        noMatchBehavior: 'zero',
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when tiers produce FIXED OUTPUT VALUES (e.g., 0, 150, 300, 500) and a single metric selects which tier applies. If the values are RATES applied to a base amount, use `piecewise_linear` instead. If the structure has TWO independent input axes, use `bounded_lookup_2d`.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      if (Array.isArray(emission.tiers)) {
        const tiers = emission.tiers as Array<Record<string, unknown>>;
        if (tiers.length === 0) violations.push('bounded_lookup_1d.tiers must be non-empty');
        for (let i = 0; i < tiers.length - 1; i++) {
          const a = tiers[i], b = tiers[i + 1];
          if (isFiniteNum(a.max) && isFiniteNum(b.min) && a.max !== b.min) {
            violations.push(`bounded_lookup_1d.tiers not contiguous at i=${i}: tiers[${i}].max=${a.max} != tiers[${i + 1}].min=${b.min}`);
          }
        }
      }
      if (Array.isArray(emission.boundaries) && Array.isArray(emission.outputs)) {
        const bounds = emission.boundaries as Array<Record<string, unknown>>;
        const outs = emission.outputs as unknown[];
        if (bounds.length !== outs.length) {
          violations.push(`bounded_lookup_1d.boundaries.length=${bounds.length} != outputs.length=${outs.length}`);
        }
        for (let i = 0; i < bounds.length - 1; i++) {
          const a = bounds[i], b = bounds[i + 1];
          if (isFiniteNum(a.max) && isFiniteNum(b.min) && a.max !== b.min) {
            violations.push(`bounded_lookup_1d.boundaries not contiguous at i=${i}: boundaries[${i}].max=${a.max} != boundaries[${i + 1}].min=${b.min}`);
          }
        }
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'bounded_lookup_2d',
    kind: 'operation',
    description: '2D grid lookup — maps two input values (row, column) to a grid output.',
    allowedKeys: ['operation', 'inputs', 'rowBoundaries', 'columnBoundaries', 'outputGrid', 'noMatchBehavior'],
    promptDescription:
      "A 2D grid where two input metrics independently select a row and column, and the output is the value at the intersection cell. Each axis carries an ordered set of numeric boundaries; the row metric and column metric are independent.",
    promptStructuralExample: JSON.stringify({
      type: 'bounded_lookup_2d',
      calculationMethod: {
        type: 'bounded_lookup_2d',
        rowAxis: {
          metric: 'row_metric_name',
          label: 'row axis label',
          ranges: [
            { min: 0, max: 100, label: 'row tier 1' },
            { min: 100, max: 999999, label: 'row tier 2' },
          ],
        },
        columnAxis: {
          metric: 'column_metric_name',
          label: 'column axis label',
          ranges: [
            { min: 0, max: 50000, label: 'col tier 1' },
            { min: 50000, max: 999999, label: 'col tier 2' },
          ],
        },
        values: [[0, 100], [200, 400]],
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'bounded_lookup_2d',
        inputs: {
          row: { source: 'metric', sourceSpec: { field: 'row_metric_name' } },
          column: { source: 'metric', sourceSpec: { field: 'column_metric_name' } },
        },
        rowBoundaries: [
          { min: 0, max: 99.999, minInclusive: true, maxInclusive: true },
          { min: 100, max: null, minInclusive: true, maxInclusive: true },
        ],
        columnBoundaries: [
          { min: 0, max: 49999, minInclusive: true, maxInclusive: true },
          { min: 50000, max: null, minInclusive: true, maxInclusive: true },
        ],
        outputGrid: [[0, 100], [200, 400]],
        noMatchBehavior: 'zero',
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the plan describes a TWO-DIMENSIONAL table where two independent metrics jointly determine the output. The first metric selects a row, the second selects a column, and the cell at their intersection is the output. If only ONE metric drives the lookup, use `bounded_lookup_1d`.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      const rowAxis = emission.rowAxis as Record<string, unknown> | undefined;
      const colAxis = emission.columnAxis as Record<string, unknown> | undefined;
      const values = emission.values;
      if (rowAxis && Array.isArray(rowAxis.ranges) && colAxis && Array.isArray(colAxis.ranges) && Array.isArray(values)) {
        const rows = rowAxis.ranges as Array<Record<string, unknown>>;
        const cols = colAxis.ranges as Array<Record<string, unknown>>;
        if (rows.length === 0) violations.push('bounded_lookup_2d.rowAxis.ranges must be non-empty');
        if (cols.length === 0) violations.push('bounded_lookup_2d.columnAxis.ranges must be non-empty');
        if ((values as unknown[]).length !== rows.length) {
          violations.push(`bounded_lookup_2d.values.length=${(values as unknown[]).length} != rowAxis.ranges.length=${rows.length}`);
        }
        for (let i = 0; i < (values as unknown[]).length; i++) {
          const row = (values as unknown[])[i];
          if (Array.isArray(row) && row.length !== cols.length) {
            violations.push(`bounded_lookup_2d.values[${i}].length=${row.length} != columnAxis.ranges.length=${cols.length}`);
          }
        }
        for (let i = 0; i < rows.length - 1; i++) {
          const a = rows[i], b = rows[i + 1];
          if (isFiniteNum(a.max) && isFiniteNum(b.min) && a.max !== b.min) {
            violations.push(`bounded_lookup_2d.rowAxis.ranges not contiguous at i=${i}: max=${a.max} != min=${b.min}`);
          }
        }
        for (let i = 0; i < cols.length - 1; i++) {
          const a = cols[i], b = cols[i + 1];
          if (isFiniteNum(a.max) && isFiniteNum(b.min) && a.max !== b.min) {
            violations.push(`bounded_lookup_2d.columnAxis.ranges not contiguous at i=${i}: max=${a.max} != min=${b.min}`);
          }
        }
      }
      if (Array.isArray(emission.rowBoundaries) && Array.isArray(emission.columnBoundaries) && Array.isArray(emission.outputGrid)) {
        const rb = emission.rowBoundaries as unknown[];
        const cb = emission.columnBoundaries as unknown[];
        const og = emission.outputGrid as unknown[];
        if (og.length !== rb.length) {
          violations.push(`bounded_lookup_2d.outputGrid.length=${og.length} != rowBoundaries.length=${rb.length}`);
        }
        for (let i = 0; i < og.length; i++) {
          const row = og[i];
          if (Array.isArray(row) && row.length !== cb.length) {
            violations.push(`bounded_lookup_2d.outputGrid[${i}].length=${row.length} != columnBoundaries.length=${cb.length}`);
          }
        }
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'scalar_multiply',
    kind: 'operation',
    description: 'Fixed rate multiplication: input × rate.',
    allowedKeys: ['operation', 'input', 'rate'],
    promptDescription:
      "A single multiplication: input × rate. The input is a numeric metric; the rate is a fixed decimal (e.g., 0.04 for 4%). Output is their product. No tiers, no thresholds, no conditions.",
    promptStructuralExample: JSON.stringify({
      type: 'scalar_multiply',
      calculationMethod: {
        type: 'scalar_multiply',
        metric: 'input_metric_name',
        metricLabel: 'human-readable label of the base amount',
        rate: 0.04,
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'scalar_multiply',
        input: { source: 'metric', sourceSpec: { field: 'input_metric_name' } },
        rate: 0.04,
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the plan describes a single fixed rate applied to a single base amount with no tiers and no conditions. Use `linear_function` if there is also a fixed base draw / intercept; use `piecewise_linear` if the rate changes at attainment thresholds.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      if (!isFiniteNum(emission.rate)) {
        violations.push(`scalar_multiply.rate must be a finite number; got ${typeof emission.rate}=${String(emission.rate)}`);
      }
      if (emission.metric === undefined && emission.input === undefined) {
        violations.push('scalar_multiply requires either metric (calculationMethod-style) or input (intent-style)');
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'conditional_gate',
    kind: 'operation',
    description: 'If/then/else: evaluate condition, execute one of two operations.',
    allowedKeys: ['operation', 'condition', 'onTrue', 'onFalse'],
    promptDescription:
      "An if/then/else dispatch: a condition is evaluated against an input value, and one of two operations executes depending on the outcome. Both branches (onTrue, onFalse) are themselves nested operations and may be any registered primitive. Conditional gates can be chained recursively.",
    promptStructuralExample: JSON.stringify({
      type: 'conditional_gate',
      calculationMethod: {
        type: 'conditional_gate',
        conditionMetric: 'condition_metric_name',
        conditionOperator: '>=',
        conditionThreshold: 100,
        onTrue: { type: 'scalar_multiply', metric: 'payout_metric', rate: 0.05 },
        onFalse: { type: 'scalar_multiply', metric: 'payout_metric', rate: 0.03 },
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'conditional_gate',
        condition: {
          left: { source: 'metric', sourceSpec: { field: 'condition_metric_name' } },
          operator: '>=',
          right: { source: 'constant', value: 100 },
        },
        onTrue: {
          operation: 'scalar_multiply',
          input: { source: 'metric', sourceSpec: { field: 'payout_metric' } },
          rate: 0.05,
        },
        onFalse: {
          operation: 'scalar_multiply',
          input: { source: 'metric', sourceSpec: { field: 'payout_metric' } },
          rate: 0.03,
        },
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when a condition gates which of two operations executes — a binary prerequisite (must qualify to earn anything) or a multi-branch rate selector (different rates on different conditions). The onTrue and onFalse branches may themselves be nested conditional_gate operations to express multi-tier conditions. For nested chains where rates change with an attainment ratio, prefer `piecewise_linear`.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      const hasFlatCondition = emission.conditionOperator !== undefined && emission.conditionThreshold !== undefined;
      const cond = emission.condition as Record<string, unknown> | undefined;
      const hasNestedCondition = !!(cond && cond.left !== undefined && cond.operator !== undefined && cond.right !== undefined);
      if (!hasFlatCondition && !hasNestedCondition) {
        violations.push('conditional_gate requires condition (intent-style: left/operator/right) or conditionOperator+conditionThreshold (calculationMethod-style)');
      }
      for (const branch of ['onTrue', 'onFalse'] as const) {
        const inner = emission[branch] as Record<string, unknown> | undefined;
        if (!inner) {
          violations.push(`conditional_gate.${branch} required`);
          continue;
        }
        const innerType = String(inner.type ?? inner.operation ?? '');
        if (!innerType) {
          violations.push(`conditional_gate.${branch} missing type/operation discriminator`);
          continue;
        }
        const innerEntry = lookupPrimitive(innerType);
        if (!innerEntry) {
          violations.push(`conditional_gate.${branch} unknown primitive '${innerType}'`);
          continue;
        }
        const innerResult = innerEntry.validate(inner);
        if (!innerResult.valid) {
          for (const v of innerResult.violations) violations.push(`conditional_gate.${branch}: ${v}`);
        }
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'aggregate',
    kind: 'operation',
    description: 'Return an aggregated value from a source.',
    allowedKeys: ['operation', 'source'],
    promptDescription:
      "Returns an aggregated value from a source. The source carries the aggregation specification (typically a scope_aggregate for hierarchical aggregation, or a metric source for simple field reads). The operation's purpose is to surface a single aggregated number with no further transformation.",
    promptStructuralExample: JSON.stringify({
      type: 'aggregate',
      calculationMethod: {
        type: 'aggregate',
        source: { scope: 'district', field: 'metric_name', aggregation: 'sum' },
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'aggregate',
        source: {
          source: 'scope_aggregate',
          sourceSpec: { scope: 'district', field: 'metric_name', aggregation: 'sum' },
        },
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the operation's sole purpose is to surface an aggregated value (e.g., a hierarchical sum, count, or average) without further multiplication or transformation. If the aggregated value is multiplied by a rate, use `scope_aggregate` as the input source inside `scalar_multiply` instead.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      const source = emission.source as Record<string, unknown> | undefined;
      if (!source) {
        violations.push('aggregate.source required');
        return { valid: false, violations };
      }
      const flatHasSpec = source.scope !== undefined && source.field !== undefined && source.aggregation !== undefined;
      const nestedHasSpec = source.source !== undefined && (source.sourceSpec !== undefined || source.field !== undefined);
      if (!flatHasSpec && !nestedHasSpec) {
        violations.push('aggregate.source must have scope+field+aggregation (calculationMethod-style) or source+sourceSpec (intent-style)');
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'ratio',
    kind: 'operation',
    description: 'Numerator / denominator with zero-guard.',
    allowedKeys: ['operation', 'numerator', 'denominator', 'zeroDenominatorBehavior'],
    promptDescription:
      "Computes a ratio: numerator / denominator with a zero-guard behavior. Both numerator and denominator are themselves source specs (typically a metric or constant). The operation surfaces a ratio value (e.g., attainment percentage = actual / target) for downstream consumption.",
    promptStructuralExample: JSON.stringify({
      type: 'ratio',
      calculationMethod: {
        type: 'ratio',
        numerator: { metric: 'actual_metric_name' },
        denominator: { metric: 'target_metric_name' },
        zeroDenominatorBehavior: 'zero',
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'ratio',
        numerator: { source: 'metric', sourceSpec: { field: 'actual_metric_name' } },
        denominator: { source: 'metric', sourceSpec: { field: 'target_metric_name' } },
        zeroDenominatorBehavior: 'zero',
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the plan computes one metric as the quotient of two others (e.g., attainment ratio = actual / target). For tier selection driven by a ratio, prefer `piecewise_linear`, which carries its own ratio computation in `ratioInput`.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      if (emission.numerator === undefined) violations.push('ratio.numerator required');
      if (emission.denominator === undefined) violations.push('ratio.denominator required');
      if (emission.zeroDenominatorBehavior !== undefined) {
        const zb = String(emission.zeroDenominatorBehavior);
        if (!(RATIO_ZERO_DENOMINATOR_BEHAVIORS as readonly string[]).includes(zb)) {
          violations.push(`ratio.zeroDenominatorBehavior must be one of [${RATIO_ZERO_DENOMINATOR_BEHAVIORS.join(', ')}]; got '${zb}'`);
        }
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'constant',
    kind: 'operation',
    description: 'Fixed literal value.',
    allowedKeys: ['operation', 'value'],
    promptDescription:
      "A fixed literal numeric value. The output is the constant regardless of any other inputs. Most commonly used as a payout terminator (e.g., the onFalse branch of a conditional_gate that should yield zero) or as a parameter source inside a comparison.",
    promptStructuralExample: JSON.stringify({
      type: 'constant',
      calculationMethod: { type: 'constant', value: 0 },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: { operation: 'constant', value: 0 },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the operation's output is a fixed literal value with no input dependency. Most commonly the onFalse terminator of a `conditional_gate`.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      if (!isFiniteNum(emission.value)) {
        violations.push(`constant.value must be a finite number; got ${typeof emission.value}=${String(emission.value)}`);
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'weighted_blend',
    kind: 'operation',
    description: 'N-input weighted combination — weights must sum to 1.0.',
    allowedKeys: ['operation', 'inputs'],
    promptDescription:
      "An N-input weighted combination where each input is multiplied by its weight and the products are summed. Weights must sum to 1.0. Used when the plan describes a composite metric formed from multiple weighted contributors.",
    promptStructuralExample: JSON.stringify({
      type: 'weighted_blend',
      calculationMethod: {
        type: 'weighted_blend',
        inputs: [
          { metric: 'metric_a', weight: 0.6 },
          { metric: 'metric_b', weight: 0.3 },
          { metric: 'metric_c', weight: 0.1 },
        ],
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'weighted_blend',
        inputs: [
          { input: { source: 'metric', sourceSpec: { field: 'metric_a' } }, weight: 0.6 },
          { input: { source: 'metric', sourceSpec: { field: 'metric_b' } }, weight: 0.3 },
          { input: { source: 'metric', sourceSpec: { field: 'metric_c' } }, weight: 0.1 },
        ],
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when a single output is a weighted combination of multiple input metrics, with weights specified in the plan. If only one input drives the output, use `scalar_multiply`. Weights must sum to 1.0.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      const inputs = emission.inputs;
      if (!Array.isArray(inputs) || inputs.length === 0) {
        violations.push('weighted_blend.inputs must be a non-empty array');
        return { valid: false, violations };
      }
      // Decision 122 — Decimal arithmetic for weight summation; floating-point
      // sum-to-1.0 tolerance enforced via Decimal comparison rather than
      // native float arithmetic.
      let sum = new Decimal(0);
      for (let i = 0; i < (inputs as unknown[]).length; i++) {
        const item = (inputs as unknown[])[i] as Record<string, unknown>;
        if (!isFiniteNum(item.weight)) {
          violations.push(`weighted_blend.inputs[${i}].weight must be a finite number; got ${typeof item.weight}`);
          continue;
        }
        sum = sum.plus(new Decimal(item.weight as number));
      }
      const lowerBound = new Decimal('0.999');
      const upperBound = new Decimal('1.001');
      if (sum.lessThan(lowerBound) || sum.greaterThan(upperBound)) {
        violations.push(`weighted_blend.inputs[].weight sum ${sum.toFixed(4)} outside [0.999, 1.001]`);
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'temporal_window',
    kind: 'operation',
    description: 'Rolling N-period aggregation over historical values.',
    allowedKeys: ['operation', 'input', 'windowSize', 'aggregation', 'includeCurrentPeriod'],
    promptDescription:
      "A rolling N-period aggregation over historical values of a metric. Specify window size (number of periods), aggregation function, and whether the current period is included. Used when the plan computes a metric as a moving window over historical data (e.g., trailing-3-period average).",
    promptStructuralExample: JSON.stringify({
      type: 'temporal_window',
      calculationMethod: {
        type: 'temporal_window',
        metric: 'input_metric_name',
        windowSize: 3,
        aggregation: 'average',
        includeCurrentPeriod: true,
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'temporal_window',
        input: { source: 'metric', sourceSpec: { field: 'input_metric_name' } },
        windowSize: 3,
        aggregation: 'average',
        includeCurrentPeriod: true,
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the plan describes a metric as a rolling window over historical periods (trailing average, cumulative sum over N periods). If the metric is computed only over the current period, use `scalar_multiply` or `aggregate` instead.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      const ws = emission.windowSize;
      if (!isFiniteNum(ws) || !Number.isInteger(ws) || (ws as number) < 1) {
        violations.push(`temporal_window.windowSize must be a positive integer; got ${String(ws)}`);
      }
      if (emission.aggregation !== undefined) {
        const ag = String(emission.aggregation);
        if (!(FOUNDATIONAL_AGGREGATIONS as readonly string[]).includes(ag)) {
          violations.push(`temporal_window.aggregation must be one of [${FOUNDATIONAL_AGGREGATIONS.join(', ')}]; got '${ag}'`);
        }
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'linear_function',
    kind: 'operation',
    description: 'Linear function — y = slope * x + intercept.',
    allowedKeys: ['operation', 'input', 'slope', 'intercept', 'modifiers'],
    promptDescription:
      "A linear function: output = slope × input + intercept. The slope is the per-unit rate, the intercept is a fixed base amount independent of the input. Used when the plan describes a fixed base draw plus a per-unit commission.",
    promptStructuralExample: JSON.stringify({
      type: 'linear_function',
      calculationMethod: {
        type: 'linear_function',
        metric: 'input_metric_name',
        metricLabel: 'human-readable label of the input',
        slope: 0.06,
        intercept: 200,
        modifiers: [{ modifier: 'cap', maxValue: 5000 }],
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'linear_function',
        input: { source: 'metric', sourceSpec: { field: 'input_metric_name' } },
        slope: 0.06,
        intercept: 200,
        modifiers: [{ modifier: 'cap', maxValue: 5000 }],
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the plan combines a fixed base draw (intercept) with a per-unit rate (slope). If there is only a per-unit rate with no base draw, use `scalar_multiply`. If the rate changes at attainment thresholds, use `piecewise_linear`. Do NOT use `linear_function` with intercept = 0 — use `scalar_multiply` instead.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      if (!isFiniteNum(emission.slope)) {
        violations.push(`linear_function.slope must be a finite number; got ${String(emission.slope)}`);
      }
      if (!isFiniteNum(emission.intercept)) {
        violations.push(`linear_function.intercept must be a finite number; got ${String(emission.intercept)}`);
      }
      if (emission.modifiers !== undefined) {
        if (!Array.isArray(emission.modifiers)) {
          violations.push('linear_function.modifiers must be an array if present');
        } else {
          const mods = emission.modifiers as Array<Record<string, unknown>>;
          for (let i = 0; i < mods.length; i++) {
            const m = mods[i];
            if (typeof m.modifier !== 'string') {
              violations.push(`linear_function.modifiers[${i}].modifier must be a string`);
              continue;
            }
            if (!(LINEAR_FUNCTION_MODIFIERS as readonly string[]).includes(m.modifier as string)) {
              violations.push(`linear_function.modifiers[${i}].modifier must be one of [${LINEAR_FUNCTION_MODIFIERS.join(', ')}]; got '${m.modifier}'`);
              continue;
            }
            if (m.modifier === 'cap' && !isFiniteNum(m.maxValue)) {
              violations.push(`linear_function.modifiers[${i}] modifier='cap' requires finite maxValue`);
            }
            if (m.modifier === 'floor' && !isFiniteNum(m.minValue)) {
              violations.push(`linear_function.modifiers[${i}] modifier='floor' requires finite minValue`);
            }
            if (m.modifier === 'multiplier' && !isFiniteNum(m.factor)) {
              violations.push(`linear_function.modifiers[${i}] modifier='multiplier' requires finite factor`);
            }
          }
        }
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'piecewise_linear',
    kind: 'operation',
    description: 'Piecewise linear — attainment ratio selects rate segment, applied to base input.',
    allowedKeys: ['operation', 'ratioInput', 'baseInput', 'segments', 'targetValue'],
    promptDescription:
      "An accelerator curve where the rate changes at attainment breakpoints. A ratio input (typically actual/target) selects which segment applies, and the segment's rate is multiplied against a base input (typically the actual metric). Used when the plan describes a rate that escalates as attainment exceeds quota.",
    promptStructuralExample: JSON.stringify({
      type: 'piecewise_linear',
      calculationMethod: {
        type: 'piecewise_linear',
        ratioMetric: 'ratio_metric_name',
        ratioMetricLabel: 'human-readable label of the ratio (e.g., quota attainment)',
        baseMetric: 'base_metric_name',
        baseMetricLabel: 'human-readable label of the base amount',
        segments: [
          { min: 0, max: 1.0, rate: 0.03, label: 'below quota' },
          { min: 1.0, max: 1.2, rate: 0.05, label: 'at/above quota' },
          { min: 1.2, max: null, rate: 0.08, label: 'accelerator' },
        ],
      },
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'piecewise_linear',
        ratioInput: { source: 'ratio', sourceSpec: { numerator: 'actual_metric', denominator: 'target_metric' } },
        baseInput: { source: 'metric', sourceSpec: { field: 'base_metric_name' } },
        segments: [
          { min: 0, max: 1.0, rate: 0.03 },
          { min: 1.0, max: 1.2, rate: 0.05 },
          { min: 1.2, max: null, rate: 0.08 },
        ],
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when the plan describes RATES that change based on quota attainment (actual / target), and the selected rate applies to a base amount (typically the actual metric). The structural signal: there is a DENOMINATOR (quota / target) creating a RATIO, the rate applies to a BASE AMOUNT, and the rate increases as attainment crosses thresholds. For continuous functions where rate does NOT change with attainment (a single fixed slope across all values), use `linear_function` instead. For tier-based fixed-dollar payouts, use `bounded_lookup_1d` instead.",
    promptEmissionPattern:
      "Emit as the component's `type` field. The structural shape above defines the component's `calculationMethod` payload.",
    validate: (emission) => {
      const violations: string[] = [];
      const segs = emission.segments;
      if (!Array.isArray(segs) || (segs as unknown[]).length === 0) {
        violations.push('piecewise_linear.segments must be non-empty');
        return { valid: false, violations };
      }
      const segments = segs as Array<Record<string, unknown>>;
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (!isFiniteNum(s.rate)) {
          violations.push(`piecewise_linear.segments[${i}].rate must be a finite number`);
        }
        if (!isFiniteNum(s.min)) {
          violations.push(`piecewise_linear.segments[${i}].min must be a finite number`);
        }
        if (s.max !== null && !isFiniteNum(s.max)) {
          violations.push(`piecewise_linear.segments[${i}].max must be a finite number or null (unbounded)`);
        }
      }
      for (let i = 0; i < segments.length - 1; i++) {
        const a = segments[i], b = segments[i + 1];
        if (isFiniteNum(a.max) && isFiniteNum(b.min) && a.max !== b.min) {
          violations.push(`piecewise_linear.segments not contiguous at i=${i}: segments[${i}].max=${a.max} != segments[${i + 1}].min=${b.min}`);
        }
      }
      return { valid: violations.length === 0, violations };
    },
  },
  {
    id: 'scope_aggregate',
    kind: 'source_only',
    description:
      'Hierarchical aggregate (district / region) used as an IntentSource. ' +
      'Not a top-level operation in the current substrate; emissions as a top-level operation ' +
      'are surfaced as structured failure by the executor.',
    allowedKeys: ['scope', 'field', 'aggregation'],
    promptDescription:
      "A hierarchical aggregate used as an input source — sums (or otherwise aggregates) a metric across all entities within a hierarchical scope (district, region, etc.). Used when a manager's payout depends on a team-level or territory-level total. scope_aggregate is a source for other operations (typically scalar_multiply); it is not a top-level operation.",
    promptStructuralExample: JSON.stringify({
      scope: 'district',
      field: 'metric_name',
      aggregation: 'sum',
    }, null, 2),
    promptIntentExample: JSON.stringify({
      calculationIntent: {
        operation: 'scalar_multiply',
        input: {
          source: 'scope_aggregate',
          sourceSpec: { scope: 'district', field: 'metric_name', aggregation: 'sum' },
        },
        rate: 0.015,
      },
    }, null, 2),
    promptSelectionGuidance:
      "Use when a manager or aggregator earns a percentage of a team / district / region total, NOT individual contribution. Wrap `scope_aggregate` as the `input.source` of a `scalar_multiply` (or other operation) — `scope_aggregate` is not a top-level operation. If the structure aggregates without further multiplication, use the `aggregate` operation with `scope_aggregate` as its source.",
    promptEmissionPattern:
      "Emit as the source value within an outer operation's `input` field — `input.source = \"scope_aggregate\"`, with the structural shape above defining the `input.sourceSpec` payload. Cannot appear as a component's top-level `type`.",
    validate: (emission) => {
      const violations: string[] = [];
      if (typeof emission.scope !== 'string' || (emission.scope as string).length === 0) {
        violations.push(`scope_aggregate.scope must be a non-empty string; got ${String(emission.scope)}`);
      }
      if (typeof emission.field !== 'string' || (emission.field as string).length === 0) {
        violations.push(`scope_aggregate.field must be a non-empty string; got ${String(emission.field)}`);
      }
      if (emission.aggregation !== undefined) {
        const ag = String(emission.aggregation);
        if (!(FOUNDATIONAL_AGGREGATIONS as readonly string[]).includes(ag)) {
          violations.push(`scope_aggregate.aggregation must be one of [${FOUNDATIONAL_AGGREGATIONS.join(', ')}]; got '${ag}'`);
        }
      } else {
        violations.push('scope_aggregate.aggregation required');
      }
      return { valid: violations.length === 0, violations };
    },
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
```

## Key changes vs HEAD `61496dde`

- **Decimal import** added (`from './decimal-precision'`), per Decision 122 + Polish 1.
- **3 sub-vocabulary `as const` arrays** declared module-private (Polish 2): `FOUNDATIONAL_AGGREGATIONS`, `LINEAR_FUNCTION_MODIFIERS`, `RATIO_ZERO_DENOMINATOR_BEHAVIORS`.
- **`ValidationResult` interface + `InvalidPrimitiveShapeError` class** added (revisions 6.1, 6.3 — co-located).
- **`isFiniteNum` helper** added (private to module).
- **`PrimitiveEntry` interface** extended with 5 new prompt-facing fields + `validate` field. Existing 4 fields unchanged.
- **REGISTRY array** retains the original 12 entries in the same order, each entry now carrying all 9 fields populated. `scope_aggregate.promptStructuralExample` shows its own source-spec shape (Revision 1.A); `bounded_lookup_2d` simplified to 2×2 with parity row/column labels (Revision 4); `bounded_lookup_2d.promptIntentExample` adds `inputs.row` (Revision 2); `linear_function.promptStructuralExample` adds `modifiers` (Revision 3); `piecewise_linear.promptSelectionGuidance` adds `linear_function` cross-reference (Revision 5); `weighted_blend.validate` uses Decimal arithmetic (Polish 1); `temporal_window`/`scope_aggregate`/`linear_function`/`ratio` validate bodies reference sub-vocabulary constants (Polish 2).
- **Public API functions** unchanged: `isRegisteredPrimitive`, `lookupPrimitive`, `getRegistry`, `getOperationPrimitives`, `registerDomainPrimitive` stub.

Final line count target: ≈ 730 lines (vs 228 at HEAD; ~3.2× expansion driven by per-primitive populated content).
