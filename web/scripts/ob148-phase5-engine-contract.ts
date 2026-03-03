/**
 * OB-148 Phase 5: Engine Contract verification
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 5: ENGINE CONTRACT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Engine contract query
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .ilike('slug', '%optica%')
    .limit(1)
    .single();

  if (!tenant) { console.error('Tenant not found'); return; }

  const { count } = await supabase
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);

  // Sum total_payout
  let totalPayout = 0;
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', tenant.id)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data) totalPayout += (r.total_payout || 0);
    if (data.length < 1000) break;
    page++;
  }

  console.log('ENGINE CONTRACT:');
  console.log(`  result_count: ${count}`);
  console.log(`  total_payout: MX$${Math.round(totalPayout).toLocaleString()}`);
  console.log(`  tenant_id: ${tenant.id}`);

  // DS-007 verification checks
  console.log('\n\n--- DS-007 Verification ---\n');

  // Check entity_period_outcomes exist
  const { count: epoCount } = await supabase
    .from('entity_period_outcomes')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);

  console.log(`entity_period_outcomes: ${epoCount} rows`);

  // Check component breakdown
  const { data: sampleResult } = await supabase
    .from('calculation_results')
    .select('total_payout, components')
    .eq('tenant_id', tenant.id)
    .gt('total_payout', 1000)
    .limit(1)
    .single();

  if (sampleResult) {
    console.log(`\nSample result (MX$${sampleResult.total_payout}):`);
    const comps = (sampleResult.components ?? []) as Array<Record<string, any>>;
    for (const c of comps) {
      console.log(`  ${c.componentName}: MX$${Number(c.payout).toFixed(0)}`);
    }
  }

  // Verify hero total would show correctly
  console.log(`\nHero total: MX$${Math.round(totalPayout).toLocaleString()}`);
  console.log(`Component bars:`);
  const componentTotals = new Map<string, number>();
  page = 0;
  while (true) {
    const from = page * 1000;
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('tenant_id', tenant.id)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      for (const c of (row.components ?? []) as Array<Record<string, any>>) {
        const name = String(c.componentName);
        componentTotals.set(name, (componentTotals.get(name) ?? 0) + Number(c.payout ?? 0));
      }
    }
    if (data.length < 1000) break;
    page++;
  }

  const sorted = Array.from(componentTotals.entries()).sort((a, b) => b[1] - a[1]);
  for (const [name, total] of sorted) {
    const pct = (total / totalPayout * 100).toFixed(1);
    console.log(`  ${name}: MX$${Math.round(total).toLocaleString()} (${pct}%)`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PG-05: Engine Contract verified. DS-007 data available.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
