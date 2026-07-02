// OB-257 P0 Item 4 — entities/periods row shape probe (READ-ONLY).
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

async function main() {
  const { data: ents, error: eErr } = await sb.from('entities').select('*').eq('tenant_id', SABOR).limit(3);
  if (eErr) console.log('ENT_ERROR:', JSON.stringify(eErr));
  if (ents && ents.length) {
    console.log('SABOR entities columns:', Object.keys(ents[0]).join(', '));
    for (const e of ents) console.log('  ', JSON.stringify(e).slice(0, 400));
  }
  const { data: periods, error: pErr } = await sb.from('periods').select('*').eq('tenant_id', SABOR).limit(5);
  if (pErr) console.log('PERIOD_ERROR:', JSON.stringify(pErr));
  console.log('SABOR periods rows:', periods?.length ?? 0);
  if (periods && periods.length) {
    console.log('periods columns:', Object.keys(periods[0]).join(', '));
    for (const p of periods) console.log('  ', JSON.stringify(p).slice(0, 300));
  }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
