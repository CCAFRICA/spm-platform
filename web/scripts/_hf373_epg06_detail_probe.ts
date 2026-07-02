// HF-373 EPG-0.6 probe 2: full detail on the two offending jobs + finalize claims + pulse jobs
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const FAILED_JOB = '0f648189-1a0f-4878-9103-179992b79401';
const STUCK_JOB = '52fad564-47e5-4d39-8ab9-09b730e1c2ba';

async function main() {
  for (const id of [FAILED_JOB, STUCK_JOB]) {
    const { data } = await sb.from('processing_jobs')
      .select('id, tenant_id, status, file_name, file_size_bytes, error_detail, retry_count, session_id, batch_id, chunk_id, total_chunks, created_at, started_at, completed_at, metadata, recognition_tier')
      .eq('id', id).single();
    console.log(`\n=== JOB ${id} (verbatim, sans proposal/classification blobs) ===`);
    console.log(JSON.stringify(data, null, 2));
  }

  // import_finalize_runs claims for both tenants
  const { data: claims, error: ce } = await sb.from(`import_finalize_runs`)
    .select('*')
    .in('tenant_id', [CASA, VLTEST2])
    .order('claimed_at', { ascending: true });
  console.log(`\n=== import_finalize_runs (err=${ce?.message ?? 'none'}) ===`);
  if (claims?.length) {
    console.log('columns:', JSON.stringify(Object.keys(claims[0])));
    for (const c of claims) console.log(JSON.stringify(c));
  } else console.log('no rows');

  // pulse_load_jobs in the window
  const { data: pjs, error: pe } = await sb.from('pulse_load_jobs')
    .select('*')
    .in('tenant_id', [CASA, VLTEST2])
    .gte('created_at', '2026-07-01T00:00:00Z')
    .order('created_at', { ascending: true });
  console.log(`\n=== pulse_load_jobs since 2026-07-01 (err=${pe?.message ?? 'none'}) ===`);
  if (pjs?.length) {
    console.log('columns:', JSON.stringify(Object.keys(pjs[0])));
    for (const p of pjs) {
      const { manifest, ...rest } = p as Record<string, unknown> & { manifest?: unknown };
      console.log(JSON.stringify({ ...rest, manifest_pulses: Array.isArray((manifest as { pulses?: unknown[] } | undefined)?.pulses) ? ((manifest as { pulses: unknown[] }).pulses).length : manifest === undefined ? 'n/a' : typeof manifest }));
    }
  } else console.log('no rows');
}

main().catch((e) => { console.error(e); process.exit(1); });
