import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  // Check batch IDs
  const { data: batches } = await sb.from('calculation_results')
    .select('batch_id, created_at, payout_amount')
    .eq('tenant_id', LAB_TENANT)
    .order('created_at', { ascending: true })
    .limit(5);

  console.log('Sample results:', JSON.stringify(batches, null, 2));

  // Get distinct batch_ids with counts
  const { data: all } = await sb.from('calculation_results')
    .select('batch_id, payout_amount')
    .eq('tenant_id', LAB_TENANT);

  const batchCounts = new Map<string, { count: number; total: number }>();
  for (const r of all || []) {
    const bid = r.batch_id || 'null';
    const existing = batchCounts.get(bid);
    if (existing) { existing.count++; existing.total += Number(r.payout_amount) || 0; }
    else batchCounts.set(bid, { count: 1, total: Number(r.payout_amount) || 0 });
  }

  console.log('\nBatch breakdown:');
  for (const [bid, info] of Array.from(batchCounts.entries())) {
    console.log(`  ${bid}: ${info.count} results, $${info.total.toFixed(2)}`);
  }
}

run();
