import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Get ALL distinct tenant_ids from calculation_results
  const allResults: Array<{tenant_id: string; payout_amount: number}> = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('tenant_id, payout_amount')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allResults.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`Fetched ${allResults.length} total results`);

  const tenants = new Map<string, { count: number; total: number }>();
  for (const r of allResults) {
    const tid = r.tenant_id;
    const e = tenants.get(tid);
    const amt = Number(r.payout_amount) || 0;
    if (e) { e.count++; e.total += amt; }
    else tenants.set(tid, { count: 1, total: amt });
  }

  for (const [tid, info] of Array.from(tenants.entries())) {
    console.log(`${tid}: ${info.count} results, $${info.total.toFixed(2)}`);
  }
}

run();
