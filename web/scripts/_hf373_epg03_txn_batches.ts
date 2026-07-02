import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: rows } = await sb.from('committed_data')
    .select('entity_id, import_batch_id, source_date')
    .eq('tenant_id', VLTEST2)
    .eq('data_type', 'transaction')
    .limit(600);
  const byBatch = new Map<string, { total: number; linked: number; dates: Set<string> }>();
  for (const r of rows ?? []) {
    const b = byBatch.get(r.import_batch_id) ?? { total: 0, linked: 0, dates: new Set<string>() };
    b.total++; if (r.entity_id) b.linked++;
    if (r.source_date) b.dates.add(String(r.source_date));
    byBatch.set(r.import_batch_id, b);
  }
  for (const [bid, s] of byBatch) console.log(`batch ${bid}: total=${s.total} linked=${s.linked} dates=${Array.from(s.dates).slice(0,3).join(',')}`);
}
main().catch(e => { console.error(e); process.exit(1); });
