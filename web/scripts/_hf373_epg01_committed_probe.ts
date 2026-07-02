// HF-373 EPG-0.1 read-only probe: committed_data row_data/metadata shapes per batch
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  // introspect import_batches
  const { data: ib1, error: e1 } = await sb.from('import_batches').select('*').eq('tenant_id', VLTEST2).limit(1);
  if (e1) console.error('import_batches ERR:', e1.message);
  if (ib1?.length) console.log('[import_batches] COLUMNS:', Object.keys(ib1[0]).join(', '));

  const { data: batches, error: e2 } = await sb.from('import_batches').select('id, status, file_name, created_at').eq('tenant_id', VLTEST2).order('created_at', { ascending: false });
  if (e2) console.error('batches ERR:', e2.message);
  console.log(`[import_batches] count: ${batches?.length}`);
  for (const b of batches ?? []) console.log(` - ${b.id} status=${b.status} file=${(b as any).file_name} created=${b.created_at}`);

  // committed_data per batch: one sample row each
  for (const b of batches ?? []) {
    const { data: rows } = await sb.from('committed_data').select('data_type, row_data, metadata, entity_id, period_id').eq('tenant_id', VLTEST2).eq('import_batch_id', b.id).limit(1);
    const { count } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', VLTEST2).eq('import_batch_id', b.id);
    if (!rows?.length) { console.log(`\n[batch ${b.id}] 0 committed rows (total=${count})`); continue; }
    const r: any = rows[0];
    console.log(`\n[batch ${b.id}] total rows=${count} data_type=${r.data_type} entity_id=${r.entity_id} period_id=${r.period_id}`);
    console.log('  row_data keys:', Object.keys(r.row_data ?? {}).join(', '));
    console.log('  row_data sample:', JSON.stringify(r.row_data).slice(0, 500));
    const md = r.metadata ?? {};
    console.log('  metadata keys:', Object.keys(md).join(', '));
    if (md.field_identities) console.log('  metadata.field_identities:', JSON.stringify(md.field_identities).slice(0, 800));
    else console.log('  metadata.field_identities: ABSENT');
    if (md.semantic_roles) console.log('  metadata.semantic_roles:', JSON.stringify(md.semantic_roles).slice(0, 800));
    else console.log('  metadata.semantic_roles: ABSENT');
    console.log('  metadata full sample:', JSON.stringify(md).slice(0, 900));
  }
}
main();
