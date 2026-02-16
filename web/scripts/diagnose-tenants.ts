import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Tenants
  const { data: tenants } = await sb.from('tenants').select('id, name, slug, settings, features, currency, locale');
  console.log('=== TENANTS ===');
  for (const t of tenants || []) {
    const s = (t.settings || {}) as Record<string, unknown>;
    console.log(JSON.stringify({
      id: t.id,
      name: t.name,
      slug: t.slug,
      country: s.country_code,
      industry: s.industry,
      currency: t.currency,
      locale: t.locale,
      has_demo_users: !!(s.demo_users),
    }));
  }

  // 2. Entity counts per tenant
  const { data: entities } = await sb.from('entities').select('tenant_id, entity_type');
  const counts: Record<string, Record<string, number>> = {};
  entities?.forEach(e => {
    counts[e.tenant_id] = counts[e.tenant_id] || {};
    counts[e.tenant_id][e.entity_type] = (counts[e.tenant_id][e.entity_type] || 0) + 1;
  });
  console.log('\n=== ENTITY COUNTS PER TENANT ===');
  for (const [tid, c] of Object.entries(counts)) {
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    console.log(`  ${tid}: total=${total}`, JSON.stringify(c));
  }

  // 3. Profiles
  const { data: profiles } = await sb.from('profiles').select('id, display_name, tenant_id, scope_level, role, email');
  console.log('\n=== PROFILES ===');
  for (const p of profiles || []) {
    console.log(JSON.stringify({
      name: p.display_name,
      email: p.email,
      tenant: p.tenant_id,
      scope: p.scope_level,
      role: p.role,
    }));
  }

  // 4. Rule sets
  const { data: rulesets } = await sb.from('rule_sets').select('id, name, tenant_id, status');
  console.log('\n=== RULE SETS ===');
  for (const r of rulesets || []) {
    console.log(JSON.stringify({ id: r.id.substring(0, 8), name: r.name, tenant: r.tenant_id, status: r.status }));
  }

  // 5. Committed data counts
  const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true });
  const { data: cdData } = await sb.from('committed_data').select('tenant_id, period_id');
  const cdByTenant: Record<string, number> = {};
  const cdByPeriod: Record<string, number> = {};
  cdData?.forEach(d => {
    cdByTenant[d.tenant_id] = (cdByTenant[d.tenant_id] || 0) + 1;
    const key = `${d.tenant_id}:${d.period_id}`;
    cdByPeriod[key] = (cdByPeriod[key] || 0) + 1;
  });
  console.log('\n=== COMMITTED DATA ===');
  console.log('Total:', cdCount);
  console.log('By tenant:', JSON.stringify(cdByTenant));
  console.log('By tenant:period:', JSON.stringify(cdByPeriod));

  // 6. Calculation results
  const { count: crCount } = await sb.from('calculation_results').select('*', { count: 'exact', head: true });
  const { data: crData } = await sb.from('calculation_results').select('tenant_id, batch_id, total_payout');
  const crByTenant: Record<string, { count: number; totalPayout: number }> = {};
  crData?.forEach(d => {
    if (!crByTenant[d.tenant_id]) crByTenant[d.tenant_id] = { count: 0, totalPayout: 0 };
    crByTenant[d.tenant_id].count++;
    crByTenant[d.tenant_id].totalPayout += d.total_payout || 0;
  });
  console.log('\n=== CALCULATION RESULTS ===');
  console.log('Total:', crCount);
  console.log('By tenant:', JSON.stringify(crByTenant));

  // 7. Calc batches
  const { data: batches } = await sb.from('calculation_batches').select('id, tenant_id, period_id, lifecycle_state, entity_count');
  console.log('\n=== CALC BATCHES ===');
  for (const b of batches || []) {
    console.log(JSON.stringify({
      id: b.id.substring(0, 8),
      tenant: b.tenant_id,
      period: b.period_id,
      state: b.lifecycle_state,
      entities: b.entity_count,
    }));
  }

  // 8. Entity period outcomes
  const { count: epoCount } = await sb.from('entity_period_outcomes').select('*', { count: 'exact', head: true });
  console.log('\n=== ENTITY PERIOD OUTCOMES ===');
  console.log('Total:', epoCount);

  // 9. Rule set assignments
  const { count: rsaCount } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true });
  const { data: rsaData } = await sb.from('rule_set_assignments').select('tenant_id');
  const rsaByTenant: Record<string, number> = {};
  rsaData?.forEach(d => { rsaByTenant[d.tenant_id] = (rsaByTenant[d.tenant_id] || 0) + 1; });
  console.log('\n=== RULE SET ASSIGNMENTS ===');
  console.log('Total:', rsaCount);
  console.log('By tenant:', JSON.stringify(rsaByTenant));

  // 10. Entity relationships
  const { count: relCount } = await sb.from('entity_relationships').select('*', { count: 'exact', head: true });
  const { data: relData } = await sb.from('entity_relationships').select('tenant_id');
  const relByTenant: Record<string, number> = {};
  relData?.forEach(d => { relByTenant[d.tenant_id] = (relByTenant[d.tenant_id] || 0) + 1; });
  console.log('\n=== ENTITY RELATIONSHIPS ===');
  console.log('Total:', relCount);
  console.log('By tenant:', JSON.stringify(relByTenant));
}

main().catch(console.error);
