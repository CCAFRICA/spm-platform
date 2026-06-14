import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function probe(t:string,cols:string){const{error}=await c.from(t).select(cols).limit(1);console.log(`${error?'FAIL':'OK  '} ${t} [${cols}]${error?' -> '+error.message:''}`);}
async function main(){
  await probe('calculation_results','id,tenant_id,entity_id,total_payout,components,attainment,metrics');
  await probe('entity_period_outcomes','id,tenant_id,entity_id,component_breakdown,attainment_summary');
  await probe('rule_sets','id,tenant_id,name,status,components');
  // 1. rule_sets.components ACTUAL shape for BCL (the regime signal source)
  const {data:rs}=await c.from('rule_sets').select('name,components').eq('tenant_id',BCL).neq('status','draft').limit(1);
  console.log('\n=== rule_sets.components (BCL) — variant/component definition shape ===');
  console.log(JSON.stringify(rs?.[0]?.components,null,1)?.slice(0,3000));
  // 2. attainment shape per row
  const {data:cr}=await c.from('calculation_results').select('attainment,components').eq('tenant_id',BCL).limit(2);
  console.log('\n=== calculation_results.attainment (BCL) — per-component? or {overall}? ===');
  console.log('attainment[0]:', JSON.stringify(cr?.[0]?.attainment));
  console.log('attainment[1]:', JSON.stringify(cr?.[1]?.attainment));
  // 3. entity_period_outcomes shape
  const {data:epo}=await c.from('entity_period_outcomes').select('component_breakdown,attainment_summary').eq('tenant_id',BCL).limit(1);
  console.log('\n=== entity_period_outcomes (BCL) ===');
  console.log('component_breakdown:', JSON.stringify(epo?.[0]?.component_breakdown)?.slice(0,800));
  console.log('attainment_summary:', JSON.stringify(epo?.[0]?.attainment_summary)?.slice(0,800));
}
main();
