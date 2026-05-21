// HF-221 Phase 0.2 — classification_signals column shape via service-role client.
//
// VP discipline: no DATABASE_URL; service-role client + PostgREST only. Full
// column type metadata (pg_attribute / information_schema.columns) requires
// architect-channel SQL Editor. Sample-row column-name discovery is sufficient
// for HF-221 scope.
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: sample, error: sampleErr } = await supabase
    .from('classification_signals')
    .select('*')
    .limit(1);

  console.log('SAMPLE ROW (column shape via PostgREST):');
  console.log(JSON.stringify(sample, null, 2));
  console.log('SAMPLE ERROR:', JSON.stringify(sampleErr, null, 2));

  const { count, error: countErr } = await supabase
    .from('classification_signals')
    .select('*', { count: 'exact', head: true });

  console.log('ROW COUNT:', count);
  console.log('COUNT ERROR:', JSON.stringify(countErr, null, 2));
})();
