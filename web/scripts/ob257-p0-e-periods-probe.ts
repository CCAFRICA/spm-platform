// OB-257 P0 Item 5 supplement — BCL periods + revenue-measure presence probe (READ-ONLY).
// Run: cd web && npx tsx --env-file=.env.local scripts/ob257-p0-e-periods-probe.ts
import { createClient } from '@supabase/supabase-js';
/* eslint-disable @typescript-eslint/no-explicit-any */
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

(async () => {
  const { data: p1, error: e1 } = await sb.from('periods').select('*').eq('tenant_id', BCL).limit(10);
  console.log('BCL periods (select *):', e1 ? `ERR ${e1.message}` : JSON.stringify(p1, null, 1));

  // distinct summary_date values for BCL transaction artifacts (is it monthly = period grain in disguise?)
  const dates = new Set<string>();
  for (let off = 0; ; off += 1000) {
    const { data } = await sb.from('summary_artifacts').select('summary_date')
      .eq('tenant_id', BCL).eq('data_type', 'transaction').range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) dates.add(r.summary_date);
    if (data.length < 1000) break;
  }
  console.log('BCL transaction artifact distinct summary_dates:', JSON.stringify(Array.from(dates).sort()));

  // committed_data transaction: distinct source_date (should mirror Periodo)
  const sdates = new Set<string>();
  for (let off = 0; ; off += 1000) {
    const { data } = await sb.from('committed_data').select('source_date')
      .eq('tenant_id', BCL).eq('data_type', 'transaction').range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) sdates.add(r.source_date);
    if (data.length < 1000) break;
  }
  console.log('BCL committed_data transaction distinct source_dates:', JSON.stringify(Array.from(sdates).sort()));

  // Sabor products dimension check: does any materialization carry product-level rows?
  const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
  const { count: prodFine } = await sb.from('summary_artifacts_fine').select('*', { count: 'exact', head: true })
    .eq('tenant_id', SABOR).eq('data_type', 'pos_producto');
  console.log('Sabor summary_artifacts_fine pos_producto rows:', prodFine);
})();
