/**
 * OB-88: Check why New Customers resolves for only 141 entities
 * when Collections resolves for 710 from the same store-level data structure
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

async function main() {
  const { data: batches } = await sb.from('calculation_batches')
    .select('id').eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false }).limit(1);
  const batchId = batches?.[0]?.id;
  if (!batchId) throw new Error('No batch');

  // Check 5 entities that got non-zero Collections but $0 New Customers
  const results: Array<{
    components: Array<{ payout: number; componentName?: string; details?: Record<string, unknown> }>;
    metadata: Record<string, unknown>;
    metrics: Record<string, unknown>;
  }> = [];

  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('components, metadata, metrics')
      .eq('batch_id', batchId)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    results.push(...(data as typeof results));
    if (data.length < 1000) break;
    page++;
  }

  // Find entities with non-zero Collections but $0 New Customers
  let checked = 0;
  for (const r of results) {
    const collections = r.components?.find(c => c.componentName?.includes('Collect'));
    const newCustomers = r.components?.find(c => c.componentName?.includes('Customer') || c.componentName?.includes('New'));

    if (collections && collections.payout > 0 && newCustomers && newCustomers.payout === 0) {
      if (checked >= 5) break;
      console.log(`\nEntity: ${(r.metadata as Record<string, unknown>).externalId}`);
      console.log(`  Collections: $${collections.payout} | details: ${JSON.stringify(collections.details)?.substring(0, 200)}`);
      console.log(`  New Customers: $${newCustomers.payout} | details: ${JSON.stringify(newCustomers.details)?.substring(0, 200)}`);

      // Check if new_customers_achievement_percentage is in the aggregated metrics
      const metrics = r.metrics as Record<string, unknown>;
      const ncKeys = Object.keys(metrics).filter(k =>
        k.includes('customer') || k.includes('client') || k.includes('Client') || k.includes('Nuevo')
      );
      console.log(`  NC-related metrics: ${ncKeys.length > 0 ? ncKeys.map(k => `${k}=${metrics[k]}`).join(', ') : 'NONE'}`);

      const collKeys = Object.keys(metrics).filter(k =>
        k.includes('collect') || k.includes('cobr') || k.includes('Cobr')
      );
      console.log(`  Coll-related metrics: ${collKeys.length > 0 ? collKeys.map(k => `${k}=${metrics[k]}`).join(', ') : 'NONE'}`);

      checked++;
    }
  }

  // Now check: what metric name does New Customers component look for?
  // And what metric names exist in the store-level data?
  console.log('\n\n=== Metric Name Investigation ===');

  // New Customers component metric: new_customers_achievement_percentage
  // Collections component metric: collections_achievement_percentage

  // Check Base_Clientes_Nuevos for what keys exist
  const { data: ncSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('data_type', 'Base_Clientes_Nuevos')
    .limit(1);
  if (ncSample?.[0]) {
    const rd = ncSample[0].row_data as Record<string, unknown>;
    console.log('\nBase_Clientes_Nuevos keys:', Object.keys(rd).join(', '));
    console.log('  new_customers_achievement_percentage:', rd.new_customers_achievement_percentage);
    console.log('  attainment:', rd.attainment);
  }

  const { data: cobSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('data_type', 'Base_Cobranza')
    .limit(1);
  if (cobSample?.[0]) {
    const rd = cobSample[0].row_data as Record<string, unknown>;
    console.log('\nBase_Cobranza keys:', Object.keys(rd).join(', '));
    console.log('  collections_achievement_percentage:', rd.collections_achievement_percentage);
    console.log('  attainment:', rd.attainment);
  }

  // Count how many entities have NC payout > 0 vs Collections > 0
  let ncNonZero = 0, collNonZero = 0;
  for (const r of results) {
    const nc = r.components?.find(c => c.componentName?.includes('Customer') || c.componentName?.includes('New'));
    const coll = r.components?.find(c => c.componentName?.includes('Collect'));
    if (nc && nc.payout > 0) ncNonZero++;
    if (coll && coll.payout > 0) collNonZero++;
  }
  console.log(`\nNC non-zero: ${ncNonZero} | Collections non-zero: ${collNonZero}`);

  // Check NC achievement distribution — what % of stores have >= 100%?
  console.log('\n=== Store-level NC achievement distribution ===');
  const storeAch: number[] = [];
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', 'Base_Clientes_Nuevos')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      const ach = typeof rd.new_customers_achievement_percentage === 'number'
        ? rd.new_customers_achievement_percentage : 0;
      storeAch.push(ach);
    }
    if (data.length < 1000) break;
    page++;
  }

  storeAch.sort((a, b) => a - b);
  const gte100 = storeAch.filter(a => a >= 100).length;
  console.log(`  Total stores: ${storeAch.length}`);
  console.log(`  Stores with NC achievement >= 100%: ${gte100} (${(gte100/storeAch.length*100).toFixed(1)}%)`);
  console.log(`  Median: ${storeAch[Math.floor(storeAch.length / 2)].toFixed(1)}%`);
  console.log(`  P25: ${storeAch[Math.floor(storeAch.length * 0.25)].toFixed(1)}%`);
  console.log(`  P75: ${storeAch[Math.floor(storeAch.length * 0.75)].toFixed(1)}%`);

  // Same for Collections
  console.log('\n=== Store-level Collections achievement distribution ===');
  const collAch: number[] = [];
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', 'Base_Cobranza')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      const ach = typeof rd.collections_achievement_percentage === 'number'
        ? rd.collections_achievement_percentage : 0;
      collAch.push(ach);
    }
    if (data.length < 1000) break;
    page++;
  }

  collAch.sort((a, b) => a - b);
  const collGte100 = collAch.filter(a => a >= 100).length;
  console.log(`  Total stores: ${collAch.length}`);
  console.log(`  Stores with Collections achievement >= 100%: ${collGte100} (${(collGte100/collAch.length*100).toFixed(1)}%)`);
  console.log(`  Stores with Collections achievement >= 125%: ${collAch.filter(a => a >= 125).length}`);
  console.log(`  Median: ${collAch[Math.floor(collAch.length / 2)].toFixed(1)}%`);
}

main().catch(console.error);
