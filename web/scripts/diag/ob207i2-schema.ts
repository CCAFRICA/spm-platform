import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function probe(t:string, cols:string){ const {error}=await c.from(t).select(cols).limit(1); console.log(`${error?'FAIL':'OK  '} ${t.padEnd(16)} [${cols}] ${error? '-> '+error.message:''}`); }
async function main(){
  await probe('audit_logs','id,tenant_id,profile_id,action,resource_type,resource_id,changes,metadata,created_at');
  await probe('agent_inbox','id,tenant_id,agent_id,type,title,severity,action_url,persona,acted_at,metadata');
  await probe('profiles','id,tenant_id,role,module_access');
  await probe('tenants','id,features,modules_enabled');
  // sample module_access + features shapes
  const { data: p } = await c.from('profiles').select('role, module_access').not('module_access','is',null).limit(2);
  console.log('profiles.module_access sample:', JSON.stringify(p));
  const { data: t } = await c.from('tenants').select('name, features').limit(2);
  console.log('tenants.features sample:', JSON.stringify(t));
}
main();
