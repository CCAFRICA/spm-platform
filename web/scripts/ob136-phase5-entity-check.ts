// OB-136 Phase 5 — check entity dedup state
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function run() {
  const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

  // Check total entities
  const { count: total } = await sb.from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', PTC);
  console.log('Total entities:', total);

  // Check for duplicate external_ids
  const PAGE = 1000;
  const allEntities: Array<{ external_id: string | null }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('entities')
      .select('external_id')
      .eq('tenant_id', PTC)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    allEntities.push(...data);
    page++;
    if (data.length < PAGE) break;
  }

  console.log('Fetched entities:', allEntities.length);

  // Count duplicates
  const extIdCount = new Map<string, number>();
  let nullCount = 0;
  for (const e of allEntities) {
    if (!e.external_id) {
      nullCount++;
      continue;
    }
    extIdCount.set(e.external_id, (extIdCount.get(e.external_id) || 0) + 1);
  }

  const duplicates = Array.from(extIdCount.entries()).filter(([, c]) => c > 1);
  console.log('Null external_id:', nullCount);
  console.log('Unique external_ids:', extIdCount.size);
  console.log('Duplicate external_ids:', duplicates.length);
  if (duplicates.length > 0) {
    console.log('Top 5 duplicates:');
    duplicates.sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([id, count]) => {
      console.log('  ', id, ':', count, 'copies');
    });
  }

  // Check unique constraint
  const { data: constraints, error: cErr } = await sb.rpc('get_constraints' as any, {}).catch(() => ({ data: null, error: null }));
  console.log('\nConstraint check:', constraints ? 'got data' : 'no RPC available');

  // Check assignments count
  const { count: assignCount } = await sb.from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', PTC);
  console.log('Assignments:', assignCount);
}

run().catch(console.error);
