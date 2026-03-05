import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // calculation_results
  const { count: crCount } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);

  // entity_period_outcomes
  const { count: epoCount } = await sb.from('entity_period_outcomes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);

  // Sample result
  const { data: sample } = await sb.from('calculation_results')
    .select('total_payout, components, entity_id')
    .eq('tenant_id', T)
    .gt('total_payout', 0)
    .limit(1);

  console.log('RENDERED RESULT VERIFICATION:');
  console.log(`  calculation_results: ${crCount}`);
  console.log(`  entity_period_outcomes: ${epoCount}`);

  if (sample && sample.length > 0) {
    console.log(`  Sample result: total_payout=${sample[0].total_payout}`);
    const comps = sample[0].components as any[];
    if (comps) {
      for (const c of comps) {
        console.log(`    ${c.name}: ${c.value ?? c.payout ?? 0}`);
      }
    }
  }

  // Total payout
  let totalPayout = 0;
  let offset = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', T)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) totalPayout += Number(r.total_payout) || 0;
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`\n  Total payout: MX$${totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Target: MX$1,253,832.00`);
  console.log(`  Status: ${totalPayout > 0 ? 'NON-ZERO RESULT ✓' : 'ZERO ✗'}`);
}

run();
