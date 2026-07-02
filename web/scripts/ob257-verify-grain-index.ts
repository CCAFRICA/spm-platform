// Verify the unique grain index exists by attempting a duplicate-detecting probe (read-only heuristic):
// PostgREST can't list indexes; instead verify the table accepts a select with all grain columns.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { error } = await sb.from('summary_rollups')
    .select('tenant_id, data_type, period_id, entity_id, dimension_role, dimension_member, metrics, row_count, computed_at')
    .limit(1);
  console.log(error ? 'COLUMN PROBE ERROR: ' + error.message : 'all summary_rollups columns present (grain + metrics + computed_at)');
}
main().catch(e => { console.error(e); process.exit(1); });
