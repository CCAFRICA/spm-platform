/**
 * OB-147 Phase 4: Recalculate with roster filter + contamination guard + attainment heuristic
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob147-phase4-recalculate.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-147 PHASE 4: RECALCULATE WITH ROSTER FILTER');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get Enero 2024 period
  const { data: enero } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();

  if (!enero) {
    console.error('Enero 2024 period not found');
    return;
  }

  // Get active rule set
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) {
    console.error('No active rule set');
    return;
  }

  console.log(`Period: ${enero.canonical_key} (${enero.id})`);
  console.log(`Rule set: ${rs.name} (${rs.id})`);

  // Step 1: Delete old results
  console.log('\n--- Step 1: Delete old results ---');
  const { error: delErr, count: delCount } = await supabase
    .from('calculation_results')
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId);

  if (delErr) {
    console.error('Delete error:', delErr.message);
    return;
  }
  console.log(`Deleted ${delCount} old results`);

  // Also clean outcomes
  await supabase
    .from('entity_period_outcomes')
    .delete()
    .eq('tenant_id', tenantId);
  console.log('Cleaned entity_period_outcomes');

  // Step 2: Trigger calculation via API
  console.log('\n--- Step 2: Trigger calculation ---');
  const startTime = Date.now();

  const resp = await fetch('http://localhost:3000/api/calculation/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      periodId: enero.id,
      ruleSetId: rs.id,
    }),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const result = await resp.json();

  if (!resp.ok) {
    console.error(`API error (${resp.status}):`, result.error);
    if (result.log) {
      console.log('\nAPI Log:');
      for (const line of result.log) {
        console.log(`  ${line}`);
      }
    }
    return;
  }

  console.log(`\nCalculation complete in ${elapsed}s`);
  console.log(`Entity count: ${result.entityCount}`);
  console.log(`Total payout: MX$${result.totalPayout?.toLocaleString()}`);

  // Print relevant log lines
  if (result.log) {
    console.log('\n--- API Log (filtered) ---');
    for (const line of result.log) {
      if (line.includes('Population') || line.includes('Roster') || line.includes('roster') ||
          line.includes('Grand total') || line.includes('COMPLETE') ||
          line.includes('filter') || line.includes('heuristic') || line.includes('parent')) {
        console.log(`  ${line}`);
      }
    }
  }

  // Step 3: Verify results
  console.log('\n\n--- Step 3: Quick verification ---');

  const { count: newResultCount } = await supabase
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // Paginated payout sum
  let totalPayout = 0;
  let nonZero = 0;
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      totalPayout += (r.total_payout || 0);
      if (r.total_payout > 0) nonZero++;
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  const avgNonZero = nonZero > 0 ? totalPayout / nonZero : 0;

  console.log(`result_count: ${newResultCount}`);
  console.log(`total_payout: MX$${totalPayout.toLocaleString()}`);
  console.log(`non_zero:     ${nonZero}`);
  console.log(`avg_nonzero:  MX$${avgNonZero.toFixed(2)}`);

  // Per-component totals
  console.log('\n--- Per-component totals ---');
  const componentTotals = new Map<string, { count: number; total: number; nonZero: number }>();
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const comps = (row.components ?? []) as Array<Record<string, unknown>>;
      for (const c of comps) {
        const name = String(c.componentName ?? 'unknown');
        const payout = Number(c.payout ?? 0);
        if (!componentTotals.has(name)) componentTotals.set(name, { count: 0, total: 0, nonZero: 0 });
        const entry = componentTotals.get(name)!;
        entry.count++;
        entry.total += payout;
        if (payout > 0) entry.nonZero++;
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  for (const [name, data] of Array.from(componentTotals.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${name}: MX$${Math.round(data.total).toLocaleString()} (${data.nonZero}/${data.count} non-zero)`);
  }

  // Benchmark comparison
  const BENCHMARK = 1253832;
  const accuracy = ((totalPayout / BENCHMARK) * 100).toFixed(1);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`PG-04: Result count = ${newResultCount} (expected ~719)`);
  console.log(`       Total payout = MX$${Math.round(totalPayout).toLocaleString()} (${accuracy}% of MX$${BENCHMARK.toLocaleString()} benchmark)`);
  console.log(`       Non-zero = ${nonZero}/${newResultCount}`);
  console.log(`       Components: ${componentTotals.size}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
}

main().catch(console.error);
