import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  // Check all tenants with calculation_results
  const { data } = await sb.from('calculation_results')
    .select('tenant_id')
    .limit(10);

  const tenants = new Set((data || []).map(r => r.tenant_id));
  console.log('Tenants with results:', Array.from(tenants));

  // Count per tenant
  for (const tid of Array.from(tenants)) {
    const { count } = await sb.from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid);
    console.log(`  ${tid}: ${count} results`);
  }

  // Check LAB specifically
  const { count: labCount } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', LAB_TENANT);
  console.log(`\nLAB tenant ${LAB_TENANT}: ${labCount} results`);

  // Get ALL results count
  const { count: totalCount } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true });
  console.log(`Total results across all tenants: ${totalCount}`);
}

run();
