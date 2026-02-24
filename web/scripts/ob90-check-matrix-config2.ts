import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data } = await sb.from('rule_sets')
    .select('components, metadata')
    .eq('id', '180d1ecb-56c3-410d-87ba-892150010505')
    .single();

  if (!data) { console.log('Not found'); return; }

  // Raw inspection
  console.log('components type:', typeof data.components);
  console.log('components isArray:', Array.isArray(data.components));

  if (data.components && typeof data.components === 'object') {
    const comp = data.components as Record<string, unknown>;
    console.log('components keys:', Object.keys(comp).join(', '));

    // Check if it's an object with variants
    if (comp.variants) {
      const variants = comp.variants as unknown[];
      console.log('variants count:', Array.isArray(variants) ? variants.length : 'not array');
      for (let vi = 0; vi < (variants as unknown[]).length; vi++) {
        const v = (variants as Record<string, unknown>[])[vi];
        console.log(`\nVariant ${vi}: ${v.variantName || v.name || v.description}`);
        if (Array.isArray(v.components)) {
          for (let ci = 0; ci < v.components.length; ci++) {
            const c = v.components[ci] as Record<string, unknown>;
            console.log(`  Component ${ci}: ${c.name} (${c.type || c.componentType})`);
            if (c.matrixConfig) {
              const mc = c.matrixConfig as Record<string, unknown>;
              console.log(`    rowMetric: ${mc.rowMetric}`);
              console.log(`    columnMetric: ${mc.columnMetric}`);
              console.log(`    columnMetricSource: ${mc.columnMetricSource}`);
              if (mc.values) {
                const vals = mc.values as number[][];
                console.log(`    Matrix ${vals.length}x${vals[0]?.length}:`);
                for (const row of vals) console.log(`      ${JSON.stringify(row)}`);
              }
            }
            if (c.tierConfig) {
              const tc = c.tierConfig as Record<string, unknown>;
              console.log(`    metric: ${tc.metric}`);
            }
            if (c.percentageConfig) {
              const pc = c.percentageConfig as Record<string, unknown>;
              console.log(`    appliedTo: ${pc.appliedTo}`);
            }
            if (c.conditionalConfig) {
              const cc = c.conditionalConfig as Record<string, unknown>;
              console.log(`    appliedTo: ${cc.appliedTo}`);
            }
          }
        }
      }
    }
  }

  // Also check metadata
  if (data.metadata) {
    console.log('\nMetadata:', JSON.stringify(data.metadata).slice(0, 500));
  }
}

main().catch(console.error);
