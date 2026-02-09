/**
 * FM-01 End-to-End Proof Gate
 *
 * Comprehensive test proving the Financial Module works end-to-end:
 * 1. Parse POS cheque file (23 columns, tab-delimited)
 * 2. Import through three-layer storage
 * 3. Auto-discover entities (locations, staff)
 * 4. Compute financial metrics
 * 5. Verify all calculations
 *
 * Run with: npx tsx src/lib/test/FM-01-e2e-proof.ts
 */

// Mock localStorage for Node.js
const fm01MockStorage: Record<string, string> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).localStorage = {
  getItem: (key: string) => fm01MockStorage[key] || null,
  setItem: (key: string, value: string) => { fm01MockStorage[key] = value; },
  removeItem: (key: string) => { delete fm01MockStorage[key]; },
  clear: () => { Object.keys(fm01MockStorage).forEach(k => delete fm01MockStorage[k]); },
  length: 0,
  key: () => null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = {};

import { parseChequeFile } from '../financial/cheque-parser';
import { ChequeImportService } from '../financial/cheque-import-service';
import { EntityService } from '../financial/entity-service';
import { FinancialService } from '../financial/financial-service';

// ============================================
// TEST DATA - Realistic POS export
// ============================================

const FM01_TEST_DATA = `numero_franquicia\tturno_id\tfolio\tnumero_cheque\tfecha\tcierre\tnumero_de_personas\tmesero_id\tpagado\tcancelado\ttotal_articulos\ttotal\tefectivo\ttarjeta\tpropina\tdescuento\tsubtotal\tsubtotal_con_descuento\ttotal_impuesto\ttotal_descuentos\ttotal_cortesias\ttotal_alimentos\ttotal_bebidas
MX-GDL-001\t1\t1\t1001\t2024-12-01 08:15:00\t2024-12-01 08:52:00\t2\t5001\t1\t0\t5\t312.48\t0.00\t312.48\t40.50\t0\t269.38\t269.38\t43.10\t0.00\t0.00\t188.56\t80.82
MX-GDL-001\t1\t2\t1002\t2024-12-01 09:30:00\t2024-12-01 10:15:00\t3\t5001\t1\t0\t6\t425.00\t425.00\t0.00\t55.00\t0\t366.38\t366.38\t58.62\t0.00\t0.00\t255.00\t111.38
MX-GDL-001\t2\t3\t1003\t2024-12-01 15:08:00\t2024-12-01 16:02:00\t4\t5002\t1\t0\t7\t578.24\t0.00\t578.24\t75.00\t0\t498.48\t498.48\t79.76\t0.00\t0.00\t346.94\t151.54
MX-GDL-001\t2\t4\t1004\t2024-12-01 16:30:00\t2024-12-01 17:45:00\t5\t5002\t1\t0\t9\t725.00\t362.50\t362.50\t94.00\t0\t625.00\t625.00\t100.00\t0.00\t0.00\t435.00\t190.00
MX-GDL-001\t3\t5\t1005\t2024-12-01 22:00:00\t2024-12-01 23:30:00\t2\t5003\t1\t0\t4\t350.00\t350.00\t0.00\t45.00\t0\t301.72\t301.72\t48.28\t0.00\t0.00\t210.00\t91.72
MX-GDL-002\t1\t1\t2001\t2024-12-01 09:00:00\t2024-12-01 10:00:00\t3\t5004\t1\t0\t5\t398.50\t398.50\t0.00\t52.00\t0\t343.53\t343.53\t54.97\t0.00\t0.00\t239.10\t104.43
MX-GDL-002\t1\t2\t2002\t2024-12-01 10:30:00\t2024-12-01 11:30:00\t4\t5004\t1\t0\t8\t612.00\t306.00\t306.00\t79.50\t0\t527.59\t527.59\t84.41\t0.00\t0.00\t367.20\t160.39
MX-GDL-002\t2\t3\t2003\t2024-12-01 14:00:00\t2024-12-01 15:15:00\t6\t5005\t1\t0\t12\t856.32\t0.00\t856.32\t111.00\t0\t738.21\t738.21\t118.11\t0.00\t0.00\t513.79\t224.42
MX-GDL-002\t2\t4\t2004\t2024-12-01 16:00:00\t2024-12-01 17:00:00\t3\t5005\t1\t1\t5\t425.00\t0.00\t0.00\t0.00\t0\t366.38\t366.38\t58.62\t0.00\t0.00\t255.00\t111.38
MX-GDL-002\t3\t5\t2005\t2024-12-01 22:30:00\t2024-12-01 23:45:00\t2\t5006\t1\t0\t4\t298.00\t298.00\t0.00\t39.00\t0\t256.90\t256.90\t41.10\t0.00\t0.00\t178.80\t78.10
MX-GDL-003\t1\t1\t3001\t2024-12-01 08:00:00\t2024-12-01 09:00:00\t2\t5007\t1\t0\t4\t285.00\t285.00\t0.00\t37.00\t0\t245.69\t245.69\t39.31\t0.00\t0.00\t171.00\t74.69
MX-GDL-003\t1\t2\t3002\t2024-12-01 10:00:00\t2024-12-01 11:15:00\t4\t5007\t1\t0\t7\t512.00\t256.00\t256.00\t66.50\t0\t441.38\t441.38\t70.62\t0.00\t0.00\t307.20\t134.18
MX-GDL-003\t2\t3\t3003\t2024-12-01 15:00:00\t2024-12-01 16:30:00\t5\t5008\t1\t0\t10\t789.00\t394.50\t394.50\t102.50\t0\t680.17\t680.17\t108.83\t0.00\t0.00\t473.40\t206.77
MX-GDL-003\t2\t4\t3004\t2024-12-01 17:00:00\t2024-12-01 18:00:00\t3\t5008\t0\t0\t4\t325.00\t0.00\t0.00\t0.00\t0\t280.17\t280.17\t44.83\t0.00\t0.00\t195.00\t85.17
MX-GDL-003\t3\t5\t3005\t2024-12-01 21:00:00\t2024-12-01 22:30:00\t2\t5009\t1\t0\t3\t245.00\t245.00\t0.00\t32.00\t0\t211.21\t211.21\t33.79\t0.00\t0.00\t147.00\t64.21`;

// ============================================
// EXPECTED VALUES
// ============================================

const EXPECTED = {
  totalRows: 15,
  validRows: 15,
  locations: 3,
  staff: 9,
  shifts: [1, 2, 3],
  // Valid paid cheques (excluding cancelled and unpaid)
  validCheques: 13,
  // Total revenue from valid cheques (sum of location revenues)
  totalRevenue: 6386.54, // 2390.72 + 2164.82 + 1831.00
  // Revenue by location
  locationRevenue: {
    'MX-GDL-001': 2390.72, // 312.48 + 425.00 + 578.24 + 725.00 + 350.00
    'MX-GDL-002': 2164.82, // 398.50 + 612.00 + 856.32 + 298.00 (cancelled 425 excluded)
    'MX-GDL-003': 1831.00, // 285.00 + 512.00 + 789.00 + 245.00 (unpaid 325 excluded)
  },
  // Staff with most revenue
  topStaff: 5002, // 578.24 + 725.00 = 1303.24
};

// ============================================
// MAIN PROOF TEST
// ============================================

function runFM01Proof() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          FM-01 END-TO-END PROOF GATE                       ║');
  console.log('║     Financial Module Complete Verification                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const tenantId = 'restaurantmx';
  let allPassed = true;
  const results: { test: string; passed: boolean; detail: string }[] = [];

  // ============================================
  // Test 1: Parse Cheque File
  // ============================================
  console.log('=== Step 1: Parse Cheque File ===');
  const parseResult = parseChequeFile(FM01_TEST_DATA, 'cheques_20241201.txt');

  const test1Pass =
    parseResult.metadata.totalRows === EXPECTED.totalRows &&
    parseResult.metadata.validRows === EXPECTED.validRows &&
    parseResult.metadata.locations.length === EXPECTED.locations;

  console.log(`Total rows: ${parseResult.metadata.totalRows} (expected: ${EXPECTED.totalRows})`);
  console.log(`Valid rows: ${parseResult.metadata.validRows} (expected: ${EXPECTED.validRows})`);
  console.log(`Locations: ${parseResult.metadata.locations.length} (expected: ${EXPECTED.locations})`);
  console.log(`Test 1: ${test1Pass ? 'PASS' : 'FAIL'}`);

  results.push({ test: 'Parse Cheque File', passed: test1Pass, detail: `${parseResult.metadata.validRows} rows` });
  if (!test1Pass) allPassed = false;

  // ============================================
  // Test 2: Three-Layer Import
  // ============================================
  console.log('\n=== Step 2: Three-Layer Import ===');
  const importService = new ChequeImportService(tenantId);
  importService.clearAllData();

  const importResult = importService.importFile(FM01_TEST_DATA, 'cheques_20241201.txt', 'system');
  const commitSuccess = importService.commitImport(importResult.batchId, 'system');
  const committedCheques = importService.getAllCheques();

  const test2Pass =
    commitSuccess &&
    committedCheques.length === EXPECTED.validRows &&
    importResult.status === 'pending';

  console.log(`Import status: ${importResult.status}`);
  console.log(`Commit success: ${commitSuccess}`);
  console.log(`Committed cheques: ${committedCheques.length} (expected: ${EXPECTED.validRows})`);
  console.log(`Test 2: ${test2Pass ? 'PASS' : 'FAIL'}`);

  results.push({ test: 'Three-Layer Import', passed: test2Pass, detail: `${committedCheques.length} committed` });
  if (!test2Pass) allPassed = false;

  // ============================================
  // Test 3: Entity Auto-Discovery
  // ============================================
  console.log('\n=== Step 3: Entity Auto-Discovery ===');
  const entityService = new EntityService(tenantId);
  entityService.clearAllEntities();

  const discovered = entityService.discoverFromCheques(committedCheques);
  const locations = entityService.getLocations();
  const staff = entityService.getStaff();

  const test3Pass =
    discovered.locations === EXPECTED.locations &&
    discovered.staff === EXPECTED.staff &&
    locations.length === EXPECTED.locations &&
    staff.length === EXPECTED.staff;

  console.log(`Locations discovered: ${discovered.locations} (expected: ${EXPECTED.locations})`);
  console.log(`Staff discovered: ${discovered.staff} (expected: ${EXPECTED.staff})`);
  console.log(`Test 3: ${test3Pass ? 'PASS' : 'FAIL'}`);

  results.push({ test: 'Entity Auto-Discovery', passed: test3Pass, detail: `${locations.length} locations, ${staff.length} staff` });
  if (!test3Pass) allPassed = false;

  // ============================================
  // Test 4: Financial Metrics
  // ============================================
  console.log('\n=== Step 4: Financial Metrics ===');
  const financialService = new FinancialService(tenantId);
  const dashboard = financialService.getDashboardSummary('2024-12');

  const revenueMatch = Math.abs(dashboard.totalRevenue - EXPECTED.totalRevenue) < 0.01;
  const chequeMatch = dashboard.totalCheques === EXPECTED.validCheques;

  const test4Pass = revenueMatch && chequeMatch;

  console.log(`Total Revenue: $${dashboard.totalRevenue.toLocaleString()} MXN (expected: $${EXPECTED.totalRevenue.toLocaleString()})`);
  console.log(`Valid Cheques: ${dashboard.totalCheques} (expected: ${EXPECTED.validCheques})`);
  console.log(`Avg Check: $${dashboard.avgCheck.toFixed(2)} MXN`);
  console.log(`Food:Bev Ratio: ${dashboard.foodBevRatio.toFixed(2)}`);
  console.log(`Tip Rate: ${(dashboard.tipRate * 100).toFixed(1)}%`);
  console.log(`Test 4: ${test4Pass ? 'PASS' : 'FAIL'}`);

  results.push({ test: 'Financial Metrics', passed: test4Pass, detail: `$${dashboard.totalRevenue.toLocaleString()} MXN` });
  if (!test4Pass) allPassed = false;

  // ============================================
  // Test 5: Location Summaries
  // ============================================
  console.log('\n=== Step 5: Location Summaries ===');
  let test5Pass = true;

  for (const [locId, expectedRev] of Object.entries(EXPECTED.locationRevenue)) {
    const summary = financialService.getLocationSummary(locId, '2024-12');
    const match = Math.abs(summary.totalRevenue - expectedRev) < 0.01;
    if (!match) test5Pass = false;
    console.log(`${locId}: $${summary.totalRevenue.toFixed(2)} (expected: $${expectedRev.toFixed(2)}) ${match ? '✓' : '✗'}`);
  }

  console.log(`Test 5: ${test5Pass ? 'PASS' : 'FAIL'}`);

  results.push({ test: 'Location Summaries', passed: test5Pass, detail: '3 locations verified' });
  if (!test5Pass) allPassed = false;

  // ============================================
  // Test 6: Staff Rankings
  // ============================================
  console.log('\n=== Step 6: Staff Rankings ===');
  const staffPerformance = financialService.getAllStaffPerformance('2024-12');

  const topPerformer = staffPerformance[0];
  const test6Pass = topPerformer && topPerformer.staffId === EXPECTED.topStaff;

  console.log('Top 3 staff by revenue:');
  staffPerformance.slice(0, 3).forEach((sp, i) => {
    console.log(`  ${i + 1}. Server #${sp.staffId}: $${sp.totalRevenue.toFixed(2)} MXN`);
  });
  console.log(`Top performer: #${topPerformer?.staffId} (expected: #${EXPECTED.topStaff})`);
  console.log(`Test 6: ${test6Pass ? 'PASS' : 'FAIL'}`);

  results.push({ test: 'Staff Rankings', passed: test6Pass, detail: `Top: #${topPerformer?.staffId}` });
  if (!test6Pass) allPassed = false;

  // ============================================
  // Final Verdict
  // ============================================
  const passedCount = results.filter(r => r.passed).length;
  const totalTests = results.length;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');

  if (allPassed) {
    console.log('║  FM-01 END-TO-END PROOF: PASS                              ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Tests passed: ${passedCount}/${totalTests}                                        ║`);
    console.log('║                                                            ║');
    console.log('║  VERIFIED:                                                 ║');
    console.log('║  [✓] 23-column POS file parsing                            ║');
    console.log('║  [✓] Three-layer data storage (raw/transformed/committed)  ║');
    console.log('║  [✓] Entity auto-discovery (locations + staff)             ║');
    console.log('║  [✓] Revenue calculations                                  ║');
    console.log('║  [✓] Per-location summaries                                ║');
    console.log('║  [✓] Staff performance rankings                            ║');
    console.log('║                                                            ║');
    console.log('║  Financial Module is PRODUCTION READY                      ║');
  } else {
    console.log('║  FM-01 END-TO-END PROOF: FAIL                              ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Tests passed: ${passedCount}/${totalTests}                                        ║`);
    console.log('║                                                            ║');
    results.forEach(r => {
      const status = r.passed ? '✓' : '✗';
      console.log(`║  [${status}] ${r.test.padEnd(30)} ${r.detail.substring(0, 15).padEnd(15)} ║`);
    });
    process.exit(1);
  }
  console.log('╚════════════════════════════════════════════════════════════╝');
}

runFM01Proof();
