import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
(async () => {
  const { data: periods } = await sb.from('periods').select('id, label, canonical_key, start_date, end_date').eq('tenant_id', BCL).order('start_date');
  console.log('BCL periods:');
  for (const p of (periods ?? [])) console.log(`  ${p.id} | ${p.canonical_key} | ${p.label}`);
  const { count } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', BCL);
  console.log(`\nTotal BCL committed_data rows: ${count}`);
  // Group by period
  const { data: byPeriod } = await sb.from('committed_data').select('period_id, data_type').eq('tenant_id', BCL);
  const grouped = new Map<string, Map<string, number>>();
  for (const r of (byPeriod ?? [])) {
    const pid = String((r as { period_id: string | null }).period_id);
    const dt = String((r as { data_type: string }).data_type);
    if (!grouped.has(pid)) grouped.set(pid, new Map());
    const m = grouped.get(pid)!;
    m.set(dt, (m.get(dt) ?? 0) + 1);
  }
  console.log('\nBCL committed_data by (period_id, data_type):');
  for (const [pid, dtMap] of Array.from(grouped.entries())) {
    for (const [dt, count] of Array.from(dtMap.entries())) {
      console.log(`  period=${pid.substring(0,8)} data_type=${dt} count=${count}`);
    }
  }
})();
