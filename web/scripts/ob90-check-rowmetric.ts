/**
 * OB-90: Check what rowMetric and columnMetric are for the optical component
 */
import { createClient } from '@supabase/supabase-js';

const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data } = await sb.from('rule_sets')
    .select('components')
    .eq('id', RULE_SET_ID)
    .single();

  if (!data) { console.log('NOT FOUND'); return; }

  const variants = (data.components as Record<string, unknown>)?.variants as Array<Record<string, unknown>> || [];
  for (const variant of variants) {
    console.log(`\nVariant: ${variant.variantName}`);
    const comps = variant.components as Array<Record<string, unknown>> || [];
    for (const comp of comps) {
      if (comp.matrixConfig) {
        const mc = comp.matrixConfig as Record<string, unknown>;
        console.log(`  ${comp.name}:`);
        console.log(`    rowMetric: ${mc.rowMetric}`);
        console.log(`    columnMetric: ${mc.columnMetric}`);
        console.log(`    rowBands: ${JSON.stringify(mc.rowBands)}`);
        console.log(`    columnBands: ${JSON.stringify(mc.columnBands)}`);
      }
    }
  }
}

main().catch(console.error);
