import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
(async () => {
  const { data } = await sb.from('committed_data').select('row_data, data_type, source_date, entity_id').eq('tenant_id', BCL).eq('data_type', 'transaction').limit(3);
  console.log('Sample transaction rows:');
  for (const r of (data ?? [])) {
    console.log(`data_type=${r.data_type} source_date=${r.source_date} entity_id=${r.entity_id}`);
    console.log(JSON.stringify(r.row_data, null, 2));
    console.log('---');
  }
  // Try to find BCL-5001 rows
  const { data: bclRows } = await sb.from('committed_data').select('row_data, data_type, source_date').eq('tenant_id', BCL).limit(100);
  const matches = (bclRows ?? []).filter(r => {
    const rd = r.row_data as Record<string, unknown> | null;
    if (!rd) return false;
    for (const v of Object.values(rd)) if (String(v).trim() === 'BCL-5001') return true;
    return false;
  });
  console.log(`\nRows containing BCL-5001: ${matches.length}`);
  for (const m of matches.slice(0, 3)) {
    console.log(`data_type=${m.data_type} source_date=${m.source_date}`);
    console.log(JSON.stringify(m.row_data, null, 2));
    console.log('---');
  }
})();
