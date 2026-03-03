// OB-143 Phase 0: Engine Contract verification
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob143-engine-contract-verify.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
  console.log('='.repeat(60));
  console.log('OB-143 ENGINE CONTRACT VERIFICATION');
  console.log('='.repeat(60));

  // Find tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%')
    .limit(1)
    .single();

  if (!tenant) {
    console.log('ERROR: No tenant with slug like optica found');
    return;
  }
  console.log(`\nTenant: ${tenant.name} (${tenant.id})`);
  const tid = tenant.id;

  // Entity count
  const { count: entityCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  // Period count
  const { count: periodCount } = await supabase
    .from('periods')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  // Active plans
  const { data: activePlans } = await supabase
    .from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', tid)
    .eq('status', 'active');

  // Component count from active rule set
  const activeRS = activePlans?.[0];
  const components = activeRS?.components;
  const componentCount = Array.isArray(components) ? components.length : 0;

  // Assignment count
  const { count: assignmentCount } = await supabase
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  // Bound data rows (entity_id AND period_id not null)
  const { count: boundDataRows } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null);

  // Orphaned data rows (entity_id OR period_id is null)
  const { count: orphanedRows1 } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .is('entity_id', null);

  const { count: orphanedRows2 } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .is('period_id', null);

  // Deduplicate (some may have both null)
  const { count: totalData } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  const orphanedDataRows = (totalData ?? 0) - (boundDataRows ?? 0);

  console.log('\n--- ENGINE CONTRACT VALUES ---');
  console.log(`  entity_count:      ${entityCount} (expected: 741)`);
  console.log(`  period_count:      ${periodCount} (expected: 4)`);
  console.log(`  active_plans:      ${activePlans?.length} (expected: 1)`);
  console.log(`  component_count:   ${componentCount} (expected: 6)`);
  console.log(`  assignment_count:  ${assignmentCount} (expected: 741)`);
  console.log(`  bound_data_rows:   ${boundDataRows} (expected: ~114807)`);
  console.log(`  orphaned_data_rows:${orphanedDataRows} (expected: ~4340)`);

  // Verify components column directly
  console.log('\n--- COMPONENTS COLUMN VERIFICATION ---');
  if (activeRS) {
    console.log(`  Rule set ID: ${activeRS.id}`);
    console.log(`  Rule set name: ${activeRS.name}`);
    console.log(`  Rule set status: ${activeRS.status}`);
    console.log(`  typeof components: ${typeof activeRS.components}`);
    console.log(`  Array.isArray(components): ${Array.isArray(activeRS.components)}`);
    console.log(`  components length: ${componentCount}`);
    console.log(`  components JSON:`);
    if (Array.isArray(activeRS.components)) {
      for (const c of activeRS.components as any[]) {
        console.log(`    - ${c.name || c.id}: ${c.type || 'no type'}`);
      }
    }
    console.log(`\n  Full components:\n${JSON.stringify(activeRS.components, null, 2)}`);
  } else {
    console.log('  ERROR: No active rule set found');
  }

  // Periods detail
  console.log('\n--- PERIODS ---');
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date')
    .eq('tenant_id', tid)
    .order('start_date');
  for (const p of periods || []) {
    console.log(`  ${p.label} (${p.canonical_key}) ${p.start_date} → ${p.end_date}`);
  }

  console.log('\n' + '='.repeat(60));
  const allPass = entityCount === 741 && periodCount === 4 && (activePlans?.length ?? 0) === 1 && componentCount === 6 && assignmentCount === 741;
  console.log(`ENGINE CONTRACT: ${allPass ? 'FULFILLED' : 'CHECK VALUES'}`);
  console.log('='.repeat(60));
}

verify().catch(console.error);
