import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data, error, count } = await sb.from('tenants').select('id, name', { count: 'exact' });
  console.log('error:', error);
  console.log('count:', count);
  console.log('data:', data);

  const { data: rs } = await sb.from('rule_sets').select('id, tenant_id, name').limit(5);
  console.log('\nrule_sets sample:', rs);

  // Try to get distinct tenant_ids from rule_sets
  const { data: allRs } = await sb.from('rule_sets').select('tenant_id');
  const tenantIds = Array.from(new Set((allRs ?? []).map((r: { tenant_id: string }) => r.tenant_id)));
  console.log('\nDistinct tenant_ids in rule_sets:', tenantIds);
})();
