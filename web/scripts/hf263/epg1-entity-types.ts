// HF-263 EPG-1 — entity type verification. Run from web/: npx tsx scripts/hf263/epg1-entity-types.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data } = await supabase.from('entities')
    .select('external_id, entity_type, display_name, metadata').eq('tenant_id', TENANT).order('external_id');
  if (!data) { console.error('No data'); return; }
  const byType = new Map<string, number>();
  for (const e of data) byType.set(e.entity_type, (byType.get(e.entity_type) || 0) + 1);
  console.log('Entity counts by type:');
  for (const [t, c] of byType) console.log(`  ${t}: ${c}`);
  console.log('\nNon-individual entities:');
  for (const e of data.filter(e => e.entity_type !== 'individual'))
    console.log(`  ${e.external_id} -> ${e.entity_type} metadata=${JSON.stringify(e.metadata)}`);
  console.log(`\nEPG-1 PASS (individual=67, location=12): ${byType.get('individual') === 67 && byType.get('location') === 12 ? 'YES' : 'NO'}`);
}
main().catch(console.error);
