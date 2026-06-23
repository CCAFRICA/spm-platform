import { createClient } from '@supabase/supabase-js';
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111', MIR='972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const ia=await sb.from('intelligence_artifacts').select('*',{count:'exact',head:true});
  console.log('§A intelligence_artifacts:', ia.error?`MISSING — ${ia.error.message}`:`EXISTS (rows: ${ia.count})`);
  const rpc=await sb.rpc('compute_summary_artifacts',{p_tenant_id:BCL});
  console.log('OB-229 RPC compute_summary_artifacts:', rpc.error?`NOT APPLIED — ${rpc.error.message}`:`APPLIED (result: ${JSON.stringify(rpc.data)})`);
  // HALT-1: BCL entity join key
  const {data:btx}=await sb.from('committed_data').select('row_data').eq('tenant_id',BCL).eq('data_type','transaction').limit(1);
  console.log('\nHALT-1 BCL transaction row_data keys:', btx?.[0]?Object.keys(btx[0].row_data):'none', '| ID_Empleado=', (btx?.[0]?.row_data as any)?.ID_Empleado);
  const {data:bent}=await sb.from('entities').select('id,display_name,external_id,entity_type,metadata').eq('tenant_id',BCL).limit(3);
  console.log('BCL entities sample:'); (bent??[]).forEach((e:any)=>console.log('  ', e.entity_type, '| ext_id=', e.external_id, '| name=', e.display_name, '| metadata.ID_Empleado=', e.metadata?.ID_Empleado));
  // also entity rows in committed_data?
  const bentCd=await sb.from('committed_data').select('*',{count:'exact',head:true}).eq('tenant_id',BCL).eq('data_type','entity');
  console.log('BCL committed_data data_type=entity count:', bentCd.count);
  // does external_id match ID_Empleado?
  const empId=(btx?.[0]?.row_data as any)?.ID_Empleado;
  if(empId){const {data:m}=await sb.from('entities').select('id,external_id').eq('tenant_id',BCL).eq('external_id',empId).limit(1); console.log(`JOIN TEST: entity with external_id='${empId}':`, m?.[0]?'MATCH '+m[0].id:'NO MATCH');}
  // MIR
  const {data:mtx}=await sb.from('committed_data').select('row_data').eq('tenant_id',MIR).eq('data_type','transaction').limit(1);
  console.log('\nMIR transaction row_data keys:', mtx?.[0]?Object.keys(mtx[0].row_data).slice(0,12):'none');
  // classification_signals current
  const cs=await sb.from('classification_signals').select('*',{count:'exact',head:true});
  console.log('\nclassification_signals total rows:', cs.count);
  const bcl_sa=await sb.from('summary_artifacts').select('*',{count:'exact',head:true}).eq('tenant_id',BCL);
  console.log('BCL summary_artifacts current:', bcl_sa.count);
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
