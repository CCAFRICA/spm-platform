import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, status, input_bindings, components')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('name');

  for (const rs of (ruleSets || [])) {
    console.log(`\n=== ${rs.name} (${rs.id}) ===`);
    console.log('input_bindings:', JSON.stringify(rs.input_bindings));
    
    const comp = rs.components as any;
    if (!comp?.variants?.[0]?.components) {
      console.log('  NO COMPONENTS');
      continue;
    }
    for (const c of comp.variants[0].components) {
      console.log(`\n  Component: ${c.name} (${c.componentType})`);
      if (c.tierConfig) {
        console.log(`    tierConfig.metric: ${c.tierConfig.metric}`);
        console.log(`    tierConfig.tiers: ${(c.tierConfig.tiers || []).length} tiers`);
        if (c.tierConfig.tiers?.length > 0) {
          console.log(`    First tier value: ${c.tierConfig.tiers[0].value}`);
          console.log(`    All tier values: [${c.tierConfig.tiers.map((t: any) => t.value).join(', ')}]`);
        }
      }
      if (c.percentageConfig) {
        console.log(`    percentageConfig.appliedTo: ${c.percentageConfig.appliedTo}`);
        console.log(`    percentageConfig.rate: ${c.percentageConfig.rate}`);
      }
      if (c.calculationIntent) {
        console.log(`    calculationIntent.operation: ${c.calculationIntent.operation}`);
        if (c.calculationIntent.rate) console.log(`    calculationIntent.rate: ${c.calculationIntent.rate}`);
        if (c.calculationIntent.isMarginal) console.log(`    calculationIntent.isMarginal: ${c.calculationIntent.isMarginal}`);
      }
    }
  }
}
main();
