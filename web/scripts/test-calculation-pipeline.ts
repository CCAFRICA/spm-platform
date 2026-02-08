/**
 * OB-08 Phase 3: Calculation Pipeline Execution Test
 *
 * Tests the calculation pipeline end-to-end by:
 * 1. Setting up mock localStorage
 * 2. Creating required prerequisite data
 * 3. Running calculations
 * 4. Capturing results or errors
 */

// Mock localStorage
const storage = new Map<string, string>();
(global as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => Array.from(storage.keys())[i] ?? null,
};

// Mock window for typeof window checks
(global as any).window = {};

// Required imports (order matters due to how localStorage mock is used)
import { getPlans, savePlan, activatePlan, ensureTenantPlans } from '../src/lib/compensation/plan-storage';
import { calculateIncentive, type EmployeeMetrics } from '../src/lib/compensation/calculation-engine';
import type { CompensationPlanConfig } from '../src/types/compensation-plan';

const TENANT_ID = 'retailcgmx';
const PERIOD_ID = '2026-02';

console.log('====================================');
console.log('OB-08 Phase 3: Calculation Pipeline Test');
console.log('====================================\n');

// Test 1: Check prerequisites
console.log('--- Test 1: Prerequisites Check ---\n');

// 1a. Check/create active plan
console.log('1a. Checking for active compensation plan...');
ensureTenantPlans(TENANT_ID);
let plans = getPlans(TENANT_ID);
console.log(`   Found ${plans.length} plans`);

let activePlan = plans.find(p => p.status === 'active');
if (!activePlan) {
  console.log('   No active plan found. Activating first available plan...');
  const draftPlan = plans.find(p => p.status === 'draft');
  if (draftPlan) {
    activePlan = activatePlan(draftPlan.id, 'test-user');
    console.log(`   ACTIVATED: ${activePlan?.name || 'Failed'}`);
  }
} else {
  console.log(`   PASS: Active plan found - "${activePlan.name}"`);
}

// 1b. Verify plan has components
if (activePlan) {
  console.log(`\n1b. Checking plan components...`);
  // Refresh plans to get full structure
  plans = getPlans(TENANT_ID);
  activePlan = plans.find(p => p.status === 'active');
  const components = activePlan?.components || [];
  console.log(`   Components: ${components.length}`);
  components.forEach((c, i) => {
    console.log(`   [${i + 1}] ${c.name} (${c.type}) - weight: ${c.weight || 0}`);
  });
}

// Test 2: Create test employee metrics
console.log('\n--- Test 2: Employee Metrics Setup ---\n');

const testEmployees: EmployeeMetrics[] = [
  {
    employeeId: 'ana-garcia',
    employeeName: 'Ana García',
    employeeRole: 'sales_rep',
    storeId: 'store-mx-001',
    storeName: 'Polanco',
    isCertified: true,
    period: PERIOD_ID,
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    metrics: {
      optical_sales: 175000,
      optical_quota: 150000,
      optical_attainment: 116.67,
      store_sales: 850000,
      store_quota: 800000,
      store_attainment: 106.25,
      new_customers: 12,
      collection_rate: 95,
      insurance_policies: 8,
      services_completed: 15,
    },
  },
  {
    employeeId: 'carlos-martinez',
    employeeName: 'Carlos Martínez',
    employeeRole: 'sales_rep',
    storeId: 'store-mx-001',
    storeName: 'Polanco',
    isCertified: true,
    period: PERIOD_ID,
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    metrics: {
      optical_sales: 120000,
      optical_quota: 150000,
      optical_attainment: 80.00,
      store_sales: 700000,
      store_quota: 800000,
      store_attainment: 87.50,
      new_customers: 8,
      collection_rate: 88,
      insurance_policies: 5,
      services_completed: 10,
    },
  },
];

console.log(`Created ${testEmployees.length} test employees:`);
testEmployees.forEach(e => {
  console.log(`   - ${e.employeeName}: optical=${e.metrics.optical_attainment}%, store=${e.metrics.store_attainment}%`);
});

// Test 3: Run calculations
console.log('\n--- Test 3: Calculation Execution ---\n');

const results: any[] = [];
const errors: any[] = [];

for (const employee of testEmployees) {
  console.log(`Calculating for ${employee.employeeName}...`);
  try {
    const result = calculateIncentive(employee, TENANT_ID);

    if (result) {
      results.push(result);
      console.log(`   SUCCESS: $${result.totalIncentive.toLocaleString()} total incentive`);
      console.log(`   Components:`);
      result.components.forEach(c => {
        console.log(`     - ${c.componentName}: $${c.outputValue.toLocaleString()} (${c.calculation})`);
      });
    } else {
      errors.push({ employee: employee.employeeName, error: 'No result returned' });
      console.log(`   WARN: No result returned`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push({ employee: employee.employeeName, error: errorMsg });
    console.log(`   ERROR: ${errorMsg}`);
  }
}

// Test 4: Results Summary
console.log('\n--- Test 4: Results Summary ---\n');

if (results.length > 0) {
  const totalPayout = results.reduce((sum, r) => sum + r.totalIncentive, 0);
  const avgPayout = totalPayout / results.length;

  console.log('CALCULATION RESULTS:');
  console.log(`   Employees Processed: ${results.length}`);
  console.log(`   Total Payout: $${totalPayout.toLocaleString()}`);
  console.log(`   Average Payout: $${avgPayout.toLocaleString()}`);
  console.log(`   Errors: ${errors.length}`);

  console.log('\nIndividual Results:');
  results.forEach(r => {
    console.log(`   ${r.employeeName}: $${r.totalIncentive.toLocaleString()}`);
  });
} else {
  console.log('NO RESULTS - All calculations failed');
}

if (errors.length > 0) {
  console.log('\nErrors:');
  errors.forEach(e => {
    console.log(`   ${e.employee}: ${e.error}`);
  });
}

// Final Status
console.log('\n====================================');
if (results.length > 0 && errors.length === 0) {
  console.log('STATUS: PASS - Pipeline executed successfully');
} else if (results.length > 0) {
  console.log('STATUS: PARTIAL - Some calculations succeeded');
} else {
  console.log('STATUS: FAIL - No calculations succeeded');
}
console.log('====================================\n');
