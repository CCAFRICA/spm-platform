import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: rs } = await sb.from('rule_sets')
    .select('components')
    .eq('id', '05c30b36-09e7-4648-8418-e48c8cc1ff55')
    .single();

  const comps = rs?.components as any;
  const components = Array.isArray(comps) ? comps : comps?.components || comps?.variants?.[0]?.components || [];

  for (const c of components) {
    console.log(`\n${c.name}:`);
    console.log('  type:', c.type);
    console.log('  metric:', c.metric);
    if (c.tiers) console.log('  tiers:', JSON.stringify(c.tiers).slice(0, 200));
    if (c.matrix) console.log('  matrix:', JSON.stringify(c.matrix).slice(0, 200));
    if (c.formula) console.log('  formula:', c.formula);
    // Show all keys
    const keys = Object.keys(c).filter(k => !['name', 'type', 'metric', 'tiers', 'matrix', 'formula'].includes(k));
    if (keys.length > 0) console.log('  other keys:', keys.join(', '));
  }
}

run();
