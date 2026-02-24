/**
 * OB-90: Exhaustive field hunt for the correct column metric
 * For mismatched stores, test EVERY numeric field as a potential column metric source
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

  // Build employee → GT column band map, and store → GT col
  const empGTCol = new Map<string, number>();
  const storeGTCol = new Map<string, number>();
  for (let i = 1; i < gtRows.length; i++) {
    const row = gtRows[i];
    const empId = String(row?.[0] || '');
    const store = String(row?.[1] || '');
    const colIdx = typeof row?.[8] === 'number' ? row[8] as number : parseInt(String(row?.[8] || '0'));
    empGTCol.set(empId, colIdx);
    storeGTCol.set(store, colIdx);
  }

  // Fetch ALL Base_Venta_Individual rows
  const viRows: Array<{ row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    viRows.push(...(data as typeof viRows));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Loaded ${viRows.length} Base_Venta_Individual rows\n`);

  // Collect ALL unique field names and their types
  const fieldStats = new Map<string, { numericCount: number; samples: number[] }>();
  for (const r of viRows) {
    for (const [k, v] of Object.entries(r.row_data)) {
      if (typeof v === 'number') {
        const stat = fieldStats.get(k) || { numericCount: 0, samples: [] };
        stat.numericCount++;
        if (stat.samples.length < 5) stat.samples.push(v);
        fieldStats.set(k, stat);
      }
    }
  }

  console.log('=== All numeric fields in Base_Venta_Individual ===');
  for (const [k, v] of Array.from(fieldStats.entries()).sort((a, b) => b[1].numericCount - a[1].numericCount)) {
    console.log(`  ${k}: ${v.numericCount} numeric values, samples: ${v.samples.join(', ')}`);
  }

  // For EVERY numeric field, compute per-store SUM and per-employee INDIVIDUAL match rates
  console.log('\n\n=== Per-field match rates (STORE SUM) ===');
  const numericFields = Array.from(fieldStats.keys());

  // Aggregate per store per field
  const storeFieldSums = new Map<string, Map<string, number>>(); // store → field → sum
  for (const r of viRows) {
    const rd = r.row_data;
    const store = String(rd.num_tienda || '');
    if (!store) continue;
    if (!storeFieldSums.has(store)) storeFieldSums.set(store, new Map());
    const sums = storeFieldSums.get(store)!;
    for (const field of numericFields) {
      const v = typeof rd[field] === 'number' ? rd[field] as number : 0;
      sums.set(field, (sums.get(field) || 0) + v);
    }
  }

  // For each field, compute store-sum match rate
  const fieldMatchRates: Array<{ field: string; matches: number; total: number; rate: number }> = [];
  for (const field of numericFields) {
    let matches = 0, total = 0;
    for (const [store, sums] of Array.from(storeFieldSums.entries())) {
      const gtCol = storeGTCol.get(store);
      if (gtCol === undefined) continue;
      total++;
      const sum = sums.get(field) || 0;
      if (colBandFor(sum) === gtCol) matches++;
    }
    if (total > 0) {
      fieldMatchRates.push({ field, matches, total, rate: matches / total });
    }
  }

  fieldMatchRates.sort((a, b) => b.rate - a.rate);
  for (const { field, matches, total, rate } of fieldMatchRates) {
    console.log(`  ${field}: ${matches}/${total} (${(rate * 100).toFixed(1)}%)`);
  }

  // Also try per-EMPLOYEE (individual value, not store sum) match
  console.log('\n\n=== Per-field match rates (INDIVIDUAL EMPLOYEE) ===');
  const empFieldMatches: Array<{ field: string; matches: number; total: number; rate: number }> = [];
  for (const field of numericFields) {
    let matches = 0, total = 0;
    for (const r of viRows) {
      const rd = r.row_data;
      const empId = String(rd.num_empleado || '');
      const gtCol = empGTCol.get(empId);
      if (gtCol === undefined) continue;
      total++;
      const v = typeof rd[field] === 'number' ? rd[field] as number : 0;
      if (colBandFor(v) === gtCol) matches++;
    }
    if (total > 0) {
      empFieldMatches.push({ field, matches, total, rate: matches / total });
    }
  }
  empFieldMatches.sort((a, b) => b.rate - a.rate);
  for (const { field, matches, total, rate } of empFieldMatches) {
    console.log(`  ${field}: ${matches}/${total} (${(rate * 100).toFixed(1)}%)`);
  }

  // For the top mismatched stores, show the actual field values vs GT
  console.log('\n\n=== Mismatched store detail (store 10) ===');
  for (const r of viRows) {
    const rd = r.row_data;
    if (String(rd.num_tienda) === '10') {
      console.log(`  Employee ${rd.num_empleado}:`);
      for (const [k, v] of Object.entries(rd)) {
        if (typeof v === 'number') {
          console.log(`    ${k}: ${v} → band ${colBandFor(v)}`);
        }
      }
      console.log(`    GT col: ${empGTCol.get(String(rd.num_empleado))}`);
    }
  }

  // Check what the GT column band MEANS for these stores
  // GT col 0 = <$60K. But individual Venta is $87K+. So what VALUE would map to col 0?
  console.log('\n\n=== What value would produce correct column band for mismatched stores? ===');
  const mismatchStores = ['10', '23', '298', '387', '468'];
  for (const store of mismatchStores) {
    const gtCol = storeGTCol.get(store);
    const sums = storeFieldSums.get(store);
    if (gtCol === undefined || !sums) continue;
    const ventaSum = sums.get('Venta_Individual') || 0;
    const bandNeeded = gtCol;
    const bandGot = colBandFor(ventaSum);
    console.log(`  Store ${store}: GT col=${gtCol}, Venta sum=$${Math.round(ventaSum).toLocaleString()} (band ${bandGot})`);
    // What band boundaries does GT col correspond to?
    const bands = [[0, 59999], [60000, 99999], [100000, 119999], [120000, 179999], [180000, Infinity]];
    console.log(`    Need value in range: $${bands[bandNeeded][0].toLocaleString()}-$${bands[bandNeeded][1].toLocaleString()}`);
  }

  // Check: is there a data_type with optical store sales?
  console.log('\n\n=== Check for other data types that might have optical store sales ===');
  const { data: dtypes } = await sb.from('committed_data')
    .select('data_type')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .limit(10000);
  const dtCounts = new Map<string, number>();
  for (const d of dtypes || []) {
    dtCounts.set(d.data_type, (dtCounts.get(d.data_type) || 0) + 1);
  }
  console.log('Data types:');
  for (const [dt, count] of Array.from(dtCounts.entries()).sort()) {
    console.log(`  ${dt}: ${count} rows`);
  }

  // Check: what does Rango de Tienda look like across rows?
  console.log('\n\n=== Rango de Tienda values ===');
  const rangoValues = new Map<string, number>();
  for (const r of viRows) {
    const rango = String(r.row_data['Rango de Tienda'] ?? 'NULL');
    rangoValues.set(rango, (rangoValues.get(rango) || 0) + 1);
  }
  for (const [v, c] of Array.from(rangoValues.entries())) {
    console.log(`  "${v}": ${c} rows`);
  }

  // Check: GT file column 6 is "C1_Rango" - what values does it have?
  console.log('\n\n=== GT C1_Rango values (column 6) ===');
  const gtRangoCounts = new Map<string, number>();
  for (let i = 1; i < gtRows.length; i++) {
    const rango = String(gtRows[i]?.[6] || '');
    gtRangoCounts.set(rango, (gtRangoCounts.get(rango) || 0) + 1);
  }
  for (const [v, c] of Array.from(gtRangoCounts.entries()).sort()) {
    console.log(`  "${v}": ${c} rows`);
  }
}

main().catch(console.error);
