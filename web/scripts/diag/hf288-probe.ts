import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false}});
  const { data: sigs } = await sb.from('classification_signals').select('tenant_id, sheet_name, header_comprehension').not('header_comprehension','is',null).limit(800);
  let found = 0; const examples: string[] = [];
  for (const s of (sigs ?? [])) {
    const hc = s.header_comprehension as Record<string, {semanticMeaning?:string; columnRole?:string}> | null;
    if (!hc || typeof hc !== 'object') continue;
    for (const [col, meta] of Object.entries(hc)) {
      const sm = (meta?.semanticMeaning ?? '').toLowerCase();
      const cr = (meta?.columnRole ?? '').toLowerCase();
      if (sm.includes('email') || sm.includes('correo') || cr.includes('email')) {
        found++; if (examples.length < 8) examples.push(`  col="${col}" semanticMeaning="${meta.semanticMeaning}" columnRole="${meta.columnRole}" tenant=${String(s.tenant_id).slice(0,8)} sheet=${s.sheet_name}`);
      }
    }
  }
  console.log(`classification_signals scanned=${sigs?.length ?? 0} ; email-semantic columns found=${found}`);
  examples.forEach(e => console.log(e));
  const { data: cd } = await sb.from('committed_data').select('data_type, entity_id, row_data').not('entity_id','is',null).limit(4);
  console.log('\n=== committed_data sample (entity_id → row_data keys) ===');
  for (const r of (cd ?? [])) console.log(`  data_type=${r.data_type} keys=[${Object.keys((r.row_data as object) ?? {}).join(', ')}]`);
}
main().catch(e=>{console.error(e);process.exit(1);});
