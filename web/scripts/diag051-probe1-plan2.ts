// DIAG-051 Probe 1B + 1C: dump CRP Plan 2 input_bindings + convergence_bindings.
import { createClient } from '@supabase/supabase-js';

const TENANT = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  const { data, error } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', TENANT)
    .eq('name', 'Consumables Commission Plan')
    .single();

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('=== Probe 1B: Plan 2 row id + name ===');
  console.log('id:', data?.id);
  console.log('name:', data?.name);

  console.log('\n=== Probe 1B: input_bindings (full) ===');
  console.log(JSON.stringify(data?.input_bindings, null, 2));

  console.log('\n=== Probe 1C: convergence_bindings (extracted from input_bindings) ===');
  const ib = data?.input_bindings as Record<string, unknown> | null;
  console.log(JSON.stringify(ib?.convergence_bindings, null, 2));

  console.log('\n=== Probe 1C: metric_derivations (extracted from input_bindings) ===');
  console.log(JSON.stringify(ib?.metric_derivations, null, 2));

  // Confirm no top-level convergence_bindings column on the table
  const { data: probe } = await sb
    .from('rule_sets')
    .select('*')
    .eq('id', data?.id)
    .single();
  const keys = probe ? Object.keys(probe) : [];
  console.log('\n=== rule_sets columns ===');
  console.log(keys.join(', '));
})();
