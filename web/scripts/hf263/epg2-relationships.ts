// HF-263 EPG-2 — relationship verification. Run from web/: npx tsx scripts/hf263/epg2-relationships.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data } = await supabase.from('entity_relationships')
    .select('source_entity_id, target_entity_id, relationship_type, confidence').eq('tenant_id', TENANT);
  if (!data) { console.error('No data'); return; }
  console.log(`Total relationships: ${data.length}`);
  const ids = new Set<string>(); for (const r of data) { ids.add(r.source_entity_id); ids.add(r.target_entity_id); }
  const { data: entities } = await supabase.from('entities').select('id, external_id, entity_type').in('id', Array.from(ids));
  const eMap = new Map((entities || []).map(e => [e.id, e]));
  console.log('\nSample (first 10):');
  for (const r of data.slice(0, 10)) {
    const s = eMap.get(r.source_entity_id), t = eMap.get(r.target_entity_id);
    console.log(`  ${s?.external_id}(${s?.entity_type}) -> ${r.relationship_type} -> ${t?.external_id}(${t?.entity_type})`);
  }
  const byTarget = new Map<string, number>();
  for (const r of data) { const t = eMap.get(r.target_entity_id)?.external_id || '?'; byTarget.set(t, (byTarget.get(t) || 0) + 1); }
  console.log('\nPer hub:'); for (const [h, c] of Array.from(byTarget).sort()) console.log(`  ${h}: ${c}`);
  console.log(`\nEPG-2 PASS (total=67, 12 hubs): ${data.length === 67 && byTarget.size === 12 ? 'YES' : 'NO'}`);
}
main().catch(console.error);
