// OB-136 Phase 2 — verify plan-readiness logic after phantom table fix
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function run() {
  const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

  // Replicate the FIXED plan-readiness logic
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', PTC)
    .eq('status', 'active');

  if (!ruleSets || ruleSets.length === 0) {
    console.log('No active rule sets for PTC');
    return;
  }

  const { data: assignments } = await sb.from('rule_set_assignments')
    .select('rule_set_id')
    .eq('tenant_id', PTC);

  const assignCountByPlan = new Map<string, number>();
  for (const a of assignments || []) {
    assignCountByPlan.set(a.rule_set_id, (assignCountByPlan.get(a.rule_set_id) || 0) + 1);
  }

  // Check bindings from rule_sets.input_bindings JSONB
  const bindingsByPlan = new Map<string, boolean>();
  for (const rs of ruleSets) {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    if (bindings && Object.keys(bindings).length > 0) {
      const md = bindings.metric_derivations;
      if (Array.isArray(md) && md.length > 0) {
        bindingsByPlan.set(rs.id, true);
        console.log(`  ${rs.name}: explicit metric_derivations (${md.length})`);
      } else if (Object.keys(bindings).length > 0) {
        bindingsByPlan.set(rs.id, true);
        console.log(`  ${rs.name}: named-key bindings`);
      }
    }
  }

  const { count: dataRowCount } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', PTC);

  const hasDataForAutoResolve = (dataRowCount || 0) > 0;
  if (hasDataForAutoResolve) {
    for (const rs of ruleSets) {
      if (!bindingsByPlan.has(rs.id)) {
        bindingsByPlan.set(rs.id, true);
        console.log(`  ${rs.name}: auto-resolve (committed_data exists: ${dataRowCount} rows)`);
      }
    }
  }

  const { data: batches } = await sb.from('calculation_batches')
    .select('rule_set_id, created_at, summary')
    .eq('tenant_id', PTC)
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

  console.log('\n=== PLAN READINESS (FIXED) ===');
  for (const rs of ruleSets) {
    const latest = latestBatchByPlan.get(rs.id);
    const plan = {
      planId: rs.id,
      planName: rs.name,
      entityCount: assignCountByPlan.get(rs.id) || 0,
      hasBindings: bindingsByPlan.get(rs.id) || false,
      dataRowCount: dataRowCount || 0,
      lastBatchDate: latest?.date || null,
      lastTotal: latest?.total ?? null,
    };
    const isReady = plan.entityCount > 0 && plan.hasBindings && plan.dataRowCount > 0;
    console.log('Plan:', plan.planName);
    console.log('  entityCount:', plan.entityCount);
    console.log('  hasBindings:', plan.hasBindings, plan.hasBindings ? '✅' : '❌');
    console.log('  dataRowCount:', plan.dataRowCount);
    console.log('  isReady:', isReady, isReady ? '✅ CALCULATE BUTTON ENABLED' : '❌ STILL BLOCKED');
    console.log('  lastBatch:', plan.lastBatchDate);
    console.log('  lastTotal:', plan.lastTotal);
    console.log('');
  }

  // Also check LAB to make sure we don't break working tenants
  const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
  const { data: labRS } = await sb.from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  const { count: labData } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);

  const { count: labAssign } = await sb.from('rule_set_assignments')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);

  console.log('=== LAB READINESS (REGRESSION CHECK) ===');
  for (const rs of labRS || []) {
    const b = rs.input_bindings as Record<string, unknown> | null;
    const hasMd = Array.isArray((b as any)?.metric_derivations) && (b as any).metric_derivations.length > 0;
    const hasKeys = b && Object.keys(b).length > 0;
    const hasBindings = hasMd || hasKeys || (labData || 0) > 0;
    const isReady = (labAssign || 0) > 0 && hasBindings && (labData || 0) > 0;
    console.log('Plan:', rs.name);
    console.log('  assignments:', labAssign);
    console.log('  hasBindings:', hasBindings, hasBindings ? '✅' : '❌');
    console.log('  dataRows:', labData);
    console.log('  isReady:', isReady, isReady ? '✅' : '❌');
  }
}

run().catch(console.error);
