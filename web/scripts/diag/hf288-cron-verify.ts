// HF-288 Phase 2 — verify the pg_cron job exists (architect applied). cron.job lives in the `cron`
// schema; try via the service-role client (schema('cron')), fall back to an RPC if exposed.
import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false}});
  try {
    const { data, error } = await (sb as any).schema('cron').from('job').select('jobname, schedule, command, active').eq('jobname', 'ob204-pii-cleanse-90d');
    if (error) { console.log('cron schema not reachable via PostgREST:', error.message); }
    else if (data && data.length) { console.log('CRON JOB FOUND:'); for (const j of data) console.log(`  jobname=${j.jobname} schedule="${j.schedule}" active=${j.active}\n  command=${String(j.command).replace(/\s+/g,' ').slice(0,160)}…`); return; }
    else { console.log('cron.job query OK but no row named ob204-pii-cleanse-90d (not scheduled?)'); return; }
  } catch (e) { console.log('schema(cron) threw:', e instanceof Error ? e.message : e); }
  console.log('→ cron.job not introspectable via service-role PostgREST (the cron schema is not exposed).');
  console.log('  Verification requires Dashboard SQL: SELECT jobname, schedule FROM cron.job WHERE jobname = ʼob204-pii-cleanse-90dʼ;');
}
main().catch(e=>{console.error(e);process.exit(1);});
