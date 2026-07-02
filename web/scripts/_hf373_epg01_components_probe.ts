// HF-373 EPG-0.1 read-only probe: VLTEST2 plan components verbatim structure
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: rows } = await sb.from('rule_sets').select('id, name, components').eq('tenant_id', VLTEST2);
  const r: any = rows![0];
  const comps = r.components;
  const variants = comps.variants as any[];
  console.log('variants:', variants.length);
  for (const v of variants) {
    console.log('\n== variantId:', v.variantId, '| keys:', Object.keys(v).join(','), '| components:', (v.components ?? []).length);
    for (const c of (v.components ?? []) as any[]) {
      console.log('  - component keys:', Object.keys(c).join(','));
      console.log('    name:', c.name, '| componentType:', c.componentType, '| enabled:', c.enabled);
      const ci = c.calculationIntent;
      console.log('    calculationIntent typeof:', typeof ci, ci ? '| top keys: ' + Object.keys(ci).join(',') : '');
      if (c.calculationMethod) console.log('    calculationMethod:', JSON.stringify(c.calculationMethod).slice(0, 300));
      if (c.tierConfig) console.log('    tierConfig:', JSON.stringify(c.tierConfig).slice(0, 300));
      if (c.metadata) console.log('    metadata keys:', Object.keys(c.metadata).join(','));
    }
  }
  // Dump FIRST component fully verbatim
  console.log('\n=== FIRST COMPONENT VERBATIM ===');
  console.log(JSON.stringify(variants[0].components[0], null, 1).slice(0, 6000));
}
main();
