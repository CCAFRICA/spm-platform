// OB-257 SQL Verification Gate (FP-49): verify FK targets live + summary_rollups absent (read-only)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  for (const t of ['tenants', 'periods', 'entities']) {
    const { data, error } = await sb.from(t).select('id').limit(1);
    console.log(`${t}: ${error ? 'ERROR ' + error.message : 'exists, id column ok (' + (data?.length ?? 0) + ' probe row)'}`);
  }
  const { error: srErr } = await sb.from('summary_rollups').select('id').limit(1);
  console.log(`summary_rollups: ${srErr ? 'ABSENT as expected -> ' + srErr.message : 'ALREADY EXISTS (halt: do not re-create)'}`);
  const { data: prof, error: pErr } = await sb.from('profiles').select('auth_user_id, tenant_id, role').limit(1);
  console.log(`profiles (RLS policy deps auth_user_id/tenant_id/role): ${pErr ? 'ERROR ' + pErr.message : 'ok keys=' + Object.keys(prof?.[0] ?? {}).join(',')}`);
}
main().catch(e => { console.error(e); process.exit(1); });
