/**
 * OB-90: Check rule_set component configuration for column metric source
 * Also: For multi-employee stores, what if the column metric is from
 * the ORIGINAL source data (before enrichment aggregated per-store)?
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as path from 'path';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';
const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';

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
  // 1. Read rule_set optical sales component configuration
  const { data: ruleSet } = await sb.from('rule_sets')
    .select('components')
    .eq('id', RULE_SET_ID)
    .single();

  if (ruleSet?.components) {
    const components = ruleSet.components as unknown[];
    // Find optical sales component (first component, typically index 0)
    for (let i = 0; i < (components as Array<{ variants?: unknown[] }>).length; i++) {
      const comp = (components as Array<Record<string, unknown>>)[i];
      if (String(comp.name || '').toLowerCase().includes('optical') ||
          String(comp.name || '').toLowerCase().includes('venta') ||
          i === 0) {
        console.log(`=== Component ${i}: ${comp.name} ===`);
        console.log(`Type: ${comp.type}`);
        console.log(`Weight: ${comp.weight}`);

        // Check for any column metric configuration
        if (comp.columnMetric) console.log(`columnMetric: ${JSON.stringify(comp.columnMetric)}`);
        if (comp.columnField) console.log(`columnField: ${JSON.stringify(comp.columnField)}`);
        if (comp.columnSource) console.log(`columnSource: ${JSON.stringify(comp.columnSource)}`);

        // Print the full component config (limited)
        const keys = Object.keys(comp);
        console.log(`Keys: ${keys.join(', ')}`);

        // Check variants for column metric info
        if (Array.isArray(comp.variants)) {
          for (const variant of comp.variants) {
            const v = variant as Record<string, unknown>;
            console.log(`\n  Variant: ${v.variantName}`);
            if (v.matrix) {
              const matrix = v.matrix as Record<string, unknown>;
              console.log(`  Matrix keys: ${Object.keys(matrix).join(', ')}`);
              if (matrix.columnMetric) console.log(`  columnMetric: ${JSON.stringify(matrix.columnMetric)}`);
              if (matrix.columnField) console.log(`  columnField: ${JSON.stringify(matrix.columnField)}`);
              if (matrix.rowMetric) console.log(`  rowMetric: ${JSON.stringify(matrix.rowMetric)}`);
              if (matrix.rowField) console.log(`  rowField: ${JSON.stringify(matrix.rowField)}`);
              if (matrix.columnBands) console.log(`  columnBands: ${JSON.stringify(matrix.columnBands)}`);
              if (matrix.rowBands) console.log(`  rowBands: ${JSON.stringify(matrix.rowBands)}`);
              if (matrix.columns) console.log(`  columns: ${JSON.stringify(matrix.columns)}`);
              if (matrix.rows) console.log(`  rows: ${JSON.stringify(matrix.rows)}`);
              // Print ALL keys
              console.log(`  ALL matrix keys: ${Object.keys(matrix).join(', ')}`);
              for (const [mk, mv] of Object.entries(matrix)) {
                if (mk !== 'values' && mk !== 'rows' && mk !== 'columns') {
                  console.log(`  ${mk}: ${JSON.stringify(mv)}`);
                }
              }
            }
          }
        }
        console.log('');
      }
    }
  }

  // 2. Check HOW optical_sales_amount is computed in the enrichment
  // Look at the calculation run route for optical enrichment logic
  console.log('\n=== Checking optical_sales_amount enrichment origin ===');

  // The enrichment happens in the import pipeline. Let me check if there's
  // a difference between row_data fields that were ORIGINAL vs ENRICHED
  // by looking at committed_data for Base_Venta_Individual

  // Get a sample row and identify original vs enriched fields
  const { data: sample } = await sb.from('committed_data')
    .select('row_data, metadata')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Venta_Individual')
    .limit(3);

  if (sample) {
    for (const s of sample) {
      const rd = s.row_data as Record<string, unknown>;
      console.log('\nSample row fields:');
      for (const [k, v] of Object.entries(rd)) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
      if (s.metadata) {
        console.log('  Metadata:', JSON.stringify(s.metadata));
      }
      break; // just one
    }
  }

  // 3. Read GT and investigate the relationship between column bands and META
  const xlsxPath = path.join(__dirname, 'CLT14B_Reconciliation_Detail.xlsx');
  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const gtRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  // Build store → GT col map
  const storeGTCol = new Map<string, number>();
  for (let i = 1; i < gtRows.length; i++) {
    const row = gtRows[i];
    const store = String(row?.[1] || '');
    const colIdx = typeof row?.[8] === 'number' ? row[8] as number : parseInt(String(row?.[8] || '0'));
    storeGTCol.set(store, colIdx);
  }

  // 4. Load all VI rows and compute alternative column metrics
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

  // Build per-store data
  const storeData = new Map<string, Array<{ venta: number; meta: number; suma: number }>>();
  for (const r of viRows) {
    const rd = r.row_data;
    const store = String(rd.num_tienda || '');
    if (!store) continue;
    if (!storeData.has(store)) storeData.set(store, []);
    storeData.get(store)!.push({
      venta: typeof rd.Venta_Individual === 'number' ? rd.Venta_Individual : 0,
      meta: typeof rd.Meta_Individual === 'number' ? rd.Meta_Individual : 0,
      suma: typeof rd['suma nivel tienda'] === 'number' ? rd['suma nivel tienda'] : 0,
    });
  }

  // 5. Test MANY alternative column metrics for multi-employee stores
  console.log('\n\n=== Alternative column metrics for multi-employee stores ===');

  const alternatives: Array<{ name: string; fn: (emps: Array<{ venta: number; meta: number; suma: number }>) => number }> = [
    { name: 'sum_venta', fn: (e) => e.reduce((s, x) => s + x.venta, 0) },
    { name: 'avg_venta', fn: (e) => e.reduce((s, x) => s + x.venta, 0) / e.length },
    { name: 'min_venta', fn: (e) => Math.min(...e.map(x => x.venta)) },
    { name: 'max_venta', fn: (e) => Math.max(...e.map(x => x.venta)) },
    { name: 'sum_meta', fn: (e) => e.reduce((s, x) => s + x.meta, 0) },
    { name: 'avg_meta', fn: (e) => e.reduce((s, x) => s + x.meta, 0) / e.length },
    { name: 'min_meta', fn: (e) => Math.min(...e.map(x => x.meta)) },
    { name: 'max_meta', fn: (e) => Math.max(...e.map(x => x.meta)) },
    { name: 'suma_nivel_tienda', fn: (e) => e[0].suma },
    { name: 'suma/empCount', fn: (e) => e[0].suma / e.length },
    { name: 'sum_venta/empCount', fn: (e) => e.reduce((s, x) => s + x.venta, 0) / e.length },
    { name: 'median_venta', fn: (e) => { const s = e.map(x => x.venta).sort((a,b) => a-b); return s[Math.floor(s.length/2)]; } },
    { name: 'first_emp_venta', fn: (e) => e[0].venta },
    { name: 'first_emp_meta', fn: (e) => e[0].meta },
    // Try: sum_venta - max_venta (i.e. sum excluding top seller)
    { name: 'sum_minus_max_venta', fn: (e) => e.reduce((s, x) => s + x.venta, 0) - Math.max(...e.map(x => x.venta)) },
    // Try: individual meta of lowest-selling employee
    { name: 'meta_of_min_venta_emp', fn: (e) => { const sorted = [...e].sort((a,b) => a.venta - b.venta); return sorted[0].meta; } },
    // Try: venta of employee with lowest meta
    { name: 'venta_of_min_meta_emp', fn: (e) => { const sorted = [...e].sort((a,b) => a.meta - b.meta); return sorted[0].venta; } },
  ];

  for (const alt of alternatives) {
    let matches = 0, total = 0;
    for (const [store, emps] of Array.from(storeData.entries())) {
      if (emps.length <= 1) continue; // only multi-employee stores
      const gtCol = storeGTCol.get(store);
      if (gtCol === undefined) continue;
      total++;
      const val = alt.fn(emps);
      if (colBandFor(val) === gtCol) matches++;
    }
    console.log(`  ${alt.name}: ${matches}/${total} (${(matches/total*100).toFixed(1)}%)`);
  }

  // 6. Brute force: for each multi-employee mismatched store, what value range would work?
  console.log('\n\n=== Required column metric values for mismatched stores ===');
  const bands = [[0, 59999], [60000, 99999], [100000, 119999], [120000, 179999], [180000, Infinity]];

  for (const [store, emps] of Array.from(storeData.entries())) {
    if (emps.length <= 1) continue;
    const gtCol = storeGTCol.get(store);
    if (gtCol === undefined) continue;
    const sumVenta = emps.reduce((s, x) => s + x.venta, 0);
    const gotCol = colBandFor(sumVenta);
    if (gotCol === gtCol) continue; // only show mismatches

    const needed = bands[gtCol];
    const sumMeta = emps.reduce((s, x) => s + x.meta, 0);
    console.log(`  Store ${store}: need $${needed[0].toLocaleString()}-$${needed[1] === Infinity ? '∞' : needed[1].toLocaleString()}`);
    console.log(`    sumVenta=$${sumVenta.toLocaleString()}, sumMeta=$${sumMeta.toLocaleString()}`);
    console.log(`    emps: ${emps.map(e => `V=$${e.venta.toLocaleString()}/M=$${e.meta.toLocaleString()}`).join(', ')}`);
  }
}

main().catch(console.error);
