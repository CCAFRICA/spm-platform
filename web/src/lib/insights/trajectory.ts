/**
 * OB-227 — getEntityTrajectory + getPopulationTrend. Cross-period trajectory (DS-015 §6:
 * delta needs 2 periods, velocity needs 3). Built from getEntityResults across all calculated
 * periods (chronological), reusing getPeriodsWithResults for the period axis.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getPeriodsWithResults, getEntityResults } from '@/lib/drill-through';
import { ALL_INSIGHTS_SCOPE } from './periods';
import { getPeriodRollup } from './intelligence-data';
import type { EntityTrajectory, TrajectoryPoint, PopulationTrendPoint } from './types';

const STABLE_EPS = 0.005; // <0.5% change = stable

/** periods chronological ASC + per-period EntityResults, fetched once. */
async function loadAcrossPeriods(tenantId: string, sb: SupabaseClient<Database>) {
  const periodsDesc = await getPeriodsWithResults(tenantId, sb);
  const periodsAsc = [...periodsDesc].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
  const perPeriod = await Promise.all(
    periodsAsc.map(async p => ({ period: p, rows: await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: p.id }, sb) })),
  );
  return { periodsAsc, perPeriod };
}

export async function getPopulationTrend(
  tenantId: string,
  client?: SupabaseClient<Database>,
): Promise<PopulationTrendPoint[]> {
  if (!tenantId) return [];
  const sb = client ?? createClient();

  // OB-237 T-AGG: per-period total + count + avg come from the ONE period-rollup sentinel row per period (no
  // O(n) reduce over each period's 85 entity_period_outcomes rows, and no per-entity fetch at all). Each
  // period is resolved by getPeriodsWithResults (the period axis); the rollup supplies its total/entity_count.
  const periodsDesc = await getPeriodsWithResults(tenantId, sb);
  const periodsAsc = [...periodsDesc].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
  const points = await Promise.all(
    periodsAsc.map(async (period): Promise<PopulationTrendPoint> => {
      const rollup = await getPeriodRollup(tenantId, period.id, sb);
      if (rollup) {
        const total = rollup.total_payout;
        const count = rollup.entity_count;
        return {
          period_id: period.id,
          label: period.label,
          start_date: period.start_date ?? '',
          total,
          avg: count ? total / count : 0,
          entity_count: count,
        };
      }
      // graceful fallback: per-entity path for periods without a materialized rollup
      const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: period.id }, sb);
      const total = rows.reduce((s, r) => s + r.totalPayout, 0);
      return {
        period_id: period.id,
        label: period.label,
        start_date: period.start_date ?? '',
        total,
        avg: rows.length ? total / rows.length : 0,
        entity_count: rows.length,
      };
    }),
  );
  return points;
}

export async function getEntityTrajectory(
  tenantId: string,
  entityId?: string,
  client?: SupabaseClient<Database>,
): Promise<EntityTrajectory[]> {
  if (!tenantId) return [];
  const sb = client ?? createClient();
  const { perPeriod } = await loadAcrossPeriods(tenantId, sb);

  // build per-entity series across periods (chronological)
  const series = new Map<string, { name: string; points: TrajectoryPoint[] }>();
  for (const { period, rows } of perPeriod) {
    for (const r of rows) {
      if (entityId && r.entityId !== entityId) continue;
      let s = series.get(r.entityId);
      if (!s) { s = { name: r.displayName, points: [] }; series.set(r.entityId, s); }
      s.points.push({ period_id: period.id, label: period.label, start_date: period.start_date ?? '', total_payout: r.totalPayout });
    }
  }

  return Array.from(series.entries()).map(([id, s]) => {
    const pts = s.points;
    const n = pts.length;
    const last = n >= 1 ? pts[n - 1].total_payout : 0;
    const prior = n >= 2 ? pts[n - 2].total_payout : null;
    const delta = prior === null ? null : last - prior;
    // velocity = avg per-period delta over the last 3 points (2 deltas)
    let velocity: number | null = null;
    if (n >= 3) {
      const recent = pts.slice(-3).map(p => p.total_payout);
      velocity = ((recent[1] - recent[0]) + (recent[2] - recent[1])) / 2;
    }
    let direction: EntityTrajectory['direction'] = null;
    if (delta !== null && prior !== null) {
      const rel = prior !== 0 ? delta / Math.abs(prior) : delta;
      direction = Math.abs(rel) < STABLE_EPS ? 'stable' : delta > 0 ? 'up' : 'down';
    }
    return { entity_id: id, display_name: s.name, periods: pts, delta, velocity, direction };
  });
}
