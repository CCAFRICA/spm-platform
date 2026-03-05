import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  const { count } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', LAB_TENANT);

  const { data: totals } = await sb.from('calculation_results')
    .select('payout_amount')
    .eq('tenant_id', LAB_TENANT);

  const total = totals?.reduce((sum, r) => sum + (Number(r.payout_amount) || 0), 0) || 0;

  console.log('LAB REGRESSION:');
  console.log(`  Results: ${count} (expect 268)`);
  console.log(`  Total payout: $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (expect $8,498,311.77)`);

  const countOk = count === 268;
  const payoutOk = Math.abs(total - 8498311.77) < 1;
  console.log(`  Count: ${countOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Payout: ${payoutOk ? 'PASS' : 'FAIL'}`);
}

run();
