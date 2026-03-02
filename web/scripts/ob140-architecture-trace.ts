// OB-140 Architecture Trace — Database State Inventory
// Diagnostic only. Produces evidence for forensic analysis.
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob140-architecture-trace.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('='.repeat(80));
  console.log('OB-140 ARCHITECTURE TRACE — DATABASE STATE INVENTORY');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // ── 1A: Tenant Identification ──
  console.log('\n' + '='.repeat(60));
  console.log('1A: TENANT IDENTIFICATION');
  console.log('='.repeat(60));

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, currency, locale, created_at');
  console.log('\n=== ALL TENANTS ===');
  console.table(tenants);

  // Find the PTC / Óptica Luminar tenant — the one with MX$ calculations
  // Use committed_data count to identify the active tenant
  let targetTenant: { id: string; name: string; slug: string } | null = null;
  let maxRows = 0;
  for (const t of tenants || []) {
    const { count } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', t.id);
    console.log(`  ${t.slug} (${t.id}): ${count} committed_data rows`);
    if ((count || 0) > maxRows) {
      maxRows = count || 0;
      targetTenant = { id: t.id, name: t.name, slug: t.slug };
    }
  }
  console.log(`\nTARGET TENANT: ${targetTenant?.name} (${targetTenant?.id})`);
  const TENANT_ID = targetTenant?.id || '';

  if (!TENANT_ID) {
    console.error('FATAL: No tenant found with committed_data.');
    process.exit(1);
  }

  // ── 1B: Entity Count and Duplication Analysis ──
  console.log('\n' + '='.repeat(60));
  console.log('1B: ENTITY COUNT AND DUPLICATION ANALYSIS');
  console.log('='.repeat(60));

  const { count: totalEntities } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nTotal entities: ${totalEntities}`);

  // Fetch all entities to analyze duplicates (chunked if needed)
  const allEntities: Array<{ id: string; external_id: string; display_name: string; entity_type: string; metadata: any; created_at: string }> = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from('entities')
      .select('id, external_id, display_name, entity_type, metadata, created_at')
      .eq('tenant_id', TENANT_ID)
      .range(offset, offset + PAGE - 1);
    if (!page || page.length === 0) break;
    allEntities.push(...page);
    offset += PAGE;
    if (page.length < PAGE) break;
  }
  console.log(`Fetched ${allEntities.length} entity records`);

  const uniqueExternalIds = new Set(allEntities.map(e => e.external_id));
  console.log(`Unique external_ids: ${uniqueExternalIds.size}`);
  console.log(`Duplication factor: ${allEntities.length}/${uniqueExternalIds.size} = ${(allEntities.length / uniqueExternalIds.size).toFixed(1)}x`);

  // Find duplicated external_ids
  const externalIdCounts: Record<string, number> = {};
  allEntities.forEach(e => {
    externalIdCounts[e.external_id] = (externalIdCounts[e.external_id] || 0) + 1;
  });
  const duplicated = Object.entries(externalIdCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log('\nTop 10 duplicated external_ids:');
  console.table(duplicated.map(([id, count]) => ({ external_id: id, count })));

  // Non-duplicated count
  const singletons = Object.values(externalIdCounts).filter(c => c === 1).length;
  const multitons = Object.values(externalIdCounts).filter(c => c > 1).length;
  console.log(`\nSingletons (1 record): ${singletons}`);
  console.log(`Duplicated (>1 record): ${multitons}`);

  // For the top duplicated entity, show all records
  if (duplicated.length > 0) {
    const topDupId = duplicated[0][0];
    const dupRecords = allEntities.filter(e => e.external_id === topDupId);
    console.log(`\nAll records for external_id="${topDupId}":`);
    for (const rec of dupRecords) {
      console.log(`  id: ${rec.id}`);
      console.log(`  display_name: ${rec.display_name}`);
      console.log(`  entity_type: ${rec.entity_type}`);
      console.log(`  metadata: ${JSON.stringify(rec.metadata)}`);
      console.log(`  created_at: ${rec.created_at}`);
      console.log('  ---');
    }
  }

  // ── 1C: Entity Creation Source Analysis ──
  console.log('\n' + '='.repeat(60));
  console.log('1C: ENTITY CREATION SOURCE ANALYSIS');
  console.log('='.repeat(60));

  const dateCounts: Record<string, number> = {};
  allEntities.forEach(e => {
    const date = new Date(e.created_at).toISOString().split('T')[0];
    dateCounts[date] = (dateCounts[date] || 0) + 1;
  });
  console.log('\nEntity creation by date:');
  console.table(
    Object.entries(dateCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))
  );

  // Finer-grained: by hour
  const hourCounts: Record<string, number> = {};
  allEntities.forEach(e => {
    const hour = new Date(e.created_at).toISOString().slice(0, 13);
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  console.log('\nEntity creation by hour:');
  console.table(
    Object.entries(hourCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }))
  );

  // ── 1D: Rule Sets Inventory ──
  console.log('\n' + '='.repeat(60));
  console.log('1D: RULE SETS INVENTORY');
  console.log('='.repeat(60));

  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, status, version, created_at, updated_at')
    .eq('tenant_id', TENANT_ID);
  console.log('\n=== RULE SETS ===');
  console.table(ruleSets);

  for (const rs of ruleSets || []) {
    const { data: fullRs } = await supabase
      .from('rule_sets')
      .select('components, input_bindings')
      .eq('id', rs.id)
      .single();

    const components = fullRs?.components;
    let componentNames: string[] = [];
    if (Array.isArray(components)) {
      componentNames = components.map((c: any) => c.name || c.component_name || 'unnamed');
    } else if (components && typeof components === 'object') {
      componentNames = Object.keys(components);
    }

    console.log(`\nRule set "${rs.name}" (${rs.id}):`);
    console.log(`  Components (${componentNames.length}): ${componentNames.join(', ')}`);
    console.log(`  input_bindings keys: ${Object.keys(fullRs?.input_bindings || {}).length}`);
    console.log(`  input_bindings empty: ${JSON.stringify(fullRs?.input_bindings) === '{}' || JSON.stringify(fullRs?.input_bindings) === 'null'}`);
    console.log(`  Status: ${rs.status}, Version: ${rs.version}`);

    // Show component details
    const comps = Array.isArray(components) ? components : Object.values(components || {});
    for (const comp of comps as any[]) {
      const name = comp.name || comp.component_name || 'unnamed';
      console.log(`\n  Component: ${name}`);
      console.log(`    type: ${comp.component_type || comp.componentType || 'unknown'}`);
      console.log(`    metric_source: ${comp.metric_source || comp.metricSource || 'unknown'}`);
      console.log(`    evaluator: ${comp.evaluator || comp.evaluator_type || 'unknown'}`);
      if (comp.tiers) console.log(`    tiers: ${JSON.stringify(comp.tiers).slice(0, 200)}`);
      if (comp.matrix) console.log(`    matrix: ${JSON.stringify(comp.matrix).slice(0, 200)}`);
    }
  }

  // ── 1E: Rule Set Assignments ──
  console.log('\n' + '='.repeat(60));
  console.log('1E: RULE SET ASSIGNMENTS');
  console.log('='.repeat(60));

  const { count: assignmentCount } = await supabase
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nTotal assignments: ${assignmentCount}`);

  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('rule_set_id, entity_id')
    .eq('tenant_id', TENANT_ID);

  // Assignments per rule_set
  const perRuleSet: Record<string, number> = {};
  (assignments || []).forEach(a => {
    perRuleSet[a.rule_set_id] = (perRuleSet[a.rule_set_id] || 0) + 1;
  });
  console.log('Assignments per rule_set:');
  console.table(Object.entries(perRuleSet).map(([id, count]) => ({ rule_set_id: id, count })));

  // Check for duplicate assignments (same entity assigned multiple times)
  const entityAssignments: Record<string, number> = {};
  (assignments || []).forEach(a => {
    entityAssignments[a.entity_id] = (entityAssignments[a.entity_id] || 0) + 1;
  });
  const multiAssigned = Object.values(entityAssignments).filter(c => c > 1).length;
  console.log(`Entities with >1 assignment: ${multiAssigned}`);

  // ── 1F: Periods Inventory ──
  console.log('\n' + '='.repeat(60));
  console.log('1F: PERIODS INVENTORY');
  console.log('='.repeat(60));

  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key, label, start_date, end_date, status, period_type, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });
  console.log('\n=== PERIODS ===');
  console.table(periods);

  // Check for duplicate canonical_keys
  const keySet = new Set<string>();
  const dupKeys: string[] = [];
  (periods || []).forEach(p => {
    if (keySet.has(p.canonical_key)) dupKeys.push(p.canonical_key);
    keySet.add(p.canonical_key);
  });
  if (dupKeys.length > 0) {
    console.log(`\nDUPLICATE canonical_keys: ${dupKeys.join(', ')}`);
  } else {
    console.log(`\nNo duplicate canonical_keys. Total periods: ${periods?.length}`);
  }

  // ── 1G: Committed Data Inventory ──
  console.log('\n' + '='.repeat(60));
  console.log('1G: COMMITTED DATA INVENTORY');
  console.log('='.repeat(60));

  const { count: cdTotal } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nTotal committed_data rows: ${cdTotal}`);

  // By data_type
  // Fetch a large sample to group
  const dataTypeCounts: Record<string, number> = {};
  let cdOffset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', TENANT_ID)
      .range(cdOffset, cdOffset + 999);
    if (!page || page.length === 0) break;
    page.forEach(r => {
      dataTypeCounts[r.data_type || 'null'] = (dataTypeCounts[r.data_type || 'null'] || 0) + 1;
    });
    cdOffset += 1000;
    if (page.length < 1000) break;
  }
  console.log('\nCommitted data by data_type:');
  console.table(
    Object.entries(dataTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ data_type: type, count }))
  );

  // By import_batch_id
  const batchCounts: Record<string, number> = {};
  let batchOffset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('committed_data')
      .select('import_batch_id')
      .eq('tenant_id', TENANT_ID)
      .range(batchOffset, batchOffset + 999);
    if (!page || page.length === 0) break;
    page.forEach(r => {
      batchCounts[r.import_batch_id || 'null'] = (batchCounts[r.import_batch_id || 'null'] || 0) + 1;
    });
    batchOffset += 1000;
    if (page.length < 1000) break;
  }
  console.log('\nCommitted data by import_batch_id:');
  console.table(
    Object.entries(batchCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ import_batch_id: id, count }))
  );

  // Rows with null entity_id (store-level)
  const { count: nullEntityRows } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .is('entity_id', null);
  console.log(`\nRows with NULL entity_id (store-level): ${nullEntityRows}`);

  // Sample row per data_type
  console.log('\n--- Sample row per data_type ---');
  for (const dt of Object.keys(dataTypeCounts)) {
    const { data: sample } = await supabase
      .from('committed_data')
      .select('id, data_type, entity_id, period_id, row_data, import_batch_id')
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', dt)
      .limit(1);
    if (sample && sample.length > 0) {
      const s = sample[0];
      const fields = Object.keys(s.row_data || {});
      console.log(`\n  data_type: ${dt}`);
      console.log(`  entity_id: ${s.entity_id}`);
      console.log(`  period_id: ${s.period_id}`);
      console.log(`  import_batch_id: ${s.import_batch_id}`);
      console.log(`  fields (${fields.length}): ${fields.join(', ')}`);
      console.log(`  sample values: ${JSON.stringify(s.row_data).slice(0, 400)}`);
    }
  }

  // ── 1H: Calculation State ──
  console.log('\n' + '='.repeat(60));
  console.log('1H: CALCULATION STATE');
  console.log('='.repeat(60));

  const { data: calcBatches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, rule_set_id, entity_count, lifecycle_state, summary, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('\n=== CALCULATION BATCHES ===');
  for (const batch of calcBatches || []) {
    const totalPayout = batch.summary?.total_payout ?? batch.summary?.totalPayout ?? 'unknown';
    const periodMatch = periods?.find(p => p.id === batch.period_id);
    console.log(`  ${batch.id} | period=${periodMatch?.label || batch.period_id} | rule_set=${batch.rule_set_id} | ${batch.entity_count} entities | payout=${totalPayout} | ${batch.lifecycle_state} | ${batch.created_at}`);
  }

  // Latest batch results summary
  if (calcBatches && calcBatches.length > 0) {
    const latestBatch = calcBatches[0];
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('batch_id', latestBatch.id);
    const total = results?.reduce((s, r) => s + Number(r.total_payout), 0);
    const nonZero = results?.filter(r => Number(r.total_payout) > 0).length;
    const zero = results?.filter(r => Number(r.total_payout) === 0).length;
    console.log(`\nLatest batch details:`);
    console.log(`  Batch: ${latestBatch.id}`);
    console.log(`  Results: ${results?.length}, non-zero: ${nonZero}, zero: ${zero}`);
    console.log(`  Total payout: MX$${total?.toLocaleString()}`);
    console.log(`  Expected: 719 results, MX$1,253,832`);
  }

  // ── 1I: Convergence / Metric State ──
  console.log('\n' + '='.repeat(60));
  console.log('1I: CONVERGENCE / METRIC STATE');
  console.log('='.repeat(60));

  // Check metric_derivations
  const { data: derivations, error: derivError } = await supabase
    .from('metric_derivations')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .limit(5);
  if (derivError) {
    console.log(`\nmetric_derivations: ${derivError.message}`);
  } else {
    console.log(`\nmetric_derivations: ${derivations?.length || 0} rows (showing first 5)`);
    if (derivations?.length) console.table(derivations);
  }

  // Check SCI signals
  const { data: signals, error: sigError } = await supabase
    .from('sci_signals')
    .select('signal_type, created_at')
    .eq('tenant_id', TENANT_ID)
    .limit(20);
  if (sigError) {
    console.log(`\nsci_signals: ${sigError.message}`);
  } else {
    console.log(`\nsci_signals: ${signals?.length || 0} rows (showing first 20)`);
    if (signals?.length) {
      const sigTypes: Record<string, number> = {};
      signals.forEach(s => { sigTypes[s.signal_type] = (sigTypes[s.signal_type] || 0) + 1; });
      console.table(Object.entries(sigTypes).map(([t, c]) => ({ signal_type: t, count: c })));
    }
  }

  // Check import_batches
  const { data: importBatches } = await supabase
    .from('import_batches')
    .select('id, status, source_file, row_count, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('\n=== IMPORT BATCHES ===');
  console.table(importBatches);

  console.log('\n' + '='.repeat(80));
  console.log('ARCHITECTURE TRACE COMPLETE');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
