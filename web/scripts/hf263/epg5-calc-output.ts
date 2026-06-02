// HF-263 EPG-5 — per-entity calc output for architect reconciliation. Run after a fresh 3-period calc.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data: batches } = await supabase.from('calculation_batches')
    .select('id, period_id, config').eq('tenant_id', TENANT).order('created_at', { ascending: false }).limit(3);
  if (!batches) { console.error('No batches'); return; }
  for (const batch of batches) {
    const periodLabel = (batch.config as Record<string, unknown>)?.periodLabel || batch.period_id;
    console.log(`\n=== Batch ${batch.id} period=${periodLabel} ===`);
    const { data: results } = await supabase.from('calculation_results')
      .select('entity_id, total_payout, components').eq('batch_id', batch.id);
    if (!results) continue;
    const { data: entities } = await supabase.from('entities').select('id, external_id').in('id', results.map(r => r.entity_id));
    const eMap = new Map((entities || []).map(e => [e.id, e.external_id]));
    let total = 0; const perEntity: Record<string, number> = {};
    const compTotals: Record<string, number> = {};
    for (const r of results) {
      const extId = eMap.get(r.entity_id) || r.entity_id;
      total += Number(r.total_payout); perEntity[extId] = Number(r.total_payout);
      for (const c of (r.components as Array<Record<string, unknown>> | null) || []) {
        const nm = String(c.componentName ?? c.name ?? '?'); compTotals[nm] = (compTotals[nm] || 0) + (Number(c.payout) || 0);
      }
    }
    console.log(`Entities: ${results.length}, Grand total: ${total}`);
    console.log(`componentTotals: ${JSON.stringify(compTotals)}`);
    console.log(`perEntityTotals: ${JSON.stringify(perEntity)}`);
  }
}
main().catch(console.error);
