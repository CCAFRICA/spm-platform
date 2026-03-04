import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Find optica tenant
  const { data: tenants } = await sb.from('tenants').select('id, slug, name').ilike('slug', '%optica%');
  if (!tenants || tenants.length === 0) {
    const { data: all } = await sb.from('tenants').select('id, slug, name');
    console.log('No optica tenant found. All tenants:', JSON.stringify(all?.map(t => ({ slug: t.slug, name: t.name }))));
    return;
  }
  const t = tenants[0];
  console.log('Tenant:', t.slug, t.name, t.id);

  // Engine Contract verification
  const { count: rs } = await sb.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
  const { data: rsData } = await sb.from('rule_sets').select('id, name, components').eq('tenant_id', t.id).limit(1);
  const comp = rsData?.[0]?.components;
  const compCount = comp ? (Array.isArray(comp) ? comp.length : typeof comp) : 'null';
  const { count: ent } = await sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
  const { count: per } = await sb.from('periods').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
  const { count: bound } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).not('entity_id', 'is', null);
  const { count: srcDate } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).not('source_date', 'is', null);
  const { count: asgn } = await sb.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
  const { count: totalData } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);

  console.log('\n--- ENGINE CONTRACT ---');
  console.log('rule_sets:', rs);
  console.log('rule_set_name:', rsData?.[0]?.name);
  console.log('component_count:', compCount);
  console.log('entities:', ent);
  console.log('periods:', per);
  console.log('bound_data_rows (entity_id NOT NULL):', bound);
  console.log('source_date_rows:', srcDate);
  console.log('assignments:', asgn);
  console.log('total_committed_data:', totalData);

  // Show components shape if available
  if (comp) {
    console.log('\ncomponents typeof:', typeof comp);
    console.log('components isArray:', Array.isArray(comp));
    if (Array.isArray(comp)) {
      console.log('First component keys:', comp[0] ? Object.keys(comp[0]) : 'empty array');
    } else if (typeof comp === 'object') {
      console.log('components keys:', Object.keys(comp));
    }
  }
}

run();
