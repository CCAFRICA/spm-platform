import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: rs } = await sb.from('rule_sets')
    .select('components, input_bindings')
    .eq('id', '05c30b36-09e7-4648-8418-e48c8cc1ff55')
    .single();

  const comps = (rs?.components as any)?.components || rs?.components || [];

  for (const c of comps) {
    console.log(`\n=== ${c.name} (${c.type}) ===`);
    const intent = c.calculationIntent;
    if (intent?.inputs) {
      for (const [key, val] of Object.entries(intent.inputs)) {
        const v = val as any;
        console.log(`  input.${key}: source=${v.source}, field=${v.sourceSpec?.field || v.sourceSpec?.numerator + '/' + v.sourceSpec?.denominator}`);
      }
    }
    if (intent?.input) {
      const v = intent.input as any;
      console.log(`  input: source=${v.source}, field=${v.sourceSpec?.field || v.sourceSpec?.numerator + '/' + v.sourceSpec?.denominator}`);
    }
  }

  console.log('\ninput_bindings:', JSON.stringify(rs?.input_bindings, null, 2));
}

run();
