/** HF-373 EPG-0.10 read-only probe: can reference("BASE COMISION") bind for Casa Diaz?
 *  committed_data row_data keys by data_type (read-only). */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const CASA_DIAZ = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  const { data: one } = await sb.from('committed_data').select('*').eq('tenant_id', CASA_DIAZ).limit(1);
  console.log('=== committed_data Object.keys(row) ===');
  console.log(JSON.stringify(Object.keys(one?.[0] ?? {})));

  for (const dt of ['transaction', 'entity', 'reference', 'target']) {
    const { data, count } = await sb
      .from('committed_data')
      .select('row_data', { count: 'exact' })
      .eq('tenant_id', CASA_DIAZ)
      .eq('data_type', dt)
      .limit(2);
    console.log(`\n--- data_type=${dt} count=${count}`);
    for (const r of data ?? []) {
      console.log(`row_data keys: ${JSON.stringify(Object.keys((r as { row_data: Record<string, unknown> }).row_data ?? {}))}`);
    }
  }

  // Does ANY committed row carry a "BASE COMISION" key?
  const { count: bcCount } = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', CASA_DIAZ)
    .not('row_data->BASE COMISION', 'is', null);
  console.log(`\nrows where row_data->"BASE COMISION" is not null: ${bcCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
