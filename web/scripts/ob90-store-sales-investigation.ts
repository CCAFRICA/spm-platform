/**
 * OB-90: Investigate what data source produces the correct column bands
 * For mismatched stores, compare:
 * 1. Sum of Venta_Individual (current engine approach)
 * 2. suma nivel tienda (original field from source data)
 * 3. Sum of Meta_Individual (goals)
 * 4. Individual employee's Venta_Individual
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

const COL_BANDS = [
  { idx: 0, min: 0, max: 59999, label: '<$60K' },
  { idx: 1, min: 60000, max: 99999, label: '$60-100K' },
  { idx: 2, min: 100000, max: 119999, label: '$100-120K' },
  { idx: 3, min: 120000, max: 179999, label: '$120-180K' },
  { idx: 4, min: 180000, max: Infinity, label: '$180K+' },
];

function colBandFor(val: number): number {
  if (val < 60000) return 0;
  if (val < 100000) return 1;
  if (val < 120000) return 2;
  if (val < 180000) return 3;
  return 4;
}

async function main() {
  console.log('=== Store Sales Investigation ===\n');

  // Read GT to get expected column bands per store
  const xlsxPath = path.join(__dirname, 'CLT14B_Reconciliation_Detail.xlsx');
  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const gtRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  // Build store → GT column band map
  const storeGTBand = new Map<string, { colIdx: number; rango: string }>();
  for (let i = 1; i < gtRows.length; i++) {
    const row = gtRows[i];
    const store = String(row?.[1] || '');
    const colIdx = typeof row?.[8] === 'number' ? row[8] as number : parseInt(String(row?.[8] || '0'));
    const rango = String(row?.[6] || '');
    storeGTBand.set(store, { colIdx, rango });
  }

  // Fetch ALL Base_Venta_Individual rows
  const viRows: Array<{
    entity_id: string | null;
    row_data: Record<string, unknown>;
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    viRows.push(...(data as typeof viRows));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Base_Venta_Individual rows: ${viRows.length}`);

  // Get roster entity IDs
  const rosterEntityIds = new Set<string>();
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Datos Colaborador')
      .not('entity_id', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) if (r.entity_id) rosterEntityIds.add(r.entity_id);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Roster entity IDs: ${rosterEntityIds.size}`);

  // Aggregate per store
  interface StoreData {
    store: string;
    sumVentaAll: number;       // Sum of Venta_Individual (all rows)
    sumVentaRoster: number;    // Sum of Venta_Individual (roster-only)
    sumMetaAll: number;        // Sum of Meta_Individual (all rows)
    sumNivelTienda: number;    // suma nivel tienda (from first row)
    rowCount: number;
    rosterRowCount: number;
    employees: Array<{ empId: string; venta: number; meta: number; isRoster: boolean }>;
  }

  const storeMap = new Map<string, StoreData>();
  for (const r of viRows) {
    const rd = r.row_data;
    const store = String(rd.num_tienda || '');
    if (!store) continue;

    const entry = storeMap.get(store) || {
      store,
      sumVentaAll: 0, sumVentaRoster: 0, sumMetaAll: 0,
      sumNivelTienda: 0, rowCount: 0, rosterRowCount: 0,
      employees: [],
    };

    const venta = typeof rd.Venta_Individual === 'number' ? rd.Venta_Individual : 0;
    const meta = typeof rd.Meta_Individual === 'number' ? rd.Meta_Individual : 0;
    const sumNivel = typeof rd['suma nivel tienda'] === 'number' ? rd['suma nivel tienda'] : 0;
    const isRoster = r.entity_id ? rosterEntityIds.has(r.entity_id) : false;

    entry.sumVentaAll += venta;
    entry.sumMetaAll += meta;
    if (isRoster) {
      entry.sumVentaRoster += venta;
      entry.rosterRowCount++;
    }
    entry.rowCount++;
    if (sumNivel > 0) entry.sumNivelTienda = sumNivel;

    const empId = String(rd.num_empleado || rd.entityId || '');
    entry.employees.push({ empId, venta, meta, isRoster });
    storeMap.set(store, entry);
  }

  // For each store, check which metric produces the correct GT column band
  console.log('\nStore-by-store analysis (mismatched stores):');
  console.log('Store | Rows | Roster | SumVenta_All | SumVenta_Roster | SumMeta | sumNivelTienda | GT_Col | Band(VentaAll) | Band(VentaRost) | Band(Meta) | Band(Nivel)');

  let metricMatches = { ventaAll: 0, ventaRoster: 0, meta: 0, nivel: 0 };
  let metricTotal = 0;

  for (const [store, data] of Array.from(storeMap.entries())) {
    const gt = storeGTBand.get(store);
    if (!gt) continue;

    const bandVentaAll = colBandFor(data.sumVentaAll);
    const bandVentaRoster = colBandFor(data.sumVentaRoster);
    const bandMeta = colBandFor(data.sumMetaAll);
    const bandNivel = colBandFor(data.sumNivelTienda);

    metricTotal++;
    if (bandVentaAll === gt.colIdx) metricMatches.ventaAll++;
    if (bandVentaRoster === gt.colIdx) metricMatches.ventaRoster++;
    if (bandMeta === gt.colIdx) metricMatches.meta++;
    if (bandNivel === gt.colIdx) metricMatches.nivel++;

    // Only print mismatched stores (where current engine band ≠ GT)
    if (bandVentaAll !== gt.colIdx) {
      const match_VA = bandVentaAll === gt.colIdx ? '✓' : '✗';
      const match_VR = bandVentaRoster === gt.colIdx ? '✓' : '✗';
      const match_M = bandMeta === gt.colIdx ? '✓' : '✗';
      const match_N = bandNivel === gt.colIdx ? '✓' : '✗';
      console.log(`  ${store} | ${data.rowCount} | ${data.rosterRowCount} | $${Math.round(data.sumVentaAll).toLocaleString()} ${match_VA} | $${Math.round(data.sumVentaRoster).toLocaleString()} ${match_VR} | $${Math.round(data.sumMetaAll).toLocaleString()} ${match_M} | $${Math.round(data.sumNivelTienda).toLocaleString()} ${match_N} | GT=${gt.colIdx}(${gt.rango})`);
    }
  }

  console.log(`\n=== Match Rates (${metricTotal} stores with GT data) ===`);
  console.log(`  Sum Venta_Individual (all): ${metricMatches.ventaAll}/${metricTotal} (${(metricMatches.ventaAll/metricTotal*100).toFixed(1)}%)`);
  console.log(`  Sum Venta_Individual (roster): ${metricMatches.ventaRoster}/${metricTotal} (${(metricMatches.ventaRoster/metricTotal*100).toFixed(1)}%)`);
  console.log(`  Sum Meta_Individual: ${metricMatches.meta}/${metricTotal} (${(metricMatches.meta/metricTotal*100).toFixed(1)}%)`);
  console.log(`  suma nivel tienda: ${metricMatches.nivel}/${metricTotal} (${(metricMatches.nivel/metricTotal*100).toFixed(1)}%)`);

  // Also check: does INDIVIDUAL Venta_Individual match?
  let individualMatch = 0;
  let individualTotal = 0;
  for (const [store, data] of Array.from(storeMap.entries())) {
    const gt = storeGTBand.get(store);
    if (!gt) continue;
    for (const emp of data.employees) {
      if (!emp.isRoster) continue;
      individualTotal++;
      if (colBandFor(emp.venta) === gt.colIdx) individualMatch++;
    }
  }
  console.log(`  Individual Venta_Individual: ${individualMatch}/${individualTotal} (${(individualMatch/individualTotal*100).toFixed(1)}%)`);

  // Show sample employees at a mismatched store
  console.log('\n\n=== Sample: Store 387 ===');
  const store387 = storeMap.get('387');
  if (store387) {
    console.log(`  Rows: ${store387.rowCount}, Roster: ${store387.rosterRowCount}`);
    console.log(`  Sum Venta All: $${Math.round(store387.sumVentaAll).toLocaleString()}`);
    console.log(`  Sum Venta Roster: $${Math.round(store387.sumVentaRoster).toLocaleString()}`);
    console.log(`  Sum Meta: $${Math.round(store387.sumMetaAll).toLocaleString()}`);
    console.log(`  suma nivel tienda: $${Math.round(store387.sumNivelTienda).toLocaleString()}`);
    console.log(`  GT: col ${storeGTBand.get('387')?.colIdx} (${storeGTBand.get('387')?.rango})`);
    console.log('  Employees:');
    for (const emp of store387.employees) {
      console.log(`    ${emp.empId}: Venta=$${Math.round(emp.venta).toLocaleString()}, Meta=$${Math.round(emp.meta).toLocaleString()}, Roster=${emp.isRoster}`);
    }
  }

  console.log('\n=== Sample: Store 10 ===');
  const store10 = storeMap.get('10');
  if (store10) {
    console.log(`  Rows: ${store10.rowCount}, Roster: ${store10.rosterRowCount}`);
    console.log(`  Sum Venta All: $${Math.round(store10.sumVentaAll).toLocaleString()}`);
    console.log(`  Sum Venta Roster: $${Math.round(store10.sumVentaRoster).toLocaleString()}`);
    console.log(`  Sum Meta: $${Math.round(store10.sumMetaAll).toLocaleString()}`);
    console.log(`  suma nivel tienda: $${Math.round(store10.sumNivelTienda).toLocaleString()}`);
    console.log(`  GT: col ${storeGTBand.get('10')?.colIdx} (${storeGTBand.get('10')?.rango})`);
    console.log('  Employees:');
    for (const emp of store10.employees) {
      console.log(`    ${emp.empId}: Venta=$${Math.round(emp.venta).toLocaleString()}, Meta=$${Math.round(emp.meta).toLocaleString()}, Roster=${emp.isRoster}`);
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
