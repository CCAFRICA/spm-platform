/**
 * Trajectory Engine — Rep Performance Trajectory (read-only projection)
 *
 * OB-98 Phase 5 / OB-196 Phase 1.6.5: Reads metadata.intent (foundational shapes)
 * to project next-tier opportunity. Pure read-only — does NOT re-evaluate primitives,
 * does NOT compute payouts (intent-executor is sole calculation authority per Decision 151).
 *
 * Inputs:
 *   - calculation results per component (already-computed values from intent-executor)
 *   - rule set with PlanComponents carrying metadata.intent or calculationIntent
 *
 * Output: TrajectoryCard[] with current position, next-boundary threshold, and
 * incremental value (read straight from the foundational outputs array — not computed).
 *
 * Korean Test: Zero hardcoded component names, tier names, or currencies.
 * Reads all structure from rule_set component intent — structural parsing only.
 */
import type {
  PlanComponent,
  AdditiveLookupConfig,
  WeightedKPIConfig,
} from '@/types/compensation-plan';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface TrajectoryCard {
  componentName: string;
  componentType: string;            // foundational primitive identifier
  currentAttainment: number;
  currentTier: string;
  nextTierThreshold: number;
  nextTierName: string;
  distanceToNextTier: number;
  currentPayout: number;
  nextTierPayout: number;
  incrementalValue: number;
  progressPercent: number;
}

export interface RepTrajectory {
  entityId: string;
  entityName: string;
  totalPayout: number;
  trajectories: TrajectoryCard[];
  bestOpportunity: TrajectoryCard | null;
  totalPotential: number;
}

// Foundational boundary shape (mirrors intent-types.Boundary at runtime)
interface Boundary {
  min: number | null;
  max: number | null;
  minInclusive?: boolean;
  maxInclusive?: boolean;
}

// ──────────────────────────────────────────────
// Helpers — foundational boundary navigation
// ──────────────────────────────────────────────

function boundaryMatches(b: Boundary, value: number): boolean {
  const minOk = b.min == null || (b.minInclusive !== false ? value >= b.min : value > b.min);
  const maxOk = b.max == null || (b.maxInclusive !== false ? value <= b.max : value < b.max);
  return minOk && maxOk;
}

function findBoundaryIndex(boundaries: Boundary[], value: number): number {
  for (let i = 0; i < boundaries.length; i++) {
    if (boundaryMatches(boundaries[i], value)) return i;
  }
  // If value sits at or above the highest boundary's min, treat as last
  if (boundaries.length > 0) {
    const last = boundaries[boundaries.length - 1];
    if (last.min != null && value >= last.min) return boundaries.length - 1;
  }
  return -1;
}

function boundaryLabel(b: Boundary, idx: number): string {
  if (b.min == null && b.max == null) return `Tier ${idx + 1}`;
  if (b.min == null) return `≤ ${b.max}`;
  if (b.max == null) return `≥ ${b.min}`;
  return `${b.min}–${b.max}`;
}

function readIntent(component: PlanComponent): Record<string, unknown> | null {
  const meta = (component.metadata || {}) as Record<string, unknown>;
  const intent = meta.intent || (component as unknown as Record<string, unknown>).calculationIntent;
  return (intent as Record<string, unknown>) || null;
}

// ──────────────────────────────────────────────
// Trajectory projection per foundational primitive
// ──────────────────────────────────────────────

function projectBoundedLookup1D(
  componentName: string,
  intent: Record<string, unknown>,
  currentAttainment: number,
  currentPayout: number
): TrajectoryCard | null {
  const boundaries = intent.boundaries as Boundary[] | undefined;
  const outputs = intent.outputs as number[] | undefined;
  if (!boundaries || !outputs || boundaries.length === 0) return null;

  const sortedIdx = boundaries
    .map((b, i) => ({ b, i }))
    .sort((a, b) => (a.b.min ?? -Infinity) - (b.b.min ?? -Infinity));

  const sortedBoundaries = sortedIdx.map(x => x.b);
  const sortedOutputs = sortedIdx.map(x => outputs[x.i]);

  const currentIdx = findBoundaryIndex(sortedBoundaries, currentAttainment);
  if (currentIdx >= sortedBoundaries.length - 1) return null;

  const current = currentIdx >= 0 ? sortedBoundaries[currentIdx] : null;
  const next = sortedBoundaries[currentIdx + 1];
  if (!next || next.min == null) return null;

  const distance = next.min - currentAttainment;
  if (distance <= 0) return null;

  const currentMin = current?.min ?? 0;
  const bandWidth = next.min - currentMin;
  const progress = bandWidth > 0 ? ((currentAttainment - currentMin) / bandWidth) * 100 : 0;

  const nextPayout = sortedOutputs[currentIdx + 1] ?? 0;

  return {
    componentName,
    componentType: 'bounded_lookup_1d',
    currentAttainment,
    currentTier: current ? boundaryLabel(current, currentIdx) : 'Below minimum',
    nextTierThreshold: next.min,
    nextTierName: boundaryLabel(next, currentIdx + 1),
    distanceToNextTier: distance,
    currentPayout,
    nextTierPayout: nextPayout,
    incrementalValue: nextPayout - currentPayout,
    progressPercent: Math.min(100, Math.max(0, progress)),
  };
}

function projectBoundedLookup2D(
  componentName: string,
  intent: Record<string, unknown>,
  currentAttainment: number,
  currentPayout: number
): TrajectoryCard | null {
  const rowBoundaries = intent.rowBoundaries as Boundary[] | undefined;
  const columnBoundaries = intent.columnBoundaries as Boundary[] | undefined;
  const outputGrid = intent.outputGrid as number[][] | undefined;
  if (!rowBoundaries || rowBoundaries.length === 0 || !outputGrid || outputGrid.length === 0) return null;

  const sortedRowIdx = rowBoundaries
    .map((b, i) => ({ b, i }))
    .sort((a, b) => (a.b.min ?? -Infinity) - (b.b.min ?? -Infinity));
  const sortedRowBoundaries = sortedRowIdx.map(x => x.b);

  const currentIdx = findBoundaryIndex(sortedRowBoundaries, currentAttainment);
  if (currentIdx >= sortedRowBoundaries.length - 1) return null;

  const current = currentIdx >= 0 ? sortedRowBoundaries[currentIdx] : null;
  const next = sortedRowBoundaries[currentIdx + 1];
  if (!next || next.min == null) return null;

  const distance = next.min - currentAttainment;
  if (distance <= 0) return null;

  // Representative column: middle of the column boundary set (read-only — just sampling the table)
  const colCount = columnBoundaries?.length ?? (outputGrid[0]?.length ?? 1);
  const colIdx = Math.min(Math.floor(colCount / 2), (outputGrid[0]?.length ?? 1) - 1);

  const nextRowOriginalIdx = sortedRowIdx[currentIdx + 1].i;
  const nextPayout = outputGrid[nextRowOriginalIdx]?.[colIdx] ?? 0;

  const currentMin = current?.min ?? 0;
  const bandWidth = next.min - currentMin;
  const progress = bandWidth > 0 ? ((currentAttainment - currentMin) / bandWidth) * 100 : 0;

  return {
    componentName,
    componentType: 'bounded_lookup_2d',
    currentAttainment,
    currentTier: current ? boundaryLabel(current, currentIdx) : 'Below minimum',
    nextTierThreshold: next.min,
    nextTierName: boundaryLabel(next, currentIdx + 1),
    distanceToNextTier: distance,
    currentPayout,
    nextTierPayout: nextPayout,
    incrementalValue: nextPayout - currentPayout,
    progressPercent: Math.min(100, Math.max(0, progress)),
  };
}

// ──────────────────────────────────────────────
// Main trajectory computation
// ──────────────────────────────────────────────

interface ComponentResult {
  name: string;
  value: number;
}

/**
 * Compute trajectory projection for all components in a rule set.
 *
 * Read-only: consumes already-computed values from componentResults and projects
 * to next-boundary outputs from the foundational intent. Does not evaluate primitives.
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

  let planComponents: PlanComponent[] = [];

  if ('type' in ruleSetConfig && ruleSetConfig.type === 'additive_lookup') {
    const variants = (ruleSetConfig as AdditiveLookupConfig).variants || [];
    for (const variant of variants) {
      planComponents = planComponents.concat(variant.components || []);
    }
  } else if ('type' in ruleSetConfig && ruleSetConfig.type === 'weighted_kpi') {
    return { entityId, entityName, totalPayout, trajectories, bestOpportunity: null, totalPotential: 0 };
  }

  for (const result of componentResults) {
    const planComp = planComponents.find(
      pc => pc.name.toLowerCase() === result.name.toLowerCase()
    );
    if (!planComp || !planComp.enabled) continue;

    const intent = readIntent(planComp);
    if (!intent) continue;

    const att = attainments?.[result.name] ?? 0;
    const operation = intent.operation as string | undefined;

    let trajectory: TrajectoryCard | null = null;

    if (operation === 'bounded_lookup_1d') {
      trajectory = projectBoundedLookup1D(result.name, intent, att, result.value);
    } else if (operation === 'bounded_lookup_2d') {
      trajectory = projectBoundedLookup2D(result.name, intent, att, result.value);
    }
    // Non-lookup primitives (scalar_multiply, linear_function, conditional_gate, etc.)
    // have no discrete next-tier semantics — no projection card emitted.

    if (trajectory && trajectory.incrementalValue > 0) {
      trajectories.push(trajectory);
    }
  }

  trajectories.sort((a, b) => b.incrementalValue - a.incrementalValue);

  const bestOpportunity = trajectories.length > 0 ? trajectories[0] : null;
  const totalPotential = trajectories.reduce((s, t) => s + t.incrementalValue, 0);

  return { entityId, entityName, totalPayout, trajectories, bestOpportunity, totalPotential };
}
