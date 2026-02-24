/**
 * OB-90: Check roster (Datos Colaborador) for store-level optical data,
 * and analyze single vs multi-employee store mismatch patterns
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

  // 1. Check Datos Colaborador for ALL fields
  console.log('=== Datos Colaborador: ALL fields (first row) ===');
  const { data: rosterSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Datos Colaborador')
    .limit(1);
  if (rosterSample?.[0]) {
    for (const [k, v] of Object.entries(rosterSample[0].row_data as Record<string, unknown>)) {
      console.log(`  ${k}: ${JSON.stringify(v)} (${typeof v})`);
    }
  }

  // Check store 10 employees in roster
  console.log('\n=== Datos Colaborador: Store 10 employees ===');
  let page = 0;
  const allRosterRows: Array<{ row_data: Record<string, unknown> }> = [];
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Datos Colaborador')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allRosterRows.push(...(data as typeof allRosterRows));
    if (data.length < 1000) break;
    page++;
  }

  for (const r of allRosterRows) {
    const rd = r.row_data;
    if (String(rd.num_tienda || rd.Tienda || '') === '10') {
      console.log(`  Employee ${rd.num_empleado || rd.Empleado}:`);
      for (const [k, v] of Object.entries(rd)) {
        if (typeof v === 'number' || k.toLowerCase().includes('tienda') || k.toLowerCase().includes('store') || k.toLowerCase().includes('venta') || k.toLowerCase().includes('meta') || k.toLowerCase().includes('rango')) {
          console.log(`    ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
  }

  // 2. Fetch all Base_Venta_Individual
  const viRows: Array<{ row_data: Record<string, unknown> }> = [];
  page = 0;
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

  // Build store → employees map
  const storeEmps = new Map<string, Array<{ empId: string; venta: number; meta: number }>>();
  for (const r of viRows) {
    const rd = r.row_data;
    const store = String(rd.num_tienda || '');
    const empId = String(rd.num_empleado || '');
    const venta = typeof rd.Venta_Individual === 'number' ? rd.Venta_Individual : 0;
    const meta = typeof rd.Meta_Individual === 'number' ? rd.Meta_Individual : 0;
    if (!store) continue;
    if (!storeEmps.has(store)) storeEmps.set(store, []);
    storeEmps.get(store)!.push({ empId, venta, meta });
  }

  // 3. Analyze single vs multi-employee stores
  let singleTotal = 0, singleMatch = 0;
  let multiTotal = 0, multiMatch = 0;
  let singleMismatches: Array<{ store: string; venta: number; gtCol: number; gotCol: number }> = [];
  let multiMismatches: Array<{ store: string; empCount: number; sumVenta: number; gtCol: number; gotCol: number }> = [];

  for (const [store, emps] of Array.from(storeEmps.entries())) {
    const gtCol = storeGTCol.get(store);
    if (gtCol === undefined) continue;

    const sumVenta = emps.reduce((s, e) => s + e.venta, 0);
    const gotCol = colBandFor(sumVenta);

    if (emps.length === 1) {
      singleTotal++;
      if (gotCol === gtCol) {
        singleMatch++;
      } else {
        singleMismatches.push({ store, venta: emps[0].venta, gtCol, gotCol });
      }
    } else {
      multiTotal++;
      if (gotCol === gtCol) {
        multiMatch++;
      } else {
        multiMismatches.push({ store, empCount: emps.length, sumVenta, gtCol, gotCol });
      }
    }
  }

  console.log('\n\n=== Single vs Multi-Employee Store Analysis ===');
  console.log(`Single-employee stores: ${singleMatch}/${singleTotal} match (${(singleMatch/singleTotal*100).toFixed(1)}%)`);
  console.log(`Multi-employee stores: ${multiMatch}/${multiTotal} match (${(multiMatch/multiTotal*100).toFixed(1)}%)`);

  console.log(`\nSingle-employee mismatches (${singleMismatches.length}):`);
  for (const m of singleMismatches.slice(0, 10)) {
    console.log(`  Store ${m.store}: Venta=$${m.venta.toLocaleString()} (band ${m.gotCol}), GT col=${m.gtCol}`);
  }

  console.log(`\nMulti-employee mismatches (${multiMismatches.length}):`);
  for (const m of multiMismatches) {
    console.log(`  Store ${m.store}: ${m.empCount} emps, SumVenta=$${m.sumVenta.toLocaleString()} (band ${m.gotCol}), GT col=${m.gtCol}`);
    const emps = storeEmps.get(m.store)!;
    for (const e of emps) {
      console.log(`    ${e.empId}: Venta=$${e.venta.toLocaleString()} (band ${colBandFor(e.venta)})`);
    }
  }

  // 4. For single-employee mismatches, what value WOULD produce correct band?
  console.log('\n\n=== Single-employee mismatch analysis ===');
  const bands = [[0, 59999], [60000, 99999], [100000, 119999], [120000, 179999], [180000, Infinity]];
  for (const m of singleMismatches) {
    const needed = bands[m.gtCol];
    console.log(`  Store ${m.store}: Venta=$${m.venta.toLocaleString()}, GT needs $${needed[0].toLocaleString()}-$${needed[1] === Infinity ? '∞' : needed[1].toLocaleString()}`);
    // What fraction of Venta would work?
    if (m.venta > 0 && needed[0] > 0) {
      console.log(`    Ratio: Venta/needed_min = ${(m.venta / needed[0]).toFixed(2)}, Venta/needed_max = ${(m.venta / (needed[1] === Infinity ? m.venta : needed[1])).toFixed(2)}`);
    }
  }

  // 5. For multi-employee stores, check if INDIVIDUAL Venta matches GT
  console.log('\n\n=== Multi-employee: Individual Venta vs GT ===');
  let multiIndivMatch = 0, multiIndivTotal = 0;
  for (const [store, emps] of Array.from(storeEmps.entries())) {
    if (emps.length <= 1) continue;
    for (const emp of emps) {
      const gtCol = empGTCol.get(emp.empId);
      if (gtCol === undefined) continue;
      multiIndivTotal++;
      if (colBandFor(emp.venta) === gtCol) multiIndivMatch++;
    }
  }
  console.log(`Individual Venta at multi-employee stores: ${multiIndivMatch}/${multiIndivTotal} match (${(multiIndivMatch/multiIndivTotal*100).toFixed(1)}%)`);

  // 6. KEY INSIGHT: For multi-employee mismatched stores, what is their INDIVIDUAL Venta band?
  console.log('\n=== Multi-employee mismatches: Individual bands ===');
  for (const m of multiMismatches.slice(0, 10)) {
    const emps = storeEmps.get(m.store)!;
    console.log(`  Store ${m.store} (GT col=${m.gtCol}):`);
    for (const e of emps) {
      const indivBand = colBandFor(e.venta);
      const empGT = empGTCol.get(e.empId);
      console.log(`    ${e.empId}: Venta=$${e.venta.toLocaleString()} → band ${indivBand} (GT=${empGT}) ${indivBand === empGT ? '✓' : '✗'}`);
    }
  }

  // 7. How many individual employees at multi-employee stores have Venta matching GT band?
  // And how many DON'T?
  console.log('\n\n=== Multi-employee store: patterns in mismatches ===');
  let allHigher = 0, allLower = 0, mixed = 0;
  for (const m of multiMismatches) {
    const emps = storeEmps.get(m.store)!;
    let anyMatch = false, allSameWay = true;
    let firstDirection = 0;
    for (const e of emps) {
      const empGT = empGTCol.get(e.empId);
      if (empGT === undefined) continue;
      const indivBand = colBandFor(e.venta);
      if (indivBand === empGT) anyMatch = true;
      const dir = indivBand - empGT;
      if (firstDirection === 0) firstDirection = dir;
      if (dir !== firstDirection) allSameWay = false;
    }
    if (firstDirection > 0) allHigher++;
    else if (firstDirection < 0) allLower++;
    else mixed++;
  }
  console.log(`Direction of mismatches: higher=${allHigher}, lower=${allLower}, mixed=${mixed}`);
}

main().catch(console.error);
