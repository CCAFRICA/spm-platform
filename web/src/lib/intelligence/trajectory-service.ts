/**
 * Trajectory Computation Engine
 *
 * OB-172: Pure computation module — no UI, no Supabase calls.
 * Takes calculation data and produces trajectory intelligence.
 *
 * Decision 130: velocity = avg delta over last 3 periods.
 * Pace projection = gap / velocity. Negative velocity = "not on pace."
 * No probability estimates until Hot tier (7+ periods).
 *
 * Domain-agnostic: works with any component names, entity names.
 * Korean Test compliant: zero hardcoded labels.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PeriodSnapshot {
  periodId: string;
  periodLabel: string;
  startDate: string;
  totalPayout: number;
  entityCount: number;
  componentTotals: Record<string, number>;
}

export interface EntityPeriodData {
  periodLabel: string;
  totalPayout: number;
  components: Record<string, number>;
}

export interface EntityTrajectory {
  entityId: string;
  externalId: string;
  displayName: string;
  periods: EntityPeriodData[];
  velocity: number | null;
  acceleration: number | null;
  trend: TrajectoryTrend;
}

export interface ComponentTrajectory {
  componentName: string;
  periods: Array<{ label: string; total: number }>;
  velocity: number | null;
  trend: 'growing' | 'stable' | 'declining' | 'insufficient_data';
}

export interface PopulationTrajectory {
  periods: PeriodSnapshot[];
  velocity: number | null;
  acceleration: number | null;
  trend: TrajectoryTrend;
  componentTrajectories: ComponentTrajectory[];
  topAccelerators: EntityTrajectory[];
  topDecliners: EntityTrajectory[];
  confidenceBasis: string;
  periodCount: number;
}

export type TrajectoryTrend = 'accelerating' | 'stable' | 'decelerating' | 'insufficient_data';

// ──────────────────────────────────────────────
// Velocity Computation (Decision 130)
// ──────────────────────────────────────────────

export function computeVelocity(values: number[]): number | null {
  if (values.length < 2) return null;

  const recent = values.slice(-3);
  const deltas: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    deltas.push(recent[i] - recent[i - 1]);
  }

  if (deltas.length === 0) return null;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

export function computeAcceleration(values: number[]): number | null {
  if (values.length < 4) return null;

  const recent4 = values.slice(-4);
  const v1 = (recent4[1] - recent4[0] + recent4[2] - recent4[1]) / 2;
  const v2 = (recent4[2] - recent4[1] + recent4[3] - recent4[2]) / 2;
  return v2 - v1;
}

export function classifyTrend(velocity: number | null, acceleration: number | null): TrajectoryTrend {
  if (velocity === null) return 'insufficient_data';
  if (acceleration !== null && acceleration > 0 && velocity > 0) return 'accelerating';
  if (acceleration !== null && acceleration < 0 && velocity > 0) return 'decelerating';
  if (velocity > 0) return 'accelerating';
  if (velocity < 0) return 'decelerating';
  return 'stable';
}

function classifyComponentTrend(velocity: number | null): ComponentTrajectory['trend'] {
  if (velocity === null) return 'insufficient_data';
  if (velocity > 100) return 'growing';
  if (velocity < -100) return 'declining';
  return 'stable';
}

// ──────────────────────────────────────────────
// Confidence Basis (DS-013 Section 7)
// ──────────────────────────────────────────────

function getConfidenceBasis(periodCount: number): string {
  if (periodCount <= 1) return 'Insufficient data for trajectory analysis.';
  if (periodCount === 2) return 'Based on 1 period-over-period comparison. Trend may not be representative.';
  if (periodCount <= 4) return `Based on ${periodCount} periods. Moderate confidence in velocity estimate.`;
  if (periodCount <= 6) return `Based on ${periodCount} periods. Good confidence in velocity and acceleration.`;
  return `Based on ${periodCount} periods. High confidence in velocity, acceleration, and projections.`;
}

// ──────────────────────────────────────────────
// Main Trajectory Computation
// ──────────────────────────────────────────────

export function computePopulationTrajectory(
  snapshots: PeriodSnapshot[],
  entityData: Map<string, { externalId: string; displayName: string; periods: EntityPeriodData[] }>
): PopulationTrajectory {
  const sorted = [...snapshots].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const totals = sorted.map(s => s.totalPayout);

  const velocity = computeVelocity(totals);
  const acceleration = computeAcceleration(totals);
  const trend = classifyTrend(velocity, acceleration);

  // Component-level trajectories
  const allComponentNames = new Set<string>();
  sorted.forEach(s => Object.keys(s.componentTotals).forEach(c => allComponentNames.add(c)));

  const componentTrajectories: ComponentTrajectory[] = Array.from(allComponentNames).map(name => {
    const values = sorted.map(s => s.componentTotals[name] || 0);
    const v = computeVelocity(values);
    return {
      componentName: name,
      periods: sorted.map((s, i) => ({ label: s.periodLabel, total: values[i] })),
      velocity: v,
      trend: classifyComponentTrend(v),
    };
  });

  // Entity-level trajectories
  const entityTrajectories: EntityTrajectory[] = [];
  for (const [entityId, info] of Array.from(entityData.entries())) {
    if (info.periods.length < 2) continue;
    const values = info.periods.map(p => p.totalPayout);
    const v = computeVelocity(values);
    const a = computeAcceleration(values);
    entityTrajectories.push({
      entityId,
      externalId: info.externalId,
      displayName: info.displayName,
      periods: info.periods,
      velocity: v,
      acceleration: a,
      trend: classifyTrend(v, a),
    });
  }

  // Top movers
  const withVelocity = entityTrajectories.filter(e => e.velocity !== null);
  const topAccelerators = [...withVelocity]
    .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
    .slice(0, 3);
  const topDecliners = [...withVelocity]
    .filter(e => (e.velocity ?? 0) < 0)
    .sort((a, b) => (a.velocity ?? 0) - (b.velocity ?? 0))
    .slice(0, 3);

  return {
    periods: sorted,
    velocity,
    acceleration,
    trend,
    componentTrajectories,
    topAccelerators,
    topDecliners,
    confidenceBasis: getConfidenceBasis(sorted.length),
    periodCount: sorted.length,
  };
}
