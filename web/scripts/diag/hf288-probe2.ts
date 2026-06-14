import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false}});
  // committed_data data_type distribution
  const { data: cd } = await sb.from('committed_data').select('data_type, entity_id, row_data').limit(5000);
  const byType: Record<string, number> = {}; const keysByType: Record<string, Set<string>> = {};
  let emailish = 0; const emailKeys = new Set<string>(); const emailSamples: string[] = [];
  for (const r of (cd ?? [])) {
    const t = r.data_type as string; byType[t] = (byType[t]??0)+1;
    if (!keysByType[t]) keysByType[t] = new Set();
    const rd = (r.row_data as Record<string,unknown>) ?? {};
    for (const [k,v] of Object.entries(rd)) {
      keysByType[t].add(k);
      // structural: a value that is an @-pattern string = an actual email value present in the data
      if (typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) { emailish++; emailKeys.add(k); if (emailSamples.length<5) emailSamples.push(`  key="${k}" value=<redacted email> type=${t}`); }
    }
  }
  console.log('committed_data rows scanned:', cd?.length ?? 0);
  console.log('data_type distribution:', JSON.stringify(byType));
  for (const [t, ks] of Object.entries(keysByType)) console.log(`  ${t} keys: [${Array.from(ks).join(', ')}]`);
  console.log(`\nrows with an @-email VALUE in row_data: ${emailish} ; keys carrying emails: [${Array.from(emailKeys).join(', ')}]`);
  emailSamples.forEach(s=>console.log(s));
  // classification_signals header_comprehension presence
  const { count: total } = await sb.from('classification_signals').select('*',{count:'exact',head:true});
  const { data: hcRows } = await sb.from('classification_signals').select('header_comprehension').limit(2000);
  const withHc = (hcRows ?? []).filter(r => r.header_comprehension && typeof r.header_comprehension==='object' && Object.keys(r.header_comprehension as object).length>0).length;
  console.log(`\nclassification_signals total=${total} ; with non-empty header_comprehension=${withHc}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
