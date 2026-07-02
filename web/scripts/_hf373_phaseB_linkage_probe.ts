import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const T = '5b078b52-55c9-4612-8f86-96038c198bfe';
(async () => {
  for (const dt of ['transaction', 'entity', 'reference']) {
    const { count: total } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', T).eq('data_type', dt);
    const { count: linked } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', T).eq('data_type', dt).not('entity_id', 'is', null);
    console.log(`${dt}: total=${total} linked=${linked}`);
  }
  const { data: periods } = await sb.from('periods').select('id, canonical_key, start_date, end_date').eq('tenant_id', T).order('start_date');
  for (const p of periods ?? []) console.log(`period ${p.id} ${p.canonical_key} ${p.start_date}..${p.end_date}`);
})().catch(e => console.log('threw:', e instanceof Error ? e.message : String(e)));
