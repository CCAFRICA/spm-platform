// OB-257 P0 probe: is summary_artifacts_fine.entity_id nullable? (read-only)
import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key);
async function main() {
  const { data: meta } = await sb.from('summary_artifacts_fine')
    .select('id, entity_id, sub_entity_id, summary_date, hour, period_id, data_type, row_count')
    .eq('data_type', 'patterns_meta').limit(2);
  console.log('patterns_meta rows:', JSON.stringify(meta, null, 1));
  const { data: staff } = await sb.from('summary_artifacts_fine')
    .select('id, entity_id, sub_entity_id, summary_date, hour, period_id, data_type')
    .eq('data_type', 'staff_rollup').limit(2);
  console.log('staff_rollup rows:', JSON.stringify(staff, null, 1));
  const { count: nullEnt } = await sb.from('summary_artifacts_fine')
    .select('id', { count: 'exact', head: true }).is('entity_id', null);
  console.log('rows with entity_id IS NULL:', nullEnt);
  const { count: nullSub } = await sb.from('summary_artifacts_fine')
    .select('id', { count: 'exact', head: true }).is('sub_entity_id', null);
  console.log('rows with sub_entity_id IS NULL:', nullSub);
}
main().catch(e => { console.error(e); process.exit(1); });
