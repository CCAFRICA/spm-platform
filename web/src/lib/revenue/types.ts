/**
 * Revenue agent — shared contracts (OB-257).
 *
 * Decision 158 split: recognition (HF-337 recognize()) resolves WHICH tenant fields fulfill each
 * semantic role; everything in this file is role-keyed structural vocabulary. Zero tenant field
 * names, zero domain-language literals (Korean Test / AP-25).
 *
 * Role resolution sources:
 *  - measure / location / category: recognized from comprehension_artifacts via recognize()
 *    (self-priming surface_bindings cache; one temp-0 LLM call per tenant per surface on cold miss).
 *  - entity / temporal: resolved STRUCTURALLY by the import pipeline itself — committed_data.entity_id
 *    (import-time entity resolution) and committed_data.period_id ?? source_date ∈ [periods.start_date,
 *    periods.end_date]. No recognition pass is run for them; they are convergence outputs already.
 */

// ── Entitlement ────────────────────────────────────────────────────────────────

export const REVENUE_FEATURE_KEY = 'revenue_enabled';

// ── Recognition surfaces ───────────────────────────────────────────────────────

export interface RevenueSurfaceSpec {
  surface: string;
  purpose: string;
  required: boolean;
}

/**
 * The measure purpose text is byte-identical to the Financial agent's proven revenue purpose
 * (api/financial/data/route.ts network_pulse MEASURES[0]) — empirically resolved for BOTH proof
 * tenants (Sabor: total@0.95 via live surface_bindings; BCL: recognized @0.82 in the OB-257 P0
 * probe, scripts/ob257-p0-h-critic-halt2-probe.ts). Revenue owns its own surface ids so Finance
 * cache entries and Revenue cache entries never alias (ADR Decision 1).
 */
export const REVENUE_SURFACES: Record<RevenueRoleKey, RevenueSurfaceSpec> = {
  measure: {
    surface: 'revenue.measure',
    purpose:
      'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale',
    required: true,
  },
  location: {
    surface: 'revenue.dimension.location',
    purpose:
      'the geographic or organizational location, branch, site, or territory where each record was produced or to which its producer is assigned',
    required: false,
  },
  category: {
    surface: 'revenue.dimension.category',
    purpose:
      'the product, item, service, or offering category that classifies what was sold or delivered in each record',
    required: false,
  },
};

export type RevenueRoleKey = 'measure' | 'location' | 'category';

export type ResolvedRevenueRole =
  | { status: 'resolved'; field_name: string; display_label: string | null; confidence: number }
  | { status: 'unresolved'; reason: string };

export type RevenueRoles = Record<RevenueRoleKey, ResolvedRevenueRole>;

/** C2 structured absence — a named role with a named reason; never silent zeros. */
export interface RoleAbsence {
  role: RevenueRoleKey;
  reason: string;
}

// ── summary_rollups namespaces (writer-owned data_type values) ────────────────

export const REVENUE_ROLLUP_TYPES = {
  /** one row per period: metrics { primary, row_count, entity_count } */
  period: 'revenue_period',
  /** one row per entity × period: metrics { primary, row_count } */
  entityPeriod: 'revenue_entity_period',
  /** one row per dimension_role × dimension_member × period: metrics { primary, row_count } */
  dimensionPeriod: 'revenue_dimension_period',
  /** one row per tenant: metrics = RevenueMetaMetrics (roles, attribution, version) */
  meta: 'revenue_meta',
} as const;

export const REVENUE_MATERIALIZER_VERSION = 1;

export interface RevenueMetaMetrics {
  roles: RevenueRoles;
  attribution: {
    rows_scanned: number;
    rows_with_measure: number;
    rows_attributed_to_period: number;
    rows_unattributed: number;
  };
  /** Which committed_data row class(es) carried numeric values under the measure field: a single
   *  {data_type, rows} record when unambiguous; the full per-class count list when the measure
   *  spans multiple classes (fail-loud — no rollups are written from ambiguous provenance).
   *  data_type is open vocabulary — grouped by equality only, never matched against a list. */
  measure_provenance?: { data_type: string; rows: number } | Array<{ data_type: string; rows: number }>;
  materializer_version: number;
  [key: string]: unknown; // jsonb round-trip tolerance
}

export interface MaterializeResult {
  ok: boolean;
  roles: RevenueRoles;
  rowsScanned: number;
  rollupsWritten: { period: number; entityPeriod: number; dimensionPeriod: number };
  durationMs: number;
  noop: boolean; // true when a re-run produced byte-identical rollups (idempotency evidence)
  error?: string;
}

// ── Serving API contract — POST /api/revenue/data ─────────────────────────────

export type RevenueMode =
  | 'pulse'
  | 'bridge'
  | 'mix'
  | 'sellers'
  | 'concentration'
  | 'yield'
  | 'patterns'
  | 'geography';

export interface RevenueRequest {
  mode: RevenueMode;
  /** The switcher-effective tenant, sourced client-side from useTenant().currentTenant (HF-374).
   *  Platform admins REQUIRE it (resolveCallerTenant has no cookie fallback); regular users'
   *  value is validated as same-tenant server-side. */
  tenantId?: string;
  /** optional explicit period pair for bridge/mix drill; defaults to latest vs prior */
  periodId?: string;
  dimensionRole?: Exclude<RevenueRoleKey, 'measure'>;
  /** SR-39 fail-closed entity visibility: undefined = caller sees all; an EXPLICIT array (even
   *  empty) restricts every entity-derivable result to these entities — never tenant aggregates. */
  scopeEntityIds?: string[];
}

export interface RevenuePeriodPoint {
  periodId: string;
  label: string;
  canonicalKey: string | null;
  startDate: string;
  endDate: string;
  status: string;
  primary: number;
  rowCount: number;
  entityCount: number;
}

export interface RevenueEntityPoint {
  entityId: string;
  displayName: string;
  externalId: string | null;
  primary: number; // current period
  prior: number | null;
  byPeriod: Record<string, number>; // periodId -> primary
  rank: number;
  priorRank: number | null;
}

export interface RevenueDimensionPoint {
  member: string;
  primary: number;
  prior: number | null;
  byPeriod: Record<string, number>;
}

/** Every mode response carries the resolved-role context and explicit absences. */
export interface RevenueEnvelope {
  roles: RevenueRoles;
  absences: RoleAbsence[];
  periods: RevenuePeriodPoint[]; // ascending by startDate; always present when materialized
  currentPeriodId: string | null;
  priorPeriodId: string | null;
  /** set when the tenant has never been materialized (activation missing) — surfaces render absence */
  notMaterialized?: { reason: string };
}

export interface PulseResponse extends RevenueEnvelope {
  mode: 'pulse';
  /** deterministic pace: current-period primary vs trailing mean of prior periods (labeled arithmetic) */
  pace: { current: number; trailingMean: number | null; deltaPct: number | null; trailingCount: number };
}

export interface BridgeResponse extends RevenueEnvelope {
  mode: 'bridge';
  dimensionRole: Exclude<RevenueRoleKey, 'measure'> | 'entity';
  current: { periodId: string; total: number } | null;
  prior: { periodId: string; total: number } | null;
  deltas: Array<{ key: string; label: string; current: number; prior: number; delta: number }>;
}

export interface MixResponse extends RevenueEnvelope {
  mode: 'mix';
  dimensionRole: Exclude<RevenueRoleKey, 'measure'> | 'entity';
  composition: Array<{ periodId: string; shares: Array<{ key: string; label: string; value: number; share: number }> }>;
  shifts: Array<{ key: string; label: string; currentShare: number; priorShare: number; shiftPts: number }>; // ranked by |shiftPts|
}

export interface SellersResponse extends RevenueEnvelope {
  mode: 'sellers';
  entities: RevenueEntityPoint[]; // ranked by current primary desc
  distribution: { cumulativeShare: Array<{ rank: number; share: number }> }; // Lorenz/Pareto points
}

export interface ConcentrationResponse extends RevenueEnvelope {
  mode: 'concentration';
  topShares: Array<{ n: number; share: number; priorShare: number | null }>; // e.g. top 1/5/10/20%
  decliners: Array<{ entityId: string; displayName: string; byPeriod: Record<string, number>; trendPct: number }>;
}

export interface YieldResponse extends RevenueEnvelope {
  mode: 'yield';
  periodYield: Array<{ periodId: string; revenue: number; payout: number; yield: number | null }>;
  entityYield: Array<{
    entityId: string; displayName: string; revenue: number; payout: number; yield: number | null;
  }>;
  /** cost-side decomposition: payout by component name for the current period (revenue attribution per
   *  component does not exist in the data — rendered honestly as cost composition, ADR minor decisions) */
  componentPayouts: Array<{ name: string; payout: number }>;
}

export interface PatternsResponse extends RevenueEnvelope {
  mode: 'patterns';
  series: Array<{ periodId: string; label: string; primary: number }>;
}

export interface GeographyResponse extends RevenueEnvelope {
  mode: 'geography';
  members: RevenueDimensionPoint[];
}

export type RevenueResponse =
  | PulseResponse | BridgeResponse | MixResponse | SellersResponse
  | ConcentrationResponse | YieldResponse | PatternsResponse | GeographyResponse;

// ── Insights (O4) ──────────────────────────────────────────────────────────────

export const REVENUE_INSIGHT_SOURCE = 'revenue-insight';

export type RevenueInsightKind =
  | 'momentum_shift'
  | 'mix_shift'
  | 'concentration_alert'
  | 'incentive_yield_outlier';

export interface RevenueInsightResult {
  written: number;
  byKind: Record<RevenueInsightKind, number>;
  error?: string;
}
