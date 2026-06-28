import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
(async () => {
  // classification_signals carrying header_comprehension, per sheet
  const { data: cs } = await sb.from('classification_signals').select('sheet_name, signal_type, header_comprehension').eq('tenant_id', R).not('header_comprehension', 'is', null).limit(50);
  const bySheet = new Map<string, any>();
  for (const s of cs ?? []) { if (s.sheet_name && !bySheet.has(s.sheet_name)) bySheet.set(s.sheet_name, s.header_comprehension); }
  console.log('=== sheets with header_comprehension:', Array.from(bySheet.keys()).join(', '));
  const jer = bySheet.get('Jerarquia');
  if (jer) {
    console.log('\n=== Jerarquia header_comprehension keys:', Object.keys(jer));
    const interps = jer.interpretations ?? jer;
    console.log('interpretations type:', Array.isArray(interps) ? 'array' : typeof interps);
    const entries = interps && typeof interps === 'object' ? (Array.isArray(interps) ? interps : Object.entries(interps)) : [];
    for (const e of entries.slice(0, 10)) {
      const [col, v] = Array.isArray(e) ? e : [e.columnName ?? e.field, e];
      console.log(`  ${col}: identifies="${v.identifies ?? ''}" data_nature="${(v.data_nature ?? v.characterization ?? '').slice(0,60)}" conf=${v.confidence}`);
    }
  } else {
    console.log('\nNo Jerarquia HC in classification_signals. Sample signal shape:');
    console.log(JSON.stringify((cs ?? [])[0], null, 1)?.slice(0, 800));
  }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
