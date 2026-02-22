import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('=== OB-75 Nuclear Clear for Pipeline Test Co ===\n');

  // Order matters — FK dependencies
  const tables = [
    'entity_period_outcomes',
    'calculation_results',
    'calculation_batches',
    'rule_set_assignments',
    'committed_data',
    'entities',
    'periods',
    'import_batches',
    'rule_sets',
  ];

  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('tenant_id', TENANT_ID);

    if (error) {
      console.log(`  ${table}: ERROR — ${error.message}`);
    } else {
      console.log(`  ${table}: deleted ${count ?? '?'} rows`);
    }
  }

  console.log('\n=== Nuclear clear complete ===');
  console.log('Pipeline Test Co is clean. Ready for re-import.');

  // Verify
  const { count } = await supabase
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);

  console.log(`\nVerification: entities remaining = ${count}`);
}

run().catch(console.error);
