// HF-373 EPG-0.6 read-only probe: processing_jobs introspection + the two offending jobs (D7)
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // FP-49: introspect one row's full column set
  const { data: one, error: e0 } = await sb.from('processing_jobs').select('*').limit(1);
  if (e0) { console.log('INTROSPECT ERROR', e0); return; }
  console.log('=== FP-49 processing_jobs columns ===');
  console.log(JSON.stringify(Object.keys(one![0]), null, 2));

  // Last 48h jobs for both tenants
  const since = new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(); // 60h to be safe
  const { data: jobs, error: e1 } = await sb
    .from('processing_jobs')
    .select('*')
    .gte('created_at', since)
    .in('tenant_id', [VLTEST2, CASA])
    .order('created_at', { ascending: true });
  if (e1) { console.log('JOBS ERROR', e1); return; }
  console.log(`\n=== ${jobs!.length} jobs since ${since} ===`);
  for (const j of jobs!) {
    const meta = j.metadata || {};
    console.log(
      `id=${j.id} tenant=${j.tenant_id === VLTEST2 ? 'VLTEST2' : 'CASA'} file=${j.file_name ?? meta.file_name ?? ''} status=${j.status} phase=${meta.phase ?? j.phase ?? ''} created=${j.created_at} completed_at=${j.completed_at} error=${String(j.error_detail ?? '').slice(0, 120)}`
    );
  }

  // Offender 1: error text "The object exceeded the maximum allowed size"
  const offenders1 = jobs!.filter(
    (j: any) =>
      JSON.stringify(j).includes('exceeded the maximum allowed size')
  );
  console.log(`\n=== OFFENDER 1 candidates (object exceeded max size): ${offenders1.length} ===`);
  for (const j of offenders1) console.log(JSON.stringify(j, null, 2));

  // Offender 2: stuck committed/finalizing, completed_at null
  const offenders2 = jobs!.filter(
    (j: any) =>
      (j.status === 'committed' || (j.metadata && j.metadata.phase === 'finalizing')) &&
      !j.completed_at
  );
  console.log(`\n=== OFFENDER 2 candidates (committed/finalizing, completed_at null): ${offenders2.length} ===`);
  for (const j of offenders2) console.log(JSON.stringify(j, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
