// OB-257 PG-1 pre-state probe (read-only): BCL entitlement + rollup/binding absence
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function main() {
  const { data: t } = await sb.from('tenants').select('id, name, features').eq('id', BCL).single();
  console.log('BCL tenants.features:', JSON.stringify(t?.features));
  console.log('revenue_enabled key present:', Object.prototype.hasOwnProperty.call(t?.features ?? {}, 'revenue_enabled'));
  const { error: srErr, count } = await sb.from('summary_rollups').select('id', { count: 'exact', head: true }).eq('tenant_id', BCL);
  console.log('summary_rollups state:', srErr ? `table absent/unreadable -> ${srErr.message}` : `exists, BCL rows=${count}`);
  const { data: b } = await sb.from('surface_bindings').select('surface_id').eq('tenant_id', BCL).like('surface_id', 'revenue.%');
  console.log('BCL revenue.* surface_bindings rows:', b?.length ?? 0);
  const { count: ri } = await sb.from('intelligence_artifacts').select('id', { count: 'exact', head: true }).eq('tenant_id', BCL).eq('source', 'revenue-insight');
  console.log('BCL revenue-insight artifacts:', ri);
}
main().catch(e => { console.error(e); process.exit(1); });
