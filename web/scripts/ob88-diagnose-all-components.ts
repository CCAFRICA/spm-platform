/**
 * OB-88: Comprehensive diagnosis of all 6 component deltas
 * Check rule_set config, data matching, metric resolution for each component
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GROUND_TRUTH: Record<string, number> = {
  'Optical Sales': 505750,
  'Store Sales': 129200,
  'New Customers': 207200,
  'Collections': 214400,
  'Insurance': 46032,
  'Warranty': 151250,
};

async function main() {
  console.log('=== Component Diagnosis ===\n');

  const { data: period } = await sb.from('periods')
    .select('id').eq('tenant_id', TENANT_ID).eq('canonical_key', '2024-01').single();
  if (!period) throw new Error('Period not found');

  // 1. Get rule set and all component configs
  const { data: ruleSet } = await sb.from('rule_sets')
    .select('components').eq('id', RULE_SET_ID).single();
  if (!ruleSet) throw new Error('Rule set not found');

  const variants = ruleSet.components as Array<{
    name: string;
    components: Array<{
      name: string; componentType: string; enabled: boolean;
      matrixConfig?: Record<string, unknown>;
      tierConfig?: Record<string, unknown>;
      percentageConfig?: Record<string, unknown>;
      conditionalConfig?: Record<string, unknown>;
    }>;
  }>;

  // Use first variant (Optometrist)
  const components = variants[0]?.components || [];
  console.log(`Variant: ${variants[0]?.name}`);
  console.log(`Components: ${components.length}\n`);

  for (const comp of components) {
    console.log(`--- ${comp.name} (${comp.componentType}) ---`);
    const config = comp.matrixConfig || comp.tierConfig || comp.percentageConfig || comp.conditionalConfig;
    if (comp.componentType === 'matrix') {
      const mc = comp.matrixConfig as Record<string, unknown>;
      console.log(`  Row metric: ${mc?.rowMetric}`);
      console.log(`  Column metric: ${mc?.columnMetric}`);
      const rowBands = mc?.rowBands as Array<{min:number;max:number;label:string}>;
      const colBands = mc?.columnBands as Array<{min:number;max:number;label:string}>;
      if (rowBands) console.log(`  Row bands: ${rowBands.map(b => `${b.label}[${b.min}-${b.max}]`).join(', ')}`);
      if (colBands) console.log(`  Col bands: ${colBands.map(b => `${b.label}[${b.min}-${b.max}]`).join(', ')}`);
      const values = mc?.values as number[][];
      if (values) {
        console.log(`  Matrix values:`);
        for (let i = 0; i < values.length; i++) {
          console.log(`    Row ${i}: [${values[i].join(', ')}]`);
        }
      }
    } else if (comp.componentType === 'tier') {
      const tc = comp.tierConfig as Record<string, unknown>;
      console.log(`  Metric: ${tc?.metric}`);
      const tiers = tc?.tiers as Array<{min:number;max:number;value:number;label:string}>;
      if (tiers) {
        for (const t of tiers) console.log(`    ${t.label}: [${t.min}-${t.max}] = $${t.value}`);
      }
    } else if (comp.componentType === 'percentage') {
      const pc = comp.percentageConfig as Record<string, unknown>;
      console.log(`  Applied to: ${pc?.appliedTo}`);
      console.log(`  Rate: ${pc?.rate}`);
    } else if (comp.componentType === 'conditional_percentage') {
      const cc = comp.conditionalConfig as Record<string, unknown>;
      console.log(`  Applied to: ${cc?.appliedTo}`);
      const conditions = cc?.conditions as Array<{metric:string;min:number;max:number;rate:number}>;
      if (conditions) {
        for (const c of conditions) console.log(`    ${c.metric} [${c.min}-${c.max}]: rate=${c.rate}`);
      }
    }
    console.log();
  }

  // 2. Get all data types and their row counts
  console.log('\n=== Data Types ===');
  const dataTypes = new Map<string, number>();
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('data_type')
      .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      dataTypes.set(r.data_type, (dataTypes.get(r.data_type) || 0) + 1);
    }
    if (data.length < 1000) break;
    page++;
  }
  for (const [dt, count] of Array.from(dataTypes.entries()).sort()) {
    console.log(`  ${dt}: ${count} rows`);
  }

  // 3. Get latest calculation results by component
  console.log('\n=== Latest Calculation Results ===');
  const { data: latestBatch } = await sb.from('calculation_batches')
    .select('id').eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false }).limit(1).single();

  if (!latestBatch) {
    console.log('  No calculation batches found');
    return;
  }

  const componentTotals = new Map<string, { total: number; nonZero: number; count: number }>();
  page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('result_data')
      .eq('batch_id', latestBatch.id)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.result_data as Record<string, unknown>;
      const breakdown = rd.component_breakdown as Record<string, { payout: number }> | undefined;
      if (breakdown) {
        for (const [compName, compData] of Object.entries(breakdown)) {
          const entry = componentTotals.get(compName) || { total: 0, nonZero: 0, count: 0 };
          const payout = compData?.payout || 0;
          entry.total += payout;
          if (payout > 0) entry.nonZero++;
          entry.count++;
          componentTotals.set(compName, entry);
        }
      }
    }
    if (data.length < 1000) break;
    page++;
  }

  let grandTotal = 0;
  for (const [comp, data] of Array.from(componentTotals.entries()).sort()) {
    const expected = GROUND_TRUTH[comp] || 0;
    const delta = expected > 0 ? ((data.total - expected) / expected * 100).toFixed(1) : 'N/A';
    grandTotal += data.total;
    console.log(`  ${comp}: MX$${Math.round(data.total).toLocaleString()} (${data.nonZero} non-zero / ${data.count} total) | Expected: MX$${expected.toLocaleString()} | Delta: ${delta}%`);
  }
  console.log(`  GRAND TOTAL: MX$${Math.round(grandTotal).toLocaleString()} | Expected: MX$1,253,832`);

  // 4. Deep-dive: Sample a few entities for each component to see metrics
  console.log('\n=== Entity-Level Deep Dive (5 samples per component) ===');
  const { data: samples } = await sb.from('calculation_results')
    .select('result_data')
    .eq('batch_id', latestBatch.id)
    .limit(5);

  for (const s of samples || []) {
    const rd = s.result_data as Record<string, unknown>;
    const entityId = rd.entity_external_id || rd.entityId;
    console.log(`\n  Entity ${entityId}:`);
    console.log(`    Total: MX$${rd.total_payout}`);
    const breakdown = rd.component_breakdown as Record<string, Record<string, unknown>>;
    if (breakdown) {
      for (const [compName, compData] of Object.entries(breakdown)) {
        console.log(`    ${compName}: payout=${compData.payout}, metrics=${JSON.stringify(compData.metrics || {})}`);
      }
    }
  }

  // 5. Check Base_Club_Proteccion for store columns
  console.log('\n=== Club Proteccion Store Investigation ===');
  const { data: clubSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
    .eq('data_type', 'Base_Club_Proteccion')
    .limit(1);

  if (clubSample?.[0]) {
    const allKeys = Object.keys(clubSample[0].row_data as Record<string, unknown>);
    console.log(`  All keys in Club Proteccion: ${allKeys.join(', ')}`);
    // Check for anything that might be a store column
    const storeKeys = allKeys.filter(k =>
      k.toLowerCase().includes('tienda') || k.toLowerCase().includes('store') ||
      k.toLowerCase().includes('sucursal') || k.toLowerCase().includes('plaza') ||
      k.toLowerCase().includes('no_') || k.toLowerCase().includes('num_')
    );
    console.log(`  Potential store keys: ${storeKeys.length > 0 ? storeKeys.join(', ') : 'NONE'}`);
  }

  // 6. Check Base_Garantia_Extendida for store columns
  console.log('\n=== Garantia Extendida Store Investigation ===');
  const { data: warSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
    .eq('data_type', 'Base_Garantia_Extendida')
    .limit(1);

  if (warSample?.[0]) {
    const allKeys = Object.keys(warSample[0].row_data as Record<string, unknown>);
    console.log(`  All keys in Garantia Extendida: ${allKeys.join(', ')}`);
    const storeKeys = allKeys.filter(k =>
      k.toLowerCase().includes('tienda') || k.toLowerCase().includes('store') ||
      k.toLowerCase().includes('sucursal') || k.toLowerCase().includes('plaza')
    );
    console.log(`  Potential store keys: ${storeKeys.length > 0 ? storeKeys.join(', ') : 'NONE'}`);
  }

  // 7. Check how many optometrists have store assignments
  console.log('\n=== Optometrist Store Assignments ===');
  const optStores = new Map<string, Set<string>>();
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.entity_id) continue;
      const rd = r.row_data as Record<string, unknown>;
      const store = String(rd.num_tienda || rd.Tienda || rd.storeId || '');
      if (store) {
        if (!optStores.has(r.entity_id)) optStores.set(r.entity_id, new Set());
        optStores.get(r.entity_id)!.add(store);
      }
    }
    if (data.length < 1000) break;
    page++;
  }
  console.log(`  Optometrists with store assignments: ${optStores.size} / 719`);
  console.log(`  Unique stores: ${new Set(Array.from(optStores.values()).flatMap(s => Array.from(s))).size}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
