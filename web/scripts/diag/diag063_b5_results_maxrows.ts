/**
 * DIAG-063 / B5 — supplementary probe (READ-ONLY).
 *
 * (a) Measures the PostgREST max-rows ceiling that applies to any UNPAGINATED
 *     .select() (the query shape used by getCalculationResults and
 *     loadResultsPageData): exact head:true count of committed_data vs the
 *     row count actually returned by an unpaginated select on the same table.
 * (b) Inspects the supersede/lifecycle fields of the batch whose
 *     entity_count (85) diverged from its actual results count (0).
 *
 * SELECT-only. Counts, UUIDs, statuses, timestamps only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // (a) max-rows ceiling
  const { count: exact, error: e1 } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true });
  if (e1) throw e1;
  const { data: rows, error: e2 } = await supabase
    .from('committed_data')
    .select('id');
  if (e2) throw e2;
  console.log(`committed_data exact count: ${exact}`);
  console.log(`committed_data unpaginated select returned: ${rows?.length ?? 0} rows`);

  // (b) the divergent batch
  const { data: b, error: e3 } = await supabase
    .from('calculation_batches')
    .select('id, tenant_id, lifecycle_state, entity_count, superseded_by, supersedes, started_at, completed_at, created_at')
    .eq('id', '883f7052-d180-4ae4-8150-bc4d2471b96e')
    .maybeSingle();
  if (e3) throw e3;
  console.log('divergent batch:', JSON.stringify(b, null, 2));
}

main().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
