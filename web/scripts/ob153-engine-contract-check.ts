import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  const { count: rs } = await sb.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', T);
  const { data: rsData } = await sb.from('rule_sets').select('id, name, status, components').eq('tenant_id', T);
  const compCount = rsData?.reduce((sum, r) => {
    const c = r.components;
    if (Array.isArray(c)) return sum + c.length;
    if (c?.components && Array.isArray(c.components)) return sum + c.components.length;
    return sum;
  }, 0) || 0;

  const { count: ent } = await sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', T);
  const { count: per } = await sb.from('periods').select('id', { count: 'exact', head: true }).eq('tenant_id', T);
  const { count: cd } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', T);
  const { count: asgn } = await sb.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', T);

  console.log('ENGINE CONTRACT:');
  console.log(`  rule_sets: ${rs} (components: ${compCount})`);
  console.log(`  entities: ${ent}`);
  console.log(`  periods: ${per}`);
  console.log(`  committed_data: ${cd}`);
  console.log(`  assignments: ${asgn}`);

  const allGood = (rs || 0) > 0 && compCount > 0 && (ent || 0) > 0 && (per || 0) > 0 && (cd || 0) > 0 && (asgn || 0) > 0;
  console.log(`\nAll non-zero: ${allGood ? 'PASS' : 'FAIL'}`);

  // Show periods
  const { data: periods } = await sb.from('periods').select('label, canonical_key, status').eq('tenant_id', T).order('canonical_key');
  console.log('\nPeriods:', JSON.stringify(periods));

  // Show rule sets
  console.log('\nRule sets:', rsData?.map(r => `${r.name} (${r.status})`).join(', '));
}

run();
