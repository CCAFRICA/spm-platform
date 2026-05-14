// HF-221 Phase 2.6 — Tenant entity baseline.
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

  const rows: Array<{ id: string; external_id: string | null }> = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', BCL_TENANT)
      .range(from, to);
    if (error) {
      console.log('FETCH ERROR:', error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  const externalIds = new Set<string>();
  for (const row of rows) {
    if (row.external_id) externalIds.add(row.external_id);
  }

  console.log('TOTAL ENTITIES:', rows.length);
  console.log('DISTINCT EXTERNAL_IDS:', externalIds.size);
  console.log('SAMPLE external_ids (first 10):', Array.from(externalIds).slice(0, 10).join(', '));
})();
