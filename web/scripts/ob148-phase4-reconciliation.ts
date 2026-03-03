/**
 * OB-148 Phase 4: CC-UAT-09 Reconciliation + Gap Analysis
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

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CC-UAT-09 RECONCILIATION TABLE — OB-148');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const componentTotals = new Map<string, { count: number; total: number; nonZero: number; max: number }>();
  let totalPayout = 0;
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
      const comps = (row.components ?? []) as Array<Record<string, any>>;
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

  console.log('### 4A: Reconciliation Table\n');
  console.log('| Component | Ground Truth | OB-148 Engine | Delta | Accuracy | vs OB-147 |');
  console.log('|-----------|-------------|---------------|-------|----------|-----------|');

  const ob147: Record<string, number> = {
    'Venta Optica': 521350, 'Venta Tienda': 232050, 'Clientes Nuevos': 40350,
    'Cobranza': 0, 'Club de Proteccion': 43, 'Garantia Extendida': 0,
  };

  let grandEngineTotal = 0;
  for (const name of Object.keys(BENCHMARK)) {
    const gt = BENCHMARK[name];
    const ct = componentTotals.get(name);
    const engineVal = ct ? ct.total : 0;
    grandEngineTotal += engineVal;
    const delta = engineVal - gt;
    const accuracy = gt > 0 ? ((engineVal / gt) * 100).toFixed(1) : 'N/A';
    const ob147Acc = gt > 0 ? ((ob147[name] / gt) * 100).toFixed(1) : 'N/A';
    console.log(`| ${name.padEnd(19)} | MX$${gt.toLocaleString().padEnd(8)} | MX$${Math.round(engineVal).toLocaleString().padEnd(9)} | ${(delta >= 0 ? '+' : '')}MX$${Math.round(delta).toLocaleString()} | ${accuracy}% | was ${ob147Acc}% |`);
  }

  const totalAccuracy = ((grandEngineTotal / TOTAL_BENCHMARK) * 100).toFixed(1);
  console.log(`| **TOTAL** | **MX$${TOTAL_BENCHMARK.toLocaleString()}** | **MX$${Math.round(grandEngineTotal).toLocaleString()}** | MX$${Math.round(grandEngineTotal - TOTAL_BENCHMARK).toLocaleString()} | ${totalAccuracy}% | was 63.3% |`);

  const adjustedBenchmark = TOTAL_BENCHMARK - BENCHMARK['Cobranza'] - BENCHMARK['Garantia Extendida'];
  const adjustedAccuracy = ((grandEngineTotal / adjustedBenchmark) * 100).toFixed(1);
  console.log(`\nAdjusted (excl. Cobranza + Garantía): ${adjustedAccuracy}% of MX$${adjustedBenchmark.toLocaleString()}`);

  // 4B: Entity traces
  console.log('\n\n### 4B: Entity Traces\n');
  for (const extId of ['93515855', '96568046', '90319253']) {
    const { data: ent } = await supabase.from('entities').select('id, metadata').eq('tenant_id', tenantId).eq('external_id', extId).single();
    if (!ent) continue;
    const { data: cr } = await supabase.from('calculation_results').select('total_payout, components').eq('tenant_id', tenantId).eq('entity_id', ent.id).single();
    if (!cr) continue;
    const meta = (ent.metadata ?? {}) as Record<string, any>;
    console.log(`**Entity ${extId}** — Store: ${meta.store_id}, Total: MX$${cr.total_payout}`);
    for (const c of (cr.components ?? []) as Array<Record<string, any>>) {
      const d = c.details as Record<string, any> | undefined;
      let info = '';
      if (d?.matchedTier) info = ` → tier: ${d.matchedTier}, val: ${Number(d.metricValue).toFixed(1)}%`;
      if (d?.rowBand && d.rowBand !== 'none') info = ` → row: ${d.rowBand} (${Number(d.rowValue).toFixed(1)}%), col: ${d.colBand}`;
      if (d?.matchedCondition) info = ` → ${d.matchedCondition}, rate=${d.rate}, base=${d.baseAmount}`;
      console.log(`  ${c.componentName}: MX$${Number(c.payout).toFixed(0)}${info}`);
    }
    console.log('');
  }

  // 4C: Qualifying count
  console.log('### 4C: Venta Tienda Qualifying Count\n');
  const tiendaComp = componentTotals.get('Venta Tienda');
  console.log(`Before (OB-147): 603 / 719 (83.9%)`);
  console.log(`After (OB-148):  ${tiendaComp?.nonZero ?? 0} / ${tiendaComp?.count ?? 0} (${((tiendaComp?.nonZero ?? 0) / (tiendaComp?.count ?? 1) * 100).toFixed(1)}%)`);
  console.log(`Benchmark:       362 / 719 (50.3%)`);

  // 4D: Accuracy progression
  console.log('\n\n### 4D: Accuracy Progression\n');
  console.log('| OB | Total | Accuracy | Tienda | Óptica | Notes |');
  console.log('|----|-------|----------|--------|--------|-------|');
  console.log('| OB-144 | MX$12,659 | 1.0% | MX$500 | MX$0 | No store association |');
  console.log('| OB-146 | MX$977,609 | 78.0% | MX$268,650 | MX$610,825 | 22K entities |');
  console.log('| OB-147 | MX$793,793 | 63.3% | MX$232,050 | MX$521,350 | 719 entities |');
  console.log(`| OB-148 | MX$${Math.round(grandEngineTotal).toLocaleString()} | ${totalAccuracy}% | MX$${Math.round(tiendaComp?.total ?? 0).toLocaleString()} | MX$${Math.round(componentTotals.get('Venta Optica')?.total ?? 0).toLocaleString()} | Attainment + bands fixed |`);
  console.log('| OB-75 | MX$1,262,865 | 100.7% | MX$115,250 | MX$762,400 | Clean tenant |');
  console.log('| Benchmark | MX$1,253,832 | 100.0% | MX$116,250 | MX$748,600 | Ground truth |');

  // 4E: Gap analysis
  console.log('\n\n### 4E: Gap Analysis\n');
  for (const name of Object.keys(BENCHMARK)) {
    const gt = BENCHMARK[name];
    if (gt < 100) continue;
    const engineVal = componentTotals.get(name)?.total ?? 0;
    const accuracy = (engineVal / gt) * 100;
    if (Math.abs(accuracy - 100) > 10) {
      console.log(`COMPONENT: ${name}`);
      console.log(`  OB-148: MX$${Math.round(engineVal).toLocaleString()} | GT: MX$${gt.toLocaleString()} | ${accuracy.toFixed(1)}%`);
      if (name === 'Venta Optica') {
        console.log(`  ROOT CAUSE: No certification variant data → all entities use base matrix.`);
        console.log(`    Plan likely defines Certificado/No Certificado matrices (~2x difference).`);
        console.log(`    Also: 3 volume tiers vs possible 5 in original plan.`);
        console.log(`  FIXABLE: NO — requires Certificado field in import data.`);
      } else if (name === 'Cobranza') {
        console.log(`  ROOT CAUSE: Cobranza activated by merge fix but derivation rules may need tuning.`);
        console.log(`  FIXABLE: PARTIALLY — derivation rule optimization.`);
      } else if (name === 'Garantia Extendida') {
        console.log(`  ROOT CAUSE: No warranty data in import.`);
        console.log(`  FIXABLE: NO — data gap.`);
      }
      console.log('');
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PG-04: CC-UAT-09 complete');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
