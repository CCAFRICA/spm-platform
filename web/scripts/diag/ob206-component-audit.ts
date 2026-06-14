import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function main(){
  const { data, error } = await c.from('calculation_results').select('entity_id, total_payout, components, metrics, attainment').eq('tenant_id', BCL).limit(3);
  if (error) { console.log('ERR calculation_results:', error.message); }
  console.log('--- sample calculation_results rows (BCL) ---');
  console.log(JSON.stringify(data, null, 1)?.slice(0, 2500));
  // rule_sets components for BCL
  const { data: rs } = await c.from('rule_sets').select('name, status, components').eq('tenant_id', BCL).neq('status','draft').limit(2);
  console.log('\n--- rule_sets.components (BCL) ---');
  for (const r of (rs??[])) { const comps = r.components as any; console.log(r.name, r.status, '| component keys:', Array.isArray(comps)? comps.map((x:any)=>x.name||x.id||x.componentName||Object.keys(x)[0]) : (comps?Object.keys(comps):'none')); }
  // count calc_results for BCL
  const { count } = await c.from('calculation_results').select('id',{count:'exact',head:true}).eq('tenant_id', BCL);
  console.log('\ncalculation_results count (BCL):', count);
}
main();
