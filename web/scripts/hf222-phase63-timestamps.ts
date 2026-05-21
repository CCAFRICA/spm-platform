// Verify calc-result timestamps are post-HF-222 Phase 3 commit.
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('calculation_results')
    .select('tenant_id, created_at')
    .order('created_at', { ascending: true })
    .limit(2000);

  const byTenant: Record<string, { earliest: string; latest: string; count: number }> = {};
  for (const r of data ?? []) {
    const t = r.tenant_id ?? 'null';
    if (!byTenant[t]) byTenant[t] = { earliest: r.created_at, latest: r.created_at, count: 0 };
    byTenant[t].count++;
    if (r.created_at < byTenant[t].earliest) byTenant[t].earliest = r.created_at;
    if (r.created_at > byTenant[t].latest) byTenant[t].latest = r.created_at;
  }
  console.log('=== calculation_results created_at by tenant ===');
  for (const [t, v] of Object.entries(byTenant)) {
    console.log(`${t}: count=${v.count}, earliest=${v.earliest}, latest=${v.latest}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
