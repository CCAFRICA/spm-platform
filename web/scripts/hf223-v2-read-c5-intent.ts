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

function isFleet(s: string | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes('fleet') || lower.includes('utilization') || lower.includes('utilizacion');
}

async function main() {
  for (const rsId of RULE_SET_IDS) {
    const { data, error } = await supabase
      .from('rule_sets')
      .select('id, name, components, created_at')
      .eq('id', rsId)
      .single();

    if (error) {
      console.log(`=== ${rsId} === ERROR: ${error.message}`);
      continue;
    }

    console.log(`=== rule_set ${rsId} (created: ${data.created_at}) ===`);
    const comp = data.components as any;
    const variants = comp?.variants as any[] | undefined;
    if (!Array.isArray(variants)) {
      console.log('Unexpected shape (variants is not an array). top-level keys:', Object.keys(comp ?? {}));
      console.log('');
      continue;
    }

    for (let vi = 0; vi < variants.length; vi++) {
      const variant = variants[vi];
      const variantName = variant.variantName || variant.variantId || `variant_${vi}`;
      const inner = variant.components as any[] | undefined;
      console.log(`--- ${variantName} (variantId=${variant.variantId}) | components length=${Array.isArray(inner) ? inner.length : 'N/A'}`);
      if (!Array.isArray(inner)) continue;
      for (let ci = 0; ci < inner.length; ci++) {
        const c = inner[ci];
        const name = c.name || c.label || c.componentId || `c${ci}`;
        const isC5 = isFleet(name) || isFleet(c.componentId) || isFleet(c.label);
        const marker = isC5 ? '  >>> FLEET' : '';
        console.log(`    [${ci}] ${name}${marker}`);
        if (isC5) {
          console.log('    calculationIntent (verbatim):');
          console.log(JSON.stringify(c.calculationIntent, null, 6));
          console.log('    modifiers (verbatim):');
          console.log(JSON.stringify(c.calculationIntent?.modifiers ?? c.modifiers ?? [], null, 6));
          console.log('    componentType:', c.componentType);
        }
      }
    }
    console.log('');
  }
}

main();
