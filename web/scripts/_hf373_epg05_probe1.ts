// HF-373 EPG-0.5 read-only probe 1: failed 86K job, pulse_load_jobs introspection, bucket limits.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // (e) recent processing_jobs with the upload-size error (last ~72h to be safe)
  const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { data: jobs, error: jerr } = await sb
    .from('processing_jobs')
    .select('*')
    .gte('created_at', since)
    .or('error_detail.ilike.%exceeded the maximum allowed size%,error_detail.ilike.%upload failed%')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('=== processing_jobs with upload-size/upload-failed error (72h) ===');
  if (jerr) console.log('ERR', jerr);
  for (const j of jobs ?? []) {
    console.log(JSON.stringify({
      id: j.id, tenant_id: j.tenant_id, status: j.status, phase: j.phase,
      job_type: j.job_type, file_name: j.file_name, error_detail: j.error_detail,
      created_at: j.created_at, updated_at: j.updated_at, session_id: j.session_id,
      retry_count: j.retry_count,
    }, null, 2));
    console.log('metadata keys:', j.metadata ? Object.keys(j.metadata) : null);
    console.log('metadata:', JSON.stringify(j.metadata)?.slice(0, 3000));
  }

  // Wider search: any recent job mentioning "Exportar Hoja de Trabajo"
  const { data: jobs2, error: jerr2 } = await sb
    .from('processing_jobs')
    .select('id, tenant_id, status, phase, file_name, error_detail, created_at, metadata')
    .gte('created_at', since)
    .ilike('file_name', '%Exportar%')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('\n=== processing_jobs file_name ~ Exportar (72h) ===');
  if (jerr2) console.log('ERR', jerr2);
  for (const j of jobs2 ?? []) {
    console.log(JSON.stringify({ id: j.id, tenant_id: j.tenant_id, status: j.status, phase: j.phase, file_name: j.file_name, error_detail: j.error_detail, created_at: j.created_at }, null, 2));
    console.log('metadata:', JSON.stringify(j.metadata)?.slice(0, 3000));
  }

  // (c) FP-49: pulse_load_jobs introspection
  console.log('\n=== pulse_load_jobs: latest 3 rows ===');
  const { data: plj, error: perr } = await sb
    .from('pulse_load_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  if (perr) console.log('ERR', perr);
  if (plj && plj.length > 0) {
    console.log('columns:', Object.keys(plj[0]));
    for (const r of plj) {
      const { manifest, ...rest } = r as Record<string, unknown> & { manifest: unknown };
      console.log(JSON.stringify(rest, null, 2));
      const m = manifest as unknown[];
      console.log('manifest type:', Array.isArray(m) ? `array[${m.length}]` : typeof m);
      console.log('manifest[0..2]:', JSON.stringify(Array.isArray(m) ? m.slice(0, 3) : m, null, 2)?.slice(0, 3000));
    }
  } else {
    console.log('pulse_load_jobs rows:', plj?.length ?? 0);
  }
  const { count: pljCount } = await sb.from('pulse_load_jobs').select('*', { count: 'exact', head: true });
  console.log('pulse_load_jobs total count:', pljCount);

  // (e) bucket limits as the code discovers them
  console.log('\n=== storage buckets (getBucket ingestion-raw) ===');
  const { data: bucket, error: berr } = await sb.storage.getBucket('ingestion-raw');
  console.log('getBucket error:', berr);
  console.log('getBucket data:', JSON.stringify(bucket, null, 2));
  const { data: buckets } = await sb.storage.listBuckets();
  console.log('all buckets:', JSON.stringify((buckets ?? []).map((b: Record<string, unknown>) => ({ name: b.name, file_size_limit: b.file_size_limit, public: b.public })), null, 2));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
