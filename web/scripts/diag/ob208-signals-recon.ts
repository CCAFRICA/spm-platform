import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function main(){
  const {error}=await c.from('classification_signals').select('id,tenant_id,signal_type,signal_value,source,context,created_at').limit(1);
  console.log('classification_signals cols:', error? 'FAIL '+error.message : 'OK');
  // distinct signal_type values present (is stream_interaction used?)
  const {data}=await c.from('classification_signals').select('signal_type').limit(500);
  const types=Array.from(new Set((data??[]).map((r:any)=>r.signal_type)));
  console.log('signal_type values present:', JSON.stringify(types));
  // try a stream_interaction write (HALT-3 test) then delete
  const {data:w,error:we}=await c.from('classification_signals').insert({tenant_id:BCL, signal_type:'stream_interaction', signal_value:{surface:'results',section:'test',action:'collapse',persona:'admin'}, source:'ob208-test'}).select('id').limit(1);
  console.log('stream_interaction write:', we? 'BLOCKED: '+we.message : 'OK '+w?.[0]?.id);
  if(w?.[0]?.id) await c.from('classification_signals').delete().eq('id',w[0].id);
}
main();
