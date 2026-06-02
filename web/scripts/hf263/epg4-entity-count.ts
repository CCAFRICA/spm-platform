// HF-263 EPG-4 — calc entity-count verification (no hub payees). Run after a fresh calc.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data } = await supabase.from('calculation_results').select('entity_id, total_payout')
    .eq('tenant_id', TENANT).order('created_at', { ascending: false }).limit(300);
  if (!data) { console.error('No results'); return; }
  const ids = new Set(data.map(r => r.entity_id));
  console.log(`Distinct entities in latest calc results: ${ids.size}`);
  const { data: entities } = await supabase.from('entities').select('id, external_id, entity_type').in('id', Array.from(ids));
  const hubs = (entities || []).filter(e => e.entity_type !== 'individual');
  console.log(`Non-individual entities in calc results: ${hubs.length}`);
  for (const h of hubs) console.log(`  SPURIOUS: ${h.external_id} (${h.entity_type})`);
  console.log(`\nEPG-4 PASS (entities=67, hubs=0): ${ids.size === 67 && hubs.length === 0 ? 'YES' : 'NO'}`);
}
main().catch(console.error);
