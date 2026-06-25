/**
 * OB-227 — getPayoutDistribution + getComponentTotals. Histogram + statistics and per-component
 * cost allocation for a period, both derived from getEntityResults (HALT-2-safe component shape).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getEntityResults } from '@/lib/drill-through';
import { scopeIsDeny, scopeIsNarrowed } from '@/lib/drill-through/entity-scope';
import type { EntityScope } from '@/lib/drill-through/types';
import { ALL_INSIGHTS_SCOPE } from './periods';
import { getPeriodRollup } from './intelligence-data';
import type { DistributionResult, DistributionBin, ComponentTotal } from './types';

function stats(payouts: number[]): { mean: number; median: number; std: number } {
  const n = payouts.length;
  if (n === 0) return { mean: 0, median: 0, std: 0 };
  const mean = payouts.reduce((s, v) => s + v, 0) / n;
  const sorted = [...payouts].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = payouts.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, median, std: Math.sqrt(variance) };
}

// OB-237 T-AGG HALT-COVERAGE: getPayoutDistribution is a histogram over the INDIVIDUAL entity payouts
// (mean/median/std + per-bin counts across the 85 per-entity values). The period-rollup sentinel carries
// only the period SUM + component sums, NOT the full per-entity payout vector, so the distribution cannot be
// served from it without storing every entity's payout (which is just the per-entity rows again). It stays
// on the per-entity getEntityResults path — already materialization-backed (entity_period_outcomes), it is a
// genuine distribution, not an aggregate. (Same coverage-gap class as the Financial location_detail mode.)
export async function getPayoutDistribution(
  tenantId: string,
  periodId: string,
  binCount = 10,
  client?: SupabaseClient<Database>,
): Promise<DistributionResult> {
  const sb = client ?? createClient();
  const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId }, sb);
  const payouts = rows.map(r => r.totalPayout);
  const total_entities = payouts.length;
  const empty: DistributionResult = { bins: [], mean: 0, median: 0, std_dev: 0, total_entities, zero_payout_count: 0, min: 0, max: 0 };
  if (total_entities === 0) return empty;

  const min = Math.min(...payouts);
  const max = Math.max(...payouts);
  const { mean, median, std } = stats(payouts);
  const zero_payout_count = payouts.filter(v => v === 0).length;

  const bins: DistributionBin[] = [];
  const span = max - min;
  if (span === 0) {
    // all identical — single bin
    bins.push({ range_start: min, range_end: max, count: total_entities, percentage: 100 });
  } else {
    const width = span / binCount;
    for (let i = 0; i < binCount; i++) {
      const range_start = min + i * width;
      const range_end = i === binCount - 1 ? max : min + (i + 1) * width;
      const count = payouts.filter(v =>
        i === binCount - 1 ? v >= range_start && v <= range_end : v >= range_start && v < range_end,
      ).length;
      bins.push({ range_start, range_end, count, percentage: (count / total_entities) * 100 });
    }
  }
  return { bins, mean, median, std_dev: std, total_entities, zero_payout_count, min, max };
}

export async function getComponentTotals(
  tenantId: string,
  periodId: string,
  // HF-343: optional authenticated scope (default ALL = admin → byte-identical to prior callers).
  // The component-totals sentinel is TENANT-WIDE; a narrowed scope bypasses it and aggregates only
  // the visible entities' component breakdowns (a member sees ONLY their own components).
  scope: EntityScope = ALL_INSIGHTS_SCOPE,
  client?: SupabaseClient<Database>,
): Promise<ComponentTotal[]> {
  const sb = client ?? createClient();
  if (scopeIsDeny(scope)) return [];

  // OB-237 T-AGG: read the per-component sums + entity counts from the ONE period-rollup sentinel row (no
  // O(n) reduce over the 85 entity_period_outcomes rows). component_totals_by_name + the parallel
  // component_entity_counts_by_name mirror the prior per-entity iteration EXACTLY (name-keyed, += payout,
  // += 1 entity per component appearance). Fall back to the per-entity path only when the sentinel is absent.
  // HF-343: a narrowed scope SKIPS the tenant-wide sentinel and uses the scoped per-entity path below.
  const rollup = scopeIsNarrowed(scope) ? null : await getPeriodRollup(tenantId, periodId, sb);
  if (rollup && Object.keys(rollup.component_totals_by_name).length > 0) {
    const byName = rollup.component_totals_by_name;
    const countByName = rollup.component_entity_counts_by_name;
    const grand = Object.values(byName).reduce((s, v) => s + v, 0);
    return Object.entries(byName)
      .map(([component_name, total_amount]) => ({
        component_name,
        total_amount,
        entity_count: countByName[component_name] ?? 0,
        percentage_of_total: grand > 0 ? (total_amount / grand) * 100 : 0,
      }))
      .sort((a, b) => b.total_amount - a.total_amount);
  }

  // Graceful fallback / scoped path: per-entity (tenant/period without a sentinel, OR a narrowed scope).
  const rows = await getEntityResults(tenantId, scope, { periodId }, sb);
  const totals = new Map<string, { amount: number; entities: number }>();
  for (const r of rows) {
    const bd = r.componentBreakdown ?? {};
    for (const [name, amount] of Object.entries(bd)) {
      const cur = totals.get(name) ?? { amount: 0, entities: 0 };
      cur.amount += amount;
      cur.entities += 1;
      totals.set(name, cur);
    }
  }
  const grand = Array.from(totals.values()).reduce((s, v) => s + v.amount, 0);
  return Array.from(totals.entries())
    .map(([component_name, v]) => ({
      component_name,
      total_amount: v.amount,
      entity_count: v.entities,
      percentage_of_total: grand > 0 ? (v.amount / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total_amount - a.total_amount);
}
