import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
async function main() {
  const { data } = await sb.from('committed_data').select('data_type, metadata, created_at').eq('tenant_id', CASA).order('created_at', { ascending: true });
  const agg: Record<string, { n: number; first: string; last: string }> = {};
  for (const r of data ?? []) {
    const src = ((r.metadata as Record<string, unknown>)?.source_file as string) ?? 'unknown';
    const k = `${src} :: ${r.data_type}`;
    agg[k] ??= { n: 0, first: r.created_at, last: r.created_at };
    agg[k].n++; agg[k].last = r.created_at;
  }
  console.log(JSON.stringify(agg, null, 2));
  if (data?.length) console.log('sample metadata keys:', JSON.stringify(Object.keys((data[0].metadata as object) ?? {})));
}
main().catch(e => { console.error(e); process.exit(1); });
