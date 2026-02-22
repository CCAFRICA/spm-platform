#!/usr/bin/env npx tsx
/**
 * OB-74 Mission 4: Trigger calculation via API
 */
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const RULE_SET_ID = '352f7e6c-413e-4f3b-b70f-678e208e618a';

async function run() {
  console.log('=== OB-74 Mission 4: Calculation ===\n');

  // Get periods
  const { data: periods } = await s
    .from('periods')
    .select('id, canonical_key, label')
    .eq('tenant_id', TENANT_ID)
    .order('canonical_key');

  console.log('Available periods:');
  periods?.forEach(p => console.log(`  ${p.canonical_key} (${p.label}) - ${p.id}`));

  if (!periods || periods.length === 0) {
    console.log('NO PERIODS FOUND');
    return;
  }

  // Check which periods have committed_data with entity_id
  for (const period of periods) {
    const { count: withEntity } = await s
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', period.id)
      .not('entity_id', 'is', null);

    const { count: total } = await s
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', period.id);

    console.log(`  ${period.canonical_key}: ${total} total rows, ${withEntity} with entity_id`);
  }

  // Pick first period with entity data
  const testPeriod = periods[0]; // 2024-01
  console.log(`\nRunning calculation for period: ${testPeriod.canonical_key} (${testPeriod.id})`);

  // Call the API
  const apiUrl = `http://localhost:3000/api/calculation/run`;
  console.log(`POST ${apiUrl}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      periodId: testPeriod.id,
      ruleSetId: RULE_SET_ID,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.log('CALCULATION FAILED:', response.status);
    console.log('Error:', result.error);
    console.log('Log:', result.log?.join('\n'));
    return;
  }

  console.log('\n=== CALCULATION RESULT ===');
  console.log('Success:', result.success);
  console.log('Batch ID:', result.batchId);
  console.log('Entity count:', result.entityCount);
  console.log('Total payout:', result.totalPayout?.toLocaleString());

  // Show top 10 entities by payout
  if (result.results) {
    const sorted = result.results.sort((a: { totalPayout: number }, b: { totalPayout: number }) => b.totalPayout - a.totalPayout);
    console.log('\n--- Top 10 entities by payout ---');
    sorted.slice(0, 10).forEach((r: { entityName: string; totalPayout: number; components: Array<{ name: string; payout: number }> }, i: number) => {
      console.log(`${i + 1}. ${r.entityName}: $${r.totalPayout.toLocaleString()}`);
      r.components?.forEach((c: { name: string; payout: number }) => {
        console.log(`   ${c.name}: $${c.payout.toLocaleString()}`);
      });
    });

    const nonZero = sorted.filter((r: { totalPayout: number }) => r.totalPayout > 0);
    const zero = sorted.filter((r: { totalPayout: number }) => r.totalPayout === 0);
    console.log(`\nNon-zero payouts: ${nonZero.length} / ${sorted.length}`);
    console.log(`Zero payouts: ${zero.length} / ${sorted.length}`);
  }

  // Show log
  if (result.log) {
    console.log('\n--- Calculation Log ---');
    result.log.forEach((line: string) => console.log(`  ${line}`));
  }
}

run().catch(console.error);
