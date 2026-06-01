import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const oldRsId = '9ac467ba-bab4-4680-9453-5cb3deae02c6';
  const newRsId = '6c98f209-6643-4242-96f5-174bdd034fa4';

  for (const rsId of [oldRsId, newRsId]) {
    const { data, error } = await supabase
      .from('classification_signals')
      .select('id, signal_type, signal_value, created_at')
      .eq('rule_set_id', rsId)
      .order('created_at', { ascending: true });

    if (error) { console.log(`${rsId}: ERROR`, error.message); continue; }

    console.log(`\n=== Signals for ${rsId} ===`);
    console.log(`Total: ${data.length}`);

    for (const s of data) {
      console.log('---');
      console.log(`signal_type: ${s.signal_type}`);
      console.log(`signal_value: ${JSON.stringify(s.signal_value, null, 2)}`);
    }
  }
}

main();
