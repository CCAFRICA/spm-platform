import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: profs } = await sb.from('profiles').select('email, role, tenant_id').or('tenant_id.eq.5b078b52-55c9-4612-8f86-96038c198bfe,role.in.(platform,vl_admin)');
  for (const p of profs ?? []) console.log(`${p.email} role=${p.role} tenant=${p.tenant_id}`);
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
