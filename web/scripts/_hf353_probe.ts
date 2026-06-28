import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: t } = await sb.from('tenants').select('id, name, slug').order('name');
  console.log('tenants:'); for (const x of t ?? []) console.log(`  ${x.id}  ${x.name} / ${x.slug}`);
  const robles = (t ?? []).find(x => /robles|maquinaria/i.test(`${x.name} ${x.slug}`));
  console.log('\nRobles tenant:', robles ? `${robles.id} (${robles.name})` : 'NOT FOUND');
  if (robles) {
    for (const tbl of ['committed_data','entities','entity_relationships','rule_sets','calculation_results']) {
      const { count } = await sb.from(tbl).select('*', { count: 'exact', head: true }).eq('tenant_id', robles.id);
      console.log(`  ${tbl}: ${count}`);
    }
  }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
