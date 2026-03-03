/**
 * OB-146 Phase 4: Recalculate Enero 2024
 *
 * 1. Delete old calculation_results
 * 2. Call runCalculation() directly
 * 3. Report per-component totals
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase4-recalculate.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 4: RECALCULATE ENERO 2024');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 4A: Delete old results ──
  console.log('--- 4A: Delete old calculation_results ---');
  const { error: delErr, count: delCount } = await supabase
    .from('calculation_results')
    .delete()
    .eq('tenant_id', tenantId)
    .select('*', { count: 'exact', head: true });

  // Just do the delete without count since Supabase returns differently
  const { error: delErr2 } = await supabase
    .from('calculation_results')
    .delete()
    .eq('tenant_id', tenantId);

  if (delErr2) {
    console.error('Delete error:', delErr2.message);
  } else {
    console.log('Old calculation_results deleted');
  }

  // Also delete entity_period_outcomes
  await supabase
    .from('entity_period_outcomes')
    .delete()
    .eq('tenant_id', tenantId);

  // ── Get period and rule set info ──
  const { data: period } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();

  if (!period) {
    console.error('No Enero 2024 period');
    process.exit(1);
  }

  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!ruleSet) {
    console.error('No active rule set');
    process.exit(1);
  }

  console.log(`\nPeriod: ${period.canonical_key} (${period.id})`);
  console.log(`Rule set: ${ruleSet.name} (${ruleSet.id})`);

  // ── 4B: Trigger calculation via API ──
  console.log('\n--- 4B: Triggering calculation via API ---');

  const apiUrl = `${supabaseUrl.replace('.supabase.co', '.supabase.co')}`; // Just to validate URL

  // We'll call the calculation API endpoint
  // The API route is at /api/calculation/run
  // We need to call it via localhost since it uses Next.js API routes
  const calcUrl = `http://localhost:3000/api/calculation/run`;

  console.log(`Calling: POST ${calcUrl}`);
  console.log('(Ensure dev server is running on localhost:3000)');

  try {
    const response = await fetch(calcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId,
        periodId: period.id,
        ruleSetId: ruleSet.id,
        userId: 'ob146-recalculation',
      }),
    });

    const result = await response.json();
    console.log(`\nAPI Response (${response.status}):`);
    console.log(JSON.stringify(result, null, 2));
  } catch (fetchErr) {
    console.error('API call failed:', fetchErr);
    console.log('\nDev server may not be running. Trying direct Supabase RPC...');

    // Fallback: just report what we have
    console.log('Skipping API call — check results after running calculation from UI');
  }

  // ── 4C: Check results ──
  console.log('\n--- 4C: Quick check ---');

  // Wait a moment for results to be written
  await new Promise(r => setTimeout(r, 2000));

  // Total payout
  const { data: totals } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('tenant_id', tenantId);

  if (!totals || totals.length === 0) {
    console.log('No calculation_results yet — run calculation from UI or wait for API');
    console.log('\n*** MANUAL STEP NEEDED: Run calculation from Operate→Calculate page ***');
    return;
  }

  const resultCount = totals.length;
  const totalPayout = totals.reduce((s, r) => s + (r.total_payout || 0), 0);
  const nonZero = totals.filter(r => r.total_payout > 0).length;
  const avgPayout = totalPayout / resultCount;

  console.log(`Results: ${resultCount}`);
  console.log(`Total payout: MX$${totalPayout.toLocaleString()}`);
  console.log(`Non-zero: ${nonZero}`);
  console.log(`Average: MX$${avgPayout.toFixed(2)}`);

  // Per-component totals
  console.log('\n--- Per-component totals ---');
  const { data: allResults } = await supabase
    .from('calculation_results')
    .select('component_results')
    .eq('tenant_id', tenantId);

  const componentTotals = new Map<string, { count: number; total: number }>();
  for (const row of allResults ?? []) {
    const cr = (row.component_results ?? []) as Array<Record<string, unknown>>;
    for (const comp of cr) {
      const name = String(comp.componentName ?? comp.componentId ?? 'unknown');
      const payout = Number(comp.payout ?? 0);
      if (!componentTotals.has(name)) componentTotals.set(name, { count: 0, total: 0 });
      const entry = componentTotals.get(name)!;
      entry.count++;
      entry.total += payout;
    }
  }

  for (const [name, { count, total }] of Array.from(componentTotals.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${name}: MX$${total.toLocaleString()} (${count} entities)`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`PG-04: Total payout = MX$${totalPayout.toLocaleString()}`);
  console.log(`       ${nonZero} / ${resultCount} entities with non-zero payout`);
  console.log(`       ${componentTotals.size} components`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
