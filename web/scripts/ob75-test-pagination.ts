import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Test different page sizes
  for (const pageSize of [100, 500, 1000, 2000, 5000]) {
    const { data } = await supabase
      .from('committed_data')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', JAN_PERIOD_ID)
      .range(0, pageSize - 1);

    console.log(`range(0, ${pageSize - 1}): returned ${data?.length ?? 0} rows`);
  }

  // Test pagination with 1000 chunks
  console.log('\n=== Pagination test with 1000-row chunks ===');
  let total = 0;
  let page = 0;
  while (page < 5) {
    const from = page * 1000;
    const to = from + 999;
    const { data } = await supabase
      .from('committed_data')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', JAN_PERIOD_ID)
      .range(from, to);

    const count = data?.length ?? 0;
    total += count;
    console.log(`  Page ${page} (${from}-${to}): ${count} rows (cumulative: ${total})`);
    if (count < 1000) break;
    page++;
  }
}

run().catch(console.error);
