import { createClient } from '@supabase/supabase-js';
const SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const sel=await sb.from('intelligence_artifacts').select('id',{count:'exact',head:true});
  console.log('SELECT:', sel.error?`ERR ${sel.error.message}`:`ok (count ${sel.count})`);
  const ins=await sb.from('intelligence_artifacts').insert({tenant_id:SABOR,artifact_type:'trend',severity:'info',title:'probe',narrative:'probe',data_references:[],insight_shape:{}}).select('id');
  console.log('INSERT:', ins.error?`ERR ${ins.error.message}`:`ok id=${ins.data?.[0]?.id}`);
  if(!ins.error && ins.data?.[0]?.id) { await sb.from('intelligence_artifacts').delete().eq('id',ins.data[0].id); console.log('(probe row cleaned)'); }
})().then(()=>process.exit(0));
