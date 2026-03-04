/**
 * OB-154: Diagnose zero payout from calculation
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // 1. Sample calculation results
  const { data: results } = await sb.from('calculation_results')
    .select('entity_id, component_name, metrics_snapshot, calculated_value, total_payout')
    .eq('tenant_id', T)
    .limit(5);
  console.log('=== SAMPLE CALCULATION RESULTS ===');
  for (const r of results || []) {
    console.log(JSON.stringify(r, null, 2));
  }

  // 2. Check rule set components structure
  const { data: rs } = await sb.from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', T)
    .limit(1);
  if (rs?.[0]) {
    const comps = rs[0].components;
    console.log('\n=== RULE SET COMPONENTS ===');
    console.log('Type:', typeof comps, 'isArray:', Array.isArray(comps));
    const arr = Array.isArray(comps) ? comps : (comps as any)?.components || [];
    console.log('Count:', arr.length);
    for (const c of arr) {
      console.log(`\n  Component: ${c.name}`);
      console.log(`  Evaluator: ${c.evaluator_type}`);
      console.log(`  metric_mappings:`, JSON.stringify(c.metric_mappings || {}, null, 4));
      console.log(`  data_source_hint:`, c.data_source_hint);
      // Show first level of tiers/matrix if present
      if (c.tiers) console.log(`  tiers (first 2):`, JSON.stringify(c.tiers.slice(0, 2)));
      if (c.matrix) console.log(`  matrix (first 2):`, JSON.stringify(c.matrix.slice(0, 2)));
      if (c.percentage) console.log(`  percentage:`, c.percentage);
      if (c.condition) console.log(`  condition:`, JSON.stringify(c.condition));
    }
  }

  // 3. Check committed_data data_types
  console.log('\n=== COMMITTED DATA TYPES ===');
  const dataTypes = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('data_type')
      .eq('tenant_id', T)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const dt = r.data_type || 'NULL';
      dataTypes.set(dt, (dataTypes.get(dt) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  for (const [dt, count] of dataTypes) {
    console.log(`  ${dt}: ${count}`);
  }

  // 4. Check sample committed_data for January (source_date in Jan 2024)
  console.log('\n=== JANUARY DATA SAMPLE ===');
  const { data: janData } = await sb.from('committed_data')
    .select('data_type, entity_id, source_date, row_data')
    .eq('tenant_id', T)
    .gte('source_date', '2024-01-01')
    .lte('source_date', '2024-01-31')
    .not('entity_id', 'is', null)
    .limit(3);
  for (const r of janData || []) {
    console.log(`\n  data_type: ${r.data_type}`);
    console.log(`  entity_id: ${r.entity_id?.substring(0, 8)}...`);
    console.log(`  source_date: ${r.source_date}`);
    const keys = Object.keys(r.row_data || {});
    console.log(`  row_data keys: ${keys.join(', ')}`);
    // Show a few numeric values
    for (const k of keys) {
      const v = (r.row_data as any)[k];
      if (typeof v === 'number') {
        console.log(`    ${k}: ${v}`);
      }
    }
  }

  // 5. Count January data by type
  console.log('\n=== JANUARY DATA BY TYPE ===');
  const janTypes = new Map<string, number>();
  offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('data_type')
      .eq('tenant_id', T)
      .gte('source_date', '2024-01-01')
      .lte('source_date', '2024-01-31')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const dt = r.data_type || 'NULL';
      janTypes.set(dt, (janTypes.get(dt) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  for (const [dt, count] of janTypes) {
    console.log(`  ${dt}: ${count}`);
  }

  // 6. Non-zero results check
  const { data: nonZero } = await sb.from('calculation_results')
    .select('entity_id, component_name, calculated_value, total_payout')
    .eq('tenant_id', T)
    .gt('total_payout', 0)
    .limit(5);
  console.log(`\n=== NON-ZERO RESULTS: ${nonZero?.length || 0} ===`);
  for (const r of nonZero || []) {
    console.log(`  ${r.component_name}: $${r.total_payout}`);
  }

  // 7. Check calculation_batches
  const { data: batches } = await sb.from('calculation_batches')
    .select('id, period_id, rule_set_id, status, entity_count, created_at')
    .eq('tenant_id', T);
  console.log('\n=== CALCULATION BATCHES ===');
  for (const b of batches || []) {
    console.log(`  ${b.id.substring(0, 8)}... status=${b.status} entities=${b.entity_count}`);
  }
}

run().catch(console.error);
