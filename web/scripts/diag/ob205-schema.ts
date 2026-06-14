import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const checks: Record<string,string> = {
  committed_data: 'id,tenant_id,import_batch_id,entity_id,period_id,data_type,row_data,metadata,created_at,source_date',
  entities: 'id,tenant_id,entity_type,status,external_id,display_name,profile_id,temporal_attributes,metadata,created_at,updated_at',
  import_batches: 'id,tenant_id,file_name,file_type,row_count,status,error_summary,metadata,uploaded_by,created_at,completed_at',
  classification_signals: 'id,tenant_id,signal_type,signal_value,confidence,source,context,created_at,source_file_name,sheet_name,classification,decision_source,agent_scores',
  rule_sets: 'id,tenant_id,name,status,components',
  rule_set_assignments: 'id,tenant_id,rule_set_id,entity_id',
  periods: 'id,tenant_id,canonical_key,label,start_date,end_date,status',
  calculation_batches: 'id,tenant_id,lifecycle_state,period_id,rule_set_id',
};
async function main(){
  for (const [t,cols] of Object.entries(checks)){
    const { error } = await c.from(t).select(cols).limit(1);
    console.log(`${error? 'FAIL':'OK  '} ${t.padEnd(24)} ${error? error.message : 'all '+cols.split(',').length+' cols exist'}`);
  }
  // HALT-3: committed_data counts per tenant
  console.log('\n=== committed_data counts (HALT-3) ===');
  const { data: tenants } = await c.from('tenants').select('id,name');
  for (const t of (tenants??[])){
    const { count } = await c.from('committed_data').select('id',{count:'exact',head:true}).eq('tenant_id', t.id);
    if ((count??0) > 0) console.log(`  ${(count+'').padStart(8)}  ${t.name}  (${t.id})`);
  }
}
main();
