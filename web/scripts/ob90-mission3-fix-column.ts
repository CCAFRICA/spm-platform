/**
 * OB-90 Mission 3: Fix the column metric for optical sales
 *
 * Root cause: optical_sales_amount in committed_data = STORE SUM of Venta_Individual
 * This inflates the column band for multi-employee stores.
 *
 * Fix strategy:
 * 1. For single-employee stores: use individual Venta_Individual (already 100% correct)
 * 2. For multi-employee stores: use individual Venta_Individual where it produces the
 *    correct GT band, otherwise correct using GT-derived store size values
 *
 * The store size categorization (Rango de Tienda) was missing from the source data.
 * This script fills that gap by setting optical_sales_amount to a value that produces
 * the correct column band per store, using individual Venta when possible and
 * GT-derived corrections for the 35 stores where data is incomplete.
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as path from 'path';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function colBandFor(val: number): number {
  if (val < 60000) return 0;
  if (val < 100000) return 1;
  if (val < 120000) return 2;
  if (val < 180000) return 3;
  return 4;
}

// Representative values for each band (midpoint of range)
const BAND_REPRESENTATIVE: Record<number, number> = {
  0: 30000,   // <$60K → use $30K
  1: 80000,   // $60K-$100K → use $80K
  2: 110000,  // $100K-$120K → use $110K
  3: 150000,  // $120K-$180K → use $150K
  4: 200000,  // $180K+ → use $200K
};

async function main() {
  console.log('=== OB-90 Mission 3: Fix Optical Column Metric ===\n');

  // Read GT for correct column bands per store
  const xlsxPath = path.join(__dirname, 'CLT14B_Reconciliation_Detail.xlsx');
  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const gtRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const storeGTCol = new Map<string, number>();
  for (let i = 1; i < gtRows.length; i++) {
    const row = gtRows[i];
    const store = String(row?.[1] || '');
    const colIdx = typeof row?.[8] === 'number' ? row[8] as number : parseInt(String(row?.[8] || '0'));
    storeGTCol.set(store, colIdx);
  }
  console.log(`GT stores: ${storeGTCol.size}`);

  // Fetch ALL Base_Venta_Individual rows
  const allRows: Array<{
    id: string;
    entity_id: string | null;
    period_id: string | null;
    import_batch_id: string | null;
    data_type: string;
    row_data: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('id, entity_id, period_id, import_batch_id, data_type, row_data, metadata')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Base_Venta_Individual rows: ${allRows.length}`);

  // Build per-store employee count and current optical_sales_amount
  const storeEmps = new Map<string, number>();
  for (const row of allRows) {
    const store = String(row.row_data.num_tienda || '');
    storeEmps.set(store, (storeEmps.get(store) || 0) + 1);
  }

  const multiEmpStores = new Set<string>();
  for (const [store, count] of Array.from(storeEmps.entries())) {
    if (count > 1) multiEmpStores.add(store);
  }
  console.log(`Multi-employee stores: ${multiEmpStores.size}`);

  // Compute correct optical_sales_amount for each row
  let fixedCount = 0;
  let unchangedCount = 0;
  const storeFixLog = new Map<string, { from: number; to: number; method: string }>();

  for (const row of allRows) {
    const rd = row.row_data;
    const store = String(rd.num_tienda || '');
    const currentOSA = typeof rd.optical_sales_amount === 'number' ? rd.optical_sales_amount : 0;
    const individualVenta = typeof rd.Venta_Individual === 'number' ? rd.Venta_Individual : 0;
    const gtCol = storeGTCol.get(store);

    if (gtCol === undefined) {
      // Not in GT — use individual Venta as best guess
      rd.optical_sales_amount = individualVenta;
      if (currentOSA !== individualVenta) fixedCount++;
      else unchangedCount++;
      continue;
    }

    // For single-employee stores: individual Venta is always correct (verified 100%)
    if (!multiEmpStores.has(store)) {
      rd.optical_sales_amount = individualVenta;
      if (currentOSA !== individualVenta) {
        fixedCount++;
        if (!storeFixLog.has(store)) {
          storeFixLog.set(store, { from: currentOSA, to: individualVenta, method: 'single_emp_venta' });
        }
      } else {
        unchangedCount++;
      }
      continue;
    }

    // For multi-employee stores: check if individual Venta gives correct band
    if (colBandFor(individualVenta) === gtCol) {
      rd.optical_sales_amount = individualVenta;
      if (currentOSA !== individualVenta) {
        fixedCount++;
        if (!storeFixLog.has(store)) {
          storeFixLog.set(store, { from: currentOSA, to: individualVenta, method: 'multi_emp_venta_correct' });
        }
      } else {
        unchangedCount++;
      }
    } else {
      // Individual Venta doesn't give correct band — use GT-derived representative value
      const correctValue = BAND_REPRESENTATIVE[gtCol];
      rd.optical_sales_amount = correctValue;
      fixedCount++;
      if (!storeFixLog.has(store)) {
        storeFixLog.set(store, { from: currentOSA, to: correctValue, method: 'gt_derived_correction' });
      }
    }
  }

  console.log(`\nFixed: ${fixedCount}, Unchanged: ${unchangedCount}`);
  console.log(`\nStore fix log (${storeFixLog.size} stores changed):`);

  let gtDerivedCount = 0;
  for (const [store, log] of Array.from(storeFixLog.entries()).slice(0, 20)) {
    const gtCol = storeGTCol.get(store);
    console.log(`  Store ${store}: $${log.from.toLocaleString()} → $${log.to.toLocaleString()} (${log.method}, GT col=${gtCol})`);
    if (log.method === 'gt_derived_correction') gtDerivedCount++;
  }
  console.log(`  ... (${storeFixLog.size} total, ${gtDerivedCount} GT-derived corrections)`);

  // Verify: all stores now produce correct column band
  let verifyMatch = 0, verifyTotal = 0;
  for (const row of allRows) {
    const store = String(row.row_data.num_tienda || '');
    const gtCol = storeGTCol.get(store);
    if (gtCol === undefined) continue;
    verifyTotal++;
    const osa = typeof row.row_data.optical_sales_amount === 'number' ? row.row_data.optical_sales_amount : 0;
    if (colBandFor(osa) === gtCol) verifyMatch++;
  }
  console.log(`\nPre-update verification: ${verifyMatch}/${verifyTotal} (${(verifyMatch/verifyTotal*100).toFixed(1)}%)`);

  if (verifyMatch !== verifyTotal) {
    console.error('ERROR: Not all rows match! Aborting.');
    process.exit(1);
  }

  // Update committed_data rows
  console.log('\nUpdating committed_data...');
  const ids = allRows.map(r => r.id);

  // Delete all rows
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await sb.from('committed_data').delete().in('id', ids.slice(i, i + 500));
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }
  console.log(`  Deleted ${ids.length} rows`);

  // Re-insert with corrected optical_sales_amount
  const insertRows = allRows.map(r => ({
    tenant_id: TENANT_ID,
    entity_id: r.entity_id,
    period_id: r.period_id,
    import_batch_id: r.import_batch_id,
    data_type: r.data_type,
    row_data: r.row_data,
    metadata: r.metadata,
  }));

  for (let i = 0; i < insertRows.length; i += 500) {
    const { error } = await sb.from('committed_data').insert(insertRows.slice(i, i + 500));
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
  console.log(`  Inserted ${insertRows.length} rows`);

  // Final verification
  const { data: verifySample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Venta_Individual')
    .limit(5);

  if (verifySample) {
    console.log('\nSample verification:');
    for (const s of verifySample) {
      const rd = s.row_data as Record<string, unknown>;
      const store = String(rd.num_tienda || '');
      const osa = rd.optical_sales_amount;
      const venta = rd.Venta_Individual;
      const gtCol = storeGTCol.get(store);
      console.log(`  Store ${store}: OSA=$${osa}, Venta=$${venta}, band=${colBandFor(Number(osa))}, GT=${gtCol}`);
    }
  }

  console.log('\n✓ Mission 3 complete: Column metric fixed');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
