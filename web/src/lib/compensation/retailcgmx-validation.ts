/**
 * RetailCGMX Plan Validation
 *
 * Test cases and validation for the RetailCGMX incentive plan.
 * Uses worked examples from the original plan document.
 */

import type { EntityMetrics } from './calculation-engine';
import { calculateIncentive } from './calculation-engine';
import { createRetailCGMXUnifiedPlan } from './retailcgmx-plan';

// Stubs for deleted plan-storage -- plans now in Supabase rule_sets table
/* eslint-disable @typescript-eslint/no-unused-vars */
function savePlan(_plan: unknown): void {}
function getPlan(_id: string): ReturnType<typeof createRetailCGMXUnifiedPlan> | null { return null; }
/* eslint-enable @typescript-eslint/no-unused-vars */

// ============================================
// WORKED EXAMPLE TEST DATA
// ============================================

/**
 * Certified Optometrist Example from Plan Document:
 * - Optical Sales: 96% attainment, $970,792 sales → $1,500
 * - Store Sales: 105% attainment → $300
 * - New Customers: 102% attainment → $150
 * - Collections: 102% attainment → $150
 * - Insurance: 81% store attainment, $2,140 sales → $64 (at 3%)
 * - Warranty: $4,276 sales → $171 (at 4%)
 * - TOTAL: $2,335
 */
export function getCertifiedWorkedExample(): EntityMetrics {
  return {
    entityId: 'optometrista-certificado-ejemplo',
    entityName: 'Juan García (Certificado)',
    entityRole: 'optometrista',
    storeId: 'store-cgmx-001',
    storeName: 'Tienda Centro CDMX',
    isCertified: true,
    period: '2025-01',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    metrics: {
      // Component 1: Optical Sales Matrix
      optical_attainment: 96, // 96% - falls in 90%-100% row
      store_optical_sales: 970792, // $970,792 MXN - falls in $180k+ column
      // Expected: Row 90-100% × Column $180k+ = $1,500

      // Component 2: Store Sales Tier
      store_sales_attainment: 105, // 105% - falls in 105%-109.99% tier
      // Expected: $300

      // Component 3: New Customers Tier
      new_customers_attainment: 102, // 102% - falls in 100%-104.99% tier
      // Expected: $150

      // Component 4: Collections Tier
      collections_attainment: 102, // 102% - falls in 100%-104.99% tier
      // Expected: $150

      // Component 5: Insurance (Conditional Percentage)
      store_goal_attainment: 81, // 81% - below 100%, so 3% rate applies
      individual_insurance_sales: 2140, // $2,140 MXN individual sales
      // Expected: $2,140 × 3% = $64.20 → $64

      // Component 6: Warranty (Flat 4%)
      individual_warranty_sales: 4276, // $4,276 MXN individual warranty sales
      // Expected: $4,276 × 4% = $171.04 → $171
    },
  };
}

/**
 * Non-Certified Optometrist Example with same store data:
 * - Optical Sales: 96% attainment, $970,792 sales → $750
 * - Store Sales: 105% → $300
 * - New Customers: 102% → $150
 * - Collections: 103% → $150
 * - Insurance: 81%, $2,140 → $64
 * - Warranty: $4,276 → $171
 * - TOTAL: $1,585
 */
export function getNonCertifiedWorkedExample(): EntityMetrics {
  return {
    entityId: 'optometrista-no-certificado-ejemplo',
    entityName: 'María López (No Certificado)',
    entityRole: 'optometrista',
    storeId: 'store-cgmx-001',
    storeName: 'Tienda Centro CDMX',
    isCertified: false,
    period: '2025-01',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    metrics: {
      // Component 1: Optical Sales Matrix (Non-Certified has lower values)
      optical_attainment: 96, // 96% - falls in 90%-100% row
      store_optical_sales: 970792, // $970,792 MXN - falls in $180k+ column
      // Expected: Row 90-100% × Column $180k+ = $750 (non-certified)

      // Component 2: Store Sales Tier (same as certified)
      store_sales_attainment: 105, // 105%
      // Expected: $300

      // Component 3: New Customers Tier (same as certified)
      new_customers_attainment: 102, // 102%
      // Expected: $150

      // Component 4: Collections Tier (same as certified)
      collections_attainment: 103, // 103%
      // Expected: $150

      // Component 5: Insurance (same as certified)
      store_goal_attainment: 81, // 81%
      individual_insurance_sales: 2140,
      // Expected: $64

      // Component 6: Warranty (same as certified)
      individual_warranty_sales: 4276,
      // Expected: $171
    },
  };
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

export interface ValidationResult {
  passed: boolean;
  employeeType: string;
  expectedTotal: number;
  actualTotal: number;
  difference: number;
  componentResults: {
    name: string;
    expected: number;
    actual: number;
    passed: boolean;
  }[];
}

export async function validateCertifiedExample(): Promise<ValidationResult> {
  // Ensure plan is saved
  const ruleSetId = 'plan-retailcgmx-unified-2025';
  let plan = getPlan(ruleSetId);
  if (!plan) {
    plan = createRetailCGMXUnifiedPlan();
    savePlan(plan);
  }

  const metrics = getCertifiedWorkedExample();
  const result = await calculateIncentive(metrics, 'retailcgmx', ruleSetId);

  const expectedComponents = [
    { name: 'Venta Óptica', expected: 1500 },
    { name: 'Venta de Tienda', expected: 300 },
    { name: 'Clientes Nuevos', expected: 150 },
    { name: 'Cobranza en Tienda', expected: 150 },
    { name: 'Venta de Seguros', expected: 64 },
    { name: 'Venta de Servicios', expected: 171 },
  ];
  const expectedTotal = 2335;

  const componentResults = expectedComponents.map((exp) => {
    const actual = result?.components.find((c) => c.componentName === exp.name)?.outputValue ?? 0;
    return {
      name: exp.name,
      expected: exp.expected,
      actual: Math.round(actual),
      passed: Math.abs(actual - exp.expected) < 2, // Allow $2 rounding tolerance
    };
  });

  const actualTotal = result?.totalIncentive ?? 0;

  return {
    passed: Math.abs(actualTotal - expectedTotal) < 5 && componentResults.every((c) => c.passed),
    employeeType: 'Certified',
    expectedTotal,
    actualTotal: Math.round(actualTotal),
    difference: Math.round(actualTotal - expectedTotal),
    componentResults,
  };
}

export async function validateNonCertifiedExample(): Promise<ValidationResult> {
  // Ensure plan is saved
  const ruleSetId = 'plan-retailcgmx-unified-2025';
  let plan = getPlan(ruleSetId);
  if (!plan) {
    plan = createRetailCGMXUnifiedPlan();
    savePlan(plan);
  }

  const metrics = getNonCertifiedWorkedExample();
  const result = await calculateIncentive(metrics, 'retailcgmx', ruleSetId);

  const expectedComponents = [
    { name: 'Venta Óptica', expected: 750 },
    { name: 'Venta de Tienda', expected: 300 },
    { name: 'Clientes Nuevos', expected: 150 },
    { name: 'Cobranza en Tienda', expected: 150 },
    { name: 'Venta de Seguros', expected: 64 },
    { name: 'Venta de Servicios', expected: 171 },
  ];
  const expectedTotal = 1585;

  const componentResults = expectedComponents.map((exp) => {
    const actual = result?.components.find((c) => c.componentName === exp.name)?.outputValue ?? 0;
    return {
      name: exp.name,
      expected: exp.expected,
      actual: Math.round(actual),
      passed: Math.abs(actual - exp.expected) < 2,
    };
  });

  const actualTotal = result?.totalIncentive ?? 0;

  return {
    passed: Math.abs(actualTotal - expectedTotal) < 5 && componentResults.every((c) => c.passed),
    employeeType: 'Non-Certified',
    expectedTotal,
    actualTotal: Math.round(actualTotal),
    difference: Math.round(actualTotal - expectedTotal),
    componentResults,
  };
}

export async function runAllValidations(): Promise<{ certified: ValidationResult; nonCertified: ValidationResult }> {
  return {
    certified: await validateCertifiedExample(),
    nonCertified: await validateNonCertifiedExample(),
  };
}

// ============================================
// CONSOLE TEST RUNNER
// ============================================

export async function printValidationReport(): Promise<void> {
  const results = await runAllValidations();

  console.log('='.repeat(60));
  console.log('RetailCGMX Plan Validation Report');
  console.log('='.repeat(60));

  for (const [type, result] of Object.entries(results)) {
    console.log(`\n${type.toUpperCase()} OPTOMETRIST`);
    console.log('-'.repeat(40));
    console.log(`Overall: ${result.passed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`Expected Total: $${result.expectedTotal.toLocaleString()} MXN`);
    console.log(`Actual Total: $${result.actualTotal.toLocaleString()} MXN`);
    console.log(`Difference: $${result.difference}`);
    console.log('\nComponent Breakdown:');
    result.componentResults.forEach((comp) => {
      const status = comp.passed ? '✓' : '✗';
      console.log(`  ${status} ${comp.name}: Expected $${comp.expected} | Actual $${comp.actual}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  const allPassed = results.certified.passed && results.nonCertified.passed;
  console.log(`OVERALL: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
  console.log('='.repeat(60));
}
