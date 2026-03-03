/**
 * OB-146 Phase 6: Engine Contract Verification
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase6-engine-contract.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 6: ENGINE CONTRACT VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%')
    .limit(1)
    .single();

  if (!tenant) { console.error('No optica tenant'); process.exit(1); }

  const tid = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenant.slug})\n`);

  // Entity count
  const { count: entityCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  // Period count
  const { count: periodCount } = await supabase
    .from('periods')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  // Active plans
  const { count: activePlans } = await supabase
    .from('rule_sets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .eq('status', 'active');

  // Assignments
  const { count: assignmentCount } = await supabase
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  // Bound data rows (entity_id NOT NULL, period_id NOT NULL)
  const { count: boundData } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null);

  // Store data rows (entity_id IS NULL, period_id NOT NULL)
  const { count: storeData } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .is('entity_id', null)
    .not('period_id', 'is', null);

  // Result count
  const { count: resultCount } = await supabase
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid);

  // Total payout
  const PAGE_SIZE = 1000;
  let totalPayout = 0;
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', tid)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    totalPayout += data.reduce((s, r) => s + (r.total_payout || 0), 0);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log('ENGINE CONTRACT — OB-146 Phase 6');
  console.log('─────────────────────────────────────────');
  console.log(`entity_count:        ${entityCount}`);
  console.log(`period_count:        ${periodCount}`);
  console.log(`active_plans:        ${activePlans}`);
  console.log(`assignment_count:    ${assignmentCount}`);
  console.log(`bound_data_rows:     ${boundData}`);
  console.log(`store_data_rows:     ${storeData}`);
  console.log(`result_count:        ${resultCount}`);
  console.log(`total_payout:        MX$${totalPayout.toLocaleString()}`);
  console.log('─────────────────────────────────────────');

  // Entity store metadata coverage
  let hasStoreCount = 0;
  let entPage = 0;
  while (true) {
    const from = entPage * PAGE_SIZE;
    const { data } = await supabase
      .from('entities')
      .select('metadata')
      .eq('tenant_id', tid)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      if (meta.store_id) hasStoreCount++;
    }
    if (data.length < PAGE_SIZE) break;
    entPage++;
  }

  console.log(`\nStore metadata: ${hasStoreCount} / ${entityCount} entities have store_id`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PG-06: Engine Contract verification complete');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
