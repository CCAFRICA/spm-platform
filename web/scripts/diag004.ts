/**
 * DIAG-004: Read-only diagnostic queries — CORRECTED column names
 * No data modifications — SELECT only
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // ─── Query 1.1: committed_data by source_date month ───
  console.log('\n=== Query 1.1: committed_data by source_date month ===');
  let allRows: Array<{ source_date: string | null; entity_id: string | null; import_batch_id: string | null; period_id: string | null; data_type: string | null }> = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page, error } = await supabase
      .from('committed_data')
      .select('source_date, entity_id, import_batch_id, period_id, data_type')
      .eq('tenant_id', TENANT_ID)
      .range(offset, offset + PAGE - 1);
    if (error) { console.log('ERROR:', error.message); break; }
    if (!page || page.length === 0) break;
    allRows = allRows.concat(page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`Total committed_data rows: ${allRows.length}`);

  // Aggregate by month
  const monthMap = new Map<string, { rows: number; entities: Set<string>; batches: Set<string> }>();
  for (const row of allRows) {
    let key = 'NULL';
    if (row.source_date) {
      const d = new Date(row.source_date);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!monthMap.has(key)) monthMap.set(key, { rows: 0, entities: new Set(), batches: new Set() });
    const m = monthMap.get(key)!;
    m.rows++;
    if (row.entity_id) m.entities.add(row.entity_id);
    if (row.import_batch_id) m.batches.add(row.import_batch_id);
  }
  console.log('month    | row_count | entities | batches');
  console.log('---------|-----------|----------|--------');
  for (const [month, data] of Array.from(monthMap.entries()).sort()) {
    console.log(`${month.padEnd(9)}| ${String(data.rows).padEnd(10)}| ${String(data.entities.size).padEnd(9)}| ${data.batches.size}`);
  }

  // ─── Query 1.2: committed_data by import_batch_id ───
  console.log('\n=== Query 1.2: committed_data by import_batch_id ===');
  const { data: allBatches } = await supabase
    .from('import_batches')
    .select('id, file_name, created_at, row_count, status')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: true });

  const ibMap = new Map<string, { file_name: string; created_at: string }>();
  if (allBatches) for (const b of allBatches) ibMap.set(b.id, { file_name: b.file_name || '', created_at: b.created_at || '' });

  const batchAgg = new Map<string, { rows: number; minDate: string | null; maxDate: string | null; dataTypes: Set<string>; periodIds: Set<string> }>();
  for (const row of allRows) {
    const bid = row.import_batch_id || 'NULL';
    if (!batchAgg.has(bid)) batchAgg.set(bid, { rows: 0, minDate: null, maxDate: null, dataTypes: new Set(), periodIds: new Set() });
    const agg = batchAgg.get(bid)!;
    agg.rows++;
    if (row.data_type) agg.dataTypes.add(row.data_type);
    if (row.period_id) agg.periodIds.add(row.period_id);
    if (row.source_date) {
      const sd = row.source_date.substring(0, 10);
      if (!agg.minDate || sd < agg.minDate) agg.minDate = sd;
      if (!agg.maxDate || sd > agg.maxDate) agg.maxDate = sd;
    }
  }

  console.log('batch_id (first 8) | file_name                    | rows | source_dates       | period_ids | data_types');
  console.log('-------------------|------------------------------|------|--------------------|------------|----------');
  for (const [bid, agg] of Array.from(batchAgg.entries()).sort((a, b) => (ibMap.get(a[0])?.created_at || '').localeCompare(ibMap.get(b[0])?.created_at || ''))) {
    const ib = ibMap.get(bid);
    const periods = Array.from(agg.periodIds).map(pid => {
      // Map period_id to label
      return pid.substring(0, 8);
    }).join(',');
    console.log(
      `${bid.substring(0, 18).padEnd(19)}| ${(ib?.file_name || 'unknown').substring(0, 28).padEnd(29)}| ${String(agg.rows).padEnd(5)}| ${(agg.minDate || 'NULL').padEnd(10)} → ${(agg.maxDate || 'NULL').padEnd(10)}| ${periods.padEnd(10)} | ${Array.from(agg.dataTypes).join(',')}`
    );
  }

  // ─── Query 1.3: NULL source_date breakdown ───
  console.log('\n=== Query 1.3: NULL source_date rows ===');
  const nullDateRows = allRows.filter(r => !r.source_date);
  console.log(`NULL source_date rows: ${nullDateRows.length}`);
  if (nullDateRows.length > 0) {
    const byType = new Map<string, number>();
    for (const r of nullDateRows) byType.set(r.data_type || 'null', (byType.get(r.data_type || 'null') || 0) + 1);
    for (const [dt, count] of Array.from(byType.entries())) console.log(`  data_type=${dt}: ${count} rows`);
  }

  // Also count rows WITH source_date but NULL period_id
  const sdNotNull_pidNull = allRows.filter(r => r.source_date && !r.period_id);
  const sdNull_pidNotNull = allRows.filter(r => !r.source_date && r.period_id);
  const sdNotNull_pidNotNull = allRows.filter(r => r.source_date && r.period_id);
  const sdNull_pidNull = allRows.filter(r => !r.source_date && !r.period_id);
  console.log(`\nsource_date/period_id matrix:`);
  console.log(`  source_date + period_id: ${sdNotNull_pidNotNull.length}`);
  console.log(`  source_date + NULL pid:  ${sdNotNull_pidNull.length}`);
  console.log(`  NULL sd + period_id:     ${sdNull_pidNotNull.length}`);
  console.log(`  NULL sd + NULL pid:      ${sdNull_pidNull.length}`);

  // ─── Query 2.1: Valentina Salazar ───
  console.log('\n=== Query 2.1: Valentina Salazar (BCL-5012) ===');
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', TENANT_ID)
    .eq('external_id', 'BCL-5012');
  const entityId = entities?.[0]?.id;
  console.log(`Entity: ${entities?.[0]?.display_name} (${entityId})`);

  // Search by entity_id
  const entityRows = allRows.filter(r => r.entity_id === entityId);
  console.log(`Rows by entity_id match: ${entityRows.length}`);
  for (const r of entityRows) {
    console.log(`  sd=${(r.source_date || 'NULL').substring(0, 10)} pid=${(r.period_id || 'NULL').substring(0, 8)} batch=${(r.import_batch_id || 'NULL').substring(0, 8)} type=${r.data_type}`);
  }

  // Also check: does committed_data store entity_id as UUID or external_id string?
  console.log('\n=== Query 2.2: Sample entity_id values ===');
  const sampleEntityIds = new Set<string>();
  for (const r of allRows.slice(0, 20)) {
    if (r.entity_id) sampleEntityIds.add(r.entity_id);
  }
  console.log(`Sample entity_id values (first 20 rows):`);
  for (const eid of Array.from(sampleEntityIds).slice(0, 5)) {
    console.log(`  ${eid}`);
  }

  // If entity_id is NULL, check row_data for employee ID
  const nullEntityRows = allRows.filter(r => !r.entity_id);
  console.log(`\nRows with NULL entity_id: ${nullEntityRows.length}`);

  // Fetch row_data for a few rows to understand structure
  console.log('\n=== Row data samples per batch ===');
  for (const [bid] of Array.from(batchAgg.entries()).slice(0, 7)) {
    const { data: sample } = await supabase
      .from('committed_data')
      .select('source_date, period_id, entity_id, data_type, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('import_batch_id', bid)
      .limit(2);

    const ib = ibMap.get(bid);
    console.log(`\nBatch: ${bid.substring(0, 8)} (${ib?.file_name || 'unknown'})`);
    if (sample) {
      for (const r of sample) {
        const rd = JSON.stringify(r.row_data || {}).substring(0, 250);
        console.log(`  sd=${(r.source_date || 'NULL').substring(0, 10)} pid=${(r.period_id || 'NULL').substring(0, 8)} eid=${(r.entity_id || 'NULL').substring(0, 8)} type=${r.data_type}`);
        console.log(`  row_data: ${rd}`);
      }
    }
  }

  // ─── Query 3.1: Period definitions ───
  console.log('\n=== Query 3.1: Period definitions ===');
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date, status')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });

  if (periods) {
    console.log('id                                   | label           | start_date | end_date   | status');
    console.log('-------------------------------------|-----------------|------------|------------|-------');
    for (const p of periods) {
      console.log(`${p.id} | ${(p.label || p.canonical_key || '').padEnd(15)} | ${(p.start_date || '').substring(0, 10)} | ${(p.end_date || '').substring(0, 10)} | ${p.status}`);
    }
  }

  // ─── Query 3.2: February source_date rows ───
  console.log('\n=== Query 3.2: Rows matching February 2026 date range ===');
  const febBySD = allRows.filter(r => r.source_date && r.source_date >= '2026-02-01' && r.source_date < '2026-03-01');
  console.log(`By source_date (Feb): ${febBySD.length}`);

  const febPeriodId = periods?.find(p => p.label === 'February 2026')?.id;
  const febByPID = allRows.filter(r => r.period_id === febPeriodId);
  console.log(`By period_id (Feb): ${febByPID.length}`);
  console.log(`Feb period_id: ${febPeriodId}`);

  // ─── Query 3.3: All distinct source_dates ───
  console.log('\n=== Query 3.3: All distinct source_dates ===');
  const dateCounts = new Map<string, number>();
  for (const r of allRows) {
    const d = r.source_date ? r.source_date.substring(0, 10) : 'NULL';
    dateCounts.set(d, (dateCounts.get(d) || 0) + 1);
  }
  for (const [date, count] of Array.from(dateCounts.entries()).sort()) {
    console.log(`  ${date}: ${count} rows`);
  }

  // ─── Query 4.1: What engine sees for February ───
  console.log('\n=== Query 4.1: Engine simulation for February ===');
  if (febPeriodId && periods) {
    const febPeriod = periods.find(p => p.id === febPeriodId)!;
    console.log(`Period: ${febPeriod.label} (${febPeriod.start_date} to ${febPeriod.end_date})`);

    // Source_date path
    const sdPath = allRows.filter(r =>
      r.source_date && r.source_date >= febPeriod.start_date && r.source_date <= febPeriod.end_date
    );
    console.log(`Source_date path (${febPeriod.start_date}..${febPeriod.end_date}): ${sdPath.length} rows`);

    // Period_id fallback
    const pidPath = allRows.filter(r => r.period_id === febPeriodId);
    console.log(`Period_id fallback: ${pidPath.length} rows`);

    // NULL path (personal/roster)
    const nullPath = allRows.filter(r => !r.source_date && !r.period_id);
    console.log(`NULL path (personal): ${nullPath.length} rows`);

    console.log(`Total engine would fetch: ${sdPath.length > 0 ? sdPath.length + nullPath.length : pidPath.length + nullPath.length}`);
  }

  // Compare with January (which works)
  console.log('\n=== Query 4.1b: Engine simulation for January (comparison) ===');
  const janPeriodId = periods?.find(p => p.label === 'January 2026')?.id;
  if (janPeriodId && periods) {
    const janPeriod = periods.find(p => p.id === janPeriodId)!;
    const sdPath = allRows.filter(r =>
      r.source_date && r.source_date >= janPeriod.start_date && r.source_date <= janPeriod.end_date
    );
    console.log(`Source_date path (${janPeriod.start_date}..${janPeriod.end_date}): ${sdPath.length} rows`);
    const pidPath = allRows.filter(r => r.period_id === janPeriodId);
    console.log(`Period_id fallback: ${pidPath.length} rows`);
    const nullPath = allRows.filter(r => !r.source_date && !r.period_id);
    console.log(`NULL path (personal): ${nullPath.length} rows`);
  }

  // ─── Query 4.2: Convergence bindings ───
  console.log('\n=== Query 4.2: Convergence bindings ===');
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('id', 'f270f34c-d49e-42e6-a82b-eb7535e736d9')
    .single();

  if (ruleSet) {
    console.log(`Plan: ${ruleSet.name}`);
    const ib = ruleSet.input_bindings as Record<string, unknown> | null;
    const cb = ib?.convergence_bindings as Record<string, unknown> | undefined;
    if (cb) {
      // Extract source_batch_ids from all component bindings
      console.log('\nConvergence binding source_batch_ids:');
      for (const [compKey, bindings] of Object.entries(cb)) {
        const b = bindings as Record<string, unknown>;
        const batchIds = new Set<string>();
        for (const [role, binding] of Object.entries(b)) {
          const bd = binding as Record<string, unknown>;
          if (bd.source_batch_id) batchIds.add(bd.source_batch_id as string);
        }
        console.log(`  ${compKey}: batch_ids = [${Array.from(batchIds).map(id => id.substring(0, 8)).join(', ')}]`);
        // Map to file names
        for (const bid of Array.from(batchIds)) {
          const ib = ibMap.get(bid);
          console.log(`    ${bid.substring(0, 8)} → ${ib?.file_name || 'NOT FOUND'} (${ib?.created_at?.substring(0, 19) || ''})`);
        }
      }
    }
  }

  // ─── Bonus: Calculation batches ───
  console.log('\n=== Bonus: Calculation batches by period ===');
  const { data: calcBatches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, lifecycle_state, entity_count, summary, created_at')
    .eq('tenant_id', TENANT_ID)
    .is('superseded_by', null)
    .order('created_at', { ascending: true });

  if (calcBatches && periods) {
    for (const cb of calcBatches) {
      const period = periods.find(p => p.id === cb.period_id);
      const summary = cb.summary as Record<string, unknown> | null;
      console.log(`${(period?.label || 'unknown').padEnd(16)} | batch=${cb.id.substring(0, 8)} | state=${cb.lifecycle_state?.padEnd(10)} | entities=${cb.entity_count} | total=${summary?.total_payout || 'N/A'}`);
    }
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

main().catch(console.error);
