import { createClient } from '@supabase/supabase-js';
import { resolveEntityIds } from '../src/lib/summary/resolve-entity-ids';
import { runSummaryEngineRpc } from '../src/lib/summary/summary-engine';
const TENANTS:[string,string][]=[['BCL','b1c2d3e4-aaaa-bbbb-cccc-111111111111'],['MIR','972c8eb0-e3ae-4e4c-ad30-8b34804c893a']];
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  for(const [name,id] of TENANTS){
    const res=await resolveEntityIds(sb,id,{dataType:'transaction'});
    console.log(`\n${name} entity resolution:`, JSON.stringify(res));
    if(res.resolved>0){
      const bf=await runSummaryEngineRpc(sb,id);
      console.log(`${name} summary backfill (RPC):`, JSON.stringify(bf));
      const {count}=await sb.from('summary_artifacts').select('*',{count:'exact',head:true}).eq('tenant_id',id);
      const sa:any[]=[]; let off=0; for(;;){const {data}=await sb.from('summary_artifacts').select('entity_id,summary_date').eq('tenant_id',id).range(off,off+999); if(!data?.length)break; sa.push(...data); if(data.length<1000)break; off+=1000;}
      console.log(`${name} PG-1: summary_artifacts=${count}, distinct entities=${new Set(sa.map(r=>r.entity_id)).size}, distinct dates=${new Set(sa.map(r=>r.summary_date)).size}`);
    } else { console.log(`${name}: 0 resolved (fieldUsed=${res.fieldUsed}) — deferred`); }
  }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
