import { createClient } from '@supabase/supabase-js';
import { generateConvergenceBindings } from '../src/lib/summary/convergence-binding-generator';
import { runSummaryEngine, buildSemanticKeyMap } from '../src/lib/summary/summary-engine';
const SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  console.log('[HF-336] generating convergence bindings (LLM)…');
  const gen=await generateConvergenceBindings(sb,SABOR,'pos_cheque');
  console.log('PG-1 binding gen:', JSON.stringify({ruleSetsUpdated:gen.ruleSetsUpdated,fieldsBound:gen.fieldsBound}));
  console.log('PG-1 field→role sample:'); Object.entries(gen.sample).forEach(([f,id]:any)=>console.log(`   ${f} → ${id.contextualIdentity} (${id.structuralType})`));
  const keyMap=await buildSemanticKeyMap(sb,SABOR);
  console.log('\nsemantic key map (column→role):', JSON.stringify(keyMap));
  console.log('\n[HF-336] re-backfilling summaries (enriched)…');
  const bf=await runSummaryEngine(sb,SABOR,()=>{});
  console.log('PG-2 backfill:', JSON.stringify(bf));
  const {data:sa}=await sb.from('summary_artifacts').select('metrics').eq('tenant_id',SABOR).limit(1);
  console.log('PG-2 summary_artifacts metric keys NOW:', sa?.[0]?Object.keys(sa[0].metrics).sort():'none');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
