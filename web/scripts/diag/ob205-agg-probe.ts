import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const M = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'; // Meridian (304)
const BIG = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e'; // MX Restaurant (654k)
async function main(){
  // 1. exact head count (fast, no rows)
  const t0=Date.now();
  const { count } = await c.from('committed_data').select('id',{count:'exact',head:true}).eq('tenant_id', BIG);
  console.log(`head count BIG = ${count} in ${Date.now()-t0}ms`);
  // 2. PostgREST aggregate group-by attempt
  const agg = await c.from('committed_data').select('data_type, count:id.count()').eq('tenant_id', M);
  console.log('aggregate group-by:', agg.error ? `ERR: ${agg.error.message}` : JSON.stringify(agg.data));
  // 3. distinct data_type cardinality (Meridian small)
  const dt = await c.from('committed_data').select('data_type').eq('tenant_id', M);
  const distinct = Array.from(new Set((dt.data??[]).map((r:{data_type:string})=>r.data_type)));
  console.log('Meridian distinct data_type:', JSON.stringify(distinct), 'rowsReturned=', dt.data?.length);
  // 4. entities entity_type/status distinct
  const et = await c.from('entities').select('entity_type,status,external_id').eq('tenant_id', M);
  console.log('Meridian entities sample types:', JSON.stringify(Array.from(new Set((et.data??[]).map((r:{entity_type:string})=>r.entity_type)))), 'count=', et.data?.length);
  // 5. grouped count via head per distinct value timing (the fallback pattern)
  const t1=Date.now();
  for (const v of distinct){ await c.from('committed_data').select('id',{count:'exact',head:true}).eq('tenant_id',M).eq('data_type',v); }
  console.log(`per-group head counts (${distinct.length} groups) in ${Date.now()-t1}ms`);
}
main();
