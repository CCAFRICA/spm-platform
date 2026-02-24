/**
 * OB-85 R5: Check entity_period_outcomes vs calculation_results
 * to understand what the reconciliation page actually reads.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function check() {
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Check latest batches
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, created_at, lifecycle_state, entity_count, summary')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('=== LATEST BATCHES ===');
  for (const b of batches ?? []) {
    const summary = b.summary as Record<string, unknown> | null;
    console.log(`  ${b.id.slice(0,8)} | ${b.created_at} | ${b.lifecycle_state} | ${b.entity_count} entities | total=${summary?.total_payout}`);
  }

  // Check entity_period_outcomes
  console.log('\n=== ENTITY_PERIOD_OUTCOMES (Jan 2024) ===');
  const PAGE = 1000;
  const outcomes: Array<{ entity_id: string; total_payout: number; component_breakdown: unknown }> = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('entity_period_outcomes')
      .select('entity_id, total_payout, component_breakdown')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    outcomes.push(...(data as typeof outcomes));
    if (data.length < PAGE) break;
    page++;
  }

  const outTotal = outcomes.reduce((s, o) => s + o.total_payout, 0);
  console.log(`Outcomes count: ${outcomes.length}`);
  console.log(`Outcomes total: MX$${outTotal.toLocaleString()}`);

  // Component breakdown from outcomes
  const compTotals = new Map<string, number>();
  for (const o of outcomes) {
    const comps = Array.isArray(o.component_breakdown) ? o.component_breakdown : [];
    for (const c of comps) {
      const comp = c as Record<string, unknown>;
      const name = String(comp.componentName ?? comp.name ?? 'unknown');
      const payout = Number(comp.payout ?? 0);
      compTotals.set(name, (compTotals.get(name) ?? 0) + payout);
    }
  }
  console.log('\nComponent totals from outcomes:');
  for (const [name, total] of Array.from(compTotals.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: MX$${total.toLocaleString()}`);
  }

  // Check latest batch's calculation_results
  if (batches && batches.length > 0) {
    const latestBatch = batches[0];
    console.log(`\n=== CALCULATION_RESULTS (batch ${latestBatch.id.slice(0,8)}) ===`);

    let crTotal = 0;
    let crCount = 0;
    let crPage = 0;
    const crCompTotals = new Map<string, number>();

    while (true) {
      const { data: results } = await supabase
        .from('calculation_results')
        .select('total_payout, components')
        .eq('batch_id', latestBatch.id)
        .range(crPage * PAGE, (crPage + 1) * PAGE - 1);
      if (!results || results.length === 0) break;
      for (const r of results) {
        crTotal += r.total_payout;
        crCount++;
        const comps = Array.isArray(r.components) ? r.components : [];
        for (const c of comps) {
          const comp = c as Record<string, unknown>;
          const name = String(comp.componentName ?? 'unknown');
          const payout = Number(comp.payout ?? 0);
          crCompTotals.set(name, (crCompTotals.get(name) ?? 0) + payout);
        }
      }
      if (results.length < PAGE) break;
      crPage++;
    }

    console.log(`Results count: ${crCount}`);
    console.log(`Results total: MX$${crTotal.toLocaleString()}`);
    console.log('\nComponent totals from results:');
    for (const [name, total] of Array.from(crCompTotals.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name}: MX$${total.toLocaleString()}`);
    }
  }

  // Check what the reconciliation page reads
  console.log('\n=== RECONCILIATION DATA CHECK ===');
  const { data: reconResults } = await supabase
    .from('entity_period_outcomes')
    .select('entity_id, total_payout, component_breakdown')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .order('total_payout', { ascending: false })
    .limit(5);

  console.log('Top 5 outcomes:');
  for (const r of reconResults ?? []) {
    const comps = Array.isArray(r.component_breakdown) ? r.component_breakdown : [];
    const compStr = comps.map((c: unknown) => {
      const comp = c as Record<string, unknown>;
      return `${comp.componentName}=${comp.payout}`;
    }).join(', ');
    console.log(`  ${r.entity_id.slice(0,8)}: MX$${r.total_payout} | ${compStr}`);
  }
}

check().catch(console.error);
