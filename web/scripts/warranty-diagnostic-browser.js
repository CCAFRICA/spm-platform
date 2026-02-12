/**
 * HF-019: WARRANTY CALCULATION BROWSER DIAGNOSTIC
 *
 * USAGE: Paste this entire script into browser console at localhost:3000
 * No file export needed - runs directly against localStorage.
 */

(function() {
  'use strict';

  console.log('='.repeat(70));
  console.log('HF-019: WARRANTY CALCULATION DIAGNOSTIC');
  console.log('='.repeat(70));

  // Load aggregated employees
  const tenantId = 'vialuce';
  const storageKey = `data_layer_committed_aggregated_${tenantId}`;
  const data = localStorage.getItem(storageKey);

  if (!data) {
    console.error(`No aggregated data found. Key: ${storageKey}`);
    console.log('Available keys with "aggregated":',
      Object.keys(localStorage).filter(k => k.includes('aggregated')));
    return;
  }

  const employees = JSON.parse(data);
  console.log(`Loaded ${employees.length} employees`);

  // Find warranty sheet pattern matching (same as orchestrator)
  const SHEET_PATTERNS = [
    /garantia.*extendida/i, /warranty/i, /garantia/i,
    /servicio/i, /venta.*servicio/i  // Added for component name matching
  ];

  function findWarrantySheet(componentMetrics) {
    if (!componentMetrics) return null;
    for (const sheetName of Object.keys(componentMetrics)) {
      if (SHEET_PATTERNS.some(p => p.test(sheetName))) {
        return sheetName;
      }
    }
    return null;
  }

  // Analyze each employee
  let totalWarrantyPayout = 0;
  let withWarranty = 0;
  let withZeroWarranty = 0;
  let withNoSheet = 0;
  let withNoComponentMetrics = 0;

  const warrantySales = [];
  const zeroGoalWithAmount = [];  // Key diagnostic: employees with goal=0 but amount>0
  const sheetNameCounts = new Map();

  for (const emp of employees) {
    const cm = emp.componentMetrics;

    if (!cm) {
      withNoComponentMetrics++;
      continue;
    }

    const warrantySheet = findWarrantySheet(cm);

    if (!warrantySheet) {
      withNoSheet++;
      continue;
    }

    // Track sheet name distribution
    sheetNameCounts.set(warrantySheet, (sheetNameCounts.get(warrantySheet) || 0) + 1);

    const metrics = cm[warrantySheet];
    const amount = metrics.amount;
    const goal = metrics.goal;

    // Check for zero-goal with amount (potential bug)
    if ((goal === undefined || goal === null || goal === 0) && amount > 0) {
      zeroGoalWithAmount.push({
        empId: emp.employeeId,
        storeId: emp.storeId,
        sheetName: warrantySheet,
        amount,
        goal,
        attainment: metrics.attainment
      });
    }

    if (amount === undefined || amount === null || !Number.isFinite(amount) || amount === 0) {
      withZeroWarranty++;
      continue;
    }

    withWarranty++;
    const payout = amount * 0.04;
    totalWarrantyPayout += payout;

    warrantySales.push({
      empId: emp.employeeId,
      storeId: emp.storeId,
      sheetName: warrantySheet,
      amount,
      goal,
      payout
    });
  }

  // Results
  console.log();
  console.log('=== SHEET NAME DISTRIBUTION ===');
  for (const [name, count] of Array.from(sheetNameCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${name}": ${count} employees`);
  }

  console.log();
  console.log('=== WARRANTY DISTRIBUTION ===');
  console.log(`Total employees: ${employees.length}`);
  console.log(`  No componentMetrics: ${withNoComponentMetrics}`);
  console.log(`  No warranty sheet found: ${withNoSheet}`);
  console.log(`  Warranty sheet, zero amount: ${withZeroWarranty}`);
  console.log(`  Warranty sheet, non-zero amount: ${withWarranty}`);

  console.log();
  console.log('=== GROUND TRUTH COMPARISON ===');
  console.log(`Ground truth warranty total: $66,872`);
  console.log(`ViaLuce calculated warranty: $76,881`);
  console.log(`Our simulation warranty:     $${totalWarrantyPayout.toFixed(2)}`);
  console.log(`Gap (ours vs ground truth): $${(totalWarrantyPayout - 66872).toFixed(2)}`);

  console.log();
  console.log('=== HYPOTHESIS A: ZERO-GOAL WITH AMOUNT ===');
  console.log(`Employees with goal=0 but amount>0: ${zeroGoalWithAmount.length}`);
  if (zeroGoalWithAmount.length > 0) {
    const zeroGoalTotal = zeroGoalWithAmount.reduce((sum, e) => sum + (e.amount || 0) * 0.04, 0);
    console.log(`Total payout from zero-goal employees: $${zeroGoalTotal.toFixed(2)}`);
    console.log('Sample (first 10):');
    zeroGoalWithAmount.slice(0, 10).forEach(e => {
      console.log(`  Emp ${e.empId} (store ${e.storeId}): amount=$${e.amount}, goal=${e.goal}, sheet="${e.sheetName}"`);
    });

    if (Math.abs(zeroGoalTotal - 10009) < 500) {
      console.log();
      console.log('*** MATCH! Zero-goal employees account for ~$10K gap ***');
      console.log('*** FIX: For percentage components, treat goal=0 as "not measured" ***');
    }
  }

  console.log();
  console.log('=== TOP 10 WARRANTY PAYOUTS ===');
  warrantySales.sort((a, b) => b.payout - a.payout);
  warrantySales.slice(0, 10).forEach((w, i) => {
    console.log(`  ${i + 1}. Emp ${w.empId} (store ${w.storeId}): $${w.amount.toLocaleString()} x 4% = $${w.payout.toFixed(2)}`);
  });

  console.log();
  console.log('=== SUSPICIOUS SMALL AMOUNTS (<$500) ===');
  const smallAmounts = warrantySales.filter(w => w.amount > 0 && w.amount < 500);
  console.log(`Employees with $0 < amount < $500: ${smallAmounts.length}`);
  if (smallAmounts.length > 0) {
    const smallTotal = smallAmounts.reduce((sum, e) => sum + e.payout, 0);
    console.log(`Total payout from small amounts: $${smallTotal.toFixed(2)}`);
  }

  console.log();
  console.log('='.repeat(70));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(70));

  // Return data for further analysis
  return {
    totalWarrantyPayout,
    withWarranty,
    withZeroWarranty,
    withNoSheet,
    zeroGoalWithAmount,
    sheetNameCounts: Object.fromEntries(sheetNameCounts),
    topPayouts: warrantySales.slice(0, 20)
  };
})();
