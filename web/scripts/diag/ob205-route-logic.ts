import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANTS = { Meridian:'5035b1e8-0754-4527-b7ec-9f93f85e4c79', BCL:'b1c2d3e4-aaaa-bbbb-cccc-111111111111' };
async function build(tenantId:string){
  const sb:any = c;
  const tbl = (t:string)=> sb.from(t).select('id',{count:'exact',head:true}).eq('tenant_id',tenantId);
  const hc = async (qb:any)=>{const {count}=await qb; return count??0;};
  const distinct = async (t:string,col:string)=>{const {data}=await sb.from(t).select(col).eq('tenant_id',tenantId).limit(1000); return Array.from(new Set((data??[]).map((r:any)=>r[col]).filter((v:any)=>typeof v==='string')));};
  const dataTypes = await distinct('committed_data','data_type');
  const totalRows = await hc(tbl('committed_data'));
  const entityBound = await hc(tbl('committed_data').not('entity_id','is',null));
  const contentUnits:any[] = [];
  for (const dt of dataTypes){ contentUnits.push({dataType:dt, rowCount: await hc(tbl('committed_data').eq('data_type',dt)), entitiesBound: await hc(tbl('committed_data').eq('data_type',dt).not('entity_id','is',null))}); }
  const entTotal = await hc(tbl('entities'));
  const entWithExt = await hc(tbl('entities').not('external_id','is',null));
  const entityTypes = await distinct('entities','entity_type');
  const byType:any[]=[]; for (const et of entityTypes){ byType.push({entityType:et, count: await hc(tbl('entities').eq('entity_type',et))}); }
  const {data:sigs}=await sb.from('classification_signals').select('confidence,classification,decision_source').eq('tenant_id',tenantId).limit(5000);
  const confs=(sigs??[]).map((s:any)=>s.confidence).filter((x:any)=>typeof x==='number');
  const avgConfidence=confs.length?Math.round(confs.reduce((a:number,b:number)=>a+b,0)/confs.length*10)/10:null;
  const planCount=await hc(tbl('rule_sets').neq('status','draft'));
  const bindingCount=await hc(tbl('rule_set_assignments'));
  const {data:calc}=await sb.from('calculation_batches').select('lifecycle_state').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(1);
  const {data:batch}=await sb.from('import_batches').select('file_name,row_count').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(1);
  return {totalRows, entityBound, contentUnits, entTotal, entWithExt, byType, avgConfidence, sigCount:(sigs??[]).length,
    readiness:{hasData:totalRows>0,hasEntities:entTotal>0,hasPlan:planCount>0,hasBindings:bindingCount>0,hasCalculation:!!(calc&&calc.length),latest:calc?.[0]?.lifecycle_state??null},
    latestBatch:batch?.[0]??null};
}
async function main(){ for (const [n,id] of Object.entries(TENANTS)){ console.log(`\n===== ${n} =====`); console.log(JSON.stringify(await build(id),null,1)); } }
main();
