import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data: t } = await sb.from('tenants').select('id').eq('slug', 'caribe-financial').single();
  if (!t) { console.log('LAB not found'); return; }

  const { data: r } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', t.id);
  const total = (r || []).reduce((s, x) => s + Number(x.total_payout), 0);
  console.log('LAB:', (r || []).length, 'results,', total.toFixed(2));
  console.log('Expected: 268 results, 8498311.77');

  const { count: wp } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).not('period_id', 'is', null);
  const { count: tot } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
  console.log('Committed data total:', tot, 'with period_id:', wp);

  const pass = (r || []).length === 268 && Math.abs(total - 8498311.77) < 0.10;
  console.log(pass ? 'BASELINE: PASS' : '*** BASELINE FAIL ***');
}

run();
