import { createClient } from '@supabase/supabase-js';

const MERIDIAN_TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function cleanup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Cleaning Meridian data (preserving rule_sets)...\n');

  // Delete in dependency order
  for (const table of ['committed_data', 'reference_items', 'reference_data', 'rule_set_assignments', 'entity_period_outcomes', 'calculation_results', 'periods', 'entities']) {
    const { error, count } = await supabase
      .from(table)
      .delete()
      .eq('tenant_id', MERIDIAN_TENANT_ID)
      .select('id', { count: 'exact' });
    if (error) {
      console.log(`  ${table}: ERROR — ${error.message}`);
    } else {
      console.log(`  ${table}: deleted ${count ?? 0} rows`);
    }
  }

  // Delete import batches
  const { count: batchCount } = await supabase
    .from('import_batches')
    .delete()
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .select('id', { count: 'exact' });
  console.log(`  import_batches: deleted ${batchCount ?? 0} rows`);

  // Verify rule_sets preserved
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', MERIDIAN_TENANT_ID);
  console.log(`\nRule sets preserved: ${rs?.length}`);
  rs?.forEach(r => console.log(`  - ${r.name} (${r.id})`));

  // Engine Contract state
  console.log('\nEngine Contract state:');
  for (const table of ['rule_sets', 'entities', 'committed_data', 'periods', 'rule_set_assignments']) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', MERIDIAN_TENANT_ID);
    console.log(`  ${table}: ${count}`);
  }
}

cleanup().catch(console.error);
