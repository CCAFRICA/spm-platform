import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const { data } = await sb.from('processing_jobs')
    .select('file_name, recognition_tier, classification_result, proposal')
    .eq('tenant_id', '5b078b52-55c9-4612-8f86-96038c198bfe')
    .ilike('file_name', '%Datos%').order('created_at',{ascending:false}).limit(1);
  const j = data?.[0]; if (!j) { console.log('none'); return; }
  console.log('file:', j.file_name, 'tier:', j.recognition_tier);
  console.log('\n=== classification_result (full) ===');
  console.log(JSON.stringify(j.classification_result, null, 1).slice(0, 2200));
  console.log('\n=== proposal keys ===', j.proposal ? Object.keys(j.proposal) : null);
  const cu = j.classification_result?.contentUnits?.[0] ?? j.proposal?.contentUnits?.[0];
  if (cu) console.log('\n=== contentUnit[0] full (the classification decision record) ===\n', JSON.stringify(cu, null, 1).slice(0, 3500));
}
main();
