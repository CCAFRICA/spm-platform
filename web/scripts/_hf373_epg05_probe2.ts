// HF-373 EPG-0.5 read-only probe 2: full job row, all jobs in session, import_batches, storage objects.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // Full failed-job row (all columns), FP-49
  const { data: job } = await sb.from('processing_jobs').select('*').eq('id', '0f648189-1a0f-4878-9103-179992b79401').single();
  console.log('=== full failed job row ===');
  console.log('columns:', job ? Object.keys(job) : null);
  console.log(JSON.stringify(job, null, 2)?.slice(0, 4000));

  // All jobs for that session
  const { data: sessJobs } = await sb.from('processing_jobs').select('id, status, job_type, file_name, error_detail, created_at, updated_at, retry_count, metadata')
    .eq('session_id', '5de0e6e1-fc3f-4b44-ade0-b00f4ddebf0b').order('created_at');
  console.log('\n=== all jobs in session 5de0e6e1 ===', sessJobs?.length);
  for (const j of sessJobs ?? []) console.log(JSON.stringify(j).slice(0, 1200));

  // import_batches for Casa Diaz around the failure window
  const { data: batches } = await sb.from('import_batches')
    .select('id, tenant_id, status, file_name, row_count, error_summary, created_at, completed_at')
    .eq('tenant_id', CASA)
    .gte('created_at', '2026-07-01T20:00:00Z')
    .order('created_at', { ascending: true })
    .limit(50);
  console.log('\n=== Casa Diaz import_batches since 2026-07-01T20:00Z ===', batches?.length);
  for (const b of batches ?? []) console.log(JSON.stringify(b).slice(0, 800));

  // storage: find the XLSX object + any staged committed CSVs for Casa Diaz
  console.log('\n=== storage: ingestion-raw list for Casa Diaz root ===');
  const { data: rootList, error: rerr } = await sb.storage.from('ingestion-raw').list(CASA, { limit: 100 });
  if (rerr) console.log('ERR', rerr);
  for (const o of rootList ?? []) console.log(o.name, JSON.stringify(o.metadata));
  console.log('\n=== storage: ingestion-raw list Casa/committed ===');
  const { data: comList, error: cerr } = await sb.storage.from('ingestion-raw').list(`${CASA}/committed`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (cerr) console.log('ERR', cerr);
  for (const o of comList ?? []) console.log(o.name, o.created_at, JSON.stringify(o.metadata));
  console.log('\n=== storage: ingestion-raw list Casa/uploads ===');
  const { data: upList, error: uerr } = await sb.storage.from('ingestion-raw').list(`${CASA}/uploads`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (uerr) console.log('ERR', uerr);
  for (const o of upList ?? []) console.log(o.name, o.created_at, JSON.stringify(o.metadata));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
