// HF-221 Phase 2.7 — Convergence binding state for BCL rule set.
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BCL_RULE_SET = '6008fb2c-da17-46a3-ba1e-b0181ca530a1';

  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings, updated_at')
    .eq('id', BCL_RULE_SET)
    .maybeSingle();

  console.log('RULE SET:', JSON.stringify(data, null, 2));
  console.log('ERROR:', JSON.stringify(error, null, 2));
})();
