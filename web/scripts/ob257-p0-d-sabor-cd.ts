// OB-257 P0 Item 4 — Sabor committed_data sample (READ-ONLY).
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

async function main() {
  const { count } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  console.log('SABOR committed_data total count:', count);
  const { data: rows, error } = await sb.from('committed_data').select('*').eq('tenant_id', SABOR).limit(2);
  if (error) { console.log('ERROR:', JSON.stringify(error)); return; }
  for (const row of rows ?? []) {
    console.log(`\n--- data_type=${row.data_type} row id=${row.id} entity_id=${row.entity_id} period_id=${row.period_id}`);
    console.log(`top-level columns: ${Object.keys(row).join(', ')}`);
    const payload = row.row_data ?? row.data ?? null;
    if (payload && typeof payload === 'object') {
      console.log(`payload keys: ${Object.keys(payload).join(', ')}`);
      console.log(`payload sample: ${JSON.stringify(payload)}`);
    }
  }
  // BCL count for completeness
  const { count: bclCount } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');
  console.log('\nBCL committed_data total count:', bclCount);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
