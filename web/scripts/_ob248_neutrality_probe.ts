import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const TENANTS = {
  BCL: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
  Meridian: '5035b1e8-0754-4527-b7ec-9f93f85e4c79',
  MIR: '972c8eb0-e3ae-4e4c-ad30-8b34804c893a',
};
(async () => {
  for (const [name, tid] of Object.entries(TENANTS)) {
    const { data: rs } = await sb.from('rule_sets').select('id, name, status').eq('tenant_id', tid).order('name');
    const { data: periods } = await sb.from('periods').select('id, label, canonical_key').eq('tenant_id', tid).order('start_date');
    console.log(`\n=== ${name} (${tid}) — ${rs?.length ?? 0} rule_sets, ${periods?.length ?? 0} periods ===`);
    for (const r of rs ?? []) console.log(`  rule_set ${r.id}  [${r.status}]  ${r.name}`);
    console.log(`  periods: ${(periods ?? []).map(p => p.canonical_key ?? p.label).join(', ')}`);
    // current calc_results grand total per tenant (baseline before recompute)
    const { data: cr } = await sb.from('calculation_results').select('total_payout, rule_set_id').eq('tenant_id', tid);
    const byRs: Record<string, number> = {};
    for (const c of cr ?? []) byRs[c.rule_set_id] = (byRs[c.rule_set_id] ?? 0) + Number(c.total_payout);
    for (const [rsId, tot] of Object.entries(byRs)) console.log(`  BASELINE calc_results total rule_set=${rsId}: ${tot.toFixed(2)}`);
    console.log(`  BASELINE grand total (all rule_sets): ${(cr ?? []).reduce((s, c) => s + Number(c.total_payout), 0).toFixed(2)}`);
  }
})().catch(e => console.log('probe threw:', e instanceof Error ? e.message : String(e)));
