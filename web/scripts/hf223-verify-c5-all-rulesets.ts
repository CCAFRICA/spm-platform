import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RULE_SET_IDS = [
  'cca32ebb-c1a4-416e-8d3e-6eedea506cd2',
  '6c98f209-6643-4242-96f5-174bdd034fa4',
  '9ac467ba-bab4-4680-9453-5cb3deae02c6',
];

async function main() {
  for (const rsId of RULE_SET_IDS) {
    const { data, error } = await supabase
      .from('rule_sets')
      .select('id, name, components, created_at')
      .eq('id', rsId)
      .single();

    if (error) {
      console.log(`=== ${rsId} === ERROR:`, error.message);
      continue;
    }

    const components = data.components as any[];
    const c4 = components[4];
    const name = c4?.name || c4?.label || 'component_4';

    console.log(`=== ${rsId} (created: ${data.created_at}) ===`);
    console.log(`Component 4: ${name}`);
    console.log('calculationIntent:', JSON.stringify(c4?.calculationIntent, null, 2));
    console.log('');
  }
}

main();
