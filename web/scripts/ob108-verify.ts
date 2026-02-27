/**
 * OB-108 Phase 2: Multi-tenant pipeline readiness verification
 * Verify the data behind the Pipeline Readiness Cockpit for each tenant.
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TENANTS = [
  { name: 'Optica Luminar', id: '9b2bb4e3-6828-4451-b3fb-dc384509494f' },
  { name: 'Caribe Financial Group', id: 'fa6a48c5-56dc-416d-9b7d-9c93d4882251' },
  { name: 'Pipeline Proof Co', id: 'dfc1041e-7c39-4657-81e5-40b1cea5680c' },
  { name: 'Pipeline Test Co', id: 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd' },
];

async function verify(name: string, tenantId: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name} (${tenantId})`);
  console.log('='.repeat(60));

  const [plans, entities, dataRows, periods, batches] = await Promise.all([
    sb.from('rule_sets').select('id, name, status').eq('tenant_id', tenantId).eq('status', 'active'),
    sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    sb.from('periods').select('id, label, start_date, end_date').eq('tenant_id', tenantId).order('start_date'),
    sb.from('calculation_batches').select('id, lifecycle_state, created_at, summary').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1),
  ]);

  const planList = plans.data ?? [];
  const entityCount = entities.count ?? 0;
  const dataCount = dataRows.count ?? 0;
  const periodList = periods.data ?? [];
  const batchList = batches.data ?? [];

  console.log(`\n  Plans: ${planList.length} active`);
  for (const p of planList) console.log(`    - ${p.name}`);
  console.log(`  Entities: ${entityCount.toLocaleString()}`);
  console.log(`  Data rows: ${dataCount.toLocaleString()}`);
  console.log(`  Periods: ${periodList.length}`);
  for (const p of periodList) console.log(`    - ${p.label || p.start_date}`);
  console.log(`  Calculation batches: ${batchList.length}`);
  if (batchList.length > 0) {
    const b = batchList[0];
    console.log(`    Latest: ${b.lifecycle_state} on ${b.created_at}`);
    const summary = b.summary as Record<string, unknown> | null;
    if (summary) {
      const tp = typeof summary.total_payout === 'number' ? summary.total_payout
        : typeof summary.totalPayout === 'number' ? summary.totalPayout : 0;
      console.log(`    Total payout: ${Number(tp).toLocaleString()}`);
    }
  }

  // Expected pipeline status
  const hasPlan = planList.length > 0;
  const hasRoster = entityCount > 0;
  const hasData = dataCount > 0;
  const hasCalc = batchList.length > 0;

  console.log(`\n  Pipeline Readiness:`);
  console.log(`    Plans:     ${hasPlan ? 'COMPLETE' : 'NEEDED'}`);
  console.log(`    Roster:    ${hasRoster ? 'COMPLETE' : 'NEEDED'}`);
  console.log(`    Data:      ${hasData ? 'COMPLETE' : 'NEEDED'}`);
  console.log(`    Calculate: ${hasCalc ? 'COMPLETE' : (hasData ? 'READY' : 'BLOCKED')}`);

  const nextAction = !hasPlan ? 'Import Your First Plan'
    : entityCount === 0 ? 'Import Roster'
    : dataCount === 0 ? 'Import Transaction Data'
    : !hasCalc ? 'Run First Calculation'
    : 'View Latest Results';
  console.log(`    Quick Action: "${nextAction}"`);
}

async function run() {
  for (const t of TENANTS) {
    await verify(t.name, t.id);
  }
}

run().catch(console.error);
