import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
(async () => {
  // Jerarquia sample rows (the __EMPTY columns + Aristas pointer)
  const { data: jer } = await sb.from('committed_data').select('row_data, entity_id').eq('tenant_id', R).eq('data_type', 'entity').limit(80);
  const jrows = (jer ?? []).filter(r => /Jerarquia|Aristas/.test(JSON.stringify(r.row_data)));
  console.log('=== Jerarquia sample rows (3) ===');
  for (const r of jrows.slice(0, 3)) console.log('  ', JSON.stringify(r.row_data), 'entity_id=', r.entity_id);
  // Personal sample (the entity id + name)
  const prows = (jer ?? []).filter(r => /Personal|Plantilla/.test(JSON.stringify(r.row_data)));
  console.log('\n=== Personal sample rows (2) ===');
  for (const r of prows.slice(0, 2)) console.log('  ', JSON.stringify(r.row_data).slice(0,200), 'entity_id=', r.entity_id);

  // Minimo Garantizado component intent + the cascade component
  const { data: rs } = await sb.from('rule_sets').select('components').eq('tenant_id', R).limit(1);
  const variants = (rs?.[0]?.components as any)?.variants ?? [];
  const vend = variants.find((v:any)=>v.variantId==='vendedor');
  console.log('\n=== vendedor variant components (intents) ===');
  for (const c of vend?.components ?? []) {
    console.log(`\n  --- ${c.name} (id=${c.id}, type=${c.componentType}) ---`);
    console.log('   metadata keys:', Object.keys(c.metadata ?? {}));
    const intent = c.metadata?.intent ?? c.calculationIntent;
    console.log('   intent:', JSON.stringify(intent)?.slice(0, 400));
    if (c.metadata?.distribution) console.log('   distribution:', JSON.stringify(c.metadata.distribution)?.slice(0,300));
  }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
