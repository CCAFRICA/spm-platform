/**
 * OB-85 R6: Verify post-fix results
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function verify() {
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, created_at, summary')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(1);

  const batchId = batches?.[0]?.id;
  const summary = batches?.[0]?.summary as Record<string, unknown> | null;
  console.log(`Batch: ${String(batchId).slice(0,8)}`);
  console.log(`Total: MX$${summary?.total_payout}\n`);

  // Component breakdown
  console.log('=== COMPONENT BREAKDOWN ===');
  const PAGE = 1000;
  const compTotals = new Map<string, { nonZero: number; total: number; count: number }>();
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('batch_id', batchId!)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const comps = Array.isArray(r.components) ? r.components : [];
      for (const c of comps) {
        const comp = c as Record<string, unknown>;
        const name = String(comp.componentName ?? 'unknown');
        const payout = Number(comp.payout ?? 0);
        const stats = compTotals.get(name) ?? { nonZero: 0, total: 0, count: 0 };
        stats.count++;
        if (payout > 0) stats.nonZero++;
        stats.total += payout;
        compTotals.set(name, stats);
      }
    }
    if (data.length < PAGE) break;
    page++;
  }

  for (const [name, stats] of Array.from(compTotals.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${name}: MX$${stats.total.toLocaleString()} | ${stats.nonZero}/${stats.count} non-zero`);
  }

  // Entity 93515855 check
  console.log('\n=== ENTITY 93515855 ===');
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Find UUID
  let entityUuid: string | null = null;
  page = 0;
  while (!entityUuid) {
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .eq('data_type', 'Datos Colaborador')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rd = row.row_data as Record<string, unknown>;
      if (String(rd?.entityId ?? rd?.num_empleado) === '93515855') {
        entityUuid = row.entity_id;
        break;
      }
    }
    if (data.length < PAGE) break;
    page++;
  }

  const { data: results } = await supabase
    .from('calculation_results')
    .select('total_payout, components')
    .eq('batch_id', batchId!)
    .eq('entity_id', entityUuid!);

  if (results && results.length > 0) {
    console.log(`Total: MX$${results[0].total_payout}`);
    const comps = Array.isArray(results[0].components) ? results[0].components : [];
    for (const c of comps) {
      const comp = c as Record<string, unknown>;
      console.log(`  ${comp.componentName}: MX$${comp.payout}`);
      if (String(comp.componentName ?? '').includes('Optical')) {
        const details = comp.details as Record<string, unknown>;
        console.log(`    rowMetric: ${details?.rowMetric}, rowValue: ${details?.rowValue}, rowBand: ${details?.rowBand}`);
        console.log(`    colMetric: ${details?.colMetric}, colValue: ${details?.colValue}, colBand: ${details?.colBand}`);
      }
    }
  }

  // Comparison table
  console.log('\n=== BEFORE vs AFTER vs BENCHMARK ===');
  const beforeComps: Record<string, number> = {
    'Optical (Certified)': 1201800,
    'Optical (Non-Certified)': 176150,
    'Store Sales': 115250,
    'New Customers': 38500,
    'Collections': 279800,
    'Service Sales': 66872.115,
    'Insurance Sales': 42.54,
  };

  const benchmarkComps: Record<string, number> = {
    'Optical': 748600,
    'Store Sales': 116250,
    'New Customers': 39100,
    'Collections': 283000,
    'Service Sales': 66872,
    'Insurance Sales': 10,
  };

  const afterTotal = results?.[0]?.total_payout ?? 0;
  console.log('Component | Before R6 | After R6 | Benchmark (Jan)');
  console.log('--- | --- | --- | ---');
  for (const [name, stats] of Array.from(compTotals.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`${name} | MX$${stats.total.toLocaleString()}`);
  }
  console.log(`\nGrand Total | MX$1,878,415 | MX$${Number(summary?.total_payout ?? 0).toLocaleString()} | MX$1,253,832`);
  console.log(`Delta to benchmark | 49.8% | ${(((Number(summary?.total_payout ?? 0) - 1253832) / 1253832) * 100).toFixed(1)}%`);
}

verify().catch(console.error);
