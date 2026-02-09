/**
 * FM-01 Phase 6 Test
 *
 * Tests Entity Management and Financial Service.
 * Verifies auto-discovery and metric calculations.
 *
 * Run with: npx tsx src/lib/test/FM-01-phase6-test.ts
 */

// Mock localStorage for Node.js
const phase6MockStorage: Record<string, string> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).localStorage = {
  getItem: (key: string) => phase6MockStorage[key] || null,
  setItem: (key: string, value: string) => { phase6MockStorage[key] = value; },
  removeItem: (key: string) => { delete phase6MockStorage[key]; },
  clear: () => { Object.keys(phase6MockStorage).forEach(k => delete phase6MockStorage[k]); },
  length: 0,
  key: () => null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = {};

import { EntityService } from '../financial/entity-service';
import { FinancialService } from '../financial/financial-service';
import { ChequeImportService } from '../financial/cheque-import-service';

// Test cheque data
const TEST_CHEQUE_DATA = `numero_franquicia\tturno_id\tfolio\tnumero_cheque\tfecha\tcierre\tnumero_de_personas\tmesero_id\tpagado\tcancelado\ttotal_articulos\ttotal\tefectivo\ttarjeta\tpropina\tdescuento\tsubtotal\tsubtotal_con_descuento\ttotal_impuesto\ttotal_descuentos\ttotal_cortesias\ttotal_alimentos\ttotal_bebidas
MX-GDL-001\t1\t1\t1001\t2024-12-02 08:15:00\t2024-12-02 08:52:00\t2\t5001\t1\t0\t5\t312.48\t0.00\t312.48\t40.50\t0\t269.38\t269.38\t43.10\t0.00\t0.00\t188.56\t80.82
MX-GDL-001\t2\t2\t1002\t2024-12-02 15:08:00\t2024-12-02 16:02:00\t3\t5002\t1\t0\t7\t478.24\t0.00\t478.24\t61.80\t0\t412.28\t412.28\t65.96\t0.00\t0.00\t288.60\t123.68
MX-GDL-001\t2\t3\t1003\t2024-12-02 14:30:00\t2024-12-02 15:15:00\t4\t5001\t1\t0\t8\t625.00\t625.00\t0.00\t80.00\t0\t538.79\t538.79\t86.21\t0.00\t0.00\t375.00\t163.79
MX-GDL-002\t1\t1\t2001\t2024-12-02 09:30:00\t2024-12-02 10:25:00\t4\t5003\t1\t0\t8\t524.36\t524.36\t0.00\t67.50\t0\t451.86\t451.86\t72.50\t0.00\t0.00\t316.30\t135.56
MX-GDL-002\t2\t2\t2002\t2024-12-02 16:10:00\t2024-12-02 17:15:00\t6\t5004\t1\t0\t12\t856.32\t856.32\t0.00\t110.70\t0\t738.21\t738.21\t118.11\t0.00\t0.00\t516.75\t221.46
MX-GDL-002\t3\t3\t2003\t2024-12-02 23:15:00\t2024-12-03 00:10:00\t2\t5003\t1\t1\t4\t285.64\t0.00\t0.00\t0.00\t0\t246.24\t246.24\t39.40\t0.00\t0.00\t172.37\t73.87
MX-GDL-003\t1\t1\t3001\t2024-12-02 10:00:00\t2024-12-02 11:00:00\t3\t5005\t1\t0\t6\t450.00\t450.00\t0.00\t58.00\t0\t387.93\t387.93\t62.07\t0.00\t0.00\t270.00\t117.93`;

function runPhase6Test() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        FM-01 Phase 6 Test: Entity + Financial Service      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const tenantId = 'restaurantmx';
  let allPassed = true;

  // ============================================
  // Test 1: Entity Service CRUD
  // ============================================
  console.log('=== Test 1: Entity Service CRUD ===');

  const entityService = new EntityService(tenantId);
  entityService.clearAllEntities();

  // Create location
  const location = entityService.createLocation({
    id: 'MX-TEST-001',
    country: 'MX',
    status: 'active',
    name: 'Test Location',
  });
  console.log(`Created location: ${location.id}`);

  // Get location
  const retrieved = entityService.getLocation('MX-TEST-001');
  console.log(`Retrieved: ${retrieved ? 'YES' : 'NO'}`);

  // Update location
  const updated = entityService.updateLocation('MX-TEST-001', { name: 'Updated Name' });
  console.log(`Updated name: ${updated?.name}`);

  // Create staff
  const staff = entityService.createStaffMember({
    id: '9001',
    locationId: 'MX-TEST-001',
    role: 'server',
    status: 'active',
  });
  console.log(`Created staff: ${staff.id}`);

  const test1Pass = retrieved !== null && updated?.name === 'Updated Name';
  console.log(`Test 1: ${test1Pass ? 'PASS' : 'FAIL'}`);
  if (!test1Pass) allPassed = false;

  // ============================================
  // Test 2: Auto-Discovery
  // ============================================
  console.log('\n=== Test 2: Auto-Discovery ===');

  entityService.clearAllEntities();

  // Import cheques
  const importService = new ChequeImportService(tenantId);
  importService.clearAllData();

  const importResult = importService.importFile(TEST_CHEQUE_DATA, 'test.txt', 'system');
  importService.commitImport(importResult.batchId, 'system');

  // Discover entities from cheques
  const cheques = importService.getAllCheques();
  const discovered = entityService.discoverFromCheques(cheques);

  console.log(`Cheques imported: ${cheques.length}`);
  console.log(`Locations discovered: ${discovered.locations}`);
  console.log(`Staff discovered: ${discovered.staff}`);

  const locations = entityService.getLocations();
  const staffList = entityService.getStaff();

  console.log(`Locations in storage: ${locations.length}`);
  console.log(`Staff in storage: ${staffList.length}`);

  const test2Pass = discovered.locations === 3 && discovered.staff === 5;
  console.log(`Test 2: ${test2Pass ? 'PASS' : 'FAIL'}`);
  if (!test2Pass) allPassed = false;

  // ============================================
  // Test 3: Financial Metrics
  // ============================================
  console.log('\n=== Test 3: Financial Metrics ===');

  const financialService = new FinancialService(tenantId);
  const dashboard = financialService.getDashboardSummary('2024-12');

  console.log(`Total Revenue: $${dashboard.totalRevenue.toLocaleString()} MXN`);
  console.log(`Avg Check: $${dashboard.avgCheck.toFixed(2)} MXN`);
  console.log(`Total Cheques: ${dashboard.totalCheques}`);
  console.log(`Total Guests: ${dashboard.totalGuests}`);
  console.log(`Food:Bev Ratio: ${dashboard.foodBevRatio.toFixed(2)}`);
  console.log(`Tip Rate: ${(dashboard.tipRate * 100).toFixed(1)}%`);
  console.log(`Cancellation Rate: ${(dashboard.cancellationRate * 100).toFixed(1)}%`);

  // Expected: 6 valid cheques (1 cancelled), total from those 6
  const expectedRevenue = 312.48 + 478.24 + 625.00 + 524.36 + 856.32 + 450.00; // $3,246.40
  const test3Pass = dashboard.totalCheques === 6 &&
                    Math.abs(dashboard.totalRevenue - expectedRevenue) < 0.01 &&
                    dashboard.cancellationRate > 0;
  console.log(`Test 3: ${test3Pass ? 'PASS' : 'FAIL'}`);
  if (!test3Pass) allPassed = false;

  // ============================================
  // Test 4: Staff Performance
  // ============================================
  console.log('\n=== Test 4: Staff Performance ===');

  const staffPerformance = financialService.getAllStaffPerformance('2024-12');
  console.log(`Staff with performance data: ${staffPerformance.length}`);

  staffPerformance.slice(0, 3).forEach((sp, i) => {
    console.log(`  ${i + 1}. Server ${sp.staffId}: $${sp.totalRevenue.toFixed(2)} MXN (Rank #${sp.revenueRank})`);
  });

  const test4Pass = staffPerformance.length === 5 && staffPerformance[0].revenueRank === 1;
  console.log(`Test 4: ${test4Pass ? 'PASS' : 'FAIL'}`);
  if (!test4Pass) allPassed = false;

  // ============================================
  // Test 5: Location Summary
  // ============================================
  console.log('\n=== Test 5: Location Summary ===');

  const locationSummary = financialService.getLocationSummary('MX-GDL-001', '2024-12');
  console.log(`Location: MX-GDL-001`);
  console.log(`  Cheques: ${locationSummary.chequeCount}`);
  console.log(`  Revenue: $${locationSummary.totalRevenue.toFixed(2)} MXN`);
  console.log(`  Avg Check: $${locationSummary.avgCheck.toFixed(2)} MXN`);
  console.log(`  Guests: ${locationSummary.guestCount}`);

  const gdl001Revenue = 312.48 + 478.24 + 625.00; // $1,415.72
  const test5Pass = locationSummary.chequeCount === 3 &&
                    Math.abs(locationSummary.totalRevenue - gdl001Revenue) < 0.01;
  console.log(`Test 5: ${test5Pass ? 'PASS' : 'FAIL'}`);
  if (!test5Pass) allPassed = false;

  // ============================================
  // Final Verdict
  // ============================================
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');

  if (allPassed) {
    console.log('║  FM-01 PHASE 6 TEST: PASS                                  ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Entity CRUD: WORKING                                      ║');
    console.log('║  Auto-discovery: 3 locations, 5 staff                      ║');
    console.log(`║  Revenue: $${dashboard.totalRevenue.toLocaleString().padEnd(12)} MXN                           ║`);
    console.log('║  Staff rankings: CALCULATED                                ║');
    console.log('║  Location summaries: CALCULATED                            ║');
  } else {
    console.log('║  FM-01 PHASE 6 TEST: FAIL                                  ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Check individual test output above                        ║');
    process.exit(1);
  }
  console.log('╚════════════════════════════════════════════════════════════╝');
}

runPhase6Test();
