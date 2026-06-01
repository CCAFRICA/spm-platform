import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data, count } = await sb.from('periods').select('*', { count: 'exact' }).limit(3);
  console.log('periods count:', count);
  console.log('first 3:', JSON.stringify(data, null, 2));

  const { data: results, count: rcount } = await sb.from('calculation_results').select('tenant_id, rule_set_id, period_id, total_payout', { count: 'exact' }).limit(3);
  console.log('\ncalculation_results count:', rcount);
  console.log('first 3:', JSON.stringify(results, null, 2));

  const { data: batches } = await sb.from('calculation_batches').select('id, tenant_id, period_id, rule_set_id, lifecycle_state, created_at').order('created_at', { ascending: false }).limit(10);
  console.log('\nrecent batches:', JSON.stringify(batches, null, 2));
})();
