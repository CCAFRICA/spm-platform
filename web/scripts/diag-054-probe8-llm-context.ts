import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
(async () => {
  const { data } = await sb.from('rule_sets').select('*').eq('tenant_id', BCL).eq('status', 'active').order('updated_at', { ascending: false }).limit(1);
  const r = (data ?? [])[0];
  if (!r) { console.log('no rule_set'); return; }
  console.log('Rule set columns:', Object.keys(r));
  console.log();
  console.log('metadata:');
  console.log(JSON.stringify(r.metadata, null, 2));
})();
