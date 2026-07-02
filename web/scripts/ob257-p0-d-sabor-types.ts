// OB-257 P0 Item 4 — Sabor data_type inventory + entities (READ-ONLY).
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  // non-pos_cheque rows for Sabor?
  const { count: nonPos } = await sb.from('committed_data').select('id', { count: 'exact', head: true })
    .eq('tenant_id', SABOR).neq('data_type', 'pos_cheque');
  console.log('SABOR committed_data rows with data_type != pos_cheque:', nonPos);
  if ((nonPos ?? 0) > 0) {
    const { data } = await sb.from('committed_data').select('data_type').eq('tenant_id', SABOR).neq('data_type', 'pos_cheque').limit(1000);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.data_type] = (counts[r.data_type] ?? 0) + 1;
    console.log('  other data_types (first 1000):', JSON.stringify(counts));
  }
  for (const [label, tid] of [['SABOR', SABOR], ['BCL', BCL]] as const) {
    const { count } = await sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
    const { data: ents } = await sb.from('entities').select('id, external_id, name, entity_type').eq('tenant_id', tid).limit(5);
    console.log(`\n${label} entities count: ${count}`);
    for (const e of ents ?? []) console.log(`  ${e.external_id} | ${e.name} | type=${e.entity_type}`);
  }
  // Sabor periods
  const { data: periods } = await sb.from('periods').select('id, name, start_date, end_date, status').eq('tenant_id', SABOR).order('start_date').limit(20);
  console.log('\nSABOR periods:', (periods ?? []).length);
  for (const p of periods ?? []) console.log(`  ${p.name} ${p.start_date}..${p.end_date} status=${p.status}`);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
