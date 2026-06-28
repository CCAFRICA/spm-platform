import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
function refFields(node: any, out: Set<string>) { if (!node || typeof node !== 'object') return; if (node.prime === 'reference' && node.field) out.add(node.field); for (const k of Object.keys(node)) if (typeof node[k]==='object') refFields(node[k], out); }
(async () => {
  const { data: rs } = await sb.from('rule_sets').select('components').eq('tenant_id', R).limit(1);
  const vend = ((rs?.[0]?.components as any)?.variants ?? []).find((v:any)=>v.variantId==='vendedor');
  for (const c of vend?.components ?? []) {
    const refs = new Set<string>(); refFields(c.metadata?.intent ?? c.calculationIntent, refs);
    console.log(`[${c.id}] "${c.name}"`);
    console.log(`   expectedMetrics: ${JSON.stringify(c.expectedMetrics ?? c.metadata?.expectedMetrics ?? 'none')}`);
    console.log(`   output/result keys: ${Object.keys(c).filter(k=>/output|result|produces|emit/i.test(k)).join(',')||'none'}`);
    console.log(`   metadata keys: ${Object.keys(c.metadata??{}).join(',')}`);
    console.log(`   reference fields in intent: [${Array.from(refs).join(', ')}]`);
  }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
