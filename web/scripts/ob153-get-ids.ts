import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  const { data: rs } = await sb.from('rule_sets').select('id, name, status').eq('tenant_id', T);
  console.log('Rule sets:', JSON.stringify(rs, null, 2));

  const { data: periods } = await sb.from('periods').select('id, label, canonical_key, status').eq('tenant_id', T).order('canonical_key');
  console.log('\nPeriods:', JSON.stringify(periods, null, 2));
}

run();
