import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // 1. All existing periods for CRP
  const { data: periods, error: pErr } = await supabase
    .from('periods')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: true });

  if (pErr) { console.error('Period query error:', pErr); return; }

  console.log('=== CRP PERIODS ===');
  console.log(`Count: ${periods?.length ?? 0}`);
  for (const p of periods ?? []) {
    console.log(`  ${p.id} | ${p.label} | type=${p.period_type} | ${p.start_date} to ${p.end_date} | key=${p.canonical_key} | status=${p.status}`);
  }

  // 2. All rule_sets for CRP with cadence_config
  const { data: ruleSets, error: rErr } = await supabase
    .from('rule_sets')
    .select('id, name, cadence_config, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (rErr) { console.error('Rule set query error:', rErr); return; }

  console.log('\n=== CRP RULE SETS ===');
  console.log(`Count: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets ?? []) {
    console.log(`  ${rs.id} | ${rs.name} | cadence=${JSON.stringify(rs.cadence_config)} | created=${rs.created_at}`);
  }

  // 3. committed_data date range
  const { data: dateRange } = await supabase
    .from('committed_data')
    .select('source_date')
    .eq('tenant_id', tenantId)
    .not('source_date', 'is', null)
    .order('source_date', { ascending: true })
    .limit(1);

  const { data: dateRangeMax } = await supabase
    .from('committed_data')
    .select('source_date')
    .eq('tenant_id', tenantId)
    .not('source_date', 'is', null)
    .order('source_date', { ascending: false })
    .limit(1);

  console.log('\n=== COMMITTED_DATA DATE RANGE ===');
  console.log(`Min source_date: ${dateRange?.[0]?.source_date}`);
  console.log(`Max source_date: ${dateRangeMax?.[0]?.source_date}`);

  // 4. Count committed_data rows
  const { count } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  console.log(`Total committed_data rows: ${count}`);

  console.log('\n=== PERIOD API ROUTES ===');
  console.log('(CC: run find command separately)');
}

main();
