import { createClient } from '@supabase/supabase-js';
import { writeSignalWithClient } from '../../src/lib/intelligence/canonical-signal-writer';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const A='OB209_TEST_actorA', B='OB209_TEST_actorB';
async function emit(actor:string, action:string){
  await writeSignalWithClient({ tenantId: BCL, signalType:'lifecycle:stream',
    signalValue:{ element_id:'results:anomaly_summary', action, actorId:actor, persona:'admin' } } as any, c);
}
async function main(){
  // CAPTURE (PG-06): write THROUGH the canonical writeSignal — actorA habitually expands, actorB once
  await emit(A,'expand'); await emit(A,'expand'); await emit(A,'collapse'); await emit(B,'expand');
  // L1 read (PG-07): actorA's own history → expand>collapse → react = default expanded
  const { data } = await c.from('classification_signals').select('signal_value').eq('tenant_id',BCL).eq('signal_type','lifecycle:stream').limit(2000);
  const rows=(data??[]).map((r:any)=>r.signal_value).filter((v:any)=>v?.element_id==='results:anomaly_summary'&&String(v?.actorId).startsWith('OB209_TEST_'));
  const a=rows.filter((v:any)=>v.actorId===A); const aExp=a.filter((v:any)=>v.action==='expand').length, aCol=a.filter((v:any)=>v.action==='collapse').length;
  console.log(`L1 (actorA): expand=${aExp} collapse=${aCol} -> react default = ${aExp>aCol&&aExp>=2?'EXPANDED (learned)':'collapsed'}`);
  // L3 read (PG-08): cross-user — distinct actors for the surface (insight-agent basis)
  const actors=Array.from(new Set(rows.map((v:any)=>v.actorId)));
  console.log(`L3 (cross-user): ${rows.length} interaction signals across ${actors.length} actors for results:anomaly_summary`);
  // cleanup test rows
  const { data: del } = await c.from('classification_signals').select('id,signal_value').eq('tenant_id',BCL).eq('signal_type','lifecycle:stream').limit(2000);
  const ids=(del??[]).filter((r:any)=>String(r.signal_value?.actorId).startsWith('OB209_TEST_')).map((r:any)=>r.id);
  for(const id of ids) await c.from('classification_signals').delete().eq('id',id);
  console.log(`(cleaned up ${ids.length} test rows) — write path = canonical writeSignalWithClient`);
}
main();
