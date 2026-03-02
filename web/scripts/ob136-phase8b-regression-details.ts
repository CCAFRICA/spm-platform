// OB-136 Phase 8B — check when LAB/MBC results were created
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function run() {
  // LAB
  const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
  const { data: labBatches } = await sb.from('calculation_batches')
    .select('id, created_at, entity_count, summary, lifecycle_state')
    .eq('tenant_id', LAB)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('=== LAB CALCULATION BATCHES ===');
  for (const b of labBatches || []) {
    const summary = b.summary as Record<string, unknown> | null;
    console.log('Batch:', b.id);
    console.log('  created_at:', b.created_at);
    console.log('  entity_count:', b.entity_count);
    console.log('  lifecycle_state:', b.lifecycle_state);
    console.log('  summary totalPayout:', (summary as any)?.totalPayout);
    console.log('');
  }

  // MBC
  const MBC = '7e31a1d0-8c14-41c0-9f01-471f3842834c';
  const { data: mbcBatches } = await sb.from('calculation_batches')
    .select('id, created_at, entity_count, summary, lifecycle_state')
    .eq('tenant_id', MBC)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('=== MBC CALCULATION BATCHES ===');
  for (const b of mbcBatches || []) {
    const summary = b.summary as Record<string, unknown> | null;
    console.log('Batch:', b.id);
    console.log('  created_at:', b.created_at);
    console.log('  entity_count:', b.entity_count);
    console.log('  lifecycle_state:', b.lifecycle_state);
    console.log('  summary totalPayout:', (summary as any)?.totalPayout);
    console.log('');
  }

  // Check MBC has any data
  const { count: mbcDataCount } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', MBC);
  console.log('MBC committed_data:', mbcDataCount);

  const { count: mbcRs } = await sb.from('rule_sets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', MBC);
  console.log('MBC rule_sets:', mbcRs);

  // Check if changes touched calculation_results at all
  const { data: labLatestResult } = await sb.from('calculation_results')
    .select('created_at')
    .eq('tenant_id', LAB)
    .order('created_at', { ascending: false })
    .limit(1);
  console.log('\nLAB latest result created_at:', labLatestResult?.[0]?.created_at);

  const { data: ptcLatestResult } = await sb.from('calculation_results')
    .select('created_at, total_payout')
    .eq('tenant_id', 'dfc1041e-7c39-4657-81e5-40b1cea5680c')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log('PTC latest result created_at:', ptcLatestResult?.[0]?.created_at);
  console.log('PTC latest total_payout:', ptcLatestResult?.[0]?.total_payout);
}

run().catch(console.error);
