// OB-213 3B/3C — verify the two flagged tables/cols (ingestion_events; tenants label cols). READ-ONLY.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const ie = await sb.from('ingestion_events').select('*').limit(1);
  console.log('ingestion_events:', ie.error ? `MISSING (${ie.error.code})` : `EXISTS (rows: ${ie.data?.length})`);
  const t = await sb.from('tenants').select('*').limit(1);
  const cols = t.data?.[0] ? Object.keys(t.data[0]) : [];
  console.log('tenants has hierarchy_labels:', cols.includes('hierarchy_labels'), '| entity_type_labels:', cols.includes('entity_type_labels'));
}
main().catch((e) => { console.error(e); process.exit(1); });
