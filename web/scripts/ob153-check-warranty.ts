import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: rs } = await sb.from('rule_sets')
    .select('components')
    .eq('id', '05c30b36-09e7-4648-8418-e48c8cc1ff55')
    .single();

  const comps = (rs?.components as any)?.components || rs?.components || [];
  // Find Extended Warranty and Insurance components
  for (const c of comps) {
    if (c.name.includes('Warranty') || c.name.includes('Insurance')) {
      console.log(`\n=== ${c.name} ===`);
      console.log(JSON.stringify(c.calculationIntent, null, 2));
    }
  }
}

run();
