import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: batches, error: bErr } = await sb.from('calculation_batches')
    .select('id, created_at')
    .eq('tenant_id', 'dfc1041e-7c39-4657-81e5-40b1cea5680c')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('Batches:', batches, 'err:', bErr);

  if (batches && batches[0]) {
    const { count } = await sb.from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batches[0].id);
    console.log('Results count for latest batch:', count);

    // Check a sample result
    const { data: sample } = await sb.from('calculation_results')
      .select('result_data')
      .eq('batch_id', batches[0].id)
      .limit(1);
    if (sample?.[0]) {
      const rd = sample[0].result_data as Record<string, unknown>;
      console.log('Sample result keys:', Object.keys(rd));
      console.log('total_payout:', rd.total_payout);
      const breakdown = rd.component_breakdown;
      if (breakdown) {
        console.log('Component breakdown keys:', Object.keys(breakdown as Record<string, unknown>));
      }
    }
  }

  // Also check entity_period_outcomes
  const { count: epoCount } = await sb.from('entity_period_outcomes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', 'dfc1041e-7c39-4657-81e5-40b1cea5680c');
  console.log('entity_period_outcomes count:', epoCount);
}

main().catch(console.error);
