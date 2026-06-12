/**
 * DIAG-063 / B2 — Individual commission statements: data-source verification.
 * READ-ONLY. Structural output only: counts, UUIDs, statuses, timestamps, JSON key shapes.
 * No payout values, no tenant names, no row_data values.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1. Aggregate counts for the statement page's data sources
  const [batches, results, scopes] = await Promise.all([
    supabase.from('calculation_batches').select('*', { count: 'exact', head: true }),
    supabase.from('calculation_results').select('*', { count: 'exact', head: true }),
    supabase.from('profile_scope').select('*', { count: 'exact', head: true }),
  ]);
  console.log('calculation_batches count:', batches.count, batches.error?.message ?? '');
  console.log('calculation_results count:', results.count, results.error?.message ?? '');
  console.log('profile_scope count:', scopes.count, scopes.error?.message ?? '');

  // 2. Replicate the statements page query path: latest batch -> one result -> components shape
  const { data: latestBatches, error: bErr } = await supabase
    .from('calculation_batches')
    .select('id, tenant_id, period_id, lifecycle_state, entity_count, created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (bErr || !latestBatches?.length) {
    console.log('latest batch error:', bErr?.message ?? 'none found');
    return;
  }
  const b = latestBatches[0];
  console.log('latest batch:', JSON.stringify({
    id: b.id, tenant_id: b.tenant_id, period_id: b.period_id,
    lifecycle_state: b.lifecycle_state, entity_count: b.entity_count, created_at: b.created_at,
  }));

  const { data: oneResult, error: rErr } = await supabase
    .from('calculation_results')
    .select('id, entity_id, components')
    .eq('batch_id', b.id)
    .limit(1);
  if (rErr || !oneResult?.length) {
    console.log('result fetch error:', rErr?.message ?? 'no results in latest batch');
    return;
  }
  const r = oneResult[0];
  const comps = Array.isArray(r.components) ? (r.components as Record<string, unknown>[]) : [];
  console.log('one result:', JSON.stringify({ id: r.id, entity_id: r.entity_id, componentCount: comps.length }));
  comps.forEach((c, i) => {
    console.log(`component[${i}] keys:`, Object.keys(c).sort().join(','),
      '| componentType:', String(c.componentType ?? 'absent'),
      '| has componentName:', 'componentName' in c,
      '| has payout:', 'payout' in c);
  });

  // 3. Role distribution among profiles (statuses only — bears on rep-scoping)
  const { data: roleRows, error: pErr } = await supabase.from('profiles').select('role');
  if (pErr) { console.log('profiles error:', pErr.message); return; }
  const dist: Record<string, number> = {};
  for (const row of roleRows ?? []) dist[row.role] = (dist[row.role] ?? 0) + 1;
  console.log('profiles role distribution:', JSON.stringify(dist));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
