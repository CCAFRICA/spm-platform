/**
 * DIAG-063 / C2 — Adjustments & exception approval (READ-ONLY)
 *
 * SELECT-only probe:
 *  1. disputes table: row counts by status / category / tenant UUID (no amounts,
 *     no descriptions, no names — identifiers, statuses, timestamps only).
 *  2. approval_requests table: row counts by request_type / status.
 *  3. audit_logs: counts of approval.* actions; counts of any action containing
 *     'dispute' or 'adjust' (expected 0 per code review).
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function tally<T extends string>(rows: Record<string, unknown>[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = String(r[key] ?? 'NULL');
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}

async function main() {
  // 1. disputes
  const { data: disputes, error: dErr, count: dCount } = await supabase
    .from('disputes')
    .select('id, tenant_id, status, category, period_id, batch_id, filed_by, resolved_by, created_at, resolved_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (dErr) {
    console.log('disputes ERROR:', dErr.message);
  } else {
    console.log('disputes total count:', dCount);
    console.log('disputes by status:', JSON.stringify(tally(disputes!, 'status')));
    console.log('disputes by category:', JSON.stringify(tally(disputes!, 'category')));
    console.log('disputes by tenant_id (UUID):', JSON.stringify(tally(disputes!, 'tenant_id')));
    const withFiler = disputes!.filter(d => d.filed_by !== null).length;
    const withResolver = disputes!.filter(d => d.resolved_by !== null).length;
    const withBatch = disputes!.filter(d => d.batch_id !== null).length;
    const withPeriod = disputes!.filter(d => d.period_id !== null).length;
    console.log(`disputes field coverage: filed_by=${withFiler}, resolved_by=${withResolver}, batch_id=${withBatch}, period_id=${withPeriod} of ${disputes!.length}`);
    for (const d of disputes!.slice(0, 5)) {
      console.log(`  sample: id=${d.id} status=${d.status} category=${d.category} created_at=${d.created_at} resolved_at=${d.resolved_at}`);
    }
  }

  // 2. approval_requests
  const { data: approvals, error: aErr, count: aCount } = await supabase
    .from('approval_requests')
    .select('id, tenant_id, request_type, status, batch_id, requested_at, decided_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (aErr) {
    console.log('approval_requests ERROR:', aErr.message);
  } else {
    console.log('approval_requests total count:', aCount);
    console.log('approval_requests by request_type:', JSON.stringify(tally(approvals!, 'request_type')));
    console.log('approval_requests by status:', JSON.stringify(tally(approvals!, 'status')));
    for (const a of approvals!.slice(0, 5)) {
      console.log(`  sample: id=${a.id} type=${a.request_type} status=${a.status} requested_at=${a.requested_at} decided_at=${a.decided_at}`);
    }
  }

  // 3. audit_logs action coverage
  const probes: Array<[string, string]> = [
    ['approval.%', 'approval.* actions'],
    ['%dispute%', 'actions containing dispute'],
    ['%adjust%', 'actions containing adjust'],
  ];
  for (const [pattern, label] of probes) {
    const { count, error } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .like('action', pattern);
    // NOTE: pattern contains '%' — keep it out of the first console.log arg
    // to avoid printf-style format-specifier interpretation (%d).
    console.log('audit_logs ' + label + ' pattern=' + JSON.stringify(pattern) + ' count=' + (error ? 'ERROR ' + error.message : String(count)));
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
