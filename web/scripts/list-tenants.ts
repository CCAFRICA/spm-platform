import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb.from('tenants').select('id, name, status').order('name');
  console.log('all tenants:');
  for (const t of (data ?? [])) console.log(`  ${t.id} | ${t.name} | status=${t.status}`);
})();
