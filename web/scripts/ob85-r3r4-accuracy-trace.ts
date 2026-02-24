/**
 * OB-85 R3/R4 Accuracy Trace — Entity 93515855
 *
 * Traces: raw data → rule_set components → calculation results → manual calculation
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const EMPLOYEE = '93515855';

async function trace() {
  console.log('=== OB-85 R3/R4 ACCURACY TRACE — Entity', EMPLOYEE, '===\n');

  // ── 0A: Find all entity UUIDs for this employee ──
  console.log('--- 0A: Entity Records ---');
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name, entity_type, metadata')
    .eq('tenant_id', TENANT);

  // Find by external_id or by composite key containing employee number
  const matchingEntities = (entities ?? []).filter(e =>
    e.external_id === EMPLOYEE ||
    e.external_id?.endsWith(`-${EMPLOYEE}`) ||
    e.external_id?.startsWith(`${EMPLOYEE}-`)
  );

  console.log(`Found ${matchingEntities.length} entity UUIDs for employee ${EMPLOYEE}:`);
  for (const e of matchingEntities) {
    console.log(`  UUID: ${e.id} | external_id: ${e.external_id} | display_name: ${e.display_name}`);
  }

  const entityUuids = matchingEntities.map(e => e.id);

  // ── 0B: All committed_data for this employee ──
  console.log('\n--- 0B: Committed Data (all sheets) ---');

  // Get Jan 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');

  const periodId = periods?.[0]?.id;
  console.log(`Jan 2024 period: ${periodId} (${periods?.[0]?.label})`);

  // Get ALL committed_data for this employee (by entity UUID + by entityId in row_data)
  const { data: committedByUuid } = await supabase
    .from('committed_data')
    .select('id, entity_id, data_type, row_data, metadata')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .in('entity_id', entityUuids.length > 0 ? entityUuids : ['__none__']);

  // Also search by row_data containing the employee number
  const { data: committedByRowData } = await supabase
    .from('committed_data')
    .select('id, entity_id, data_type, row_data, metadata')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .or(`row_data->>entityId.eq.${EMPLOYEE},row_data->>num_empleado.eq.${EMPLOYEE}`);

  // Merge and dedupe
  const allCommitted = new Map<string, typeof committedByUuid extends (infer T)[] | null ? T : never>();
  for (const row of [...(committedByUuid ?? []), ...(committedByRowData ?? [])]) {
    allCommitted.set(row.id, row);
  }

  console.log(`\nCommitted data rows: ${allCommitted.size}`);
  console.log(`  By entity UUID: ${committedByUuid?.length ?? 0}`);
  console.log(`  By row_data.entityId: ${committedByRowData?.length ?? 0}`);

  const sheets = new Map<string, Array<Record<string, unknown>>>();
  for (const row of allCommitted.values()) {
    const sheetName = (row.row_data as Record<string, unknown>)?.sheetName as string ?? row.data_type ?? 'unknown';
    if (!sheets.has(sheetName)) sheets.set(sheetName, []);
    sheets.get(sheetName)!.push({
      entity_id: row.entity_id,
      data_type: row.data_type,
      row_data: row.row_data,
    });
  }

  for (const [sheetName, rows] of Array.from(sheets.entries())) {
    console.log(`\n  Sheet: ${sheetName} (${rows.length} rows)`);
    for (const row of rows) {
      const rd = row.row_data as Record<string, unknown>;
      console.log(`    entity_id: ${row.entity_id}`);
      console.log(`    row_data: ${JSON.stringify(rd, null, 2)}`);
    }
  }

  // ── 0C: Also get store-level data for this entity's store ──
  console.log('\n--- 0C: Entity Store + Store-Level Data ---');

  // Find store from entity row_data
  let storeId: string | null = null;
  for (const row of allCommitted.values()) {
    const rd = row.row_data as Record<string, unknown>;
    if (rd?.storeId || rd?.store_id || rd?.Tienda) {
      storeId = String(rd.storeId ?? rd.store_id ?? rd.Tienda);
      break;
    }
  }
  console.log(`Store ID from entity data: ${storeId}`);

  // Get store-level committed_data (entity_id IS NULL for store data)
  const { data: storeData } = await supabase
    .from('committed_data')
    .select('id, entity_id, data_type, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .is('entity_id', null)
    .limit(100);

  console.log(`\nStore-level rows (entity_id=NULL): ${storeData?.length ?? 0}`);

  // Find store data matching this entity's store
  if (storeData && storeId) {
    const storeRows = storeData.filter(r => {
      const rd = r.row_data as Record<string, unknown>;
      return String(rd?.storeId ?? rd?.store_id ?? rd?.Tienda ?? '') === storeId;
    });
    console.log(`Store data for store ${storeId}: ${storeRows.length} rows`);
    for (const r of storeRows) {
      console.log(`  Sheet: ${(r.row_data as Record<string, unknown>)?.sheetName ?? r.data_type}`);
      console.log(`  row_data: ${JSON.stringify(r.row_data, null, 2)}`);
    }
  }

  // ── 0D: Calculation Results ──
  console.log('\n--- 0D: Calculation Results ---');

  // Get latest batch
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, lifecycle_state, created_at, summary')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log(`Latest batches for Jan 2024:`);
  for (const b of batches ?? []) {
    console.log(`  ${b.id} | ${b.lifecycle_state} | ${b.created_at}`);
  }

  const latestBatchId = batches?.[0]?.id;

  if (latestBatchId) {
    // Get results for this entity
    for (const uuid of entityUuids) {
      const { data: results } = await supabase
        .from('calculation_results')
        .select('id, entity_id, total_payout, components, metrics, attainment, metadata')
        .eq('batch_id', latestBatchId)
        .eq('entity_id', uuid);

      if (results && results.length > 0) {
        for (const r of results) {
          console.log(`\nEntity UUID: ${uuid}`);
          console.log(`  total_payout: ${r.total_payout}`);
          console.log(`  components: ${JSON.stringify(r.components, null, 2)}`);
          console.log(`  metrics: ${JSON.stringify(r.metrics, null, 2)}`);
          console.log(`  attainment: ${JSON.stringify(r.attainment, null, 2)}`);
          console.log(`  metadata (first 500 chars): ${JSON.stringify(r.metadata)?.substring(0, 500)}`);
        }
      } else {
        console.log(`\nEntity UUID: ${uuid} — NO calculation results in batch ${latestBatchId}`);
      }
    }

    // Also check total stats
    const { data: allResults } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('batch_id', latestBatchId);

    if (allResults) {
      const total = allResults.reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
      const nonZero = allResults.filter(r => Number(r.total_payout) > 0).length;
      const max = Math.max(...allResults.map(r => Number(r.total_payout) || 0));
      const min = Math.min(...allResults.filter(r => Number(r.total_payout) > 0).map(r => Number(r.total_payout)));
      console.log(`\nBatch stats (${latestBatchId}):`);
      console.log(`  Total: ${total.toLocaleString()}`);
      console.log(`  Entities: ${allResults.length}`);
      console.log(`  Non-zero: ${nonZero}`);
      console.log(`  Max payout: ${max.toLocaleString()}`);
      console.log(`  Min payout (non-zero): ${min.toLocaleString()}`);
      console.log(`  Average: ${(total / allResults.length).toLocaleString()}`);
    }
  }

  // ── 0E: Rule Set Components ──
  console.log('\n--- 0E: Rule Set Components ---');

  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, components, metadata')
    .eq('tenant_id', TENANT)
    .eq('status', 'active');

  if (ruleSets && ruleSets.length > 0) {
    const rs = ruleSets[0];
    console.log(`Rule set: ${rs.name} (${rs.id})`);
    console.log(`Components JSON:`);
    console.log(JSON.stringify(rs.components, null, 2));
  }

  // ── 0F: Sample of top-5 highest payout entities ──
  console.log('\n--- 0F: Top-5 Highest Payout Entities ---');
  if (latestBatchId) {
    const { data: topResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metrics')
      .eq('batch_id', latestBatchId)
      .order('total_payout', { ascending: false })
      .limit(5);

    for (const r of topResults ?? []) {
      const entity = matchingEntities.find(e => e.id === r.entity_id) ??
        (entities ?? []).find(e => e.id === r.entity_id);
      console.log(`\n  ${entity?.external_id ?? r.entity_id}: total_payout=${r.total_payout}`);
      console.log(`  components: ${JSON.stringify(r.components)?.substring(0, 300)}`);
      console.log(`  metrics: ${JSON.stringify(r.metrics)?.substring(0, 300)}`);
    }
  }

  // ── 0G: Sample 5 lowest non-zero payout entities ──
  console.log('\n--- 0G: Bottom-5 Non-Zero Payout Entities ---');
  if (latestBatchId) {
    const { data: bottomResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metrics')
      .eq('batch_id', latestBatchId)
      .gt('total_payout', 0)
      .order('total_payout', { ascending: true })
      .limit(5);

    for (const r of bottomResults ?? []) {
      const entity = (entities ?? []).find(e => e.id === r.entity_id);
      console.log(`\n  ${entity?.external_id ?? r.entity_id}: total_payout=${r.total_payout}`);
      console.log(`  components: ${JSON.stringify(r.components)?.substring(0, 300)}`);
    }
  }
}

trace().catch(console.error);
