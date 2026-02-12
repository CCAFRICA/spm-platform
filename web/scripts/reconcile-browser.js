/**
 * OB-30 STEP 2: Browser-Runnable Reconciliation Script
 *
 * Paste this ENTIRE script into browser console at localhost:3000
 * after running a calculation.
 *
 * Outputs:
 * - Summary of variant selection issues (HF-020)
 * - Per-component totals
 * - Top employee differences
 */

(function() {
  'use strict';

  console.log('='.repeat(70));
  console.log('OB-30: CALCULATION RECONCILIATION');
  console.log('='.repeat(70));

  const TENANT_ID = 'vialuce';
  const GROUND_TRUTH_TOTAL = 1253832;

  // ============================================
  // DATA LOADING
  // ============================================

  function getLatestRun() {
    const runsStr = localStorage.getItem('calculation_runs');
    if (!runsStr) return null;

    const runs = JSON.parse(runsStr);
    const tenantRuns = runs
      .filter(r => r.tenantId === TENANT_ID)
      .sort((a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime());

    return tenantRuns[0] || null;
  }

  function getCalculationResults(runId) {
    const metaStr = localStorage.getItem(`calculation_results_${runId}_meta`);
    if (!metaStr) return [];

    const meta = JSON.parse(metaStr);
    const results = [];

    for (let i = 0; i < meta.chunks; i++) {
      const chunkStr = localStorage.getItem(`calculation_results_${runId}_${i}`);
      if (chunkStr) {
        results.push(...JSON.parse(chunkStr));
      }
    }

    return results;
  }

  // ============================================
  // VARIANT DERIVATION (mirrors calculation-orchestrator.ts)
  // ============================================

  function deriveExpectedVariant(role) {
    const normalizedRole = (role || '').toUpperCase().replace(/\s+/g, ' ').trim();

    const hasNoCertificado =
      normalizedRole.includes('NO CERTIFICADO') ||
      normalizedRole.includes('NO-CERTIFICADO') ||
      normalizedRole.includes('NON-CERTIFICADO') ||
      normalizedRole.includes('NO CERT') ||
      normalizedRole.includes('NON-CERT');

    const hasCertificado =
      normalizedRole.includes('CERTIFICADO') ||
      normalizedRole.includes('CERTIFIED');

    const isCertified = hasCertificado && !hasNoCertificado;
    return isCertified ? 'certified' : 'non-certified';
  }

  // ============================================
  // RECONCILIATION
  // ============================================

  const run = getLatestRun();
  if (!run) {
    console.error('No calculation run found for tenant:', TENANT_ID);
    console.log('Available localStorage keys:');
    Object.keys(localStorage).slice(0, 20).forEach(k => console.log('  ', k));
    return;
  }

  console.log('\n>>> LATEST RUN');
  console.log('  Run ID:', run.id);
  console.log('  Period:', run.period);
  console.log('  Status:', run.status);
  console.log('  Employees:', run.totalEmployees);
  console.log('  Total Payout:', '$' + run.totalPayout.toLocaleString());
  console.log('  Calculated:', run.calculatedAt);

  const results = getCalculationResults(run.id);
  console.log('\n>>> LOADED', results.length, 'EMPLOYEE RESULTS');

  if (results.length === 0) {
    console.error('No results found. Calculation may have failed to save.');
    return;
  }

  // Track variant issues
  const variantIssues = [];
  const componentTotals = {};
  let totalCalculated = 0;

  for (const result of results) {
    totalCalculated += result.totalIncentive;

    const expectedVariant = deriveExpectedVariant(result.employeeRole);
    const calculatedVariant = result.variantId;

    if (calculatedVariant !== expectedVariant) {
      variantIssues.push({
        employeeId: result.employeeId,
        employeeName: result.employeeName,
        role: result.employeeRole,
        calculatedVariant,
        expectedVariant,
        total: result.totalIncentive,
      });
    }

    // Track component totals
    for (const comp of result.components) {
      if (!componentTotals[comp.componentId]) {
        componentTotals[comp.componentId] = {
          name: comp.componentName,
          total: 0,
          count: 0,
        };
      }
      componentTotals[comp.componentId].total += comp.outputValue;
      componentTotals[comp.componentId].count++;
    }
  }

  // ============================================
  // REPORT
  // ============================================

  console.log('\n' + '='.repeat(70));
  console.log('RECONCILIATION SUMMARY');
  console.log('='.repeat(70));

  console.log('\n>>> TOTALS');
  console.log('  VL Calculated:  $' + totalCalculated.toLocaleString());
  console.log('  Ground Truth:   $' + GROUND_TRUTH_TOTAL.toLocaleString());
  const diff = totalCalculated - GROUND_TRUTH_TOTAL;
  const diffPercent = (diff / GROUND_TRUTH_TOTAL) * 100;
  console.log('  Difference:     $' + diff.toLocaleString() + ' (' + diffPercent.toFixed(2) + '%)');

  console.log('\n>>> BY COMPONENT');
  for (const [compId, data] of Object.entries(componentTotals)) {
    console.log(`  ${compId}:`);
    console.log(`    Total: $${data.total.toLocaleString()}`);
    console.log(`    Employees: ${data.count}`);
  }

  console.log('\n>>> VARIANT SELECTION ISSUES (HF-020)');
  console.log(`  Total Issues: ${variantIssues.length}`);

  if (variantIssues.length > 0) {
    console.log('\n  Employees with WRONG variant:');
    console.log('  ' + '-'.repeat(66));

    // Sort by total to show biggest impact first
    variantIssues.sort((a, b) => b.total - a.total);

    for (const issue of variantIssues.slice(0, 20)) {
      console.log(`  ${issue.employeeId}: ${issue.employeeName}`);
      console.log(`    Role: "${issue.role}"`);
      console.log(`    Calculated: ${issue.calculatedVariant}, Expected: ${issue.expectedVariant}`);
      console.log(`    Total: $${issue.total.toLocaleString()}`);
    }

    if (variantIssues.length > 20) {
      console.log(`\n  ... and ${variantIssues.length - 20} more`);
    }

    // Calculate impact of variant issues
    let certifiedTotal = 0;
    let nonCertifiedCount = 0;
    for (const issue of variantIssues) {
      if (issue.expectedVariant === 'non-certified' && issue.calculatedVariant === 'certified') {
        certifiedTotal += issue.total;
        nonCertifiedCount++;
      }
    }
    console.log('\n  IMPACT ESTIMATE:');
    console.log(`    ${nonCertifiedCount} "NO CERTIFICADO" employees incorrectly marked as Certified`);
    console.log(`    Combined total: $${certifiedTotal.toLocaleString()}`);
    console.log(`    (They should be using non-certified variant with different payouts)`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('EXPORT DATA');
  console.log('='.repeat(70));
  console.log('To save for comparison, run:');
  console.log('  copy(JSON.stringify(localStorage))');
  console.log('Then save to scripts/localStorage-export.json');

  // Return data for programmatic access
  return {
    run,
    totalCalculated,
    groundTruth: GROUND_TRUTH_TOTAL,
    diff,
    diffPercent,
    variantIssues,
    componentTotals,
    results,
  };
})();
