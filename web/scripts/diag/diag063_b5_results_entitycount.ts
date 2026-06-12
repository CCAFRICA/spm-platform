/**
 * DIAG-063 / B5 — Results dashboard entity-count correctness probe (READ-ONLY).
 *
 * Verifies, per recent calculation batch:
 *   1. calculation_batches.entity_count (the selector dropdown's source)
 *   2. exact head:true count of calculation_results rows (ground truth)
 *   3. row count returned by an UNPAGINATED .select('id') — the same query shape
 *      used by getCalculationResults() (calculation-service.ts:385-391) and
 *      loadResultsPageData() (results-loader.ts:148-152), whose .length is the
 *      "N entities" figure displayed on /operate/results and /operate/calculate.
 *
 * SELECT-only. No tenant names/slugs. Counts, UUIDs, statuses, timestamps only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: batches, error } = await supabase
    .from('calculation_batches')
    .select('id, tenant_id, period_id, lifecycle_state, entity_count, created_at')
    .order('entity_count', { ascending: false })
    .limit(8);
  if (error) throw error;

  console.log('batch_id | tenant_id | lifecycle | batches.entity_count | exact_results_count | unpaginated_select_len');
  for (const b of batches ?? []) {
    const { count: exactCount, error: cErr } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', b.id);
    if (cErr) throw cErr;

    // Same unpaginated shape as getCalculationResults / loadResultsPageData
    const { data: rows, error: rErr } = await supabase
      .from('calculation_results')
      .select('id')
      .eq('tenant_id', b.tenant_id)
      .eq('batch_id', b.id);
    if (rErr) throw rErr;

    console.log(
      `${b.id} | ${b.tenant_id} | ${b.lifecycle_state} | ${b.entity_count} | ${exactCount} | ${rows?.length ?? 0}`
    );
  }
}

main().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
