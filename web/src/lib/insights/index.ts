/**
 * OB-227 — Insights intelligence data layer. Cross-period aggregation / distribution / trajectory /
 * onboarding, built ABOVE OB-224's per-entity drill-through (AP-17: reuses getEntityResults /
 * getPeriodsWithResults, never duplicates them). Deterministic; no AI calls (Decision 158).
 */
export * from './types';
export { getCalculatedPeriods, ALL_INSIGHTS_SCOPE } from './periods';
export { getPayoutDistribution, getComponentTotals } from './distribution';
export { getEntityTrajectory, getPopulationTrend } from './trajectory';
export { getEntityTableData } from './entity-table';
export { getTenantOnboardingState } from './tenant-state';
export { discoverDimensions, aggregateByDimension, COMPONENT_DIMENSION_KEY } from './dimension-discovery';
export type { DiscoveredDimension, DimensionSlice } from './dimension-discovery';
// OB-234 T1-B — End-State A data layer additions (the single clean read-path; zero committed_data).
export { getEntityResults } from '@/lib/drill-through';
export { getPeriodTotal, getBatchValidity, getDimensions } from './intelligence-data';
export type { ValidityVerdict, ValiditySeverity, EnrichedDimension } from './intelligence-data';
