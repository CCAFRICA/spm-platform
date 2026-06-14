import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function main(){
  const { data: prof } = await c.from('profiles').select('id').eq('tenant_id',BCL).limit(1);
  const profileId = prof?.[0]?.id ?? null;
  // exact insert the route performs
  const { data, error } = await c.from('audit_logs').insert({
    tenant_id: BCL, profile_id: profileId, action: 'anomaly.resolved',
    resource_type: 'calculation_batch', resource_id: null,
    changes: { anomalyType: 'outlier_high', description: 'TEST 4 entities >2σ', entityCount: 4, disposition: 'acknowledged' },
    metadata: { surface: 'admin_results', source: 'OB-207-inc2-pass2', test: true },
  }).select('id, action, profile_id, resource_type, changes').limit(1);
  if (error) { console.log('WRITE FAIL:', error.message); return; }
  console.log('WROTE audit_logs row:', JSON.stringify(data?.[0]));
  // cleanup the test row
  await c.from('audit_logs').delete().eq('id', data?.[0]?.id);
  console.log('(test row cleaned up)');
}
main();
