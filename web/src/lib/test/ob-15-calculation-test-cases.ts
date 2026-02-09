/**
 * OB-15 Calculation Test Cases
 *
 * 5 test employees with known metrics and hand-calculated expected results.
 * Validates calculation engine against plan rules.
 */

import { calculateIncentive, type EmployeeMetrics } from '@/lib/compensation/calculation-engine';
import { savePlan } from '@/lib/compensation/plan-storage';
import { createRetailCGMXUnifiedPlan } from '@/lib/compensation/retailcgmx-plan';

// ============================================
// TEST DATA: 5 EMPLOYEES
// ============================================

/**
 * TEST-HIGH-001: HIGH PERFORMER (Certified)
 * All attainments > 100%
 */
export const TEST_HIGH_001: EmployeeMetrics = {
  employeeId: 'TEST-HIGH-001',
  employeeName: 'Test High Performer',
  employeeRole: 'optometrista',
  storeId: 'MX-GDL-001',
  storeName: 'Guadalajara Centro',
  isCertified: true,
  period: '2026-01',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  metrics: {
    // Optical: 120% attainment, store sales $200k (top band)
    optical_attainment: 120,
    store_optical_sales: 200000,
    // Store Sales: 112% attainment (>=110% tier)
    store_sales_attainment: 112,
    // New Customers: 128% attainment (>=125% tier)
    new_customers_attainment: 128,
    // Collections: 122% attainment (120-125% tier)
    collections_attainment: 122,
    // Store Goal: 105% (>=100%, so 5% rate for insurance)
    store_goal_attainment: 105,
    // Individual Insurance Sales: $3,000
    individual_insurance_sales: 3000,
    // Individual Warranty Sales: $5,000
    individual_warranty_sales: 5000,
  },
};

/**
 * HAND CALCULATION for TEST-HIGH-001:
 *
 * 1. Venta Optica (matrix_lookup, Certified):
 *    - Row: 120% -> "100%-150%" band (index 3)
 *    - Column: $200k -> "$180k+" band (index 4)
 *    - Matrix[3][4] = 2500
 *    => $2,500 MXN
 *
 * 2. Venta de Tienda (tier_lookup):
 *    - 112% -> ">=110%" tier
 *    => $500 MXN
 *
 * 3. Clientes Nuevos (tier_lookup):
 *    - 128% -> ">=125%" tier
 *    => $400 MXN
 *
 * 4. Cobranza (tier_lookup):
 *    - 122% -> "120%-125%" tier
 *    => $350 MXN
 *
 * 5. Seguros (conditional_percentage):
 *    - store_goal_attainment 105% >= 100%, so rate = 5%
 *    - $3,000 * 0.05 = $150
 *    => $150 MXN
 *
 * 6. Servicios (percentage):
 *    - $5,000 * 0.04 = $200
 *    => $200 MXN
 *
 * TOTAL: $2,500 + $500 + $400 + $350 + $150 + $200 = $4,100 MXN
 */
export const EXPECTED_HIGH_001 = {
  total: 4100,
  components: {
    'Venta Óptica': 2500,
    'Venta de Tienda': 500,
    'Clientes Nuevos': 400,
    'Cobranza en Tienda': 350,
    'Venta de Seguros': 150,
    'Venta de Servicios': 200,
  },
};

/**
 * TEST-LOW-002: LOW PERFORMER (Non-Certified)
 * All attainments < 80%
 */
export const TEST_LOW_002: EmployeeMetrics = {
  employeeId: 'TEST-LOW-002',
  employeeName: 'Test Low Performer',
  employeeRole: 'optometrista',
  storeId: 'MX-MTY-001',
  storeName: 'Monterrey Norte',
  isCertified: false,
  period: '2026-01',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  metrics: {
    // Optical: 50% attainment, store sales $40k
    optical_attainment: 50,
    store_optical_sales: 40000,
    // Store Sales: 60% (<100%)
    store_sales_attainment: 60,
    // New Customers: 50% (<100%)
    new_customers_attainment: 50,
    // Collections: 45% (<100%)
    collections_attainment: 45,
    // Store Goal: 55% (<100%, so 3% rate)
    store_goal_attainment: 55,
    // Individual Insurance Sales: $1,000
    individual_insurance_sales: 1000,
    // Individual Warranty Sales: $500
    individual_warranty_sales: 500,
  },
};

/**
 * HAND CALCULATION for TEST-LOW-002:
 *
 * 1. Venta Optica (matrix_lookup, Non-Certified):
 *    - Row: 50% -> "<80%" band (index 0)
 *    - Column: $40k -> "<$60k" band (index 0)
 *    - Matrix[0][0] = 0
 *    => $0 MXN
 *
 * 2. Venta de Tienda: 60% < 100% => $0 MXN
 * 3. Clientes Nuevos: 50% < 100% => $0 MXN
 * 4. Cobranza: 45% < 100% => $0 MXN
 * 5. Seguros: store_goal 55% < 100%, rate = 3%
 *    - $1,000 * 0.03 = $30
 *    => $30 MXN
 * 6. Servicios: $500 * 0.04 = $20
 *    => $20 MXN
 *
 * TOTAL: $0 + $0 + $0 + $0 + $30 + $20 = $50 MXN
 */
export const EXPECTED_LOW_002 = {
  total: 50,
  components: {
    'Venta Óptica': 0,
    'Venta de Tienda': 0,
    'Clientes Nuevos': 0,
    'Cobranza en Tienda': 0,
    'Venta de Seguros': 30,
    'Venta de Servicios': 20,
  },
};

/**
 * TEST-EDGE-003: EDGE CASE (Certified)
 * Attainments at EXACTLY tier boundaries (100%, 80%)
 */
export const TEST_EDGE_003: EmployeeMetrics = {
  employeeId: 'TEST-EDGE-003',
  employeeName: 'Test Edge Case',
  employeeRole: 'optometrista',
  storeId: 'MX-CDMX-001',
  storeName: 'CDMX Reforma',
  isCertified: true,
  period: '2026-01',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  metrics: {
    // Optical: EXACTLY 100%, store sales $120k (boundary)
    optical_attainment: 100,
    store_optical_sales: 120000,
    // Store Sales: EXACTLY 100%
    store_sales_attainment: 100,
    // New Customers: EXACTLY 100%
    new_customers_attainment: 100,
    // Collections: EXACTLY 100%
    collections_attainment: 100,
    // Store Goal: EXACTLY 100%
    store_goal_attainment: 100,
    // Insurance/Warranty
    individual_insurance_sales: 2000,
    individual_warranty_sales: 3000,
  },
};

/**
 * HAND CALCULATION for TEST-EDGE-003:
 *
 * 1. Venta Optica (Certified):
 *    - Row: 100% -> "100%-150%" band (min 100 <= 100 < max 150)
 *    - Column: $120k -> "$120k-$180k" band (min 120000 <= 120000 < max 180000)
 *    - Matrix[3][3] = 1800
 *    => $1,800 MXN
 *
 * 2. Venta de Tienda: 100% -> "100%-105%" tier (min 100 <= 100 < max 105)
 *    => $150 MXN
 *
 * 3. Clientes Nuevos: 100% -> "100%-105%" tier
 *    => $150 MXN
 *
 * 4. Cobranza: 100% -> "100%-105%" tier
 *    => $150 MXN
 *
 * 5. Seguros: store_goal 100% >= 100%, rate = 5%
 *    - $2,000 * 0.05 = $100
 *    => $100 MXN
 *
 * 6. Servicios: $3,000 * 0.04 = $120
 *    => $120 MXN
 *
 * TOTAL: $1,800 + $150 + $150 + $150 + $100 + $120 = $2,470 MXN
 */
export const EXPECTED_EDGE_003 = {
  total: 2470,
  components: {
    'Venta Óptica': 1800,
    'Venta de Tienda': 150,
    'Clientes Nuevos': 150,
    'Cobranza en Tienda': 150,
    'Venta de Seguros': 100,
    'Venta de Servicios': 120,
  },
};

/**
 * TEST-PARTIAL-004: PARTIAL DATA (Certified)
 * Missing metrics for 2 components
 */
export const TEST_PARTIAL_004: EmployeeMetrics = {
  employeeId: 'TEST-PARTIAL-004',
  employeeName: 'Test Partial Data',
  employeeRole: 'optometrista',
  storeId: 'MX-GDL-002',
  storeName: 'Guadalajara Sur',
  isCertified: true,
  period: '2026-01',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  metrics: {
    // Optical: 90% attainment, store sales $100k
    optical_attainment: 90,
    store_optical_sales: 100000,
    // Store Sales: 108%
    store_sales_attainment: 108,
    // New Customers: MISSING (undefined)
    // new_customers_attainment: undefined,
    // Collections: MISSING (undefined)
    // collections_attainment: undefined,
    // Store Goal: 95%
    store_goal_attainment: 95,
    // Insurance/Warranty
    individual_insurance_sales: 1500,
    individual_warranty_sales: 2500,
  },
};

/**
 * HAND CALCULATION for TEST-PARTIAL-004:
 *
 * 1. Venta Optica (Certified):
 *    - Row: 90% -> "90%-100%" band (index 2)
 *    - Column: $100k -> "$100k-$120k" band (index 2)
 *    - Matrix[2][2] = 800
 *    => $800 MXN
 *
 * 2. Venta de Tienda: 108% -> "105%-110%" tier
 *    => $300 MXN
 *
 * 3. Clientes Nuevos: MISSING -> defaults to 0 attainment -> $0
 *    => $0 MXN
 *
 * 4. Cobranza: MISSING -> defaults to 0 attainment -> $0
 *    => $0 MXN
 *
 * 5. Seguros: store_goal 95% < 100%, rate = 3%
 *    - $1,500 * 0.03 = $45
 *    => $45 MXN
 *
 * 6. Servicios: $2,500 * 0.04 = $100
 *    => $100 MXN
 *
 * TOTAL: $800 + $300 + $0 + $0 + $45 + $100 = $1,245 MXN
 */
export const EXPECTED_PARTIAL_004 = {
  total: 1245,
  components: {
    'Venta Óptica': 800,
    'Venta de Tienda': 300,
    'Clientes Nuevos': 0,
    'Cobranza en Tienda': 0,
    'Venta de Seguros': 45,
    'Venta de Servicios': 100,
  },
};

/**
 * TEST-ZERO-005: ZERO PERFORMER (Non-Certified)
 * All metrics at 0
 */
export const TEST_ZERO_005: EmployeeMetrics = {
  employeeId: 'TEST-ZERO-005',
  employeeName: 'Test Zero Performer',
  employeeRole: 'optometrista',
  storeId: 'MX-MTY-002',
  storeName: 'Monterrey Centro',
  isCertified: false,
  period: '2026-01',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  metrics: {
    optical_attainment: 0,
    store_optical_sales: 0,
    store_sales_attainment: 0,
    new_customers_attainment: 0,
    collections_attainment: 0,
    store_goal_attainment: 0,
    individual_insurance_sales: 0,
    individual_warranty_sales: 0,
  },
};

/**
 * HAND CALCULATION for TEST-ZERO-005:
 *
 * All metrics are 0:
 * 1. Venta Optica: Matrix[0][0] = $0
 * 2. Venta de Tienda: $0
 * 3. Clientes Nuevos: $0
 * 4. Cobranza: $0
 * 5. Seguros: $0 * 0.03 = $0
 * 6. Servicios: $0 * 0.04 = $0
 *
 * TOTAL: $0 MXN
 */
export const EXPECTED_ZERO_005 = {
  total: 0,
  components: {
    'Venta Óptica': 0,
    'Venta de Tienda': 0,
    'Clientes Nuevos': 0,
    'Cobranza en Tienda': 0,
    'Venta de Seguros': 0,
    'Venta de Servicios': 0,
  },
};

// ============================================
// ALL TEST CASES
// ============================================

export const ALL_TEST_CASES = [
  { employee: TEST_HIGH_001, expected: EXPECTED_HIGH_001, description: 'HIGH PERFORMER (Certified, all >100%)' },
  { employee: TEST_LOW_002, expected: EXPECTED_LOW_002, description: 'LOW PERFORMER (Non-Certified, all <80%)' },
  { employee: TEST_EDGE_003, expected: EXPECTED_EDGE_003, description: 'EDGE CASE (Certified, exactly at boundaries)' },
  { employee: TEST_PARTIAL_004, expected: EXPECTED_PARTIAL_004, description: 'PARTIAL DATA (Certified, missing 2 components)' },
  { employee: TEST_ZERO_005, expected: EXPECTED_ZERO_005, description: 'ZERO PERFORMER (Non-Certified, all zeros)' },
];

// ============================================
// TEST RUNNER
// ============================================

export interface TestResult {
  employeeId: string;
  description: string;
  passed: boolean;
  expectedTotal: number;
  actualTotal: number;
  difference: number;
  componentResults: Array<{
    componentName: string;
    expected: number;
    actual: number;
    match: boolean;
  }>;
  warnings?: string[];
}

export function runCalculationTests(tenantId: string = 'retailcgmx'): TestResult[] {
  // Initialize plan
  const plan = createRetailCGMXUnifiedPlan();
  savePlan(plan);
  console.log('Plan initialized:', plan.name);

  const results: TestResult[] = [];

  for (const testCase of ALL_TEST_CASES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${testCase.employee.employeeId} - ${testCase.description}`);
    console.log('='.repeat(60));

    const calcResult = calculateIncentive(testCase.employee, tenantId, plan.id);

    if (!calcResult) {
      results.push({
        employeeId: testCase.employee.employeeId,
        description: testCase.description,
        passed: false,
        expectedTotal: testCase.expected.total,
        actualTotal: 0,
        difference: testCase.expected.total,
        componentResults: [],
        warnings: ['No calculation result returned'],
      });
      continue;
    }

    const componentResults: TestResult['componentResults'] = [];
    let allComponentsMatch = true;

    // Compare each component
    for (const comp of calcResult.components) {
      const expectedValue = testCase.expected.components[comp.componentName as keyof typeof testCase.expected.components] ?? 0;
      const actualValue = comp.outputValue;
      const match = Math.abs(actualValue - expectedValue) < 1; // Allow $1 tolerance

      componentResults.push({
        componentName: comp.componentName,
        expected: expectedValue,
        actual: actualValue,
        match,
      });

      if (!match) allComponentsMatch = false;

      const status = match ? 'MATCH' : 'MISMATCH';
      console.log(`  ${comp.componentName}: Engine=$${actualValue.toFixed(2)}, Expected=$${expectedValue.toFixed(2)} [${status}]`);
    }

    const totalDiff = Math.abs(calcResult.totalIncentive - testCase.expected.total);
    const totalMatch = totalDiff < 5; // Allow $5 tolerance on total

    console.log(`\n  TOTAL: Engine=$${calcResult.totalIncentive.toFixed(2)}, Expected=$${testCase.expected.total} [${totalMatch ? 'MATCH' : 'MISMATCH'}]`);

    results.push({
      employeeId: testCase.employee.employeeId,
      description: testCase.description,
      passed: allComponentsMatch && totalMatch,
      expectedTotal: testCase.expected.total,
      actualTotal: calcResult.totalIncentive,
      difference: totalDiff,
      componentResults,
      warnings: calcResult.warnings,
    });
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`  ${result.employeeId}: ${status} (Expected: $${result.expectedTotal}, Actual: $${result.actualTotal.toFixed(2)}, Diff: $${result.difference.toFixed(2)})`);
  }

  console.log(`\n  PASSED: ${passCount}/${results.length}`);
  console.log(`  FAILED: ${failCount}/${results.length}`);
  console.log('='.repeat(60));

  return results;
}

// Export for direct execution
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  // Running in Node.js
  const storage: Record<string, string> = {};
  (global as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
    key: (index: number) => Object.keys(storage)[index] ?? null,
    length: 0,
  };

  runCalculationTests();
}
