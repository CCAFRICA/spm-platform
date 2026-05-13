// HF-222 Phase 3.1 — read current convergence_bindings shape from rule_sets.input_bindings.
// Architect SQL gate: paste output verbatim to completion report; architect verifies
// the schema separation (source_batch_id → learning_provenance.{batch_id, learned_at})
// is structurally compatible before Phase 3.2 onward.

import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, name, tenant_id, input_bindings')
    .not('input_bindings', 'is', null)
    .limit(5);

  if (error) {
    console.error('Query error:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
