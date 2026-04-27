#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

  const { data: ruleSets, error } = await supabase
    .from('rule_sets')
    .select('id, name, status, created_at, components, input_bindings')
    .eq('tenant_id', BCL_TENANT_ID)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) { console.error('Query failed:', error); process.exit(1); }

  console.log(`Active rule_sets for BCL: ${ruleSets?.length ?? 0}`);
  console.log('---');

  for (const rs of (ruleSets ?? [])) {
    console.log(`Rule set: ${rs.id}`);
    console.log(`Name: ${rs.name}`);
    console.log(`Created: ${rs.created_at}`);

    const variants = (rs.components as { variants?: Array<{ variantId: string; components?: Array<Record<string, unknown>> }> })?.variants ?? [];
    for (const variant of variants) {
      console.log(`\n  Variant: ${variant.variantId}`);
      for (const comp of (variant.components ?? [])) {
        const c = comp as Record<string, unknown>;
        const calcIntent = (c.calculationIntent ?? {}) as Record<string, unknown>;
        const meta = (c.metadata ?? {}) as Record<string, unknown>;
        const intent = (meta.intent ?? {}) as Record<string, unknown>;
        console.log(`    Component: ${c.id} (${c.name})`);
        console.log(`      componentType: ${JSON.stringify(c.componentType)}`);
        console.log(`      tierConfig: ${JSON.stringify(c.tierConfig)}`);
        console.log(`      matrixConfig: ${JSON.stringify(c.matrixConfig)}`);
        console.log(`      calculationIntent.operation: ${JSON.stringify(calcIntent.operation)}`);
        console.log(`      metadata.intent keys: ${Object.keys(intent).join(',')}`);
        console.log(`      metadata.intent: ${JSON.stringify(intent)}`);
      }
    }
    console.log('---');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
