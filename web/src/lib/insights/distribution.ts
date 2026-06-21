/**
 * OB-227 — getPayoutDistribution + getComponentTotals. Histogram + statistics and per-component
 * cost allocation for a period, both derived from getEntityResults (HALT-2-safe component shape).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getEntityResults } from '@/lib/drill-through';
import { ALL_INSIGHTS_SCOPE } from './periods';
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
  client?: SupabaseClient<Database>,
): Promise<ComponentTotal[]> {
  const sb = client ?? createClient();
  const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId }, sb);
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
