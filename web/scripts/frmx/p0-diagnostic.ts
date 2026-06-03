import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: tenant } = await sb.from('tenants').select('id, name, slug, currency, locale').eq('slug', 'sabor-grupo');
  console.log('Existing sabor-grupo tenant:', JSON.stringify(tenant));
  if (tenant && tenant.length) {
    const tid = tenant[0].id;
    for (const t of ['entities','committed_data','rule_sets','rule_set_assignments','calculation_results','calculation_batches','entity_relationships','periods','profiles']) {
      const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
      console.log(`  ${t}: ${count ?? 0}`);
    }
  }
  const { data: tenants } = await sb.from('tenants').select('slug, name').order('slug');
  console.log('All tenants:', (tenants||[]).map((t:any)=>t.slug).join(', '));
}
main().catch(e => { console.error(e.message); process.exit(1); });
