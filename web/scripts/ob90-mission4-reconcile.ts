/**
 * OB-90 Mission 4: Full reconciliation — per-employee, per-component verification
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as path from 'path';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';
const BATCH_ID = 'ca102d0e-4ef5-45e0-bc78-6d0654db582f';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== OB-90 Mission 4: Full Reconciliation ===\n');

  // Read GT
  const xlsxPath = path.join(__dirname, 'CLT14B_Reconciliation_Detail.xlsx');
  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const gtRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  // Build GT map: employeeId → per-component expected values
  interface GTEmployee {
    empId: string;
    store: string;
    role: string;
    certified: boolean;
    c1Row: number;
    c1Col: number;
    c1Rango: string;
    c1Expected: number;
    c2Expected: number;
    c3Expected: number;
    c4Expected: number;
    c5Expected: number;
    c6Expected: number;
    totalExpected: number;
  }

  const gtMap = new Map<string, GTEmployee>();
  for (let i = 1; i < gtRows.length; i++) {
    const r = gtRows[i] as unknown[];
    gtMap.set(String(r[0]), {
      empId: String(r[0]),
      store: String(r[1]),
      role: String(r[2]),
      certified: Boolean(r[3]),
      c1Row: Number(r[7]),
      c1Col: Number(r[8]),
      c1Rango: String(r[6]),
      c1Expected: Number(r[10]),
      c2Expected: Number(r[14]),
      c3Expected: Number(r[18]),
      c4Expected: Number(r[22]),
      c5Expected: Number(r[27]),
      c6Expected: Number(r[31]),
      totalExpected: Number(r[34]),
    });
  }
  console.log(`GT employees: ${gtMap.size}`);

  // Fetch engine results
  const results: Array<{
    entity_id: string;
    total_payout: number;
    components: unknown[];
    metadata: Record<string, unknown>;
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('entity_id, total_payout, components, metadata')
      .eq('batch_id', BATCH_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    results.push(...(data as typeof results));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Engine results: ${results.length}`);

  // Map externalId (employee number) → result
  const empResultMap = new Map<string, (typeof results)[0]>();
  for (const r of results) {
    const meta = r.metadata as Record<string, unknown>;
    const empId = String(meta?.externalId ?? meta?.entityName ?? '');
    if (empId) empResultMap.set(empId, r);
  }
  console.log(`Mapped employees: ${empResultMap.size}`);

  // Component names and GT field mapping
  const compNames = ['Optical Sales', 'Store Sales', 'New Customers', 'Collections', 'Insurance', 'Warranty'];

  const engineCompTotals = [0, 0, 0, 0, 0, 0];
  const gtCompTotals = [0, 0, 0, 0, 0, 0];
  const compMatches = [0, 0, 0, 0, 0, 0];
  const compMismatches = [0, 0, 0, 0, 0, 0];

  let totalMatch = 0, totalMismatch = 0;
  let matched = 0;

  interface Mismatch {
    empId: string;
    store: string;
    compIdx: number;
    engineVal: number;
    gtVal: number;
    delta: number;
    details: string;
  }
  const mismatches: Mismatch[] = [];

  for (const [empId, gt] of Array.from(gtMap.entries())) {
    const result = empResultMap.get(empId);
    if (!result) continue;
    matched++;

    const comps = result.components as Array<{ payout: number }>;
    const engineVals = comps.map(c => c.payout);
    const gtVals = [gt.c1Expected, gt.c2Expected, gt.c3Expected, gt.c4Expected, gt.c5Expected, gt.c6Expected];

    for (let ci = 0; ci < 6; ci++) {
      const eVal = engineVals[ci] || 0;
      const gVal = gtVals[ci] || 0;
      engineCompTotals[ci] += eVal;
      gtCompTotals[ci] += gVal;

      if (Math.abs(eVal - gVal) < 0.01) {
        compMatches[ci]++;
      } else {
        compMismatches[ci]++;
        let details = '';
        if (ci === 0) {
          // Extract intent trace for optical
          const meta = result.metadata as Record<string, unknown>;
          const traces = (meta?.intentTraces as unknown[]) || [];
          const trace = traces[0] as Record<string, unknown> | undefined;
          if (trace?.lookupResolution) {
            const lr = trace.lookupResolution as Record<string, unknown>;
            const rowMatch = lr.rowBoundaryMatched as Record<string, unknown> | undefined;
            const colMatch = lr.columnBoundaryMatched as Record<string, unknown> | undefined;
            details = `row=${rowMatch?.index} col=${colMatch?.index} GT: row=${gt.c1Row} col=${gt.c1Col} rango=${gt.c1Rango}`;
          }
        }
        mismatches.push({ empId, store: gt.store, compIdx: ci, engineVal: eVal, gtVal: gVal, delta: eVal - gVal, details });
      }
    }

    const eTotal = engineVals.reduce((s, v) => s + v, 0);
    if (Math.abs(eTotal - gt.totalExpected) < 0.01) {
      totalMatch++;
    } else {
      totalMismatch++;
    }
  }

  console.log(`GT employees matched to results: ${matched}/719\n`);

  // Summary
  console.log('=== Component Summary ===');
  for (let ci = 0; ci < 6; ci++) {
    const total = compMatches[ci] + compMismatches[ci];
    const delta = engineCompTotals[ci] - gtCompTotals[ci];
    const pct = total > 0 ? (compMatches[ci] / total * 100).toFixed(1) : 'N/A';
    const status = compMismatches[ci] === 0 ? '✓ EXACT' : `✗ ${compMismatches[ci]} mismatches`;
    console.log(`  ${compNames[ci]}: ${compMatches[ci]}/${total} (${pct}%) | Engine MX$${Math.round(engineCompTotals[ci]).toLocaleString()} GT MX$${Math.round(gtCompTotals[ci]).toLocaleString()} Δ MX$${Math.round(delta).toLocaleString()} ${status}`);
  }

  const engineGrand = engineCompTotals.reduce((s, v) => s + v, 0);
  const gtGrand = gtCompTotals.reduce((s, v) => s + v, 0);
  console.log(`\n  TOTAL: ${totalMatch}/${totalMatch + totalMismatch} employees exact | Engine MX$${Math.round(engineGrand).toLocaleString()} GT MX$${Math.round(gtGrand).toLocaleString()} Δ MX$${Math.round(engineGrand - gtGrand).toLocaleString()} (${((engineGrand - gtGrand) / gtGrand * 100).toFixed(2)}%)`);

  // Show mismatches
  if (mismatches.length > 0) {
    console.log(`\n=== Mismatches (${mismatches.length}) ===`);
    for (let ci = 0; ci < 6; ci++) {
      const compMM = mismatches.filter(m => m.compIdx === ci);
      if (compMM.length === 0) continue;
      console.log(`\n  ${compNames[ci]} (${compMM.length} mismatches):`);
      for (const m of compMM.slice(0, 20)) {
        console.log(`    Emp ${m.empId} Store ${m.store}: Engine=$${m.engineVal} GT=$${m.gtVal} Δ=$${m.delta} ${m.details}`);
      }
      if (compMM.length > 20) console.log(`    ... (${compMM.length - 20} more)`);
    }
  }

  // ClearComp test employees
  const clearCompExpected: Record<string, number> = {
    '90118352': 850,
    '90279605': 850,
    '90035469': 1650,
    '90195508': 27615,
    '90203306': 6984,
  };

  console.log('\n=== ClearComp Test Employees ===');
  for (const [empId, expectedTotal] of Object.entries(clearCompExpected)) {
    const result = empResultMap.get(empId);
    const gt = gtMap.get(empId);
    if (!result || !gt) {
      console.log(`  ${empId}: NOT FOUND in ${!result ? 'engine' : 'GT'}`);
      continue;
    }
    const comps = result.components as Array<{ payout: number }>;
    const engineTotal = comps.reduce((s, c) => s + c.payout, 0);
    const match = Math.abs(engineTotal - expectedTotal) < 0.01;
    console.log(`  ${empId}: Engine=$${engineTotal.toLocaleString()} Expected=$${expectedTotal.toLocaleString()} ${match ? '✓' : '✗'}`);
    if (!match) {
      const gtVals = [gt.c1Expected, gt.c2Expected, gt.c3Expected, gt.c4Expected, gt.c5Expected, gt.c6Expected];
      for (let ci = 0; ci < 6; ci++) {
        const eVal = comps[ci]?.payout || 0;
        const gVal = gtVals[ci];
        const cm = Math.abs(eVal - gVal) < 0.01 ? '✓' : '✗';
        console.log(`    ${compNames[ci]}: Engine=$${eVal} GT=$${gVal} ${cm}`);
      }
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
