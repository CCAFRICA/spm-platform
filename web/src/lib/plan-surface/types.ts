/**
 * OB-228 — Living Plan Surface canonical types (DS-029 §4 data contract).
 *
 * Every field derives from a live substrate column (verified in
 * docs/diagnostics/OB-228_PHASE1_DIAGNOSTIC.md). The canvas renders whatever
 * `rule_sets.components` contains — no hardcoded component-type list, no field
 * dictionary (Korean Test, D154). `normalizeComponents` carries every component
 * and every config field through; unknowns are tagged (isKnownType=false), never
 * dropped, and flow to the GenericComponentRenderer.
 *
 * MIR reality (Phase 1): componentType is `prime_dag` for all components; the
 * logic lives in `calculationIntent` (a PrimeNode tree) and a richer high-level
 * view lives in `metadata.compositional_intent.structure`. input_bindings is
 * empty — bindings are implicit in the prime-DAG `field` references.
 */

/** The set of componentTypes that have a bespoke renderer. Membership sets
 *  CanonicalComponent.isKnownType; it NEVER gates inclusion (Korean Test). Any
 *  type not here renders via GenericComponentRenderer (the mandatory fallback).
 *  The platform's real componentType is prime_dag (the prime-DAG engine); the
 *  legacy lookup-type names are forbidden by the HF-195 build gate, so prime_dag
 *  is the sole bespoke entry and it dispatches internally on structural shape. */
export const KNOWN_RENDERER_TYPES = new Set<string>([
  'prime_dag',   // PrimeDagRenderer (dispatches on structural shape: band/tier, conditional, rate, matrix)
  'percentage',  // RateRenderer (a non-legacy flat-rate type, if a tenant emits it)
]);

// ───────────────────────── Persona seam (Concept ⑧) ─────────────────────────

export interface PersonaScope {
  /** 'admin' | 'manager' | 'rep' — derived from role + capabilities. Drives the
   *  renderer dispatch. Only AdminRenderer exists this OB (OB-229 adds the rest). */
  persona: string;
  tenantId: string | null;
  /** profile_scope.visible_rule_set_ids (empty + unrestricted ⇒ admin sees all). */
  visibleRuleSetIds: string[];
  visibleEntityIds: string[];
  visiblePeriodIds: string[];
  /** admin/platform identity OR holds icm.configure_plans. */
  isAdmin: boolean;
  /** true when the persona sees all plans (admin with no/empty profile_scope row). */
  unrestricted: boolean;
  /** can commit plan edits (icm.configure_plans). */
  canEdit: boolean;
}

// ───────────────────────── Plan structure (Concept ①) ─────────────────────────

export interface ComponentBinding {
  /** The primary numeric measure column the distribution buckets, or null. */
  column: string | null;
  /** Why this column bound (prime-dag-field-reference | convergence-binding | …). */
  matchReason?: string;
  /** Token-overlap score (convergence-binding tenants only). */
  tokenOverlap?: number;
  /** All implicit field references discovered in the prime-DAG. */
  fieldRefs: { field: string; via: string }[];
}

export interface CanonicalComponent {
  id: string;
  name: string;
  componentType: string;
  /** The raw typed config, preserved whole. Carries the typed-dialect configs
   *  (tier/matrix/percentage/conditional) when present, the MIR compositional
   *  intent, and `raw` (the entire component) — the Carry-Everything guarantee. */
  config: {
    tierConfig?: unknown;
    matrixConfig?: unknown;
    percentageConfig?: unknown;
    conditionalConfig?: unknown;
    compositionalIntent?: unknown;
    raw: unknown;
  };
  binding: ComponentBinding;
  /** Per-component confidence if present; else inherits plan-level (set by caller). */
  confidence?: number;
  calculationIntent?: unknown;
  /** Membership in KNOWN_RENDERER_TYPES — false ⇒ GenericComponentRenderer. */
  isKnownType: boolean;
  description?: string | null;
  measurementLevel?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PlanVariant {
  variantId: string;
  variantName: string;
  components: CanonicalComponent[];
  description?: string | null;
  eligibilityCriteria?: unknown;
}

export interface PlanStructure {
  id: string;
  name: string;
  version: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  variants: PlanVariant[];
  /** Plan-level confidence (metadata.aiConfidence) — used when components lack their own. */
  confidence?: number;
  metadata?: Record<string, unknown>;
  /** Total component count across variants (for the rail glyph). */
  componentCount: number;
  /** Set true when normalization could not find a recognizable variant/component
   *  shape — the plan still renders (generic), but the surface flags it. */
  shapeUnrecognized?: boolean;
}

// ───────────────────────── Distribution overlay (Concept ① / ②) ─────────────────────────

export interface DistributionBucket {
  label: string;
  rangeMin?: number;
  rangeMax?: number;
  entityCount: number;
}

export interface ComponentDistribution {
  componentId: string;
  periodId: string;
  buckets: DistributionBucket[];
  totalEntities: number;
  /** false when the binding did not resolve against committed_data (HALT-2):
   *  buckets is empty and `note` explains — NEVER fabricated. */
  resolved: boolean;
  measureColumn: string | null;
  /** Aggregation grain: 'entity' (rolled up by scope boundary) or 'row'. */
  grain: 'entity' | 'row';
  note?: string;
}

// ───────────────────────── Baseline (consequence, Concept ②) ─────────────────────────

export interface BaselineOutcome {
  entityId: string;
  totalPayout: number;
  componentBreakdown: Record<string, number>;
}

// ───────────────────────── Structural component view (renderer + distribution core) ─────────────────────────

/** A single readable step in a component's logic, derived structurally from the
 *  prime-DAG / compositional_intent (Korean Test: structure detection, no value
 *  or column-name literals hardcoded). */
export interface ComponentViewStep {
  kind: 'rate' | 'band' | 'accelerator' | 'rollup' | 'filter' | 'count' | 'condition' | 'reversal' | 'arithmetic' | 'reference' | 'constant' | 'unknown';
  label: string;
  detail?: string;
  /** For band/tier ladders: the rows of the table. */
  bands?: { lowerLabel: string; output: number | string; rangeMin?: number; rangeMax?: number }[];
  /** The field this step reads, if any. */
  field?: string;
  /** A scalar value (rate, multiplier, threshold). */
  value?: number;
}

export interface ComponentView {
  /** The primary structural shape: 'banded_lookup' | 'arithmetic' | 'conditional'
   *  | 'filtered_count' | 'reversal' | 'prime_dag' | 'unknown'. Used only for
   *  display grouping — dispatch is on componentType (Korean Test). */
  shape: string;
  /** A one-line human summary derived structurally. */
  summary: string;
  steps: ComponentViewStep[];
  /** Distribution inputs (extracted structurally from the DAG). */
  measureField: string | null;
  measureVia: string | null;
  /** Per-entity rollup key (a scope boundary), if the component aggregates per entity. */
  scopeBoundary: string | null;
  /** Tier/threshold boundaries (for bucketing + tier-table render). */
  breaks: number[] | null;
  bandReferenceField: string | null;
  bandOutputs: number[] | null;
  thresholds: { field: string | null; op: string; value: number }[];
  isClawback: boolean;
  fieldRefs: { field: string; via: string }[];
}
