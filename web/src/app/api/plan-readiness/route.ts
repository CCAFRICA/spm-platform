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

  // Fetch active rule sets
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name')
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

  // Fetch input bindings (check if any derivations exist per plan)
  const { data: bindings } = await supabase
    .from('input_bindings')
    .select('rule_set_id, derivations')
    .eq('tenant_id', tenantId);

  const bindingsByPlan = new Map<string, boolean>();
  for (const b of bindings || []) {
    const derivations = b.derivations as unknown[];
    if (Array.isArray(derivations) && derivations.length > 0) {
      bindingsByPlan.set(b.rule_set_id, true);
    }
  }

  // Fetch committed data row count
  const { count: dataRowCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // Fetch most recent batch per plan
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('rule_set_id, created_at, total_payout')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const latestBatchByPlan = new Map<string, { date: string; total: number }>();
  for (const b of batches || []) {
    if (!latestBatchByPlan.has(b.rule_set_id)) {
      latestBatchByPlan.set(b.rule_set_id, {
        date: b.created_at,
        total: b.total_payout || 0,
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
