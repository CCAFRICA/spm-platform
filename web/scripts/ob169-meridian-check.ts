/**
 * OB-169 Phase 6: Meridian Regression Check
 * Verify Meridian still produces MX$185,063
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const MERIDIAN_TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  console.log('=== OB-169 PHASE 6: MERIDIAN REGRESSION CHECK ===\n');

  // Find Meridian tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, currency')
    .eq('id', MERIDIAN_TENANT_ID)
    .single();

  if (!tenant) {
    console.log('Meridian tenant not found, trying name search...');
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, currency');
    console.log('Available tenants:');
    tenants?.forEach(t => console.log(`  ${t.id}: ${t.name} (${t.currency})`));
    return;
  }

  console.log(`Tenant: ${tenant.name} (${tenant.currency})`);

  // Get latest calculation batch
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, entity_count, summary, created_at')
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(3);

  if (!batches?.length) {
    console.log('No calculation batches found for Meridian');
    return;
  }

  for (const batch of batches) {
    const summary = batch.summary as Record<string, unknown>;
    console.log(`\nBatch: ${batch.id}`);
    console.log(`  Period: ${batch.period_id}`);
    console.log(`  Entities: ${batch.entity_count}`);
    console.log(`  Total: ${summary.total_payout}`);
    console.log(`  Created: ${batch.created_at}`);
  }

  // Verify the latest batch total
  const latestBatch = batches[0];
  const summary = latestBatch.summary as Record<string, unknown>;
  const total = Number(summary.total_payout);

  console.log(`\n--- Meridian Verification ---`);
  console.log(`Latest batch total: MX$${total.toLocaleString()}`);
  console.log(`Expected: MX$185,063`);
  console.log(`Match: ${total === 185063 ? '✓ EXACT' : `Delta: MX$${total - 185063}`}`);

  // Cross-check with sum of calculation results
  const { data: results } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('batch_id', latestBatch.id);

  let resultSum = 0;
  for (const r of results || []) {
    resultSum += Number(r.total_payout);
  }
  console.log(`Sum of all results: MX$${resultSum.toLocaleString()}`);
  console.log(`Entity count: ${results?.length || 0} (expected 67)`);

  console.log('\n=== END PHASE 6 ===');
}

main().catch(console.error);
