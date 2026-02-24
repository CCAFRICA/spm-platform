import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data } = await sb.from('rule_sets').select('components').eq('id', '180d1ecb-56c3-410d-87ba-892150010505').single();
  if (!data) throw new Error('not found');
  const variants = (data.components as Record<string, unknown>).variants as Array<Record<string, unknown>>;
  for (const v of variants) {
    const comps = v.components as Array<Record<string, unknown>>;
    console.log(`Variant: ${v.variantId} — ${comps.length} components`);
    for (const c of comps) {
      const type = c.componentType || (c.matrixConfig ? 'matrix' : c.tierConfig ? 'tier' : c.percentageConfig ? 'percentage' : c.conditionalConfig ? 'conditional_percentage' : 'unknown');
      console.log(`  ${c.name} | ${type} | enabled: ${c.enabled}`);
      if (c.matrixConfig) {
        const mc = c.matrixConfig as Record<string, unknown>;
        console.log(`    rowMetric: ${mc.rowMetric} | colMetric: ${mc.columnMetric}`);
      }
      if (c.tierConfig) {
        const tc = c.tierConfig as Record<string, unknown>;
        const tiers = tc.tiers as Array<Record<string, unknown>>;
        console.log(`    metric: ${tc.metric} | tiers: ${tiers?.length}`);
        for (const t of tiers || []) console.log(`      [${t.min}-${t.max}] = $${t.value} (${t.label})`);
      }
      if (c.percentageConfig) {
        const pc = c.percentageConfig as Record<string, unknown>;
        console.log(`    appliedTo: ${pc.appliedTo} | rate: ${pc.rate}`);
      }
      if (c.conditionalConfig) {
        const cc = c.conditionalConfig as Record<string, unknown>;
        const conds = cc.conditions as Array<Record<string, unknown>>;
        console.log(`    appliedTo: ${cc.appliedTo} | conditions: ${conds?.length}`);
        for (const cond of conds || []) console.log(`      ${cond.metric} [${cond.min}-${cond.max}] rate: ${cond.rate}`);
      }
    }
  }
}
main().catch(console.error);
