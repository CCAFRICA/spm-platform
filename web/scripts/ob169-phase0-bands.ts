/**
 * OB-169 Phase 0B: Dump actual band definitions from rule_set components
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  console.log('=== OB-169 PHASE 0B: BAND DEFINITION DUMP ===\n');

  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!ruleSets?.length) {
    console.error('No active rule set found!');
    return;
  }

  const ruleSet = ruleSets[0];
  console.log(`Rule set: ${ruleSet.name}\n`);

  // Debug: check components structure
  const rawComponents = ruleSet.components;
  console.log(`Components type: ${typeof rawComponents}`);
  console.log(`Components isArray: ${Array.isArray(rawComponents)}`);

  // It might be wrapped in an object
  let components: Array<Record<string, unknown>>;
  if (Array.isArray(rawComponents)) {
    components = rawComponents as unknown as Array<Record<string, unknown>>;
  } else if (typeof rawComponents === 'object' && rawComponents !== null) {
    // Try common wrapper patterns
    const obj = rawComponents as Record<string, unknown>;
    console.log(`Components keys: ${Object.keys(obj).join(', ')}`);
    if (Array.isArray(obj.components)) {
      components = obj.components as Array<Record<string, unknown>>;
    } else {
      // Just dump the whole thing
      console.log(`Full components JSON (first 5000 chars):`);
      console.log(JSON.stringify(rawComponents, null, 2).slice(0, 5000));
      return;
    }
  } else {
    console.error('Unexpected components type');
    return;
  }

  console.log(`Component count: ${components.length}\n`);

  for (const comp of components) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Component: ${comp.name} (${comp.componentType})`);
    console.log(`ID: ${comp.id}`);
    console.log(`${'='.repeat(60)}`);

    // Matrix config
    if (comp.matrixConfig) {
      const mc = comp.matrixConfig as Record<string, unknown>;
      console.log(`\n  [matrixConfig]`);
      console.log(`  rowMetric: ${mc.rowMetric}`);
      console.log(`  columnMetric: ${mc.columnMetric}`);

      const rowBands = mc.rowBands as Array<Record<string, unknown>>;
      console.log(`\n  Row Bands (${rowBands?.length || 0}):`);
      if (rowBands) {
        for (let i = 0; i < rowBands.length; i++) {
          const b = rowBands[i];
          console.log(`    [${i}] label="${b.label}" min=${b.min} max=${b.max}`);
        }
      }

      const colBands = mc.columnBands as Array<Record<string, unknown>>;
      console.log(`\n  Column Bands (${colBands?.length || 0}):`);
      if (colBands) {
        for (let i = 0; i < colBands.length; i++) {
          const b = colBands[i];
          console.log(`    [${i}] label="${b.label}" min=${b.min} max=${b.max}`);
        }
      }

      const values = mc.values as number[][];
      console.log(`\n  Values Grid:`);
      if (values) {
        for (let r = 0; r < values.length; r++) {
          console.log(`    Row ${r}: ${JSON.stringify(values[r])}`);
        }
      }
    }

    // Tier config
    if (comp.tierConfig) {
      const tc = comp.tierConfig as Record<string, unknown>;
      console.log(`\n  [tierConfig]`);
      console.log(`  metric: ${tc.metric}`);
      const tiers = tc.tiers as Array<Record<string, unknown>>;
      if (tiers) {
        console.log(`  Tiers (${tiers.length}):`);
        for (let i = 0; i < tiers.length; i++) {
          const t = tiers[i];
          console.log(`    [${i}] label="${t.label}" min=${t.min} max=${t.max} value=${t.value}`);
        }
      }
    }

    // Calculation intent
    if (comp.calculationIntent) {
      const ci = comp.calculationIntent as Record<string, unknown>;
      console.log(`\n  [calculationIntent]`);
      console.log(`  operation: ${ci.operation}`);

      if (ci.operation === 'bounded_lookup_2d') {
        const rb = ci.rowBoundaries as Array<Record<string, unknown>>;
        console.log(`\n  Intent Row Boundaries (${rb?.length || 0}):`);
        if (rb) {
          for (let i = 0; i < rb.length; i++) {
            const b = rb[i];
            console.log(`    [${i}] min=${b.min} max=${b.max} minInclusive=${b.minInclusive} maxInclusive=${b.maxInclusive}`);
          }
        }

        const cb = ci.columnBoundaries as Array<Record<string, unknown>>;
        console.log(`\n  Intent Column Boundaries (${cb?.length || 0}):`);
        if (cb) {
          for (let i = 0; i < cb.length; i++) {
            const b = cb[i];
            console.log(`    [${i}] min=${b.min} max=${b.max} minInclusive=${b.minInclusive} maxInclusive=${b.maxInclusive}`);
          }
        }

        const og = ci.outputGrid as number[][];
        console.log(`\n  Intent Output Grid:`);
        if (og) {
          for (let r = 0; r < og.length; r++) {
            console.log(`    Row ${r}: ${JSON.stringify(og[r])}`);
          }
        }
      }

      if (ci.operation === 'bounded_lookup_1d') {
        const bounds = ci.boundaries as Array<Record<string, unknown>>;
        console.log(`\n  Intent Boundaries (${bounds?.length || 0}):`);
        if (bounds) {
          for (let i = 0; i < bounds.length; i++) {
            const b = bounds[i];
            console.log(`    [${i}] min=${b.min} max=${b.max} minInclusive=${b.minInclusive} maxInclusive=${b.maxInclusive}`);
          }
        }
        console.log(`  Outputs: ${JSON.stringify(ci.outputs)}`);
      }
    }
  }

  console.log('\n=== END BAND DUMP ===');
}

main().catch(console.error);
