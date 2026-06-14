import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function probe(t:string,cols:string){const{error}=await c.from(t).select(cols).limit(1);console.log(`${error?'FAIL':'OK  '} ${t} [${cols}]${error?' -> '+error.message:''}`);}
async function main(){
  await probe('rule_sets','id,name,components,input_bindings');
  const {data:rs}=await c.from('rule_sets').select('input_bindings').eq('tenant_id',BCL).neq('status','draft').limit(1);
  console.log('\n=== rule_sets.input_bindings (BCL) — the field-resolution mechanism? ===');
  console.log(JSON.stringify(rs?.[0]?.input_bindings,null,1)?.slice(0,2000));
  // metrics keys
  const {data:cr}=await c.from('calculation_results').select('metrics').eq('tenant_id',BCL).limit(1);
  console.log('\nmetrics keys:', Object.keys((cr?.[0]?.metrics as any)??{}).join(', '));
}
main();
