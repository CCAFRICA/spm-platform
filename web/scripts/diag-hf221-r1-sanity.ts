// HF-221 Phase 1.4 — sanity insert post-architect-apply.
// Confirms 'engine:structural_exception' (HF-218 vocabulary, outside the prior
// five-namespace enumeration) inserts successfully post-constraint-drop.
// Cleans up after itself (deletes the inserted row).
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

  const { data, error } = await supabase
    .from('classification_signals')
    .insert({
      tenant_id: BCL_TENANT,
      signal_type: 'engine:structural_exception',
      source_file_name: 'HF-221-sanity-test',
      sheet_name: 'sanity',
      classification: 'test',
      confidence: 1.0,
      decision_source: 'hf221_sanity_test',
    })
    .select('id')
    .single();

  console.log('INSERT RESULT:', JSON.stringify({ data, error }, null, 2));

  if (data?.id) {
    const { error: delError } = await supabase
      .from('classification_signals')
      .delete()
      .eq('id', data.id);
    console.log('ROLLBACK:', delError ? JSON.stringify(delError, null, 2) : 'success');
  }
})();
