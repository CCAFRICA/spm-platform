import { createClient } from '@supabase/supabase-js';
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
(async () => {
  const { data: cheques } = await svc.from('committed_data')
    .select('entity_id, row_data').eq('tenant_id', SABOR).eq('data_type', 'pos_cheque').limit(3);
  console.log('SAMPLE pos_cheque rows:');
  for (const c of cheques || []) console.log('  entity_id=', c.entity_id, '| row_data keys:', Object.keys((c.row_data as object) || {}).slice(0,8).join(','));
  // distinct entity_ids on cheques (sample) and their entity type/name
  const { data: many } = await svc.from('committed_data').select('entity_id').eq('tenant_id', SABOR).eq('data_type','pos_cheque').limit(5000);
  const ids = Array.from(new Set((many||[]).map(r => r.entity_id))).filter(Boolean);
  console.log('\ndistinct entity_id on cheques (sample of 5000 rows):', ids.length);
  const { data: ents } = await svc.from('entities').select('id, display_name, entity_type').in('id', ids.slice(0,50));
  const th: Record<string,number> = {};
  for (const e of ents||[]) th[String(e.entity_type)] = (th[String(e.entity_type)]||0)+1;
  console.log('  those entity_ids resolve to types:', JSON.stringify(th));
  for (const e of (ents||[]).slice(0,6)) console.log('   ', e.id, '|', e.display_name, '|', e.entity_type);
})().catch(e => { console.error(e); process.exit(1); });
