/**
 * OB-90: Check the ACTUAL matrix config in the DB rule_set
 * What are the columnMetric and rowMetric names?
 */
import { createClient } from '@supabase/supabase-js';

const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: ruleSet } = await sb.from('rule_sets')
    .select('*')
    .eq('id', RULE_SET_ID)
    .single();

  if (!ruleSet) {
    console.log('Rule set not found!');
    return;
  }

  console.log('=== Rule Set Structure ===');
  console.log('Keys:', Object.keys(ruleSet).join(', '));

  // Check if components are in ruleSet.components or ruleSet.config.components
  let components: unknown[] | null = null;
  if (Array.isArray(ruleSet.components)) {
    components = ruleSet.components;
    console.log(`components is a direct array of ${components.length} items`);
  }

  // Also check ruleSet.config
  const config = ruleSet.config as Record<string, unknown> | null;
  if (config) {
    console.log('config keys:', Object.keys(config).join(', '));
    if (Array.isArray(config.components)) {
      console.log(`config.components is an array of ${config.components.length} items`);
      if (!components) components = config.components;
    }
    if (Array.isArray(config.variants)) {
      console.log(`config.variants is an array of ${config.variants.length} items`);
      for (let vi = 0; vi < config.variants.length; vi++) {
        const variant = config.variants[vi] as Record<string, unknown>;
        console.log(`\n  Variant ${vi}: ${variant.variantName || variant.description}`);
        if (Array.isArray(variant.components)) {
          components = variant.components;
          console.log(`  Has ${variant.components.length} components`);
        }
      }
    }
  }

  if (!components) {
    console.log('NO components found!');
    return;
  }

  // Print each component's metric config
  for (let i = 0; i < components.length; i++) {
    const comp = components[i] as Record<string, unknown>;
    console.log(`\n=== Component ${i}: ${comp.name} (${comp.type || comp.componentType}) ===`);

    // Matrix config
    if (comp.matrixConfig) {
      const mc = comp.matrixConfig as Record<string, unknown>;
      console.log('  matrixConfig:');
      console.log(`    rowMetric: ${mc.rowMetric}`);
      console.log(`    columnMetric: ${mc.columnMetric}`);
      console.log(`    columnMetricSource: ${mc.columnMetricSource}`);
      console.log(`    columnMetricLabel: ${mc.columnMetricLabel}`);
      console.log(`    rowMetricLabel: ${mc.rowMetricLabel}`);
      if (mc.columnBands) console.log(`    columnBands: ${JSON.stringify(mc.columnBands)}`);
      if (mc.rowBands) console.log(`    rowBands: ${JSON.stringify(mc.rowBands)}`);
      if (mc.values) {
        const vals = mc.values as number[][];
        console.log(`    values (${vals.length}x${vals[0]?.length}):`);
        for (let r = 0; r < vals.length; r++) {
          console.log(`      Row ${r}: ${JSON.stringify(vals[r])}`);
        }
      }
    }

    // Tier config
    if (comp.tierConfig) {
      const tc = comp.tierConfig as Record<string, unknown>;
      console.log('  tierConfig:');
      console.log(`    metric: ${tc.metric}`);
    }

    // Other configs
    if (comp.percentageConfig) {
      const pc = comp.percentageConfig as Record<string, unknown>;
      console.log('  percentageConfig:');
      console.log(`    appliedTo: ${pc.appliedTo}`);
    }
    if (comp.conditionalConfig) {
      const cc = comp.conditionalConfig as Record<string, unknown>;
      console.log('  conditionalConfig:');
      console.log(`    appliedTo: ${cc.appliedTo}`);
    }
  }
}

main().catch(console.error);
