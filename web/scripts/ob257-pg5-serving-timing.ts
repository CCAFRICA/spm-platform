// OB-257 PG-5 evidence (serving-layer half): time the exact reads /api/revenue/data performs for
// mode=pulse on repeat encounters — materialization-speed (few-row rollup reads), no recomputation.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function pulseReads() {
  const t0 = Date.now();
  const [{ data: rollups }, { data: periods }] = await Promise.all([
    sb.from('summary_rollups').select('data_type, period_id, entity_id, dimension_role, dimension_member, metrics, row_count')
      .eq('tenant_id', BCL).in('data_type', ['revenue_period', 'revenue_meta']).order('id'),
    sb.from('periods').select('id, label, canonical_key, start_date, end_date, status').eq('tenant_id', BCL),
  ]);
  return { ms: Date.now() - t0, rollupRows: rollups?.length ?? 0, periodRows: periods?.length ?? 0 };
}
async function main() {
  for (let i = 1; i <= 3; i++) console.log(`pulse serving reads, encounter ${i}:`, JSON.stringify(await pulseReads()));
}
main().catch(e => { console.error(e); process.exit(1); });
