import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main(){
  for (const [t,cols] of [['agent_inbox','id,tenant_id,agent_id,type,title,severity,action_url,persona,acted_at,metadata'],['audit_logs','id,tenant_id,action,resource_type,resource_id,changes,actor_id,created_at']] as [string,string][]){
    const { error } = await c.from(t).select(cols).limit(1);
    console.log(`${error?'FAIL':'OK  '} ${t.padEnd(14)} ${error? error.message : 'cols exist'}`);
  }
}
main();
