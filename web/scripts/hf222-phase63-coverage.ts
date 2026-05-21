// Coverage check across BCL + Meridian + CRP: periods × rule_sets × calc_results.
import { createClient } from '@supabase/supabase-js';

const TENANTS: Record<string, string> = {
  BCL: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
  Meridian: '5035b1e8-0754-4527-b7ec-9f93f85e4c79',
  CRP: 'e44bbcb1-2710-4880-8c7d-a1bd902720b7',
};

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tenantIds = Object.values(TENANTS);

  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, tenant_id').in('tenant_id', tenantIds);
  const { data: periods } = await sb.from('periods')
    .select('id, tenant_id, label, period_type, status, start_date, end_date')
    .in('tenant_id', tenantIds).order('start_date');
  const { data: results } = await sb.from('calculation_results')
    .select('id, tenant_id, rule_set_id, period_id, entity_id, total_payout, created_at')
    .in('tenant_id', tenantIds);

  for (const [label, tid] of Object.entries(TENANTS)) {
    console.log(`\n========== ${label} (${tid}) ==========`);
    const tRules = (ruleSets ?? []).filter(r => r.tenant_id === tid);
    const tPeriods = (periods ?? []).filter(p => p.tenant_id === tid);
    const tResults = (results ?? []).filter(r => r.tenant_id === tid);

    console.log(`rule_sets: ${tRules.length}`);
    for (const r of tRules) console.log(`  ${r.id} = ${JSON.stringify(r.name)}`);

    console.log(`periods: ${tPeriods.length}`);
    for (const p of tPeriods) console.log(`  ${p.id} | ${p.label} | ${p.period_type} | ${p.start_date}..${p.end_date} | status=${p.status}`);

    console.log(`calculation_results: ${tResults.length} rows total`);
    // Group by (rule_set_id, period_id)
    const grouping: Record<string, { rs: string; p: string; rows: number; sum: number }> = {};
    for (const r of tResults) {
      const key = `${r.rule_set_id}|${r.period_id}`;
      if (!grouping[key]) grouping[key] = { rs: r.rule_set_id!, p: r.period_id!, rows: 0, sum: 0 };
      grouping[key].rows++;
      grouping[key].sum += Number(r.total_payout ?? 0);
    }
    console.log(`  rule_set × period combinations: ${Object.keys(grouping).length}`);
    for (const k of Object.keys(grouping).sort()) {
      const g = grouping[k];
      const rsName = tRules.find(r => r.id === g.rs)?.name ?? '<unknown>';
      const pLabel = tPeriods.find(p => p.id === g.p)?.label ?? '<unknown>';
      console.log(`  rs=${rsName} | period=${pLabel} | rows=${g.rows} | sum=${g.sum.toFixed(2)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
