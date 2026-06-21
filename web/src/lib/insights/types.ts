/**
 * OB-227 — Intelligence data-layer types. Cross-period aggregation / distribution / trajectory,
 * sitting ABOVE OB-224's per-entity drill-through. Every field derives from a live substrate row;
 * no hardcoded names (Korean Test). Component shape is HALT-2-guarded upstream (getEntityResults
 * normalizes Array vs Object component_breakdown).
 */

export interface PeriodSummary {
  period_id: string;
  label: string;
  start_date: string;
  end_date: string;
  total_payout: number;
  entity_count: number;
  avg_payout: number;
  min_payout: number;
  max_payout: number;
  /** lowest lifecycle state across the period's outcomes (PREVIEW/APPROVED/…), or null */
  lifecycle_state: string | null;
}

export interface DistributionBin {
  range_start: number;
  range_end: number;
  count: number;
  percentage: number;
}

export interface DistributionResult {
  bins: DistributionBin[];
  mean: number;
  median: number;
  std_dev: number;
  total_entities: number;
  zero_payout_count: number;
  min: number;
  max: number;
}

export interface ComponentTotal {
  component_name: string;
  total_amount: number;
  entity_count: number;
  percentage_of_total: number;
}

export interface TrajectoryPoint {
  period_id: string;
  label: string;
  start_date: string;
  total_payout: number;
}

export interface EntityTrajectory {
  entity_id: string;
  display_name: string;
  periods: TrajectoryPoint[];
  /** latest vs prior period ($); null if <2 calculated periods */
  delta: number | null;
  /** avg per-period delta over the last 3 points ($/period); null if <3 */
  velocity: number | null;
  direction: 'up' | 'down' | 'stable' | null;
}

export interface PopulationTrendPoint {
  period_id: string;
  label: string;
  start_date: string;
  total: number;
  avg: number;
  entity_count: number;
}

export interface EntityTableRow {
  entity_id: string;
  display_name: string;
  variant: string | null;
  total_payout: number;
  top_component: { name: string; amount: number } | null;
  delta_prior: number | null;
  component_count: number;
}

export interface EntityTableResult {
  rows: EntityTableRow[];
  total_count: number;
  page: number;
  page_size: number;
}

export interface EntityTableOptions {
  search?: string;
  sortBy?: 'display_name' | 'total_payout' | 'delta_prior' | 'component_count';
  sortOrder?: 'asc' | 'desc';
  variant?: string;
  /** restrict to entities whose top component matches (distribution/component drill filters) */
  componentName?: string;
  page?: number;
  pageSize?: number;
}

export interface TenantOnboardingState {
  has_plan: boolean;
  plan_name: string | null;
  has_data: boolean;
  import_count: number;
  has_periods: boolean;
  period_count: number;
  has_calculations: boolean;
  calculation_count: number;
  has_results: boolean;
  latest_lifecycle_state: string | null;
}
