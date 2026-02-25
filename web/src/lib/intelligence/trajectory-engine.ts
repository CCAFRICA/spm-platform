/**
 * Trajectory Engine — Rep Performance Trajectory
 *
 * OB-98 Phase 5: Pure deterministic math. For a given entity's calculation results
 * and rule set, computes the trajectory to the next payout tier for each component.
 *
 * Input: calculation results (components array) + rule set configuration
 * Output: TrajectoryCard[] with current position, gap, and incremental value
 *
 * Korean Test: Zero hardcoded component names, tier names, or currencies.
 * Reads all structure from rule_set component JSON — structural parsing only.
 */

import type {
  PlanComponent,
  AdditiveLookupConfig,
  MatrixConfig,
  TierConfig,
  Band,
  Tier,
  WeightedKPIConfig,
} from '@/types/compensation-plan';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface TrajectoryCard {
  componentName: string;
  componentType: string;
  currentAttainment: number;       // 0.87 = 87%
  currentTier: string;             // "Tier 2" or band label
  nextTierThreshold: number;       // 0.95 = 95%
  nextTierName: string;            // "Tier 3" or next band label
  distanceToNextTier: number;      // 0.08 = 8% more needed
  currentPayout: number;           // payout at current position
  nextTierPayout: number;          // payout at next tier
  incrementalValue: number;        // delta between next and current
  progressPercent: number;         // 0-100 visual progress toward next tier
}

export interface RepTrajectory {
  entityId: string;
  entityName: string;
  totalPayout: number;
  trajectories: TrajectoryCard[];
  bestOpportunity: TrajectoryCard | null;
  totalPotential: number;          // sum of all incremental values
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Find which tier an attainment value falls in.
 * Returns the tier index, or -1 if below all tiers.
 */
function findTierIndex(tiers: Tier[], attainment: number): number {
  for (let i = 0; i < tiers.length; i++) {
    if (attainment >= tiers[i].min && attainment < tiers[i].max) {
      return i;
    }
  }
  // Check if at or above the last tier
  if (tiers.length > 0 && attainment >= tiers[tiers.length - 1].min) {
    return tiers.length - 1;
  }
  return -1;
}

/**
 * Find which band an attainment value falls in.
 */
function findBandIndex(bands: Band[], value: number): number {
  for (let i = 0; i < bands.length; i++) {
    if (value >= bands[i].min && value < bands[i].max) {
      return i;
    }
  }
  if (bands.length > 0 && value >= bands[bands.length - 1].min) {
    return bands.length - 1;
  }
  return -1;
}

// ──────────────────────────────────────────────
// Trajectory Computation per Component Type
// ──────────────────────────────────────────────

function computeTierTrajectory(
  componentName: string,
  config: TierConfig,
  currentAttainment: number,
  currentPayout: number
): TrajectoryCard | null {
  const tiers = config.tiers;
  if (!tiers || tiers.length === 0) return null;

  // Sort tiers by min ascending
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  const currentIdx = findTierIndex(sorted, currentAttainment);

  // If at the highest tier, no trajectory to show
  if (currentIdx >= sorted.length - 1) return null;

  const current = currentIdx >= 0 ? sorted[currentIdx] : null;
  const next = sorted[currentIdx + 1];

  if (!next) return null;

  const distance = next.min - currentAttainment;
  if (distance <= 0) return null;

  // Progress within current band toward next tier
  const currentMin = current ? current.min : 0;
  const bandWidth = next.min - currentMin;
  const progress = bandWidth > 0 ? ((currentAttainment - currentMin) / bandWidth) * 100 : 0;

  return {
    componentName,
    componentType: 'tier_lookup',
    currentAttainment,
    currentTier: current?.label || 'Below minimum',
    nextTierThreshold: next.min,
    nextTierName: next.label,
    distanceToNextTier: distance,
    currentPayout,
    nextTierPayout: next.value,
    incrementalValue: next.value - currentPayout,
    progressPercent: Math.min(100, Math.max(0, progress)),
  };
}

function computeMatrixTrajectory(
  componentName: string,
  config: MatrixConfig,
  currentAttainment: number,
  currentPayout: number
): TrajectoryCard | null {
  const rowBands = config.rowBands;
  const values = config.values;
  if (!rowBands || rowBands.length === 0 || !values || values.length === 0) return null;

  // Sort row bands by min ascending
  const sorted = [...rowBands].sort((a, b) => a.min - b.min);
  const currentRowIdx = findBandIndex(sorted, currentAttainment);

  // If at the highest band, no trajectory
  if (currentRowIdx >= sorted.length - 1) return null;

  const current = currentRowIdx >= 0 ? sorted[currentRowIdx] : null;
  const nextBand = sorted[currentRowIdx + 1];

  if (!nextBand) return null;

  const distance = nextBand.min - currentAttainment;
  if (distance <= 0) return null;

  // For the matrix, the payout at next tier depends on column position too.
  // Use the middle column as a representative (or column 0 if only one).
  const colIdx = Math.min(
    Math.floor(config.columnBands.length / 2),
    (values[0]?.length ?? 1) - 1
  );
  const nextRowIdx = currentRowIdx + 1;
  const nextPayout = values[nextRowIdx]?.[colIdx] ?? 0;

  // Progress
  const currentMin = current ? current.min : 0;
  const bandWidth = nextBand.min - currentMin;
  const progress = bandWidth > 0 ? ((currentAttainment - currentMin) / bandWidth) * 100 : 0;

  return {
    componentName,
    componentType: 'matrix_lookup',
    currentAttainment,
    currentTier: current?.label || 'Below minimum',
    nextTierThreshold: nextBand.min,
    nextTierName: nextBand.label,
    distanceToNextTier: distance,
    currentPayout,
    nextTierPayout: nextPayout,
    incrementalValue: nextPayout - currentPayout,
    progressPercent: Math.min(100, Math.max(0, progress)),
  };
}

// ──────────────────────────────────────────────
// Main Trajectory Computation
// ──────────────────────────────────────────────

interface ComponentResult {
  name: string;
  value: number;
}

/**
 * Compute trajectory for all components in a rule set.
 *
 * @param entityId - Entity identifier
 * @param entityName - Display name
 * @param totalPayout - Total payout from calculation results
 * @param componentResults - Array of {name, value} from calculation results
 * @param ruleSetConfig - The rule set configuration (AdditiveLookupConfig or WeightedKPIConfig)
 * @param attainments - Optional map of component name → attainment percentage (0-300)
 */
export function computeRepTrajectory(
  entityId: string,
  entityName: string,
  totalPayout: number,
  componentResults: ComponentResult[],
  ruleSetConfig: AdditiveLookupConfig | WeightedKPIConfig | null,
  attainments?: Record<string, number>
): RepTrajectory {
  const trajectories: TrajectoryCard[] = [];

  if (!ruleSetConfig) {
    return { entityId, entityName, totalPayout, trajectories, bestOpportunity: null, totalPotential: 0 };
  }

  // Extract plan components based on config type
  let planComponents: PlanComponent[] = [];

  if ('type' in ruleSetConfig && ruleSetConfig.type === 'additive_lookup') {
    // Flatten all variants' components
    const variants = (ruleSetConfig as AdditiveLookupConfig).variants || [];
    for (const variant of variants) {
      planComponents = planComponents.concat(variant.components || []);
    }
  } else if ('type' in ruleSetConfig && ruleSetConfig.type === 'weighted_kpi') {
    // Weighted KPI has KPIs not traditional components — skip for now
    return { entityId, entityName, totalPayout, trajectories, bestOpportunity: null, totalPotential: 0 };
  }

  // Match each component result to its plan definition
  for (const result of componentResults) {
    const planComp = planComponents.find(
      pc => pc.name.toLowerCase() === result.name.toLowerCase()
    );
    if (!planComp || !planComp.enabled) continue;

    // Get the attainment for this component (from attainments map or estimate from result)
    const att = attainments?.[result.name] ?? 0;

    let trajectory: TrajectoryCard | null = null;

    if (planComp.componentType === 'tier_lookup' && planComp.tierConfig) {
      trajectory = computeTierTrajectory(
        result.name,
        planComp.tierConfig,
        att,
        result.value
      );
    } else if (planComp.componentType === 'matrix_lookup' && planComp.matrixConfig) {
      trajectory = computeMatrixTrajectory(
        result.name,
        planComp.matrixConfig,
        att,
        result.value
      );
    }
    // percentage and conditional_percentage are linear — no tiers to advance to

    if (trajectory && trajectory.incrementalValue > 0) {
      trajectories.push(trajectory);
    }
  }

  // Sort by incremental value descending — best opportunity first
  trajectories.sort((a, b) => b.incrementalValue - a.incrementalValue);

  const bestOpportunity = trajectories.length > 0 ? trajectories[0] : null;
  const totalPotential = trajectories.reduce((s, t) => s + t.incrementalValue, 0);

  return { entityId, entityName, totalPayout, trajectories, bestOpportunity, totalPotential };
}
