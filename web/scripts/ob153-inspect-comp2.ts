import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: rs } = await sb.from('rule_sets')
    .select('components')
    .eq('id', '05c30b36-09e7-4648-8418-e48c8cc1ff55')
    .single();

  const comps = rs?.components as any;
  const components = Array.isArray(comps) ? comps : comps?.components || [];

  // Show first component in full
  console.log('First component (full):');
  console.log(JSON.stringify(components[0], null, 2));

  // Show second component in full
  console.log('\n\nSecond component (full):');
  console.log(JSON.stringify(components[1], null, 2));
}

run();
