/**
 * OB-148 Phase 3: Recalculate with fixed attainment derivation
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob148-phase3-recalculate.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 3: RECALCULATE WITH FIXED ATTAINMENT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get Enero 2024 period
  const { data: enero } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();

  if (!enero) { console.error('Enero 2024 period not found'); return; }

  // Get active rule set
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) { console.error('No active rule set'); return; }

  console.log(`Period: ${enero.canonical_key} (${enero.id})`);
  console.log(`Rule set: ${rs.name} (${rs.id})`);

  // Step 1: Delete old results
  console.log('\n--- Step 1: Delete old results ---');
  const { error: delErr, count: delCount } = await supabase
    .from('calculation_results')
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId);

  if (delErr) { console.error('Delete error:', delErr.message); return; }
  console.log(`Deleted ${delCount} old results`);

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

  if (result.log) {
    console.log('\n--- API Log (filtered) ---');
    for (const line of result.log) {
      if (line.includes('Population') || line.includes('Roster') || line.includes('roster') ||
          line.includes('Grand total') || line.includes('COMPLETE') ||
          line.includes('filter') || line.includes('heuristic') || line.includes('parent') ||
          line.includes('Derivation') || line.includes('derivation')) {
        console.log(`  ${line}`);
      }
    }
  }

  // Step 3: Verify results
  console.log('\n\n--- Step 3: Per-component totals ---');

  const { count: newResultCount } = await supabase
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const componentTotals = new Map<string, { count: number; total: number; nonZero: number; max: number }>();
  let totalPayout = 0;
  let nonZero = 0;
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      totalPayout += (row.total_payout || 0);
      if (row.total_payout > 0) nonZero++;
      const comps = (row.components ?? []) as Array<Record<string, unknown>>;
      for (const comp of comps) {
        const name = String(comp.componentName ?? 'unknown');
        const payout = Number(comp.payout ?? 0);
        if (!componentTotals.has(name)) componentTotals.set(name, { count: 0, total: 0, nonZero: 0, max: 0 });
        const entry = componentTotals.get(name)!;
        entry.count++;
        entry.total += payout;
        if (payout > 0) entry.nonZero++;
        if (payout > entry.max) entry.max = payout;
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`\nresult_count: ${newResultCount}`);
  console.log(`total_payout: MX$${Math.round(totalPayout).toLocaleString()}`);
  console.log(`non_zero: ${nonZero}`);

  const BENCHMARK: Record<string, number> = {
    'Venta Optica': 748600,
    'Venta Tienda': 116250,
    'Clientes Nuevos': 39100,
    'Cobranza': 283000,
    'Club de Proteccion': 10,
    'Garantia Extendida': 66872,
  };
  const TOTAL_BENCHMARK = 1253832;

  console.log('\n--- Per-component reconciliation ---\n');
  console.log('| Component | Ground Truth | OB-148 Engine | Delta | Accuracy | vs OB-147 |');
  console.log('|-----------|-------------|---------------|-------|----------|-----------|');

  const ob147: Record<string, number> = {
    'Venta Optica': 521350,
    'Venta Tienda': 232050,
    'Clientes Nuevos': 40350,
    'Cobranza': 0,
    'Club de Proteccion': 43,
    'Garantia Extendida': 0,
  };

  let grandEngineTotal = 0;
  for (const name of Object.keys(BENCHMARK)) {
    const gt = BENCHMARK[name];
    const ct = componentTotals.get(name);
    const engineVal = ct ? ct.total : 0;
    grandEngineTotal += engineVal;
    const delta = engineVal - gt;
    const accuracy = gt > 0 ? ((engineVal / gt) * 100).toFixed(1) : 'N/A';
    const ob147Val = ob147[name] ?? 0;
    const ob147Acc = gt > 0 ? ((ob147Val / gt) * 100).toFixed(1) : 'N/A';
    const gtStr = `MX$${gt.toLocaleString()}`;
    const engStr = `MX$${Math.round(engineVal).toLocaleString()}`;
    const deltaStr = delta >= 0 ? `+MX$${Math.round(delta).toLocaleString()}` : `-MX$${Math.round(Math.abs(delta)).toLocaleString()}`;
    console.log(`| ${name.padEnd(19)} | ${gtStr.padEnd(12)} | ${engStr.padEnd(13)} | ${deltaStr.padEnd(16)} | ${String(accuracy + '%').padEnd(9)} | was ${ob147Acc}% |`);
  }

  const totalAccuracy = ((grandEngineTotal / TOTAL_BENCHMARK) * 100).toFixed(1);
  console.log(`| ${'**TOTAL**'.padEnd(19)} | **MX$${TOTAL_BENCHMARK.toLocaleString()}** | **MX$${Math.round(grandEngineTotal).toLocaleString()}** | ${grandEngineTotal >= TOTAL_BENCHMARK ? '+' : '-'}MX$${Math.round(Math.abs(grandEngineTotal - TOTAL_BENCHMARK)).toLocaleString()} | ${totalAccuracy}% | was 63.3% |`);

  const dataGap = BENCHMARK['Cobranza'] + BENCHMARK['Garantia Extendida'];
  const adjustedBenchmark = TOTAL_BENCHMARK - dataGap;
  const adjustedAccuracy = ((grandEngineTotal / adjustedBenchmark) * 100).toFixed(1);
  console.log(`\nAdjusted accuracy (excluding no-data components): ${adjustedAccuracy}% of MX$${adjustedBenchmark.toLocaleString()}`);

  // Tienda qualifying count
  const tiendaComp = componentTotals.get('Venta Tienda');
  console.log(`\nVenta Tienda qualifying: ${tiendaComp?.nonZero ?? 0} / ${tiendaComp?.count ?? 0} (benchmark: 362)`);

  // Entity traces
  console.log('\n\n--- Entity Traces ---');
  const traceEntities = ['93515855', '96568046', '90319253'];
  for (const extId of traceEntities) {
    const { data: ent } = await supabase
      .from('entities')
      .select('id, metadata')
      .eq('tenant_id', tenantId)
      .eq('external_id', extId)
      .single();

    if (!ent) { console.log(`\nEntity ${extId}: NOT FOUND`); continue; }

    const { data: cr } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .eq('entity_id', ent.id)
      .single();

    if (!cr) { console.log(`\nEntity ${extId}: NO RESULT`); continue; }

    const meta = (ent.metadata ?? {}) as Record<string, unknown>;
    console.log(`\nEntity ${extId} — Store: ${meta.store_id}, Total: MX$${cr.total_payout}`);
    const comps = (cr.components ?? []) as Array<Record<string, unknown>>;
    for (const c of comps) {
      const payout = Number(c.payout ?? 0);
      console.log(`  ${c.componentName}: MX$${payout}`);
      if (payout > 0) {
        const details = c.details as Record<string, unknown> | undefined;
        if (details) {
          if (details.matchedTier) console.log(`    tier: ${details.matchedTier}, metricValue: ${details.metricValue}`);
          if (details.rowBand) console.log(`    row: ${details.rowBand} (${details.rowValue}), col: ${details.colBand} (${details.colValue})`);
          if (details.matchedCondition) console.log(`    condition: ${details.matchedCondition}, rate: ${details.rate}, base: ${details.baseAmount}`);
        }
      }
    }
  }

  // Accuracy progression
  console.log('\n\n--- Accuracy Progression ---');
  console.log('| OB | Total | Accuracy | Tienda | Optica | Notes |');
  console.log('|----|-------|----------|--------|--------|-------|');
  console.log('| OB-144 | MX$12,659 | 1.0% | MX$500 | MX$0 | No store association |');
  console.log('| OB-146 | MX$977,609 | 78.0% | MX$268,650 | MX$610,825 | 22K entities |');
  console.log('| OB-147 | MX$793,793 | 63.3% | MX$232,050 | MX$521,350 | 719 entities |');
  const tiendaTotal = componentTotals.get('Venta Tienda')?.total ?? 0;
  const opticaTotal = componentTotals.get('Venta Optica')?.total ?? 0;
  console.log(`| OB-148 | MX$${Math.round(grandEngineTotal).toLocaleString()} | ${totalAccuracy}% | MX$${Math.round(tiendaTotal).toLocaleString()} | MX$${Math.round(opticaTotal).toLocaleString()} | Attainment fixed |`);
  console.log('| OB-75 | MX$1,262,865 | 100.7% | MX$115,250 | MX$762,400 | Clean tenant |');
  console.log('| Benchmark | MX$1,253,832 | 100.0% | MX$116,250 | MX$748,600 | Ground truth |');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`PG-03: Recalculation complete`);
  console.log(`  ${newResultCount} results, MX$${Math.round(totalPayout).toLocaleString()} (${totalAccuracy}%)`);
  console.log(`  Adjusted: ${adjustedAccuracy}% of MX$${adjustedBenchmark.toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
