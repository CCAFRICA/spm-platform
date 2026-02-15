/**
 * RetailCGMX Plan Test Runner
 *
 * This script validates the RetailCGMX incentive plan calculations
 * against the worked examples from the plan document.
 *
 * Run with: npx ts-node src/lib/compensation/retailcgmx-test.ts
 * Or import and call runTests() from a test framework
 */

import { calculateIncentive, type EntityMetrics } from './calculation-engine';
import { savePlan } from './plan-storage';
import { createRetailCGMXUnifiedPlan } from './retailcgmx-plan';

// Initialize localStorage mock for Node.js testing
if (typeof window === 'undefined') {
  const storage: Record<string, string> = {};
  (global as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
    key: (index: number) => Object.keys(storage)[index] ?? null,
    length: 0,
  };
}

// ============================================
// TEST DATA
// ============================================

const CERTIFIED_EXAMPLE: EntityMetrics = {
  entityId: 'test-certified',
  entityName: 'Test Certified Optometrist',
  entityRole: 'optometrista',
  storeId: 'store-001',
  storeName: 'Test Store',
  isCertified: true,
  period: '2025-01',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  metrics: {
    optical_attainment: 96,
    store_optical_sales: 970792,
    store_sales_attainment: 105,
    new_customers_attainment: 102,
    collections_attainment: 102,
    store_goal_attainment: 81,
    individual_insurance_sales: 2140,
    individual_warranty_sales: 4276,
  },
};

const NON_CERTIFIED_EXAMPLE: EntityMetrics = {
  ...CERTIFIED_EXAMPLE,
  entityId: 'test-noncertified',
  entityName: 'Test Non-Certified Optometrist',
  isCertified: false,
  metrics: {
    ...CERTIFIED_EXAMPLE.metrics,
    collections_attainment: 103, // Slightly different as per example
  },
};

// Expected results
const EXPECTED = {
  certified: {
    total: 2335,
    components: {
      'Venta Óptica': 1500,
      'Venta de Tienda': 300,
      'Clientes Nuevos': 150,
      'Cobranza en Tienda': 150,
      'Venta de Seguros': 64.2, // $2,140 × 3%
      'Venta de Servicios': 171.04, // $4,276 × 4%
    },
  },
  nonCertified: {
    total: 1585,
    components: {
      'Venta Óptica': 750,
      'Venta de Tienda': 300,
      'Clientes Nuevos': 150,
      'Cobranza en Tienda': 150,
      'Venta de Seguros': 64.2,
      'Venta de Servicios': 171.04,
    },
  },
};

// ============================================
// TEST RUNNER
// ============================================

export function runTests(): void {
  console.log('\n' + '='.repeat(70));
  console.log('RetailCGMX Incentive Plan - Calculation Validation');
  console.log('='.repeat(70));

  // Initialize plan
  const plan = createRetailCGMXUnifiedPlan();
  savePlan(plan);
  console.log('\n✓ Plan initialized:', plan.name);

  // Test Certified
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 1: Certified Optometrist');
  console.log('-'.repeat(70));

  const certifiedResult = calculateIncentive(CERTIFIED_EXAMPLE, 'retailcgmx', plan.id);

  if (!certifiedResult) {
    console.log('✗ FAILED: No result returned');
    return;
  }

  console.log(`\nVariant: ${certifiedResult.variantName}`);
  console.log(`Currency: ${certifiedResult.currency}`);
  console.log('\nComponent Breakdown:');

  let certifiedPassed = true;
  certifiedResult.components.forEach((comp) => {
    const expected = EXPECTED.certified.components[comp.componentName as keyof typeof EXPECTED.certified.components];
    const diff = expected !== undefined ? Math.abs(comp.outputValue - expected) : 0;
    const status = diff < 1 ? '✓' : '✗';
    if (diff >= 1) certifiedPassed = false;

    console.log(`  ${status} ${comp.componentName}: $${comp.outputValue.toFixed(2)} MXN (expected: $${expected?.toFixed(2) ?? 'N/A'})`);
  });

  console.log(`\nTotal: $${certifiedResult.totalIncentive.toFixed(2)} MXN`);
  console.log(`Expected: $${EXPECTED.certified.total} MXN`);
  const certifiedDiff = Math.abs(certifiedResult.totalIncentive - EXPECTED.certified.total);
  console.log(`Difference: $${certifiedDiff.toFixed(2)}`);
  console.log(`Status: ${certifiedDiff < 5 && certifiedPassed ? '✓ PASSED' : '✗ FAILED'}`);

  // Test Non-Certified
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 2: Non-Certified Optometrist');
  console.log('-'.repeat(70));

  const nonCertifiedResult = calculateIncentive(NON_CERTIFIED_EXAMPLE, 'retailcgmx', plan.id);

  if (!nonCertifiedResult) {
    console.log('✗ FAILED: No result returned');
    return;
  }

  console.log(`\nVariant: ${nonCertifiedResult.variantName}`);
  console.log(`Currency: ${nonCertifiedResult.currency}`);
  console.log('\nComponent Breakdown:');

  let nonCertifiedPassed = true;
  nonCertifiedResult.components.forEach((comp) => {
    const expected = EXPECTED.nonCertified.components[comp.componentName as keyof typeof EXPECTED.nonCertified.components];
    const diff = expected !== undefined ? Math.abs(comp.outputValue - expected) : 0;
    const status = diff < 1 ? '✓' : '✗';
    if (diff >= 1) nonCertifiedPassed = false;

    console.log(`  ${status} ${comp.componentName}: $${comp.outputValue.toFixed(2)} MXN (expected: $${expected?.toFixed(2) ?? 'N/A'})`);
  });

  console.log(`\nTotal: $${nonCertifiedResult.totalIncentive.toFixed(2)} MXN`);
  console.log(`Expected: $${EXPECTED.nonCertified.total} MXN`);
  const nonCertifiedDiff = Math.abs(nonCertifiedResult.totalIncentive - EXPECTED.nonCertified.total);
  console.log(`Difference: $${nonCertifiedDiff.toFixed(2)}`);
  console.log(`Status: ${nonCertifiedDiff < 5 && nonCertifiedPassed ? '✓ PASSED' : '✗ FAILED'}`);

  // Summary
  console.log('\n' + '='.repeat(70));
  const allPassed = (certifiedDiff < 5 && certifiedPassed) && (nonCertifiedDiff < 5 && nonCertifiedPassed);
  console.log(`OVERALL: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
  console.log('='.repeat(70) + '\n');
}

// Export for use in other test frameworks
export { CERTIFIED_EXAMPLE, NON_CERTIFIED_EXAMPLE, EXPECTED };
