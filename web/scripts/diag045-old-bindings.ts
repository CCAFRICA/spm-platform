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
      .from('rule_sets')
      .select('id, name, input_bindings, created_at')
      .eq('id', rsId)
      .single();

    if (error) { console.log(`${rsId}: ERROR`, error.message); continue; }

    console.log(`\n=== ${rsId} (created: ${data.created_at}) ===`);
    console.log('input_bindings:', JSON.stringify(data.input_bindings, null, 2));
  }
}

main();
