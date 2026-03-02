/**
 * OB-125: Plan Readiness API — returns per-plan readiness status
 * GET /api/plan-readiness?tenantId=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }

  // Fetch active rule sets (include input_bindings JSONB for binding check)
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (!ruleSets || ruleSets.length === 0) {
    return NextResponse.json({ plans: [] });
  }

  // Fetch assignments per plan
  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('rule_set_id')
    .eq('tenant_id', tenantId);

  const assignCountByPlan = new Map<string, number>();
  for (const a of assignments || []) {
    assignCountByPlan.set(a.rule_set_id, (assignCountByPlan.get(a.rule_set_id) || 0) + 1);
  }

  // Check bindings from rule_sets.input_bindings JSONB column
  // The engine can auto-resolve metrics via buildMetricsForComponent() when
  // committed_data exists, even without explicit metric_derivations.
  const bindingsByPlan = new Map<string, boolean>();
  for (const rs of ruleSets) {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    if (bindings && Object.keys(bindings).length > 0) {
      const md = bindings.metric_derivations;
      if (Array.isArray(md) && md.length > 0) {
        bindingsByPlan.set(rs.id, true);
      } else if (Object.keys(bindings).length > 0) {
        // Non-empty bindings in alternative format (named keys)
        bindingsByPlan.set(rs.id, true);
      }
    }
  }

  // Fetch committed data row count
  const { count: dataRowCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // When committed_data exists, the engine can auto-resolve metrics for any plan
  // without explicit input_bindings (via buildMetricsForComponent token matching).
  const hasDataForAutoResolve = (dataRowCount || 0) > 0;
  if (hasDataForAutoResolve) {
    for (const rs of ruleSets) {
      if (!bindingsByPlan.has(rs.id)) {
        bindingsByPlan.set(rs.id, true);
      }
    }
  }

  // Fetch most recent batch per plan (summary JSONB, not top-level total_payout)
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('rule_set_id, created_at, summary')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const latestBatchByPlan = new Map<string, { date: string; total: number }>();
  for (const b of batches || []) {
    if (!latestBatchByPlan.has(b.rule_set_id)) {
      const summary = b.summary as Record<string, unknown> | null;
      latestBatchByPlan.set(b.rule_set_id, {
        date: b.created_at,
        total: (summary?.totalPayout as number) || (summary?.total_payout as number) || 0,
      });
    }
  }

  // Build readiness per plan
  const plans = ruleSets.map(rs => {
    const latest = latestBatchByPlan.get(rs.id);
    return {
      planId: rs.id,
      planName: rs.name,
      entityCount: assignCountByPlan.get(rs.id) || 0,
      hasBindings: bindingsByPlan.get(rs.id) || false,
      dataRowCount: dataRowCount || 0,
      lastBatchDate: latest?.date || null,
      lastTotal: latest?.total ?? null,
    };
  });

  return NextResponse.json({ plans });
}
