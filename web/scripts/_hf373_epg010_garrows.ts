/** HF-373 EPG-0.10 read-only probe: committed rows from the COMISIÓN GARANTIZADA sheet. */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const CASA_DIAZ = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
async function main() {
  const { data } = await sb
    .from('committed_data')
    .select('id, data_type, entity_id, period_id, row_data')
    .eq('tenant_id', CASA_DIAZ)
    .eq('row_data->>_sheetName', 'COMISIÓN GARANTIZADA')
    .limit(5);
  console.log(`rows with _sheetName=COMISIÓN GARANTIZADA: ${data?.length}`);
  for (const r of data ?? []) console.log(JSON.stringify(r));
}
main().catch(e => { console.error(e); process.exit(1); });
