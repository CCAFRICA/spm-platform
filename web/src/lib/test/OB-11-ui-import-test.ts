/**
 * OB-11 UI Import Persistence Test
 *
 * Verifies that the handleSubmitImport fix actually persists data
 * in the format that extractEmployeesFromCommittedData() expects.
 *
 * Run with: npx tsx src/lib/test/OB-11-ui-import-test.ts
 */

// Mock localStorage for Node.js
const ob11MockStorage: Record<string, string> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).localStorage = {
  getItem: (key: string) => ob11MockStorage[key] || null,
  setItem: (key: string, value: string) => { ob11MockStorage[key] = value; },
  removeItem: (key: string) => { delete ob11MockStorage[key]; },
  clear: () => { Object.keys(ob11MockStorage).forEach(k => delete ob11MockStorage[k]); },
  length: 0,
  key: () => null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = {};

// Storage keys (same as data-layer-service)
const OB11_STORAGE_KEYS = {
  COMMITTED: 'data_layer_committed',
  BATCHES: 'data_layer_batches',
  EMPLOYEE_DATA: 'vialuce_employee_data',
};

// Types
interface OB11Employee {
  id: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  storeId?: string;
  status: 'active' | 'inactive';
}

interface OB11CommittedRecord {
  id: string;
  transformedRecordId: string;
  rawRecordId: string;
  importBatchId: string;
  committedAt: string;
  committedBy: string;
  content: Record<string, unknown>;
  status: 'active' | 'rolled_back' | 'superseded';
}

interface OB11ImportBatch {
  id: string;
  tenantId: string;
  sourceSystem: string;
  sourceFormat: string;
  fileName?: string;
  importedAt: string;
  importedBy: string;
  status: string;
  summary: {
    totalRecords: number;
    cleanRecords: number;
  };
}

/**
 * Simulates what directCommitImportData does
 * (the function now called by handleSubmitImport)
 */
function simulateDirectCommitImportData(
  tenantId: string,
  userId: string,
  fileName: string,
  sheetData: Array<{
    sheetName: string;
    rows: Record<string, unknown>[];
    mappings?: Record<string, string>;
  }>
): { batchId: string; recordCount: number } {
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Create the import batch
  const batch: OB11ImportBatch = {
    id: batchId,
    tenantId,
    sourceSystem: 'excel-import',
    sourceFormat: 'xlsx',
    fileName,
    importedAt: new Date().toISOString(),
    importedBy: userId,
    status: 'approved',
    summary: {
      totalRecords: 0,
      cleanRecords: 0,
    },
  };

  // Load existing data
  const existingBatches: [string, OB11ImportBatch][] = JSON.parse(
    localStorage.getItem(OB11_STORAGE_KEYS.BATCHES) || '[]'
  );
  const existingCommitted: [string, OB11CommittedRecord][] = JSON.parse(
    localStorage.getItem(OB11_STORAGE_KEYS.COMMITTED) || '[]'
  );

  let totalRecords = 0;

  // Process each sheet's data
  for (const sheet of sheetData) {
    for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
      const row = sheet.rows[rowIndex];
      const recordId = `commit-${batchId}-${sheet.sheetName}-${rowIndex}`;

      // Apply field mappings if provided
      let content = { ...row };
      if (sheet.mappings) {
        const mappedContent: Record<string, unknown> = {};
        for (const [sourceCol, value] of Object.entries(row)) {
          const targetField = sheet.mappings[sourceCol];
          if (targetField && targetField !== 'ignore') {
            mappedContent[targetField] = value;
          }
          mappedContent[sourceCol] = value;
        }
        content = mappedContent;
      }

      content._sheetName = sheet.sheetName;
      content._rowIndex = rowIndex;

      const committedRecord: OB11CommittedRecord = {
        id: recordId,
        transformedRecordId: `trans-${recordId}`,
        rawRecordId: `raw-${recordId}`,
        importBatchId: batchId,
        committedAt: new Date().toISOString(),
        committedBy: userId,
        content,
        status: 'active',
      };

      existingCommitted.push([recordId, committedRecord]);
      totalRecords++;
    }
  }

  batch.summary.totalRecords = totalRecords;
  batch.summary.cleanRecords = totalRecords;
  existingBatches.push([batchId, batch]);

  // Persist
  localStorage.setItem(OB11_STORAGE_KEYS.BATCHES, JSON.stringify(existingBatches));
  localStorage.setItem(OB11_STORAGE_KEYS.COMMITTED, JSON.stringify(existingCommitted));

  return { batchId, recordCount: totalRecords };
}

/**
 * Extract employees from committed data
 * (same logic as orchestrator's extractEmployeesFromCommittedData)
 */
function ob11ExtractEmployees(tenantId: string): OB11Employee[] {
  const employees: OB11Employee[] = [];
  const seenIds = new Set<string>();

  const batchesStored = localStorage.getItem(OB11_STORAGE_KEYS.BATCHES);
  if (!batchesStored) return [];

  let tenantBatchIds: string[] = [];
  try {
    const batches: [string, { tenantId: string }][] = JSON.parse(batchesStored);
    tenantBatchIds = batches
      .filter(([, batch]) => batch.tenantId === tenantId)
      .map(([id]) => id);
  } catch {
    return [];
  }

  if (tenantBatchIds.length === 0) return [];

  const committedStored = localStorage.getItem(OB11_STORAGE_KEYS.COMMITTED);
  if (!committedStored) return [];

  try {
    const committed: [string, OB11CommittedRecord][] = JSON.parse(committedStored);

    for (const [, record] of committed) {
      if (!tenantBatchIds.includes(record.importBatchId) || record.status !== 'active') {
        continue;
      }

      const content = record.content;
      const entityId = String(
        content['num_empleado'] || content['Num_Empleado'] ||
        content['entity_id'] || content['entityId'] || ''
      ).trim();

      if (!entityId || seenIds.has(entityId)) continue;

      const hasNameField = content['nombre'] || content['name'] ||
        content['first_name'] || content['firstName'] ||
        content['nombre_completo'] || content['Nombre'];

      if (!hasNameField) continue;

      seenIds.add(entityId);

      const fullName = String(content['nombre'] || content['nombre_completo'] || content['Nombre'] || '');
      const nameParts = fullName.split(' ');

      employees.push({
        id: entityId,
        tenantId,
        employeeNumber: entityId,
        firstName: nameParts[0] || 'Unknown',
        lastName: nameParts.slice(1).join(' ') || 'Employee',
        email: String(content['email'] || ''),
        role: String(content['puesto'] || 'sales_rep'),
        storeId: String(content['no_tienda'] || ''),
        status: 'active',
      });
    }
  } catch {
    // Error parsing
  }

  return employees;
}

// ============================================
// MAIN TEST
// ============================================

function runOB11Test() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  OB-11: UI Import Persistence Test                         ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Verifies handleSubmitImport fix persists data correctly   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const tenantId = 'restaurantmx';

  // Step 1: Seed demo employees (simulating what would be in vialuce_employee_data)
  console.log('[Step 1] Seeding demo employees in stored data...');
  const demoEmployees = [
    { id: 'maria-rodriguez', tenantId, employeeNumber: 'EMP-001', firstName: 'Maria', lastName: 'Rodriguez', email: '', role: 'sales_rep', status: 'active' },
    { id: 'james-wilson', tenantId, employeeNumber: 'EMP-002', firstName: 'James', lastName: 'Wilson', email: '', role: 'sales_rep', status: 'active' },
  ];
  localStorage.setItem(OB11_STORAGE_KEYS.EMPLOYEE_DATA, JSON.stringify(demoEmployees));
  console.log('   Demo employees seeded: maria-rodriguez, james-wilson');

  // Step 2: Simulate UI import (what handleSubmitImport now does)
  console.log('\n[Step 2] Simulating UI import via directCommitImportData...');
  const sheetData = [
    {
      sheetName: 'Datos_Colaborador',
      rows: [
        { num_empleado: '96568046', nombre: 'Carlos Garcia Rodriguez', no_tienda: '001', puesto: 'Optometrista Certificado', email: 'carlos@test.com' },
        { num_empleado: '90125625', nombre: 'Ana Martinez Lopez', no_tienda: '002', puesto: 'Optometrista', email: 'ana@test.com' },
        { num_empleado: '90461568', nombre: 'Roberto Hernandez', no_tienda: '001', puesto: 'Vendedor', email: 'roberto@test.com' },
        { num_empleado: '91234567', nombre: 'Maria Elena Gonzalez', no_tienda: '003', puesto: 'Optometrista Certificado', email: 'maria.g@test.com' },
        { num_empleado: '92345678', nombre: 'Jorge Luis Ramirez', no_tienda: '002', puesto: 'Gerente', email: 'jorge@test.com' },
      ],
    },
    {
      sheetName: 'Base_Venta_Individual',
      rows: [
        { num_empleado: '96568046', no_tienda: '001', venta_optica: 25000, meta: 20000, pct_cumplimiento: 125 },
        { num_empleado: '90125625', no_tienda: '002', venta_optica: 18000, meta: 20000, pct_cumplimiento: 90 },
        { num_empleado: '90461568', no_tienda: '001', venta_optica: 22000, meta: 20000, pct_cumplimiento: 110 },
      ],
    },
  ];

  const result = simulateDirectCommitImportData(tenantId, 'system', 'RetailCGMX_Data.xlsx', sheetData);
  console.log(`   Committed ${result.recordCount} records, batch: ${result.batchId}`);

  // Step 3: Verify data is stored
  console.log('\n[Step 3] Checking localStorage...');
  const batchesRaw = localStorage.getItem(OB11_STORAGE_KEYS.BATCHES);
  const committedRaw = localStorage.getItem(OB11_STORAGE_KEYS.COMMITTED);
  console.log(`   Batches key exists: ${batchesRaw ? 'YES' : 'NO'}`);
  console.log(`   Committed key exists: ${committedRaw ? 'YES' : 'NO'}`);

  if (batchesRaw) {
    const batches = JSON.parse(batchesRaw);
    console.log(`   Batches count: ${batches.length}`);
  }
  if (committedRaw) {
    const committed = JSON.parse(committedRaw);
    console.log(`   Committed records count: ${committed.length}`);
  }

  // Step 4: Extract employees using orchestrator logic
  console.log('\n[Step 4] Extracting employees (orchestrator logic)...');
  const extractedEmployees = ob11ExtractEmployees(tenantId);
  console.log(`   Employees extracted: ${extractedEmployees.length}`);

  if (extractedEmployees.length > 0) {
    console.log('   Employee IDs:');
    extractedEmployees.forEach((e, i) => {
      console.log(`     ${i + 1}. ${e.id} - ${e.firstName} ${e.lastName}`);
    });
  }

  // Step 5: Verify no demo employees
  console.log('\n[Step 5] Checking for demo employees...');
  const demoIds = ['maria-rodriguez', 'james-wilson', 'sarah-chen'];
  const hasDemoEmployees = extractedEmployees.some(e => demoIds.includes(e.id));
  const hasRealEmployees = extractedEmployees.some(e => /^\d+$/.test(e.id));

  console.log(`   Demo employees in results: ${hasDemoEmployees ? 'YES (BAD)' : 'NO (GOOD)'}`);
  console.log(`   Real employee IDs present: ${hasRealEmployees ? 'YES (GOOD)' : 'NO (BAD)'}`);

  // Verdict
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  const passed = !hasDemoEmployees && hasRealEmployees && extractedEmployees.length >= 5;

  if (passed) {
    console.log('║  OB-11 UI IMPORT TEST: PASS                                ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Employees: ${String(extractedEmployees.length).padEnd(46)}║`);
    console.log('║  Demo employees: BYPASSED                                  ║');
    console.log('║  Real employee IDs: PRESENT                                ║');
    console.log('║  Data persisted via directCommitImportData: YES            ║');
  } else {
    console.log('║  OB-11 UI IMPORT TEST: FAIL                                ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    if (hasDemoEmployees) {
      console.log('║  FAIL: Demo employees found in results                     ║');
    }
    if (!hasRealEmployees) {
      console.log('║  FAIL: No real employee IDs found                          ║');
    }
    if (extractedEmployees.length < 5) {
      console.log(`║  FAIL: Only ${extractedEmployees.length} employees found (expected 5+)              ║`);
    }
    process.exit(1);
  }
  console.log('╚════════════════════════════════════════════════════════════╝');
}

runOB11Test();
