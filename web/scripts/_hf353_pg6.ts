import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const T = { BCL:'b1c2d3e4-aaaa-bbbb-cccc-111111111111', Meridian:'5035b1e8-0754-4527-b7ec-9f93f85e4c79' };
(async () => {
  for (const [n,t] of Object.entries(T)) {
    const { data } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', t);
    const tot = (data??[]).reduce((s,r)=>s+Number(r.total_payout),0);
    // confirm no component_ref binding (P-C engine inert)
    const { data: rs } = await sb.from('rule_sets').select('input_bindings').eq('tenant_id', t);
    let crefs = 0;
    for (const r of rs ?? []) { const cb = (r.input_bindings as any)?.convergence_bindings ?? {}; for (const roleMap of Object.values(cb)) for (const e of Object.values(roleMap as any)) if (typeof (e as any)?.component_ref === 'number') crefs++; }
    console.log(`  ${n}: $${tot.toFixed(2)} ${(n==='BCL'&&tot===312033)||(n==='Meridian'&&tot===556985)?'✓ = anchor':''} | component_ref bindings=${crefs} ${crefs===0?'(P-C engine INERT ✓)':''}`);
  }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
