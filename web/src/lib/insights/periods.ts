/**
 * OB-227 — getCalculatedPeriods: the canonical period query for every Insights surface.
 * Periods that have calculation results, most-recent first (by periods.start_date — Decision 92/93),
 * decorated with per-period payout stats. Wraps the corrected getPeriodsWithResults + getEntityResults
 * (AP-17 single code path; no parallel period query).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getPeriodsWithResults, getEntityResults } from '@/lib/drill-through';
import { type AuthScope, ALL_SCOPE } from '@/lib/auth/scope';
import type { PeriodSummary } from './types';

/**
 * OB-246: "all entities" scope as an AuthScope discriminant. Was an empty-visibleEntityIds EntityScope
 * (the AP1 empty-means-all overload); now an explicit {type:'all'}. Still the default for un-migrated
 * page callsites (byte-identical: 'all' → no entity filter). Re-exported via the insights barrel.
 */
export const ALL_INSIGHTS_SCOPE: AuthScope = ALL_SCOPE;

export async function getCalculatedPeriods(
  tenantId: string,
  client?: SupabaseClient<Database>,
): Promise<PeriodSummary[]> {
  if (!tenantId) return [];
  const sb = client ?? createClient();

  const periods = await getPeriodsWithResults(tenantId, sb); // start_date DESC, {id,label,start_date}
  if (!periods.length) return [];

  // end_dates + lifecycle hint in one query
  const ids = periods.map(p => p.id);
  const { data: periodRows } = await sb.from('periods').select('id, end_date').in('id', ids);
  const endById = new Map((periodRows ?? []).map(p => [p.id as string, (p.end_date as string) ?? '']));

  const summaries = await Promise.all(
    periods.map(async (p): Promise<PeriodSummary> => {
      const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: p.id }, sb);
      const payouts = rows.map(r => r.totalPayout);
      const total = payouts.reduce((s, v) => s + v, 0);
      const count = rows.length;
      // lowest lifecycle state present (PREVIEW < APPROVED …) — purely from data, may be null
      const states = rows.map(r => r.lifecycleState).filter((s): s is string => !!s);
      return {
        period_id: p.id,
        label: p.label,
        start_date: p.start_date ?? '',
        end_date: endById.get(p.id) ?? '',
        total_payout: total,
        entity_count: count,
        avg_payout: count > 0 ? total / count : 0,
        min_payout: count > 0 ? Math.min(...payouts) : 0,
        max_payout: count > 0 ? Math.max(...payouts) : 0,
        lifecycle_state: states.length ? states.sort()[0] : null,
      };
    }),
  );
  return summaries; // already start_date DESC (inherits getPeriodsWithResults order)
}
