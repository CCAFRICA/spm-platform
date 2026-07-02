import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: jobs, error } = await sb.from('processing_jobs')
    .select('id, created_at, status, file_name, recognition_tier, session_id')
    .eq('tenant_id', VLTEST2)
    .gte('created_at', '2026-06-30T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) { console.log('err', error.message); return; }
  for (const j of jobs ?? []) console.log('JOB', JSON.stringify(j));
}
main().catch(e => { console.error(e); process.exit(1); });
