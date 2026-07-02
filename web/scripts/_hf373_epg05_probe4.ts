// HF-373 EPG-0.5 read-only probe 4: failed-run telemetry, 07-01 committed row shape, csv object count.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // 1) telemetry for the FAILED run (proposal 6291bd7c) — FP-49 introspect
  const { data: tel, error: terr } = await sb.from('import_session_telemetry').select('*')
    .eq('import_session_id', '6291bd7c-fb5c-4ceb-ba67-f985b149a8b7');
  console.log('=== import_session_telemetry (failed run 6291bd7c) ===', terr ?? '');
  for (const t of tel ?? []) {
    console.log('columns:', Object.keys(t));
    console.log(JSON.stringify(t, null, 1).slice(0, 2500));
  }

  // and the successful 07-01 session bcb1d921
  const { data: tel2 } = await sb.from('import_session_telemetry').select('*')
    .eq('import_session_id', 'bcb1d921-c057-436d-951a-08b35bc38208');
  console.log('\n=== import_session_telemetry (07-01 run bcb1d921) ===');
  for (const t of tel2 ?? []) console.log(JSON.stringify(t, null, 1).slice(0, 2500));

  // 2) one committed row from the 07-01 loaded run — column count + metadata size
  const { data: cd } = await sb.from('committed_data')
    .select('import_batch_id, data_type, row_data, metadata')
    .eq('import_batch_id', 'ba32f15e-e1e0-4c89-8f54-2b2aea353c32')
    .limit(1);
  if (cd && cd[0]) {
    const rd = cd[0].row_data as Record<string, unknown>;
    const m = cd[0].metadata as Record<string, unknown>;
    console.log('\n=== 07-01 committed row (batch ba32f15e) ===');
    console.log('row_data key count:', Object.keys(rd).length);
    console.log('row_data JSON bytes:', Buffer.byteLength(JSON.stringify(rd), 'utf8'));
    console.log('metadata JSON bytes:', Buffer.byteLength(JSON.stringify(m), 'utf8'));
    const fi = m.field_identities as Record<string, unknown> | undefined;
    console.log('field_identities cols:', fi ? Object.keys(fi).length : null,
      'bytes:', fi ? Buffer.byteLength(JSON.stringify(fi), 'utf8') : null);
  } else {
    console.log('no committed rows for ba32f15e');
  }
  const { count: cdCount } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', CASA).eq('data_type', 'transaction');
  console.log('Casa Diaz committed_data transaction count:', cdCount);

  // 3) count committed/*.csv objects
  const { data: comList } = await sb.storage.from('ingestion-raw').list(`${CASA}/committed`, { limit: 1000 });
  const totalBytes = (comList ?? []).reduce((s, o) => s + ((o.metadata as { size?: number })?.size ?? 0), 0);
  console.log('\ncommitted/ objects:', comList?.length, 'total bytes:', totalBytes, `(${(totalBytes / 1048576).toFixed(1)}MB)`);
  const sizes = (comList ?? []).map(o => (o.metadata as { size?: number })?.size ?? 0);
  console.log('min/max size:', Math.min(...sizes), Math.max(...sizes));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
