import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: ents } = await sb.from('entities').select('id, external_id').eq('tenant_id', VLTEST2).limit(2000);
  const entById = new Map((ents ?? []).map(e => [e.id, e.external_id]));

  const { data: rows, count } = await sb.from('committed_data')
    .select('id, entity_id, row_data, metadata', { count: 'exact' })
    .eq('tenant_id', VLTEST2)
    .eq('data_type', 'transaction')
    .limit(600);
  console.log('transaction rows count:', count);
  const eifs = new Map<string, number>();
  let match = 0, mismatch = 0, nullEid = 0;
  for (const r of rows ?? []) {
    const eif = (r.metadata as any)?.entity_id_field ?? '(none)';
    eifs.set(eif, (eifs.get(eif) ?? 0) + 1);
    const rd = r.row_data as Record<string, unknown>;
    if (!r.entity_id) { nullEid++; continue; }
    const ext = entById.get(r.entity_id);
    if (ext === String(rd.ID_Empleado ?? '').trim()) match++; else mismatch++;
  }
  console.log('entity_id_field values on txn rows:', JSON.stringify(Object.fromEntries(eifs)));
  console.log(`txn linkage sample(${rows?.length}): entity_id matches row ID_Empleado=${match}, mismatch=${mismatch}, null=${nullEid}`);
}
main().catch(e => { console.error(e); process.exit(1); });
