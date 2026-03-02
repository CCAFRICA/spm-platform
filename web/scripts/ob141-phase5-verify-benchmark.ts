// OB-141 Phase 5: Verify Alpha benchmark — check if the original rule set produces correct results
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase5-verify-benchmark.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORIGINAL_RS_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function verifyBenchmark() {
  console.log('='.repeat(60));
  console.log('OB-141 PHASE 5: ALPHA BENCHMARK VERIFICATION');
  console.log('='.repeat(60));

  // 1. Verify pre-conditions
  console.log('\n=== PRE-CONDITIONS ===');

  const { count: entityCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Entities: ${entityCount}`);

  const { data: activeRs } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active');
  console.log(`Active rule set: ${activeRs?.[0]?.name} (${activeRs?.[0]?.id})`);
  console.log(`Is original: ${activeRs?.[0]?.id === ORIGINAL_RS_ID ? 'YES' : 'NO'}`);

  const { count: assignmentCount } = await supabase
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('rule_set_id', ORIGINAL_RS_ID);
  console.log(`Assignments to original plan: ${assignmentCount}`);

  const { count: cdCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Committed data rows: ${cdCount}`);

  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });
  console.log(`Periods: ${periods?.length}`);
  periods?.forEach(p => console.log(`  ${p.label} (${p.canonical_key})`));

  // 2. Check all calculation batches
  console.log('\n=== ALL CALCULATION BATCHES ===');
  const { data: calcBatches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, rule_set_id, entity_count, summary, lifecycle_state, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(20);

  for (const b of calcBatches || []) {
    const total = b.summary?.total_payout || b.summary?.totalPayout || '?';
    const period = periods?.find(p => p.id === b.period_id);
    const rsLabel = b.rule_set_id === ORIGINAL_RS_ID ? 'ORIGINAL' : 'IMPORTED';
    console.log(`  ${b.id} | ${period?.label || b.period_id} | ${rsLabel} | ${b.entity_count} entities | MX$${Number(total).toLocaleString()} | ${b.lifecycle_state} | ${b.created_at}`);
  }

  // 3. Find batches with the ORIGINAL rule_set
  const originalBatches = (calcBatches || []).filter(b => b.rule_set_id === ORIGINAL_RS_ID);
  console.log(`\nBatches with ORIGINAL rule set: ${originalBatches.length}`);

  if (originalBatches.length === 0) {
    console.log('\n--- NO CALCULATION BATCHES WITH ORIGINAL RULE SET ---');
    console.log('A new calculation must be triggered from the browser.');
    console.log('');
    console.log('INSTRUCTIONS:');
    console.log('1. Open localhost:3000/operate/calculate');
    console.log('2. Select plan: "Plan de Comisiones Optica Luminar 2026"');
    console.log('3. Select period: January 2024');
    console.log('4. Click Calculate');
    console.log('5. After calculation completes, re-run this script');
    console.log('');
    console.log('The rule set swap is done. The next calculation will use the');
    console.log('original 6-component plan. This script will verify the results.');

    // Still check what the IMPORTED batches produced, for comparison
    console.log('\n=== IMPORTED BATCH ANALYSIS (for comparison) ===');
    for (const b of (calcBatches || []).filter(b => b.rule_set_id !== ORIGINAL_RS_ID).slice(0, 3)) {
      const period = periods?.find(p => p.id === b.period_id);
      console.log(`\nBatch: ${b.id} (${period?.label})`);

      const { data: results } = await supabase
        .from('calculation_results')
        .select('total_payout, components')
        .eq('batch_id', b.id)
        .limit(1000);

      const total = results?.reduce((s, r) => s + Number(r.total_payout), 0) || 0;
      const nonZero = results?.filter(r => Number(r.total_payout) > 0).length || 0;
      console.log(`  Results: ${results?.length}, non-zero: ${nonZero}, total: MX$${total.toLocaleString()}`);

      // Component breakdown
      const compTotals: Record<string, number> = {};
      for (const r of results || []) {
        if (Array.isArray(r.components)) {
          for (const c of r.components) {
            const name = c.componentName || c.component_name || `comp-${c.componentId || 'unknown'}`;
            compTotals[name] = (compTotals[name] || 0) + Number(c.payout || 0);
          }
        } else if (r.components && typeof r.components === 'object') {
          for (const [name, data] of Object.entries(r.components)) {
            const payout = Number((data as any)?.payout || (data as any)?.result || 0);
            compTotals[name] = (compTotals[name] || 0) + payout;
          }
        }
      }
      if (Object.keys(compTotals).length > 0) {
        console.log('  Components:');
        for (const [name, val] of Object.entries(compTotals).sort((a, b) => b[1] - a[1])) {
          console.log(`    ${name}: MX$${val.toLocaleString()}`);
        }
      }
    }
    return;
  }

  // 4. Verify the MOST RECENT original-rule-set batch
  const latestOrigBatch = originalBatches[0];
  console.log(`\n=== VERIFYING BATCH ${latestOrigBatch.id} ===`);

  const { data: results } = await supabase
    .from('calculation_results')
    .select('total_payout, components')
    .eq('batch_id', latestOrigBatch.id);

  const totalPayout = results?.reduce((s, r) => s + Number(r.total_payout), 0) || 0;
  const entityResults = results?.length || 0;
  const nonZero = results?.filter(r => Number(r.total_payout) > 0).length || 0;

  console.log(`Entity results: ${entityResults}`);
  console.log(`Non-zero: ${nonZero}`);
  console.log(`Total payout: MX$${totalPayout.toLocaleString()}`);

  // 5. Component-level breakdown
  const componentTotals: Record<string, number> = {};
  for (const result of results || []) {
    if (Array.isArray(result.components)) {
      for (const c of result.components) {
        const name = c.componentName || c.component_name || `comp-${c.componentId || 'unknown'}`;
        componentTotals[name] = (componentTotals[name] || 0) + Number(c.payout || 0);
      }
    } else if (result.components && typeof result.components === 'object') {
      for (const [name, data] of Object.entries(result.components)) {
        const payout = Number((data as any)?.payout || (data as any)?.result || 0);
        componentTotals[name] = (componentTotals[name] || 0) + payout;
      }
    }
  }

  console.log('\n=== COMPONENT BREAKDOWN ===');
  const expectedComponents: Record<string, number> = {
    'Venta Optica': 748600,
    'Venta Tienda': 116250,
    'Clientes Nuevos': 39100,
    'Cobranza': 283000,
    'Club de Proteccion': 10,
    'Garantia Extendida': 66872,
  };

  for (const [name, total] of Object.entries(componentTotals).sort((a, b) => b[1] - a[1])) {
    const matchKey = Object.keys(expectedComponents).find(k => {
      const kLower = k.toLowerCase();
      const nLower = name.toLowerCase();
      return nLower.includes(kLower.split(' ')[0]) || kLower.includes(nLower.split(' ')[0]);
    });
    const expected = matchKey ? expectedComponents[matchKey] : null;
    const delta = expected !== null ? total - expected : null;
    const status = delta !== null ? (Math.abs(delta) < 1 ? 'MATCH' : 'DELTA') : '?';
    console.log(`  ${status} ${name}: MX$${total.toLocaleString()} ${expected !== null ? `(expected: MX$${expected.toLocaleString()}, delta: MX$${delta?.toLocaleString()})` : '(no expected value)'}`);
  }

  // 6. Final verdict
  const EXPECTED_TOTAL = 1253832;
  const totalDelta = Math.abs(totalPayout - EXPECTED_TOTAL);
  console.log('\n' + '='.repeat(60));
  console.log('ALPHA BENCHMARK VERIFICATION');
  console.log('='.repeat(60));
  console.log(`Entities:  ${entityResults} ${entityResults === 719 ? 'PASS' : `(expected 719)`}`);
  console.log(`Total:     MX$${totalPayout.toLocaleString()} ${totalDelta < 1 ? 'PASS' : `(expected MX$1,253,832, delta: MX$${totalDelta.toLocaleString()})`}`);
  console.log(`Components: ${Object.keys(componentTotals).length} ${Object.keys(componentTotals).length === 6 ? 'PASS' : `(expected 6)`}`);
  console.log(`Verdict:   ${totalDelta < 1 && entityResults === 719 ? 'ALPHA BENCHMARK RESTORED' : 'BENCHMARK NOT YET RESTORED — trigger calculation from browser'}`);
  console.log('='.repeat(60));
}

verifyBenchmark().catch(console.error);
