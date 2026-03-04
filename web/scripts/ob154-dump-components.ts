import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  const { data: rs } = await sb.from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', T)
    .limit(1);
  if (rs?.[0]) {
    console.log(JSON.stringify(rs[0].components, null, 2));
  }
}
run().catch(console.error);
