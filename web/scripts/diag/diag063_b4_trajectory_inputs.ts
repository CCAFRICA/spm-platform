/**
 * DIAG-063 / B4 — Trajectory input readiness (READ-ONLY)
 *
 * Verifies the live inputs loadTrajectoryData() depends on:
 *   calculation_batches (tenant_id, period_id) -> distinct calculated periods per tenant.
 * Stream page gate: trajectory renders only when snapshots >= 2 periods.
 *
 * Anonymization: tenant UUIDs only. Counts/identifiers only — no payout values.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: batches, error } = await supabase
    .from('calculation_batches')
    .select('tenant_id, period_id, lifecycle_state')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const perTenant = new Map<string, { batchCount: number; periods: Set<string> }>();
  for (const b of batches || []) {
    const t = perTenant.get(b.tenant_id) || { batchCount: 0, periods: new Set<string>() };
    t.batchCount++;
    t.periods.add(b.period_id);
    perTenant.set(b.tenant_id, t);
  }

  const { count: resultsCount, error: rcErr } = await supabase
    .from('calculation_results')
    .select('id', { count: 'exact', head: true });
  if (rcErr) throw rcErr;

  console.log(`calculation_batches rows fetched: ${(batches || []).length}`);
  console.log(`calculation_results total rows (head count): ${resultsCount}`);
  console.log('Per-tenant trajectory input readiness (gate: distinct calculated periods >= 2):');
  for (const [tenantId, t] of Array.from(perTenant.entries())) {
    console.log(
      `  tenant=${tenantId} batches=${t.batchCount} distinct_periods=${t.periods.size} trajectory_gate=${t.periods.size >= 2 ? 'PASS' : 'FAIL'}`
    );
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
