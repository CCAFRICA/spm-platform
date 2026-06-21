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
