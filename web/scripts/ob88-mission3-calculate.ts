/**
 * OB-88 Mission 3: Calculate
 *
 * Calls the /api/calculation/run endpoint for January 2024.
 * Then verifies results against ground truth.
 *
 * Ground truth (from OB-88 spec):
 *   - 719 employees
 *   - Total: MX$1,253,832
 *   - Optical Sales: $505,750
 *   - Store Sales: $129,200
 *   - New Customers: $207,200
 *   - Collections: $214,400
 *   - Insurance: $46,032
 *   - Warranty: $151,250
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';
const BASE_URL = 'http://localhost:3000';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GROUND_TRUTH = {
  entityCount: 719,
  totalPayout: 1253832,
  components: {
    'Optical Sales': 505750,
    'Store Sales': 129200,
    'New Customers': 207200,
    'Collections': 214400,
    'Insurance': 46032,
    'Warranty': 151250,
  },
};

async function main() {
  console.log('=== OB-88 Mission 3: Calculate ===\n');

  // Step 1: Get January 2024 period
  console.log('Step 1: Finding January 2024 period...');
  const { data: period, error: periodErr } = await sb
    .from('periods')
    .select('id, canonical_key, label')
    .eq('tenant_id', TENANT_ID)
    .eq('canonical_key', '2024-01')
    .single();

  if (periodErr || !period) {
    throw new Error(`January 2024 period not found: ${periodErr?.message}`);
  }
  console.log(`  Period: ${period.canonical_key} (${period.id})`);

  // Step 2: Call calculation API
  console.log('\nStep 2: Running calculation...');
  console.log(`  POST ${BASE_URL}/api/calculation/run`);
  console.log(`  Body: { tenantId: ${TENANT_ID}, periodId: ${period.id}, ruleSetId: ${RULE_SET_ID} }`);

  const startTime = Date.now();
  const response = await fetch(`${BASE_URL}/api/calculation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      periodId: period.id,
      ruleSetId: RULE_SET_ID,
    }),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Status: ${response.status} (${elapsed}s)`);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('  Error:', JSON.stringify(err, null, 2));
    throw new Error(`Calculation failed: ${response.status}`);
  }

  const result = await response.json();
  console.log(`  Batch ID: ${result.batchId}`);
  console.log(`  Entities processed: ${result.entityCount}`);
  console.log(`  Results: ${result.resultCount}`);

  // Save full result for debugging
  const fs = await import('fs');
  const path = await import('path');
  fs.writeFileSync(
    path.join(__dirname, 'ob88-calculation-result.json'),
    JSON.stringify(result, null, 2),
    'utf-8'
  );
  console.log('  Full result saved to ob88-calculation-result.json');

  // Step 3: Verify results from database
  console.log('\nStep 3: Verifying results...');

  // Get batch ID
  const { data: batches } = await sb
    .from('calculation_batches')
    .select('id, lifecycle_state, entity_count')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', period.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!batches || batches.length === 0) {
    throw new Error('No calculation batch found');
  }
  const batch = batches[0];
  console.log(`  Batch: ${batch.id}, state: ${batch.lifecycle_state}, entities: ${batch.entity_count}`);

  // Fetch all calculation results
  const allResults: Array<{ entity_id: string; total_incentive: number; components: unknown }> = [];
  let page = 0;
  while (true) {
    const { data: resultPage } = await sb
      .from('calculation_results')
      .select('entity_id, total_incentive, components')
      .eq('batch_id', batch.id)
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (!resultPage || resultPage.length === 0) break;
    allResults.push(...resultPage);
    if (resultPage.length < 1000) break;
    page++;
  }

  console.log(`  Total results: ${allResults.length}`);

  // Compute totals
  let grandTotal = 0;
  const componentTotals = new Map<string, number>();

  for (const r of allResults) {
    grandTotal += r.total_incentive || 0;
    const comps = r.components as Array<{ componentId?: string; name?: string; outputValue?: number }> | null;
    if (comps) {
      for (const c of comps) {
        const name = c.name || c.componentId || 'unknown';
        componentTotals.set(name, (componentTotals.get(name) || 0) + (c.outputValue || 0));
      }
    }
  }

  console.log('\n=== RESULTS COMPARISON ===');
  console.log(`  Entities: ${allResults.length} (expected: ${GROUND_TRUTH.entityCount})`);
  console.log(`  Total Payout: MX$${grandTotal.toLocaleString()} (expected: MX$${GROUND_TRUTH.totalPayout.toLocaleString()})`);
  const totalDelta = Math.abs(grandTotal - GROUND_TRUTH.totalPayout) / GROUND_TRUTH.totalPayout * 100;
  console.log(`  Total Delta: ${totalDelta.toFixed(2)}%`);

  console.log('\n  Component Breakdown:');
  for (const [name, expected] of Object.entries(GROUND_TRUTH.components)) {
    // Find matching component (fuzzy match)
    let actual = 0;
    for (const [compName, compTotal] of Array.from(componentTotals.entries())) {
      if (compName.toLowerCase().includes(name.toLowerCase().split(' ')[0])) {
        actual = compTotal;
        break;
      }
    }
    const delta = expected > 0 ? Math.abs(actual - expected) / expected * 100 : 0;
    const status = delta < 5 ? '✅' : delta < 15 ? '⚠️' : '❌';
    console.log(`    ${status} ${name.padEnd(20)} Actual: MX$${actual.toLocaleString().padEnd(12)} Expected: MX$${expected.toLocaleString().padEnd(12)} Delta: ${delta.toFixed(1)}%`);
  }

  // All component names from results
  console.log('\n  All components in results:');
  for (const [name, total] of Array.from(componentTotals.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name.padEnd(40)} MX$${total.toLocaleString()}`);
  }

  console.log(`\n  Elapsed: ${elapsed}s`);
  console.log('\n=== Mission 3 COMPLETE ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
