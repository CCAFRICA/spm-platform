/**
 * OB-90 Mission 1: Diagnose Optical Column Band Assignment
 *
 * 1A: Extract engine's current per-employee Optical assignments
 * 1B: Compare against ground truth (CLT14B_Reconciliation_Detail.xlsx)
 * 1C: Identify mismatched employees
 * 1D: Identify store-level discrepancy
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as path from 'path';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Matrix row bands
const ROW_BANDS = [
  { idx: 0, min: 0, max: 80.00, label: '<=80%' },
  { idx: 1, min: 80.00, max: 89.99, label: '80-89.99%' },
  { idx: 2, min: 90.00, max: 99.99, label: '90-99.99%' },
  { idx: 3, min: 100.00, max: 149.99, label: '100-149.99%' },
  { idx: 4, min: 150.00, max: 999, label: '>=150%' },
];

// Matrix column bands
const COL_BANDS = [
  { idx: 0, min: 0, max: 59999, label: '<$60K' },
  { idx: 1, min: 60000, max: 99999, label: '$60-100K' },
  { idx: 2, min: 100000, max: 119999, label: '$100-120K' },
  { idx: 3, min: 120000, max: 179999, label: '$120-180K' },
  { idx: 4, min: 180000, max: Infinity, label: '$180K+' },
];

function findRowBand(achievement: number): number {
  // Match the engine's band logic: < 80 = band 0, etc.
  if (achievement < 80) return 0;
  if (achievement < 90) return 1;
  if (achievement < 100) return 2;
  if (achievement < 150) return 3;
  return 4;
}

function findColBand(storeSales: number): number {
  if (storeSales < 60000) return 0;
  if (storeSales < 100000) return 1;
  if (storeSales < 120000) return 2;
  if (storeSales < 180000) return 3;
  return 4;
}

async function main() {
  console.log('=== OB-90 Mission 1: Optical Column Band Diagnostic ===\n');

  // ── 1A: Get engine's per-employee Optical data from latest calculation ──
  const { data: batches } = await sb.from('calculation_batches')
    .select('id').eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false }).limit(1);
  const batchId = batches?.[0]?.id;
  if (!batchId) throw new Error('No calculation batch found');

  console.log(`Using batch: ${batchId}`);

  // Fetch all results
  const allResults: Array<{
    entity_id: string;
    components: Array<{ payout: number; componentName?: string; details?: Record<string, unknown> }>;
    metrics: Record<string, unknown>;
    metadata: Record<string, unknown>;
    total_payout: number;
  }> = [];

  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('entity_id, components, metrics, metadata, total_payout')
      .eq('batch_id', batchId)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allResults.push(...(data as typeof allResults));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Engine results: ${allResults.length} entities`);

  // Build engine employee map
  const engineMap = new Map<string, {
    entityId: string;
    externalId: string;
    totalPayout: number;
    opticalPayout: number;
    rowValue: number;
    colValue: number;
    rowBand: number;
    colBand: number;
    rowBandLabel: string;
    colBandLabel: string;
    variant: string;
  }>();

  for (const r of allResults) {
    const md = r.metadata;
    const externalId = String(md?.externalId || md?.entityName || '');
    const optical = r.components?.find(c =>
      c.componentName?.includes('Optical')
    );
    if (!optical) continue;

    const details = optical.details as Record<string, unknown> || {};
    const rowValue = (details.rowValue as number) ?? 0;
    const colValue = (details.colValue as number) ?? 0;
    const rowBandLabel = (details.rowBand as string) ?? '';
    const colBandLabel = (details.colBand as string) ?? '';

    // Determine row/col band indices
    const rowBand = findRowBand(rowValue);
    const colBand = findColBand(colValue);

    engineMap.set(externalId, {
      entityId: r.entity_id,
      externalId,
      totalPayout: r.total_payout,
      opticalPayout: optical.payout,
      rowValue,
      colValue,
      rowBand,
      colBand,
      rowBandLabel,
      colBandLabel,
      variant: String((r.metadata as Record<string, unknown>)?.variant || 'unknown'),
    });
  }

  console.log(`Engine Optical data extracted: ${engineMap.size} employees`);

  // ── 1B: Read ground truth from CLT14B_Reconciliation_Detail.xlsx ──
  const xlsxPath = path.join(__dirname, 'CLT14B_Reconciliation_Detail.xlsx');
  const workbook = XLSX.readFile(xlsxPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const gtRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  // Print headers to understand column mapping
  const headers = gtRows[0] as string[];
  console.log(`\nGround truth headers (${headers.length} columns):`);
  for (let i = 0; i < headers.length; i++) {
    console.log(`  Col ${i}: ${headers[i]}`);
  }

  // Map columns based on prompt description
  // Find the right columns by header names
  let empCol = -1, storeCol = -1, certCol = -1;
  let c1AttCol = -1, c1RangoCol = -1, c1RowCol = -1, c1ColCol = -1, c1CalcCol = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toLowerCase();
    if (h.includes('employee') || h.includes('emp_id') || h.includes('empleado') || h === 'id') {
      if (empCol === -1) empCol = i;
    }
    if (h.includes('store') || h.includes('tienda')) {
      if (storeCol === -1) storeCol = i;
    }
    if (h.includes('cert')) certCol = i;
    if (h.includes('c1_att') && h.includes('exact')) c1AttCol = i;
    if (h.includes('c1_rango')) c1RangoCol = i;
    if (h.includes('c1_row')) c1RowCol = i;
    if (h.includes('c1_col') && !h.includes('calc')) c1ColCol = i;
    if (h.includes('c1_calc')) c1CalcCol = i;
  }

  // If auto-detection failed, try positional mapping from prompt
  // Col 1: Employee ID, Col 2: Store, Col 4: Certified, Col 5: C1_Att_Exact
  // Col 7: C1_Rango, Col 8: C1_Row, Col 9: C1_Col, Col 10: C1_Calc
  if (empCol === -1) empCol = 0;
  if (storeCol === -1) storeCol = 1;
  if (certCol === -1) certCol = 3;
  if (c1AttCol === -1) c1AttCol = 4;
  if (c1RangoCol === -1) c1RangoCol = 6;
  if (c1RowCol === -1) c1RowCol = 7;
  if (c1ColCol === -1) c1ColCol = 8;
  if (c1CalcCol === -1) c1CalcCol = 9;

  console.log(`\nColumn mapping: emp=${empCol}, store=${storeCol}, cert=${certCol}, att=${c1AttCol}, rango=${c1RangoCol}, row=${c1RowCol}, col=${c1ColCol}, calc=${c1CalcCol}`);

  // Parse GT data
  interface GTEmployee {
    empId: string;
    store: string;
    certified: boolean;
    achievement: number;
    rangoLabel: string;
    rowIdx: number;
    colIdx: number;
    opticalPayout: number;
  }

  const gtMap = new Map<string, GTEmployee>();
  for (let i = 1; i < gtRows.length; i++) {
    const row = gtRows[i];
    if (!row || !row[empCol]) continue;

    const empId = String(row[empCol]);
    const store = String(row[storeCol] || '');
    const certVal = row[certCol];
    const certified = certVal === true || certVal === 1 || String(certVal).toLowerCase() === 'true' ||
      String(certVal).toLowerCase().includes('cert') && !String(certVal).toLowerCase().includes('no');
    const achievement = typeof row[c1AttCol] === 'number' ? row[c1AttCol] : parseFloat(String(row[c1AttCol] || '0'));
    const rangoLabel = String(row[c1RangoCol] || '');
    const rowIdx = typeof row[c1RowCol] === 'number' ? row[c1RowCol] : parseInt(String(row[c1RowCol] || '0'));
    const colIdx = typeof row[c1ColCol] === 'number' ? row[c1ColCol] : parseInt(String(row[c1ColCol] || '0'));
    const opticalPayout = typeof row[c1CalcCol] === 'number' ? row[c1CalcCol] : parseFloat(String(row[c1CalcCol] || '0'));

    gtMap.set(empId, { empId, store, certified, achievement, rangoLabel, rowIdx, colIdx, opticalPayout });
  }
  console.log(`Ground truth loaded: ${gtMap.size} employees`);

  // Show first 3 GT entries for verification
  let shown = 0;
  for (const [id, gt] of Array.from(gtMap.entries())) {
    if (shown >= 3) break;
    console.log(`  GT sample: ${id} store=${gt.store} cert=${gt.certified} ach=${gt.achievement.toFixed(2)}% row=${gt.rowIdx} col=${gt.colIdx} payout=${gt.opticalPayout}`);
    shown++;
  }

  // ── 1C: Compare engine vs GT ──
  console.log('\n=== 1C: Per-Employee Comparison ===\n');

  let rowMatches = 0, rowMismatches = 0;
  let colMatches = 0, colMismatches = 0;
  let payoutMatches = 0, payoutMismatches = 0;
  let totalEnginePayout = 0, totalGTPayout = 0;

  const colMismatchList: Array<{
    empId: string; store: string;
    engineCol: number; gtCol: number;
    engineColValue: number;
    engineRow: number; gtRow: number;
    enginePayout: number; gtPayout: number;
    rangoLabel: string;
  }> = [];

  const rowMismatchList: Array<{
    empId: string;
    engineRow: number; gtRow: number;
    engineAch: number; gtAch: number;
    enginePayout: number; gtPayout: number;
  }> = [];

  for (const [empId, gt] of Array.from(gtMap.entries())) {
    const eng = engineMap.get(empId);
    if (!eng) {
      console.log(`  WARNING: GT employee ${empId} not in engine results`);
      continue;
    }

    totalEnginePayout += eng.opticalPayout;
    totalGTPayout += gt.opticalPayout;

    // Compare row bands
    if (eng.rowBand === gt.rowIdx) {
      rowMatches++;
    } else {
      rowMismatches++;
      rowMismatchList.push({
        empId, engineRow: eng.rowBand, gtRow: gt.rowIdx,
        engineAch: eng.rowValue, gtAch: gt.achievement,
        enginePayout: eng.opticalPayout, gtPayout: gt.opticalPayout,
      });
    }

    // Compare column bands
    if (eng.colBand === gt.colIdx) {
      colMatches++;
    } else {
      colMismatches++;
      colMismatchList.push({
        empId, store: gt.store,
        engineCol: eng.colBand, gtCol: gt.colIdx,
        engineColValue: eng.colValue,
        engineRow: eng.rowBand, gtRow: gt.rowIdx,
        enginePayout: eng.opticalPayout, gtPayout: gt.opticalPayout,
        rangoLabel: gt.rangoLabel,
      });
    }

    // Compare payouts
    if (Math.abs(eng.opticalPayout - gt.opticalPayout) < 0.01) {
      payoutMatches++;
    } else {
      payoutMismatches++;
    }
  }

  console.log(`Row band comparison: ${rowMatches} match, ${rowMismatches} mismatch`);
  console.log(`Column band comparison: ${colMatches} match, ${colMismatches} mismatch`);
  console.log(`Payout comparison: ${payoutMatches} match, ${payoutMismatches} mismatch`);
  console.log(`\nEngine optical total: MX$${Math.round(totalEnginePayout).toLocaleString()}`);
  console.log(`GT optical total: MX$${Math.round(totalGTPayout).toLocaleString()}`);
  console.log(`Delta: MX$${Math.round(totalEnginePayout - totalGTPayout).toLocaleString()} (${((totalEnginePayout - totalGTPayout) / totalGTPayout * 100).toFixed(2)}%)`);

  // Show row mismatches
  if (rowMismatchList.length > 0) {
    console.log(`\n--- Row Mismatches (${rowMismatchList.length}) ---`);
    for (const m of rowMismatchList.slice(0, 20)) {
      console.log(`  ${m.empId}: engine row=${m.engineRow} (ach=${m.engineAch.toFixed(2)}%) vs GT row=${m.gtRow} (ach=${m.gtAch.toFixed(2)}%) | engine=$${m.enginePayout} gt=$${m.gtPayout}`);
    }
    if (rowMismatchList.length > 20) console.log(`  ... ${rowMismatchList.length - 20} more`);
  }

  // Show column mismatches
  if (colMismatchList.length > 0) {
    console.log(`\n--- Column Mismatches (${colMismatchList.length}) ---`);
    // Group by direction of mismatch
    const higherCol = colMismatchList.filter(m => m.engineCol > m.gtCol);
    const lowerCol = colMismatchList.filter(m => m.engineCol < m.gtCol);
    console.log(`  Engine col HIGHER than GT: ${higherCol.length}`);
    console.log(`  Engine col LOWER than GT: ${lowerCol.length}`);

    console.log('\n  First 20 column mismatches:');
    for (const m of colMismatchList.slice(0, 20)) {
      console.log(`  ${m.empId}: store=${m.store} engineCol=${m.engineCol} (sales=$${Math.round(m.engineColValue).toLocaleString()}) vs gtCol=${m.gtCol} (${m.rangoLabel}) | payout: engine=$${m.enginePayout} gt=$${m.gtPayout} Δ=$${m.enginePayout - m.gtPayout}`);
    }
    if (colMismatchList.length > 20) console.log(`  ... ${colMismatchList.length - 20} more`);
  }

  // ── 1D: Store-level discrepancy analysis ──
  console.log('\n\n=== 1D: Store-Level Discrepancy ===\n');

  // Group column mismatches by store
  const storeMismatches = new Map<string, typeof colMismatchList>();
  for (const m of colMismatchList) {
    if (!storeMismatches.has(m.store)) storeMismatches.set(m.store, []);
    storeMismatches.get(m.store)!.push(m);
  }

  console.log(`Stores with column mismatches: ${storeMismatches.size}`);

  // For each mismatched store, show the engine store sales total and what band it falls in
  // vs what band the GT says it should be
  const storeAnalysis: Array<{
    store: string;
    engineSales: number;
    engineColBand: number;
    gtColBand: number;
    gtRango: string;
    employeeCount: number;
    payoutDelta: number;
  }> = [];

  for (const [store, mismatches] of Array.from(storeMismatches.entries())) {
    const first = mismatches[0];
    const totalPayoutDelta = mismatches.reduce((s, m) => s + (m.enginePayout - m.gtPayout), 0);
    storeAnalysis.push({
      store,
      engineSales: first.engineColValue,
      engineColBand: first.engineCol,
      gtColBand: first.gtCol,
      gtRango: first.rangoLabel,
      employeeCount: mismatches.length,
      payoutDelta: totalPayoutDelta,
    });
  }

  // Sort by payout delta (largest overpayment first)
  storeAnalysis.sort((a, b) => b.payoutDelta - a.payoutDelta);

  console.log('\nTop 20 stores by payout delta:');
  console.log('Store | EngSales | EngCol | GTCol | GTRango | Emps | PayoutΔ');
  for (const s of storeAnalysis.slice(0, 20)) {
    console.log(`  ${s.store} | $${Math.round(s.engineSales).toLocaleString()} | ${s.engineColBand} (${COL_BANDS[s.engineColBand]?.label}) | ${s.gtColBand} (${COL_BANDS[s.gtColBand]?.label}) | "${s.gtRango}" | ${s.employeeCount} | $${Math.round(s.payoutDelta).toLocaleString()}`);
  }

  // Summarize: what's the total payout delta from column mismatches?
  const totalColDelta = colMismatchList.reduce((s, m) => s + (m.enginePayout - m.gtPayout), 0);
  console.log(`\nTotal payout delta from column mismatches: MX$${Math.round(totalColDelta).toLocaleString()}`);

  // Summarize: what's the total payout delta from row mismatches?
  const totalRowDelta = rowMismatchList.reduce((s, m) => s + (m.enginePayout - m.gtPayout), 0);
  console.log(`Total payout delta from row mismatches: MX$${Math.round(totalRowDelta).toLocaleString()}`);

  // Analyze: for column mismatches where engine is ONE band higher, what sales range?
  const oneHigher = colMismatchList.filter(m => m.engineCol === m.gtCol + 1);
  if (oneHigher.length > 0) {
    const salesValues = oneHigher.map(m => m.engineColValue).sort((a, b) => a - b);
    console.log(`\nEmployees shifted +1 column band: ${oneHigher.length}`);
    console.log(`  Engine store sales range: $${Math.round(salesValues[0]).toLocaleString()} - $${Math.round(salesValues[salesValues.length - 1]).toLocaleString()}`);
    console.log(`  Median: $${Math.round(salesValues[Math.floor(salesValues.length / 2)]).toLocaleString()}`);

    // What GT column bands are they supposed to be in?
    const gtBandCounts = new Map<number, number>();
    for (const m of oneHigher) {
      gtBandCounts.set(m.gtCol, (gtBandCounts.get(m.gtCol) || 0) + 1);
    }
    for (const [band, count] of Array.from(gtBandCounts.entries())) {
      console.log(`  Shifted FROM GT col ${band} (${COL_BANDS[band]?.label}): ${count} employees`);
    }
  }

  // ── Check GT total payout per component ──
  console.log('\n\n=== GT Component Totals ===');
  // Read all columns to get per-component totals
  // Find columns for each component
  const compCols: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '');
    if (h.includes('C1_Calc')) compCols['Optical Sales'] = i;
    if (h.includes('C2_Calc')) compCols['Store Sales'] = i;
    if (h.includes('C3_Calc')) compCols['New Customers'] = i;
    if (h.includes('C4_Calc')) compCols['Collections'] = i;
    if (h.includes('C5_Calc')) compCols['Insurance'] = i;
    if (h.includes('C6_Calc')) compCols['Warranty'] = i;
    if (h.includes('Total') && !h.includes('C')) compCols['Total'] = i;
  }
  console.log('Component columns found:', compCols);

  for (const [comp, col] of Object.entries(compCols)) {
    let total = 0;
    for (let i = 1; i < gtRows.length; i++) {
      const val = gtRows[i]?.[col];
      if (typeof val === 'number') total += val;
    }
    console.log(`  ${comp}: MX$${Math.round(total).toLocaleString()}`);
  }

  // ── ClearComp test employees ──
  console.log('\n\n=== ClearComp Test Employees ===');
  const testEmps = ['90118352', '90279605', '90035469', '90195508', '90203306'];
  for (const empId of testEmps) {
    const eng = engineMap.get(empId);
    const gt = gtMap.get(empId);
    // Get GT total from the spreadsheet
    let gtTotal = 0;
    for (let i = 1; i < gtRows.length; i++) {
      if (String(gtRows[i]?.[empCol]) === empId && compCols['Total'] !== undefined) {
        gtTotal = gtRows[i]?.[compCols['Total']] as number || 0;
        break;
      }
    }

    console.log(`  ${empId}: engine total=$${eng?.totalPayout ?? 'N/A'}, GT total=$${gtTotal}, engine optical=$${eng?.opticalPayout ?? 'N/A'}, GT optical=$${gt?.opticalPayout ?? 'N/A'}`);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
