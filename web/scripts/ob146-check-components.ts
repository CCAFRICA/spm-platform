/**
 * Quick check: what metrics do each component expect?
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  const { data: rs } = await supabase.from('rule_sets').select('components, input_bindings')
    .eq('tenant_id', tenantId).eq('status', 'active').single();
  if (!rs) { console.error('No rule set'); return; }

  const components = rs.components as Array<Record<string, unknown>>;
  for (const c of components) {
    console.log(`\n=== ${c.name} (${c.componentType}) ===`);
    if (c.tierConfig) {
      const tc = c.tierConfig as Record<string, unknown>;
      console.log(`  metric: ${tc.metric}`);
      console.log(`  tiers: ${JSON.stringify(tc.tiers)}`);
    }
    if (c.matrixConfig) {
      const mc = c.matrixConfig as Record<string, unknown>;
      console.log(`  rowMetric: ${mc.rowMetric}`);
      console.log(`  columnMetric: ${mc.columnMetric}`);
      console.log(`  rowBands: ${JSON.stringify(mc.rowBands)}`);
      console.log(`  columnBands: ${JSON.stringify(mc.columnBands)}`);
      console.log(`  values: ${JSON.stringify(mc.values)}`);
    }
    if (c.conditionalConfig) {
      const cc = c.conditionalConfig as Record<string, unknown>;
      console.log(`  appliedTo: ${cc.appliedTo}`);
      console.log(`  conditions: ${JSON.stringify(cc.conditions)}`);
    }
    if (c.percentageConfig) {
      const pc = c.percentageConfig as Record<string, unknown>;
      console.log(`  appliedTo: ${pc.appliedTo}`);
      console.log(`  rate: ${pc.rate}`);
    }
  }

  // Also check what store data fields exist
  console.log('\n\n=== STORE DATA FIELD ANALYSIS ===');
  const PAGE_SIZE = 1000;
  const { data: periods } = await supabase.from('periods').select('id, canonical_key').eq('tenant_id', tenantId);
  const enero = (periods ?? []).find(p => p.canonical_key === '2024-01');

  if (enero) {
    // Store-level data
    let page = 0;
    const allStoreRows: Array<Record<string, unknown>> = [];
    while (true) {
      const from = page * PAGE_SIZE;
      const { data } = await supabase.from('committed_data').select('data_type, row_data')
        .eq('tenant_id', tenantId).eq('period_id', enero.id).is('entity_id', null).range(from, from + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      allStoreRows.push(...data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    const storeSheetFields = new Map<string, Set<string>>();
    for (const row of allStoreRows) {
      const dt = String(row.data_type);
      if (!storeSheetFields.has(dt)) storeSheetFields.set(dt, new Set());
      const rd = (row.row_data ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(rd)) {
        if (!k.startsWith('_')) storeSheetFields.get(dt)!.add(k);
      }
    }

    for (const [dt, fields] of Array.from(storeSheetFields.entries())) {
      console.log(`\n${dt}:`);
      console.log(`  fields: ${Array.from(fields).join(', ')}`);
      // Sample values
      const sample = allStoreRows.find(r => r.data_type === dt);
      if (sample) {
        const rd = (sample.row_data ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(rd)) {
          if (!k.startsWith('_')) console.log(`  ${k}: ${v} (${typeof v})`);
        }
      }
    }
  }

  // Check the derivation rules
  console.log('\n\n=== METRIC DERIVATION RULES ===');
  const bindings = rs.input_bindings as Record<string, unknown>;
  const derivations = (bindings?.metric_derivations ?? []) as Array<Record<string, unknown>>;
  for (const d of derivations) {
    console.log(`\n${d.metric}:`);
    console.log(`  operation: ${d.operation}`);
    console.log(`  source_pattern: ${d.source_pattern}`);
    console.log(`  source_field: ${d.source_field}`);
    if (d.numerator_metric) console.log(`  numerator: ${d.numerator_metric}, denominator: ${d.denominator_metric}`);
  }
}

main().catch(console.error);
