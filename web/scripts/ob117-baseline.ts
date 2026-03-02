import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

  const { data: results } = await sb.from('calculation_results')
    .select('rule_set_id, total_payout, components')
    .eq('tenant_id', tenantId);

  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  const names = new Map(ruleSets?.map(r => [r.id, r.name]) || []);

  const byRs: Record<string, { count: number; dbTotal: number; compTotal: number }> = {};
  for (const r of (results || [])) {
    const name = names.get(r.rule_set_id) || r.rule_set_id;
    if (!byRs[name]) byRs[name] = { count: 0, dbTotal: 0, compTotal: 0 };
    byRs[name].count++;
    byRs[name].dbTotal += r.total_payout || 0;
    const comps = r.components as any[] || [];
    byRs[name].compTotal += comps.reduce((s: number, c: any) => s + (c.payout || 0), 0);
  }

  console.log('BASELINE CALCULATION RESULTS:');
  for (const [name, data] of Object.entries(byRs).sort()) {
    console.log(`  ${name}: ${data.count} results, DB total=$${data.dbTotal.toFixed(2)}, Component total=$${data.compTotal.toFixed(2)}`);
  }
  console.log(`\nGRAND TOTAL (DB): $${Object.values(byRs).reduce((s, d) => s + d.dbTotal, 0).toFixed(2)}`);
  console.log(`GRAND TOTAL (Component): $${Object.values(byRs).reduce((s, d) => s + d.compTotal, 0).toFixed(2)}`);
}
main();
