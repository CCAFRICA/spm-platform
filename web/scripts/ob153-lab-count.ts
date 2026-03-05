import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  // Page through ALL LAB results
  let total = 0;
  let totalPayout = 0;
  let offset = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('total_payout, batch_id, period_id')
      .eq('tenant_id', LAB)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    total += data.length;
    for (const r of data) totalPayout += Number(r.total_payout) || 0;
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`LAB results: ${total}`);
  console.log(`LAB total_payout: $${totalPayout.toFixed(2)}`);
  console.log(`Expected: 268 results, $8,498,311.77`);
  console.log(`Count OK: ${total === 268}`);
  console.log(`Payout OK: ${Math.abs(totalPayout - 8498311.77) < 1}`);
}

run();
