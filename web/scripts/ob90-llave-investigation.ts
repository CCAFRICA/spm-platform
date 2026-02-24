/**
 * OB-90: Investigate LLave Tamaño de Tienda and all possible column metrics
 * Try to reverse-engineer the correct column metric source
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

  // Build employee → GT column band map
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

  // Read ALL Base_Venta_Individual rows
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

  // Extract all unique LLave Tamaño de Tienda values
  const llaveValues = new Map<string, { store: string; empId: string; llave: string }>();
  for (const r of viRows) {
    const rd = r.row_data;
    const store = String(rd.num_tienda || '');
    const empId = String(rd.num_empleado || '');
    const llave = String(rd['LLave Tamaño de Tienda'] || '');
    if (llave && !llaveValues.has(store)) {
      llaveValues.set(store, { store, empId, llave });
    }
  }

  // Parse LLave format: "storeId-X"
  console.log('=== LLave Tamaño de Tienda Analysis ===\n');

  // Extract the second part of LLave and correlate with GT column band
  const llaveParts = new Map<string, string>(); // store → second part of LLave
  for (const [store, data] of Array.from(llaveValues.entries())) {
    const parts = data.llave.split('-');
    if (parts.length >= 2) {
      llaveParts.set(store, parts[parts.length - 1]);
    }
  }

  // Count unique second-part values
  const secondPartCounts = new Map<string, number>();
  for (const [, v] of Array.from(llaveParts.entries())) {
    secondPartCounts.set(v, (secondPartCounts.get(v) || 0) + 1);
  }
  console.log('Unique LLave second-part values:');
  for (const [v, c] of Array.from(secondPartCounts.entries()).sort()) {
    console.log(`  "${v}": ${c} stores`);
  }

  // Correlate LLave second-part with GT column band
  console.log('\nLLave second-part vs GT column band:');
  const crossTab = new Map<string, Map<number, number>>();
  for (const [store, part] of Array.from(llaveParts.entries())) {
    const gtCol = storeGTCol.get(store);
    if (gtCol === undefined) continue;
    if (!crossTab.has(part)) crossTab.set(part, new Map());
    const inner = crossTab.get(part)!;
    inner.set(gtCol, (inner.get(gtCol) || 0) + 1);
  }
  for (const [part, colCounts] of Array.from(crossTab.entries()).sort()) {
    const entries = Array.from(colCounts.entries()).sort((a, b) => a[0] - b[0]);
    console.log(`  LLave="${part}" → GT cols: ${entries.map(([col, cnt]) => `${col}:${cnt}`).join(', ')}`);
  }

  // Check what the LLave would say if second part = column band + 1 (1-indexed)
  let llaveMatch = 0, llaveTotal = 0;
  for (const [store, part] of Array.from(llaveParts.entries())) {
    const gtCol = storeGTCol.get(store);
    if (gtCol === undefined) continue;
    llaveTotal++;
    const llaveCol = parseInt(part) - 1; // 1-indexed → 0-indexed
    if (llaveCol === gtCol) llaveMatch++;
  }
  console.log(`\nLLave (part-1) match rate: ${llaveMatch}/${llaveTotal} (${(llaveMatch/llaveTotal*100).toFixed(1)}%)`);

  // Try 0-indexed
  llaveMatch = 0;
  for (const [store, part] of Array.from(llaveParts.entries())) {
    const gtCol = storeGTCol.get(store);
    if (gtCol === undefined) continue;
    const llaveCol = parseInt(part);
    if (llaveCol === gtCol) llaveMatch++;
  }
  console.log(`LLave (direct) match rate: ${llaveMatch}/${llaveTotal} (${(llaveMatch/llaveTotal*100).toFixed(1)}%)`);

  // Try: use ONLY the individual employee's Venta_Individual (not store sum)
  // For each employee, compute their individual column band and compare with GT
  console.log('\n\n=== Per-Employee Individual Venta_Individual ===');
  let indivMatch = 0, indivTotal = 0;
  for (const r of viRows) {
    const rd = r.row_data;
    const empId = String(rd.num_empleado || '');
    const gtCol = empGTCol.get(empId);
    if (gtCol === undefined) continue;
    indivTotal++;
    const venta = typeof rd.Venta_Individual === 'number' ? rd.Venta_Individual : 0;
    if (colBandFor(venta) === gtCol) indivMatch++;
  }
  console.log(`Individual Venta match rate: ${indivMatch}/${indivTotal} (${(indivMatch/indivTotal*100).toFixed(1)}%)`);

  // Try: use individual Meta_Individual
  let metaIndivMatch = 0;
  for (const r of viRows) {
    const rd = r.row_data;
    const empId = String(rd.num_empleado || '');
    const gtCol = empGTCol.get(empId);
    if (gtCol === undefined) continue;
    const meta = typeof rd.Meta_Individual === 'number' ? rd.Meta_Individual : 0;
    if (colBandFor(meta) === gtCol) metaIndivMatch++;
  }
  console.log(`Individual Meta match rate: ${metaIndivMatch}/${indivTotal} (${(metaIndivMatch/indivTotal*100).toFixed(1)}%)`);

  // Try: use suma nivel tienda
  let sumaMatch = 0;
  for (const r of viRows) {
    const rd = r.row_data;
    const empId = String(rd.num_empleado || '');
    const gtCol = empGTCol.get(empId);
    if (gtCol === undefined) continue;
    const suma = typeof rd['suma nivel tienda'] === 'number' ? rd['suma nivel tienda'] : 0;
    if (colBandFor(suma) === gtCol) sumaMatch++;
  }
  console.log(`suma nivel tienda match rate: ${sumaMatch}/${indivTotal} (${(sumaMatch/indivTotal*100).toFixed(1)}%)`);

  // Try: use optical_sales_amount (current enrichment = store sum)
  let optMatch = 0;
  for (const r of viRows) {
    const rd = r.row_data;
    const empId = String(rd.num_empleado || '');
    const gtCol = empGTCol.get(empId);
    if (gtCol === undefined) continue;
    const opt = typeof rd.optical_sales_amount === 'number' ? rd.optical_sales_amount : 0;
    if (colBandFor(opt) === gtCol) optMatch++;
  }
  console.log(`optical_sales_amount match rate: ${optMatch}/${indivTotal} (${(optMatch/indivTotal*100).toFixed(1)}%)`);

  // Try: various transformations of Venta_Individual
  // Maybe it's in pesos × 100 (centavos)?
  let venta100Match = 0;
  for (const r of viRows) {
    const rd = r.row_data;
    const empId = String(rd.num_empleado || '');
    const gtCol = empGTCol.get(empId);
    if (gtCol === undefined) continue;
    const venta = typeof rd.Venta_Individual === 'number' ? rd.Venta_Individual / 100 : 0;
    if (colBandFor(venta) === gtCol) venta100Match++;
  }
  console.log(`Venta_Individual/100 match rate: ${venta100Match}/${indivTotal} (${(venta100Match/indivTotal*100).toFixed(1)}%)`);

  // Print specific stores where LLave-1 matches but Sum Venta doesn't
  console.log('\n\n=== Cross-validation: Stores where LLave maps correctly ===');
  const mismatchedStores = ['387', '10', '23', '298', '468', '121'];
  for (const store of mismatchedStores) {
    const llaveVal = llaveParts.get(store);
    const gtCol = storeGTCol.get(store);
    console.log(`  Store ${store}: LLave part="${llaveVal}", GT col=${gtCol}`);
  }

  // And some matching stores for comparison
  console.log('\n  Matching stores for comparison:');
  const matchedStores = ['1', '143', '1491', '1174', '100', '200'];
  for (const store of matchedStores) {
    const llaveVal = llaveParts.get(store);
    const gtCol = storeGTCol.get(store);
    console.log(`  Store ${store}: LLave part="${llaveVal}", GT col=${gtCol}`);
  }
}

main().catch(console.error);
