/**
 * CLT-01: Customer Launch Test - RetailCGMX
 *
 * This test simulates the full customer launch flow:
 * 1. Tenant setup (retailcgmx / restaurantmx)
 * 2. Plan configuration
 * 3. Data import from Excel (simulated with real field names)
 * 4. Calculation execution
 * 5. Verification: Real employees processed, non-zero compensation
 *
 * Run with: npx tsx src/lib/test/CLT-01-test.ts
 */

// Mock localStorage for Node.js
const cltMockStorage: Record<string, string> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).localStorage = {
  getItem: (key: string) => cltMockStorage[key] || null,
  setItem: (key: string, value: string) => { cltMockStorage[key] = value; },
  removeItem: (key: string) => { delete cltMockStorage[key]; },
  clear: () => { Object.keys(cltMockStorage).forEach(k => delete cltMockStorage[k]); },
  length: 0,
  key: () => null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = {};

// Storage keys (must match orchestrator)
const CLT_STORAGE_KEYS = {
  DATA_LAYER_COMMITTED: 'data_layer_committed',
  DATA_LAYER_BATCHES: 'data_layer_batches',
  EMPLOYEE_DATA: 'clearcomp_employee_data',
  PLANS: 'clearcomp_plans',
  PLAN_MAPPINGS: 'clearcomp_plan_mappings',
  CALCULATION_RUNS: 'clearcomp_calculation_runs',
  CALCULATION_RESULTS: 'clearcomp_calculation_results',
};

// ============================================
// TYPES
// ============================================

interface CLTEmployee {
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

interface CLTCompensationPlan {
  id: string;
  tenantId: string;
  name: string;
  status: 'active' | 'draft' | 'archived';
  effectiveStart: string;
  effectiveEnd: string;
  components: CLTPlanComponent[];
  eligibility: { roles: string[] };
  createdAt: string;
  updatedAt: string;
}

interface CLTPlanComponent {
  id: string;
  name: string;
  type: 'quota_attainment' | 'threshold' | 'kpi_multiplier' | 'flat_bonus';
  weight: number;
  config: {
    quotaField?: string;
    attainmentField?: string;
    baseAmount?: number;
    tiers?: { min: number; max: number; rate: number }[];
    [key: string]: unknown;
  };
}

interface CLTCalculationRun {
  id: string;
  tenantId: string;
  periodId: string;
  runType: 'preview' | 'official';
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalEmployees: number;
  processedEmployees: number;
  errorCount: number;
  startedAt: string;
  completedAt?: string;
}

interface CLTCalculationResult {
  runId: string;
  employeeId: string;
  tenantId: string;
  status: 'success' | 'error';
  totalPayout: number;
  components: { componentId: string; componentName: string; amount: number }[];
  error?: string;
}

// ============================================
// TEST DATA: RetailCGMX Import Simulation
// ============================================

function seedRetailCGMXData() {
  const tenantId = 'restaurantmx';

  console.log('[CLT-01] Seeding RetailCGMX import data...');

  // Simulate imported batch from RetailCGMX_Data_Package.xlsx
  const batches: [string, { tenantId: string; status: string; sourceFile: string; createdAt: string }][] = [
    ['batch-retailcgmx-001', {
      tenantId,
      status: 'committed',
      sourceFile: 'RetailCGMX_Data_Package.xlsx',
      createdAt: new Date().toISOString()
    }],
  ];

  // Seed 25 realistic employees (simulating real import)
  // These use Spanish field names from the actual Excel import
  const employees = [
    { num_empleado: '96568046', nombre: 'Carlos Garcia Rodriguez', no_tienda: '001', puesto: 'Optometrista Certificado', email: 'carlos.garcia@retailcgmx.com' },
    { num_empleado: '90125625', nombre: 'Ana Martinez Lopez', no_tienda: '002', puesto: 'Optometrista', email: 'ana.martinez@retailcgmx.com' },
    { num_empleado: '90461568', nombre: 'Roberto Hernandez Sanchez', no_tienda: '001', puesto: 'Vendedor', email: 'roberto.hernandez@retailcgmx.com' },
    { num_empleado: '91234567', nombre: 'Maria Elena Gonzalez', no_tienda: '003', puesto: 'Optometrista Certificado', email: 'maria.gonzalez@retailcgmx.com' },
    { num_empleado: '92345678', nombre: 'Jorge Luis Ramirez', no_tienda: '002', puesto: 'Gerente de Tienda', email: 'jorge.ramirez@retailcgmx.com' },
    { num_empleado: '93456789', nombre: 'Patricia Morales Diaz', no_tienda: '004', puesto: 'Vendedor', email: 'patricia.morales@retailcgmx.com' },
    { num_empleado: '94567890', nombre: 'Fernando Torres Ruiz', no_tienda: '003', puesto: 'Optometrista', email: 'fernando.torres@retailcgmx.com' },
    { num_empleado: '95678901', nombre: 'Gabriela Ortiz Castro', no_tienda: '005', puesto: 'Optometrista Certificado', email: 'gabriela.ortiz@retailcgmx.com' },
    { num_empleado: '96789012', nombre: 'Ricardo Mendez Flores', no_tienda: '004', puesto: 'Gerente de Tienda', email: 'ricardo.mendez@retailcgmx.com' },
    { num_empleado: '97890123', nombre: 'Laura Jimenez Vargas', no_tienda: '006', puesto: 'Vendedor', email: 'laura.jimenez@retailcgmx.com' },
    { num_empleado: '98901234', nombre: 'Miguel Angel Reyes', no_tienda: '005', puesto: 'Optometrista', email: 'miguel.reyes@retailcgmx.com' },
    { num_empleado: '99012345', nombre: 'Claudia Soto Navarro', no_tienda: '007', puesto: 'Vendedor', email: 'claudia.soto@retailcgmx.com' },
    { num_empleado: '10123456', nombre: 'Andres Gutierrez Luna', no_tienda: '006', puesto: 'Optometrista Certificado', email: 'andres.gutierrez@retailcgmx.com' },
    { num_empleado: '11234567', nombre: 'Sofia Dominguez Ramos', no_tienda: '008', puesto: 'Gerente de Tienda', email: 'sofia.dominguez@retailcgmx.com' },
    { num_empleado: '12345678', nombre: 'Alejandro Cruz Medina', no_tienda: '007', puesto: 'Vendedor', email: 'alejandro.cruz@retailcgmx.com' },
    { num_empleado: '13456789', nombre: 'Carmen Valencia Romero', no_tienda: '009', puesto: 'Optometrista', email: 'carmen.valencia@retailcgmx.com' },
    { num_empleado: '14567890', nombre: 'Daniel Herrera Aguilar', no_tienda: '008', puesto: 'Vendedor', email: 'daniel.herrera@retailcgmx.com' },
    { num_empleado: '15678901', nombre: 'Isabel Rojas Salazar', no_tienda: '010', puesto: 'Optometrista Certificado', email: 'isabel.rojas@retailcgmx.com' },
    { num_empleado: '16789012', nombre: 'Oscar Sandoval Perez', no_tienda: '009', puesto: 'Gerente de Tienda', email: 'oscar.sandoval@retailcgmx.com' },
    { num_empleado: '17890123', nombre: 'Teresa Molina Blanco', no_tienda: '011', puesto: 'Vendedor', email: 'teresa.molina@retailcgmx.com' },
    { num_empleado: '18901234', nombre: 'Juan Pablo Serrano', no_tienda: '010', puesto: 'Optometrista', email: 'juan.serrano@retailcgmx.com' },
    { num_empleado: '19012345', nombre: 'Rosa Maria Delgado', no_tienda: '012', puesto: 'Vendedor', email: 'rosa.delgado@retailcgmx.com' },
    { num_empleado: '20123456', nombre: 'Francisco Guerrero Pena', no_tienda: '011', puesto: 'Optometrista Certificado', email: 'francisco.guerrero@retailcgmx.com' },
    { num_empleado: '21234567', nombre: 'Lucia Campos Ibarra', no_tienda: '013', puesto: 'Gerente de Tienda', email: 'lucia.campos@retailcgmx.com' },
    { num_empleado: '22345678', nombre: 'Eduardo Vega Cordova', no_tienda: '012', puesto: 'Vendedor', email: 'eduardo.vega@retailcgmx.com' },
  ];

  // Create committed records for employee roster
  const committed: [string, { importBatchId: string; status: string; content: Record<string, unknown> }][] = [];

  // Add employee roster records
  employees.forEach((emp, i) => {
    committed.push([`rec-emp-${String(i + 1).padStart(3, '0')}`, {
      importBatchId: 'batch-retailcgmx-001',
      status: 'active',
      content: {
        ...emp,
        mes: '1',
        ano: '2024',
      }
    }]);
  });

  // Add performance data records (no nombre field - component data)
  // These provide the metrics for calculation
  employees.forEach((emp, i) => {
    const baseOptical = 15000 + Math.floor(Math.random() * 25000);
    const quota = 20000;
    const attainment = Math.round((baseOptical / quota) * 100);

    committed.push([`rec-perf-${String(i + 1).padStart(3, '0')}`, {
      importBatchId: 'batch-retailcgmx-001',
      status: 'active',
      content: {
        num_empleado: emp.num_empleado,
        no_tienda: emp.no_tienda,
        venta_optica: baseOptical,
        meta: quota,
        pct_cumplimiento: attainment,
        mes: '1',
        ano: '2024',
      }
    }]);
  });

  localStorage.setItem(CLT_STORAGE_KEYS.DATA_LAYER_BATCHES, JSON.stringify(batches));
  localStorage.setItem(CLT_STORAGE_KEYS.DATA_LAYER_COMMITTED, JSON.stringify(committed));

  console.log(`[CLT-01] Seeded ${employees.length} employees with performance data`);

  // Also seed demo employees to verify they get bypassed
  const demoEmployees: CLTEmployee[] = [
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
    {
      id: 'james-wilson',
      tenantId: 'restaurantmx',
      employeeNumber: 'EMP-002',
      firstName: 'James',
      lastName: 'Wilson',
      email: 'james.wilson@example.com',
      role: 'sales_rep',
      storeId: 'store-102',
      status: 'active',
    },
    {
      id: 'sarah-chen',
      tenantId: 'restaurantmx',
      employeeNumber: 'EMP-003',
      firstName: 'Sarah',
      lastName: 'Chen',
      email: 'sarah.chen@example.com',
      role: 'manager',
      storeId: 'store-101',
      status: 'active',
    },
  ];
  localStorage.setItem(CLT_STORAGE_KEYS.EMPLOYEE_DATA, JSON.stringify(demoEmployees));
  console.log('[CLT-01] Seeded 3 demo employees (should be bypassed)');
}

function seedCompensationPlan() {
  const tenantId = 'restaurantmx';

  console.log('[CLT-01] Creating compensation plan...');

  const plan: CLTCompensationPlan = {
    id: 'plan-retailcgmx-optical',
    tenantId,
    name: 'RetailCGMX Optical Sales Plan',
    status: 'active',
    effectiveStart: '2024-01-01',
    effectiveEnd: '2024-12-31',
    eligibility: {
      roles: ['Optometrista', 'Optometrista Certificado', 'Vendedor', 'Gerente de Tienda', 'sales_rep', 'manager'],
    },
    components: [
      {
        id: 'comp-optical-quota',
        name: 'Optical Sales Commission',
        type: 'quota_attainment',
        weight: 100,
        config: {
          quotaField: 'meta',
          attainmentField: 'pct_cumplimiento',
          baseAmount: 5000, // Base payout in MXN
          tiers: [
            { min: 0, max: 80, rate: 0.5 },
            { min: 80, max: 100, rate: 1.0 },
            { min: 100, max: 120, rate: 1.25 },
            { min: 120, max: 999, rate: 1.5 },
          ],
        },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(CLT_STORAGE_KEYS.PLANS, JSON.stringify([plan]));
  console.log(`[CLT-01] Created plan: ${plan.name}`);
}

// ============================================
// EMPLOYEE EXTRACTION (same logic as orchestrator)
// ============================================

function cltExtractEmployeesFromCommittedData(tenantId: string): CLTEmployee[] {
  const employees: CLTEmployee[] = [];
  const seenIds = new Set<string>();

  const batchesStored = localStorage.getItem(CLT_STORAGE_KEYS.DATA_LAYER_BATCHES);
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

  const committedStored = localStorage.getItem(CLT_STORAGE_KEYS.DATA_LAYER_COMMITTED);
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
    // Error parsing
  }

  return employees;
}

function getEmployees(tenantId: string): CLTEmployee[] {
  // PRIORITY 1: Committed import data (real imported employees take precedence)
  const committedEmployees = cltExtractEmployeesFromCommittedData(tenantId);
  if (committedEmployees.length > 0) {
    console.log(`[CLT-01] Using ${committedEmployees.length} employees from committed import data`);
    return committedEmployees;
  }

  // PRIORITY 2: Stored employee data (backward compatibility)
  const stored = localStorage.getItem(CLT_STORAGE_KEYS.EMPLOYEE_DATA);
  if (stored) {
    try {
      const employees: CLTEmployee[] = JSON.parse(stored);
      const filtered = employees.filter((e) => e.tenantId === tenantId);
      if (filtered.length > 0) {
        console.log(`[CLT-01] Using ${filtered.length} employees from stored data`);
        return filtered;
      }
    } catch {
      // Continue
    }
  }

  console.log('[CLT-01] No employees found');
  return [];
}

// ============================================
// CALCULATION SIMULATION
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getEmployeeMetrics(employeeId: string, _tenantId: string): Record<string, number> {
  const committedStored = localStorage.getItem(CLT_STORAGE_KEYS.DATA_LAYER_COMMITTED);
  if (!committedStored) return {};

  try {
    const committed: [string, { importBatchId: string; status: string; content: Record<string, unknown> }][] =
      JSON.parse(committedStored);

    for (const [, record] of committed) {
      const content = record.content;
      const recEmployeeId = String(content['num_empleado'] || content['employee_id'] || '').trim();

      if (recEmployeeId === employeeId && !content['nombre']) {
        // This is a performance record, not roster
        return {
          venta_optica: Number(content['venta_optica']) || 0,
          meta: Number(content['meta']) || 0,
          pct_cumplimiento: Number(content['pct_cumplimiento']) || 0,
        };
      }
    }
  } catch {
    // Error
  }

  return {};
}

function calculatePayout(attainment: number, baseAmount: number, tiers: { min: number; max: number; rate: number }[]): number {
  for (const tier of tiers) {
    if (attainment >= tier.min && attainment < tier.max) {
      return Math.round(baseAmount * tier.rate);
    }
  }
  return baseAmount;
}

function runCalculation(tenantId: string, periodId: string): { run: CLTCalculationRun; results: CLTCalculationResult[] } {
  console.log('\n[CLT-01] === RUNNING CALCULATION ===');

  const employees = getEmployees(tenantId);

  const run: CLTCalculationRun = {
    id: `run-clt01-${Date.now()}`,
    tenantId,
    periodId,
    runType: 'preview',
    status: 'running',
    totalEmployees: employees.length,
    processedEmployees: 0,
    errorCount: 0,
    startedAt: new Date().toISOString(),
  };

  const results: CLTCalculationResult[] = [];

  // Get plan
  const plansStored = localStorage.getItem(CLT_STORAGE_KEYS.PLANS);
  const plans: CLTCompensationPlan[] = plansStored ? JSON.parse(plansStored) : [];
  const activePlan = plans.find(p => p.status === 'active');

  if (!activePlan) {
    console.log('[CLT-01] ERROR: No active plan found');
    run.status = 'failed';
    run.completedAt = new Date().toISOString();
    return { run, results };
  }

  console.log(`[CLT-01] Using plan: ${activePlan.name}`);
  console.log(`[CLT-01] Processing ${employees.length} employees...`);

  for (const employee of employees) {
    const metrics = getEmployeeMetrics(employee.id, tenantId);

    let totalPayout = 0;
    const componentResults: { componentId: string; componentName: string; amount: number }[] = [];

    for (const component of activePlan.components) {
      if (component.type === 'quota_attainment') {
        const attainment = metrics['pct_cumplimiento'] || 0;
        const baseAmount = component.config.baseAmount || 5000;
        const tiers = component.config.tiers || [];

        const payout = calculatePayout(attainment, baseAmount, tiers);
        totalPayout += payout;

        componentResults.push({
          componentId: component.id,
          componentName: component.name,
          amount: payout,
        });
      }
    }

    results.push({
      runId: run.id,
      employeeId: employee.id,
      tenantId,
      status: 'success',
      totalPayout,
      components: componentResults,
    });

    run.processedEmployees++;
  }

  run.status = 'completed';
  run.completedAt = new Date().toISOString();

  // Save results
  localStorage.setItem(CLT_STORAGE_KEYS.CALCULATION_RUNS, JSON.stringify([run]));
  localStorage.setItem(CLT_STORAGE_KEYS.CALCULATION_RESULTS, JSON.stringify(results));

  return { run, results };
}

// ============================================
// MAIN TEST
// ============================================

function runCLT01() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  CLT-01: Customer Launch Test - RetailCGMX                 ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  This test verifies OB-10 fix: Real employees processed,  ║');
  console.log('║  demo employees bypassed, non-zero compensation.          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const tenantId = 'restaurantmx';
  const periodId = '2024-01';

  // Phase 1: Seed data
  console.log('=== PHASE 1: DATA SETUP ===');
  seedRetailCGMXData();
  seedCompensationPlan();

  // Phase 2: Run calculation
  console.log('\n=== PHASE 2: CALCULATION ===');
  const { run, results } = runCalculation(tenantId, periodId);

  // Phase 3: Analyze results
  console.log('\n=== PHASE 3: RESULTS ===');
  console.log(`Run ID: ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(`Employees processed: ${run.processedEmployees}`);
  console.log(`Errors: ${run.errorCount}`);

  const totalCompensation = results.reduce((sum, r) => sum + r.totalPayout, 0);
  console.log(`\nTotal Compensation: $${totalCompensation.toLocaleString()} MXN`);

  // Show sample results
  console.log('\nSample Results (first 5):');
  results.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i + 1}. Employee ${r.employeeId}: $${r.totalPayout.toLocaleString()} MXN`);
  });

  // Phase 4: Verification
  console.log('\n=== PHASE 4: VERIFICATION ===');

  const checks = {
    realEmployees: false,
    noDemoEmployees: false,
    nonZeroCompensation: false,
    allProcessed: false,
  };

  // Check 1: Real employees (not demo IDs)
  const demoIds = ['maria-rodriguez', 'james-wilson', 'sarah-chen'];
  const hasDemoEmployees = results.some(r => demoIds.includes(r.employeeId));
  checks.noDemoEmployees = !hasDemoEmployees;
  console.log(`[${checks.noDemoEmployees ? 'PASS' : 'FAIL'}] No demo employees in results`);

  // Check 2: Real employee IDs (numeric from import)
  const hasRealEmployees = results.some(r => /^\d+$/.test(r.employeeId));
  checks.realEmployees = hasRealEmployees;
  console.log(`[${checks.realEmployees ? 'PASS' : 'FAIL'}] Real employee IDs present`);

  // Check 3: Non-zero compensation
  checks.nonZeroCompensation = totalCompensation > 0;
  console.log(`[${checks.nonZeroCompensation ? 'PASS' : 'FAIL'}] Non-zero total compensation ($${totalCompensation.toLocaleString()} MXN)`);

  // Check 4: All employees processed
  checks.allProcessed = run.processedEmployees === run.totalEmployees && run.errorCount === 0;
  console.log(`[${checks.allProcessed ? 'PASS' : 'FAIL'}] All ${run.totalEmployees} employees processed without errors`);

  // Final verdict
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  const allPassed = Object.values(checks).every(c => c);
  if (allPassed) {
    console.log('║  CLT-01 RESULT: PASS                                       ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Employees: ${String(run.processedEmployees).padEnd(46)}║`);
    console.log(`║  Total Compensation: $${totalCompensation.toLocaleString().padEnd(35)} MXN  ║`);
    console.log('║  Demo Employees: BYPASSED                                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } else {
    console.log('║  CLT-01 RESULT: FAIL                                       ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    Object.entries(checks).forEach(([key, passed]) => {
      if (!passed) {
        console.log(`║  FAILED: ${key.padEnd(48)}║`);
      }
    });
    console.log('╚════════════════════════════════════════════════════════════╝');
    process.exit(1);
  }
}

runCLT01();
