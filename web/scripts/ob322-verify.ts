import { createClient } from '@supabase/supabase-js';
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  // HALT-1: calculation_results.components structure
  const {data:cr}=await sb.from('calculation_results').select('entity_id,total_payout,components,period_id').eq('tenant_id',BCL).limit(2);
  console.log('HALT-1 calc_results count sample:', cr?.length);
  if(cr?.[0]){console.log('  total_payout:', cr[0].total_payout, '| components type:', Array.isArray(cr[0].components)?'ARRAY':typeof cr[0].components);
    console.log('  components sample:', JSON.stringify(cr[0].components).slice(0,400));}
  // HALT-3: entities variant/level metadata
  const {data:ent}=await sb.from('entities').select('id,display_name,entity_type,metadata').eq('tenant_id',BCL).eq('entity_type','individual').limit(2);
  console.log('\nHALT-3 BCL entity sample:'); (ent??[]).forEach((e:any)=>console.log('  ',e.display_name,'| metadata:',JSON.stringify(e.metadata).slice(0,200)));
  // periods with completed batches (O-2)
  const {data:b}=await sb.from('calculation_batches').select('period_id,lifecycle_state').eq('tenant_id',BCL).limit(10);
  console.log('\nO-2 calc_batches:', JSON.stringify(b));
  // rule_set_assignments metadata (variant alt source)
  const {data:rsa}=await sb.from('rule_set_assignments').select('metadata').eq('tenant_id',BCL).limit(2);
  console.log('rule_set_assignments metadata sample:', JSON.stringify(rsa));
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
