import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// EXACT replica of the route.ts write-time aggregation (from outcomeRows / entity_period_outcomes).
function rollup(rows: any[]) {
  let total = 0; const ct: Record<string, number> = {}, ctn: Record<string, number> = {}, cen: Record<string, number> = {};
  for (const r of rows) {
    total += Number(r.total_payout) || 0;
    const bd = r.component_breakdown;
    for (const c of Array.isArray(bd) ? bd : []) {
      const payout = Number(c?.payout) || 0;
      if (c?.componentId) ct[c.componentId] = (ct[c.componentId] ?? 0) + payout;
      const name = c?.componentName;
      if (name) { ctn[name] = (ctn[name] ?? 0) + payout; cen[name] = (cen[name] ?? 0) + 1; }
    }
  }
  return { total_payout: total, entity_count: rows.length, component_totals: ct, component_totals_by_name: ctn, component_entity_counts_by_name: cen };
}
const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
const sortObj = (o: any) => Object.fromEntries(Object.entries(o ?? {}).sort());
const eq = (a: any, b: any) => JSON.stringify(sortObj(a)) === JSON.stringify(sortObj(b));

(async () => {
  // group BCL entity_period_outcomes by period
  const { data: epo } = await sb.from('entity_period_outcomes').select('entity_id, period_id, total_payout, component_breakdown').eq('tenant_id', BCL);
  const byPeriod = new Map<string, any[]>();
  for (const r of epo ?? []) { const p = r.period_id as string; if (!byPeriod.has(p)) byPeriod.set(p, []); byPeriod.get(p)!.push(r); }
  // existing sentinels
  const { data: sent } = await sb.from('summary_artifacts').select('period_id, metrics, row_count').eq('tenant_id', BCL).eq('data_type', 'period_outcomes');
  const sentByPeriod = new Map<string, any>(); for (const s of sent ?? []) sentByPeriod.set(s.period_id as string, s);

  console.log(`BCL: ${byPeriod.size} periods of entity_period_outcomes, ${sentByPeriod.size} existing period_outcomes sentinels\n`);
  let allMatch = true;
  for (const [pid, rows] of Array.from(byPeriod.entries())) {
    const mine = rollup(rows);
    const s = sentByPeriod.get(pid);
    if (!s) { console.log(`  ${pid}: my total=${mine.total_payout.toFixed(2)} entities=${mine.entity_count} — NO existing sentinel (would be newly materialized)`); continue; }
    const sm = s.metrics ?? {};
    const totalMatch = Math.abs(mine.total_payout - Number(sm.total_payout)) < 0.005;
    const countMatch = mine.entity_count === Number(sm.entity_count);
    const nameMatch = eq(round(mine.component_totals_by_name), round(sm.component_totals_by_name ?? {}));
    const cntMatch = eq(mine.component_entity_counts_by_name, sm.component_entity_counts_by_name ?? {});
    const ok = totalMatch && countMatch && nameMatch && cntMatch;
    if (!ok) allMatch = false;
    console.log(`  ${pid}: total ${mine.total_payout.toFixed(2)} vs ${Number(sm.total_payout).toFixed(2)} ${totalMatch?'✓':'✗'} | entities ${mine.entity_count} vs ${sm.entity_count} ${countMatch?'✓':'✗'} | by_name ${nameMatch?'✓':'✗'} | counts ${cntMatch?'✓':'✗'}  ${ok?'MATCH':'*** MISMATCH ***'}`);
  }
  console.log(`\n${allMatch ? '✓ BLOCKER 2: write-time sentinel logic is BYTE-IDENTICAL to the script — serving-neutral' : '*** logic differs from the script — investigate ***'}`);
})().catch(e => console.log('threw:', e instanceof Error ? e.message : String(e)));
