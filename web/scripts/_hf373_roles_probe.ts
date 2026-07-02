import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data } = await sb.from('profiles').select('role');
  const counts: Record<string, number> = {};
  for (const p of data ?? []) counts[p.role] = (counts[p.role] ?? 0) + 1;
  console.log(counts);
  const { data: one } = await sb.from('profiles').select('*').limit(1);
  console.log('profile columns:', Object.keys(one?.[0] ?? {}).join(','));
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
