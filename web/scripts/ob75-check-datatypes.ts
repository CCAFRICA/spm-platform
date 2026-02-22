import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Get all distinct data_types for January 2024
  const { data: rows } = await supabase
    .from('committed_data')
    .select('data_type, import_batch_id')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .limit(10000);

  const typeCounts: Record<string, number> = {};
  const batchCounts: Record<string, number> = {};
  for (const r of (rows ?? [])) {
    typeCounts[r.data_type] = (typeCounts[r.data_type] || 0) + 1;
    const bid = r.import_batch_id || 'null';
    batchCounts[bid] = (batchCounts[bid] || 0) + 1;
  }

  console.log('=== DATA TYPES for January 2024 (first 10K rows) ===');
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count} rows`);
  }

  console.log('\n=== IMPORT BATCH distribution ===');
  for (const [bid, count] of Object.entries(batchCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bid}: ${count} rows`);
  }

  // Check entity_id distribution
  const { data: nullEntityRows } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .is('entity_id', null)
    .limit(5000);

  const nullTypeCounts: Record<string, number> = {};
  for (const r of (nullEntityRows ?? [])) {
    nullTypeCounts[r.data_type] = (nullTypeCounts[r.data_type] || 0) + 1;
  }

  console.log('\n=== NULL entity_id rows (store-level) ===');
  for (const [type, count] of Object.entries(nullTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count} rows`);
  }

  // Check total for Jan with full count
  const { count: janTotal } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID);
  console.log(`\nTotal January 2024 rows: ${janTotal}`);

  // Sample a row to see what columns exist
  const { data: sample } = await supabase
    .from('committed_data')
    .select('data_type, entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .not('entity_id', 'is', null)
    .limit(1);

  if (sample && sample[0]) {
    console.log('\n=== SAMPLE ROW ===');
    console.log('data_type:', sample[0].data_type);
    console.log('entity_id:', sample[0].entity_id);
    const rd = sample[0].row_data as Record<string, unknown>;
    console.log('row_data keys:', Object.keys(rd).join(', '));
  }
}

run().catch(console.error);
