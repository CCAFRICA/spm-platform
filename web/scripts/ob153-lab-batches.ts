import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  const allResults: Array<{total_payout: number; batch_id: string; created_at: string}> = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('total_payout, batch_id, created_at')
      .eq('tenant_id', LAB)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allResults.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }

  const batches = new Map<string, { count: number; total: number; created: string }>();
  for (const r of allResults) {
    const bid = r.batch_id || 'null';
    const e = batches.get(bid);
    const amt = Number(r.total_payout) || 0;
    if (e) { e.count++; e.total += amt; }
    else batches.set(bid, { count: 1, total: amt, created: r.created_at });
  }

  console.log('LAB batches:');
  for (const [bid, info] of Array.from(batches.entries()).sort((a, b) => a[1].created.localeCompare(b[1].created))) {
    console.log(`  ${bid.slice(0,8)}... : ${info.count} results, $${info.total.toFixed(2)} (${info.created.slice(0,10)})`);
  }

  // Find the batch with 268 results or closest
  const closest = Array.from(batches.entries()).sort((a, b) => Math.abs(a[1].count - 268) - Math.abs(b[1].count - 268))[0];
  if (closest) {
    console.log(`\nClosest to 268: ${closest[0].slice(0,8)}... with ${closest[1].count} results, $${closest[1].total.toFixed(2)}`);
  }
}

run();
