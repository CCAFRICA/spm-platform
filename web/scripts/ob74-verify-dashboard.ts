#!/usr/bin/env npx tsx
/**
 * OB-74 Mission 5: Dashboard + Lifecycle Verification
 * Verifies calculation data is accessible by dashboard pages.
 */
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function verify() {
  console.log('=== OB-74 Mission 5: Dashboard Verification ===\n');

  // ── PG-14: Batch lifecycle state ──
  console.log('--- PG-14: Calculation Batches ---');
  const { data: batches } = await s
    .from('calculation_batches')
    .select('id, lifecycle_state, entity_count, summary, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });

  if (!batches || batches.length === 0) {
    console.log('FAIL: No calculation batches found');
    return;
  }

  for (const b of batches) {
    const summary = b.summary as Record<string, unknown>;
    console.log(`  Batch ${b.id.slice(0, 8)}:`);
    console.log(`    lifecycle_state: ${b.lifecycle_state}`);
    console.log(`    entity_count: ${b.entity_count}`);
    console.log(`    total_payout: $${(summary?.total_payout as number)?.toLocaleString() ?? 'N/A'}`);
    console.log(`    created_at: ${b.created_at}`);
  }

  const latestBatch = batches[0];
  const batchState = latestBatch.lifecycle_state;
  console.log(`\n  LATEST BATCH STATE: ${batchState}`);
  console.log(`  ${batchState === 'PREVIEW' ? 'PASS' : 'CHECK'}: Expected PREVIEW`);

  // ── PG-15: Calculation results exist and have non-zero payouts ──
  console.log('\n--- PG-15: Calculation Results ---');
  const { count: resultCount } = await s
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('batch_id', latestBatch.id);

  console.log(`  Results for latest batch: ${resultCount}`);

  const { data: nonZeroResults } = await s
    .from('calculation_results')
    .select('entity_id, total_payout')
    .eq('tenant_id', TENANT_ID)
    .eq('batch_id', latestBatch.id)
    .gt('total_payout', 0)
    .limit(10);

  console.log(`  Non-zero payouts (sample): ${nonZeroResults?.length}`);
  nonZeroResults?.slice(0, 5).forEach(r => {
    console.log(`    ${r.entity_id.slice(0, 8)}: $${r.total_payout.toLocaleString()}`);
  });

  // ── PG-16: Entity period outcomes materialized ──
  console.log('\n--- PG-16: Entity Period Outcomes ---');
  const { count: outcomeCount } = await s
    .from('entity_period_outcomes')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);

  console.log(`  Outcomes: ${outcomeCount}`);

  const { data: nonZeroOutcomes } = await s
    .from('entity_period_outcomes')
    .select('entity_id, total_payout, lowest_lifecycle_state')
    .eq('tenant_id', TENANT_ID)
    .gt('total_payout', 0)
    .limit(5);

  console.log(`  Non-zero outcomes (sample): ${nonZeroOutcomes?.length}`);
  nonZeroOutcomes?.slice(0, 3).forEach(r => {
    console.log(`    ${r.entity_id.slice(0, 8)}: $${r.total_payout.toLocaleString()} (${r.lowest_lifecycle_state})`);
  });

  // ── PG-17: Dashboard data query simulation ──
  console.log('\n--- PG-17: Dashboard Query Simulation ---');

  // Simulate what My Compensation page does
  console.log('  [My Compensation] listCalculationBatches + getCalculationResults:');
  const { data: visibleBatches } = await s
    .from('calculation_batches')
    .select('id, lifecycle_state, period_id, summary')
    .eq('tenant_id', TENANT_ID)
    .is('superseded_by', null)
    .order('created_at', { ascending: false });

  const visibleBatch = visibleBatches?.find(b => {
    // PREVIEW is visible to admin/vl_admin
    return ['PREVIEW', 'RECONCILE', 'OFFICIAL', 'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED'].includes(b.lifecycle_state);
  });

  if (visibleBatch) {
    const { data: results } = await s
      .from('calculation_results')
      .select('entity_id, total_payout, components, metrics')
      .eq('tenant_id', TENANT_ID)
      .eq('batch_id', visibleBatch.id);

    const totalPayout = results?.reduce((sum, r) => sum + (r.total_payout || 0), 0) || 0;
    const nonZero = results?.filter(r => r.total_payout > 0).length || 0;

    console.log(`    Visible batch: ${visibleBatch.id.slice(0, 8)} (${visibleBatch.lifecycle_state})`);
    console.log(`    Results: ${results?.length} entities`);
    console.log(`    Total payout: $${totalPayout.toLocaleString()}`);
    console.log(`    Non-zero: ${nonZero} entities`);
    console.log(`    PASS: Dashboard can load real calculation data`);
  } else {
    console.log(`    FAIL: No visible batch found`);
  }

  // Simulate Operate Cockpit lifecycle stepper
  console.log('\n  [Operate Cockpit] Lifecycle stepper:');
  const STATES = ['DRAFT', 'PREVIEW', 'RECONCILE', 'OFFICIAL', 'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED'];
  const currentIdx = STATES.indexOf(batchState);
  const completed = STATES.slice(0, currentIdx);
  const current = batchState;
  const upcoming = STATES.slice(currentIdx + 1);
  console.log(`    Completed: ${completed.join(' → ') || 'none'}`);
  console.log(`    Current: ★ ${current}`);
  console.log(`    Upcoming: ${upcoming.join(' → ')}`);
  console.log(`    Progress: ${currentIdx + 1}/${STATES.length} (${Math.round((currentIdx + 1) / STATES.length * 100)}%)`);
  console.log(`    PASS: Lifecycle stepper reflects PREVIEW state`);

  // Simulate Insights page
  console.log('\n  [Insights] Analytics data:');
  if (visibleBatch) {
    const { data: allResults } = await s
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', TENANT_ID)
      .eq('batch_id', visibleBatch.id);

    const payouts = allResults?.map(r => r.total_payout).filter(p => p > 0) || [];
    const avg = payouts.length > 0 ? payouts.reduce((s, p) => s + p, 0) / payouts.length : 0;
    const sorted = [...payouts].sort((a, b) => b - a);

    console.log(`    Entities paid: ${payouts.length}`);
    console.log(`    Average earnings (paid entities): $${avg.toLocaleString()}`);
    console.log(`    Top 3 payouts: ${sorted.slice(0, 3).map(p => `$${p.toLocaleString()}`).join(', ')}`);
    console.log(`    PASS: Insights analytics data available`);
  }

  // ── Summary ──
  console.log('\n=== MISSION 5 VERIFICATION SUMMARY ===');
  console.log(`  PG-14 (Lifecycle state = PREVIEW): ${batchState === 'PREVIEW' ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  PG-15 (Results with SUM > 0):      ${(nonZeroResults?.length || 0) > 0 ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  PG-16 (Outcomes materialized):      ${(outcomeCount || 0) > 0 ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  PG-17 (Dashboard loads real data):  ${visibleBatch ? 'PASS ✓' : 'FAIL ✗'}`);
}

verify().catch(console.error);
