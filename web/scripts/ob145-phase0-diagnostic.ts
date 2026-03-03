/**
 * OB-145 Phase 0: Diagnostic — Engine Contract + Data Shape
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob145-phase0-diagnostic.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug')
    .like('slug', '%optica%')
    .limit(1)
    .single();

  if (!tenant) {
    console.log('No optica tenant found');
    return;
  }

  const t = tenant.id;
  console.log('Tenant:', tenant.slug, t);

  // ═══ ENGINE CONTRACT ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('ENGINE CONTRACT VERIFICATION');
  console.log('═══════════════════════════════════════════════');

  const [entities, periods, ruleSets, assignments, boundData, resultCount] = await Promise.all([
    supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', t),
    supabase.from('periods').select('id', { count: 'exact', head: true }).eq('tenant_id', t),
    supabase.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('status', 'active'),
    supabase.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', t),
    supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t).not('entity_id', 'is', null).not('period_id', 'is', null),
    supabase.from('calculation_results').select('id', { count: 'exact', head: true }).eq('tenant_id', t),
  ]);

  const { data: payoutRows } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('tenant_id', t);
  const totalPayout = (payoutRows || []).reduce((s: number, r: { total_payout: number }) => s + (r.total_payout || 0), 0);

  console.log(`entity_count:       ${entities.count}`);
  console.log(`period_count:       ${periods.count}`);
  console.log(`active_plans:       ${ruleSets.count}`);
  console.log(`assignment_count:   ${assignments.count}`);
  console.log(`bound_data_rows:    ${boundData.count}`);
  console.log(`result_count:       ${resultCount.count}`);
  console.log(`total_payout:       ${totalPayout}`);

  // ═══ DATA SHAPE: calculation_results ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('DATA SHAPE: calculation_results (sample 2)');
  console.log('═══════════════════════════════════════════════');

  const { data: sampleResults } = await supabase
    .from('calculation_results')
    .select('id, entity_id, period_id, rule_set_id, batch_id, total_payout, components, attainment, metadata, metrics')
    .eq('tenant_id', t)
    .gt('total_payout', 0)
    .limit(2);

  for (const r of sampleResults || []) {
    console.log('\n--- Result ---');
    console.log(`  id: ${r.id}`);
    console.log(`  entity_id: ${r.entity_id}`);
    console.log(`  total_payout: ${r.total_payout}`);
    console.log(`  components: ${JSON.stringify(r.components, null, 2).substring(0, 1000)}`);
    console.log(`  attainment: ${JSON.stringify(r.attainment)}`);
    console.log(`  metadata: ${JSON.stringify(r.metadata)}`);
    console.log(`  metrics: ${JSON.stringify(r.metrics)?.substring(0, 500)}`);
  }

  // ═══ DATA SHAPE: entities ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('DATA SHAPE: entities (sample 5)');
  console.log('═══════════════════════════════════════════════');

  const { data: sampleEntities } = await supabase
    .from('entities')
    .select('id, external_id, display_name, metadata, entity_type')
    .eq('tenant_id', t)
    .limit(5);

  for (const e of sampleEntities || []) {
    console.log(`  ${e.external_id} | ${e.display_name} | type=${e.entity_type} | meta=${JSON.stringify(e.metadata)?.substring(0, 200)}`);
  }

  // ═══ STORE DISTRIBUTION ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('STORE DISTRIBUTION (from entities metadata)');
  console.log('═══════════════════════════════════════════════');

  const { data: allEntities } = await supabase
    .from('entities')
    .select('metadata')
    .eq('tenant_id', t);

  const storeMap = new Map<string, number>();
  for (const e of allEntities || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    const store = (meta?.No_Tienda as string) || (meta?.num_tienda as string) || (meta?.storeId as string) || 'none';
    storeMap.set(store, (storeMap.get(store) || 0) + 1);
  }
  const storeEntries = Array.from(storeMap.entries()).sort((a, b) => b[1] - a[1]);
  console.log(`Total stores: ${storeEntries.filter(([k]) => k !== 'none').length}`);
  console.log(`Entities with no store: ${storeMap.get('none') || 0}`);
  console.log('Top stores:');
  for (const [store, count] of storeEntries.slice(0, 15)) {
    console.log(`  ${store}: ${count} entities`);
  }

  // ═══ COMPONENT STRUCTURE ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('COMPONENT STRUCTURE (from rule_set)');
  console.log('═══════════════════════════════════════════════');

  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', t)
    .eq('status', 'active')
    .single();

  if (ruleSet) {
    console.log(`Rule set: ${ruleSet.name} (${ruleSet.id})`);
    const comps = ruleSet.components as unknown[];
    console.log(`Components: ${comps?.length || 0}`);
    for (const c of comps || []) {
      const comp = c as Record<string, unknown>;
      console.log(`  ${comp.name}: type=${comp.componentType}, order=${comp.order}, enabled=${comp.enabled}`);
    }
  }

  // ═══ BATCHES ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('CALCULATION BATCHES');
  console.log('═══════════════════════════════════════════════');

  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, rule_set_id, lifecycle_state, entity_count, summary, created_at')
    .eq('tenant_id', t)
    .order('created_at', { ascending: false })
    .limit(5);

  for (const b of batches || []) {
    const summary = b.summary as Record<string, unknown> | null;
    console.log(`  ${b.id.substring(0, 8)} | state=${b.lifecycle_state} | entities=${b.entity_count} | total=${summary?.total_payout || 0} | ${b.created_at}`);
  }

  // ═══ COMPONENT RESULTS SHAPE ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('COMPONENT RESULTS SHAPE (from top-payout entity)');
  console.log('═══════════════════════════════════════════════');

  const { data: topResult } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, attainment, metadata')
    .eq('tenant_id', t)
    .order('total_payout', { ascending: false })
    .limit(1)
    .single();

  if (topResult) {
    console.log(`Top entity: ${topResult.entity_id}, payout: ${topResult.total_payout}`);
    console.log('components (full):');
    console.log(JSON.stringify(topResult.components, null, 2));
    console.log('\nattainment:', JSON.stringify(topResult.attainment, null, 2));
    console.log('metadata:', JSON.stringify(topResult.metadata, null, 2));
  }

  // ═══ PERIODS ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log('PERIODS');
  console.log('═══════════════════════════════════════════════');

  const { data: periodsList } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date, status')
    .eq('tenant_id', t)
    .order('start_date', { ascending: false });

  for (const p of periodsList || []) {
    console.log(`  ${p.label || p.canonical_key} | ${p.start_date} to ${p.end_date} | status=${p.status} | id=${p.id}`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('PHASE 0 DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════');
}

main().catch(console.error);
