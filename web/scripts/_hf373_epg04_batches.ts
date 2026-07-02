// HF-373 EPG-0.4: targeted batch queries for double-commit evidence.
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function dump(tid: string, proposal: string, label: string) {
  const { data, error } = await sb.from('import_batches')
    .select('id, created_at, completed_at, status, superseded_by, supersession_reason, row_count, file_name, metadata')
    .eq('tenant_id', tid).eq('metadata->>proposalId', proposal).order('created_at', { ascending: true }).limit(60);
  console.log(`\n--- ${label} proposal=${proposal} (${data?.length ?? 0} batches) ---`);
  if (error) console.log('ERROR:', error.message);
  for (const r of (data ?? []) as any[]) {
    const m = r.metadata ?? {};
    console.log(JSON.stringify({ id: r.id.slice(0, 8), created: r.created_at, completed: r.completed_at, status: r.status, sup_by: r.superseded_by ? r.superseded_by.slice(0, 8) : null, sup_reason: r.supersession_reason, rows: r.row_count, unit: m.contentUnitId, dataType: m.dataType ?? m.data_type }));
  }
}

async function main() {
  await dump(CASA, 'bcb1d921-c057-436d-951a-08b35bc38208', 'CASA 05:51 chain');
  await dump(CASA, '5851bd78-2382-4db9-afdb-fded902a08b0', 'CASA plan import (16 units)');
  await dump(CASA, '6291bd7c-fb5c-4ceb-ba67-f985b149a8b7', 'CASA failed-commit session');
}
main().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
