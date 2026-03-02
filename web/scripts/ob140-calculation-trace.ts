// OB-140 Calculation Trace — Single Entity Forensic + Aggregate Comparison
// Diagnostic only. Traces why the Alpha benchmark (MX$1,253,832) diverged.
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob140-calculation-trace.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// From architecture trace
const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORIGINAL_RULE_SET = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';    // 6-comp, archived
const IMPORTED_RULE_SET = '7657fc95-6dcf-4340-8745-d0ba71ffe88e';     // "Imported Plan", active

async function main() {
  console.log('='.repeat(80));
  console.log('OB-140 CALCULATION TRACE — SINGLE ENTITY FORENSIC');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // ── 3A: Find all calculation batches ──
  console.log('\n' + '='.repeat(60));
  console.log('3A: CALCULATION BATCHES — FULL HISTORY');
  console.log('='.repeat(60));

  const { data: calcBatches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, rule_set_id, entity_count, lifecycle_state, summary, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });

  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key, label')
    .eq('tenant_id', TENANT_ID);

  const periodMap = new Map((periods || []).map(p => [p.id, p]));

  console.log('\n=== ALL CALCULATION BATCHES ===');
  for (const b of calcBatches || []) {
    const period = periodMap.get(b.period_id);
    const payout = b.summary?.total_payout ?? b.summary?.totalPayout ?? '?';
    const rsLabel = b.rule_set_id === ORIGINAL_RULE_SET ? 'ORIGINAL-6comp' :
                    b.rule_set_id === IMPORTED_RULE_SET ? 'IMPORTED-2comp' : 'UNKNOWN';
    console.log(`  ${b.id} | ${period?.label || b.period_id} | ${rsLabel} | ${b.entity_count} entities | MX$${Number(payout).toLocaleString()} | ${b.lifecycle_state} | ${b.created_at}`);
  }

  // Identify batches
  const latestBatch = calcBatches?.[0];
  // Find the Feb 24 benchmark batch — the one with ~$525,000 and 719 entities on the IMPORTED rule set
  // Actually, the proven Alpha benchmark was 67 entities at $1,253,832 across ALL batches/periods combined
  // But the per-period batches should be $524,500 or $525,000 for Jan/Feb 2024
  // The seed batch with 12 entities and $42,850 is from Feb 15 on the ORIGINAL rule set

  // Let's find the most recent batch that used the ORIGINAL 6-component rule set
  const originalBatches = (calcBatches || []).filter(b => b.rule_set_id === ORIGINAL_RULE_SET);
  const importedBatches = (calcBatches || []).filter(b => b.rule_set_id === IMPORTED_RULE_SET);

  console.log(`\nBatches using ORIGINAL rule set (6 components): ${originalBatches.length}`);
  console.log(`Batches using IMPORTED rule set (2 components): ${importedBatches.length}`);

  const benchmarkBatch = originalBatches[0]; // Most recent original
  console.log(`\nLATEST batch: ${latestBatch?.id} (${latestBatch?.entity_count} entities, MX$${latestBatch?.summary?.total_payout})`);
  console.log(`BENCHMARK batch: ${benchmarkBatch?.id || 'NONE'} (${benchmarkBatch?.entity_count || '?'} entities, MX$${benchmarkBatch?.summary?.total_payout || '?'})`);

  // ── 3B: Deep-dive into the "Imported Plan" rule set ──
  console.log('\n' + '='.repeat(60));
  console.log('3B: IMPORTED PLAN RULE SET — FULL COMPONENT DUMP');
  console.log('='.repeat(60));

  const { data: importedRS } = await supabase
    .from('rule_sets')
    .select('*')
    .eq('id', IMPORTED_RULE_SET)
    .single();

  console.log(`\nName: ${importedRS?.name}`);
  console.log(`Status: ${importedRS?.status}`);
  console.log(`Version: ${importedRS?.version}`);
  console.log(`Created: ${importedRS?.created_at}`);
  console.log(`\nFull components JSON:`);
  console.log(JSON.stringify(importedRS?.components, null, 2));
  console.log(`\nFull input_bindings JSON:`);
  console.log(JSON.stringify(importedRS?.input_bindings, null, 2));
  console.log(`\nFull metadata JSON:`);
  console.log(JSON.stringify(importedRS?.metadata, null, 2));

  // ── 3C: Deep-dive into the ORIGINAL rule set ──
  console.log('\n' + '='.repeat(60));
  console.log('3C: ORIGINAL RULE SET — FULL COMPONENT DUMP');
  console.log('='.repeat(60));

  const { data: originalRS } = await supabase
    .from('rule_sets')
    .select('*')
    .eq('id', ORIGINAL_RULE_SET)
    .single();

  console.log(`\nName: ${originalRS?.name}`);
  console.log(`Status: ${originalRS?.status}`);
  console.log(`Version: ${originalRS?.version}`);
  console.log(`Created: ${originalRS?.created_at}`);
  console.log(`\nFull components JSON:`);
  console.log(JSON.stringify(originalRS?.components, null, 2));
  console.log(`\nFull input_bindings JSON:`);
  console.log(JSON.stringify(originalRS?.input_bindings, null, 2));

  // ── 3D: Pick a trace entity from the latest batch ──
  console.log('\n' + '='.repeat(60));
  console.log('3D: TRACE ENTITY SELECTION');
  console.log('='.repeat(60));

  const latestBatchId = latestBatch?.id;
  if (!latestBatchId) {
    console.error('No latest batch found. Exiting.');
    process.exit(1);
  }

  // Get the highest-payout entity from the latest batch
  const { data: topResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, metrics')
    .eq('batch_id', latestBatchId)
    .gt('total_payout', 0)
    .order('total_payout', { ascending: false })
    .limit(5);

  console.log('\nTop 5 results in latest batch:');
  for (const r of topResults || []) {
    const { data: ent } = await supabase
      .from('entities')
      .select('external_id, display_name')
      .eq('id', r.entity_id)
      .single();
    console.log(`  ${r.entity_id} | ${ent?.external_id} | ${ent?.display_name} | MX$${Number(r.total_payout).toLocaleString()}`);
  }

  const traceEntityId = topResults?.[0]?.entity_id;
  if (!traceEntityId) {
    console.error('No trace entity found. Exiting.');
    process.exit(1);
  }

  const { data: traceEntity } = await supabase
    .from('entities')
    .select('id, external_id, display_name, entity_type, metadata, created_at')
    .eq('id', traceEntityId)
    .single();

  console.log(`\nTRACE ENTITY: ${traceEntity?.external_id} (${traceEntity?.display_name})`);
  console.log(`  UUID: ${traceEntity?.id}`);
  console.log(`  Type: ${traceEntity?.entity_type}`);
  console.log(`  Created: ${traceEntity?.created_at}`);
  console.log(`  Metadata: ${JSON.stringify(traceEntity?.metadata)}`);

  // ── 3E: Latest calculation result for trace entity ──
  console.log('\n' + '='.repeat(60));
  console.log('3E: LATEST CALCULATION — TRACE ENTITY');
  console.log('='.repeat(60));

  const { data: latestResult } = await supabase
    .from('calculation_results')
    .select('total_payout, components, metrics, rule_set_id, period_id')
    .eq('batch_id', latestBatchId)
    .eq('entity_id', traceEntityId)
    .single();

  console.log(`\nTotal payout: MX$${latestResult?.total_payout}`);
  console.log(`Rule set: ${latestResult?.rule_set_id}`);
  const latestPeriod = periodMap.get(latestResult?.period_id || '');
  console.log(`Period: ${latestPeriod?.label} (${latestPeriod?.canonical_key})`);
  console.log(`\nComponents:`);
  console.log(JSON.stringify(latestResult?.components, null, 2));
  console.log(`\nMetrics:`);
  console.log(JSON.stringify(latestResult?.metrics, null, 2));

  // ── 3F: Benchmark calculation for trace entity (if exists) ──
  console.log('\n' + '='.repeat(60));
  console.log('3F: BENCHMARK CALCULATION — TRACE ENTITY');
  console.log('='.repeat(60));

  if (benchmarkBatch) {
    // The benchmark used the original rule_set — entities may differ
    // First, find if the same external_id has results in the benchmark batch
    const { data: benchResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metrics, period_id')
      .eq('batch_id', benchmarkBatch.id);

    console.log(`Benchmark batch has ${benchResults?.length} results`);

    // Try to match by external_id
    // Need to find entity with same external_id
    const benchEntityIds = (benchResults || []).map(r => r.entity_id);

    // Chunk the lookup (max 200 per .in() call)
    const matchedEntities: Array<{ id: string; external_id: string }> = [];
    for (let i = 0; i < benchEntityIds.length; i += 200) {
      const chunk = benchEntityIds.slice(i, i + 200);
      const { data: ents } = await supabase
        .from('entities')
        .select('id, external_id')
        .in('id', chunk);
      matchedEntities.push(...(ents || []));
    }

    const targetExtId = traceEntity?.external_id;
    const benchEntity = matchedEntities.find(e => e.external_id === targetExtId);

    if (benchEntity) {
      const benchResult = benchResults?.find(r => r.entity_id === benchEntity.id);
      console.log(`\nBenchmark match found: ${benchEntity.id} (ext: ${benchEntity.external_id})`);
      console.log(`Total payout: MX$${benchResult?.total_payout}`);
      const benchPeriod = periodMap.get(benchResult?.period_id || '');
      console.log(`Period: ${benchPeriod?.label} (${benchPeriod?.canonical_key})`);
      console.log(`\nComponents:`);
      console.log(JSON.stringify(benchResult?.components, null, 2));
      console.log(`\nMetrics:`);
      console.log(JSON.stringify(benchResult?.metrics, null, 2));

      // Component-by-component comparison
      console.log('\n--- COMPONENT COMPARISON ---');
      const latestComps = latestResult?.components || {};
      const benchComps = benchResult?.components || {};
      const allCompNames = new Set([...Object.keys(latestComps), ...Object.keys(benchComps)]);
      for (const name of allCompNames) {
        const latestVal = latestComps[name]?.payout ?? latestComps[name]?.result ?? 0;
        const benchVal = benchComps[name]?.payout ?? benchComps[name]?.result ?? 0;
        const delta = Number(latestVal) - Number(benchVal);
        const status = Math.abs(delta) < 0.01 ? 'MATCH' : 'DIVERGED';
        console.log(`  ${status} | ${name}: Latest=MX$${latestVal} Benchmark=MX$${benchVal} Delta=MX$${delta}`);
      }
    } else {
      console.log(`\nNo benchmark entity found for external_id=${targetExtId}`);
      console.log('The benchmark batch may have used different entity UUIDs.');
    }
  } else {
    console.log('No benchmark batch found (no batches use ORIGINAL rule set).');
  }

  // ── 3G: Committed data for trace entity ──
  console.log('\n' + '='.repeat(60));
  console.log('3G: COMMITTED DATA — TRACE ENTITY');
  console.log('='.repeat(60));

  const { data: entityData } = await supabase
    .from('committed_data')
    .select('id, data_type, period_id, row_data, import_batch_id, created_at')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', traceEntityId)
    .order('data_type');

  console.log(`\nTotal committed_data rows for trace entity: ${entityData?.length || 0}`);

  const byType: Record<string, number> = {};
  (entityData || []).forEach(r => {
    byType[r.data_type || 'null'] = (byType[r.data_type || 'null'] || 0) + 1;
  });
  console.log('By data_type:');
  console.table(Object.entries(byType).map(([t, c]) => ({ data_type: t, count: c })));

  // Show all rows (if not too many)
  for (const row of entityData || []) {
    const period = periodMap.get(row.period_id || '');
    console.log(`\n  data_type: ${row.data_type}`);
    console.log(`  period: ${period?.label || row.period_id || 'NULL'}`);
    console.log(`  import_batch: ${row.import_batch_id}`);
    console.log(`  fields: ${Object.keys(row.row_data || {}).join(', ')}`);
    console.log(`  values: ${JSON.stringify(row.row_data).slice(0, 500)}`);
  }

  // ── 3H: What about store-level data for this entity's store? ──
  console.log('\n' + '='.repeat(60));
  console.log('3H: STORE-LEVEL DATA — TRACE ENTITY\'S STORE');
  console.log('='.repeat(60));

  // Find the store from the entity's data
  const sampleRow = entityData?.find(r => r.row_data?.storeId || r.row_data?.No_Tienda || r.row_data?.num_tienda);
  const storeId = sampleRow?.row_data?.storeId || sampleRow?.row_data?.No_Tienda || sampleRow?.row_data?.num_tienda;
  console.log(`\nTrace entity's store: ${storeId}`);

  if (storeId) {
    // Store-level data has null entity_id — find by storeId in row_data
    const { data: storeData } = await supabase
      .from('committed_data')
      .select('data_type, period_id, row_data')
      .eq('tenant_id', TENANT_ID)
      .is('entity_id', null)
      .limit(500);

    // Filter for this store
    const matchingStoreData = (storeData || []).filter(r => {
      const rid = r.row_data?.storeId || r.row_data?.No_Tienda || r.row_data?.Tienda;
      return String(rid) === String(storeId);
    });

    console.log(`Store-level rows for store ${storeId}: ${matchingStoreData.length}`);
    const storeByType: Record<string, number> = {};
    matchingStoreData.forEach(r => {
      storeByType[r.data_type || 'null'] = (storeByType[r.data_type || 'null'] || 0) + 1;
    });
    console.log('By data_type:');
    console.table(Object.entries(storeByType).map(([t, c]) => ({ data_type: t, count: c })));

    // Show first of each type
    const seenTypes = new Set<string>();
    for (const row of matchingStoreData) {
      if (seenTypes.has(row.data_type || 'null')) continue;
      seenTypes.add(row.data_type || 'null');
      const period = periodMap.get(row.period_id || '');
      console.log(`\n  data_type: ${row.data_type}`);
      console.log(`  period: ${period?.label || row.period_id || 'NULL'}`);
      console.log(`  values: ${JSON.stringify(row.row_data).slice(0, 400)}`);
    }
  }

  // ── 3I: Aggregate Comparison ──
  console.log('\n' + '='.repeat(60));
  console.log('3I: AGGREGATE COMPARISON — ALL BATCHES');
  console.log('='.repeat(60));

  // For each batch, get component-level totals
  for (const batch of calcBatches || []) {
    const period = periodMap.get(batch.period_id);
    const rsLabel = batch.rule_set_id === ORIGINAL_RULE_SET ? 'ORIGINAL-6comp' :
                    batch.rule_set_id === IMPORTED_RULE_SET ? 'IMPORTED-2comp' : 'UNKNOWN';

    console.log(`\n--- Batch: ${batch.id} ---`);
    console.log(`Period: ${period?.label}, Rule set: ${rsLabel}, Entities: ${batch.entity_count}`);
    console.log(`Total payout: MX$${Number(batch.summary?.total_payout ?? 0).toLocaleString()}`);
    console.log(`Lifecycle: ${batch.lifecycle_state}, Created: ${batch.created_at}`);

    // Get component-level breakdown
    const { data: batchResults } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('batch_id', batch.id)
      .limit(1000);

    const nonZero = (batchResults || []).filter(r => Number(r.total_payout) > 0).length;
    const zero = (batchResults || []).filter(r => Number(r.total_payout) === 0).length;
    const total = (batchResults || []).reduce((s, r) => s + Number(r.total_payout), 0);
    console.log(`  Results: ${batchResults?.length}, non-zero: ${nonZero}, zero: ${zero}, sum: MX$${total.toLocaleString()}`);

    // Aggregate by component name
    const compTotals: Record<string, number> = {};
    for (const r of batchResults || []) {
      const comps = r.components || {};
      for (const [name, data] of Object.entries(comps)) {
        const val = (data as any)?.payout ?? (data as any)?.result ?? 0;
        compTotals[name] = (compTotals[name] || 0) + Number(val);
      }
    }
    if (Object.keys(compTotals).length > 0) {
      console.log('  Component totals:');
      for (const [name, val] of Object.entries(compTotals).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${name}: MX$${val.toLocaleString()}`);
      }
    }
  }

  // ── 3J: Expected Alpha Benchmark ──
  console.log('\n' + '='.repeat(60));
  console.log('3J: EXPECTED ALPHA BENCHMARK (from Feb 24 proof)');
  console.log('='.repeat(60));

  console.log('\nExpected totals (proven Feb 24, 2026):');
  console.log('  Total: MX$1,253,832 across ALL entities ALL periods');
  console.log('  Optical Sales (Venta Optica): MX$748,600');
  console.log('  Store Sales (Venta Tienda): MX$116,250');
  console.log('  New Customers (Clientes Nuevos): MX$39,100');
  console.log('  Collections (Cobranza): MX$283,000');
  console.log('  Insurance (Club de Proteccion): MX$10');
  console.log('  Warranty (Garantia Extendida): MX$66,872');
  console.log('  Entity count per period: 719');
  console.log('  Periods calculated: 3 (Enero, Febrero, Marzo 2024)');

  // ── 3K: Entity count analysis — why 22,237? ──
  console.log('\n' + '='.repeat(60));
  console.log('3K: ENTITY COUNT ANALYSIS — 22,237 vs 719');
  console.log('='.repeat(60));

  // Get entity_type distribution
  const entityTypes: Record<string, number> = {};
  let entOffset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('entities')
      .select('entity_type')
      .eq('tenant_id', TENANT_ID)
      .range(entOffset, entOffset + 999);
    if (!page || page.length === 0) break;
    page.forEach(e => {
      entityTypes[e.entity_type || 'null'] = (entityTypes[e.entity_type || 'null'] || 0) + 1;
    });
    entOffset += 1000;
    if (page.length < 1000) break;
  }
  console.log('\nEntity type distribution:');
  console.table(Object.entries(entityTypes).map(([t, c]) => ({ entity_type: t, count: c })));

  // Sample of entities created on Feb 23 (the 22,215 bulk)
  const { data: bulkSample } = await supabase
    .from('entities')
    .select('id, external_id, display_name, entity_type, metadata, created_at')
    .eq('tenant_id', TENANT_ID)
    .gte('created_at', '2026-02-23T00:00:00')
    .lt('created_at', '2026-02-24T00:00:00')
    .limit(20);
  console.log('\nSample of Feb 23 bulk-created entities (first 20):');
  for (const e of bulkSample || []) {
    console.log(`  ${e.external_id} | ${e.display_name} | ${e.entity_type} | meta=${JSON.stringify(e.metadata)}`);
  }

  // ── 3L: Rule set assignment analysis ──
  console.log('\n' + '='.repeat(60));
  console.log('3L: RULE SET ASSIGNMENT ANALYSIS');
  console.log('='.repeat(60));

  // Only 1,000 assignments exist for the imported rule set
  // Which entities have assignments?
  const { data: assignedEntities } = await supabase
    .from('rule_set_assignments')
    .select('entity_id, rule_set_id, created_at')
    .eq('tenant_id', TENANT_ID)
    .limit(1000);

  console.log(`\nTotal assignments: ${assignedEntities?.length}`);

  // Check if assigned entities are from the seed (Feb 15) or bulk (Feb 23)
  const assignedEntityIds = (assignedEntities || []).map(a => a.entity_id);

  // Chunk lookup
  const assignedDetails: Array<{ id: string; created_at: string; entity_type: string }> = [];
  for (let i = 0; i < assignedEntityIds.length; i += 200) {
    const chunk = assignedEntityIds.slice(i, i + 200);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, created_at, entity_type')
      .in('id', chunk);
    assignedDetails.push(...(ents || []));
  }

  const assignedByDate: Record<string, number> = {};
  assignedDetails.forEach(e => {
    const date = new Date(e.created_at).toISOString().split('T')[0];
    assignedByDate[date] = (assignedByDate[date] || 0) + 1;
  });
  console.log('\nAssigned entities by creation date:');
  console.table(Object.entries(assignedByDate).map(([d, c]) => ({ date: d, count: c })));

  // Assignment creation timestamps
  const assignDates: Record<string, number> = {};
  (assignedEntities || []).forEach(a => {
    const date = new Date(a.created_at).toISOString().split('T')[0];
    assignDates[date] = (assignDates[date] || 0) + 1;
  });
  console.log('\nAssignment creation dates:');
  console.table(Object.entries(assignDates).map(([d, c]) => ({ date: d, count: c })));

  // ── 3M: How did the latest batch get 719 entities? ──
  console.log('\n' + '='.repeat(60));
  console.log('3M: LATEST BATCH ENTITY SELECTION — HOW 719?');
  console.log('='.repeat(60));

  // The latest batch has 719 results despite 22,237 entities
  // How did the calculation engine select 719?
  const { data: latestAllResults } = await supabase
    .from('calculation_results')
    .select('entity_id')
    .eq('batch_id', latestBatchId)
    .limit(1000);

  const latestEntityIds = (latestAllResults || []).map(r => r.entity_id);
  console.log(`\nEntities in latest batch results: ${latestEntityIds.length}`);

  // Check which entities these are
  const latestEntityDetails: Array<{ id: string; external_id: string; created_at: string; entity_type: string }> = [];
  for (let i = 0; i < latestEntityIds.length; i += 200) {
    const chunk = latestEntityIds.slice(i, i + 200);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id, created_at, entity_type')
      .in('id', chunk);
    latestEntityDetails.push(...(ents || []));
  }

  const calcEntByDate: Record<string, number> = {};
  latestEntityDetails.forEach(e => {
    const date = new Date(e.created_at).toISOString().split('T')[0];
    calcEntByDate[date] = (calcEntByDate[date] || 0) + 1;
  });
  console.log('Calculated entities by creation date:');
  console.table(Object.entries(calcEntByDate).map(([d, c]) => ({ date: d, count: c })));

  const calcEntByType: Record<string, number> = {};
  latestEntityDetails.forEach(e => {
    calcEntByType[e.entity_type || 'null'] = (calcEntByType[e.entity_type || 'null'] || 0) + 1;
  });
  console.log('Calculated entities by type:');
  console.table(Object.entries(calcEntByType).map(([t, c]) => ({ entity_type: t, count: c })));

  // Are these the same 719 unique external_ids from the original plan?
  const calcExtIds = new Set(latestEntityDetails.map(e => e.external_id));
  console.log(`\nUnique external_ids in calculation: ${calcExtIds.size}`);

  // ── 3N: Payout distribution analysis ──
  console.log('\n' + '='.repeat(60));
  console.log('3N: PAYOUT DISTRIBUTION — LATEST BATCH');
  console.log('='.repeat(60));

  const { data: allPayouts } = await supabase
    .from('calculation_results')
    .select('total_payout, components')
    .eq('batch_id', latestBatchId);

  // Distribution buckets
  const buckets = [0, 100, 500, 1000, 2000, 5000, 10000, 50000, Infinity];
  const distribution: Record<string, number> = {};
  for (let i = 0; i < buckets.length - 1; i++) {
    const label = `$${buckets[i]}-$${buckets[i + 1] === Infinity ? '∞' : buckets[i + 1]}`;
    distribution[label] = 0;
  }

  (allPayouts || []).forEach(r => {
    const payout = Number(r.total_payout);
    for (let i = 0; i < buckets.length - 1; i++) {
      if (payout >= buckets[i] && payout < buckets[i + 1]) {
        const label = `$${buckets[i]}-$${buckets[i + 1] === Infinity ? '∞' : buckets[i + 1]}`;
        distribution[label]++;
        break;
      }
    }
  });
  console.log('\nPayout distribution:');
  console.table(Object.entries(distribution).map(([range, count]) => ({ range, count })));

  // Component presence analysis
  const compPresence: Record<string, number> = {};
  (allPayouts || []).forEach(r => {
    const comps = r.components || {};
    for (const name of Object.keys(comps)) {
      compPresence[name] = (compPresence[name] || 0) + 1;
    }
  });
  console.log('\nComponent presence in results:');
  console.table(Object.entries(compPresence).map(([name, count]) => ({ component: name, entities_with_component: count })));

  console.log('\n' + '='.repeat(80));
  console.log('CALCULATION TRACE COMPLETE');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
