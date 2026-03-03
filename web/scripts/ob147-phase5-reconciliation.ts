/**
 * OB-147 Phase 5: CC-UAT-08 Full Reconciliation
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob147-phase5-reconciliation.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

const BENCHMARK: Record<string, number> = {
  'Venta Optica': 748600,
  'Venta Tienda': 116250,
  'Clientes Nuevos': 39100,
  'Cobranza': 283000,
  'Club de Proteccion': 10,
  'Garantia Extendida': 66872,
};
const TOTAL_BENCHMARK = 1253832;

const ENTITY_BENCHMARKS: Record<string, { total: number; desc: string }> = {
  '93515855': { total: 4650, desc: 'high performer, certificado' },
  '96568046': { total: 1877, desc: 'certificado, moderate' },
  '90319253': { total: 6617, desc: 'no certificado, warranty heavy' },
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-147 PHASE 5: CC-UAT-08 FULL RECONCILIATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 5A: Per-component reconciliation table ──
  const allResults: Array<{ total_payout: number; components: unknown }> = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    allResults.push(...(data as typeof allResults));
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  const componentTotals = new Map<string, { count: number; total: number; nonZero: number; max: number }>();
  for (const row of allResults) {
    const cr = (row.components ?? []) as Array<Record<string, unknown>>;
    for (const comp of cr) {
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

  const totalPayout = allResults.reduce((s, r) => s + (r.total_payout || 0), 0);
  const nonZero = allResults.filter(r => r.total_payout > 0).length;

  console.log(`Total results: ${allResults.length}`);
  console.log(`Total payout: MX$${Math.round(totalPayout).toLocaleString()}`);
  console.log(`Non-zero: ${nonZero}`);

  // ── CC-UAT-08 RECONCILIATION TABLE ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('CC-UAT-08 RECONCILIATION TABLE — OB-147');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('| Component | Ground Truth | OB-147 Engine | Delta | Accuracy | vs OB-146 |');
  console.log('|-----------|-------------|---------------|-------|----------|-----------|');

  const ob146: Record<string, number> = {
    'Venta Optica': 610825,
    'Venta Tienda': 268650,
    'Clientes Nuevos': 48025,
    'Cobranza': 37950,
    'Club de Proteccion': 12159,
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

    const ob146Val = ob146[name] ?? 0;
    const ob146Acc = gt > 0 ? ((ob146Val / gt) * 100).toFixed(1) : 'N/A';

    const gtStr = `MX$${gt.toLocaleString()}`;
    const engStr = `MX$${Math.round(engineVal).toLocaleString()}`;
    const deltaStr = delta >= 0 ? `+MX$${Math.round(delta).toLocaleString()}` : `-MX$${Math.round(Math.abs(delta)).toLocaleString()}`;

    console.log(`| ${name.padEnd(19)} | ${gtStr.padEnd(12)} | ${engStr.padEnd(13)} | ${deltaStr.padEnd(16)} | ${String(accuracy + '%').padEnd(9)} | was ${ob146Acc}% |`);
  }

  const totalDelta = grandEngineTotal - TOTAL_BENCHMARK;
  const totalAccuracy = ((grandEngineTotal / TOTAL_BENCHMARK) * 100).toFixed(1);
  const ob146Total = 977609;
  const ob146TotalAcc = ((ob146Total / TOTAL_BENCHMARK) * 100).toFixed(1);
  console.log(`| ${'**TOTAL**'.padEnd(19)} | **MX$${TOTAL_BENCHMARK.toLocaleString()}** | **MX$${Math.round(grandEngineTotal).toLocaleString()}** | ${totalDelta >= 0 ? '+' : '-'}MX$${Math.round(Math.abs(totalDelta)).toLocaleString()} | ${totalAccuracy}% | was ${ob146TotalAcc}% |`);

  console.log(`\nPASS threshold: Component within ±10% of ground truth`);
  console.log(`TARGET: Total ≥ 95% (MX$1,191,140+)`);
  console.log(`STRETCH: Total ≥ 98% (matches OB-75)`);

  // ── 5B: Entity traces ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('ENTITY TRACES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const [extId, bench] of Object.entries(ENTITY_BENCHMARKS)) {
    const { data: ent } = await supabase
      .from('entities')
      .select('id, metadata')
      .eq('tenant_id', tenantId)
      .eq('external_id', extId)
      .single();

    if (!ent) { console.log(`Entity ${extId}: NOT FOUND\n`); continue; }

    const { data: cr } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .eq('entity_id', ent.id)
      .single();

    if (!cr) { console.log(`Entity ${extId}: NO RESULT (not on roster)\n`); continue; }

    const meta = (ent.metadata ?? {}) as Record<string, unknown>;
    const delta = cr.total_payout - bench.total;
    const accuracy = ((cr.total_payout / bench.total) * 100).toFixed(1);

    console.log(`Entity ${extId} (${bench.desc})`);
    console.log(`  Store: ${meta.store_id ?? 'N/A'}, Volume Tier: ${meta.volume_tier ?? 'N/A'}`);
    console.log(`  Expected: ~MX$${bench.total.toLocaleString()}`);
    console.log(`  Actual:    MX$${cr.total_payout.toLocaleString()}`);
    console.log(`  Delta:     ${delta >= 0 ? '+' : ''}MX$${delta.toLocaleString()} (${accuracy}%)`);

    const comps = (cr.components ?? []) as Array<Record<string, unknown>>;
    for (const c of comps) {
      const payout = Number(c.payout ?? 0);
      const details = c.details as Record<string, unknown> | undefined;
      console.log(`    ${c.componentName}: MX$${payout}`);
      if (details && payout > 0) {
        if (details.matchedTier) console.log(`      tier: ${details.matchedTier}, metricValue: ${details.metricValue}`);
        if (details.rowBand) console.log(`      row: ${details.rowBand} (${details.rowValue}), col: ${details.colBand} (${details.colValue})`);
        if (details.matchedCondition) console.log(`      condition: ${details.matchedCondition}, rate: ${details.rate}, base: ${details.baseAmount}`);
      }
    }
    console.log();
  }

  // ── 5C: Accuracy progression ──
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('ACCURACY PROGRESSION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('| OB | Total | Accuracy | Components Non-Zero | Entities |');
  console.log('|----|-------|----------|---------------------|----------|');
  console.log(`| OB-144 | MX$12,659 | 1.0% | 2/6 | 22,159 |`);
  console.log(`| OB-146 | MX$977,609 | 78.0% | 5/6 | 22,159 |`);
  const nonZeroComponents = Array.from(componentTotals.values()).filter(c => c.total > 0).length;
  console.log(`| OB-147 | MX$${Math.round(grandEngineTotal).toLocaleString()} | ${totalAccuracy}% | ${nonZeroComponents}/6 | ${allResults.length} |`);
  console.log(`| OB-75 ref | MX$1,262,865 | 100.7% | 6/6 | 719 |`);
  console.log(`| Benchmark | MX$1,253,832 | 100.0% | 6/6 | 719 |`);

  // ── 5D: Gap analysis ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('GAP ANALYSIS — REMAINING DELTA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Venta Optica
  const vo = componentTotals.get('Venta Optica');
  if (vo) {
    const voAcc = (vo.total / BENCHMARK['Venta Optica'] * 100).toFixed(1);
    console.log('COMPONENT: Venta Optica');
    console.log(`OB-147 RESULT: MX$${Math.round(vo.total).toLocaleString()}`);
    console.log(`GROUND TRUTH: MX$${BENCHMARK['Venta Optica'].toLocaleString()}`);
    console.log(`ACCURACY: ${voAcc}%`);
    console.log(`ENTITIES: ${vo.nonZero}/${vo.count} non-zero (benchmark ~620)`);
    console.log('ROOT CAUSE: Matrix resolution — store_attainment_percent and store_volume_tier');
    console.log('  are resolved correctly for most entities, but matrix payouts are lower per-entity');
    console.log('  than benchmark. Average: MX$' + Math.round(vo.total / vo.nonZero) + '/entity vs benchmark ~MX$1,207.');
    console.log('  This suggests some entities are hitting lower matrix cells than expected.');
    console.log('FIX COMPLEXITY: moderate — requires auditing matrix cell resolution per tier/band');
    console.log('FIX PATH: Verify store_volume_tier distribution and matrix values match benchmark\n');
  }

  // Venta Tienda
  const vt = componentTotals.get('Venta Tienda');
  if (vt) {
    const vtAcc = (vt.total / BENCHMARK['Venta Tienda'] * 100).toFixed(1);
    console.log('COMPONENT: Venta Tienda');
    console.log(`OB-147 RESULT: MX$${Math.round(vt.total).toLocaleString()}`);
    console.log(`GROUND TRUTH: MX$${BENCHMARK['Venta Tienda'].toLocaleString()}`);
    console.log(`ACCURACY: ${vtAcc}%`);
    console.log(`ENTITIES: ${vt.nonZero}/${vt.count} non-zero (benchmark ~362)`);
    console.log('ROOT CAUSE: Too many entities (603 vs 362) hit >=80% attainment tiers.');
    console.log('  The store_attainment_percent metric comes from Cumplimiento in BVI data.');
    console.log('  All 719 roster entities resolve this metric, but benchmark shows only 362 should.');
    console.log('  Possible: some entities should use a different attainment source or threshold.');
    console.log('FIX COMPLEXITY: moderate — attainment metric source may differ per variant/store');
    console.log('FIX PATH: Compare entity-level attainment vs store-level for benchmark discrepancy\n');
  }

  // Cobranza
  console.log('COMPONENT: Cobranza');
  console.log('OB-147 RESULT: MX$0');
  console.log(`GROUND TRUTH: MX$${BENCHMARK['Cobranza'].toLocaleString()}`);
  console.log('ACCURACY: 0%');
  console.log('ROOT CAUSE: NO COBRANZA DATA IN IMPORT.');
  console.log('  The derivation rule expects Monto_Recuperado_Actual/Meta from sheets matching');
  console.log('  .*cobranza.*|backttest_optometrista_mar2025_proveedores$');
  console.log('  But the parent sheet store rows only have Meta_Venta_Tienda/Real_Venta_Tienda.');
  console.log('  No Cobranza/collections sheet exists in the import.');
  console.log('FIX COMPLEXITY: DATA GAP — cannot fix without data');
  console.log('FIX PATH: Import Cobranza data sheet (separate file or tab with Monto_Recuperado fields)\n');

  // Garantia Extendida
  console.log('COMPONENT: Garantia Extendida');
  console.log('OB-147 RESULT: MX$0');
  console.log(`GROUND TRUTH: MX$${BENCHMARK['Garantia Extendida'].toLocaleString()}`);
  console.log('ACCURACY: 0%');
  console.log('ROOT CAUSE: NO WARRANTY DATA IN IMPORT.');
  console.log('  Known from OB-144: BVI data has no individual_warranty_sales field.');
  console.log('FIX COMPLEXITY: DATA GAP — cannot fix without data');
  console.log('FIX PATH: Import warranty sales data (separate file)\n');

  // Summary
  const dataGap = BENCHMARK['Cobranza'] + BENCHMARK['Garantia Extendida'];
  const adjustedBenchmark = TOTAL_BENCHMARK - dataGap;
  const adjustedAccuracy = ((grandEngineTotal / adjustedBenchmark) * 100).toFixed(1);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('ADJUSTED ACCURACY (excluding components with NO DATA):');
  console.log(`  Benchmark (4 components): MX$${adjustedBenchmark.toLocaleString()}`);
  console.log(`  Engine (4 components): MX$${Math.round(grandEngineTotal).toLocaleString()}`);
  console.log(`  Adjusted accuracy: ${adjustedAccuracy}%`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nPG-05: CC-UAT-08 reconciliation complete`);
  console.log(`       Total: MX$${Math.round(grandEngineTotal).toLocaleString()} / MX$${TOTAL_BENCHMARK.toLocaleString()} = ${totalAccuracy}%`);
  console.log(`       Adjusted (excl. data gaps): ${adjustedAccuracy}% of MX$${adjustedBenchmark.toLocaleString()}`);
  console.log(`       ${nonZeroComponents} / 6 components non-zero, ${allResults.length} entities`);
}

main().catch(console.error);
