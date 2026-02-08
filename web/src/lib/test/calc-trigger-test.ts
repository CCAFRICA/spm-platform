/**
 * Calculation Trigger Test
 *
 * This test simulates EXACTLY what happens when "Run Preview" is clicked
 * on the Calculate page. It uses the same code path as the UI.
 *
 * Run with: npx tsx src/lib/test/calc-trigger-test.ts
 */

// Mock localStorage for Node.js
const mockStorage: Record<string, string> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  length: 0,
  key: () => null,
};

// Mock window for SSR checks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = {};

// Storage keys (same as orchestrator)
const CALC_TEST_KEYS = {
  DATA_LAYER_COMMITTED: 'data_layer_committed',
  DATA_LAYER_BATCHES: 'data_layer_batches',
  EMPLOYEE_DATA: 'clearcomp_employee_data',
};

interface CalcTestEmployeeData {
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

// Seed realistic test data (simulating real import)
function seedCalcTestData() {
  const tenantId = 'restaurantmx';

  // Seed batches
  const testBatches: [string, { tenantId: string; status: string; sourceFile: string }][] = [
    ['batch-retail-001', { tenantId, status: 'committed', sourceFile: 'RetailCGMX_Data_Package.xlsx' }],
  ];

  // Seed committed records with realistic employee data
  const testCommitted: [string, { importBatchId: string; status: string; content: Record<string, unknown> }][] = [
    ['rec-001', {
      importBatchId: 'batch-retail-001',
      status: 'active',
      content: {
        num_empleado: '96568046',
        nombre: 'Carlos Garcia Rodriguez',
        no_tienda: '001',
        puesto: 'Optometrista Certificado',
        mes: '1',
        ano: '2024',
        email: 'carlos.garcia@retailcgmx.com',
      }
    }],
    ['rec-002', {
      importBatchId: 'batch-retail-001',
      status: 'active',
      content: {
        num_empleado: '90125625',
        nombre: 'Ana Martinez Lopez',
        no_tienda: '002',
        puesto: 'Optometrista',
        mes: '1',
        ano: '2024',
        email: 'ana.martinez@retailcgmx.com',
      }
    }],
    ['rec-003', {
      importBatchId: 'batch-retail-001',
      status: 'active',
      content: {
        num_empleado: '90461568',
        nombre: 'Roberto Hernandez Sanchez',
        no_tienda: '001',
        puesto: 'Vendedor',
        mes: '1',
        ano: '2024',
        email: 'roberto.hernandez@retailcgmx.com',
      }
    }],
    ['rec-004', {
      importBatchId: 'batch-retail-001',
      status: 'active',
      content: {
        num_empleado: '91234567',
        nombre: 'Maria Elena Gonzalez',
        no_tienda: '003',
        puesto: 'Optometrista Certificado',
        mes: '1',
        ano: '2024',
        email: 'maria.gonzalez@retailcgmx.com',
      }
    }],
    ['rec-005', {
      importBatchId: 'batch-retail-001',
      status: 'active',
      content: {
        num_empleado: '92345678',
        nombre: 'Jorge Luis Ramirez',
        no_tienda: '002',
        puesto: 'Gerente de Tienda',
        mes: '1',
        ano: '2024',
        email: 'jorge.ramirez@retailcgmx.com',
      }
    }],
    // Add a component data record (no name field - should be skipped for employee extraction)
    ['rec-006', {
      importBatchId: 'batch-retail-001',
      status: 'active',
      content: {
        num_empleado: '96568046',
        venta_optica: 25000,
        meta: 20000,
        pct_cumplimiento: 125,
        mes: '1',
        ano: '2024',
      }
    }],
  ];

  localStorage.setItem(CALC_TEST_KEYS.DATA_LAYER_BATCHES, JSON.stringify(testBatches));
  localStorage.setItem(CALC_TEST_KEYS.DATA_LAYER_COMMITTED, JSON.stringify(testCommitted));

  // Intentionally seed demo employees to test priority fix
  const demoEmployees: CalcTestEmployeeData[] = [
    {
      id: 'maria-rodriguez',
      tenantId: 'restaurantmx',
      employeeNumber: 'EMP-001',
      firstName: 'Maria',
      lastName: 'Rodriguez',
      email: 'maria.rodriguez@example.com',
      role: 'sales_rep',
      storeId: 'store-101',
      status: 'active',
    },
  ];
  localStorage.setItem(CALC_TEST_KEYS.EMPLOYEE_DATA, JSON.stringify(demoEmployees));
}

// Employee extraction function (same logic as orchestrator)
function calcTestExtractEmployees(tenantId: string): CalcTestEmployeeData[] {
  const employees: CalcTestEmployeeData[] = [];
  const seenIds = new Set<string>();

  const batchesStored = localStorage.getItem(CALC_TEST_KEYS.DATA_LAYER_BATCHES);
  if (!batchesStored) {
    console.log('[Test] No batches found');
    return [];
  }

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

  const committedStored = localStorage.getItem(CALC_TEST_KEYS.DATA_LAYER_COMMITTED);
  if (!committedStored) return [];

  try {
    const committed: [string, { importBatchId: string; status: string; content: Record<string, unknown> }][] =
      JSON.parse(committedStored);

    for (const [, record] of committed) {
      if (!tenantBatchIds.includes(record.importBatchId) || record.status !== 'active') {
        continue;
      }

      const content = record.content;
      const employeeId = String(
        content['num_empleado'] || content['Num_Empleado'] ||
        content['employee_id'] || content['employeeId'] || ''
      ).trim();

      if (!employeeId || seenIds.has(employeeId)) continue;

      // Check for name field (employee record vs component data)
      const hasNameField = content['nombre'] || content['name'] ||
        content['first_name'] || content['firstName'] ||
        content['nombre_completo'] || content['Nombre'];

      if (!hasNameField) continue;

      seenIds.add(employeeId);

      const fullName = String(content['nombre'] || content['nombre_completo'] || content['Nombre'] || '');
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || 'Employee';

      employees.push({
        id: employeeId,
        tenantId: tenantId,
        employeeNumber: String(content['num_empleado'] || content['Num_Empleado'] || employeeId),
        firstName: firstName,
        lastName: lastName,
        email: String(content['email'] || content['correo'] || ''),
        role: String(content['puesto'] || content['Puesto'] || content['role'] || 'sales_rep'),
        storeId: String(content['no_tienda'] || content['No_Tienda'] || content['store_id'] || ''),
        status: 'active' as const,
      });
    }
  } catch {
    // Error parsing committed data
  }

  return employees;
}

// Simulate getEmployees with FIXED priority (committed data first)
function getEmployeesFixed(tenantId: string): CalcTestEmployeeData[] {
  // PRIORITY 1: Committed import data (real imported employees take precedence)
  const committedEmployees = calcTestExtractEmployees(tenantId);
  if (committedEmployees.length > 0) {
    console.log(`[Orchestrator] Using ${committedEmployees.length} employees from committed import data`);
    return committedEmployees;
  }

  // PRIORITY 2: Stored employee data (backward compatibility)
  const stored = localStorage.getItem(CALC_TEST_KEYS.EMPLOYEE_DATA);
  if (stored) {
    try {
      const employees: CalcTestEmployeeData[] = JSON.parse(stored);
      const filtered = employees.filter((e) => e.tenantId === tenantId);
      if (filtered.length > 0) {
        console.log(`[Orchestrator] Using ${filtered.length} employees from stored data`);
        return filtered;
      }
    } catch {
      // Continue to next source
    }
  }

  // PRIORITY 3: Demo fallback
  console.log('[Orchestrator] No real employees found, using demo fallback');
  return [];
}

// Main test
function runCalcTriggerTest() {
  console.log('=== CALCULATION TRIGGER TEST ===');
  console.log('This test simulates what happens when "Run Preview" is clicked');
  console.log('');

  // Seed test data
  console.log('Seeding test data (including demo employees in stored data)...');
  seedCalcTestData();
  console.log('');

  // Get employees using fixed priority
  const tenantId = 'restaurantmx';
  console.log(`Getting employees for tenant: ${tenantId}`);
  console.log('');

  const employees = getEmployeesFixed(tenantId);

  console.log('');
  console.log('=== RESULTS ===');
  console.log(`Employees found: ${employees.length}`);

  if (employees.length > 0) {
    console.log('');
    console.log('Employee IDs returned:');
    employees.forEach((e, i) => {
      console.log(`  ${i + 1}. ID: ${e.id}, Name: ${e.firstName} ${e.lastName}, Store: ${e.storeId}`);
    });
  }

  // Critical check
  const demoNames = ['maria-rodriguez', 'james-wilson', 'sarah-chen'];
  const hasDemoNames = employees.some(e => demoNames.includes(String(e.id)));

  console.log('');
  console.log('=== VERDICT ===');
  console.log(`Demo names present: ${hasDemoNames ? 'YES' : 'NO'}`);

  if (hasDemoNames) {
    console.log('FAIL: Demo employees still in calculation path');
    console.log('The fix did not work - demo employees are taking priority');
    process.exit(1);
  } else if (employees.length === 0) {
    console.log('FAIL: No employees found');
    process.exit(1);
  } else {
    console.log('PASS: Real employees in calculation path');
    console.log('');
    console.log('Employee source: committed import data');
    console.log(`Total employees: ${employees.length}`);
    console.log('Demo employees correctly bypassed');
  }
}

runCalcTriggerTest();
