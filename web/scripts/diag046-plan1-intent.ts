import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  const { data: ruleSets, error } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error); return; }

  // Find Capital Equipment plan
  const plan1 = ruleSets?.find(rs => rs.name?.toLowerCase().includes('capital equipment'));
  if (!plan1) { console.log('Capital Equipment plan not found'); return; }

  console.log('=== PLAN 1: Capital Equipment ===');
  console.log('rule_set_id:', plan1.id);
  console.log('name:', plan1.name);
  console.log('created_at:', plan1.created_at);

  // Inspect components shape
  const comp = plan1.components as Record<string, unknown> | null;
  console.log('\n=== COMPONENTS SHAPE ===');
  console.log('typeof:', typeof comp);
  console.log('isArray:', Array.isArray(comp));
  if (typeof comp === 'object' && comp !== null) {
    console.log('top-level keys:', Object.keys(comp));
  }

  // Navigate to variants and components
  const variants = (comp as { variants?: unknown[] })?.variants ?? [comp];
  if (Array.isArray(variants)) {
    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi] as Record<string, unknown>;
      const vName = (v.variantName as string) || (v.name as string) || `variant_${vi}`;
      console.log(`\n=== Variant ${vi}: ${vName} ===`);

      const components = (v.components as unknown[]) || [];
      for (let ci = 0; ci < components.length; ci++) {
        const c = components[ci] as Record<string, unknown>;
        const cName = (c.name as string) || (c.label as string) || `component_${ci}`;
        console.log(`\n  Component ${ci}: ${cName}`);
        console.log('  calculationIntent:', JSON.stringify(c.calculationIntent, null, 2));
        const meta = c.metadata as Record<string, unknown> | undefined;
        console.log('  metadata.calcMethod:', JSON.stringify(meta?.calcMethod, null, 2));
      }
    }
  }

  // Input bindings
  console.log('\n=== INPUT BINDINGS ===');
  console.log(JSON.stringify(plan1.input_bindings, null, 2));
}

main();
