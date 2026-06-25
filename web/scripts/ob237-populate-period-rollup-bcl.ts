/**
 * OB-237 T-AGG — Period-level rollup (sentinel-row pattern) for BCL.
 *
 * Intelligence/Compensation aggregate paths (getPeriodTotal, getComponentTotals, getPayoutDistribution,
 * trajectory per-period totals) fetch ALL entity_period_outcomes rows for a (tenant, period) and JS .reduce
 * them. entity_period_outcomes is the per-entity D7 materialization (BCL = 510 rows = 85 entities × 6
 * periods). This script builds the WRITE-TIME period-level rollup so the reads can fetch ONE row instead of
 * 85 and skip the O(n) reduce.
 *
 * CC cannot CREATE TABLE (PostgREST is DML-only; a migration is SR-44 architect-only). So this uses a
 * SENTINEL-ROW pattern inside the EXISTING summary_artifacts table:
 *   one row per (tenant, period) with
 *     data_type = 'period_outcomes'
 *     period_id = the period_id (the SENTINEL KEY — the read selects by period_id + data_type)
 *     entity_id = a real entity in that period (FK NOTE below — entity_id is NOT NULL + FK→entities, so the
 *                 directive's "entity_id = period_id" is impossible; we anchor on a real entity and select by
 *                 the native period_id column instead, which is exactly as unambiguous: one sentinel/period)
 *     summary_date = the period's first/earliest entity_period_outcomes source date (or null)
 *     metrics = {
 *       total_payout: SUM(entity_period_outcomes.total_payout),
 *       entity_count: COUNT(distinct entity rows),
 *       component_totals: { componentId: SUM(payout) } rolled up from component_breakdown,
 *       component_totals_by_name: { componentName: SUM(payout) }       // for getComponentTotals (name-keyed)
 *       component_entity_counts_by_name: { componentName: COUNT(entities with that component) } // entity_count
 *     }
 *     row_count = entity_count
 *
 * This does NOT touch the existing data_type='transaction' rows (distinct namespace). Idempotent replace:
 * delete WHERE tenant=BCL AND data_type='period_outcomes', then insert the 6 sentinel rows.
 *
 * VERIFY (PG-ROLLUP): 6 rows; per-period total_payout == ground truth (Oct $44,590 / Nov $46,291 /
 * Dec $61,986 / Jan $47,545 / Feb $53,215 / Mar $58,406); grand $312,033.
 *
 * Run: cd web && set -a && . ./.env.local && set +a && NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/ob237-populate-period-rollup-bcl.ts
 */
import { createClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const GROUND_TRUTH: Record<string, number> = {
  'October 2025': 44590,
  'November 2025': 46291,
  'December 2025': 61986,
  'January 2026': 47545,
  'February 2026': 53215,
  'March 2026': 58406,
};

const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : 0;

interface PeriodAgg {
  period_id: string;
  total_payout: number;
  entity_count: number;
  component_totals: Record<string, number>;       // keyed by componentId
  component_totals_by_name: Record<string, number>; // keyed by componentName (getComponentTotals contract)
  component_entity_counts_by_name: Record<string, number>; // entities per component (getComponentTotals.entity_count)
  earliest_date: string | null;
  anchor_entity_id: string | null;                // a real entity in the period (FK host for the sentinel row)
}

(async () => {
  // 1. Read ALL entity_period_outcomes for BCL deterministically (order by id), group by period_id,
  //    sum total_payout + roll up component_breakdown (an array of {payout, componentId, componentName}).
  const byPeriod = new Map<string, PeriodAgg>();
  let scanned = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('entity_period_outcomes')
      .select('entity_id, period_id, total_payout, component_breakdown, materialized_at')
      .eq('tenant_id', BCL)
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`entity_period_outcomes read: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      const pid = r.period_id as string;
      if (!pid) continue;
      let a = byPeriod.get(pid);
      if (!a) { a = { period_id: pid, total_payout: 0, entity_count: 0, component_totals: {}, component_totals_by_name: {}, component_entity_counts_by_name: {}, earliest_date: null, anchor_entity_id: null }; byPeriod.set(pid, a); }
      a.total_payout += num(r.total_payout);
      a.entity_count += 1;
      // first real entity seen for this period (rows ordered by id) — the FK host for the sentinel row.
      if (!a.anchor_entity_id && r.entity_id) a.anchor_entity_id = r.entity_id as string;
      // Mirror getComponentTotals' iteration EXACTLY: for each component on the entity, += payout to the
      // name-keyed total AND += 1 to that name's entity_count. breakdownToRecord keys by componentName, so
      // the rollup keys by name too (and additionally by componentId, per the directive).
      const bd = r.component_breakdown;
      if (Array.isArray(bd)) {
        for (const el of bd as any[]) {
          const id = String(el?.componentId ?? '').trim();
          const name = String(el?.componentName ?? '').trim();
          const payout = num(el?.payout);
          if (id) a.component_totals[id] = (a.component_totals[id] ?? 0) + payout;
          if (name) {
            a.component_totals_by_name[name] = (a.component_totals_by_name[name] ?? 0) + payout;
            a.component_entity_counts_by_name[name] = (a.component_entity_counts_by_name[name] ?? 0) + 1;
          }
        }
      } else if (bd && typeof bd === 'object') {
        // flat name→number record (defensive — BCL stores arrays, but keep the rollup shape-agnostic)
        for (const [k, val] of Object.entries(bd as Record<string, unknown>)) {
          const payout = typeof val === 'number' ? val : num((val as any)?.payout);
          a.component_totals_by_name[k] = (a.component_totals_by_name[k] ?? 0) + payout;
          a.component_entity_counts_by_name[k] = (a.component_entity_counts_by_name[k] ?? 0) + 1;
        }
      }
    }
    scanned += data.length;
    if (data.length < 1000) break;
  }
  console.log(`scanned=${scanned} entity_period_outcomes rows -> ${byPeriod.size} periods`);

  // 1b. Earliest source date per period — from periods.start_date (the natural period anchor). summary_date
  //     is informational on the sentinel; the read selects by entity_id=period_id.
  const periodIds = Array.from(byPeriod.keys());
  const { data: periods } = await sb.from('periods').select('id, label, start_date').in('id', periodIds);
  const pmap = new Map((periods ?? []).map((p: any) => [p.id, p]));
  for (const a of byPeriod.values()) {
    a.earliest_date = (pmap.get(a.period_id) as any)?.start_date ?? null;
  }

  // 2. Idempotent replace: delete only the period_outcomes sentinel rows (NOT the transaction rows).
  const { error: delErr } = await sb.from('summary_artifacts').delete().eq('tenant_id', BCL).eq('data_type', 'period_outcomes');
  if (delErr) throw new Error(`delete sentinels: ${delErr.message}`);

  const now = new Date().toISOString();
  const sentinels = Array.from(byPeriod.values()).map((a) => ({
    tenant_id: BCL,
    entity_id: a.anchor_entity_id,   // FK host: a real entity in the period (entity_id is NOT NULL + FK)
    summary_date: a.earliest_date,   // first date of the period (informational)
    period_id: a.period_id,          // SENTINEL KEY: the read selects by period_id + data_type
    data_type: 'period_outcomes',
    metrics: {
      total_payout: a.total_payout,
      entity_count: a.entity_count,
      component_totals: a.component_totals,
      component_totals_by_name: a.component_totals_by_name,
      component_entity_counts_by_name: a.component_entity_counts_by_name,
    },
    row_count: a.entity_count,
    computed_at: now,
    created_at: now,
  }));
  const { error: insErr } = await sb.from('summary_artifacts').insert(sentinels);
  if (insErr) throw new Error(`insert sentinels: ${insErr.message}`);
  console.log(`written=${sentinels.length} period_outcomes sentinel rows`);

  // 3. VERIFY (PG-ROLLUP): re-read the sentinels and value-match per-period + grand against ground truth.
  const { data: written } = await sb
    .from('summary_artifacts')
    .select('entity_id, period_id, metrics, row_count')
    .eq('tenant_id', BCL)
    .eq('data_type', 'period_outcomes')
    .order('period_id', { ascending: true });
  const labelOf = (pid: string) => (pmap.get(pid) as any)?.label ?? pid;
  let grand = 0;
  let allMatch = true;
  const rows = (written ?? []) as any[];
  rows.sort((x, y) => ((pmap.get(x.period_id) as any)?.start_date ?? '').localeCompare((pmap.get(y.period_id) as any)?.start_date ?? ''));
  console.log('\nPG-ROLLUP per-period value-match:');
  for (const r of rows) {
    const label = labelOf(r.period_id);
    const tp = num(r.metrics?.total_payout);
    grand += tp;
    const truth = GROUND_TRUTH[label];
    const ok = truth != null && Math.abs(tp - truth) < 0.01;
    if (!ok) allMatch = false;
    const compIds = Object.keys(r.metrics?.component_totals ?? {}).length;
    console.log(`  ${label}: total_payout=$${tp} (truth $${truth}) ${ok ? 'MATCH ✓' : 'MISMATCH ✗'} | entity_count=${r.metrics?.entity_count} | component_totals keys=${compIds}`);
  }
  const grandTruth = 312033;
  const grandOk = Math.abs(grand - grandTruth) < 0.01;
  console.log(`\nGRAND: $${grand} (truth $${grandTruth}) ${grandOk ? 'MATCH ✓' : 'MISMATCH ✗'}`);
  console.log(`ROW COUNT: ${rows.length} (expected 6) ${rows.length === 6 ? '✓' : '✗'}`);
  console.log(`\nPG-ROLLUP: ${allMatch && grandOk && rows.length === 6 ? 'PASS ✓' : 'FAIL ✗'}`);
  process.exit(allMatch && grandOk && rows.length === 6 ? 0 : 1);
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
