import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  for (const [n, t] of [['BCL','b1c2d3e4-aaaa-bbbb-cccc-111111111111'],['Meridian','5035b1e8-0754-4527-b7ec-9f93f85e4c79']] as const) {
    const { data } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', t);
    const tot = (data ?? []).reduce((s, r) => s + Number(r.total_payout), 0);
    console.log(`  ${n}: $${tot.toFixed(2)}  ${(n==='BCL'&&tot===312033)||(n==='Meridian'&&tot===556985)?'✓ = anchor (unchanged)':'?'}`);
  }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
