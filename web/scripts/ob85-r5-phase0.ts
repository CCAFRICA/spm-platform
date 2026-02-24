#!/usr/bin/env npx tsx
/**
 * OB-85 R5 Phase 0: Full diagnostic trace for RetailCorp entity 93515855
 * 
 * Traces:
 *   1. Rule set components (all variants, full configs)
 *   2. Latest calculation results for entity 93515855
 *   3. All committed_data for entity 93515855 across all sheets
 *      + store-level data (entity_id IS NULL) for store 388
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const RULE_SET_ID = '04edaaf0-7e44-4cf3-851b-bedfc6ec7e93';
const EXTERNAL_ID = '93515855';
const STORE_ID = '388';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  OB-85 R5 Phase 0: RetailCorp Entity 93515855 Trace    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Tenant:   ${TENANT_ID}`);
  console.log(`RuleSet:  ${RULE_SET_ID}`);
  console.log(`Entity:   ${EXTERNAL_ID}`);
  console.log(`Store:    ${STORE_ID}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // 1. RULE SET COMPONENTS
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 1: RULE SET COMPONENTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const { data: ruleSet, error: rsErr } = await sb
    .from('rule_sets')
    .select('id, name, tenant_id, components, created_at, updated_at')
    .eq('id', RULE_SET_ID)
    .single();

  if (rsErr) {
    console.error('Rule set query error:', rsErr.message);
    return;
  }
  if (!ruleSet) {
    console.error('NO RULE SET FOUND');
    return;
  }

  console.log(`\nRule Set: ${ruleSet.name}`);
  console.log(`ID: ${ruleSet.id}`);
  console.log(`Tenant: ${ruleSet.tenant_id}`);
  console.log(`Created: ${ruleSet.created_at}`);
  console.log(`Updated: ${ruleSet.updated_at}`);

  const componentsJson = ruleSet.components as Record<string, unknown>;
  console.log(`\nFull components JSON structure (top-level keys): ${Object.keys(componentsJson || {}).join(', ')}`);

  // Print the FULL components JSON
  console.log('\n--- FULL COMPONENTS JSON ---');
  console.log(JSON.stringify(componentsJson, null, 2));
  console.log('--- END FULL COMPONENTS JSON ---\n');

  // Also enumerate variants/components in a readable way
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  if (variants.length === 0) {
    const topComponents = (componentsJson?.components as Array<Record<string, unknown>>) ?? [];
    if (topComponents.length > 0) {
      console.log(`[Top-level components] Count: ${topComponents.length}`);
      for (let i = 0; i < topComponents.length; i++) {
        const comp = topComponents[i];
        console.log(`\n  Component ${i + 1}: ${comp.name} (${comp.componentType})`);
        printComponentConfig(comp);
      }
    } else {
      console.log('No variants or top-level components found. Structure printed above.');
    }
  } else {
    console.log(`\nVariants: ${variants.length}`);
    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v];
      console.log(`\n=== Variant ${v + 1}: ${variant.name ?? variant.variantName ?? 'unnamed'} ===`);
      const vComponents = (variant.components as Array<Record<string, unknown>>) ?? [];
      console.log(`  Components: ${vComponents.length}`);
      for (let i = 0; i < vComponents.length; i++) {
        const comp = vComponents[i];
        console.log(`\n  Component ${i + 1}: ${comp.name} (${comp.componentType})`);
        printComponentConfig(comp);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. LATEST CALCULATION RESULTS FOR ENTITY 93515855
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 2: CALCULATION RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Find the entity UUID by external_id
  const { data: entities, error: entErr } = await sb
    .from('entities')
    .select('id, external_id, name, metadata')
    .eq('tenant_id', TENANT_ID)
    .eq('external_id', EXTERNAL_ID);

  if (entErr) {
    console.error('Entity query error:', entErr.message);
  }

  console.log(`\nEntities matching external_id=${EXTERNAL_ID}: ${entities?.length ?? 0}`);
  for (const e of (entities ?? [])) {
    console.log(`  UUID: ${e.id}`);
    console.log(`  Name: ${e.name}`);
    console.log(`  External ID: ${e.external_id}`);
    console.log(`  Metadata: ${JSON.stringify(e.metadata)}`);
  }

  const entityUuids = (entities ?? []).map(e => e.id);

  // Get latest calculation batch
  const { data: batches, error: batchErr } = await sb
    .from('calculation_batches')
    .select('id, period_id, status, created_at, completed_at, summary')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(5);

  if (batchErr) {
    console.error('Batch query error:', batchErr.message);
  }

  console.log(`\nLatest calculation batches (up to 5):`);
  for (const b of (batches ?? [])) {
    console.log(`  Batch ${b.id}`);
    console.log(`    Period: ${b.period_id} | Status: ${b.status}`);
    console.log(`    Created: ${b.created_at} | Completed: ${b.completed_at}`);
    console.log(`    Summary: ${JSON.stringify(b.summary)}`);
  }

  if (batches && batches.length > 0 && entityUuids.length > 0) {
    for (const batch of batches) {
      console.log(`\n--- Results for Batch ${batch.id} (${batch.created_at}) ---`);

      for (const entityUuid of entityUuids) {
        const { data: results, error: resErr } = await sb
          .from('calculation_results')
          .select('*')
          .eq('batch_id', batch.id)
          .eq('entity_id', entityUuid);

        if (resErr) {
          console.error(`  Results query error for entity ${entityUuid}:`, resErr.message);
          continue;
        }

        console.log(`  Entity UUID ${entityUuid}: ${results?.length ?? 0} results`);
        for (const r of (results ?? [])) {
          console.log(`\n    Result ID: ${r.id}`);
          console.log(`    Component: ${r.component_name}`);
          console.log(`    Component Type: ${r.component_type}`);
          console.log(`    Status: ${r.status}`);
          console.log(`    Payout: ${r.payout}`);
          console.log(`    Full result details:`);
          for (const [key, val] of Object.entries(r)) {
            if (['id', 'component_name', 'component_type', 'status', 'payout'].includes(key)) continue;
            const valStr = typeof val === 'object' ? JSON.stringify(val, null, 4) : String(val);
            console.log(`      ${key}: ${valStr}`);
          }
        }
      }
    }

    // Also check entity_period_outcomes
    console.log('\n--- Entity Period Outcomes ---');
    for (const entityUuid of entityUuids) {
      const { data: outcomes, error: outErr } = await sb
        .from('entity_period_outcomes')
        .select('*')
        .eq('entity_id', entityUuid)
        .order('created_at', { ascending: false })
        .limit(5);

      if (outErr) {
        console.error(`  Outcomes query error:`, outErr.message);
        continue;
      }

      console.log(`  Entity ${entityUuid}: ${outcomes?.length ?? 0} outcomes`);
      for (const o of (outcomes ?? [])) {
        console.log(`    Period: ${o.period_id} | Total Payout: ${o.total_payout}`);
        console.log(`    Breakdown: ${JSON.stringify(o.component_breakdown, null, 4)}`);
        console.log(`    Created: ${o.created_at}`);
      }
    }
  } else {
    console.log('\nNo batches or no entity UUIDs found - skipping results query.');
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. ALL COMMITTED_DATA FOR ENTITY 93515855
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 3: COMMITTED DATA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 3a: Data where entity_id matches one of the entity UUIDs
  if (entityUuids.length > 0) {
    console.log('\n--- 3a: Rows matched by entity_id (UUID) ---');
    for (const entityUuid of entityUuids) {
      const { data: entityData, error: edErr } = await sb
        .from('committed_data')
        .select('id, data_type, period_id, entity_id, row_data, created_at')
        .eq('tenant_id', TENANT_ID)
        .eq('entity_id', entityUuid)
        .order('data_type')
        .limit(500);

      if (edErr) {
        console.error(`  committed_data query error for ${entityUuid}:`, edErr.message);
        continue;
      }

      console.log(`\n  Entity UUID ${entityUuid}: ${entityData?.length ?? 0} rows`);

      const bySheetPeriod = new Map<string, Array<Record<string, unknown>>>();
      for (const row of (entityData ?? [])) {
        const key = `${row.data_type}|${row.period_id}`;
        if (!bySheetPeriod.has(key)) bySheetPeriod.set(key, []);
        bySheetPeriod.get(key)!.push(row as Record<string, unknown>);
      }

      for (const [key, rows] of Array.from(bySheetPeriod.entries())) {
        const [sheet, periodId] = key.split('|');
        console.log(`\n  Sheet: "${sheet}" | Period: ${periodId} | Rows: ${rows.length}`);
        for (const row of rows) {
          console.log(`    Row ID: ${row.id}`);
          console.log(`    row_data: ${JSON.stringify(row.row_data, null, 6)}`);
        }
      }
    }
  }

  // 3b: Also search by row_data entityId field
  console.log('\n--- 3b: Rows matched by row_data containing entityId "93515855" ---');
  const { data: rowDataMatches, error: rdmErr } = await sb
    .from('committed_data')
    .select('id, data_type, period_id, entity_id, row_data, created_at')
    .eq('tenant_id', TENANT_ID)
    .filter('row_data->>entityId', 'eq', EXTERNAL_ID)
    .order('data_type')
    .limit(500);

  if (rdmErr) {
    console.error('  row_data entityId query error:', rdmErr.message);
  } else {
    console.log(`  Found ${rowDataMatches?.length ?? 0} rows with row_data.entityId = "${EXTERNAL_ID}"`);

    const bySheetPeriod2 = new Map<string, Array<Record<string, unknown>>>();
    for (const row of (rowDataMatches ?? [])) {
      const key = `${row.data_type}|${row.period_id}`;
      if (!bySheetPeriod2.has(key)) bySheetPeriod2.set(key, []);
      bySheetPeriod2.get(key)!.push(row as Record<string, unknown>);
    }

    for (const [key, rows] of Array.from(bySheetPeriod2.entries())) {
      const [sheet, periodId] = key.split('|');
      console.log(`\n  Sheet: "${sheet}" | Period: ${periodId} | Rows: ${rows.length}`);
      for (const row of rows) {
        console.log(`    Row ID: ${row.id} | entity_id column: ${row.entity_id}`);
        console.log(`    row_data: ${JSON.stringify(row.row_data, null, 6)}`);
      }
    }
  }

  // 3c: Store-level data (entity_id IS NULL) for store 388
  console.log('\n--- 3c: Store-level data (entity_id IS NULL) for store 388 ---');

  const storeFieldNames = ['storeId', 'Store', 'store', 'Store Number', 'Store_Number', 'store_number', 'StoreNumber', 'Location', 'location'];

  for (const fieldName of storeFieldNames) {
    const { data: storeRows, error: stErr } = await sb
      .from('committed_data')
      .select('id, data_type, period_id, entity_id, row_data, created_at')
      .eq('tenant_id', TENANT_ID)
      .is('entity_id', null)
      .filter(`row_data->>${fieldName}`, 'eq', STORE_ID)
      .order('data_type')
      .limit(200);

    if (stErr) continue;

    if (storeRows && storeRows.length > 0) {
      console.log(`\n  Found ${storeRows.length} store-level rows via row_data.${fieldName} = "${STORE_ID}"`);

      const bySheetPeriod3 = new Map<string, Array<Record<string, unknown>>>();
      for (const row of storeRows) {
        const key = `${row.data_type}|${row.period_id}`;
        if (!bySheetPeriod3.has(key)) bySheetPeriod3.set(key, []);
        bySheetPeriod3.get(key)!.push(row as Record<string, unknown>);
      }

      for (const [key, rows] of Array.from(bySheetPeriod3.entries())) {
        const [sheet, periodId] = key.split('|');
        console.log(`\n  Sheet: "${sheet}" | Period: ${periodId} | Rows: ${rows.length}`);
        for (const row of rows) {
          console.log(`    Row ID: ${row.id}`);
          console.log(`    row_data: ${JSON.stringify(row.row_data, null, 6)}`);
        }
      }
    }
  }

  // 3d: Also try numeric store ID matching
  console.log('\n--- 3d: Store-level data (numeric match) ---');
  for (const fieldName of storeFieldNames) {
    const { data: storeRowsNum, error: stErrNum } = await sb
      .from('committed_data')
      .select('id, data_type, period_id, entity_id, row_data, created_at')
      .eq('tenant_id', TENANT_ID)
      .is('entity_id', null)
      .filter(`row_data->>${fieldName}`, 'eq', '388')
      .order('data_type')
      .limit(200);

    if (stErrNum) continue;

    if (storeRowsNum && storeRowsNum.length > 0) {
      console.log(`  Via row_data.${fieldName} = "388" (string): ${storeRowsNum.length} rows`);
    }
  }

  // 3e: Sample of ALL store-level (null entity_id) data to see field names
  console.log('\n--- 3e: Sample of store-level data (entity_id IS NULL) to discover field patterns ---');
  const { data: sampleStore, error: ssErr } = await sb
    .from('committed_data')
    .select('id, data_type, period_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .is('entity_id', null)
    .limit(10);

  if (ssErr) {
    console.error('  Sample store query error:', ssErr.message);
  } else {
    console.log(`  Sample of ${sampleStore?.length ?? 0} store-level rows:`);
    for (const row of (sampleStore ?? [])) {
      const rd = row.row_data as Record<string, unknown>;
      console.log(`\n    data_type: "${row.data_type}" | period: ${row.period_id}`);
      console.log(`    row_data keys: ${Object.keys(rd || {}).join(', ')}`);
      console.log(`    row_data: ${JSON.stringify(rd, null, 6)}`);
    }
  }

  // 3f: Count all committed_data by data_type for this tenant
  console.log('\n--- 3f: Committed data summary by sheet (data_type) ---');
  const { data: allSheets, error: asErr } = await sb
    .from('committed_data')
    .select('data_type, entity_id')
    .eq('tenant_id', TENANT_ID)
    .limit(50000);

  if (asErr) {
    console.error('  All sheets query error:', asErr.message);
  } else {
    const sheetCounts = new Map<string, { total: number; withEntity: number; nullEntity: number }>();
    for (const row of (allSheets ?? [])) {
      const sheet = row.data_type || '_unknown';
      if (!sheetCounts.has(sheet)) sheetCounts.set(sheet, { total: 0, withEntity: 0, nullEntity: 0 });
      const counts = sheetCounts.get(sheet)!;
      counts.total++;
      if (row.entity_id) counts.withEntity++;
      else counts.nullEntity++;
    }

    console.log(`  Total data_types: ${sheetCounts.size}`);
    for (const [sheet, counts] of Array.from(sheetCounts.entries())) {
      console.log(`    "${sheet}": ${counts.total} rows (${counts.withEntity} with entity, ${counts.nullEntity} null entity)`);
    }
  }

  // 3g: All periods for this tenant
  console.log('\n--- 3g: All periods ---');
  const { data: periods, error: pErr } = await sb
    .from('periods')
    .select('id, canonical_key, label, start_date, end_date')
    .eq('tenant_id', TENANT_ID)
    .order('canonical_key');

  if (pErr) {
    console.error('  Periods query error:', pErr.message);
  } else {
    console.log(`  ${periods?.length ?? 0} periods:`);
    for (const p of (periods ?? [])) {
      console.log(`    ${p.canonical_key} (${p.id}) | ${p.label} | ${p.start_date} - ${p.end_date}`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  OB-85 R5 Phase 0 COMPLETE                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
}

function printComponentConfig(comp: Record<string, unknown>) {
  if (comp.tierConfig) {
    const tc = comp.tierConfig as Record<string, unknown>;
    console.log(`    [Tier Config]`);
    console.log(`      metric: "${tc.metric}"`);
    console.log(`      metricType: "${tc.metricType}"`);
    const tiers = (tc.tiers as Array<Record<string, unknown>>) ?? [];
    for (const t of tiers) {
      console.log(`        ${t.label}: [${t.min}, ${t.max}] -> value=${t.value} rate=${t.rate}`);
    }
    for (const [k, v] of Object.entries(tc)) {
      if (['metric', 'metricType', 'tiers'].includes(k)) continue;
      console.log(`      ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (comp.matrixConfig) {
    const mc = comp.matrixConfig as Record<string, unknown>;
    console.log(`    [Matrix Config]`);
    console.log(`      rowMetric: "${mc.rowMetric}"`);
    console.log(`      columnMetric: "${mc.columnMetric}"`);
    const rowBands = (mc.rowBands as Array<Record<string, unknown>>) ?? [];
    for (const b of rowBands) {
      console.log(`        row: ${b.label}: [${b.min}, ${b.max}]`);
    }
    const colBands = (mc.columnBands as Array<Record<string, unknown>>) ?? [];
    for (const b of colBands) {
      console.log(`        col: ${b.label}: [${b.min}, ${b.max}]`);
    }
    const payouts = mc.payoutMatrix ?? mc.values;
    if (payouts) console.log(`      payoutMatrix: ${JSON.stringify(payouts)}`);
    for (const [k, v] of Object.entries(mc)) {
      if (['rowMetric', 'columnMetric', 'rowBands', 'columnBands', 'payoutMatrix', 'values'].includes(k)) continue;
      console.log(`      ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (comp.percentageConfig) {
    const pc = comp.percentageConfig as Record<string, unknown>;
    console.log(`    [Percentage Config]`);
    for (const [k, v] of Object.entries(pc)) {
      console.log(`      ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (comp.conditionalConfig) {
    const cc = comp.conditionalConfig as Record<string, unknown>;
    console.log(`    [Conditional Config]`);
    console.log(`      appliedTo: "${cc.appliedTo}"`);
    const conditions = (cc.conditions as Array<Record<string, unknown>>) ?? [];
    for (const c of conditions) {
      console.log(`        condition: metric="${c.metric}" [${c.min}, ${c.max}] -> rate=${c.rate}`);
    }
    for (const [k, v] of Object.entries(cc)) {
      if (['appliedTo', 'conditions'].includes(k)) continue;
      console.log(`      ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (comp.directConfig) {
    const dc = comp.directConfig as Record<string, unknown>;
    console.log(`    [Direct Config]`);
    for (const [k, v] of Object.entries(dc)) {
      console.log(`      ${k}: ${JSON.stringify(v)}`);
    }
  }
  const knownConfigs = ['tierConfig', 'matrixConfig', 'percentageConfig', 'conditionalConfig', 'directConfig',
    'name', 'componentType', 'id'];
  for (const [k, v] of Object.entries(comp)) {
    if (knownConfigs.includes(k)) continue;
    console.log(`    ${k}: ${JSON.stringify(v)}`);
  }
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
