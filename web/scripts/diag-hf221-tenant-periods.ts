// HF-221 Phase 0.3 — BCL tenant + periods verification.
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', BCL_TENANT)
    .maybeSingle();

  console.log('BCL TENANT:', JSON.stringify(tenant, null, 2));
  console.log('TENANT ERROR:', JSON.stringify(tenantErr, null, 2));

  const { data: periods, error: periodsErr } = await supabase
    .from('periods')
    .select('id, label, start_date, end_date, canonical_key, period_type, status')
    .eq('tenant_id', BCL_TENANT)
    .order('start_date', { ascending: true });

  console.log('BCL PERIODS:');
  console.log(JSON.stringify(periods, null, 2));
  console.log('PERIODS ERROR:', JSON.stringify(periodsErr, null, 2));
})();
