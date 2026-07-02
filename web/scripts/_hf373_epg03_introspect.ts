import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  // FP-49: introspect one row per table
  for (const t of ['processing_jobs', 'structural_fingerprints', 'entities', 'committed_data']) {
    const { data, error } = await sb.from(t).select('*').eq('tenant_id', VLTEST2).limit(1);
    if (error) { console.log(`[${t}] ERROR:`, error.message); continue; }
    if (!data || data.length === 0) { console.log(`[${t}] no rows for VLTEST2`); continue; }
    console.log(`[${t}] keys:`, JSON.stringify(Object.keys(data[0])));
  }

  // recent processing_jobs for VLTEST2 (last 48h window ~ 2026-06-30 onward)
  const { data: jobs, error: jerr } = await sb.from('processing_jobs')
    .select('id, created_at, status, file_name, job_type, error_detail')
    .eq('tenant_id', VLTEST2)
    .gte('created_at', '2026-06-30T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(40);
  if (jerr) console.log('jobs err', jerr.message);
  else for (const j of jobs ?? []) console.log('JOB', JSON.stringify(j));
}
main().catch(e => { console.error(e); process.exit(1); });
