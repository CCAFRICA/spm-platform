import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
const RULE_SET_ID = 'a7c1ae18-e119-4256-aa64-1227b054b563';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Clear old calculation results
  console.log('Clearing old calculation results...');
  await supabase.from('entity_period_outcomes').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('calculation_results').delete().eq('tenant_id', TENANT_ID);
  await supabase.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);
  console.log('Cleared.\n');

  // Run calculation
  console.log('Running calculation...');
  const startTime = Date.now();

  const resp = await fetch('http://localhost:3000/api/calculation/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      periodId: JAN_PERIOD_ID,
      ruleSetId: RULE_SET_ID,
    }),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const data = await resp.json();

  if (!resp.ok) {
    console.error(`FAILED (${elapsed}s):`, data.error);
    if (data.log) data.log.slice(-10).forEach((l: string) => console.log(`  ${l}`));
    return;
  }

  console.log(`\nSUCCESS (${elapsed}s)`);
  console.log(`Entities: ${data.entityCount}`);
  console.log(`Total Payout: $${data.totalPayout?.toLocaleString()}`);

  // Component breakdown
  const componentTotals: Record<string, { total: number; count: number }> = {};
  for (const r of data.results) {
    for (const c of (r.components || [])) {
      if (!componentTotals[c.name]) componentTotals[c.name] = { total: 0, count: 0 };
      componentTotals[c.name].total += c.payout;
      if (c.payout > 0) componentTotals[c.name].count++;
    }
  }

  // Ground truth comparison
  const groundTruth: Record<string, number> = {
    'Optical Sales Incentive - Certified': 748600,
    'Store Sales Incentive': 116250,
    'New Customers Incentive': 39100,
    'Collections Incentive': 283000,
    'Insurance Sales Incentive': 10,
    'Service Sales Incentive': 66872,
  };

  console.log('\n=== RECONCILIATION ===');
  console.log('| Component | Ground Truth | Engine | Delta | Accuracy |');
  console.log('|-----------|-------------|--------|-------|----------|');

  let gtTotal = 0;
  let engineTotal = 0;

  for (const [name, gt] of Object.entries(groundTruth)) {
    const engine = componentTotals[name]?.total ?? 0;
    const delta = engine - gt;
    const accuracy = gt > 0 ? ((engine / gt) * 100).toFixed(1) : (engine === 0 ? '100.0' : 'N/A');
    const count = componentTotals[name]?.count ?? 0;
    console.log(`| ${name} | $${gt.toLocaleString()} | $${Math.round(engine).toLocaleString()} | $${Math.round(delta).toLocaleString()} | ${accuracy}% (${count} emps) |`);
    gtTotal += gt;
    engineTotal += engine;
  }

  const totalAccuracy = ((engineTotal / gtTotal) * 100).toFixed(1);
  console.log(`| TOTAL | $${gtTotal.toLocaleString()} | $${Math.round(engineTotal).toLocaleString()} | $${Math.round(engineTotal - gtTotal).toLocaleString()} | ${totalAccuracy}% |`);

  const nonZero = data.results.filter((r: { totalPayout: number }) => r.totalPayout > 0).length;
  console.log(`\nEmployees with non-zero payout: ${nonZero}/${data.entityCount}`);
}

run().catch(console.error);
