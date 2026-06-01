import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb.from('rule_sets').select('id, name, status, created_at, updated_at')
    .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
    .order('created_at', { ascending: false });
  console.log(`Total BCL rule_sets: ${data?.length ?? 0}`);
  for (const r of (data ?? [])) {
    console.log(`  id=${r.id} status=${r.status} created=${r.created_at} updated=${r.updated_at} name="${r.name}"`);
  }
})();
