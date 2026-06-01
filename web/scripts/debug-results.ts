import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const TID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
  const RID = '59f3be4d-3dac-450b-8aef-26c33fdc8028';
  const PID = '46cbc230-3d7f-480b-a0e7-199c0ea333f0';

  const { data, count } = await sb
    .from('calculation_results')
    .select('*', { count: 'exact' })
    .eq('tenant_id', TID)
    .eq('rule_set_id', RID)
    .eq('period_id', PID)
    .limit(3);
  console.log('count:', count);
  console.log('first 3:', JSON.stringify(data, null, 2).slice(0, 800));
})();
