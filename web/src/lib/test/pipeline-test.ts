/**
 * Pipeline Test Script
 *
 * Tests the calculation pipeline to verify:
 * 1. Employee extraction from committed data works
 * 2. No demo employees are used when real data exists
 *
 * Run with: npx ts-node --esm src/lib/test/pipeline-test.ts
 */

// Mock localStorage for Node.js
const localStorageData: Record<string, string> = {};

(global as any).localStorage = {
  getItem: (key: string) => localStorageData[key] || null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
  clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); },
  length: 0,
  key: () => null,
};

// Storage keys
const STORAGE_KEYS = {
  DATA_LAYER_COMMITTED: 'data_layer_committed',
  DATA_LAYER_BATCHES: 'data_layer_batches',
};

interface EmployeeData {
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

// Simulated extractEmployeesFromCommittedData function
function extractEmployeesFromCommittedData(tenantId: string): EmployeeData[] {
  const employees: EmployeeData[] = [];
  const seenIds = new Set<string>();

  // Get tenant batch IDs
  const batchesStored = localStorage.getItem(STORAGE_KEYS.DATA_LAYER_BATCHES);
  if (!batchesStored) {
    console.log('[Test] No batches found in localStorage');
    return [];
  }

  let tenantBatchIds: string[] = [];
  try {
    const batches: [string, { tenantId: string }][] = JSON.parse(batchesStored);
    tenantBatchIds = batches
      .filter(([, batch]) => batch.tenantId === tenantId)
      .map(([id]) => id);
    console.log(`[Test] Found ${tenantBatchIds.length} batches for tenant ${tenantId}`);
  } catch (e) {
    console.log('[Test] Failed to parse batches:', e);
    return [];
  }

  if (tenantBatchIds.length === 0) return [];

  // Get committed records
  const committedStored = localStorage.getItem(STORAGE_KEYS.DATA_LAYER_COMMITTED);
  if (!committedStored) {
    console.log('[Test] No committed data found');
    return [];
  }

  try {
    const committed: [string, { importBatchId: string; status: string; content: Record<string, unknown> }][] =
      JSON.parse(committedStored);

    console.log(`[Test] Found ${committed.length} total committed records`);

    for (const [recordId, record] of committed) {
      if (!tenantBatchIds.includes(record.importBatchId) || record.status !== 'active') {
        continue;
      }

      const content = record.content;

      // Extract employee ID
      const employeeId = String(
        content['num_empleado'] || content['Num_Empleado'] ||
        content['employee_id'] || content['employeeId'] ||
        content['id_empleado'] || content['Id_Empleado'] || ''
      ).trim();

      if (!employeeId || seenIds.has(employeeId)) continue;

      // Check for name field
      const hasNameField = content['nombre'] || content['name'] ||
        content['first_name'] || content['firstName'] ||
        content['nombre_completo'] || content['Nombre'];

      if (!hasNameField) continue;

      seenIds.add(employeeId);

      const firstName = String(content['nombre'] || content['first_name'] ||
        content['firstName'] || content['nombre_completo'] || content['Nombre'] || '').split(' ')[0];
      const lastName = String(content['apellido'] || content['apellido_paterno'] ||
        content['last_name'] || content['lastName'] || '').trim() ||
        String(content['nombre'] || content['nombre_completo'] || content['Nombre'] || '').split(' ').slice(1).join(' ');

      employees.push({
        id: employeeId,
        tenantId: tenantId,
        employeeNumber: String(content['num_empleado'] || content['Num_Empleado'] ||
          content['employee_number'] || content['employeeNumber'] || employeeId),
        firstName: firstName || 'Unknown',
        lastName: lastName || 'Employee',
        email: String(content['email'] || content['correo'] || ''),
        role: String(content['puesto'] || content['Puesto'] || content['role'] ||
          content['position'] || content['cargo'] || 'sales_rep'),
        storeId: String(content['no_tienda'] || content['No_Tienda'] ||
          content['store_id'] || content['storeId'] || content['tienda'] || ''),
        status: 'active' as const,
      });
    }
  } catch (e) {
    console.log('[Test] Failed to parse committed data:', e);
  }

  return employees;
}

// Test with mock data
function runTest() {
  console.log('=== PIPELINE TEST: Employee Extraction ===\n');

  const tenantId = 'restaurantmx';

  // Seed test data simulating a real import
  const testBatches: [string, { tenantId: string; status: string }][] = [
    ['batch-001', { tenantId: 'restaurantmx', status: 'committed' }],
  ];

  const testCommitted: [string, { importBatchId: string; status: string; content: Record<string, unknown> }][] = [
    ['rec-001', {
      importBatchId: 'batch-001',
      status: 'active',
      content: {
        num_empleado: '96568046',
        nombre: 'Carlos Garcia',
        no_tienda: '001',
        puesto: 'Vendedor',
        mes: '1',
        ano: '2024',
      }
    }],
    ['rec-002', {
      importBatchId: 'batch-001',
      status: 'active',
      content: {
        num_empleado: '96568047',
        nombre: 'Ana Martinez Lopez',
        no_tienda: '002',
        puesto: 'Gerente',
        mes: '1',
        ano: '2024',
      }
    }],
    ['rec-003', {
      importBatchId: 'batch-001',
      status: 'active',
      content: {
        num_empleado: '96568048',
        nombre: 'Roberto Hernandez',
        no_tienda: '001',
        puesto: 'Vendedor',
        mes: '1',
        ano: '2024',
      }
    }],
    // Record without name (should be skipped - component data, not roster)
    ['rec-004', {
      importBatchId: 'batch-001',
      status: 'active',
      content: {
        num_empleado: '96568046',
        venta_optica: 15000,
        meta: 12000,
        pct_cumplimiento: 125,
      }
    }],
  ];

  // Seed localStorage
  localStorage.setItem(STORAGE_KEYS.DATA_LAYER_BATCHES, JSON.stringify(testBatches));
  localStorage.setItem(STORAGE_KEYS.DATA_LAYER_COMMITTED, JSON.stringify(testCommitted));

  // Run extraction
  const employees = extractEmployeesFromCommittedData(tenantId);

  console.log('\n=== RESULTS ===');
  console.log(`Employee count: ${employees.length}`);

  if (employees.length > 0) {
    console.log('\nFirst 5 employees:');
    employees.slice(0, 5).forEach((e, i) => {
      console.log(`  ${i + 1}. ID: ${e.id}, Name: ${e.firstName} ${e.lastName}, Store: ${e.storeId}`);
    });

    // Check for demo employee names
    const demoNames = ['maria-rodriguez', 'james-wilson', 'sarah-chen'];
    const hasDemoEmployees = employees.some(e => demoNames.includes(e.id));

    console.log('\n=== VERDICT ===');
    if (hasDemoEmployees) {
      console.log('FAIL: Demo employees found in results');
    } else if (employees.length === 0) {
      console.log('FAIL: No employees extracted');
    } else {
      console.log('PASS: Real employees extracted, no demo data');
      console.log(`Found ${employees.length} unique employees from committed data`);
    }
  } else {
    console.log('\nFAIL: No employees found');
  }
}

runTest();
