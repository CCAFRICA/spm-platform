import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  // Get batch IDs for LAB
  const allResults: Array<{batch_id: string; payout_amount: number; period_id: string}> = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('batch_id, payout_amount, period_id')
      .eq('tenant_id', LAB)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allResults.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`Total LAB results: ${allResults.length}`);

  // Group by batch_id
  const batches = new Map<string, { count: number; total: number }>();
  for (const r of allResults) {
    const bid = r.batch_id || 'null';
    const e = batches.get(bid);
    const amt = Number(r.payout_amount) || 0;
    if (e) { e.count++; e.total += amt; }
    else batches.set(bid, { count: 1, total: amt });
  }

  console.log('\nBatches:');
  for (const [bid, info] of Array.from(batches.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${bid}: ${info.count} results, $${info.total.toFixed(2)}`);
  }

  // Group by period_id
  const periods = new Map<string, number>();
  for (const r of allResults) {
    periods.set(r.period_id || 'null', (periods.get(r.period_id || 'null') || 0) + 1);
  }
  console.log('\nPeriods:');
  for (const [pid, count] of Array.from(periods.entries())) {
    console.log(`  ${pid}: ${count}`);
  }
}

run();
