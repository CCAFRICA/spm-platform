#!/usr/bin/env node
/**
 * HF-019: Warranty Calculation Diagnostic Script
 *
 * USAGE:
 * 1. In browser console at localhost:3000, run:
 *    copy(JSON.stringify(localStorage))
 * 2. Save the copied content to: scripts/localStorage-dump.json
 * 3. Run: node scripts/verify-warranty.js
 */

const fs = require('fs');
const path = require('path');

// ============================================
// LOAD DATA
// ============================================

const dumpPath = path.join(__dirname, 'localStorage-dump.json');

if (!fs.existsSync(dumpPath)) {
  console.log('='.repeat(70));
  console.log('HF-019: WARRANTY DIAGNOSTIC - DATA EXPORT REQUIRED');
  console.log('='.repeat(70));
  console.log();
  console.log('localStorage dump not found at:', dumpPath);
  console.log();
  console.log('To export, run this in browser console at localhost:3000:');
  console.log();
  console.log('  copy(JSON.stringify(localStorage))');
  console.log();
  console.log('Then paste and save to: scripts/localStorage-dump.json');
  console.log();
  process.exit(1);
}

const localStorageData = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));
console.log(`Loaded ${Object.keys(localStorageData).length} localStorage keys`);

// ============================================
// HELPER FUNCTIONS
// ============================================

function getItem(key) {
  return localStorageData[key] || null;
}

function loadAggregatedEmployees(tenantId) {
  const key = `data_layer_committed_aggregated_${tenantId}`;
  const data = getItem(key);
  if (!data) {
    console.error(`No aggregated data found for key: ${key}`);

    // Try to find similar keys
    const keys = Object.keys(localStorageData).filter(k => k.includes('aggregated') || k.includes('vialuce'));
    if (keys.length > 0) {
      console.log('Found related keys:');
      keys.forEach(k => console.log(`  - ${k}`));
    }
    return [];
  }
  return JSON.parse(data);
}

// Match sheet names using the same patterns as the orchestrator
const SHEET_COMPONENT_PATTERNS = [
  {
    componentPatterns: [/service/i, /warranty/i, /garantia/i, /servicios/i],
    sheetPatterns: [/garantia.*extendida/i, /warranty/i, /garantia/i, /extendida/i],
  },
  {
    componentPatterns: [/insurance/i, /proteccion/i, /seguro/i],
    sheetPatterns: [/club.*proteccion/i, /proteccion/i, /insurance/i, /seguro/i],
  },
];

function findMatchingSheet(componentId, componentName, sheetNames) {
  const normId = componentId.toLowerCase().replace(/[-\s]/g, '_');
  const normName = componentName.toLowerCase().replace(/[-\s]/g, '_');

  // Strategy 1: Direct name match
  for (const sheetName of sheetNames) {
    const normSheet = sheetName.toLowerCase().replace(/[-\s]/g, '_');
    if (normSheet.includes(normName) || normName.includes(normSheet) ||
        normSheet.includes(normId) || normId.includes(normSheet)) {
      return sheetName;
    }
  }

  // Strategy 2: Pattern match
  for (const mapping of SHEET_COMPONENT_PATTERNS) {
    const componentMatches = mapping.componentPatterns.some(p =>
      p.test(componentId) || p.test(componentName)
    );
    if (componentMatches) {
      for (const sheetName of sheetNames) {
        if (mapping.sheetPatterns.some(p => p.test(sheetName))) {
          return sheetName;
        }
      }
    }
  }

  return null;
}

// Semantic type inference (same as metric-resolver.ts)
function inferSemanticType(metricName) {
  if (!metricName) return 'unknown';

  const ATTAINMENT_PATTERNS = [/attainment/i, /rate/i, /ratio/i, /percentage/i, /percent/i, /cumplimiento/i];
  const GOAL_PATTERNS = [/goal/i, /target/i, /quota/i, /meta/i];
  const QUANTITY_PATTERNS = [/count/i, /quantity/i, /number/i, /customers/i];
  const AMOUNT_PATTERNS = [/sales/i, /revenue/i, /volume/i, /amount/i, /total/i, /monto/i, /venta/i];

  for (const p of ATTAINMENT_PATTERNS) if (p.test(metricName)) return 'attainment';
  for (const p of GOAL_PATTERNS) if (p.test(metricName)) return 'goal';
  for (const p of QUANTITY_PATTERNS) if (p.test(metricName)) return 'quantity';
  for (const p of AMOUNT_PATTERNS) if (p.test(metricName)) return 'amount';

  return 'unknown';
}

// ============================================
// WARRANTY CALCULATION SIMULATION
// ============================================

function simulateWarrantyCalculation(employee) {
  const cm = employee.componentMetrics;
  if (!cm) return { payout: 0, reason: 'no componentMetrics' };

  const sheetNames = Object.keys(cm);

  // Find warranty sheet using same logic as orchestrator
  const warrantySheet = findMatchingSheet('servicios', 'Venta de Servicios', sheetNames);

  if (!warrantySheet) {
    return { payout: 0, reason: 'no warranty sheet matched', sheetNames };
  }

  const metrics = cm[warrantySheet];
  if (!metrics) {
    return { payout: 0, reason: 'sheet exists but no metrics', warrantySheet };
  }

  // The warranty component uses: appliedTo: 'individual_warranty_sales'
  // inferSemanticType('individual_warranty_sales') -> 'amount' (because of 'sales')
  // So it uses sheetMetrics.amount

  const amount = metrics.amount;

  if (amount === undefined || amount === null || !Number.isFinite(amount)) {
    return { payout: 0, reason: 'amount undefined/null/invalid', amount, warrantySheet, metrics };
  }

  const payout = amount * 0.04;
  return { payout, amount, warrantySheet, rate: 0.04 };
}

// ============================================
// MAIN DIAGNOSTIC
// ============================================

console.log('='.repeat(70));
console.log('HF-019: WARRANTY CALCULATION DIAGNOSTIC');
console.log('='.repeat(70));
console.log();

const tenantId = 'vialuce';
const employees = loadAggregatedEmployees(tenantId);
console.log(`Loaded ${employees.length} employees for tenant: ${tenantId}`);
console.log();

if (employees.length === 0) {
  process.exit(1);
}

// Show available sheets from first employee
if (employees[0] && employees[0].componentMetrics) {
  console.log('AVAILABLE SHEETS (from first employee):');
  for (const [sheetName, m] of Object.entries(employees[0].componentMetrics)) {
    console.log(`  - "${sheetName}": amount=${m.amount}, goal=${m.goal}, attainment=${m.attainment}`);
  }
  console.log();
}

// ============================================
// TRACE 1: High warranty employee
// ============================================

console.log('='.repeat(70));
console.log('TRACE 1: HIGH WARRANTY EMPLOYEE (90195508)');
console.log('='.repeat(70));

const highWarrantyEmp = employees.find(e => String(e.employeeId) === '90195508');

if (highWarrantyEmp) {
  console.log(`Employee ID: ${highWarrantyEmp.employeeId}`);
  console.log(`Store ID: ${highWarrantyEmp.storeId}`);
  console.log();

  const result = simulateWarrantyCalculation(highWarrantyEmp);
  console.log('WARRANTY CALCULATION:');
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('Employee 90195508 not found');
  console.log('First 5 employee IDs:', employees.slice(0, 5).map(e => e.employeeId));
}

console.log();

// ============================================
// TRACE 2: Zero warranty employee
// ============================================

console.log('='.repeat(70));
console.log('TRACE 2: EMPLOYEE WITH ZERO WARRANTY (first found)');
console.log('='.repeat(70));

const zeroWarrantyEmp = employees.find(e => {
  const result = simulateWarrantyCalculation(e);
  return result.amount === 0 || result.amount === undefined;
});

if (zeroWarrantyEmp) {
  console.log(`Employee ID: ${zeroWarrantyEmp.employeeId}`);
  console.log(`Store ID: ${zeroWarrantyEmp.storeId}`);
  console.log();

  const result = simulateWarrantyCalculation(zeroWarrantyEmp);
  console.log('WARRANTY CALCULATION:');
  console.log(JSON.stringify(result, null, 2));

  // Show all sheets for this employee
  if (zeroWarrantyEmp.componentMetrics) {
    console.log();
    console.log('ALL SHEETS FOR THIS EMPLOYEE:');
    for (const [sheetName, m] of Object.entries(zeroWarrantyEmp.componentMetrics)) {
      console.log(`  "${sheetName}":`);
      console.log(`    amount=${m.amount}, goal=${m.goal}, attainment=${m.attainment}`);
    }
  }
} else {
  console.log('No zero-warranty employee found (all have warranty data?)');
}

console.log();

// ============================================
// FULL ANALYSIS
// ============================================

console.log('='.repeat(70));
console.log('FULL WARRANTY ANALYSIS');
console.log('='.repeat(70));
console.log();

let totalWarrantyPayout = 0;
let employeesWithWarranty = 0;
let employeesWithZeroWarranty = 0;
let employeesWithNoSheet = 0;

const warrantyPayouts = [];

for (const emp of employees) {
  const result = simulateWarrantyCalculation(emp);
  warrantyPayouts.push({ empId: emp.employeeId, ...result });

  if (result.reason && result.reason.includes('no warranty sheet')) {
    employeesWithNoSheet++;
  } else if (result.amount === 0 || result.amount === undefined) {
    employeesWithZeroWarranty++;
  } else {
    employeesWithWarranty++;
  }

  totalWarrantyPayout += result.payout || 0;
}

console.log(`Employees WITH warranty amount > 0: ${employeesWithWarranty}`);
console.log(`Employees WITH warranty amount = 0: ${employeesWithZeroWarranty}`);
console.log(`Employees WITHOUT warranty sheet: ${employeesWithNoSheet}`);
console.log();
console.log(`TOTAL WARRANTY PAYOUT (simulated): $${totalWarrantyPayout.toLocaleString()}`);
console.log();
console.log('GROUND TRUTH COMPARISON:');
console.log(`  Ground truth warranty: $66,872`);
console.log(`  ViaLuce current:       $76,881`);
console.log(`  Our simulation:        $${totalWarrantyPayout.toFixed(0)}`);
console.log(`  Gap to ground truth:   $${(totalWarrantyPayout - 66872).toFixed(0)}`);
console.log();

// Top 10 warranty payouts
warrantyPayouts.sort((a, b) => (b.payout || 0) - (a.payout || 0));
console.log('TOP 10 WARRANTY PAYOUTS:');
warrantyPayouts.slice(0, 10).forEach((w, i) => {
  console.log(`  ${i + 1}. Emp ${w.empId}: $${(w.amount || 0).toLocaleString()} x 4% = $${(w.payout || 0).toFixed(2)}`);
});
console.log();

// Employees with non-zero payout but should be zero
const suspiciousPayouts = warrantyPayouts.filter(w =>
  w.payout > 0 && w.amount < 100  // Small amounts that might be wrong
);

if (suspiciousPayouts.length > 0) {
  console.log(`SUSPICIOUS: ${suspiciousPayouts.length} employees with small warranty amounts (<$100):`);
  suspiciousPayouts.slice(0, 10).forEach(w => {
    console.log(`  Emp ${w.empId}: amount=$${w.amount}, payout=$${(w.payout || 0).toFixed(2)}`);
  });
  console.log();
}

// ============================================
// HYPOTHESIS TESTING
// ============================================

console.log('='.repeat(70));
console.log('HYPOTHESIS TESTING');
console.log('='.repeat(70));
console.log();

// Hypothesis A: Many employees getting small erroneous payouts
const gapAmount = 9999;
const zeroWarrantyTotal = employees.length - employeesWithWarranty;
const gapPerZeroEmp = gapAmount / zeroWarrantyTotal;

console.log(`Hypothesis A: ${zeroWarrantyTotal} zero-warranty employees getting small payouts`);
console.log(`  If gap ($9,999) is from them: each would get $${gapPerZeroEmp.toFixed(2)}`);

const smallPayoutEmployees = warrantyPayouts.filter(w => w.payout > 0 && w.payout < 20);
console.log(`  Employees with $0 < payout < $20: ${smallPayoutEmployees.length}`);

if (smallPayoutEmployees.length > 0) {
  const totalSmallPayouts = smallPayoutEmployees.reduce((sum, w) => sum + (w.payout || 0), 0);
  console.log(`  Total from small payouts: $${totalSmallPayouts.toFixed(2)}`);
}
console.log();

// Hypothesis B: Wrong rate being applied
const totalAmount = warrantyPayouts.reduce((sum, w) => sum + (w.amount || 0), 0);
if (totalAmount > 0) {
  const impliedRate = 76881 / totalAmount;
  console.log(`Hypothesis B: Wrong rate applied`);
  console.log(`  Total warranty amount: $${totalAmount.toLocaleString()}`);
  console.log(`  At 4% rate: $${(totalAmount * 0.04).toFixed(2)}`);
  console.log(`  ViaLuce result ($76,881) implies rate: ${(impliedRate * 100).toFixed(2)}%`);
}
console.log();

// Final summary
console.log('='.repeat(70));
console.log('CONCLUSION');
console.log('='.repeat(70));
console.log();

if (Math.abs(totalWarrantyPayout - 76881) < 100) {
  console.log('Simulation matches ViaLuce result - bug is in input data or sheet matching');
} else if (Math.abs(totalWarrantyPayout - 66872) < 100) {
  console.log('Simulation matches ground truth - bug is in ViaLuce implementation');
} else {
  console.log('Simulation differs from both - check sheet matching logic');
  console.log(`Our simulation: $${totalWarrantyPayout.toFixed(0)}`);
}
