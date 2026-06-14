import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false}});
  // roster source: entities (profile_id IS NULL) and their committed_data rows (entity_id linked)
  const { count: rosterCount } = await sb.from('entities').select('*',{count:'exact',head:true}).is('profile_id',null);
  console.log('entities WITHOUT profile (F11 roster) total:', rosterCount);
  // committed_data WHERE entity_id NOT NULL — the per-entity rows F11 would join to
  const { data: cd } = await sb.from('committed_data').select('data_type, row_data').not('entity_id','is',null).limit(2000);
  const byType: Record<string,number> = {}; const keyset = new Set<string>(); let emails=0;
  for (const r of (cd ?? [])) {
    byType[r.data_type as string] = (byType[r.data_type as string]??0)+1;
    for (const [k,v] of Object.entries((r.row_data as Record<string,unknown>)??{})) {
      keyset.add(k);
      if (typeof v==='string' && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) emails++;
    }
  }
  console.log('entity-linked committed_data rows:', cd?.length ?? 0, 'by type:', JSON.stringify(byType));
  console.log('  union of keys:', `[${Array.from(keyset).join(', ')}]`);
  console.log('  rows with an @-email VALUE:', emails);
  // broad: ANY @-email anywhere in committed_data (paginated sample across all)
  let anyEmail = 0;
  for (let p=0;p<5;p++){ const { data } = await sb.from('committed_data').select('row_data').range(p*1000,p*1000+999);
    for (const r of (data??[])) for (const v of Object.values((r.row_data as Record<string,unknown>)??{})) if (typeof v==='string'&&/@[^@\s]+\.[a-z]{2,}$/i.test(v)) anyEmail++;
    if (!data || data.length<1000) break; }
  console.log('\n@-email values across ~5000 committed_data rows:', anyEmail);
}
main().catch(e=>{console.error(e);process.exit(1);});
