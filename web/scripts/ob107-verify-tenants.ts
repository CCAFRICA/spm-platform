/**
 * OB-107 Phase 6: Integration verification
 * Verify Óptica and Pipeline Proof Co are unchanged after Phase 2-5 changes.
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const OPTICA = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const PIPELINE = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const CARIBE = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

async function verify(name: string, tenantId: string) {
  console.log(`\n=== ${name} ===`);

  // Periods
  const { data: periods } = await sb
    .from('periods')
    .select('id, canonical_key, start_date')
    .eq('tenant_id', tenantId)
    .order('start_date');
  console.log('Periods:', periods?.length || 0);
  if (periods) {
    for (const p of periods) {
      console.log('  ', p.canonical_key, p.start_date);
    }
  }

  // Active rule sets
  const { data: rs } = await sb
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  console.log('Active plans:', rs?.length || 0);
  if (rs) {
    for (const r of rs) {
      console.log('  ', r.name);
    }
  }

  // Committed data count
  const { count } = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log('Committed data rows:', count);

  // Entity count
  const { count: entityCount } = await sb
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log('Entities:', entityCount);

  // Latest calculation batch + sample results
  const { data: batches } = await sb
    .from('calculation_batches')
    .select('id, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (batches && batches.length > 0) {
    const batchId = batches[0].id;
    console.log('Latest batch:', batches[0].status, batches[0].created_at);
    const { data: results, count: resultCount } = await sb
      .from('calculation_results')
      .select('total_payout', { count: 'exact' })
      .eq('batch_id', batchId);
    console.log('Calculation results in batch:', resultCount);
    if (results && results.length > 0) {
      const totalPayout = results.reduce(
        (sum: number, r: { total_payout: number | null }) => sum + (r.total_payout || 0),
        0,
      );
      console.log('Total payout across all results: MX$' + totalPayout.toLocaleString());
    }
  } else {
    console.log('No calculation batches found');
  }
}

async function run() {
  await verify('Óptica Luminar', OPTICA);
  await verify('Pipeline Proof Co', PIPELINE);
  await verify('Caribe Financial (post-cleanup)', CARIBE);
}

run().catch(console.error);
