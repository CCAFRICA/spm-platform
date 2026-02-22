import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
const RULE_SET_ID = 'a7c1ae18-e119-4256-aa64-1227b054b563';

async function run() {
  console.log('=== OB-75 Mission 5: Run Calculation for January 2024 ===\n');
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Period: ${JAN_PERIOD_ID} (2024-01)`);
  console.log(`Rule Set: ${RULE_SET_ID}`);
  console.log('\nSending calculation request to API...\n');

  const startTime = Date.now();

  try {
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
    console.log(`Response status: ${resp.status} (${elapsed}s)`);

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Calculation FAILED:', data.error);
      if (data.log) {
        console.log('\nLog:');
        for (const line of data.log) {
          console.log(`  ${line}`);
        }
      }
      return;
    }

    console.log(`\nCalculation SUCCESS:`);
    console.log(`  Batch ID: ${data.batchId}`);
    console.log(`  Entities: ${data.entityCount}`);
    console.log(`  Total Payout: $${data.totalPayout?.toLocaleString()}`);

    // Component breakdown
    if (data.results && data.results.length > 0) {
      const componentTotals: Record<string, { total: number; count: number }> = {};

      for (const r of data.results) {
        for (const c of (r.components || [])) {
          if (!componentTotals[c.name]) componentTotals[c.name] = { total: 0, count: 0 };
          componentTotals[c.name].total += c.payout;
          if (c.payout > 0) componentTotals[c.name].count++;
        }
      }

      console.log('\n=== COMPONENT BREAKDOWN ===');
      for (const [name, data] of Object.entries(componentTotals)) {
        console.log(`  ${name}: $${data.total.toLocaleString()} (${data.count} employees with payout)`);
      }

      // Count non-zero payout employees
      const nonZero = data.results.filter((r: { totalPayout: number }) => r.totalPayout > 0).length;
      console.log(`\nEmployees with non-zero payout: ${nonZero}/${data.entityCount}`);
    }

    if (data.log) {
      console.log('\n=== CALCULATION LOG (last 20 lines) ===');
      const logLines = data.log as string[];
      for (const line of logLines.slice(-20)) {
        console.log(`  ${line}`);
      }
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`Request failed after ${elapsed}s:`, err);
  }
}

run().catch(console.error);
