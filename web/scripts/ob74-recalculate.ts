#!/usr/bin/env npx tsx
/**
 * OB-74 Mission 4B: Re-run calculation after metric resolution fix.
 * Clears old results first, then triggers fresh calculation.
 */
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const RULE_SET_ID = '352f7e6c-413e-4f3b-b70f-678e208e618a';

async function run() {
  console.log('=== OB-74 Mission 4B: Recalculation ===\n');

  // Get first period
  const { data: periods } = await s
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', TENANT_ID)
    .order('canonical_key')
    .limit(1);

  const periodId = periods?.[0]?.id;
  console.log(`Period: ${periods?.[0]?.canonical_key} (${periodId})`);

  // Clear old results
  console.log('\nClearing old results...');

  const { count: oldResults } = await s
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`  Old calculation_results: ${oldResults}`);

  await s.from('calculation_results').delete().eq('tenant_id', TENANT_ID);
  await s.from('entity_period_outcomes').delete().eq('tenant_id', TENANT_ID);
  await s.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);

  console.log('  Cleared.');

  // Run calculation via API
  console.log('\nRunning calculation...');
  const response = await fetch('http://localhost:3000/api/calculation/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      periodId: periodId,
      ruleSetId: RULE_SET_ID,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.log('CALCULATION FAILED:', response.status);
    console.log('Error:', result.error);
    console.log('Log:', result.log?.slice(-10).join('\n'));
    return;
  }

  console.log('\n=== CALCULATION RESULT ===');
  console.log('Success:', result.success);
  console.log('Batch ID:', result.batchId);
  console.log('Entity count:', result.entityCount);
  console.log('Total payout:', `$${result.totalPayout?.toLocaleString()}`);

  // Analyze per-component results
  if (result.results) {
    const componentSums: Record<string, { total: number; count: number; nonZero: number }> = {};

    for (const entity of result.results) {
      for (const comp of entity.components) {
        if (!componentSums[comp.name]) {
          componentSums[comp.name] = { total: 0, count: 0, nonZero: 0 };
        }
        componentSums[comp.name].total += comp.payout;
        componentSums[comp.name].count++;
        if (comp.payout > 0) componentSums[comp.name].nonZero++;
      }
    }

    console.log('\n--- Component Summary ---');
    for (const [name, stats] of Object.entries(componentSums)) {
      console.log(`  ${name}:`);
      console.log(`    Total: $${stats.total.toLocaleString()}`);
      console.log(`    Non-zero: ${stats.nonZero} / ${stats.count} entities`);
      console.log(`    Average (when non-zero): $${stats.nonZero > 0 ? (stats.total / stats.nonZero).toLocaleString() : '0'}`);
    }

    // Show top 5 entities
    const sorted = result.results.sort((a: { totalPayout: number }, b: { totalPayout: number }) => b.totalPayout - a.totalPayout);
    console.log('\n--- Top 5 Entities ---');
    sorted.slice(0, 5).forEach((r: { entityName: string; totalPayout: number; components: Array<{ name: string; payout: number }> }, i: number) => {
      console.log(`${i + 1}. ${r.entityName}: $${r.totalPayout.toLocaleString()}`);
      r.components?.forEach((c: { name: string; payout: number }) => {
        if (c.payout > 0) console.log(`   ${c.name}: $${c.payout.toLocaleString()}`);
      });
    });

    const nonZero = sorted.filter((r: { totalPayout: number }) => r.totalPayout > 0);
    const zero = sorted.filter((r: { totalPayout: number }) => r.totalPayout === 0);
    console.log(`\nNon-zero payouts: ${nonZero.length} / ${sorted.length}`);
    console.log(`Zero payouts: ${zero.length} / ${sorted.length}`);
  }

  // Show last 10 log lines
  if (result.log) {
    console.log('\n--- Last 10 Log Lines ---');
    result.log.slice(-10).forEach((line: string) => console.log(`  ${line}`));
  }
}

run().catch(console.error);
