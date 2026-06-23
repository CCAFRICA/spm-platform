import { createClient } from '@supabase/supabase-js';
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111', SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const {data:bcl}=await sb.from('rule_sets').select('id,name,status,input_bindings').eq('tenant_id',BCL);
  console.log('=== BCL rule_sets ==='); (bcl??[]).forEach((r:any)=>{const cb=r.input_bindings?.convergence_bindings; console.log(`  ${r.name} [${r.status}] convergence_bindings keys:`, cb?Object.keys(cb):'(none)');});
  // sample one BCL component binding structure
  const bclRich=(bcl??[]).find((r:any)=>r.input_bindings?.convergence_bindings);
  if(bclRich){const cb=bclRich.input_bindings.convergence_bindings; const comp0=cb[Object.keys(cb)[0]]; console.log('\n  BCL sample component ('+Object.keys(cb)[0]+'):'); console.log('   ', JSON.stringify(comp0).slice(0,600));}
  const {data:sab}=await sb.from('rule_sets').select('id,name,status,input_bindings').eq('tenant_id',SABOR);
  console.log('\n=== SABOR rule_sets ==='); (sab??[]).forEach((r:any)=>console.log(`  ${r.name} [${r.status}] input_bindings:`, JSON.stringify(r.input_bindings).slice(0,80)));
  // Sabor pos field sample
  const {data:s1}=await sb.from('committed_data').select('row_data').eq('tenant_id',SABOR).eq('data_type','pos_cheque').limit(1);
  console.log('\nSabor pos_cheque field sample:', s1?.[0]?JSON.stringify(s1[0].row_data):'none');
  // current Sabor summary_artifacts metric keys
  const {data:sa}=await sb.from('summary_artifacts').select('metrics').eq('tenant_id',SABOR).limit(1);
  console.log('Sabor summary_artifacts metric keys NOW:', sa?.[0]?Object.keys(sa[0].metrics):'none');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
