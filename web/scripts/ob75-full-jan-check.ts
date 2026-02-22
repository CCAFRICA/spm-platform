import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchAll(periodId: string) {
  const PAGE = 1000;
  const typeCounts: Record<string, { entity: number; store: number }> = {};
  const batchSet = new Set<string>();
  let total = 0;
  let page = 0;

  while (true) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data } = await supabase
      .from('committed_data')
      .select('data_type, entity_id, import_batch_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', periodId)
      .range(from, to);

    if (!data || data.length === 0) break;
    total += data.length;

    for (const r of data) {
      if (!typeCounts[r.data_type]) typeCounts[r.data_type] = { entity: 0, store: 0 };
      if (r.entity_id) typeCounts[r.data_type].entity++;
      else typeCounts[r.data_type].store++;
      if (r.import_batch_id) batchSet.add(r.import_batch_id);
    }

    if (data.length < PAGE) break;
    page++;
    if (page % 10 === 0) process.stdout.write(`  ${total} rows...\r`);
  }

  return { typeCounts, batchSet, total };
}

async function run() {
  console.log('Fetching all January 2024 data (1000-row pages)...');
  const { typeCounts, batchSet, total } = await fetchAll(JAN_PERIOD_ID);

  console.log(`\n=== JANUARY 2024 DATA TYPES (${total} total rows) ===\n`);
  for (const [type, counts] of Object.entries(typeCounts).sort((a, b) => (b[1].entity + b[1].store) - (a[1].entity + a[1].store))) {
    console.log(`  ${type}: ${counts.entity + counts.store} rows (${counts.entity} entity, ${counts.store} store-level)`);
  }

  console.log(`\nBatches: ${Array.from(batchSet).join(', ')}`);

  // Check unique entities with data for January
  const entitySet = new Set<string>();
  let entityPage = 0;
  while (true) {
    const from = entityPage * 1000;
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', JAN_PERIOD_ID)
      .not('entity_id', 'is', null)
      .range(from, from + 999);

    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.entity_id) entitySet.add(r.entity_id);
    }
    if (data.length < 1000) break;
    entityPage++;
  }

  console.log(`\nUnique entities with January data: ${entitySet.size}`);
}

run().catch(console.error);
