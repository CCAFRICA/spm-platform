/**
 * OB-167 Phase 0 Part 3: metric_mappings + evaluateComponent trace
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  // 1. Check metric_mappings
  console.log('--- metric_mappings ---');
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .single();

  const ib = rs?.input_bindings as Record<string, unknown>;
  const mm = ib?.metric_mappings;
  console.log('metric_mappings:', JSON.stringify(mm, null, 2));

  // 2. Check what evaluateComponent does with each type
  // We need to trace through the percentage evaluator for C3
  // Valentina: rate=12, appliedTo=Cantidad_Productos_Cruzados
  // GT says $120. Engine gives $12.
  // Is there a base_amount multiplier somewhere?

  console.log('\n--- C3 Percentage component deep trace ---');
  // Read the component config from rule set
  const { data: rsFull } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .single();

  const comps = rsFull?.components as Record<string, unknown>;
  const variants = comps?.variants as Array<Record<string, unknown>>;
  if (variants) {
    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      const vComps = v.components as Array<Record<string, unknown>>;
      console.log(`\nVariant ${vi} (${v.variantName}):`);
      for (const c of vComps) {
        console.log(`  ${c.name}: ${JSON.stringify(c, null, 2)}`);
      }
    }
  }

  // 3. Check if committed_data period_id is set or null
  console.log('\n--- committed_data period_id check ---');
  const { data: cdCheck } = await supabase
    .from('committed_data')
    .select('id, data_type, period_id, source_date')
    .eq('tenant_id', TENANT_ID)
    .limit(5);
  console.log('Sample committed_data:');
  for (const r of (cdCheck ?? [])) {
    console.log(`  data_type=${r.data_type}, period_id=${r.period_id}, source_date=${r.source_date}`);
  }

  // 4. Check if the "datos" rows all have the same batch
  console.log('\n--- committed_data batch check ---');
  const { data: batchCheck } = await supabase
    .from('committed_data')
    .select('import_batch_id, data_type')
    .eq('tenant_id', TENANT_ID);
  if (batchCheck) {
    const byBatchType = new Map<string, number>();
    for (const r of batchCheck) {
      const key = `${r.import_batch_id}|${r.data_type}`;
      byBatchType.set(key, (byBatchType.get(key) || 0) + 1);
    }
    for (const [key, count] of Array.from(byBatchType.entries())) {
      console.log(`  ${key}: ${count} rows`);
    }
  }
}

main().catch(console.error);
