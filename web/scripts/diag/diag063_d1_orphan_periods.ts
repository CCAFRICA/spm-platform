/**
 * DIAG-063 / D1 follow-up — outcomes whose tenant shows no periods rows.
 * READ-ONLY. Counts and UUIDs only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = '03d28288-700b-43e3-a96b-49a4f849d2df';

async function main() {
  const { data: rows, error } = await supabase
    .from('entity_period_outcomes')
    .select('period_id')
    .eq('tenant_id', TENANT)
    .limit(1000);
  if (error) { console.log('outcomes ERR:', error.message); return; }
  const distinctPeriodIds = Array.from(new Set((rows ?? []).map(r => r.period_id)));
  console.log(`tenant ${TENANT}: ${rows?.length} outcome rows, ${distinctPeriodIds.length} distinct period_id(s):`, distinctPeriodIds.join(', '));

  const { count: periodCount } = await supabase
    .from('periods')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT);
  console.log(`periods rows for tenant ${TENANT}:`, periodCount);

  // Do the referenced period_ids exist at all (any tenant)?
  const { data: found, error: fErr } = await supabase
    .from('periods')
    .select('id, tenant_id, status')
    .in('id', distinctPeriodIds);
  if (fErr) { console.log('periods lookup ERR:', fErr.message); return; }
  console.log('referenced period_ids found in periods table:', found?.length ?? 0);
  for (const p of found ?? []) {
    console.log(`  period ${p.id} -> tenant ${p.tenant_id} status=${p.status}`);
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
