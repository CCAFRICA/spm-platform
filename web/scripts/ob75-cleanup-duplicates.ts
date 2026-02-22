import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
// The batch WITH AI context (3rd import)
const KEEP_BATCH = '24dfad4b-fa4e-4e34-b81d-5c05a3aaad9d';
// The batches WITHOUT AI context (1st and 2nd imports — duplicates)
const DELETE_BATCHES = [
  '82dff91e-8d8b-4702-aec8-4427231b02bf',
  'ba7c8ec2-ab02-464f-a52e-1d91e4948b27',
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('=== OB-75: Clean up duplicate import data ===\n');
  console.log(`Keeping batch: ${KEEP_BATCH} (has AI context)`);
  console.log(`Deleting batches: ${DELETE_BATCHES.join(', ')}\n`);

  // Count before
  const { count: beforeCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`committed_data before: ${beforeCount}`);

  // Delete committed_data from duplicate batches
  for (const batchId of DELETE_BATCHES) {
    const { error, count } = await supabase
      .from('committed_data')
      .delete({ count: 'exact' })
      .eq('tenant_id', TENANT_ID)
      .eq('import_batch_id', batchId);

    if (error) {
      console.log(`  Batch ${batchId}: ERROR — ${error.message}`);
    } else {
      console.log(`  Batch ${batchId}: deleted ${count} rows`);
    }
  }

  // Also delete the duplicate import_batches records
  for (const batchId of DELETE_BATCHES) {
    await supabase.from('import_batches').delete().eq('id', batchId);
  }

  // Count after
  const { count: afterCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\ncommitted_data after: ${afterCount}`);
  console.log(`Removed: ${(beforeCount ?? 0) - (afterCount ?? 0)} duplicate rows`);

  // Also clear old calculation results
  const { count: calcDeleted } = await supabase
    .from('entity_period_outcomes')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nCleared ${calcDeleted} entity_period_outcomes`);

  const { count: resultsDeleted } = await supabase
    .from('calculation_results')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT_ID);
  console.log(`Cleared ${resultsDeleted} calculation_results`);

  const { count: batchesDeleted } = await supabase
    .from('calculation_batches')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT_ID);
  console.log(`Cleared ${batchesDeleted} calculation_batches`);

  // Verify January data
  const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
  const { count: janCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID);
  console.log(`\nJanuary 2024 rows remaining: ${janCount}`);
}

run().catch(console.error);
