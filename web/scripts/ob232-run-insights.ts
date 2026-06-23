import { createClient } from '@supabase/supabase-js';
import { generateInsights } from '../src/lib/insight/insight-engine';
const SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  console.log('[OB-232] generating insights (LLM) from Sabor semantic summaries…');
  const r=await generateInsights(sb,SABOR,{dataType:'pos_cheque'});
  console.log('PG-3/4 run:', JSON.stringify({generated:r.generated,stored:r.stored,failed:r.failed,byType:r.byType,model:r.model}));
  if(r.failures.length) console.log('  validator failures (EP-2 caught):', r.failures.slice(0,4));
  const {data:ia}=await sb.from('intelligence_artifacts').select('artifact_type,severity,entity_type,title,narrative,data_references,insight_shape').eq('tenant_id',SABOR);
  const byType:any={}; (ia??[]).forEach((a:any)=>byType[a.artifact_type]=(byType[a.artifact_type]||0)+1);
  console.log('\nPG-3 intelligence_artifacts:', (ia??[]).length, 'by type:', JSON.stringify(byType));
  const sample=(ia??[])[0]; if(sample){console.log('\nPG-3 sample insight:'); console.log('  ['+sample.artifact_type+'/'+sample.severity+'] '+sample.title); console.log('  '+sample.narrative.slice(0,160)); console.log('  data_references:', JSON.stringify(sample.data_references).slice(0,200));}
  console.log('\nPG-5 shapes (one per type):'); const seen=new Set();
  for(const a of (ia??[])){ if(seen.has(a.artifact_type))continue; seen.add(a.artifact_type); console.log('  '+a.artifact_type+':', JSON.stringify(a.insight_shape)); }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
