import { createClient } from '@supabase/supabase-js';
import { generateInsights } from '../src/lib/insight/insight-engine';
const SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  console.log('[OB-232] DRY-RUN insight generation from Sabor semantic summaries…');
  const r=await generateInsights(sb,SABOR,{dataType:'pos_cheque',dryRun:true});
  console.log('PG-3/4 run:', JSON.stringify({generated:r.generated,validated:r.validated,failed:r.failed,byType:r.byType,model:r.model}));
  if(r.failures.length) console.log('  EP-2 validator failures:', r.failures.slice(0,4));
  console.log('\nPG-3 sample insights + PG-5 shapes (one per type):');
  const seen=new Set<string>();
  for(const s of r.samples as any[]){ if(seen.has(s.artifact_type))continue; seen.add(s.artifact_type);
    console.log(`\n  [${s.artifact_type}/${s.severity}] ${s.title}`);
    console.log(`    ${String(s.narrative).slice(0,150)}`);
    console.log(`    data_references: ${JSON.stringify(s.data_references).slice(0,180)}`);
    console.log(`    PG-5 shape: ${JSON.stringify(s.shape)}`);
  }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
