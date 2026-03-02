import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await sb.from('tenants').select('id, name').order('name');
  for (const t of data || []) console.log(`  ${t.name}: ${t.id}`);
  
  // Check which tenants have calculation results
  console.log('\n=== Tenants with calculation results ===');
  const { data: results } = await sb.rpc('', {}).catch(() => ({ data: null }));
  // Simpler: just query distinct tenant_ids from calculation_results
  const { data: tenantIds } = await sb
    .from('calculation_results')
    .select('tenant_id')
    .limit(1000);
  
  const unique = new Set<string>();
  for (const r of tenantIds || []) unique.add(r.tenant_id);
  for (const tid of unique) {
    const tenant = (data || []).find(t => t.id === tid);
    const { count } = await sb.from('calculation_results').select('total_payout', { count: 'exact', head: true }).eq('tenant_id', tid);
    console.log(`  ${tenant?.name || tid}: ${count} results`);
  }
}
main().catch(console.error);
