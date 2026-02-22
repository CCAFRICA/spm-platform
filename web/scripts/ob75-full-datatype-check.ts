import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Paginated fetch of ALL data_type + entity_id combos for January
  const PAGE = 10000;
  const typeCounts: Record<string, number> = {};
  const typeEntityCounts: Record<string, number> = {};
  const typeNullCounts: Record<string, number> = {};
  const batchCounts: Record<string, number> = {};
  let total = 0;
  let page = 0;

  while (true) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data } = await supabase
      .from('committed_data')
      .select('data_type, entity_id, import_batch_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', JAN_PERIOD_ID)
      .range(from, to);

    if (!data || data.length === 0) break;
    total += data.length;

    for (const r of data) {
      typeCounts[r.data_type] = (typeCounts[r.data_type] || 0) + 1;
      if (r.entity_id) {
        typeEntityCounts[r.data_type] = (typeEntityCounts[r.data_type] || 0) + 1;
      } else {
        typeNullCounts[r.data_type] = (typeNullCounts[r.data_type] || 0) + 1;
      }
      const bid = r.import_batch_id || 'null';
      batchCounts[bid] = (batchCounts[bid] || 0) + 1;
    }

    if (data.length < PAGE) break;
    page++;
    process.stdout.write(`  Page ${page}... (${total} rows so far)\r`);
  }

  console.log(`\n=== FULL January 2024 DATA TYPE BREAKDOWN (${total} rows) ===\n`);
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const entityCount = typeEntityCounts[type] || 0;
    const nullCount = typeNullCounts[type] || 0;
    console.log(`  ${type}: ${count} rows (${entityCount} entity-level, ${nullCount} store-level)`);
  }

  console.log('\n=== IMPORT BATCH distribution ===');
  for (const [bid, count] of Object.entries(batchCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bid}: ${count} rows`);
  }

  // Sample from each data type
  console.log('\n=== SAMPLE ROW_DATA KEYS per data type ===');
  for (const type of Object.keys(typeCounts)) {
    const { data: sample } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', JAN_PERIOD_ID)
      .eq('data_type', type)
      .limit(1);

    if (sample && sample[0]) {
      const rd = sample[0].row_data as Record<string, unknown>;
      console.log(`  ${type}: ${Object.keys(rd).join(', ')}`);
    }
  }
}

run().catch(console.error);
