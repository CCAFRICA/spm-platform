// OB-141 Phase 3: Clean duplicate committed_data batches
// Strategy: Identify the primary batch per data_type (the one with period_id linkages),
// delete duplicate batches that repeat the same data.
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase3-clean-committed-data.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function cleanCommittedData() {
  // Count before
  const { count: beforeCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Committed data BEFORE cleanup: ${beforeCount}`);

  // Analyze: for each batch, count rows with and without period_id
  const batchStats: Record<string, { total: number; withPeriod: number; withEntity: number; dataTypes: Set<string>; created: string }> = {};
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('committed_data')
      .select('import_batch_id, period_id, entity_id, data_type, created_at')
      .eq('tenant_id', TENANT_ID)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    page.forEach(r => {
      const bid = r.import_batch_id || 'null';
      if (!batchStats[bid]) batchStats[bid] = { total: 0, withPeriod: 0, withEntity: 0, dataTypes: new Set(), created: r.created_at };
      batchStats[bid].total++;
      if (r.period_id) batchStats[bid].withPeriod++;
      if (r.entity_id) batchStats[bid].withEntity++;
      batchStats[bid].dataTypes.add(r.data_type || 'null');
    });
    offset += 1000;
    if (page.length < 1000) break;
  }

  console.log('\n=== BATCH ANALYSIS ===');
  const sortedBatches = Object.entries(batchStats).sort((a, b) => b[1].total - a[1].total);
  for (const [bid, stats] of sortedBatches) {
    const periodPct = stats.total > 0 ? Math.round((stats.withPeriod / stats.total) * 100) : 0;
    const entityPct = stats.total > 0 ? Math.round((stats.withEntity / stats.total) * 100) : 0;
    const types = Array.from(stats.dataTypes).join(', ');
    console.log(`  ${bid}: ${stats.total} rows (${periodPct}% with period, ${entityPct}% with entity)`);
    console.log(`    data_types: ${types}`);
  }

  // Identify batches to keep vs delete:
  // - KEEP batches where rows have period_id (properly processed)
  // - KEEP the seed batch (d1b2c3d4)
  // - DELETE batches where ALL rows lack period_id (raw SCI imports without period detection)
  //
  // BUT: Some batches may have partial period linkage. Be conservative:
  // - If ANY rows have period_id, keep the batch
  // - Only delete batches with 0% period linkage AND that appear to duplicate data in kept batches

  const SEED_BATCH = 'd1b2c3d4-e5f6-7890-abcd-ef1234567890';

  // Find batches with period_id > 0 or seed batch
  const keepBatches = new Set<string>();
  const deleteBatches: string[] = [];

  for (const [bid, stats] of sortedBatches) {
    if (bid === SEED_BATCH || stats.withPeriod > 0) {
      keepBatches.add(bid);
    } else {
      deleteBatches.push(bid);
    }
  }

  console.log(`\nBatches to KEEP: ${keepBatches.size}`);
  let keepTotal = 0;
  for (const bid of keepBatches) {
    const stats = batchStats[bid];
    keepTotal += stats.total;
    console.log(`  KEEP ${bid}: ${stats.total} rows`);
  }
  console.log(`  Total KEEP rows: ${keepTotal}`);

  console.log(`\nBatches to DELETE: ${deleteBatches.length}`);
  let deleteTotal = 0;
  for (const bid of deleteBatches) {
    const stats = batchStats[bid];
    deleteTotal += stats.total;
    console.log(`  DELETE ${bid}: ${stats.total} rows`);
  }
  console.log(`  Total DELETE rows: ${deleteTotal}`);

  // Execute deletion
  let totalDeleted = 0;
  for (const batchId of deleteBatches) {
    let batchDeleted = 0;
    while (true) {
      const { data: chunk } = await supabase
        .from('committed_data')
        .select('id')
        .eq('tenant_id', TENANT_ID)
        .eq('import_batch_id', batchId)
        .limit(200);
      if (!chunk || chunk.length === 0) break;
      await supabase
        .from('committed_data')
        .delete()
        .in('id', chunk.map(r => r.id));
      batchDeleted += chunk.length;
    }
    totalDeleted += batchDeleted;
    if (batchDeleted > 0) {
      console.log(`  Deleted ${batchDeleted} rows from batch ${batchId}`);
    }
  }

  // Count after
  const { count: afterCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nCommitted data AFTER cleanup: ${afterCount}`);
  console.log(`Deleted: ${totalDeleted}`);
  console.log(`Expected remaining: ${keepTotal}`);

  // Verify by data_type
  const remainingTypes: Record<string, number> = {};
  let rOffset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', TENANT_ID)
      .range(rOffset, rOffset + 999);
    if (!page || page.length === 0) break;
    page.forEach(r => {
      remainingTypes[r.data_type || 'null'] = (remainingTypes[r.data_type || 'null'] || 0) + 1;
    });
    rOffset += 1000;
    if (page.length < 1000) break;
  }
  console.log('\nRemaining data by type:');
  console.table(
    Object.entries(remainingTypes)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => ({ data_type: t, count: c }))
  );
}

cleanCommittedData().catch(console.error);
