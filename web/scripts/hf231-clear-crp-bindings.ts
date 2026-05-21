// HF-231 Phase 4A: clear input_bindings for the CRP tenant.
// Forces convergence to re-derive against the new unified pipeline output.
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await sb
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('tenant_id', TENANT_ID)
    .select('id, name, status');

  if (error) {
    console.error('Error clearing input_bindings:', error);
    process.exit(1);
  }

  console.log(`Cleared input_bindings on ${data?.length ?? 0} rule_sets for tenant ${TENANT_ID}:`);
  for (const rs of data ?? []) {
    console.log(`  ${rs.id}  [${rs.status}]  ${rs.name}`);
  }
}

main();
