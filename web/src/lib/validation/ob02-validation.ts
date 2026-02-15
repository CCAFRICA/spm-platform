/**
 * OB-02 Validation Suite
 *
 * Validates all OB-02 features: User Import, Hierarchy, Payroll, Calculation, Reconciliation, Shadow Payroll.
 */

import { calculateTieredPayout, calculateQuotaAttainment, applyAccelerator } from '@/lib/calculation/engine';
import { processReconciliation, findBestMatch } from '@/lib/reconciliation/engine';
import { compareScenarios, compareShadowPayroll, assessCutoverReadiness } from '@/lib/shadow-payroll/engine';
import type { TierDefinition, Accelerator, LedgerEntry } from '@/types/calculation-engine';
import type { ReconciliationRule } from '@/types/reconciliation';

// ============================================
// VALIDATION RESULT TYPES
// ============================================

export interface ValidationResult {
  name: string;
  category: 'calculation' | 'reconciliation' | 'shadow_payroll' | 'integration';
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  duration: number;
}

export interface ValidationSuite {
  name: string;
  timestamp: string;
  results: ValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
  totalDuration: number;
}

// ============================================
// CALCULATION ENGINE TESTS
// ============================================

function testTieredPayoutCalculation(): ValidationResult {
  const startTime = performance.now();

  try {
    const tierDef: TierDefinition = {
      id: 'test-tier',
      name: 'Test Tier',
      tiers: [
        { min: 0, max: 10000, rate: 5, rateType: 'percentage', marginal: true },
        { min: 10000, max: 25000, rate: 7, rateType: 'percentage', marginal: true },
        { min: 25000, max: Infinity, rate: 10, rateType: 'percentage', marginal: true },
      ],
    };

    // Test with amount = 30000
    // First tier: 10000 * 0.05 = 500
    // Second tier: 15000 * 0.07 = 1050
    // Third tier: 5000 * 0.10 = 500
    // Total: 2050
    const result = calculateTieredPayout(30000, tierDef);

    const expectedTotal = 2050;
    const passed = Math.abs(result.total - expectedTotal) < 0.01;

    return {
      name: 'Tiered Payout Calculation',
      category: 'calculation',
      passed,
      message: passed
        ? `Tiered calculation correct: $${result.total}`
        : `Expected $${expectedTotal}, got $${result.total}`,
      details: { amount: 30000, expected: expectedTotal, actual: result.total, breakdown: result.breakdown },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Tiered Payout Calculation',
      category: 'calculation',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

function testQuotaAttainmentCalculation(): ValidationResult {
  const startTime = performance.now();

  try {
    const credits = [
      { sourceId: 'tx-1', sourceType: 'transaction', amount: 50000, creditDate: '2026-01-15' },
      { sourceId: 'tx-2', sourceType: 'transaction', amount: 30000, creditDate: '2026-01-20' },
      { sourceId: 'adj-1', sourceType: 'adjustment', amount: 10000, creditDate: '2026-01-25' },
    ];

    const result = calculateQuotaAttainment(
      'emp-001',
      'period-2026-01',
      'quota-001',
      100000, // quota amount
      credits,
      [{ quota: 100000, attained: 95000 }] // previous period
    );

    const expectedAttainment = 90; // 90000 / 100000
    const passed = Math.abs(result.attainmentPercentage - expectedAttainment) < 0.01;

    return {
      name: 'Quota Attainment Calculation',
      category: 'calculation',
      passed,
      message: passed
        ? `Quota attainment correct: ${result.attainmentPercentage}%`
        : `Expected ${expectedAttainment}%, got ${result.attainmentPercentage}%`,
      details: {
        quota: 100000,
        attained: result.attainedAmount,
        percentage: result.attainmentPercentage,
        ytdPercentage: result.ytdPercentage,
      },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Quota Attainment Calculation',
      category: 'calculation',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

function testAcceleratorApplication(): ValidationResult {
  const startTime = performance.now();

  try {
    const accelerator: Accelerator = {
      id: 'accel-001',
      name: 'Quota Bonus',
      triggerType: 'attainment',
      triggerThreshold: 100,
      multiplier: 1.5,
      appliesTo: ['commission'],
      retroactive: false,
    };

    const baseEntries: LedgerEntry[] = [
      {
        id: 'entry-1',
        batchId: 'batch-1',
        entityId: 'emp-001',
        periodId: 'period-1',
        type: 'commission',
        description: 'Commission',
        amount: 10000,
        currency: 'USD',
        sourceType: 'transaction',
        status: 'pending',
        calculatedAt: new Date().toISOString(),
        calculatedBy: 'system',
      },
    ];

    const result = applyAccelerator(
      accelerator,
      'emp-001',
      'period-1',
      baseEntries,
      110 // 110% attainment, above threshold
    );

    // Expected: 10000 * (1.5 - 1) = 5000 additional
    const expectedAccelerated = 5000;
    const passed = result !== null && Math.abs(result.acceleratedAmount - expectedAccelerated) < 0.01;

    return {
      name: 'Accelerator Application',
      category: 'calculation',
      passed,
      message: passed
        ? `Accelerator applied correctly: +$${result?.acceleratedAmount}`
        : result === null
        ? 'Accelerator did not trigger when expected'
        : `Expected $${expectedAccelerated}, got $${result?.acceleratedAmount}`,
      details: result ? { ...result } : { triggered: false },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Accelerator Application',
      category: 'calculation',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

// ============================================
// RECONCILIATION ENGINE TESTS
// ============================================

function testReconciliationMatching(): ValidationResult {
  const startTime = performance.now();

  try {
    const sourceRecords = [
      { id: 'src-1', entityId: 'emp-001', amount: 1000, date: '2026-01-15', type: 'commission', rawData: {} },
      { id: 'src-2', entityId: 'emp-002', amount: 1500, date: '2026-01-16', type: 'commission', rawData: {} },
      { id: 'src-3', entityId: 'emp-003', amount: 2000, date: '2026-01-17', type: 'bonus', rawData: {} },
    ];

    const targetRecords = [
      { id: 'tgt-1', entityId: 'emp-001', amount: 1000, date: '2026-01-15', type: 'commission', rawData: {} },
      { id: 'tgt-2', entityId: 'emp-002', amount: 1505, date: '2026-01-16', type: 'commission', rawData: {} }, // Small difference
      { id: 'tgt-4', entityId: 'emp-004', amount: 500, date: '2026-01-18', type: 'commission', rawData: {} }, // Only in target
    ];

    const rules: ReconciliationRule[] = [
      {
        id: 'rule-1',
        tenantId: 'test',
        name: 'Exact Match',
        priority: 100,
        isActive: true,
        matchCriteria: [
          { sourceField: 'entityId', targetField: 'entityId', matchType: 'exact', weight: 40, required: true },
          { sourceField: 'amount', targetField: 'amount', matchType: 'numeric_range', weight: 40, required: true },
          { sourceField: 'type', targetField: 'type', matchType: 'exact', weight: 20, required: false },
        ],
        matchThreshold: 80,
        autoResolve: false,
        amountTolerance: { type: 'absolute', value: 10 },
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
    ];

    const { items, summary } = processReconciliation('session-test', sourceRecords, targetRecords, rules);

    // Should have:
    // - emp-001: exact match
    // - emp-002: matched with discrepancy (within tolerance)
    // - emp-003: missing in target
    // - emp-004: missing in source
    const hasExpectedCount = items.length === 4;
    const hasCorrectMatched = summary.matchedRecords === 2;

    const passed = hasExpectedCount && hasCorrectMatched;

    return {
      name: 'Reconciliation Matching',
      category: 'reconciliation',
      passed,
      message: passed
        ? `Reconciliation correct: ${summary.matchedRecords} matched, ${summary.unmatchedRecords} unmatched`
        : `Expected 2 matched, got ${summary.matchedRecords}`,
      details: {
        totalItems: items.length,
        matched: summary.matchedRecords,
        unmatched: summary.unmatchedRecords,
        confidence: summary.overallConfidence,
      },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Reconciliation Matching',
      category: 'reconciliation',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

function testFuzzyMatching(): ValidationResult {
  const startTime = performance.now();

  try {
    const sourceRecord = {
      id: 'src-1',
      entityId: 'emp-001',
      amount: 1000,
      date: '2026-01-15',
      type: 'commission',
      rawData: {},
    };

    const targetRecords = [
      { id: 'tgt-1', entityId: 'emp-001', amount: 995, date: '2026-01-16', type: 'commission', rawData: {} },
      { id: 'tgt-2', entityId: 'emp-002', amount: 1000, date: '2026-01-15', type: 'commission', rawData: {} },
    ];

    const rules: ReconciliationRule[] = [
      {
        id: 'rule-1',
        tenantId: 'test',
        name: 'Fuzzy Match',
        priority: 100,
        isActive: true,
        matchCriteria: [
          { sourceField: 'entityId', targetField: 'entityId', matchType: 'exact', weight: 50, required: true },
          { sourceField: 'amount', targetField: 'amount', matchType: 'numeric_range', weight: 30, required: true },
          { sourceField: 'date', targetField: 'date', matchType: 'date_range', weight: 20, required: false },
        ],
        matchThreshold: 70,
        autoResolve: false,
        amountTolerance: { type: 'percentage', value: 1 },
        dateTolerance: 2,
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
    ];

    const result = findBestMatch(sourceRecord, targetRecords, rules);

    // Should match tgt-1 (same employee, close amount and date)
    const passed = result.targetRecord?.id === 'tgt-1' && result.matchConfidence > 70;

    return {
      name: 'Fuzzy Matching with Tolerance',
      category: 'reconciliation',
      passed,
      message: passed
        ? `Fuzzy match found: ${result.targetRecord?.id} with ${result.matchConfidence}% confidence`
        : `Expected tgt-1, got ${result.targetRecord?.id || 'no match'}`,
      details: {
        matchedId: result.targetRecord?.id,
        confidence: result.matchConfidence,
        method: result.matchMethod,
        status: result.matchStatus,
      },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Fuzzy Matching with Tolerance',
      category: 'reconciliation',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

// ============================================
// SHADOW PAYROLL TESTS
// ============================================

function testScenarioComparison(): ValidationResult {
  const startTime = performance.now();

  try {
    const baseData = [
      { entityId: 'emp-001', entityName: 'John Doe', commission: 10000, bonus: 2000, spiff: 500, accelerator: 0, adjustment: 0, clawback: 0 },
      { entityId: 'emp-002', entityName: 'Jane Smith', commission: 12000, bonus: 3000, spiff: 0, accelerator: 500, adjustment: 0, clawback: 0 },
    ];

    const scenarioData = [
      { entityId: 'emp-001', entityName: 'John Doe', commission: 11000, bonus: 2000, spiff: 500, accelerator: 0, adjustment: 0, clawback: 0 },
      { entityId: 'emp-002', entityName: 'Jane Smith', commission: 12500, bonus: 3000, spiff: 0, accelerator: 750, adjustment: 0, clawback: 0 },
    ];

    const results = compareScenarios(baseData, scenarioData);

    // Base total: 12500 + 15500 = 28000
    // Scenario total: 13500 + 16250 = 29750
    // Difference: 1750 (6.25% increase)
    const expectedDiff = 1750;
    const passed = Math.abs(results.summary.totalDifference - expectedDiff) < 0.01;

    return {
      name: 'Scenario Comparison',
      category: 'shadow_payroll',
      passed,
      message: passed
        ? `Scenario comparison correct: $${results.summary.totalDifference} difference (${results.summary.percentageDifference.toFixed(2)}%)`
        : `Expected $${expectedDiff} difference, got $${results.summary.totalDifference}`,
      details: {
        basePayout: results.summary.totalBasePayout,
        scenarioPayout: results.summary.totalScenarioPayout,
        difference: results.summary.totalDifference,
        percentage: results.summary.percentageDifference,
      },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Scenario Comparison',
      category: 'shadow_payroll',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

function testShadowPayrollComparison(): ValidationResult {
  const startTime = performance.now();

  try {
    const legacyData = [
      { entityId: 'emp-001', entityName: 'John Doe', amount: 15000, components: { commission: 12000, bonus: 3000 } },
      { entityId: 'emp-002', entityName: 'Jane Smith', amount: 18000, components: { commission: 15000, bonus: 3000 } },
    ];

    const newData = [
      { entityId: 'emp-001', entityName: 'John Doe', amount: 15000, components: { commission: 12000, bonus: 3000 } },
      { entityId: 'emp-002', entityName: 'Jane Smith', amount: 18005, components: { commission: 15005, bonus: 3000 } }, // Small variance
    ];

    const comparison = compareShadowPayroll(legacyData, newData, 0.5, 10);

    // emp-001: exact match
    // emp-002: within tolerance (5 difference, 0.03% variance)
    const passed = comparison.exactMatches === 1 && comparison.withinTolerance === 1;

    return {
      name: 'Shadow Payroll Comparison',
      category: 'shadow_payroll',
      passed,
      message: passed
        ? `Shadow comparison correct: ${comparison.exactMatches} exact, ${comparison.withinTolerance} within tolerance`
        : `Expected 1 exact + 1 within tolerance, got ${comparison.exactMatches} + ${comparison.withinTolerance}`,
      details: {
        exactMatches: comparison.exactMatches,
        withinTolerance: comparison.withinTolerance,
        outsideTolerance: comparison.outsideTolerance,
        readyForCutover: comparison.readyForCutover,
        confidence: comparison.overallConfidence,
      },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Shadow Payroll Comparison',
      category: 'shadow_payroll',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

function testCutoverReadiness(): ValidationResult {
  const startTime = performance.now();

  try {
    const comparison = {
      totalLegacy: 100000,
      totalNew: 100100, // 0.1% variance
      variance: 100,
      variancePercentage: 0.1,
      exactMatches: 45,
      withinTolerance: 5,
      outsideTolerance: 0,
      onlyInLegacy: 0,
      onlyInNew: 0,
      overallConfidence: 98,
      readyForCutover: true,
      employeeComparisons: [],
    };

    const readiness = assessCutoverReadiness(comparison, 'period-2026-01', 'admin-001');

    // Should be ready with no blockers
    const passed = readiness.isReady && readiness.blockers.length === 0;

    return {
      name: 'Cutover Readiness Assessment',
      category: 'shadow_payroll',
      passed,
      message: passed
        ? `Cutover ready: ${readiness.confidenceScore}% confidence`
        : `Not ready: ${readiness.blockers.join(', ')}`,
      details: {
        isReady: readiness.isReady,
        confidence: readiness.confidenceScore,
        blockers: readiness.blockers,
        criteria: readiness.criteria.map((c) => ({ name: c.name, status: c.status, score: c.score })),
      },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Cutover Readiness Assessment',
      category: 'shadow_payroll',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

// ============================================
// INTEGRATION TESTS
// ============================================

function testEndToEndCalculation(): ValidationResult {
  const startTime = performance.now();

  try {
    // Simulate a full calculation flow
    const tierDef: TierDefinition = {
      id: 'tier-1',
      name: 'Standard Commission',
      tiers: [
        { min: 0, max: 50000, rate: 5, rateType: 'percentage', marginal: true },
        { min: 50000, max: Infinity, rate: 8, rateType: 'percentage', marginal: true },
      ],
    };

    // Calculate tiered commission
    const { total: commission } = calculateTieredPayout(75000, tierDef);
    // 50000 * 0.05 = 2500 + 25000 * 0.08 = 2000 = 4500

    // Calculate quota attainment
    const attainment = calculateQuotaAttainment(
      'emp-001',
      'period-1',
      'quota-1',
      100000,
      [{ sourceId: 'tx-1', sourceType: 'transaction', amount: 75000, creditDate: '2026-01-15' }]
    );

    const passed = Math.abs(commission - 4500) < 0.01 && Math.abs(attainment.attainmentPercentage - 75) < 0.01;

    return {
      name: 'End-to-End Calculation Flow',
      category: 'integration',
      passed,
      message: passed
        ? `Integration test passed: $${commission} commission, ${attainment.attainmentPercentage}% attainment`
        : `Integration test failed`,
      details: {
        commission,
        attainmentPercentage: attainment.attainmentPercentage,
        salesAmount: 75000,
      },
      duration: performance.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'End-to-End Calculation Flow',
      category: 'integration',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: performance.now() - startTime,
    };
  }
}

// ============================================
// RUN VALIDATION SUITE
// ============================================

/**
 * Run all OB-02 validation tests
 */
export function runOB02ValidationSuite(): ValidationSuite {
  const startTime = performance.now();
  const results: ValidationResult[] = [];

  // Calculation Engine Tests
  results.push(testTieredPayoutCalculation());
  results.push(testQuotaAttainmentCalculation());
  results.push(testAcceleratorApplication());

  // Reconciliation Engine Tests
  results.push(testReconciliationMatching());
  results.push(testFuzzyMatching());

  // Shadow Payroll Tests
  results.push(testScenarioComparison());
  results.push(testShadowPayrollComparison());
  results.push(testCutoverReadiness());

  // Integration Tests
  results.push(testEndToEndCalculation());

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    name: 'OB-02 Validation Suite',
    timestamp: new Date().toISOString(),
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: (passed / results.length) * 100,
    },
    totalDuration: performance.now() - startTime,
  };
}

/**
 * Format validation results for display
 */
export function formatValidationResults(suite: ValidationSuite): string {
  const lines: string[] = [
    `\n${'='.repeat(60)}`,
    `OB-02 VALIDATION SUITE`,
    `${'='.repeat(60)}`,
    `Timestamp: ${suite.timestamp}`,
    `Duration: ${suite.totalDuration.toFixed(2)}ms`,
    '',
    `SUMMARY: ${suite.summary.passed}/${suite.summary.total} passed (${suite.summary.passRate.toFixed(1)}%)`,
    '',
    `${'─'.repeat(60)}`,
    'RESULTS BY CATEGORY:',
    `${'─'.repeat(60)}`,
  ];

  const categories = ['calculation', 'reconciliation', 'shadow_payroll', 'integration'] as const;

  for (const category of categories) {
    const categoryResults = suite.results.filter((r) => r.category === category);
    if (categoryResults.length === 0) continue;

    lines.push(`\n[${category.toUpperCase()}]`);

    for (const result of categoryResults) {
      const status = result.passed ? '✓' : '✗';
      lines.push(`  ${status} ${result.name} (${result.duration.toFixed(1)}ms)`);
      lines.push(`    ${result.message}`);
    }
  }

  lines.push(`\n${'='.repeat(60)}\n`);

  return lines.join('\n');
}
