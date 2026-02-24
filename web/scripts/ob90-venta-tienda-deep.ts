/**
 * OB-90: Deep dive into Base_Venta_Tienda — the column metric MUST come from here
 * Since NO Base_Venta_Individual field works, check Base_Venta_Tienda for ALL fields
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

async function main() {
  // Read GT
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

  // Fetch ALL Base_Venta_Tienda rows
  const vtRows: Array<{ row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Tienda')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    vtRows.push(...(data as typeof vtRows));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Loaded ${vtRows.length} Base_Venta_Tienda rows\n`);

  // Dump ALL fields from first row
  console.log('=== ALL fields from first Base_Venta_Tienda row ===');
  if (vtRows[0]) {
    for (const [k, v] of Object.entries(vtRows[0].row_data)) {
      console.log(`  ${k}: ${JSON.stringify(v)} (${typeof v})`);
    }
  }

  // Collect ALL unique field names and their ranges
  const fieldStats = new Map<string, { count: number; min: number; max: number; nonZero: number }>();
  for (const r of vtRows) {
    for (const [k, v] of Object.entries(r.row_data)) {
      if (typeof v === 'number') {
        const stat = fieldStats.get(k) || { count: 0, min: Infinity, max: -Infinity, nonZero: 0 };
        stat.count++;
        stat.min = Math.min(stat.min, v);
        stat.max = Math.max(stat.max, v);
        if (v !== 0) stat.nonZero++;
        fieldStats.set(k, stat);
      }
    }
  }

  console.log('\n=== Numeric field ranges in Base_Venta_Tienda ===');
  for (const [k, v] of Array.from(fieldStats.entries()).sort()) {
    console.log(`  ${k}: count=${v.count}, min=${v.min}, max=${v.max}, nonZero=${v.nonZero}`);
  }

  // What's the store identifier field?
  const storeIdFields = ['Tienda', 'storeId', 'num_tienda', 'store', 'Store', 'tienda', 'Num_Tienda'];
  for (const field of storeIdFields) {
    const vals = new Set<string>();
    for (const r of vtRows) {
      const v = r.row_data[field];
      if (v !== undefined && v !== null) vals.add(String(v));
    }
    if (vals.size > 0) {
      console.log(`\nField "${field}": ${vals.size} unique values, samples: ${Array.from(vals).slice(0, 5).join(', ')}`);
    }
  }

  // Build store → VT data map
  // Find the store ID field
  let storeField = '';
  for (const r of vtRows) {
    for (const candidate of ['Tienda', 'num_tienda', 'storeId', 'store']) {
      if (r.row_data[candidate] !== undefined) {
        storeField = candidate;
        break;
      }
    }
    if (storeField) break;
  }
  console.log(`\nUsing store field: "${storeField}"`);

  const storeVT = new Map<string, Record<string, unknown>>();
  for (const r of vtRows) {
    const store = String(r.row_data[storeField] || '');
    if (store) storeVT.set(store, r.row_data);
  }

  // For each numeric field in VT, test as column metric
  console.log('\n\n=== Column metric match rates from Base_Venta_Tienda ===');
  const numericFields = Array.from(fieldStats.keys()).filter(k => fieldStats.get(k)!.nonZero > 0);

  const results: Array<{ field: string; matches: number; total: number; rate: number }> = [];
  for (const field of numericFields) {
    let matches = 0, total = 0;
    for (const [store, vtData] of Array.from(storeVT.entries())) {
      const gtCol = storeGTCol.get(store);
      if (gtCol === undefined) continue;
      total++;
      const v = typeof vtData[field] === 'number' ? vtData[field] as number : 0;
      if (colBandFor(v) === gtCol) matches++;
    }
    if (total > 0) {
      results.push({ field, matches, total, rate: matches / total });
    }
  }

  results.sort((a, b) => b.rate - a.rate);
  for (const { field, matches, total, rate } of results) {
    console.log(`  ${field}: ${matches}/${total} (${(rate * 100).toFixed(1)}%)`);
  }

  // Show mismatched stores in VT
  console.log('\n\n=== Mismatched stores in Base_Venta_Tienda ===');
  const mismatchStores = ['10', '23', '298', '387', '468'];
  for (const store of mismatchStores) {
    const vtData = storeVT.get(store);
    const gtCol = storeGTCol.get(store);
    if (!vtData) {
      console.log(`  Store ${store}: NOT FOUND in Base_Venta_Tienda`);
      continue;
    }
    console.log(`  Store ${store} (GT col=${gtCol}):`);
    for (const [k, v] of Object.entries(vtData)) {
      if (typeof v === 'number' && v > 0) {
        console.log(`    ${k}: ${v} → band ${colBandFor(v)}`);
      }
    }
  }

  // Also try: VT field / N (number of employees per store)
  // First count employees per store from VI
  console.log('\n\n=== Trying VT fields divided by employee count ===');
  const viRows2: Array<{ row_data: Record<string, unknown> }> = [];
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    viRows2.push(...(data as typeof viRows2));
    if (data.length < 1000) break;
    page++;
  }

  const storeEmpCount = new Map<string, number>();
  for (const r of viRows2) {
    const store = String(r.row_data.num_tienda || '');
    if (store) storeEmpCount.set(store, (storeEmpCount.get(store) || 0) + 1);
  }

  // For top VT fields, try dividing by employee count
  const topFields = results.slice(0, 5).map(r => r.field);
  for (const field of topFields) {
    let matches = 0, total = 0;
    for (const [store, vtData] of Array.from(storeVT.entries())) {
      const gtCol = storeGTCol.get(store);
      if (gtCol === undefined) continue;
      total++;
      const v = typeof vtData[field] === 'number' ? vtData[field] as number : 0;
      const empCount = storeEmpCount.get(store) || 1;
      if (colBandFor(v / empCount) === gtCol) matches++;
    }
    console.log(`  ${field}/empCount: ${matches}/${total} (${(matches/total*100).toFixed(1)}%)`);
  }

  // Also check: is there a "Venta Optica" or "Optical" field in VT?
  console.log('\n=== String fields containing "optic" or "venta" (case-insensitive) ===');
  for (const r of vtRows.slice(0, 1)) {
    for (const [k, v] of Object.entries(r.row_data)) {
      const kl = k.toLowerCase();
      if (kl.includes('optic') || kl.includes('venta') || kl.includes('sale') || kl.includes('optical')) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // Count how many stores from GT are in VT
  let gtInVt = 0;
  for (const store of Array.from(storeGTCol.keys())) {
    if (storeVT.has(store)) gtInVt++;
  }
  console.log(`\nGT stores found in VT: ${gtInVt}/${storeGTCol.size}`);
}

main().catch(console.error);
