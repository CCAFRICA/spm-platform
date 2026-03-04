/**
 * OB-154: Clean up duplicate committed_data from failed SCI execute attempt
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // The duplicate data_type is the one WITHOUT __suffix
  const dt = 'backttest_optometrista_mar2025_proveedores';
  const { count } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .eq('data_type', dt);
  console.log('Duplicate rows to delete:', count);

  // Get import batch
  const { data: sample } = await sb.from('committed_data')
    .select('import_batch_id')
    .eq('tenant_id', T)
    .eq('data_type', dt)
    .limit(1);
  const batchId = sample?.[0]?.import_batch_id;

  // Delete in batches of 200
  let deleted = 0;
  while (true) {
    const { data: rows } = await sb.from('committed_data')
      .select('id')
      .eq('tenant_id', T)
      .eq('data_type', dt)
      .limit(200);
    if (!rows || rows.length === 0) break;
    const ids = rows.map(r => r.id);
    await sb.from('committed_data').delete().in('id', ids);
    deleted += ids.length;
  }
  console.log('Deleted committed_data:', deleted);

  // Delete import batch
  if (batchId) {
    await sb.from('import_batches').delete().eq('id', batchId);
    console.log('Deleted import batch:', batchId);
  }

  // Also check for duplicate rule_set_assignments (from failed SCI attempt creating assignments)
  // The failed attempt may have also created assignments for a non-existent rule set
  const { count: assignCount } = await sb.from('rule_set_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);
  console.log('Current assignments:', assignCount);

  // Verify final counts
  const { count: cdCount } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);
  const { count: entityCount } = await sb.from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);
  const { count: batchCount } = await sb.from('import_batches')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);
  console.log('\nFinal state:');
  console.log(`  Entities: ${entityCount}`);
  console.log(`  Committed data: ${cdCount}`);
  console.log(`  Import batches: ${batchCount}`);
  console.log(`  Assignments: ${assignCount}`);
}

run().catch(console.error);
