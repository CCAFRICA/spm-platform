// HF-373 EPG-0.5 read-only probe 3: staged CSV line size (pre-HF-372 actual), 07-01 batches,
// 07-01 job for the same file, and post-HF-372 committed_data metadata shape.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // 1) Download the first bytes of one staged CSV from the 2026-07-01 05:57 run and measure line sizes.
  const path = `${CASA}/committed/2065cb12-c118-454a-956e-878970312206.csv`; // 33,756,160 bytes
  const { data: blob, error } = await sb.storage.from('ingestion-raw').download(path);
  if (error || !blob) { console.log('download err', error); } else {
    const buf = Buffer.from(await blob.arrayBuffer());
    console.log('staged CSV total bytes:', buf.length);
    const text = buf.subarray(0, 200000).toString('utf8');
    const lines = text.split('\n');
    console.log('header line:', lines[0]);
    console.log('line1 length (bytes):', Buffer.byteLength(lines[1] ?? '', 'utf8'));
    console.log('line2 length (bytes):', Buffer.byteLength(lines[2] ?? '', 'utf8'));
    console.log('line1 first 1500 chars:', (lines[1] ?? '').slice(0, 1500));
    console.log('...line1 metadata tail 2500 chars:', (lines[1] ?? '').slice(-2500));
    // count rows cheaply from size
  }

  // 2) import_batches from the 07-01 05:50-06:05 window (the successful staging run)
  const { data: batches } = await sb.from('import_batches')
    .select('id, status, file_name, row_count, created_at, completed_at, error_summary')
    .eq('tenant_id', CASA)
    .gte('created_at', '2026-07-01T05:45:00Z').lte('created_at', '2026-07-01T06:30:00Z')
    .order('created_at');
  console.log('\n=== 07-01 staging-run batches ===', batches?.length);
  const counts: Record<string, number> = {};
  for (const b of batches ?? []) {
    counts[b.status] = (counts[b.status] ?? 0) + 1;
  }
  console.log('status histogram:', counts);
  for (const b of (batches ?? []).slice(0, 4)) console.log(JSON.stringify(b).slice(0, 500));
  console.log('row_counts sample:', (batches ?? []).slice(0, 10).map(b => b.row_count));

  // 3) the processing job for the 07-01 upload of the same file
  const { data: jobs } = await sb.from('processing_jobs')
    .select('id, status, file_name, file_size_bytes, error_detail, created_at, completed_at, session_id, retry_count, metadata')
    .eq('tenant_id', CASA)
    .ilike('file_name', '%3fb324e6_Abril%')
    .order('created_at');
  console.log('\n=== 07-01 job(s) for Abril file ===', jobs?.length);
  for (const j of jobs ?? []) console.log(JSON.stringify(j, null, 1).slice(0, 2000));

  // 4) post-HF-372 committed row metadata shape (COMISIONES import 07-02 01:20, batch 72fd60a5)
  const { data: cd } = await sb.from('committed_data')
    .select('id, import_batch_id, data_type, metadata')
    .eq('import_batch_id', '72fd60a5-3847-4d94-9f41-4b13f7f00d3c')
    .limit(1);
  if (cd && cd[0]) {
    const m = cd[0].metadata as Record<string, unknown>;
    console.log('\n=== post-HF-372 committed_data.metadata (COMISIONES batch) ===');
    console.log('metadata keys:', Object.keys(m));
    console.log('metadata JSON bytes:', Buffer.byteLength(JSON.stringify(m), 'utf8'));
    const fi = m.field_identities as Record<string, unknown> | undefined;
    if (fi) {
      const cols = Object.keys(fi);
      console.log('field_identities column count:', cols.length);
      console.log('one field identity:', JSON.stringify(fi[cols[0]], null, 1).slice(0, 2000));
      console.log('field_identities JSON bytes:', Buffer.byteLength(JSON.stringify(fi), 'utf8'));
    }
  } else {
    console.log('no committed rows for 72fd60a5');
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
