import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  const { data: ruleSets, error } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error); return; }

  for (const rs of ruleSets || []) {
    console.log(`\n=== ${rs.name} (${rs.id}, created: ${rs.created_at}) ===`);

    const bindings = rs.input_bindings as Record<string, unknown> | null;
    if (!bindings) { console.log('  No input_bindings'); continue; }

    const cb = bindings.convergence_bindings;
    if (cb) {
      console.log('  convergence_bindings:', JSON.stringify(cb, null, 2));
    }

    const md = bindings.metric_derivations;
    if (md) {
      console.log('  metric_derivations:', JSON.stringify(md, null, 2));
    }

    const bindingsStr = JSON.stringify(bindings);
    if (bindingsStr.includes('filter') || bindingsStr.includes('product_category') || bindingsStr.includes('Capital Equipment')) {
      console.log('  CONTAINS FILTER REFERENCE: yes');
    } else {
      console.log('  CONTAINS FILTER REFERENCE: no');
    }
  }
}

main();
