import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Get distinct tenants
  const { data: all } = await sb.from('calculation_results')
    .select('tenant_id, total_payout')
    .limit(1000);

  const tenants = new Map<string, { count: number; total: number }>();
  for (const r of all || []) {
    const tid = r.tenant_id;
    const e = tenants.get(tid);
    const amt = Number(r.total_payout) || 0;
    if (e) { e.count++; e.total += amt; }
    else tenants.set(tid, { count: 1, total: amt });
  }

  console.log('Tenants with calculation results:');
  for (const [tid, info] of Array.from(tenants.entries())) {
    console.log(`  ${tid}: ${info.count} results, total: $${info.total.toFixed(2)}`);
  }

  // Also check the LAB tenant name
  const LAB = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
  const { data: labTenant } = await sb.from('tenants').select('name, slug').eq('id', LAB);
  console.log('\nLAB tenant:', JSON.stringify(labTenant));

  // Check ALL tenants
  const { data: allTenants } = await sb.from('tenants').select('id, name, slug').limit(20);
  console.log('\nAll tenants:');
  for (const t of allTenants || []) {
    console.log(`  ${t.id}: ${t.name} (${t.slug})`);
  }
}

run();
