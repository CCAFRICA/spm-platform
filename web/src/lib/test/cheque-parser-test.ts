/**
 * Cheque Parser Test
 *
 * Tests the Financial Module cheque parser with sample POS data.
 *
 * Run with: npx tsx src/lib/test/cheque-parser-test.ts
 */

// Mock localStorage for Node.js
const chequeTestStorage: Record<string, string> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).localStorage = {
  getItem: (key: string) => chequeTestStorage[key] || null,
  setItem: (key: string, value: string) => { chequeTestStorage[key] = value; },
  removeItem: (key: string) => { delete chequeTestStorage[key]; },
  clear: () => { Object.keys(chequeTestStorage).forEach(k => delete chequeTestStorage[k]); },
  length: 0,
  key: () => null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = {};

import { parseChequeFile } from '../financial/cheque-parser';
import { ChequeImportService } from '../financial/cheque-import-service';

// Test data (tab-separated)
const TEST_CHEQUE_DATA = `numero_franquicia\tturno_id\tfolio\tnumero_cheque\tfecha\tcierre\tnumero_de_personas\tmesero_id\tpagado\tcancelado\ttotal_articulos\ttotal\tefectivo\ttarjeta\tpropina\tdescuento\tsubtotal\tsubtotal_con_descuento\ttotal_impuesto\ttotal_descuentos\ttotal_cortesias\ttotal_alimentos\ttotal_bebidas
MX-GDL-001\t1\t1\t1001\t2024-12-02 08:15:00\t2024-12-02 08:52:00\t2\t5001\t1\t0\t5\t312.48\t0.00\t312.48\t40.50\t0\t269.38\t269.38\t43.10\t0.00\t0.00\t188.56\t80.82
MX-GDL-001\t2\t2\t1002\t2024-12-02 15:08:00\t2024-12-02 16:02:00\t3\t5002\t1\t0\t7\t478.24\t0.00\t478.24\t61.80\t0\t412.28\t412.28\t65.96\t0.00\t0.00\t288.60\t123.68
MX-GDL-002\t1\t1\t2001\t2024-12-02 09:30:00\t2024-12-02 10:25:00\t4\t5003\t1\t0\t8\t524.36\t524.36\t0.00\t67.50\t0\t451.86\t451.86\t72.50\t0.00\t0.00\t316.30\t135.56
MX-GDL-002\t2\t2\t2002\t2024-12-02 16:10:00\t2024-12-02 17:15:00\t6\t5004\t1\t0\t12\t856.32\t856.32\t0.00\t110.70\t0\t738.21\t738.21\t118.11\t0.00\t0.00\t516.75\t221.46
MX-GDL-001\t3\t3\t1003\t2024-12-02 23:15:00\t2024-12-03 00:10:00\t2\t5001\t1\t0\t4\t285.64\t285.64\t0.00\t36.00\t0\t246.24\t246.24\t39.40\t0.00\t0.00\t172.37\t73.87`;

function runTest() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           FM-01 Cheque Parser Test                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Test 1: Parse cheque file
  console.log('=== Test 1: Parse Cheque File ===');
  const parseResult = parseChequeFile(TEST_CHEQUE_DATA, 'test-cheques.txt');

  console.log(`Total rows: ${parseResult.metadata.totalRows}`);
  console.log(`Valid rows: ${parseResult.metadata.validRows}`);
  console.log(`Error rows: ${parseResult.metadata.errorRows}`);
  console.log(`Locations: ${parseResult.metadata.locations.join(', ')}`);
  console.log(`Staff: ${parseResult.metadata.staff.join(', ')}`);
  console.log(`Shifts: ${parseResult.metadata.shifts.join(', ')}`);
  console.log(`Date range: ${parseResult.metadata.dateRange.start} to ${parseResult.metadata.dateRange.end}`);
  console.log(`Total revenue: $${parseResult.metadata.totalRevenue.toLocaleString()} MXN`);

  if (parseResult.errors.length > 0) {
    console.log(`Errors: ${parseResult.errors.length}`);
    parseResult.errors.slice(0, 3).forEach(e => console.log(`  - Row ${e.row}: ${e.message}`));
  } else {
    console.log('Errors: 0');
  }

  // Test 2: Verify parsed cheques
  console.log('\n=== Test 2: Verify Parsed Cheques ===');
  console.log('Sample cheques:');
  parseResult.cheques.slice(0, 3).forEach((c, i) => {
    console.log(`  ${i + 1}. Location: ${c.numeroFranquicia}, Cheque: ${c.numeroCheque}, Total: $${c.total.toFixed(2)} MXN`);
  });

  // Test 3: Import service
  console.log('\n=== Test 3: Import Service ===');
  const importService = new ChequeImportService('restaurantmx');
  importService.clearAllData(); // Start fresh

  const importResult = importService.importFile(TEST_CHEQUE_DATA, 'test-cheques.txt', 'system');
  console.log(`Import batch: ${importResult.batchId}`);
  console.log(`Status: ${importResult.status}`);
  console.log(`Records: ${importResult.validRows}`);

  // Test 4: Commit import
  console.log('\n=== Test 4: Commit Import ===');
  const committed = importService.commitImport(importResult.batchId, 'system');
  console.log(`Committed: ${committed ? 'YES' : 'NO'}`);

  // Test 5: Retrieve committed cheques
  console.log('\n=== Test 5: Retrieve Committed Cheques ===');
  const cheques = importService.getAllCheques();
  console.log(`Committed cheques: ${cheques.length}`);

  const locations = importService.getLocations();
  console.log(`Unique locations: ${locations.length} (${locations.join(', ')})`);

  const staff = importService.getStaffIds();
  console.log(`Unique staff: ${staff.length} (${staff.join(', ')})`);

  // Calculate summary
  let totalRevenue = 0;
  cheques.forEach(c => {
    if (c.pagado && !c.cancelado) {
      totalRevenue += c.total;
    }
  });
  console.log(`Total revenue: $${totalRevenue.toFixed(2)} MXN`);

  // Verdict
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');

  const passed =
    parseResult.metadata.validRows === 5 &&
    parseResult.metadata.locations.length === 2 &&
    parseResult.cheques.length === 5 &&
    cheques.length === 5 &&
    Math.abs(totalRevenue - 2457.04) < 0.01;

  if (passed) {
    console.log('║  FM-01 CHEQUE PARSER TEST: PASS                            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Rows parsed: 5                                            ║');
    console.log('║  Locations: 2 (MX-GDL-001, MX-GDL-002)                      ║');
    console.log('║  Staff: 4                                                  ║');
    console.log(`║  Revenue: $${totalRevenue.toFixed(2)} MXN                               ║`);
    console.log('║  Three-layer storage: WORKING                              ║');
  } else {
    console.log('║  FM-01 CHEQUE PARSER TEST: FAIL                            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Expected 5 valid rows, got ${parseResult.metadata.validRows}                            ║`);
    console.log(`║  Expected 2 locations, got ${parseResult.metadata.locations.length}                              ║`);
    console.log(`║  Expected $2,457.04 revenue, got $${totalRevenue.toFixed(2)}             ║`);
    process.exit(1);
  }
  console.log('╚════════════════════════════════════════════════════════════╝');
}

runTest();
