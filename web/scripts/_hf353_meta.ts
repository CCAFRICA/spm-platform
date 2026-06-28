import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
(async () => {
  const { data } = await sb.from('committed_data').select('row_data, entity_id, metadata').eq('tenant_id', R).eq('data_type', 'entity').limit(80);
  const jer = (data ?? []).filter(r => (r.row_data as any)?._sheetName === 'Jerarquia');
  console.log(`Jerarquia rows: ${jer.length}`);
  const r0 = jer.find(r => /Veronica|Claudia/.test(JSON.stringify(r.row_data))) ?? jer[1];
  const md = r0?.metadata as any;
  console.log('entity_id:', r0?.entity_id);
  console.log('metadata.entity_id_field:', md?.entity_id_field);
  console.log('metadata keys:', Object.keys(md ?? {}));
  console.log('field_identities:', JSON.stringify(md?.field_identities, null, 1)?.slice(0, 900));
  console.log('semantic_roles:', JSON.stringify(md?.semantic_roles, null, 1)?.slice(0, 600));
  // entities for resolution: external_id + display_name
  const { data: ents } = await sb.from('entities').select('external_id, display_name').eq('tenant_id', R).limit(80);
  console.log('\nsample entities (external_id / display_name):');
  for (const e of (ents ?? []).slice(0,6)) console.log(`  ${e.external_id} / ${e.display_name}`);
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
