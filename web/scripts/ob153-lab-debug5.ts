import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Try simple queries
  const { data, error, count } = await sb.from('calculation_results')
    .select('*', { count: 'exact' })
    .limit(3);

  console.log('error:', error?.message);
  console.log('count:', count);
  console.log('data length:', data?.length);
  if (data && data.length > 0) {
    console.log('columns:', Object.keys(data[0]));
    console.log('sample:', JSON.stringify(data[0], null, 2));
  }

  // Check entity_period_outcomes too
  const { count: epoCount, error: epoErr } = await sb.from('entity_period_outcomes')
    .select('id', { count: 'exact', head: true });
  console.log('\nentity_period_outcomes count:', epoCount, 'error:', epoErr?.message);
}

run();
