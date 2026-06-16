// OB-212 — resolve display names for the keystone BCL periods. READ-ONLY.
// Run: set -a && source .env.local && set +a && npx tsx scripts/ob212-period-names.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const A = '924cbece-d827-48bb-ae7f-62523edfbe98'; // expected (batch 6dde6d49)
const B = 'a8febd82-85fb-4f63-9e6e-4ba1c36f67aa'; // platform (batch 8f9bf397)

async function main() {
  const { data, error } = await sb.from('periods').select('*').in('id', [A, B]);
  if (error) { console.log('error:', error.message); process.exit(1); }
  console.log('periods columns:', data?.[0] ? Object.keys(data[0]).join(', ') : '(none)');
  for (const id of [A, B]) {
    const p: any = (data ?? []).find((r: any) => r.id === id);
    const role = id === A ? 'EXPECTED (924cbece / batch 6dde6d49)' : 'PLATFORM (a8febd82 / batch 8f9bf397)';
    if (!p) { console.log(`\n${role}: NOT FOUND`); continue; }
    console.log(`\n${role}`);
    console.log(`  label=${JSON.stringify(p.label)} name=${JSON.stringify(p.name)} canonical_key=${JSON.stringify(p.canonical_key)}`);
    console.log(`  start=${p.start_date} end=${p.end_date} status=${p.status}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
